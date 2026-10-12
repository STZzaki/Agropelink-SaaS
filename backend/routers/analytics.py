"""Analítica del panel del agricultor: KPIs, agua vs humedad (lecturas reales) y gasto en insumos por mes.

Todo se calcula con datos del propio usuario (ORM, sin SQL crudo). No hay datos inventados: si no hay
lecturas o facturas, las series vuelven vacías o a cero y el frontend muestra el estado vacío.
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import extract, func, select

import finance
from deps import DbSession, FarmerUser, get_owned_farm
from models import Document, DocumentType, Farm, SensorReading, Task, TaskStatus
from schemas import AnalyticsKpis, AnalyticsOverview, MonthlySpendPoint, WaterMoisturePoint

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Insumos de cultivo: facturas de fitosanitarios (incluye abonos/fertilizantes) y de semillas.
_INPUT_TYPES = (DocumentType.INVOICE_PHYTO, DocumentType.INVOICE_SEEDS)


def _f(value) -> float:  # type: ignore[no-untyped-def]
    return float(value or 0)


@router.get("/overview", response_model=AnalyticsOverview)
def overview(
    db: DbSession,
    user: FarmerUser,
    farm_id: Annotated[int | None, Query(gt=0)] = None,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
) -> AnalyticsOverview:
    if farm_id is not None:
        get_owned_farm(db, farm_id, user)  # IDOR: 404 si no es suya
    farm_ids = select(Farm.id).where(Farm.owner_id == user.id)
    if farm_id is not None:
        farm_ids = farm_ids.where(Farm.id == farm_id)
    farm_scope = Farm.id.in_(farm_ids)

    today = dt.date.today()
    year = today.year
    since = today - dt.timedelta(days=days - 1)

    # Agua (suma diaria) y humedad (media diaria) de todas las fincas del ámbito.
    rows = db.execute(
        select(SensorReading.recorded_on, func.sum(SensorReading.water_liters), func.avg(SensorReading.soil_moisture_pct))
        .where(SensorReading.farm_id.in_(farm_ids), SensorReading.recorded_on >= since)
        .group_by(SensorReading.recorded_on)
        .order_by(SensorReading.recorded_on)
    ).all()
    series = [
        WaterMoisturePoint(
            date=d,
            water_liters=round(float(w), 1) if w is not None else None,
            soil_moisture_pct=round(float(m), 1) if m is not None else None,
        )
        for d, w, m in rows
    ]

    # Gasto mensual en insumos (facturas archivadas): año actual vs anterior, por fecha de devengo.
    month = extract("month", Document.accrual_date)
    yr = extract("year", Document.accrual_date)
    spend = db.execute(
        select(yr, month, func.sum(Document.amount))
        .where(
            Document.farm_id.in_(farm_ids),
            Document.is_draft.is_(False),
            Document.doc_type.in_(_INPUT_TYPES),
            Document.accrual_date.is_not(None),
            yr.in_([year, year - 1]),
        )
        .group_by(yr, month)
    ).all()
    by_month = {(int(y), int(mo)): _f(total) for y, mo, total in spend}
    inputs_spend = [
        MonthlySpendPoint(month=mo, this_year=round(by_month.get((year, mo), 0.0), 2), last_year=round(by_month.get((year - 1, mo), 0.0), 2))
        for mo in range(1, 13)
    ]
    current_month = today.month
    ytd = sum(p.this_year for p in inputs_spend if p.month <= current_month)
    prev_ytd = sum(p.last_year for p in inputs_spend if p.month <= current_month)

    farms = db.execute(select(func.count(Farm.id), func.sum(Farm.surface_ha), func.sum(Farm.budget_total)).where(farm_scope)).one()
    # Presupuesto consumido = costes registrados + facturas + gasto declarado: mismo cálculo que la vista económica.
    budget_consumed = finance.consumed(db, list(db.scalars(farm_ids)), year)
    pending = db.scalar(
        select(func.count(Task.id)).where(Task.farm_id.in_(farm_ids), Task.status != TaskStatus.DONE)
    )
    docs_year = db.scalar(
        select(func.count(Document.id)).where(Document.farm_id.in_(farm_ids), Document.is_draft.is_(False), Document.fiscal_year == year)
    )
    water_30 = db.scalar(
        select(func.sum(SensorReading.water_liters)).where(
            SensorReading.farm_id.in_(farm_ids), SensorReading.recorded_on >= today - dt.timedelta(days=29)
        )
    )
    moisture_7 = db.scalar(
        select(func.avg(SensorReading.soil_moisture_pct)).where(
            SensorReading.farm_id.in_(farm_ids), SensorReading.recorded_on >= today - dt.timedelta(days=6)
        )
    )

    return AnalyticsOverview(
        year=year,
        water_vs_moisture=series,
        inputs_spend=inputs_spend,
        kpis=AnalyticsKpis(
            farms=farms[0] or 0,
            surface_ha=round(_f(farms[1]), 2),
            pending_tasks=pending or 0,
            documents_this_year=docs_year or 0,
            water_liters_30d=round(_f(water_30), 1),
            avg_moisture_7d=round(float(moisture_7), 1) if moisture_7 is not None else None,
            inputs_spend_ytd=round(ytd, 2),
            inputs_spend_prev_ytd=round(prev_ytd, 2),
            budget_total=round(_f(farms[2]), 2),
            budget_spent=budget_consumed,
        ),
    )
