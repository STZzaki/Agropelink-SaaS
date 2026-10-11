"""Sincronización mínima del esquema hasta introducir Alembic.

`create_all` crea tablas nuevas pero no altera las existentes. Aquí se añaden las columnas e índices
que falten. Las sentencias DDL se construyen solo a partir de los metadatos de los modelos (nunca
con datos de usuario), y cada columna añadida debe ser anulable o tener `server_default`.
"""

import logging

from sqlalchemy import Engine, inspect, select, text
from sqlalchemy.orm import Session

from database import Base

logger = logging.getLogger("agropelink.migrations")


# Columnas renombradas: (tabla, nombre antiguo, nombre nuevo).
_RENAMES = [("users", "strikes", "warnings_count")]


def sync_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, old, new in _RENAMES:
            columns = {c["name"] for c in inspector.get_columns(table)}
            if old in columns and new not in columns:
                conn.execute(text(f'ALTER TABLE "{table}" RENAME COLUMN "{old}" TO "{new}"'))
                logger.warning("Esquema: columna %s.%s renombrada a %s", table, old, new)
        inspector = inspect(conn)
        for table in Base.metadata.sorted_tables:
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                ddl_type = column.type.compile(dialect=engine.dialect)
                # Solo defaults literales: SQLite no admite expresiones (p. ej. now()) en ADD COLUMN;
                # esas columnas son anulables y quedan a NULL en las filas antiguas.
                default = ""
                server_default = getattr(column.server_default, "arg", None)
                if isinstance(server_default, str):
                    default = " DEFAULT '" + server_default.replace("'", "''") + "'"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl_type}{default}'))
                logger.warning("Esquema: añadida columna %s.%s", table.name, column.name)
            for index in table.indexes:
                index.create(conn, checkfirst=True)
    _backfill_document_references(engine)
    _reset_retired_avatars(engine)


def _reset_retired_avatars(engine: Engine) -> None:
    """El catálogo de avatares cambió (PNG sueltos → sprite de personajes): los valores antiguos ya no son
    válidos y romperían las respuestas; esas cuentas vuelven a mostrar sus iniciales."""
    from sqlalchemy import update

    from models import User
    from schemas import Avatar

    valid = set(Avatar.__args__)
    with Session(engine) as db:
        result = db.execute(update(User).where(User.avatar.is_not(None), User.avatar.not_in(valid)).values(avatar=None))
        if result.rowcount:
            db.commit()
            logger.warning("Esquema: %d avatares retirados del catálogo restablecidos a iniciales", result.rowcount)


def _backfill_document_references(engine: Engine) -> None:
    """Documentos anteriores a la indexación: se les asigna su código de serie."""
    from document_index import assign_reference  # import diferido: evita ciclo con models
    from models import Document

    with Session(engine) as db:
        pending = db.scalars(select(Document).where(Document.reference.is_(None), Document.is_draft.is_(False))).all()
        for document in pending:
            assign_reference(db, document)
        if pending:
            db.commit()
            logger.warning("Esquema: asignados %d códigos de serie a documentos existentes", len(pending))
