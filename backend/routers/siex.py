"""Borrador del cuaderno de explotación (SIEX) a partir de los datos de la finca.

Hoy la recopilación es LOCAL y determinista (sin IA ni terceros): agua, insumos, tratamientos, labores y
cosechas del año, más una lista de comprobaciones de lo que falta. La respuesta ya tiene la forma que
consumirá el agente IA cuando se conecte (`engine` indicará entonces el modelo usado).
"""

import datetime as dt
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

import finance
from deps import DbSession, FarmerUser, get_owned_farm
from models import Document, Expense, Farm, SensorReading, Task, TaskStatus, Worker
from security import utcnow

router = APIRouter(prefix="/farms", tags=["siex"])

TREATMENT_CATEGORIES = ("treatment", "fertilization")


class SiexHarvest(BaseModel):
    name: str
    surface_ha: float | None
    plant_count: int | None
    start_date: dt.date | None
    end_date: dt.date | None


class SiexWaterMonth(BaseModel):
    month: int
    liters: float


class SiexProduct(BaseModel):
    name: str
    kind: str
    registry: str | None


class SiexOperation(BaseModel):
    task_id: int
    date: dt.date
    end_date: dt.date | None
    category: str
    title: str
    status: str
    worker: str | None
    worker_position: str | None


class SiexSpend(BaseModel):
    category: str
    amount: float


class SiexCheck(BaseModel):
    level: str  # warning | info
    message: str


class SiexDraft(BaseModel):
    farm: dict[str, object]
    year: int
    generated_at: dt.datetime
    engine: str
    # Redacción del asistente (resumen y pasos priorizados). Vacío si no se pidió asistencia.
    narrative: str | None = None
    next_steps: list[str] = []
    sources: list[str]
    harvests: list[SiexHarvest]
    water: list[SiexWaterMonth]
    water_total_liters: float
    products: list[SiexProduct]
    treatments: list[SiexOperation]
    operations: list[SiexOperation]
    input_spend: list[SiexSpend]
    checks: list[SiexCheck]


@router.get("/{farm_id}/siex/draft", response_model=SiexDraft)
async def siex_draft(
    farm_id: int,
    db: DbSession,
    user: FarmerUser,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    assist: Annotated[bool, Query(description="Añade la redacción del agente (resumen y próximos pasos)")] = False,
) -> SiexDraft:
    farm = get_owned_farm(db, farm_id, user)
    draft = build_draft(db, farm, year or dt.date.today().year)
    if assist:
        import agent_service  # import diferido: el agente usa este módulo

        draft = await agent_service.assist_siex(draft)
    return draft


def build_draft(db: Session, farm: Farm, year: int) -> SiexDraft:
    """Borrador SIEX de una finca (ya autorizada por el llamador). Solo lecturas ORM."""
    first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)

    # Agua: lecturas de riego (manuales o IoT) agregadas por mes.
    month = extract("month", SensorReading.recorded_on)
    water_rows = db.execute(
        select(month, func.sum(SensorReading.water_liters))
        .where(SensorReading.farm_id == farm.id, SensorReading.recorded_on.between(first, last))
        .group_by(month)
    ).all()
    water = {int(m): float(total or 0) for m, total in water_rows}

    # Labores del año (las que se solapan con el año), con su trabajador/aplicador.
    rows = db.execute(
        select(Task, Worker.name, Worker.position)
        .outerjoin(Worker, Task.worker_id == Worker.id)
        .where(Task.farm_id == farm.id, Task.date <= last, func.coalesce(Task.end_date, Task.date) >= first)
        .order_by(Task.date, Task.id)
    ).all()
    operations = [
        SiexOperation(
            task_id=t.id, date=t.date, end_date=t.end_date, category=t.category, title=t.title,
            status=t.status.value, worker=name, worker_position=position,
        )
        for t, name, position in rows
    ]
    treatments = [op for op in operations if op.category in TREATMENT_CATEGORIES]

    # Gasto en insumos (costes registrados + facturas) del año.
    spend: dict[str, float] = defaultdict(float)
    for _m, category, _h, _f, total in finance.expense_rows(db, [farm.id], year):
        if category in ("seeds", "fertilizers", "phytosanitary"):
            spend[category] += finance.money(total)
    for _m, doc_type, total in finance.invoice_rows(db, [farm.id], year):
        category = finance.INVOICE_CATEGORY[doc_type]
        if category in ("seeds", "phytosanitary"):
            spend[category] += finance.money(total)

    products = [SiexProduct(name=i.get("name", ""), kind=i.get("kind", ""), registry=i.get("registry")) for i in farm.inputs or []]
    harvests = [
        SiexHarvest(name=h.name, surface_ha=float(h.surface_ha) if h.surface_ha else None, plant_count=h.plant_count, start_date=h.start_date, end_date=h.end_date)
        for h in farm.harvests
    ]

    checks: list[SiexCheck] = []
    if not water:
        checks.append(SiexCheck(level="warning", message="No hay lecturas de agua de riego en el año: regístralas en el panel o conecta los caudalímetros."))
    phyto = [p for p in products if p.kind == "phytosanitary"]
    if any(not p.registry for p in phyto):
        checks.append(SiexCheck(level="warning", message="Hay fitosanitarios sin nº de registro: el cuaderno lo exige para cada tratamiento."))
    if any(op.worker is None for op in treatments):
        checks.append(SiexCheck(level="warning", message="Hay tratamientos sin aplicador asignado: asígnalos a un trabajador (preferiblemente con puesto «aplicador»)."))
    if treatments and not phyto:
        checks.append(SiexCheck(level="warning", message="Hay tratamientos pero ningún fitosanitario en la ficha de la finca: añade los productos usados."))
    if not harvests:
        checks.append(SiexCheck(level="info", message="La finca no tiene cosechas definidas (cultivo, superficie y periodo)."))
    pending = sum(1 for op in treatments if op.status != TaskStatus.DONE.value)
    if pending:
        checks.append(SiexCheck(level="info", message=f"{pending} tratamiento(s) del año aún no están marcados como realizados."))
    undated = db.scalar(
        select(func.count(Document.id)).where(Document.farm_id == farm.id, Document.is_draft.is_(False), Document.accrual_date.is_(None), Document.fiscal_year == year)
    )
    if undated:
        checks.append(SiexCheck(level="info", message=f"{undated} documento(s) del año sin fecha de devengo."))

    expenses_count = db.scalar(select(func.count(Expense.id)).where(Expense.farm_id == farm.id, extract("year", Expense.incurred_on) == year)) or 0
    return SiexDraft(
        farm={"name": farm.name, "location": farm.location, "surface_ha": float(farm.surface_ha) if farm.surface_ha else None, "harvest_mode": farm.harvest_mode},
        year=year,
        generated_at=utcnow().replace(tzinfo=dt.UTC),
        engine="local",  # cuando se conecte el agente IA: identificador del modelo
        sources=[
            f"{len(water_rows)} mes(es) con lecturas de agua",
            f"{len(operations)} labor(es) del año",
            f"{len(products)} producto(s) en la ficha",
            f"{expenses_count} coste(s) registrados",
        ],
        harvests=harvests,
        water=[SiexWaterMonth(month=m, liters=round(water.get(m, 0.0), 1)) for m in range(1, 13)],
        water_total_liters=round(sum(water.values()), 1),
        products=products,
        treatments=treatments,
        operations=operations,
        input_spend=[SiexSpend(category=k, amount=round(v, 2)) for k, v in sorted(spend.items(), key=lambda kv: -kv[1])],
        checks=checks,
    )
