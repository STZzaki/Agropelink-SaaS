"""Solicitudes de alta como agricultor (usuario estándar → rol `farmer`, previa aprobación de un administrador)."""

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select

from deps import CurrentUser, DbSession
from models import ApplicationStatus, FarmerApplication, UserRole
from notifications import send_admin_notification
from ratelimit import SlidingWindowLimiter
from schemas import FarmerApplicationCreate, FarmerApplicationResponse
from security import utcnow

router = APIRouter(prefix="/applications", tags=["applications"])

_applications_by_user = SlidingWindowLimiter(3, 24 * 60 * 60, "Has enviado demasiadas solicitudes hoy. Inténtalo mañana.")


@router.get("/me", response_model=FarmerApplicationResponse | None)
def my_application(user: CurrentUser, db: DbSession) -> FarmerApplication | None:
    """Última solicitud del usuario (para mostrar su estado en el portal)."""
    return db.scalar(
        select(FarmerApplication)
        .where(FarmerApplication.user_id == user.id)
        .order_by(FarmerApplication.created_at.desc(), FarmerApplication.id.desc())
        .limit(1)
    )


@router.post("", response_model=FarmerApplicationResponse, status_code=status.HTTP_201_CREATED)
def apply_as_farmer(
    payload: FarmerApplicationCreate, user: CurrentUser, db: DbSession, background: BackgroundTasks
) -> FarmerApplication:
    if user.role != UserRole.USER:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tu cuenta ya tiene acceso al panel agronómico.")
    pending = db.scalar(
        select(FarmerApplication.id).where(
            FarmerApplication.user_id == user.id, FarmerApplication.status == ApplicationStatus.PENDING
        )
    )
    if pending is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya tienes una solicitud en revisión.")
    _applications_by_user.hit(f"user:{user.id}")

    application = FarmerApplication(
        user_id=user.id, **payload.model_dump(exclude={"privacy_accepted"}), created_at=utcnow()
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    background.add_task(
        send_admin_notification,
        subject=f"Nueva solicitud de alta como agricultor #{application.id}",
        body=(
            f"Usuario: #{user.id} {user.name} <{user.email}>\n"
            f"Explotación: {application.farm_name} ({application.location})\n"
            f"Cultivos: {application.crops}\n"
            f"Superficie: {application.surface_ha or '—'} ha · Teléfono: {application.phone}\n\n"
            f"{application.message or ''}"
        ),
    )
    return application
