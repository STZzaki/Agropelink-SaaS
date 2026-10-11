import datetime as dt
import logging
import urllib.parse

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from config import get_settings
from deps import SUSPENDED_DETAIL, CurrentUser, DbSession, client_ip
from models import ModerationEvent, User, UserRole, UserSession
from ratelimit import SlidingWindowLimiter
import password_reset
from schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ModerationEventResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from security import (
    hash_password,
    hash_token,
    new_session_token,
    password_needs_rehash,
    utcnow,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_CREDENTIALS = "Email o contraseña incorrectos."
# Respuesta idéntica exista o no el email: evita la enumeración de cuentas.
_REGISTER_ACCEPTED = "Si los datos son válidos, tu cuenta está lista. Ya puedes iniciar sesión."

# Fuerza bruta: fallos por email (protege una cuenta) y por IP (protege frente a barridos).
_login_failures_by_email = SlidingWindowLimiter(5, 15 * 60, "Demasiados intentos fallidos. Espera 15 minutos.")
_login_failures_by_ip = SlidingWindowLimiter(20, 15 * 60, "Demasiados intentos fallidos. Espera 15 minutos.")
_registrations_by_ip = SlidingWindowLimiter(5, 60 * 60, "Demasiados registros desde esta conexión. Inténtalo más tarde.")
# Recuperación: limita el abuso (spam de enlaces a un buzón ajeno y fuerza bruta de tokens).
_RESET_LIMIT_MESSAGE = "Demasiadas solicitudes. Inténtalo de nuevo más tarde."
_forgot_by_ip = SlidingWindowLimiter(10, 60 * 60, _RESET_LIMIT_MESSAGE)
_forgot_by_email = SlidingWindowLimiter(3, 60 * 60, _RESET_LIMIT_MESSAGE)
_reset_by_ip = SlidingWindowLimiter(20, 60 * 60, _RESET_LIMIT_MESSAGE)

_FORGOT_ACCEPTED = "Si el email está registrado, recibirás un enlace para restablecer la contraseña (válido 15 minutos)."
_INVALID_RESET_TOKEN = "El enlace no es válido o ha caducado. Solicita uno nuevo."

logger = logging.getLogger("agropelink.auth")


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def register(payload: RegisterRequest, request: Request, db: DbSession) -> MessageResponse:
    """Crea una cuenta con rol `user` (portal estándar). La respuesta es la misma si el email ya existía.

    El rol `farmer` solo lo concede un administrador al aprobar una solicitud de alta.
    """
    _registrations_by_ip.hit(client_ip(request))

    # El hash se calcula siempre para que el tiempo de respuesta no delate cuentas existentes.
    password_hash = hash_password(payload.password)
    if db.scalar(select(User.id).where(User.email == payload.email)) is None:
        db.add(
            User(
                name=payload.name,
                email=payload.email,
                hashed_password=password_hash,
                role=UserRole.USER,
                birth_date=payload.birth_date,
            )
        )
        try:
            db.commit()
        except IntegrityError:  # registro concurrente con el mismo email
            db.rollback()
    return MessageResponse(detail=_REGISTER_ACCEPTED)


@router.post("/login", response_model=UserResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: DbSession) -> User:
    """Valida credenciales y emite una cookie de sesión `HttpOnly; Secure; SameSite=Lax`."""
    ip_key, email_key = f"ip:{client_ip(request)}", f"email:{payload.email}"
    _login_failures_by_ip.check(ip_key)
    _login_failures_by_email.check(email_key)

    user = db.scalar(select(User).where(User.email == payload.email))
    if not verify_password(payload.password, user.hashed_password if user else None):
        _login_failures_by_ip.record(ip_key)
        _login_failures_by_email.record(email_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_INVALID_CREDENTIALS)

    _login_failures_by_email.reset(email_key)
    assert user is not None
    # Solo tras una contraseña correcta se informa del bloqueo (no revela el estado a terceros).
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SUSPENDED_DETAIL)
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(payload.password)

    now = utcnow()
    user.last_login_at = now
    # Limpieza de sesiones caducadas del usuario y emisión de un token nuevo (sin fijación de sesión).
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= now))
    token = new_session_token()
    db.add(
        UserSession(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + dt.timedelta(hours=get_settings().session_ttl_hours),
        )
    )
    db.commit()
    _set_session_cookie(response, token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: DbSession) -> Response:
    """Revoca la sesión en servidor y borra la cookie (idempotente)."""
    token = request.cookies.get(get_settings().session_cookie)
    if token and len(token) <= 128:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
        db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookie(response)
    return response


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> User:
    return user


@router.get("/me/moderation", response_model=list[ModerationEventResponse])
def my_moderation_history(user: CurrentUser, db: DbSession) -> list[ModerationEvent]:
    """Avisos y sanciones del propio usuario (transparencia de la moderación)."""
    return list(
        db.scalars(
            select(ModerationEvent).where(ModerationEvent.user_id == user.id).order_by(ModerationEvent.created_at.desc()).limit(50)
        )
    )


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: DbSession) -> MessageResponse:
    """Solicita un enlace de recuperación. Respuesta 200 idéntica exista o no la cuenta (anti-enumeración).

    Aún no hay envío de correo: en desarrollo el enlace se escribe en el log del servidor. En producción
    nunca se registra el token (quien leyera los logs podría tomar la cuenta).
    """
    _forgot_by_ip.hit(f"ip:{client_ip(request)}")
    _forgot_by_email.hit(f"email:{payload.email}")

    user = db.scalar(select(User).where(User.email == payload.email))
    if user is not None and not user.is_banned:
        token = password_reset.create_reset_token(user)
        settings = get_settings()
        link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={urllib.parse.quote(token, safe='')}"
        if settings.is_production:
            logger.warning("Recuperación solicitada para el usuario #%s: envío por correo pendiente de configurar", user.id)
        else:
            logger.warning("[SIMULACIÓN DE EMAIL] Recuperación de contraseña para %s → %s", user.email, link)
    return MessageResponse(detail=_FORGOT_ACCEPTED)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, request: Request, db: DbSession) -> MessageResponse:
    """Valida el token (firma, caducidad, propósito y un solo uso) y guarda la nueva contraseña.

    Cierra todas las sesiones abiertas de la cuenta: si alguien la estaba usando, queda fuera.
    """
    _reset_by_ip.hit(f"ip:{client_ip(request)}")
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_INVALID_RESET_TOKEN)

    user_id = password_reset.user_id_from_token(payload.token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None or user.is_banned or not password_reset.token_matches_password(payload.token, user):
        raise invalid

    user.hashed_password = hash_password(payload.new_password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    _login_failures_by_email.reset(f"email:{user.email}")
    logger.info("Contraseña restablecida para el usuario #%s", user.id)
    return MessageResponse(detail="Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.")
