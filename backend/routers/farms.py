import datetime as dt
from typing import Annotated, Any

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

import forum_media
from deps import DbSession, FarmerUser, get_owned_farm
from models import Expense, Farm, Harvest, SensorReading
from schemas import FarmCreate, FarmResponse, FarmUpdate, SensorReadingCreate, SensorReadingResponse

router = APIRouter(prefix="/farms", tags=["farms"])


def _profile_values(payload: FarmCreate | FarmUpdate, *, partial: bool) -> dict[str, Any]:
    """Campos del modelo a partir del esquema validado (las listas anidadas se guardan como JSON plano).
    Cosechas y costes fijos del alta van a sus propias tablas, no a columnas de la finca."""
    return payload.model_dump(exclude_unset=partial, exclude={"harvests", "fixed_costs"})


@router.get("", response_model=list[FarmResponse])
def list_farms(
    db: DbSession,
    user: FarmerUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Farm]:
    """Lista las granjas/parcelas del usuario autenticado."""
    stmt = select(Farm).where(Farm.owner_id == user.id).order_by(Farm.id).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.post("", response_model=FarmResponse, status_code=status.HTTP_201_CREATED)
def create_farm(payload: FarmCreate, db: DbSession, user: FarmerUser) -> Farm:
    """Crea una granja con su ficha completa (asistente multipaso). `owner_id` es siempre el usuario autenticado.

    Cosechas y costes fijos iniciales se crean en la MISMA transacción: o se guarda todo, o nada.
    """
    farm = Farm(**_profile_values(payload, partial=False), owner_id=user.id)
    db.add(farm)
    harvests = [Harvest(**h.model_dump()) for h in payload.harvests]
    farm.harvests.extend(harvests)
    db.flush()  # ids de las cosechas para imputarles los costes
    today = dt.date.today()
    for cost in payload.fixed_costs:
        values = cost.model_dump(exclude={"harvest_index"})
        values["incurred_on"] = values["incurred_on"] or today
        harvest = harvests[cost.harvest_index] if cost.harvest_index is not None else None
        db.add(Expense(**values, farm_id=farm.id, harvest_id=harvest.id if harvest else None, is_fixed=True))
    db.commit()
    db.refresh(farm)
    return farm


@router.get("/{farm_id}", response_model=FarmResponse)
def get_farm(farm_id: int, db: DbSession, user: FarmerUser) -> Farm:
    return get_owned_farm(db, farm_id, user)


@router.put("/{farm_id}", response_model=FarmResponse)
def update_farm(farm_id: int, payload: FarmUpdate, db: DbSession, user: FarmerUser) -> Farm:
    """Actualiza la ficha. Solo se modifican los campos enviados; nombre y ubicación no pueden quedar vacíos."""
    farm = get_owned_farm(db, farm_id, user)
    changes = _profile_values(payload, partial=True)
    for field in ("name", "location", "harvest_mode"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"'{field}' cannot be null")
    if changes.get("harvest_mode") == "single" and len(farm.harvests) > 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La finca tiene varias cosechas: elimina las que sobren antes de pasar a cosecha única.")
    for field, value in changes.items():
        setattr(farm, field, value)
    db.commit()
    db.refresh(farm)
    return farm


# --- Foto de la instalación (privada) ---------------------------------------------------------------


@router.put("/{farm_id}/photo", response_model=FarmResponse)
async def upload_farm_photo(
    farm_id: int,
    db: DbSession,
    user: FarmerUser,
    file: Annotated[UploadFile, File(description="Foto PNG, JPEG o WEBP (máx. 5 MB).")],
) -> Farm:
    """Foto de la instalación: mismo pipeline que el foro (magic bytes, recodificación, sin EXIF/GPS). Solo imagen."""
    farm = get_owned_farm(db, farm_id, user)
    folder = forum_media.farm_photo_dir()
    stored = await forum_media.save_forum_upload(file, folder=folder, allow_video=False)
    previous = farm.photo_key
    farm.photo_key = stored.storage_key
    try:
        db.commit()
    except Exception:
        db.rollback()
        forum_media.delete_media(stored.storage_key, folder)
        raise
    if previous:
        forum_media.delete_media(previous, folder)
    db.refresh(farm)
    return farm


@router.get("/{farm_id}/photo")
def get_farm_photo(farm_id: int, db: DbSession, user: FarmerUser) -> FileResponse:
    """Solo el titular ve la foto de su instalación (no es contenido público)."""
    farm = get_owned_farm(db, farm_id, user)
    path = forum_media.media_path(farm.photo_key, forum_media.farm_photo_dir()) if farm.photo_key else None
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    media_type = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}[path.suffix]
    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{farm_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
def delete_farm_photo(farm_id: int, db: DbSession, user: FarmerUser) -> Response:
    farm = get_owned_farm(db, farm_id, user)
    if farm.photo_key:
        forum_media.delete_media(farm.photo_key, forum_media.farm_photo_dir())
        farm.photo_key = None
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Lecturas de riego / humedad (sensores IoT o registro manual) -----------------------------------


@router.post("/{farm_id}/readings", response_model=SensorReadingResponse, status_code=status.HTTP_201_CREATED)
def add_reading(farm_id: int, payload: SensorReadingCreate, db: DbSession, user: FarmerUser) -> SensorReading:
    get_owned_farm(db, farm_id, user)
    if payload.water_liters is None and payload.soil_moisture_pct is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Indica el agua usada o la humedad del suelo.")
    reading = SensorReading(farm_id=farm_id, source="manual", **payload.model_dump())
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@router.get("/{farm_id}/readings", response_model=list[SensorReadingResponse])
def list_readings(
    farm_id: int, db: DbSession, user: FarmerUser, limit: Annotated[int, Query(ge=1, le=366)] = 90
) -> list[SensorReading]:
    get_owned_farm(db, farm_id, user)
    stmt = select(SensorReading).where(SensorReading.farm_id == farm_id).order_by(SensorReading.recorded_on.desc()).limit(limit)
    return list(db.scalars(stmt))
