"""Panel de administración: métricas globales, usuarios y roles, fincas, altas de agricultor, moderación y soporte.

Todo el router exige rol `admin` (dependencia a nivel de router): ningún endpoint puede quedar expuesto por olvido.
"""

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import distinct, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from deps import AdminUser, DbSession, require_role
from models import (
    ApplicationStatus,
    Document,
    DocumentType,
    Farm,
    FarmerApplication,
    ForumReply,
    ForumReport,
    ForumThread,
    ModerationAction,
    ModerationEvent,
    ReportStatus,
    SupportTicket,
    Task,
    TaskStatus,
    User,
    UserRole,
    UserSession,
)
from utils.moderation import ban_user
from schemas import (
    AdminApplicationRow,
    AdminFarmRow,
    AdminMetrics,
    AdminModerationEvent,
    AdminReportRow,
    AdminSupportRow,
    AdminUserCreate,
    AdminUserList,
    AdminUserRow,
    ApplicationReview,
    BanRequest,
    ForumAuthor,
    RemovedContentRow,
    ReportedContent,
    ReportResolve,
    RoleUpdate,
    age_on,
)
from security import hash_password, utcnow

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_role(UserRole.ADMIN))])


def _author(user: User) -> ForumAuthor:
    return ForumAuthor.model_validate(user)


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _not_self(admin: User, target: User) -> None:
    # Evita que un administrador se bloquee o se degrade a sí mismo y deje la plataforma sin control.
    if admin.id == target.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes aplicar esta acción a tu propia cuenta.")


# --- Métricas ---------------------------------------------------------------------------------


@router.get("/metrics", response_model=AdminMetrics)
def metrics(db: DbSession) -> AdminMetrics:
    now = utcnow()
    by_role = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    by_task = dict(db.execute(select(Task.status, func.count()).group_by(Task.status)).all())
    by_doc = dict(
        db.execute(select(Document.doc_type, func.count()).where(Document.is_draft.is_(False)).group_by(Document.doc_type)).all()
    )
    count = lambda stmt: db.scalar(stmt) or 0  # noqa: E731
    return AdminMetrics(
        users_total=sum(by_role.values()),
        users_by_role={r: by_role.get(r, 0) for r in UserRole},
        active_users=count(select(func.count(distinct(UserSession.user_id))).where(UserSession.expires_at > now)),
        new_users_30d=count(select(func.count()).select_from(User).where(User.created_at >= now - dt.timedelta(days=30))),
        banned_users=count(select(func.count()).select_from(User).where(User.is_banned.is_(True))),
        farms=count(select(func.count()).select_from(Farm)),
        tasks_by_status={s: by_task.get(s, 0) for s in TaskStatus},
        documents=sum(by_doc.values()),
        documents_by_type={t: by_doc.get(t, 0) for t in DocumentType},
        forum_threads=count(select(func.count()).select_from(ForumThread).where(ForumThread.deleted_at.is_(None))),
        forum_replies=count(select(func.count()).select_from(ForumReply).where(ForumReply.deleted_at.is_(None))),
        open_reports=count(select(func.count()).select_from(ForumReport).where(ForumReport.status == ReportStatus.OPEN)),
        pending_applications=count(
            select(func.count()).select_from(FarmerApplication).where(FarmerApplication.status == ApplicationStatus.PENDING)
        ),
        open_support_tickets=count(select(func.count()).select_from(SupportTicket).where(SupportTicket.is_closed.is_(False))),
    )


# --- Usuarios ---------------------------------------------------------------------------------


def _user_row(user: User, farm_count: int) -> AdminUserRow:
    return AdminUserRow(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        warnings_count=user.warnings_count,
        pending_warning_ack=user.pending_warning_ack,
        birth_date=user.birth_date,
        age=age_on(user.birth_date) if user.birth_date else None,
        banned_at=user.banned_at,
        is_active=user.is_active,
        is_banned=user.is_banned,
        ban_reason=user.ban_reason,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        farm_count=farm_count,
    )


def _farm_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Farm).where(Farm.owner_id == user_id)) or 0


