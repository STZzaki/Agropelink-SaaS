"""Acciones del propio usuario sobre su cuenta."""

from fastapi import APIRouter, HTTPException, status

from deps import AdminUser, CurrentUser, DbSession
from models import User, UserRole
from schemas import BanResult, ProfileUpdate, QuickBanRequest, UserResponse
from utils.moderation import ban_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/acknowledge-warning", response_model=UserResponse)
def acknowledge_warning(user: CurrentUser, db: DbSession) -> User:
    """El usuario acepta la advertencia oficial: se cierra el modal obligatorio y puede volver a publicar.

    La advertencia sigue contando: una nueva infracción supone el bloqueo permanente.
    """
    if user.pending_warning_ack:
        user.pending_warning_ack = False
        db.commit()
    return user


@router.put("/me", response_model=UserResponse)
def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> User:
    """Actualiza nombre, fecha de nacimiento (mayor de 18) y avatar del catálogo. Solo sobre la propia cuenta."""
    user.name = payload.name
    user.birth_date = payload.birth_date
    user.avatar = payload.avatar
    db.commit()
    return user


@router.put("/{user_id}/ban", response_model=BanResult)
def ban(user_id: int, db: DbSession, admin: AdminUser, payload: QuickBanRequest | None = None) -> BanResult:
    """Bloqueo inmediato desde el foro (solo administradores). A partir de ese momento el middleware global
    responde 403 a cualquier petición de esa cuenta. No se puede bloquear a uno mismo ni a otro administrador."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id or user.role == UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede bloquear a un administrador.")
    if not user.is_banned:
        ban_user(db, user, (payload.reason if payload and payload.reason else "Bloqueo manual desde el foro."), actor=admin)
        db.commit()
    return BanResult(id=user.id, is_banned=user.is_banned, ban_reason=user.ban_reason)
