from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import get_settings

settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")


def _engine_options() -> dict:
    if _is_sqlite:
        # SQLite solo permite por defecto el hilo que creó la conexión; FastAPI usa varios.
        return {"connect_args": {"check_same_thread": False}}
    # MySQL / TiDB (mysql+pymysql://...): comprobar la conexión antes de usarla y renovarla antes de que el
    # servidor cierre las inactivas. TiDB Cloud exige TLS: CA en DATABASE_SSL_CA (se verifica el certificado).
    options: dict = {"pool_pre_ping": True, "pool_recycle": 280, "pool_size": 5, "max_overflow": 10}
    if settings.database_ssl_ca:
        options["connect_args"] = {"ssl": {"ca": settings.database_ssl_ca, "check_hostname": True}}
    return options


engine = create_engine(settings.database_url, **_engine_options())

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
