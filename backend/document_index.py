"""Indexación documental: códigos de serie únicos `AGRO-<año>-<serie>-<nº>` (p. ej. AGRO-2026-FCT-0042)."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import DOCUMENT_SERIES, Document, DocumentSequence
from security import utcnow


def _locked_sequence(db: Session, year: int, series: str) -> DocumentSequence | None:
    # SELECT … FOR UPDATE: bloquea la fila hasta el fin de la transacción (MySQL/TiDB; SQLite lo omite y ya
    # serializa las escrituras). populate_existing relee el valor real aunque el objeto ya estuviera en la sesión.
    return db.scalar(
        select(DocumentSequence)
        .where(DocumentSequence.year == year, DocumentSequence.series == series)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def next_reference(db: Session, year: int, series: str) -> str:
    """Reserva el siguiente número de la serie. Compatible con MySQL/TiDB (sin RETURNING): lee la fila bloqueada,
    incrementa en Python y hace flush; el commit lo decide quien llama."""
    seq = _locked_sequence(db, year, series)
    if seq is None:
        try:
            with db.begin_nested():  # savepoint: si otra petición creó el contador a la vez, solo se deshace esto
                db.add(DocumentSequence(year=year, series=series, last=1))
            return f"AGRO-{year}-{series}-0001"
        except IntegrityError:
            seq = _locked_sequence(db, year, series)
    seq.last = (seq.last or 0) + 1
    db.flush()
    return f"AGRO-{year}-{series}-{seq.last:04d}"


def assign_reference(db: Session, document: Document) -> str:
    year = document.fiscal_year or (document.accrual_date.year if document.accrual_date else utcnow().year)
    document.fiscal_year = year
    document.reference = next_reference(db, year, DOCUMENT_SERIES[document.doc_type])
    return document.reference


def reference_exists(db: Session, reference: str) -> bool:
    return db.scalar(select(Document.id).where(Document.reference == reference)) is not None
