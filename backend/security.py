"""Primitivas criptográficas: hashing de contraseñas (Argon2id) y tokens de sesión."""

import datetime as dt
import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Parámetros por defecto de argon2-cffi (Argon2id, RFC 9106 perfil "low memory").
_hasher = PasswordHasher()

# Hash de una contraseña aleatoria: se verifica contra él cuando el email no existe,
# para que el tiempo de respuesta no revele si una cuenta está registrada.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def new_session_token() -> str:
    """Token opaco de 256 bits para la cookie de sesión."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """En BD solo se guarda el hash: una fuga de la tabla no permite suplantar sesiones."""
    return hashlib.sha256(token.encode()).hexdigest()


def utcnow() -> dt.datetime:
    """UTC sin tzinfo: SQLite no conserva zonas horarias y así las comparaciones son coherentes."""
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)
