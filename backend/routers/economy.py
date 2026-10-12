"""Cosechas, costes y vista económica de cada finca (presupuesto consumido, trimestres, años, categorías)."""

import datetime as dt
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import extract, func, select

import finance
from deps import DbSession, FarmerUser, get_owned_farm
from models import Document, Expense, Farm, Harvest
from schemas import (
    MAX_HARVESTS,
    ExpenseCategory,
    ExpenseCreate,
    ExpenseResponse,
    FinanceAmount,
    FinanceBudget,
    FinanceHarvest,
    FinanceOverview,
    FinanceQuarter,
    FinanceYear,
    HarvestIn,
    HarvestResponse,
)

router = APIRouter(prefix="/farms", tags=["economy"])

MAX_EXPENSES_PER_FARM = 20_000


def _owned_harvest(db: DbSession, farm: Farm, harvest_id: int) -> Harvest:
    harvest = db.scalar(select(Harvest).where(Harvest.id == harvest_id, Harvest.farm_id == farm.id))
    if harvest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Harvest not found")
    return harvest


# --- Cosechas ------------------------------------------------------------------------------------------


@router.get("/{farm_id}/harvests", response_model=list[HarvestResponse])
def list_harvests(farm_id: int, db: DbSession, user: FarmerUser) -> list[Harvest]:
    return get_owned_farm(db, farm_id, user).harvests


@router.post("/{farm_id}/harvests", response_model=HarvestResponse, status_code=status.HTTP_201_CREATED)
def create_harvest(farm_id: int, payload: HarvestIn, db: DbSession, user: FarmerUser) -> Harvest:
    farm = get_owned_farm(db, farm_id, user)
    count = len(farm.harvests)
    if farm.harvest_mode == "single" and count >= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La finca es de cosecha única: cámbiala a «varias cosechas» para añadir otra.")
    if count >= MAX_HARVESTS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Máximo {MAX_HARVESTS} cosechas por finca.")
    harvest = Harvest(farm_id=farm.id, **payload.model_dump())
    db.add(harvest)
    db.commit()
    db.refresh(harvest)
    return harvest


@router.put("/{farm_id}/harvests/{harvest_id}", response_model=HarvestResponse)
def update_harvest(farm_id: int, harvest_id: int, payload: HarvestIn, db: DbSession, user: FarmerUser) -> Harvest:
    harvest = _owned_harvest(db, get_owned_farm(db, farm_id, user), harvest_id)
    for field, value in payload.model_dump().items():
        setattr(harvest, field, value)
    db.commit()
    db.refresh(harvest)
    return harvest


