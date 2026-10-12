import datetime as dt
from collections import defaultdict
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from utils import moderation
import forum_media
from deps import AdminUser, CurrentUser, DbSession, OptionalUser
from models import (
    ForumCategory,
    ForumMedia,
    ForumMention,
    ForumReaction,
    ForumReply,
    ForumReport,
    ForumThread,
    ModerationAction,
    ModerationEvent,
    User,
)
from notifications import send_admin_notification
from ratelimit import SlidingWindowLimiter
from sanitize import clean_text
from schemas import (
    ForumAuthor,
    ForumCategoryStat,
    ForumMediaResponse,
    ForumMentionItem,
    ForumMentionList,
    ForumReactions,
    ForumReactionToggle,
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
_reactions_by_user = SlidingWindowLimiter(120, 60, "Demasiadas reacciones seguidas. Espera un momento.")
_mention_search = SlidingWindowLimiter(60, 60, "Demasiadas búsquedas seguidas. Espera un momento.")
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


def _target(thread_id: int, reply_id: int | None) -> str:
    return f"r:{reply_id}" if reply_id else f"t:{thread_id}"


def _reactions(db: DbSession, thread_id: int, user: User | None) -> dict[str, ForumReactions]:
    """Recuento por publicación y tipo (una consulta agregada) y las reacciones propias del visitante."""
    result: dict[str, ForumReactions] = defaultdict(ForumReactions)
    rows = db.execute(
        select(ForumReaction.target, ForumReaction.kind, func.count(ForumReaction.id))
        .where(ForumReaction.thread_id == thread_id)
        .group_by(ForumReaction.target, ForumReaction.kind)
    )
    for target, kind, count in rows:
        result[target].counts[kind] = count
    if user is not None:
        for target, kind in db.execute(
            select(ForumReaction.target, ForumReaction.kind).where(ForumReaction.thread_id == thread_id, ForumReaction.user_id == user.id)
        ):
            result[target].mine.append(kind)
    return result


def _mentions(db: DbSession, thread_id: int) -> dict[str, list[ForumAuthor]]:
    result: dict[str, list[ForumAuthor]] = defaultdict(list)
    rows = db.execute(
        select(ForumMention.reply_id, User).join(User, ForumMention.user_id == User.id).where(ForumMention.thread_id == thread_id)
    )
    for reply_id, user in rows:
        key = _target(thread_id, reply_id)
        if all(a.id != user.id for a in result[key]):
            result[key].append(ForumAuthor.model_validate(user))
    return result


def _claim_media(db: DbSession, user: User, media_ids: list[int], *, images_only: bool) -> list[ForumMedia]:
    """Solo archivos propios, ya validados por /forum/upload y todavía sin publicar (sin IDOR ni reutilización)."""
    ids = list(dict.fromkeys(media_ids))
    if not ids:
        return []
    media = list(
        db.scalars(select(ForumMedia).where(ForumMedia.id.in_(ids), ForumMedia.uploader_id == user.id, ForumMedia.thread_id.is_(None)))
    )
    if len(media) != len(ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Algún archivo adjunto no es válido. Vuelve a subirlo.")
    if images_only and any(m.kind != "image" for m in media):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="En las respuestas solo se pueden adjuntar fotos.")
    return media


def _record_mentions(db: DbSession, author: User, user_ids: list[int], text: str, thread_id: int, reply_id: int | None) -> None:
    """Solo cuentan menciones reales: usuario existente, no bloqueado, distinto del autor y cuyo «@Nombre» aparece
    en el texto ya saneado. El resto se ignora (no se puede notificar a alguien sin nombrarlo)."""
    ids = [i for i in dict.fromkeys(user_ids) if i != author.id]
    if not ids:
        return
    lowered = text.casefold()
    now = utcnow()
    for target in db.scalars(select(User).where(User.id.in_(ids), User.is_banned.is_(False))):
        if f"@{target.name.casefold()}" in lowered:
            db.add(ForumMention(user_id=target.id, actor_id=author.id, thread_id=thread_id, reply_id=reply_id, created_at=now))


def _reply_response(reply: ForumReply, media: list[ForumMedia], reactions: ForumReactions, mentions: list[ForumAuthor]) -> ForumReplyResponse:
    return ForumReplyResponse(
        id=reply.id,
        body=reply.body,
        created_at=reply.created_at,
        author=ForumAuthor.model_validate(reply.author),
        media=[_media_response(m) for m in media],
        reactions=reactions,
        mentions=mentions,
    )


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
def get_thread(thread_id: int, db: DbSession, user: OptionalUser) -> ForumThreadDetail:
    thread = db.scalar(
        select(ForumThread)
        .options(selectinload(ForumThread.author), selectinload(ForumThread.replies).selectinload(ForumReply.author))
        .where(ForumThread.id == thread_id, _VISIBLE_THREAD)
    )
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    media_by_reply: dict[int | None, list[ForumMedia]] = defaultdict(list)
    for m in db.scalars(select(ForumMedia).where(ForumMedia.thread_id == thread.id).order_by(ForumMedia.id)):
        media_by_reply[m.reply_id].append(m)
    reactions = _reactions(db, thread.id, user)
    mentions = _mentions(db, thread.id)
    visible = [r for r in thread.replies if r.deleted_at is None]
    visible.sort(key=lambda r: (r.created_at, r.id), reverse=True)  # más recientes primero
    return ForumThreadDetail(
        id=thread.id,
        category=thread.category,
        title=thread.title,
        body=thread.body,
        tags=thread.tags or [],
        author=ForumAuthor.model_validate(thread.author),
        created_at=thread.created_at,
        last_activity_at=thread.last_activity_at,
        media=[_media_response(m) for m in media_by_reply[None]],
        reactions=reactions[_target(thread.id, None)],
        mentions=mentions[_target(thread.id, None)],
        replies=[
            _reply_response(r, media_by_reply[r.id], reactions[_target(thread.id, r.id)], mentions[_target(thread.id, r.id)])
            for r in visible
        ],
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

    media = _claim_media(db, user, payload.media_ids, images_only=False)

    now = utcnow()
    thread = ForumThread(
        category=payload.category, title=title, body=body, tags=tags, author_id=user.id, created_at=now, last_activity_at=now
    )
    db.add(thread)
    db.flush()
    for item in media:
        item.thread_id = thread.id
    _record_mentions(db, user, payload.mentions, f"{title}\n{body}", thread.id, None)
    db.commit()
    db.refresh(thread)
    return _summary(thread, 0, len(media))


@router.post("/threads/{thread_id}/replies", response_model=ForumReplyResponse, status_code=status.HTTP_201_CREATED)
def create_reply(thread_id: int, payload: ForumReplyCreate, db: DbSession, user: CurrentUser) -> ForumReplyResponse:
    thread = _visible_thread(db, thread_id)
    moderation.require_no_pending_warning(user)
    _posts_by_user.hit(f"user:{user.id}")
    moderation.enforce(db, user, payload.body)
    body = _require_length(clean_text(payload.body), 2, "body")
    media = _claim_media(db, user, payload.media_ids, images_only=True)

    now = utcnow()
    reply = ForumReply(thread_id=thread.id, author_id=user.id, body=body, created_at=now)
    thread.last_activity_at = now
    db.add(reply)
    db.flush()
    for item in media:
        item.thread_id = thread.id
        item.reply_id = reply.id
    _record_mentions(db, user, payload.mentions, body, thread.id, reply.id)
    db.commit()
    db.refresh(reply)
    return _reply_response(reply, media, ForumReactions(), _mentions(db, thread.id)[_target(thread.id, reply.id)])


# --- Reacciones y menciones ---------------------------------------------------------------------------


@router.put("/reactions", response_model=ForumReactions)
def toggle_reaction(payload: ForumReactionToggle, db: DbSession, user: CurrentUser) -> ForumReactions:
    """Activa o quita «Me gusta» o una reacción con emoji (lista cerrada) en un tema o una respuesta visibles."""
    _reactions_by_user.hit(f"user:{user.id}")
    thread = _visible_thread(db, payload.thread_id)
    if payload.reply_id is not None and db.scalar(
        select(ForumReply.id).where(ForumReply.id == payload.reply_id, ForumReply.thread_id == thread.id, _VISIBLE_REPLY)
    ) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reply not found")
    target = _target(thread.id, payload.reply_id)
    existing = db.scalar(select(ForumReaction).where(ForumReaction.user_id == user.id, ForumReaction.target == target, ForumReaction.kind == payload.kind))
    if existing is not None:
        db.delete(existing)
    else:
        db.add(ForumReaction(user_id=user.id, thread_id=thread.id, reply_id=payload.reply_id, target=target, kind=payload.kind, created_at=utcnow()))
    try:
        db.commit()
    except IntegrityError:  # doble clic simultáneo: la reacción ya existe
        db.rollback()
    return _reactions(db, thread.id, user)[target]


@router.get("/mentionable", response_model=list[ForumAuthor])
def mentionable(db: DbSession, user: CurrentUser, q: Annotated[str, Query(min_length=1, max_length=50)]) -> list[User]:
    """Autocompletado de @menciones: solo personas que ya participan en el foro (su nombre ya es público ahí)."""
    _mention_search.hit(f"user:{user.id}")
    authors = select(ForumThread.author_id).where(_VISIBLE_THREAD).union(select(ForumReply.author_id).where(_VISIBLE_REPLY))
    stmt = (
        select(User)
        .where(User.id.in_(authors), User.id != user.id, User.is_banned.is_(False), User.name.contains(q.strip(), autoescape=True))
        .order_by(User.name)
        .limit(8)
    )
    return list(db.scalars(stmt))


@router.get("/mentions", response_model=ForumMentionList)
def my_mentions(db: DbSession, user: CurrentUser) -> ForumMentionList:
    stmt = (
        select(ForumMention)
        .options(selectinload(ForumMention.actor), selectinload(ForumMention.thread))
        .join(ForumThread, ForumMention.thread_id == ForumThread.id)
        .where(ForumMention.user_id == user.id, _VISIBLE_THREAD)
        .order_by(ForumMention.created_at.desc())
        .limit(20)
    )
    items = [
        ForumMentionItem(
            id=m.id, thread_id=m.thread_id, thread_title=m.thread.title, reply_id=m.reply_id,
            actor=ForumAuthor.model_validate(m.actor), created_at=m.created_at, read=m.read_at is not None,
        )
        for m in db.scalars(stmt)
    ]
    unread = db.scalar(select(func.count(ForumMention.id)).where(ForumMention.user_id == user.id, ForumMention.read_at.is_(None))) or 0
    return ForumMentionList(items=items, unread=unread)


@router.post("/mentions/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_mentions_read(db: DbSession, user: CurrentUser) -> Response:
    for mention in db.scalars(select(ForumMention).where(ForumMention.user_id == user.id, ForumMention.read_at.is_(None))):
        mention.read_at = utcnow()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        if visible and item.reply_id is not None:  # foto de una respuesta retirada por moderación: deja de servirse
            visible = db.scalar(select(ForumReply.id).where(ForumReply.id == item.reply_id, _VISIBLE_REPLY)) is not None
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
    # Los archivos se borran del disco (las filas caen con el tema o la respuesta).
    owner = ForumMedia.thread_id == target.id if isinstance(target, ForumThread) else ForumMedia.reply_id == target.id
    for item in db.scalars(select(ForumMedia).where(owner)):
        forum_media.delete_media(item.storage_key)
        db.delete(item)
    db.delete(target)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
