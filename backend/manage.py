"""Tareas de administración desde la consola del servidor (nunca expuestas por HTTP).

Uso:
    python manage.py set-role <email> <admin|farmer|user>
    python manage.py list-admins

El primer administrador solo puede crearse así: la API no permite que nadie se asigne un rol.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

import models  # noqa: F401  (registra los modelos)
from database import engine
from db_migrations import sync_schema
from models import User, UserRole


def set_role(email: str, role: str) -> int:
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            print(f"No existe ninguna cuenta con el email {email!r}. Regístrala primero desde la web.", file=sys.stderr)
            return 1
        user.role = UserRole(role)
        db.commit()
        print(f"{user.email}: rol actualizado a '{user.role.value}'.")
    return 0


def list_admins() -> int:
    with Session(engine) as db:
        for user in db.scalars(select(User).where(User.role == UserRole.ADMIN).order_by(User.id)):
            print(f"#{user.id}  {user.email}  ({user.name})")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Administración de Agropelink")
    sub = parser.add_subparsers(dest="command", required=True)
    p_role = sub.add_parser("set-role", help="Asigna un rol a una cuenta existente")
    p_role.add_argument("email")
    p_role.add_argument("role", choices=[r.value for r in UserRole])
    sub.add_parser("list-admins", help="Lista los administradores")
    args = parser.parse_args()

    sync_schema(engine)
    if args.command == "set-role":
        return set_role(args.email, args.role)
    return list_admins()


if __name__ == "__main__":
    raise SystemExit(main())
