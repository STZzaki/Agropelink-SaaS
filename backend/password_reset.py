"""Tokens de recuperación de contraseña (JWT HS256, 15 minutos, un solo uso).

- `typ` fija el propósito: un token de recuperación no sirve para nada más.
- `pwd` es una huella del hash de contraseña ACTUAL: en cuanto la contraseña cambia, todos los
  tokens emitidos antes dejan de ser válidos (un solo uso sin guardar estado en BD).
- El algoritmo se fija en la verificación (`algorithms=["HS256"]`): evita ataques `alg=none` o de confusión.
"""

import datetime as dt
import hashlib
import hmac
import logging
import secrets
from functools import lru_cache

import jwt

from config import get_settings
from models import User

logger = logging.getLogger("agropelink.auth")

_ALGORITHM = "HS256"
_PURPOSE = "password_reset"


@lru_cache
def _secret() -> str:
    settings = get_settings()
    if settings.jwt_secret is not None and len(settings.jwt_secret.get_secret_value()) >= 32:
        return settings.jwt_secret.get_secret_value()
    if settings.is_production:
        raise RuntimeError("JWT_SECRET (mín. 32 caracteres) es obligatorio en producción")
    logger.warning("JWT_SECRET no configurado: se usa un secreto temporal (los enlaces caducan al reiniciar)")
    return secrets.token_urlsafe(48)


def _fingerprint(user: User) -> str:
    return hmac.new(_secret().encode(), user.hashed_password.encode(), hashlib.sha256).hexdigest()[:32]


def create_reset_token(user: User) -> str:
    now = dt.datetime.now(dt.UTC)
    payload = {
        "sub": str(user.id),
        "typ": _PURPOSE,
        "pwd": _fingerprint(user),
        "iat": now,
        "exp": now + dt.timedelta(minutes=get_settings().password_reset_ttl_minutes),
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def user_id_from_token(token: str) -> int | None:
    """Id del usuario si la firma, la caducidad y el propósito son válidos; None en cualquier otro caso."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_ALGORITHM], options={"require": ["exp", "sub", "typ", "pwd"]})
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != _PURPOSE or not str(payload.get("sub", "")).isdigit():
        return None
    return int(payload["sub"])


def token_matches_password(token: str, user: User) -> bool:
    """El token se emitió para la contraseña vigente (no se ha usado ni cambiado después)."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return False
    return hmac.compare_digest(str(payload.get("pwd", "")), _fingerprint(user))
