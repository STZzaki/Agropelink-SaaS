"""Entorno aislado para los tests: BD y almacenamiento temporales, clave de Gemini falsa.

Las variables de entorno tienen prioridad sobre `.env`, así que los tests nunca tocan la BD real
ni llaman a Gemini con la clave real.
"""

import gc
import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="agropelink-tests-"))
os.environ.update(
    {
        "ENVIRONMENT": "development",
        "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
        "UPLOAD_DIR": str(_TMP / "storage" / "documents"),
        "FORUM_MEDIA_DIR": str(_TMP / "storage" / "forum_media"),
        "FARM_PHOTO_DIR": str(_TMP / "storage" / "farm_photos"),
        "COOKIE_SECURE": "true",
        "GEMINI_API_KEY": "AIzaFAKE_TEST_KEY_0123456789abcdefghijk",
        "SMTP_HOST": "",
        "CORS_ORIGINS": '["http://localhost:5173"]',
    }
)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from sqlalchemy import select  # noqa: E402

from database import SessionLocal  # noqa: E402
from main import app  # noqa: E402
from models import User, UserRole  # noqa: E402
from ratelimit import SlidingWindowLimiter  # noqa: E402

FAKE_KEY = os.environ["GEMINI_API_KEY"]
CSRF = {"X-Requested-With": "XMLHttpRequest"}
PASSWORD = "Campo#Seguro2026"
ADULT = "1990-05-17"  # fecha de nacimiento válida (mayor de 18)
_ids = itertools.count(1)


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Cada test empieza con los limitadores vacíos (son estado en memoria del proceso)."""
    for obj in gc.get_objects():
        if isinstance(obj, SlidingWindowLimiter):
            obj._events.clear()
    yield


@pytest.fixture(scope="session")
def _app():
    with TestClient(app, base_url="https://testserver"):  # ejecuta el lifespan una vez (crea tablas)
        yield app


@pytest.fixture
def client(_app):
    """Cliente anónimo por HTTPS (la cookie lleva Secure) con la cabecera anti-CSRF."""
    return TestClient(_app, base_url="https://testserver", headers=CSRF)


def set_role(email: str, role: UserRole) -> None:
    """Equivale a `manage.py set-role`: la API no permite que nadie se asigne un rol."""
    with SessionLocal() as db:
        db.scalar(select(User).where(User.email == email)).role = role
        db.commit()


def make_user(app_, name="Usuario", role: UserRole = UserRole.FARMER):
    """Registra e inicia sesión con un usuario nuevo (por defecto agricultor). Devuelve (cliente autenticado, email)."""
    c = TestClient(app_, base_url="https://testserver", headers=CSRF)
    email = f"user{next(_ids)}@finca-test.es"
    assert c.post("/api/v1/auth/register", json={"name": name, "email": email, "password": PASSWORD, "birth_date": ADULT}).status_code == 202
    if role != UserRole.USER:
        set_role(email, role)
    r = c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return c, email


@pytest.fixture
def user(_app):
    return make_user(_app, "Ana")[0]


@pytest.fixture
def other_user(_app):
    return make_user(_app, "Bea")[0]


@pytest.fixture
def std_user(_app):
    """Usuario estándar recién registrado (rol `user`)."""
    return make_user(_app, "Carla", UserRole.USER)[0]


@pytest.fixture
def admin(_app):
    return make_user(_app, "Admin", UserRole.ADMIN)[0]
