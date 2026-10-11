"""Cuentas de prueba para desarrollo local (una por rol). Se niega a ejecutarse en producción.

Uso:  python dev_seed.py

Contraseña común de las cuentas de prueba: DEV_SEED_PASSWORD (variable de entorno) o el valor por
defecto de abajo. Son cuentas del subdominio `pruebas.agropelink.es`, sin buzón real.
"""

import os
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

import models  # noqa: F401
from config import get_settings
from database import engine
from db_migrations import sync_schema
from models import Farm, User, UserRole
from security import hash_password

DEV_PASSWORD = os.environ.get("DEV_SEED_PASSWORD", "Prueba#Agro2026")

ACCOUNTS = [
    ("admin@pruebas.agropelink.es", "Admin Pruebas", UserRole.ADMIN),
    ("agricultor@pruebas.agropelink.es", "Agricultor Pruebas", UserRole.FARMER),
    ("usuario@pruebas.agropelink.es", "Usuario Pruebas", UserRole.USER),
]


def main() -> int:
    if get_settings().is_production:
        print("dev_seed.py no se ejecuta en producción.", file=sys.stderr)
        return 1
    sync_schema(engine)
    with Session(engine) as db:
        for email, name, role in ACCOUNTS:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(email=email, name=name, hashed_password=hash_password(DEV_PASSWORD), role=role)
                db.add(user)
                db.flush()
            user.role = role
            user.warnings_count, user.pending_warning_ack, user.is_banned, user.banned_at, user.ban_reason = 0, False, False, None, None
            if role == UserRole.FARMER and not user.farms:
                db.add(Farm(name="Finca de Pruebas", location="Níjar, Almería", owner_id=user.id))
            print(f"{role.value:7} {email}")
        db.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
