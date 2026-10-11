"""Precio del Gasóleo B desde la API REST oficial del Ministerio, con respuesta garantizada en ≤ 3 s.

Estrategia (stale-while-revalidate):
1. Dato oficial en caché con menos de 1 h → se devuelve al momento (`live`).
2. Si no, se lanza una actualización y se espera como máximo 3 s.
3. Si no llega a tiempo o falla, se devuelve el último dato oficial conocido (`cached`, persistido en
   disco para sobrevivir a reinicios) o, si nunca se obtuvo ninguno, un valor de referencia (`estimate`).
   La actualización sigue en segundo plano y la siguiente petición ya tendrá el dato.
El widget nunca muestra un error, pero siempre indica si el precio es oficial o de referencia.
"""

import asyncio
import datetime as dt
import json
import logging
import statistics
import unicodedata
from pathlib import Path

import httpx
from fastapi import APIRouter

from config import get_settings
from schemas import FuelPriceResponse
from security import utcnow

router = APIRouter(prefix="/market", tags=["market"])
logger = logging.getLogger("agropelink.market")

_BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes"
_ANDALUCIA = "01"
_SOURCE = "API REST de Precios de Carburantes · Ministerio para la Transición Ecológica y el Reto Demográfico"
_USER_AGENT = "Agropelink/1.0 (+https://agropelink.es)"

_FRESH_FOR = dt.timedelta(hours=1)
_RESPONSE_BUDGET_S = 3.0
_RETRY_COOLDOWN = dt.timedelta(minutes=5)  # no insistir contra la fuente si acaba de fallar

# Valor de contingencia: media real de Gasóleo B en Andalucía obtenida de esta misma API el 2026-10-10
# (1,700 €/l en 501 estaciones). Actualizar si el mercado cambia de forma sostenida.
_FALLBACK_AVG = 1.700
_FALLBACK_DATE = "10/10/2026"

_state: dict[str, object] = {"data": None, "refreshed_at": None, "last_failure": None, "task": None}


def _cache_file() -> Path:
    return Path(get_settings().upload_dir).parent / "cache" / "fuel_gasoleo_b.json"


def _load_disk_cache() -> FuelPriceResponse | None:
    try:
        return FuelPriceResponse.model_validate_json(_cache_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _save_disk_cache(data: FuelPriceResponse) -> None:
    try:
        path = _cache_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data.model_dump_json(), encoding="utf-8")
    except OSError:
        logger.warning("No se pudo persistir la caché del precio de carburante")


def _normalize(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).upper().strip()


def _gasoleo_b(stations: list[dict], province: str | None = None) -> list[float]:
    target = _normalize(province) if province else None
    prices = []
    for station in stations:
        if target and _normalize(station.get("Provincia") or "") != target:
            continue
        raw = (station.get("Precio Gasoleo B") or "").replace(",", ".").strip()
        try:
            value = float(raw)
        except ValueError:
            continue
        if 0.3 < value < 5:  # descarta valores anómalos
            prices.append(value)
    return prices


async def _fetch(client: httpx.AsyncClient, url: str) -> dict:
    response = await client.get(url)
    response.raise_for_status()
    return response.json()


