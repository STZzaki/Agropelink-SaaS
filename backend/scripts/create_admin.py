"""Crea o actualiza el super-administrador inicial de Agropelink (idempotente).

La contraseña NUNCA se escribe en el código ni en el repositorio. Se toma, por este orden, de:
  1. --password-stdin   (p. ej.  printf '%s' "$PASS" | python scripts/create_admin.py --password-stdin)
  2. la variable de entorno ADMIN_PASSWORD
  3. un prompt interactivo oculto (getpass)

Uso:
    python scripts/create_admin.py                              # info@agropelink.es · "Zakaryae"
    python scripts/create_admin.py --email otro@agropelink.es --name "Nombre"

Si la cuenta existe: pasa a rol admin, se reactiva (sin bloqueo ni advertencias) y se actualiza la contraseña.
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

# Permite ejecutar el script desde cualquier directorio.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)  # `.env` y la BD SQLite relativa se resuelven desde backend/

from pydantic import EmailStr, TypeAdapter, ValidationError  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import models  # noqa: E402, F401
from database import engine  # noqa: E402
from db_migrations import sync_schema  # noqa: E402
from models import User, UserRole  # noqa: E402
from schemas import validate_password_strength  # noqa: E402
from security import hash_password  # noqa: E402

DEFAULT_EMAIL = "info@agropelink.es"
DEFAULT_NAME = "Zakaryae"


def read_password(from_stdin: bool) -> str:
    if from_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    if os.environ.get("ADMIN_PASSWORD"):
        return os.environ["ADMIN_PASSWORD"]
    first = getpass.getpass("Contraseña del administrador: ")
    if getpass.getpass("Repite la contraseña: ") != first:
        raise SystemExit("Las contraseñas no coinciden.")
    return first


def main() -> int:
    parser = argparse.ArgumentParser(description="Crea o actualiza el administrador inicial")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--name", default=DEFAULT_NAME)
    parser.add_argument("--password-stdin", action="store_true", help="Lee la contraseña de la entrada estándar")
    args = parser.parse_args()

    try:
        email = str(TypeAdapter(EmailStr).validate_python(args.email.strip().lower()))
    except ValidationError:
        print(f"Email no válido: {args.email!r}", file=sys.stderr)
        return 1
    password = read_password(args.password_stdin)
    if not 8 <= len(password) <= 128:
        print("La contraseña debe tener entre 8 y 128 caracteres.", file=sys.stderr)
        return 1
    try:
        validate_password_strength(password)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    sync_schema(engine)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        created = user is None
        if created:
            user = User(email=email, name=args.name.strip()[:100] or DEFAULT_NAME, hashed_password="")
            db.add(user)
        user.hashed_password = hash_password(password)  # Argon2id
        user.role = UserRole.ADMIN
        user.is_banned = False
        user.banned_at = None
        user.ban_reason = None
        user.warnings_count = 0
        user.pending_warning_ack = False
        db.commit()
        print(f"Administrador {'creado' if created else 'actualizado'}: #{user.id} {user.email} ({user.name}) · rol admin · activo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
