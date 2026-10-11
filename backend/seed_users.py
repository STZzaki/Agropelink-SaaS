"""Usuarios de prueba de Agropelink (uno por rol). Solo para desarrollo: se niega a ejecutarse en producción.

Uso:  python seed_users.py

Inserta cada usuario solo si su email no existe (no sobrescribe cuentas ni contraseñas ya creadas).
Las contraseñas se guardan únicamente como hash Argon2id.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

import models  # noqa: F401  (registra los modelos)
from config import get_settings
from database import engine
from db_migrations import sync_schema
from models import User, UserRole
from security import hash_password

# Cuentas de prueba: no reutilizar estas contraseñas en producción.
SEED_USERS = [
    {"name": "admin", "email": "admin@agropelink.es", "password": "@admin12345", "role": UserRole.ADMIN},
    {"name": "fran", "email": "fran@agropelink.es", "password": "@fran12345", "role": UserRole.FARMER},
    {"name": "julio", "email": "julio@agropelink.es", "password": "@julio12345", "role": UserRole.USER},
]


def main() -> int:
    if get_settings().is_production:
        print("seed_users.py no se ejecuta en producción.", file=sys.stderr)
        return 1
    sync_schema(engine)
    with Session(engine) as db:
        for spec in SEED_USERS:
            if db.scalar(select(User.id).where(User.email == spec["email"])) is not None:
                print(f"= ya existe   {spec['role'].value:7} {spec['email']}")
                continue
            db.add(
                User(
                    name=spec["name"],
                    email=spec["email"],
                    hashed_password=hash_password(spec["password"]),  # Argon2id
                    role=spec["role"],
                )
            )
            print(f"+ creado      {spec['role'].value:7} {spec['email']}")
        db.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
