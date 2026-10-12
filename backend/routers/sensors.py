"""Sensores en directo de cada finca: alta/baja, ingesta de lecturas y series agregadas para el panel.

Las series se devuelven ya agregadas en tramos (media por tramo): el navegador recibe ~100 puntos por sensor
sea cual sea la frecuencia de muestreo, y el sondeo cada 30 s del panel es barato para servidor y cliente.
"""

import datetime as dt
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from deps import DbSession, FarmerUser, get_owned_farm
from models import Sensor, SensorSample
from schemas import SensorCreate, SensorResponse, SensorSamplesCreate, SensorSeries, SensorSeriesResponse
from security import utcnow
from sensor_catalog import CATALOG

router = APIRouter(prefix="/farms", tags=["sensors"])

MAX_SENSORS_PER_FARM = 50
# Ventana → tamaño del tramo de agregación (minutos): 72, 96 y 84 puntos respectivamente.
WINDOWS: dict[int, int] = {6: 5, 24: 15, 168: 120}
# Tope de filas leídas por consulta de series (protege memoria si un dispositivo muestrea muy rápido).
MAX_ROWS = 200_000


def _as_utc(value: dt.datetime) -> dt.datetime:
    return value.replace(tzinfo=dt.UTC)


def _to_response(sensor: Sensor, last: tuple[float, dt.datetime] | None) -> SensorResponse:
    spec = CATALOG[sensor.kind]
    return SensorResponse(
        id=sensor.id,
        farm_id=sensor.farm_id,
        name=sensor.name,
        kind=sensor.kind,
        label=spec.label,
        unit=spec.unit,
        zone=sensor.zone,
        optimal=spec.optimal,
        decimals=spec.decimals,
        last_value=last[0] if last else None,
        last_at=_as_utc(last[1]) if last else None,
    )


def _owned_sensor(db: DbSession, farm_id: int, sensor_id: int, user: FarmerUser) -> Sensor:
    get_owned_farm(db, farm_id, user)
    sensor = db.scalar(select(Sensor).where(Sensor.id == sensor_id, Sensor.farm_id == farm_id))
    if sensor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    return sensor


@router.get("/{farm_id}/sensors", response_model=list[SensorResponse])
def list_sensors(farm_id: int, db: DbSession, user: FarmerUser) -> list[SensorResponse]:
    """Sensores de la finca con su última lectura (una sola consulta agregada, sin N+1)."""
    get_owned_farm(db, farm_id, user)
    return sensors_with_last(db, [farm_id])


def sensors_with_last(db: Session, farm_ids: list[int]) -> list[SensorResponse]:
    """Sensores de las fincas indicadas (ya autorizadas por el llamador) con su última lectura."""
    sensors = list(db.scalars(select(Sensor).where(Sensor.farm_id.in_(farm_ids)).order_by(Sensor.farm_id, Sensor.id)))
    if not sensors:
        return []
    latest = (
        select(SensorSample.sensor_id, func.max(SensorSample.recorded_at).label("at"))
        .where(SensorSample.sensor_id.in_([s.id for s in sensors]))
        .group_by(SensorSample.sensor_id)
        .subquery()
    )
    rows = db.execute(
        select(SensorSample.sensor_id, SensorSample.value, SensorSample.recorded_at).join(
            latest, (SensorSample.sensor_id == latest.c.sensor_id) & (SensorSample.recorded_at == latest.c.at)
        )
    ).all()
    last = {sensor_id: (value, at) for sensor_id, value, at in rows}
    return [_to_response(s, last.get(s.id)) for s in sensors]


@router.post("/{farm_id}/sensors", response_model=SensorResponse, status_code=status.HTTP_201_CREATED)
def create_sensor(farm_id: int, payload: SensorCreate, db: DbSession, user: FarmerUser) -> SensorResponse:
    get_owned_farm(db, farm_id, user)
    count = db.scalar(select(func.count(Sensor.id)).where(Sensor.farm_id == farm_id)) or 0
    if count >= MAX_SENSORS_PER_FARM:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Máximo {MAX_SENSORS_PER_FARM} sensores por finca.")
    sensor = Sensor(farm_id=farm_id, **payload.model_dump())
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return _to_response(sensor, None)


@router.delete("/{farm_id}/sensors/{sensor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sensor(farm_id: int, sensor_id: int, db: DbSession, user: FarmerUser) -> Response:
    sensor = _owned_sensor(db, farm_id, sensor_id, user)
    # Borrado explícito de las lecturas: no depende de que el motor aplique ON DELETE CASCADE.
    db.execute(delete(SensorSample).where(SensorSample.sensor_id == sensor.id))
    db.delete(sensor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{farm_id}/sensors/{sensor_id}/samples", status_code=status.HTTP_201_CREATED)
def add_samples(farm_id: int, sensor_id: int, payload: SensorSamplesCreate, db: DbSession, user: FarmerUser) -> dict[str, int]:
    """Ingesta de lecturas (manual o pasarela IoT con la sesión del titular). Hasta 500 por petición."""
    sensor = _owned_sensor(db, farm_id, sensor_id, user)
    low, high = CATALOG[sensor.kind].valid
    now = utcnow()
    rows = []
    for i, sample in enumerate(payload.samples):
        if not low <= sample.value <= high:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Lectura {i + 1}: {sample.value} fuera del rango físico del sensor ({low}–{high} {CATALOG[sensor.kind].unit}).",
            )
        at = sample.recorded_at.astimezone(dt.UTC).replace(tzinfo=None) if sample.recorded_at else now
        rows.append(SensorSample(sensor_id=sensor.id, recorded_at=at, value=sample.value))
    db.add_all(rows)
    db.commit()
    return {"created": len(rows)}


@router.get("/{farm_id}/sensors/series", response_model=SensorSeriesResponse)
def sensor_series(
    farm_id: int,
    db: DbSession,
    user: FarmerUser,
    hours: Annotated[int, Query(description="Ventana: 6, 24 o 168 horas")] = 24,
) -> SensorSeriesResponse:
    """Series de todos los sensores de la finca en la ventana pedida, agregadas por tramos."""
    if hours not in WINDOWS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="hours debe ser 6, 24 o 168.")
    get_owned_farm(db, farm_id, user)
    bucket = WINDOWS[hours]
    now = utcnow()
    sensor_ids = list(db.scalars(select(Sensor.id).where(Sensor.farm_id == farm_id).order_by(Sensor.id)))
    sums: dict[int, dict[int, list[float]]] = defaultdict(dict)
    if sensor_ids:
        stmt = (
            select(SensorSample.sensor_id, SensorSample.recorded_at, SensorSample.value)
            .where(SensorSample.sensor_id.in_(sensor_ids), SensorSample.recorded_at >= now - dt.timedelta(hours=hours))
            .order_by(SensorSample.recorded_at.desc())
            .limit(MAX_ROWS)
        )
        step = bucket * 60
        for sensor_id, at, value in db.execute(stmt):
            key = int(_as_utc(at).timestamp()) // step * step
            acc = sums[sensor_id].setdefault(key, [0.0, 0])
            acc[0] += value
            acc[1] += 1
    series = [
        SensorSeries(
            sensor_id=sid,
            points=[(dt.datetime.fromtimestamp(k, dt.UTC), round(total / n, 3)) for k, (total, n) in sorted(sums[sid].items())],
        )
        for sid in sensor_ids
    ]
    return SensorSeriesResponse(hours=hours, bucket_minutes=bucket, generated_at=_as_utc(now), series=series)
