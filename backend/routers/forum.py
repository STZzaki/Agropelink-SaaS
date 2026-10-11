import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from utils import moderation
import forum_media
from deps import AdminUser, CurrentUser, DbSession, OptionalUser
from models import ForumCategory, ForumMedia, ForumReply, ForumReport, ForumThread, ModerationAction, ModerationEvent
from notifications import send_admin_notification
from ratelimit import SlidingWindowLimiter
from sanitize import clean_text
from schemas import (
    ForumAuthor,
    ForumCategoryStat,
    ForumMediaResponse,
    ForumReplyCreate,
    ForumReplyResponse,
    ForumReportCreate,
    ForumThreadCreate,
    ForumThreadDetail,
    ForumThreadList,
    ForumThreadSummary,
    MessageResponse,
)
from security import utcnow

router = APIRouter(prefix="/forum", tags=["forum"])

# Lectura pública; escritura solo para usuarios autenticados (cualquier rol) y con límite anti-spam.
_posts_by_user = SlidingWindowLimiter(10, 10 * 60, "Estás publicando muy rápido. Espera unos minutos.")
_reports_by_user = SlidingWindowLimiter(10, 60 * 60, "Has enviado demasiadas denuncias. Inténtalo más tarde.")
_uploads_by_user = SlidingWindowLimiter(20, 60 * 60, "Has subido demasiados archivos. Inténtalo más tarde.")
_UNATTACHED_TTL = dt.timedelta(hours=24)

_VISIBLE_THREAD = ForumThread.deleted_at.is_(None)
_VISIBLE_REPLY = ForumReply.deleted_at.is_(None)
_REPORT_RECEIVED = "Gracias. El equipo de moderación revisará la publicación."


def _media_response(media: ForumMedia) -> ForumMediaResponse:
    return ForumMediaResponse(
        id=media.id,
        kind=media.kind,
        content_type=media.content_type,
        url=f"/forum/media/{media.storage_key}",
        size_bytes=media.size_bytes,
        width=media.width,
        height=media.height,
    )


def _summary(thread: ForumThread, reply_count: int, media_count: int = 0) -> ForumThreadSummary:
    excerpt = thread.body if len(thread.body) <= 220 else thread.body[:217].rstrip() + "…"
    return ForumThreadSummary(
        id=thread.id,
        category=thread.category,
        title=thread.title,
        excerpt=excerpt,
        tags=thread.tags or [],
        author=ForumAuthor.model_validate(thread.author),
        created_at=thread.created_at,
        last_activity_at=thread.last_activity_at,
        reply_count=reply_count,
        media_count=media_count,
    )


def _require_length(value: str, minimum: int, field: str) -> str:
    """Tras quitar HTML el texto puede quedar vacío o demasiado corto: se vuelve a validar."""
    if len(value) < minimum:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"El campo '{field}' no tiene contenido suficiente una vez eliminado el formato no permitido.",
        )
    return value


def _visible_thread(db: DbSession, thread_id: int) -> ForumThread:
    thread = db.scalar(select(ForumThread).where(ForumThread.id == thread_id, _VISIBLE_THREAD))
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return thread


@router.get("/categories", response_model=list[ForumCategoryStat])
def category_stats(db: DbSession) -> list[ForumCategoryStat]:
    counts = dict(
        db.execute(select(ForumThread.category, func.count()).where(_VISIBLE_THREAD).group_by(ForumThread.category)).all()
    )
    return [ForumCategoryStat(category=c, thread_count=counts.get(c, 0)) for c in ForumCategory]


