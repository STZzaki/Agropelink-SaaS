"""Dependencias compartidas por los routers: sesión, autorización por rol (RBAC) y comprobaciones IDOR."""

from collections.abc import Callable, Iterable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from models import Farm, User, UserRole, UserSession
from security import hash_token, utcnow
from utils.moderation import expire_warnings

DbSession = Annotated[Session, Depends(get_db)]

SUSPENDED_DETAIL = "Cuenta suspendida por incumplir las normas de la comunidad."
# Mismo texto que usa el frontend para detectar la suspensión y cerrar la sesión local.
BANNED_DETAIL = (
    "Tu cuenta ha sido suspendida por incumplir las normas de la comunidad. "
    "Si crees que es un error, escribe a info@agropelink.es."
)


def _user_from_cookie(request: Request, db: Session) -> User | None:
    token = request.cookies.get(get_settings().session_cookie)
    # Tamaño acotado: un token válido mide 43 caracteres.
    if not token or len(token) > 128:
        return None

    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None:
        return None
    if session.expires_at <= utcnow():
        db.execute(delete(UserSession).where(UserSession.id == session.id))
        db.commit()
        return None
    user = session.user
    if user.is_banned:
        # Defensa en profundidad (el middleware global ya responde 403 antes de llegar aquí).
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BANNED_DETAIL)
    if expire_warnings(user):  # faltas caducadas (72 h sin infracciones): el contador vuelve a 0
        db.commit()
    return user


def get_current_user(request: Request, db: DbSession) -> User:
    """Usuario autenticado mediante la cookie de sesión HttpOnly; 401 si no hay sesión válida."""
    user = _user_from_cookie(request, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def get_optional_user(request: Request, db: DbSession) -> User | None:
    return _user_from_cookie(request, db)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_role(*roles: UserRole | Iterable[UserRole]) -> Callable[[User], User]:
    """Dependencia de autorización: 403 si el rol del usuario (leído de BD en cada petición) no está permitido.

    Acepta `require_role(UserRole.ADMIN)` o `require_role([UserRole.FARMER, UserRole.ADMIN])`.
    El rol nunca viaja en la petición ni en la cookie: no se puede falsificar desde el cliente.
    """
    allowed: set[UserRole] = set()
    for role in roles:
        allowed.update([role] if isinstance(role, UserRole) else role)

    def dependency(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency


AdminUser = Annotated[User, Depends(require_role(UserRole.ADMIN))]
FarmerUser = Annotated[User, Depends(require_role([UserRole.FARMER, UserRole.ADMIN]))]


def client_ip(request: Request) -> str:
    # Detrás de un proxy inverso habrá que confiar en X-Forwarded-For solo desde IPs conocidas.
    return request.client.host if request.client else "unknown"


def get_owned_farm(db: Session, farm_id: int, user: User) -> Farm:
    """Devuelve la granja si pertenece al usuario; 404 en caso contrario (no revela si existe)."""
    farm = db.scalar(select(Farm).where(Farm.id == farm_id, Farm.owner_id == user.id))
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")
    return farm
