from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import get_settings

settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")

_SSL_QUERY_KEYS = ("ssl_ca", "ssl_verify_cert", "ssl_verify_identity", "ssl_cert", "ssl_key")


def _ssl_ca(url: URL) -> str | None:
    """CA para TLS: DATABASE_SSL_CA o `ssl_ca` de la URL si el archivo existe; si no (p. ej. una ruta de Linux en
    Windows), el paquete de CA de `certifi`. TiDB Cloud siempre exige TLS aunque la URL no lo indique."""
    wanted = settings.database_ssl_ca or url.query.get("ssl_ca")
    if isinstance(wanted, tuple):
        wanted = wanted[0]
    if wanted and Path(wanted).is_file():
        return str(wanted)
    if wanted or "tidbcloud.com" in (url.host or ""):
        import certifi  # dependencia de httpx: gratuita y ya instalada

        return certifi.where()
    return None


def _engine_args() -> tuple[URL, dict]:
    url = make_url(settings.database_url)
    if _is_sqlite:
        # SQLite solo permite por defecto el hilo que creó la conexión; FastAPI usa varios.
        return url, {"connect_args": {"check_same_thread": False}}
    # MySQL / TiDB (mysql+pymysql://...): comprobar la conexión antes de usarla y renovarla antes de que el
    # servidor cierre las inactivas. TLS con verificación del certificado Y del nombre del servidor.
    options: dict = {"pool_pre_ping": True, "pool_recycle": 280, "pool_size": 5, "max_overflow": 10}
    ca = _ssl_ca(url)
    if ca:
        url = url.difference_update_query(_SSL_QUERY_KEYS)
        options["connect_args"] = {"ssl": {"ca": ca, "check_hostname": True}}
    return url, options


_url, _options = _engine_args()
engine = create_engine(_url, **_options)

if _is_sqlite:

    @event.listens_for(Engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        # SQLite no aplica claves foráneas salvo que se active por conexión.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: una sesión por petición, cerrada siempre al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
