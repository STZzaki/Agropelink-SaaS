"""Cálculo económico de una o varias fincas: consumo del presupuesto y desgloses (ORM, sin SQL crudo).

Fuentes del gasto de un año:
- Costes registrados (`Expense`): fijos iniciales y variables, opcionalmente imputados a una cosecha.
- Facturas archivadas en Documentos (no borradores), por su fecha de devengo.
- Gasto declarado a mano en fichas antiguas (`Farm.budget_spent`, sin desglose): solo cuenta en el año en curso.
"""

import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from models import Document, DocumentType, Expense, Farm

# Categoría de gasto que corresponde a cada tipo de factura.
INVOICE_CATEGORY: dict[DocumentType, str] = {
    DocumentType.INVOICE_FUEL: "fuel",
    DocumentType.INVOICE_PHYTO: "phytosanitary",
    DocumentType.INVOICE_SEEDS: "seeds",
    DocumentType.INVOICE_OTHER: "other",
}


def money(value: Decimal | float | None) -> float:
    return round(float(value or 0), 2)


def quarter_of(month: int) -> int:
    return (month - 1) // 3 + 1


def expense_rows(db: Session, farm_ids: Iterable[int], year: int):  # type: ignore[no-untyped-def]
    """(mes, categoría, cosecha, fijo, total) de los costes del año, agregados en la base de datos."""
    month = extract("month", Expense.incurred_on)
    return db.execute(
        select(month, Expense.category, Expense.harvest_id, Expense.is_fixed, func.sum(Expense.amount))
        .where(Expense.farm_id.in_(list(farm_ids)), extract("year", Expense.incurred_on) == year)
        .group_by(month, Expense.category, Expense.harvest_id, Expense.is_fixed)
    ).all()


def invoice_rows(db: Session, farm_ids: Iterable[int], year: int):  # type: ignore[no-untyped-def]
    """(mes, tipo, total) de las facturas archivadas del año por fecha de devengo."""
    month = extract("month", Document.accrual_date)
    return db.execute(
        select(month, Document.doc_type, func.sum(Document.amount))
        .where(
            Document.farm_id.in_(list(farm_ids)),
            Document.is_draft.is_(False),
            Document.doc_type.in_(list(INVOICE_CATEGORY)),
            Document.amount.is_not(None),
            extract("year", Document.accrual_date) == year,
        )
        .group_by(month, Document.doc_type)
    ).all()


def declared_spent(db: Session, farm_ids: Iterable[int], year: int) -> float:
    if year != dt.date.today().year:
        return 0.0
    return money(db.scalar(select(func.sum(Farm.budget_spent)).where(Farm.id.in_(list(farm_ids)))))


def consumed(db: Session, farm_ids: list[int], year: int) -> float:
    """Gasto total del año (costes + facturas + declarado). Lo usan los KPI del panel y la vista económica."""
    expenses = sum(money(row[4]) for row in expense_rows(db, farm_ids, year))
    invoices = sum(money(row[2]) for row in invoice_rows(db, farm_ids, year))
    return round(expenses + invoices + declared_spent(db, farm_ids, year), 2)


def yearly_totals(db: Session, farm_ids: list[int], years: list[int]) -> dict[int, float]:
    """Costes + facturas por año (sin el declarado, que no tiene fecha)."""
    totals: dict[int, float] = defaultdict(float)
    e_year = extract("year", Expense.incurred_on)
    for y, total in db.execute(
        select(e_year, func.sum(Expense.amount)).where(Expense.farm_id.in_(farm_ids), e_year.in_(years)).group_by(e_year)
    ):
        totals[int(y)] += money(total)
    d_year = extract("year", Document.accrual_date)
    for y, total in db.execute(
        select(d_year, func.sum(Document.amount))
        .where(
            Document.farm_id.in_(farm_ids),
            Document.is_draft.is_(False),
            Document.doc_type.in_(list(INVOICE_CATEGORY)),
            Document.amount.is_not(None),
            d_year.in_(years),
        )
        .group_by(d_year)
    ):
        totals[int(y)] += money(total)
    return totals