@router.get("/threads", response_model=ForumThreadList)
def list_threads(
    db: DbSession,
    category: ForumCategory | None = None,
    q: Annotated[str | None, Query(min_length=2, max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ForumThreadList:
    """Hilos ordenados por actividad reciente. Búsqueda por título/contenido vía ORM (parametrizada)."""
    reply_count = (
        select(func.count(ForumReply.id))
        .where(ForumReply.thread_id == ForumThread.id, _VISIBLE_REPLY)
        .correlate(ForumThread)
        .scalar_subquery()
    )
    media_count = (
        select(func.count(ForumMedia.id)).where(ForumMedia.thread_id == ForumThread.id).correlate(ForumThread).scalar_subquery()
    )
    filters = [_VISIBLE_THREAD]
    if category is not None:
        filters.append(ForumThread.category == category)
    if q:
        term = q.strip()
        filters.append(or_(ForumThread.title.contains(term, autoescape=True), ForumThread.body.contains(term, autoescape=True)))

    total = db.scalar(select(func.count()).select_from(ForumThread).where(*filters)) or 0
    rows = db.execute(
        select(ForumThread, reply_count, media_count)
        .options(selectinload(ForumThread.author))
        .where(*filters)
        .order_by(ForumThread.last_activity_at.desc(), ForumThread.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return ForumThreadList(items=[_summary(t, n, m) for t, n, m in rows], total=total)


@router.get("/threads/{thread_id}", response_model=ForumThreadDetail)
def get_thread(thread_id: int, db: DbSession) -> ForumThreadDetail:
    thread = db.scalar(
        select(ForumThread)
        .options(selectinload(ForumThread.author), selectinload(ForumThread.replies).selectinload(ForumReply.author))
        .where(ForumThread.id == thread_id, _VISIBLE_THREAD)
    )
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return ForumThreadDetail(
        id=thread.id,
        category=thread.category,
        title=thread.title,
        body=thread.body,
        tags=thread.tags or [],
        author=ForumAuthor.model_validate(thread.author),
        created_at=thread.created_at,
        last_activity_at=thread.last_activity_at,
        media=[
            _media_response(m)
            for m in db.scalars(select(ForumMedia).where(ForumMedia.thread_id == thread.id).order_by(ForumMedia.id))
        ],
        replies=[ForumReplyResponse.model_validate(r) for r in thread.replies if r.deleted_at is None],
    )


@router.post("/threads", response_model=ForumThreadSummary, status_code=status.HTTP_201_CREATED)
def create_thread(payload: ForumThreadCreate, db: DbSession, user: CurrentUser) -> ForumThreadSummary:
    moderation.require_no_pending_warning(user)
    _posts_by_user.hit(f"user:{user.id}")
    # 1) Auto-Mod sobre el texto original, antes de guardar nada (los patrones maliciosos se detectan antes de sanear).
    moderation.enforce(db, user, payload.title, payload.body, *payload.tags)
    # 2) Saneado estricto: se almacena texto plano.
    title = _require_length(clean_text(payload.title, multiline=False), 8, "title")
    body = _require_length(clean_text(payload.body), 20, "body")
    tags = [t for t in (clean_text(tag, multiline=False) for tag in payload.tags) if len(t) >= 2]

    # Solo archivos propios, ya validados por /forum/upload y todavía sin publicar (sin IDOR ni reutilización).
    media_ids = list(dict.fromkeys(payload.media_ids))
    media = []
    if media_ids:
        media = list(
            db.scalars(
                select(ForumMedia).where(
                    ForumMedia.id.in_(media_ids), ForumMedia.uploader_id == user.id, ForumMedia.thread_id.is_(None)
                )
            )
        )
        if len(media) != len(media_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Algún archivo adjunto no es válido. Vuelve a subirlo."
            )

    now = utcnow()
    thread = ForumThread(
        category=payload.category, title=title, body=body, tags=tags, author_id=user.id, created_at=now, last_activity_at=now
    )
    db.add(thread)
    db.flush()
    for item in media:
        item.thread_id = thread.id
    db.commit()
    db.refresh(thread)
    return _summary(thread, 0, len(media))


@router.post("/threads/{thread_id}/replies", response_model=ForumReplyResponse, status_code=status.HTTP_201_CREATED)
def create_reply(thread_id: int, payload: ForumReplyCreate, db: DbSession, user: CurrentUser) -> ForumReply:
    thread = _visible_thread(db, thread_id)
    moderation.require_no_pending_warning(user)
    _posts_by_user.hit(f"user:{user.id}")
    moderation.enforce(db, user, payload.body)
    body = _require_length(clean_text(payload.body), 2, "body")

    now = utcnow()
    reply = ForumReply(thread_id=thread.id, author_id=user.id, body=body, created_at=now)
    thread.last_activity_at = now
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return reply


@router.post("/reports", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def report_content(payload: ForumReportCreate, db: DbSession, user: CurrentUser, background: BackgroundTasks) -> MessageResponse:
    """Denuncia de un hilo o respuesta. Genera un ticket para el administrador y avisa a info@agropelink.es."""
    _reports_by_user.hit(f"user:{user.id}")
    thread = _visible_thread(db, payload.thread_id)
    author_id, body = thread.author_id, thread.body
    if payload.reply_id is not None:
        reply = db.scalar(
            select(ForumReply).where(ForumReply.id == payload.reply_id, ForumReply.thread_id == thread.id, _VISIBLE_REPLY)
        )
        if reply is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reply not found")
        author_id, body = reply.author_id, reply.body
    if author_id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes denunciar tus propias publicaciones.")

    # La restricción única no cubre reply_id NULL (en SQL, NULL ≠ NULL): se comprueba también aquí.
    reply_filter = ForumReport.reply_id.is_(None) if payload.reply_id is None else ForumReport.reply_id == payload.reply_id
    if db.scalar(select(ForumReport.id).where(ForumReport.reporter_id == user.id, ForumReport.thread_id == thread.id, reply_filter)):
        return MessageResponse(detail=_REPORT_RECEIVED)

    report = ForumReport(
        reporter_id=user.id,
        thread_id=thread.id,
        reply_id=payload.reply_id,
        reason=payload.reason,
        details=payload.details or None,
        created_at=utcnow(),
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        # Ya denunciada por este usuario: respuesta idéntica (idempotente), sin duplicar el ticket.
        db.rollback()
        return MessageResponse(detail=_REPORT_RECEIVED)

    excerpt = " ".join(body.split())[:400]
    background.add_task(
        send_admin_notification,
        subject=f"Denuncia #{report.id} en el foro ({payload.reason.value})",
        body=(
            f"Hilo: #{thread.id} «{thread.title}»\n"
            f"{'Respuesta: #' + str(payload.reply_id) if payload.reply_id else 'Publicación inicial del hilo'}\n"
            f"Motivo: {payload.reason.value}\n"
            f"Detalle del denunciante: {payload.details or '—'}\n\n"
            f"Contenido denunciado:\n{excerpt}"
        ),
    )
    return MessageResponse(detail=_REPORT_RECEIVED)


# --- Multimedia ------------------------------------------------------------------------------------


def _purge_unattached(db: DbSession, user_id: int) -> None:
    """Archivos subidos pero nunca publicados en 24 h: se borran de disco y de BD."""
    stale = db.scalars(
        select(ForumMedia).where(
            ForumMedia.uploader_id == user_id,
            ForumMedia.thread_id.is_(None),
            ForumMedia.created_at < utcnow() - _UNATTACHED_TTL,
        )
    ).all()
    for item in stale:
        forum_media.delete_media(item.storage_key)
        db.delete(item)
    if stale:
        db.commit()


@router.post("/upload", response_model=ForumMediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="PNG, JPEG o WEBP (máx. 5 MB) o MP4 (máx. 15 MB).")],
    rights_accepted: Annotated[bool, Form()] = False,
) -> ForumMediaResponse:
    """Sube una imagen o un vídeo corto para un hilo: magic bytes, recodificación y sin metadatos.

    Exige la declaración expresa de derechos y responsabilidad legal (`rights_accepted=true`), que queda registrada.
    """
    moderation.require_no_pending_warning(user)
    if not rights_accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Debes confirmar que tienes los derechos del archivo y aceptas las condiciones de publicación.",
        )
    _uploads_by_user.hit(f"user:{user.id}")
    _purge_unattached(db, user.id)

    stored = await forum_media.save_forum_upload(file)
    now = utcnow()
    item = ForumMedia(
        storage_key=stored.storage_key,
        content_type=stored.content_type,
        kind=stored.kind,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        width=stored.width,
        height=stored.height,
        uploader_id=user.id,
        rights_accepted_at=now,
        created_at=now,
    )
    try:
        db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        forum_media.delete_media(stored.storage_key)
        raise
    db.refresh(item)
    return _media_response(item)


@router.delete("/upload/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_media(media_id: int, db: DbSession, user: CurrentUser) -> Response:
    """Descarta un archivo propio aún no publicado (el usuario lo quita antes de enviar)."""
    item = db.scalar(
        select(ForumMedia).where(ForumMedia.id == media_id, ForumMedia.uploader_id == user.id, ForumMedia.thread_id.is_(None))
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    forum_media.delete_media(item.storage_key)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/media/{storage_key}")
def get_media(storage_key: str, db: DbSession, user: OptionalUser) -> FileResponse:
    """Sirve un archivo de un hilo visible (o uno propio aún sin publicar). Admite Range (vídeo).

    `nosniff` + CSP `sandbox`: aunque se colara contenido activo, el navegador no lo ejecutaría.
    """
    item = db.scalar(select(ForumMedia).where(ForumMedia.storage_key == storage_key))
    path = forum_media.media_path(storage_key) if item else None
    if item is None or path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    if item.thread_id is None:
        visible = user is not None and user.id == item.uploader_id
    else:
        visible = db.scalar(select(ForumThread.id).where(ForumThread.id == item.thread_id, _VISIBLE_THREAD)) is not None
    if not visible:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return FileResponse(
        path,
        media_type=item.content_type,
        headers={
            "Content-Disposition": f'inline; filename="agropelink-{item.id}{path.suffix}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cross-Origin-Resource-Policy": "same-site",
            "Cache-Control": "private, max-age=3600" if item.thread_id else "no-store",
        },
    )


# --- Herramientas de administrador ---------------------------------------------------------------


@router.delete("/posts/{post_id}/admin", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_post(
    post_id: int,
    db: DbSession,
    admin: AdminUser,
    kind: Annotated[Literal["thread", "reply"], Query(description="thread = tema completo · reply = respuesta")] = "reply",
) -> Response:
    """Borrado forzoso e inmediato de un tema (con sus respuestas y archivos) o de una respuesta, sea de quien sea.

    A diferencia de la retirada por denuncia (borrado lógico), elimina el contenido de la base de datos.
    Queda constancia en la bitácora de moderación (extracto, autor y administrador) para auditoría.
    """
    target: ForumThread | ForumReply | None = db.get(ForumThread if kind == "thread" else ForumReply, post_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    db.add(
        ModerationEvent(
            user_id=target.author_id,
            action=ModerationAction.CONTENT_REMOVED,
            reason=f"{'Tema' if kind == 'thread' else 'Respuesta'} eliminado definitivamente por un administrador.",
            excerpt=" ".join(target.body.split())[:300],
            automatic=False,
            actor_id=admin.id,
            created_at=utcnow(),
        )
    )
    if isinstance(target, ForumThread):
        # Los archivos del tema se borran del disco (las filas caen en cascada con el tema).
        for item in db.scalars(select(ForumMedia).where(ForumMedia.thread_id == target.id)):
            forum_media.delete_media(item.storage_key)
    db.delete(target)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