@router.delete("/{farm_id}/harvests/{harvest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_harvest(farm_id: int, harvest_id: int, db: DbSession, user: FarmerUser) -> Response:
    """Los costes imputados a la cosecha se conservan (pasan a «sin cosecha asignada»): el gasto existió."""
    harvest = _owned_harvest(db, get_owned_farm(db, farm_id, user), harvest_id)
    for expense in db.scalars(select(Expense).where(Expense.harvest_id == harvest.id)):
        expense.harvest_id = None
    db.delete(harvest)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Costes --------------------------------------------------------------------------------------------


@router.get("/{farm_id}/expenses", response_model=list[ExpenseResponse])
def list_expenses(
    farm_id: int,
    db: DbSession,
    user: FarmerUser,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    category: ExpenseCategory | None = None,
    harvest_id: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Expense]:
    get_owned_farm(db, farm_id, user)
    stmt = select(Expense).where(Expense.farm_id == farm_id)
    if year is not None:
        stmt = stmt.where(extract("year", Expense.incurred_on) == year)
    if category is not None:
        stmt = stmt.where(Expense.category == category)
    if harvest_id is not None:
        stmt = stmt.where(Expense.harvest_id == harvest_id)
    stmt = stmt.order_by(Expense.incurred_on.desc(), Expense.id.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.post("/{farm_id}/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(farm_id: int, payload: ExpenseCreate, db: DbSession, user: FarmerUser) -> Expense:
    farm = get_owned_farm(db, farm_id, user)
    if payload.harvest_id is not None:
        _owned_harvest(db, farm, payload.harvest_id)  # IDOR: la cosecha debe ser de ESTA finca
    count = db.scalar(select(func.count(Expense.id)).where(Expense.farm_id == farm.id)) or 0
    if count >= MAX_EXPENSES_PER_FARM:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Se ha alcanzado el máximo de costes de la finca.")
    expense = Expense(farm_id=farm.id, **payload.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{farm_id}/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(farm_id: int, expense_id: int, db: DbSession, user: FarmerUser) -> Response:
    get_owned_farm(db, farm_id, user)
    expense = db.scalar(select(Expense).where(Expense.id == expense_id, Expense.farm_id == farm_id))
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    db.delete(expense)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Vista económica -----------------------------------------------------------------------------------


@router.get("/{farm_id}/finance", response_model=FinanceOverview)
def finance_overview(
    farm_id: int,
    db: DbSession,
    user: FarmerUser,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
) -> FinanceOverview:
    """Presupuesto anual consumido con su desglose exacto, y gasto por trimestre, categoría, cosecha y año."""
    farm = get_owned_farm(db, farm_id, user)
    year = year or dt.date.today().year
    ids = [farm.id]

    quarters = {q: {"fixed": 0.0, "variable": 0.0, "invoices": 0.0} for q in range(1, 5)}
    categories: dict[str, float] = defaultdict(float)
    by_harvest: dict[int | None, float] = defaultdict(float)
    fixed = variable = invoices = 0.0

    for month, category, harvest_id, is_fixed, total in finance.expense_rows(db, ids, year):
        amount = finance.money(total)
        quarters[finance.quarter_of(int(month))]["fixed" if is_fixed else "variable"] += amount
        categories[category] += amount
        by_harvest[harvest_id] += amount
        if is_fixed:
            fixed += amount
        else:
            variable += amount
    for month, doc_type, total in finance.invoice_rows(db, ids, year):
        amount = finance.money(total)
        quarters[finance.quarter_of(int(month))]["invoices"] += amount
        categories[finance.INVOICE_CATEGORY[doc_type]] += amount
        invoices += amount

    declared = finance.declared_spent(db, ids, year)
    consumed = round(fixed + variable + invoices + declared, 2)
    total = float(farm.budget_total) if farm.budget_total is not None else None

    harvests = {h.id: h for h in farm.harvests}
    harvest_rows = []
    for hid, amount in sorted(by_harvest.items(), key=lambda kv: -kv[1]):
        h = harvests.get(hid) if hid is not None else None
        surface = float(h.surface_ha) if h and h.surface_ha else None
        harvest_rows.append(
            FinanceHarvest(
                harvest_id=hid,
                name=h.name if h else "Sin cosecha asignada",
                amount=round(amount, 2),
                surface_ha=surface,
                cost_per_ha=round(amount / surface, 2) if surface else None,
            )
        )

    years = list(range(year - 4, year + 1))
    yearly = finance.yearly_totals(db, ids, years)
    undated = db.scalar(
        select(func.count(Document.id)).where(
            Document.farm_id == farm.id,
            Document.is_draft.is_(False),
            Document.doc_type.in_(list(finance.INVOICE_CATEGORY)),
            Document.accrual_date.is_(None),
            Document.fiscal_year == year,
        )
    )

    return FinanceOverview(
        farm_id=farm.id,
        year=year,
        budget=FinanceBudget(
            total=total,
            fixed=round(fixed, 2),
            variable=round(variable, 2),
            invoices=round(invoices, 2),
            declared=declared,
            consumed=consumed,
            remaining=round(total - consumed, 2) if total is not None else None,
            consumed_pct=round(consumed / total * 100, 1) if total else None,
        ),
        by_quarter=[FinanceQuarter(quarter=q, **{k: round(v, 2) for k, v in parts.items()}) for q, parts in quarters.items()],
        by_category=[FinanceAmount(key=k, amount=round(v, 2)) for k, v in sorted(categories.items(), key=lambda kv: -kv[1])],
        by_harvest=harvest_rows,
        by_year=[FinanceYear(year=y, amount=round(yearly.get(y, 0.0), 2)) for y in years],
        undated_invoices=undated or 0,
    )