@router.get("/users", response_model=AdminUserList)
def list_users(
    db: DbSession,
    role: UserRole | None = None,
    banned: bool | None = None,
    q: Annotated[str | None, Query(min_length=2, max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserList:
    filters = []
    if role is not None:
        filters.append(User.role == role)
    if banned is not None:
        filters.append(User.is_banned.is_(banned))
    if q:
        term = q.strip()
        filters.append(or_(User.name.contains(term, autoescape=True), User.email.contains(term.lower(), autoescape=True)))
    farms = select(func.count(Farm.id)).where(Farm.owner_id == User.id).correlate(User).scalar_subquery()
    total = db.scalar(select(func.count()).select_from(User).where(*filters)) or 0
    rows = db.execute(select(User, farms).where(*filters).order_by(User.id.desc()).limit(limit).offset(offset)).all()
    return AdminUserList(items=[_user_row(u, n) for u, n in rows], total=total)


@router.post("/users", response_model=AdminUserRow, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, db: DbSession) -> AdminUserRow:
    """Alta directa de una cuenta con el rol elegido por el administrador."""
    if db.scalar(select(User.id).where(User.email == payload.email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese email.")
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        birth_date=payload.birth_date,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese email.") from None
    return _user_row(user, 0)


@router.patch("/users/{user_id}/role", response_model=AdminUserRow)
def change_role(user_id: int, payload: RoleUpdate, db: DbSession, admin: AdminUser) -> AdminUserRow:
    user = _get_user(db, user_id)
    _not_self(admin, user)
    user.role = payload.role
    db.commit()
    return _user_row(user, _farm_count(db, user.id))


@router.post("/users/{user_id}/ban", response_model=AdminUserRow)
def ban(user_id: int, payload: BanRequest, db: DbSession, admin: AdminUser) -> AdminUserRow:
    user = _get_user(db, user_id)
    _not_self(admin, user)
    ban_user(db, user, payload.reason, actor=admin)
    db.commit()
    return _user_row(user, _farm_count(db, user.id))


@router.post("/users/{user_id}/unban", response_model=AdminUserRow)
def unban(user_id: int, db: DbSession, admin: AdminUser) -> AdminUserRow:
    user = _get_user(db, user_id)
    if not user.is_banned:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La cuenta no está bloqueada.")
    user.is_banned = False
    user.banned_at = None
    user.ban_reason = None
    user.warnings_count = 0
    user.pending_warning_ack = False
    db.add(
        ModerationEvent(
            user_id=user.id,
            action=ModerationAction.UNBAN,
            reason="Cuenta desbloqueada por un administrador. Avisos reiniciados.",
            automatic=False,
            actor_id=admin.id,
            created_at=utcnow(),
        )
    )
    db.commit()
    return _user_row(user, _farm_count(db, user.id))


# --- Fincas -----------------------------------------------------------------------------------


@router.get("/farms", response_model=list[AdminFarmRow])
def list_farms(
    db: DbSession,
    q: Annotated[str | None, Query(min_length=2, max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AdminFarmRow]:
    tasks = select(func.count(Task.id)).where(Task.farm_id == Farm.id).correlate(Farm).scalar_subquery()
    docs = (
        select(func.count(Document.id))
        .where(Document.farm_id == Farm.id, Document.is_draft.is_(False))
        .correlate(Farm)
        .scalar_subquery()
    )
    stmt = select(Farm, User.name, tasks, docs).join(Farm.owner)
    if q:
        term = q.strip()
        stmt = stmt.where(
            or_(Farm.name.contains(term, autoescape=True), Farm.location.contains(term, autoescape=True), User.name.contains(term, autoescape=True))
        )
    rows = db.execute(stmt.order_by(Farm.id.desc()).limit(limit).offset(offset)).all()
    return [
        AdminFarmRow(id=f.id, name=f.name, location=f.location, owner_id=f.owner_id, owner_name=owner, task_count=t, document_count=d)
        for f, owner, t, d in rows
    ]


# --- Solicitudes de alta ----------------------------------------------------------------------


def _application_row(app: FarmerApplication) -> AdminApplicationRow:
    return AdminApplicationRow(
        id=app.id,
        farm_name=app.farm_name,
        location=app.location,
        crops=app.crops,
        surface_ha=float(app.surface_ha) if app.surface_ha is not None else None,
        phone=app.phone,
        message=app.message,
        status=app.status,
        created_at=app.created_at,
        reviewed_at=app.reviewed_at,
        review_note=app.review_note,
        user_id=app.user.id,
        user_name=app.user.name,
        user_email=app.user.email,
    )


@router.get("/applications", response_model=list[AdminApplicationRow])
def list_applications(db: DbSession, app_status: Annotated[ApplicationStatus | None, Query(alias="status")] = None) -> list[AdminApplicationRow]:
    stmt = select(FarmerApplication).options(selectinload(FarmerApplication.user))
    if app_status is not None:
        stmt = stmt.where(FarmerApplication.status == app_status)
    rows = db.scalars(stmt.order_by(FarmerApplication.created_at.desc()).limit(200)).all()
    return [_application_row(a) for a in rows]


def _pending_application(db: Session, application_id: int) -> FarmerApplication:
    app = db.get(FarmerApplication, application_id)
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if app.status != ApplicationStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud ya fue revisada.")
    return app


@router.post("/applications/{application_id}/approve", response_model=AdminApplicationRow)
def approve_application(application_id: int, payload: ApplicationReview, db: DbSession, admin: AdminUser) -> AdminApplicationRow:
    """Aprobación en 1 clic: asigna el rol `farmer` y crea la primera finca con los datos de la solicitud."""
    app = _pending_application(db, application_id)
    if app.user.is_banned:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La cuenta solicitante está bloqueada.")
    app.status = ApplicationStatus.APPROVED
    app.reviewed_at = utcnow()
    app.reviewed_by_id = admin.id
    app.review_note = payload.note or None
    if app.user.role == UserRole.USER:
        app.user.role = UserRole.FARMER
    if payload.create_farm and _farm_count(db, app.user_id) == 0:
        db.add(Farm(name=app.farm_name, location=app.location, owner_id=app.user_id))
    db.commit()
    return _application_row(app)


@router.post("/applications/{application_id}/reject", response_model=AdminApplicationRow)
def reject_application(application_id: int, payload: ApplicationReview, db: DbSession, admin: AdminUser) -> AdminApplicationRow:
    app = _pending_application(db, application_id)
    app.status = ApplicationStatus.REJECTED
    app.reviewed_at = utcnow()
    app.reviewed_by_id = admin.id
    app.review_note = payload.note or None
    db.commit()
    return _application_row(app)


# --- Centro de moderación ---------------------------------------------------------------------


def _report_row(report: ForumReport) -> AdminReportRow:
    target = report.reply or report.thread
    content = ReportedContent(
        kind="reply" if report.reply else "thread",
        thread_id=report.thread_id,
        reply_id=report.reply_id,
        thread_title=report.thread.title,
        body=target.body,
        author=_author(target.author),
        deleted=target.deleted_at is not None,
    )
    return AdminReportRow(
        id=report.id,
        reason=report.reason,
        details=report.details,
        status=report.status,
        created_at=report.created_at,
        reporter=_author(report.reporter),
        content=content,
        resolution_note=report.resolution_note,
    )


@router.get("/reports", response_model=list[AdminReportRow])
def list_reports(db: DbSession, report_status: Annotated[ReportStatus | None, Query(alias="status")] = ReportStatus.OPEN) -> list[AdminReportRow]:
    stmt = select(ForumReport).options(
        selectinload(ForumReport.reporter),
        selectinload(ForumReport.thread).selectinload(ForumThread.author),
        selectinload(ForumReport.reply).selectinload(ForumReply.author),
    )
    if report_status is not None:
        stmt = stmt.where(ForumReport.status == report_status)
    return [_report_row(r) for r in db.scalars(stmt.order_by(ForumReport.created_at.desc()).limit(200)).all()]


def _remove_content(db: Session, target: ForumThread | ForumReply, reason: str, admin: User) -> None:
    if target.deleted_at is None:
        target.deleted_at = utcnow()
        target.deleted_reason = reason[:300]
        db.add(
            ModerationEvent(
                user_id=target.author_id,
                action=ModerationAction.CONTENT_REMOVED,
                reason=f"Publicación retirada por moderación: {reason}"[:300],
                excerpt=" ".join(target.body.split())[:300],
                automatic=False,
                actor_id=admin.id,
                created_at=utcnow(),
            )
        )


def _close_reports_for(db: Session, thread_id: int, reply_id: int | None, admin: User, note: str) -> None:
    reply_filter = ForumReport.reply_id.is_(None) if reply_id is None else ForumReport.reply_id == reply_id
    for other in db.scalars(
        select(ForumReport).where(ForumReport.thread_id == thread_id, reply_filter, ForumReport.status == ReportStatus.OPEN)
    ):
        other.status = ReportStatus.RESOLVED
        other.resolved_at = utcnow()
        other.resolved_by_id = admin.id
        other.resolution_note = note[:300]


@router.post("/reports/{report_id}/resolve", response_model=AdminReportRow)
def resolve_report(report_id: int, payload: ReportResolve, db: DbSession, admin: AdminUser) -> AdminReportRow:
    report = db.get(ForumReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.status != ReportStatus.OPEN:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La denuncia ya fue resuelta.")
    note = payload.note or f"Motivo: {report.reason.value}"

    if payload.action == "dismiss":
        report.status = ReportStatus.DISMISSED
        report.resolved_at = utcnow()
        report.resolved_by_id = admin.id
        report.resolution_note = payload.note or None
    else:
        target: ForumThread | ForumReply = report.reply or report.thread
        author = target.author
        if payload.action == "remove_and_ban":
            if author.role == UserRole.ADMIN or author.id == admin.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede bloquear a un administrador.")
            if not author.is_banned:
                ban_user(db, author, f"Bloqueo por denuncia #{report.id}: {note}", actor=admin, excerpt=" ".join(target.body.split())[:300])
        _remove_content(db, target, note, admin)
        _close_reports_for(db, report.thread_id, report.reply_id, admin, note)
    db.commit()
    db.refresh(report)
    return _report_row(report)


def _forum_target(db: Session, kind: Literal["threads", "replies"], item_id: int) -> ForumThread | ForumReply:
    target = db.get(ForumThread if kind == "threads" else ForumReply, item_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")
    return target


@router.post("/forum/{kind}/{item_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
def remove_forum_content(kind: Literal["threads", "replies"], item_id: int, payload: BanRequest, db: DbSession, admin: AdminUser) -> None:
    target = _forum_target(db, kind, item_id)
    _remove_content(db, target, payload.reason, admin)
    thread_id = target.id if isinstance(target, ForumThread) else target.thread_id
    _close_reports_for(db, thread_id, None if isinstance(target, ForumThread) else target.id, admin, payload.reason)
    db.commit()


@router.post("/forum/{kind}/{item_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_forum_content(kind: Literal["threads", "replies"], item_id: int, db: DbSession) -> None:
    target = _forum_target(db, kind, item_id)
    target.deleted_at = None
    target.deleted_reason = None
    db.commit()


@router.get("/moderation/removed", response_model=list[RemovedContentRow])
def removed_content(db: DbSession) -> list[RemovedContentRow]:
    """Hilos y respuestas retirados (por moderación manual), del más reciente al más antiguo."""
    threads = db.scalars(
        select(ForumThread).options(selectinload(ForumThread.author)).where(ForumThread.deleted_at.is_not(None)).limit(100)
    ).all()
    replies = db.scalars(
        select(ForumReply)
        .options(selectinload(ForumReply.author), selectinload(ForumReply.thread))
        .where(ForumReply.deleted_at.is_not(None))
        .limit(100)
    ).all()
    rows = [
        RemovedContentRow(kind="thread", id=t.id, thread_id=t.id, thread_title=t.title, body=t.body, author=_author(t.author),
                          deleted_at=t.deleted_at, deleted_reason=t.deleted_reason)
        for t in threads
    ] + [
        RemovedContentRow(kind="reply", id=r.id, thread_id=r.thread_id, thread_title=r.thread.title, body=r.body,
                          author=_author(r.author), deleted_at=r.deleted_at, deleted_reason=r.deleted_reason)
        for r in replies
    ]
    return sorted(rows, key=lambda r: r.deleted_at, reverse=True)


@router.get("/moderation/events", response_model=list[AdminModerationEvent])
def moderation_events(db: DbSession, limit: Annotated[int, Query(ge=1, le=200)] = 100) -> list[AdminModerationEvent]:
    """Bitácora de Auto-Mod y acciones manuales: avisos, mensajes bloqueados, bloqueos y desbloqueos."""
    events = db.scalars(
        select(ModerationEvent).options(selectinload(ModerationEvent.user)).order_by(ModerationEvent.created_at.desc()).limit(limit)
    ).all()
    return [
        AdminModerationEvent(
            id=e.id, action=e.action, reason=e.reason, excerpt=e.excerpt, automatic=e.automatic, created_at=e.created_at,
            user=_author(e.user),
        )
        for e in events
    ]


# --- Soporte ----------------------------------------------------------------------------------


@router.get("/support", response_model=list[AdminSupportRow])
def list_support(db: DbSession, closed: bool = False) -> list[AdminSupportRow]:
    tickets = db.scalars(
        select(SupportTicket)
        .options(selectinload(SupportTicket.user))
        .where(SupportTicket.is_closed.is_(closed))
        .order_by(SupportTicket.created_at.desc())
        .limit(200)
    ).all()
    return [
        AdminSupportRow(
            id=t.id, category=t.category, subject=t.subject, message=t.message, is_closed=t.is_closed, created_at=t.created_at,
            user=_author(t.user), user_email=t.user.email,
        )
        for t in tickets
    ]


@router.post("/support/{ticket_id}/close", status_code=status.HTTP_204_NO_CONTENT)
def close_ticket(ticket_id: int, db: DbSession) -> None:
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    ticket.is_closed = True
    db.commit()
