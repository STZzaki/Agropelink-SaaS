"""Catálogo de tipos de sensor: unidad, rango físico válido (validación de lecturas) y rango recomendado.

El rango físico rechaza lecturas imposibles (sensor averiado o datos manipulados); el recomendado solo sirve
para avisar en el panel. La unidad la fija el servidor: el cliente nunca la envía.
"""

from dataclasses import dataclass
from typing import Literal

SensorKind = Literal[
    "soil_moisture", "soil_temperature", "air_temperature", "air_humidity",
    "conductivity", "ph", "water_flow", "solar_radiation", "co2",
]


@dataclass(frozen=True)
class KindSpec:
    label: str
    unit: str
    valid: tuple[float, float]
    optimal: tuple[float, float] | None
    decimals: int


CATALOG: dict[str, KindSpec] = {
    "soil_moisture": KindSpec("Humedad del suelo", "%", (0, 100), (30, 60), 1),
    "soil_temperature": KindSpec("Temperatura del suelo", "°C", (-20, 70), (15, 28), 1),
    "air_temperature": KindSpec("Temperatura ambiente", "°C", (-30, 60), (12, 30), 1),
    "air_humidity": KindSpec("Humedad relativa", "%", (0, 100), (50, 85), 0),
    "conductivity": KindSpec("Conductividad (CE)", "dS/m", (0, 20), (0.5, 2.5), 2),
    "ph": KindSpec("pH del suelo", "pH", (0, 14), (5.5, 7.0), 1),
    "water_flow": KindSpec("Caudal de riego", "L/min", (0, 10_000), None, 1),
    "solar_radiation": KindSpec("Radiación solar", "W/m²", (0, 2_000), None, 0),
    "co2": KindSpec("CO₂", "ppm", (0, 10_000), (400, 1_000), 0),
}
