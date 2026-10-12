"""Restablece la contraseña de una cuenta (uso administrativo puntual).

Uso:  python fix_pass.py usuario@dominio.es

Usa la conexión de la app (`DATABASE_URL` en .env): sin credenciales en el código. La nueva contraseña se pide por
teclado sin mostrarse (o, si se deja vacía, se genera una aleatoria y robusta) y se guarda solo como hash Argon2id.
Además cierra las sesiones abiertas de esa cuenta.
"""

import getpass
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import models  # noqa: F401
from database import engine
from models import User, UserSession
from security import hash_password
from seed import strong_password


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    email = sys.argv[1].strip().lower()
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"No existe ninguna cuenta con el email {email}.", file=sys.stderr)
            return 1
        password = getpass.getpass("Nueva contraseña (vacía = generar una aleatoria): ")
        generated = not password
        if generated:
            password = strong_password()
        elif len(password) < 12:
            print("Mínimo 12 caracteres.", file=sys.stderr)
            return 1
        user.hashed_password = hash_password(password)
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        db.commit()
    print(f"Contraseña actualizada para {email}; sesiones abiertas cerradas.")
    if generated:
        print(f"Contraseña generada (se muestra una sola vez): {password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