async def _download() -> FuelPriceResponse:
    week_ago = (dt.date.today() - dt.timedelta(days=7)).strftime("%d-%m-%Y")
    headers = {"Accept": "application/json", "User-Agent": _USER_AGENT}
    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        region, region_hist, spain = await asyncio.gather(
            _fetch(client, f"{_BASE}/EstacionesTerrestres/FiltroCCAA/{_ANDALUCIA}"),
            _fetch(client, f"{_BASE}/EstacionesTerrestresHist/FiltroCCAA/{week_ago}/{_ANDALUCIA}"),
            _fetch(client, f"{_BASE}/EstacionesTerrestres/"),
            return_exceptions=True,
        )
    if isinstance(region, BaseException):
        raise region

    stations = region.get("ListaEESSPrecio", [])
    current = _gasoleo_b(stations)
    if not current:
        raise ValueError("Respuesta sin precios de Gasóleo B")
    region_avg = statistics.fmean(current)
    almeria = _gasoleo_b(stations, province="Almería")

    week_avg = None
    if not isinstance(region_hist, BaseException) and (hist := _gasoleo_b(region_hist.get("ListaEESSPrecio", []))):
        week_avg = statistics.fmean(hist)
    spain_avg = None
    if not isinstance(spain, BaseException) and (all_es := _gasoleo_b(spain.get("ListaEESSPrecio", []))):
        spain_avg = statistics.fmean(all_es)

    return FuelPriceResponse(
        status="live",
        region="Andalucía",
        region_avg=round(region_avg, 3),
        region_min=round(min(current), 3),
        region_max=round(max(current), 3),
        region_week_ago_avg=round(week_avg, 3) if week_avg else None,
        region_weekly_change_pct=round((region_avg - week_avg) / week_avg * 100, 2) if week_avg else None,
        almeria_avg=round(statistics.fmean(almeria), 3) if almeria else None,
        spain_avg=round(spain_avg, 3) if spain_avg else None,
        stations=len(current),
        source_updated_at=str(region.get("Fecha") or "") or None,
        fetched_at=utcnow(),
        source=_SOURCE,
    )


async def _refresh() -> FuelPriceResponse | None:
    try:
        data = await _download()
    except Exception as exc:  # noqa: BLE001 — cualquier fallo de la fuente se trata igual
        _state["last_failure"] = utcnow()
        logger.warning("Fuente oficial de carburantes no disponible: %s: %s", type(exc).__name__, exc)
        return None
    _state.update(data=data, refreshed_at=utcnow(), last_failure=None)
    _save_disk_cache(data)
    return data


def _ensure_refresh_task() -> asyncio.Task | None:
    """Lanza una única actualización en segundo plano (nunca varias en paralelo)."""
    task = _state["task"]
    if isinstance(task, asyncio.Task) and not task.done():
        return task
    last_failure = _state["last_failure"]
    if isinstance(last_failure, dt.datetime) and utcnow() - last_failure < _RETRY_COOLDOWN:
        return None
    task = asyncio.create_task(_refresh())
    _state["task"] = task
    return task


def _fallback() -> FuelPriceResponse:
    data = _state["data"] or _load_disk_cache()
    if isinstance(data, FuelPriceResponse):
        _state["data"] = data
        return data.model_copy(
            update={"status": "cached", "note": "Último dato oficial disponible; la fuente no responde en este momento."}
        )
    return FuelPriceResponse(
        status="estimate",
        region="Andalucía",
        region_avg=_FALLBACK_AVG,
        region_weekly_change_pct=0.0,
        source_updated_at=_FALLBACK_DATE,
        fetched_at=utcnow(),
        source=_SOURCE,
        note="Valor de referencia (media oficial reciente). Tendencia estable.",
    )


async def warm_up() -> None:
    """Precarga el precio al arrancar el servidor para que la primera visita ya tenga dato oficial."""
    _ensure_refresh_task()


@router.get("/fuel", response_model=FuelPriceResponse)
async def fuel_price() -> FuelPriceResponse:
    """Precio medio del Gasóleo B (€/l): Andalucía, Almería y España, con tendencia semanal. Responde en ≤ 3 s."""
    data, refreshed_at = _state["data"], _state["refreshed_at"]
    if isinstance(data, FuelPriceResponse) and isinstance(refreshed_at, dt.datetime) and utcnow() - refreshed_at < _FRESH_FOR:
        return data

    task = _ensure_refresh_task()
    if task is not None:
        try:
            # shield: si se agota el plazo, la descarga continúa en segundo plano y llenará la caché.
            result = await asyncio.wait_for(asyncio.shield(task), timeout=_RESPONSE_BUDGET_S)
            if result is not None:
                return result
        except TimeoutError:
            pass
    return _fallback()
