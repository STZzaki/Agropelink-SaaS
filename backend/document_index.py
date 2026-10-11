"""Indexación documental: códigos de serie únicos `AGRO-<año>-<serie>-<nº>` (p. ej. AGRO-2026-FCT-0042)."""

from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import DOCUMENT_SERIES, Document, DocumentSequence
from security import utcnow


def next_reference(db: Session, year: int, series: str) -> str:
    """Reserva el siguiente número de la serie de forma atómica (UPDATE … SET last = last + 1)."""
    stmt = (
        update(DocumentSequence)
        .where(DocumentSequence.year == year, DocumentSequence.series == series)
        .values(last=DocumentSequence.last + 1)
        .returning(DocumentSequence.last)
    )
    number = db.scalar(stmt)
    if number is None:
        try:
            with db.begin_nested():
                db.execute(insert(DocumentSequence).values(year=year, series=series, last=1))
            number = 1
        except IntegrityError:  # otra petición creó el contador a la vez
            number = db.scalar(stmt)
    return f"AGRO-{year}-{series}-{number:04d}"


def assign_reference(db: Session, document: Document) -> str:
    year = document.fiscal_year or (document.accrual_date.year if document.accrual_date else utcnow().year)
    document.fiscal_year = year
    document.reference = next_reference(db, year, DOCUMENT_SERIES[document.doc_type])
    return document.reference


def reference_exists(db: Session, reference: str) -> bool:
    return db.scalar(select(Document.id).where(Document.reference == reference)) is not None
