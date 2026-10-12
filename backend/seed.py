"""Siembra masiva de datos de demostración realistas para Agropelink (Andalucía), idempotente.

Qué crea (sin duplicar nunca: cada elemento se busca antes por su clave natural):
  1. Cuentas de los 4 perfiles: administrador, agricultores, trabajadores (cuentas «Usuario» vinculadas a su ficha
     de trabajador, como en la app) y usuarios estándar. Contraseñas aleatorias y robustas, guardadas solo como
     hash Argon2id; se muestran UNA vez al crear la cuenta.
  2. Fincas andaluzas (Sevilla, Almería) con superficie, presupuesto anual, cultivos y productos.
  3. Cosechas y campañas activas (fechas relativas a hoy).
  4. Tareas de campo pendientes, en curso y completadas, repartidas entre los trabajadores.
  5. Costes por categoría (gasóleo, abonos, semillas, agua, energía, mano de obra) imputados a cada cosecha.
  6. Facturas y albaranes de proveedores con su PDF real en el almacenamiento privado y código de serie.
  7. Sensores IoT (humedad, temperatura, CE…) con lecturas de las últimas 72 h y riego diario.
  8. Hilos y respuestas del foro (plagas, lonjas, riego, maquinaria) con reacciones y menciones.
También repara los valores fuera de catálogo que dejó la versión anterior de este script (categorías, puestos…).

Conexión: la misma de la app (`DATABASE_URL` en .env; TiDB con TLS verificado). Sin credenciales en el código.

Uso:
  python seed.py                       # pide confirmación mostrando el destino (sin credenciales)
  python seed.py --yes                 # sin confirmación
  python seed.py --rotate-passwords    # además, nuevas contraseñas aleatorias para las cuentas de demostración
Se niega a ejecutarse con ENVIRONMENT=production salvo --allow-production.

Nota: las facturas se calculan en Economía como gasto; los albaranes no (son justificantes de entrega). Por eso los
costes imputados a cosechas y las facturas de proveedores corresponden a compras distintas: no hay doble conteo.
"""

import argparse
import datetime as dt
import hashlib
import math
import random
import secrets
import string
import sys
import uuid
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, insert, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

import models  # noqa: F401  (registra todos los modelos)
from config import get_settings
from database import engine
from db_migrations import sync_schema
from document_index import assign_reference
from models import (
    Document,
    DocumentNote,
    DocumentStatus,
    DocumentType,
    Expense,
    Farm,
    ForumCategory,
    ForumMention,
    ForumReaction,
    ForumReply,
    ForumThread,
    Harvest,
    Sensor,
    SensorReading,
    SensorSample,
    Task,
    TaskStatus,
    User,
    UserRole,
    Worker,
)
from security import hash_password, utcnow
from sensor_catalog import CATALOG

# --- Utilidades ------------------------------------------------------------------------------------------------


def strong_password(length: int = 18) -> str:
    """Contraseña aleatoria con mayúsculas, minúsculas, dígitos y símbolos (secrets: criptográficamente segura)."""
    alphabet = string.ascii_letters + string.digits + "#%+-=@_!?"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in pwd) and any(c.isupper() for c in pwd)
                and any(c.isdigit() for c in pwd) and any(c in "#%+-=@_!?" for c in pwd)):
            return pwd


def money(value: float) -> Decimal:
    return Decimal(str(round(value, 2)))


def make_pdf(lines: list[str]) -> bytes:
    """PDF 1.4 mínimo y válido (texto plano, sin contenido activo): pasa la misma validación que una subida."""
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    text = "BT /F1 11 Tf 56 790 Td 15 TL " + " ".join(f"({esc(line)}) Tj T*" for line in lines) + " ET"
    stream = text.encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


class Report:
    def __init__(self) -> None:
        self.created: dict[str, int] = {}
        self.updated: dict[str, int] = {}
        self.credentials: list[tuple[str, str, str]] = []

    def add(self, kind: str, n: int = 1) -> None:
        self.created[kind] = self.created.get(kind, 0) + n

    def fix(self, kind: str, n: int = 1) -> None:
        self.updated[kind] = self.updated.get(kind, 0) + n


# --- Datos de demostración ----------------------------------------------------------------------------------------

# (email, nombre, rol, avatar, perfil). «worker» = cuenta Usuario que se vincula a su ficha de trabajador.
ACCOUNTS = [
    ("admin@agropelink.es", "Carlos Administrador", UserRole.ADMIN, "agricultor", "admin"),
    ("javi@agropelink.es", "Javi Agricultor", UserRole.FARMER, "girasol", "farmer"),
    ("rocio@agropelink.es", "Rocío Fernández", UserRole.FARMER, "tomate", "farmer"),
    ("manuel@agropelink.es", "Manuel Operario", UserRole.USER, "vaca", "worker"),
    ("antonio@agropelink.es", "Antonio Martín", UserRole.USER, "zanahoria", "worker"),
    ("lucia@agropelink.es", "Lucía Compradora", UserRole.USER, "margarita", "user"),
    ("pepe@agropelink.es", "Pepe Navarro", UserRole.USER, "abeja", "user"),
]

FARMS = [
    # (dueño, nombre, ubicación, ha, largo, ancho, presupuesto, modo, cultivos, nº trabajadores, insumos)
    ("javi@agropelink.es", "Finca Los Olivos", "Carmona, Sevilla", 45.5, 950, 480, 15000, "multiple", ["Olivar", "Trigo"], 6,
     [{"name": "Oxicloruro de cobre 50%", "kind": "phytosanitary", "registry": "REG-DEMO-0141"},
      {"name": "NPK 15-15-15", "kind": "fertilizer", "registry": None}]),
    ("javi@agropelink.es", "Vega del Guadalquivir", "Lora del Río, Sevilla", 30.0, 600, 500, 10000, "single", ["Naranjo"], 4,
     [{"name": "Aceite de parafina", "kind": "phytosanitary", "registry": "REG-DEMO-0233"}]),
    ("rocio@agropelink.es", "Cortijo El Alquián", "El Alquián, Almería", 6.5, 260, 250, 42000, "multiple", ["Tomate", "Pimiento"], 9,
     [{"name": "Azufre mojable 80%", "kind": "phytosanitary", "registry": "REG-DEMO-0312"},
      {"name": "Nitrato cálcico", "kind": "fertilizer", "registry": None},
      {"name": "Bacillus thuringiensis", "kind": "ferment", "registry": "REG-DEMO-0477"}]),
    ("rocio@agropelink.es", "Finca Las Hortichuelas", "Roquetas de Mar, Almería", 3.2, 200, 160, 18000, "single", ["Pepino"], 5,
     [{"name": "Abamectina 1,8%", "kind": "phytosanitary", "registry": None}]),
]

# (finca, nombre, ha, plantas, días desde el inicio, días hasta el fin, descripción)
HARVESTS = [
    ("Finca Los Olivos", "Campaña Olivar 2026", 38.0, 4500, 230, 110, "Hojiblanca en intensivo, marco 7×5 m. Recolección de verdeo en octubre y almazara en noviembre-diciembre."),
    ("Finca Los Olivos", "Campaña Trigo 2026", 7.5, None, 320, -110, "Trigo duro de secano en rotación. Cosechado en junio; rastrojo pendiente de alzar."),
    ("Vega del Guadalquivir", "Naranjo Navel 2026-27", 30.0, 8000, 20, 190, "Navelina y Lane Late sobre citrange Carrizo, riego por goteo con fertirrigación."),
    ("Cortijo El Alquián", "Tomate rama ciclo otoño", 3.5, 70000, 75, 120, "Invernadero multitúnel, tomate rama variedad de larga vida, entutorado a una guía y polinización con abejorros."),
    ("Cortijo El Alquián", "Pimiento California", 3.0, 60000, 95, 85, "Pimiento California rojo con control biológico (Orius y Amblyseius), sustrato de fibra de coco."),
    ("Finca Las Hortichuelas", "Pepino holandés invierno", 3.2, 48000, 40, 110, "Pepino largo tipo holandés en enarenado, dos pulsos de riego diarios."),
]

# (dueño, nombre, puesto, sueldo, €/h, días, entrada, salida, cuenta vinculada)
WORKERS = [
    ("javi@agropelink.es", "Manuel Operario", "tractor_driver", 1500, 12.5, ["mon", "tue", "wed", "thu", "fri"], "07:00", "15:00", "manuel@agropelink.es"),
    ("javi@agropelink.es", "Dolores Jiménez", "applicator", 1580, 13.2, ["mon", "tue", "wed", "thu", "fri"], "07:30", "15:30", None),
    ("javi@agropelink.es", "Rafael Gómez", "laborer", 1350, 11.0, ["mon", "tue", "wed", "thu", "fri", "sat"], "07:00", "14:00", None),
    ("rocio@agropelink.es", "Antonio Martín", "manager", 1850, 15.0, ["mon", "tue", "wed", "thu", "fri", "sat"], "06:30", "14:30", "antonio@agropelink.es"),
    ("rocio@agropelink.es", "Fátima Benali", "applicator", 1520, 12.8, ["mon", "tue", "wed", "thu", "fri"], "07:00", "15:00", None),
    ("rocio@agropelink.es", "Ionut Popescu", "laborer", 1340, 11.0, ["mon", "tue", "wed", "thu", "fri", "sat"], "07:00", "14:00", None),
]

# (finca, título, tipo, días desde hoy (inicio), duración en días, trabajador, estado o None=según fecha, descripción)
TASKS = [
    ("Finca Los Olivos", "Tratamiento preventivo contra repilo", "treatment", -12, 2, "Dolores Jiménez", None, "Oxicloruro de cobre en todo el olivar tras las lluvias. Revisar boquillas antes de empezar."),
    ("Finca Los Olivos", "Poda de formación en olivos jóvenes", "pruning", -2, 5, "Rafael Gómez", None, "Sector norte, plantación de 2023. Retirar chupones y dejar 3-4 ramas principales."),
    ("Finca Los Olivos", "Abonado de fondo NPK", "fertilization", -30, 1, "Manuel Operario", None, "Abonadora centrífuga, 300 kg/ha antes de las lluvias."),
    ("Finca Los Olivos", "Revisión de goteros sector 3", "irrigation", 1, 1, "Rafael Gómez", None, "Comprobar caudal y presión; cambiar goteros obstruidos."),
    ("Finca Los Olivos", "Recolección de verdeo", "harvest", 9, 6, "Manuel Operario", None, "Coordinar con la cooperativa el turno de entrega."),
    ("Finca Los Olivos", "Alzado del rastrojo de trigo", "maintenance", -6, 2, "Manuel Operario", TaskStatus.PENDING, "Pendiente por avería del vertedera; reprogramar cuando llegue la pieza."),
    ("Vega del Guadalquivir", "Aplicación de aceite de parafina", "treatment", -5, 1, "Dolores Jiménez", None, "Contra cochinilla en las calles 1 a 12."),
    ("Vega del Guadalquivir", "Riego de apoyo y fertirrigación", "irrigation", 0, 3, "Manuel Operario", TaskStatus.IN_PROGRESS, "Tres pulsos diarios de 40 min con nitrato potásico."),
    ("Vega del Guadalquivir", "Recolección de Navelina", "harvest", 20, 8, None, None, "Pendiente de confirmar fechas con el comprador."),
    ("Cortijo El Alquián", "Suelta de Orius en pimiento", "treatment", -9, 1, "Fátima Benali", None, "Control biológico de trips: 2 individuos/m² en focos."),
    ("Cortijo El Alquián", "Deshojado y entutorado de tomate", "pruning", -1, 4, "Ionut Popescu", None, "Naves 1 y 2. Bajar guías y retirar hojas senescentes."),
    ("Cortijo El Alquián", "Recolección de tomate rama", "harvest", 0, 2, "Antonio Martín", TaskStatus.IN_PROGRESS, "Corte de racimos en nave 1; envío a la alhóndiga de La Mojonera."),
    ("Cortijo El Alquián", "Limpieza de filtros del cabezal", "maintenance", 3, 1, "Antonio Martín", None, "Filtros de anillas y de malla; revisar la bomba dosificadora."),
    ("Cortijo El Alquián", "Azufrado contra oídio", "treatment", 5, 1, "Fátima Benali", None, "Azufre mojable en pimiento; respetar plazo de seguridad."),
    ("Cortijo El Alquián", "Análisis de solución nutritiva", "fertilization", -15, 1, "Antonio Martín", None, "Muestra de drenaje y gotero para el laboratorio."),
    ("Finca Las Hortichuelas", "Trasplante de pepino", "planting", -40, 3, "Ionut Popescu", None, "Plantón de semillero, marco 1×0,5 m."),
    ("Finca Las Hortichuelas", "Colocación de mallas y tutores", "maintenance", -20, 2, "Ionut Popescu", None, "Malla de entutorado a 2 m."),
    ("Finca Las Hortichuelas", "Tratamiento contra araña roja", "treatment", -3, 1, None, TaskStatus.PENDING, "Focos en el lateral sur: asignar aplicador."),
    ("Finca Las Hortichuelas", "Primera recolección de pepino", "harvest", 4, 5, "Antonio Martín", None, "Clasificar por calibre en campo."),
]

# Costes imputados a cosechas: (cosecha, categoría, concepto, € base, fijo, cada cuántos días, cuántas veces)
EXPENSE_PLAN = [
    ("Campaña Olivar 2026", "fertilizers", "Fertilizante NPK 15-15-15", 1250, True, 0, 1),
    ("Campaña Olivar 2026", "fuel", "Gasóleo B maquinaria", 380, False, 30, 7),
    ("Campaña Olivar 2026", "labor", "Jornales de poda", 640, False, 45, 4),
    ("Campaña Olivar 2026", "water", "Cuota comunidad de regantes", 210, False, 60, 3),
    ("Campaña Trigo 2026", "seeds", "Semilla Trigo R1", 1200.5, True, 0, 1),
    ("Campaña Trigo 2026", "fuel", "Gasóleo B siembra y cosecha", 450, False, 90, 2),
    ("Naranjo Navel 2026-27", "fertilizers", "Nitrato potásico fertirrigación", 520, False, 20, 1),
    ("Naranjo Navel 2026-27", "energy", "Electricidad bombeo", 185, False, 30, 1),
    ("Tomate rama ciclo otoño", "seeds", "Planta injertada de tomate rama", 9800, True, 0, 1),
    ("Tomate rama ciclo otoño", "fertilizers", "Abonos solubles fertirrigación", 760, False, 21, 4),
    ("Tomate rama ciclo otoño", "energy", "Electricidad cabezal de riego", 240, False, 30, 3),
    ("Tomate rama ciclo otoño", "labor", "Mano de obra entutorado", 1150, False, 30, 3),
    ("Pimiento California", "seeds", "Planta de pimiento California", 7400, True, 0, 1),
    ("Pimiento California", "phytosanitary", "Fauna auxiliar Orius y Amblyseius", 690, False, 28, 3),
    ("Pimiento California", "water", "Agua desalada para riego", 330, False, 30, 3),
    ("Pepino holandés invierno", "seeds", "Plantón de pepino holandés", 3900, True, 0, 1),
    ("Pepino holandés invierno", "fertilizers", "Abonos solubles", 410, False, 20, 2),
    ("Pepino holandés invierno", "fuel", "Gasóleo calefacción invernadero", 520, False, 30, 1),
]

# Facturas (cuentan en Economía) y albaranes (justificantes de entrega): (finca, tipo, proveedor, concepto, €, días atrás, estado)
DOCUMENTS = [
    ("Finca Los Olivos", DocumentType.INVOICE_PHYTO, "Agroquímicos del Sur S.L.", "Fungicida cúprico 25 kg", 312.40, 14, DocumentStatus.PAID),
    ("Finca Los Olivos", DocumentType.INVOICE_OTHER, "Laboratorio Agroanalítico Sur", "Análisis foliar olivar", 145.20, 40, DocumentStatus.PAID),
    ("Finca Los Olivos", DocumentType.DELIVERY_NOTE, "Cooperativa San Isidro", "Albarán entrega NPK 15-15-15 (4 t)", 1250.00, 31, DocumentStatus.ARCHIVED),
    ("Vega del Guadalquivir", DocumentType.INVOICE_PHYTO, "Fitosanitarios La Vega", "Aceite de parafina 200 l", 268.90, 6, DocumentStatus.PENDING),
    ("Cortijo El Alquián", DocumentType.INVOICE_FUEL, "Gasóleos del Poniente S.L.", "Gasóleo B 600 l", 702.00, 22, DocumentStatus.PAID),
    ("Cortijo El Alquián", DocumentType.INVOICE_SEEDS, "Semilleros Almerienses S.A.", "Semilla de reposición pimiento", 455.00, 70, DocumentStatus.PAID),
    ("Cortijo El Alquián", DocumentType.INVOICE_OTHER, "Biocontrol Levante S.L.", "Colmenas de abejorros (polinización)", 384.00, 10, DocumentStatus.PENDING),
    ("Cortijo El Alquián", DocumentType.DELIVERY_NOTE, "Semilleros Almerienses S.A.", "Albarán planta injertada tomate (70.000 u.)", 9800.00, 75, DocumentStatus.ARCHIVED),
    ("Finca Las Hortichuelas", DocumentType.INVOICE_PHYTO, "Agroquímicos del Sur S.L.", "Acaricida y mojante", 189.75, 3, DocumentStatus.PENDING),
    ("Finca Las Hortichuelas", DocumentType.SOIL_ANALYSIS, "Laboratorio Agroanalítico Sur", "Análisis de suelo enarenado", None, 45, DocumentStatus.ARCHIVED),
]

# Notas/recordatorios sobre documentos: (concepto del documento, texto, días hasta el aviso)
NOTES = [
    ("Aceite de parafina 200 l", "Pagar antes de fin de mes por transferencia; pedir duplicado firmado.", 4),
    ("Colmenas de abejorros (polinización)", "Reclamar la colmena defectuosa de la nave 2 al proveedor.", -2),
    ("Análisis foliar olivar", "Comentar con el técnico el déficit de boro antes del abonado de primavera.", 20),
]

# Sensores por finca: (finca, nombre, tipo, zona)
SENSORS = [
    ("Finca Los Olivos", "Sonda humedad sector A", "soil_moisture", "Sector A"),
    ("Finca Los Olivos", "Estación meteorológica", "air_temperature", "Caseta"),
    ("Vega del Guadalquivir", "Sonda humedad calle 6", "soil_moisture", "Calle 6"),
    ("Vega del Guadalquivir", "Caudalímetro cabezal", "water_flow", "Cabezal"),
    ("Cortijo El Alquián", "Sonda humedad nave 1", "soil_moisture", "Nave 1"),
    ("Cortijo El Alquián", "Termohigrómetro nave 1", "air_temperature", "Nave 1"),
    ("Cortijo El Alquián", "Higrómetro nave 1", "air_humidity", "Nave 1"),
    ("Cortijo El Alquián", "Sonda CE gotero nave 2", "conductivity", "Nave 2"),
    ("Finca Las Hortichuelas", "Sonda humedad enarenado", "soil_moisture", "Parcela única"),
    ("Finca Las Hortichuelas", "Sonda CO₂ invernadero", "co2", "Parcela única"),
]

# Foro: (categoría, autor, título, cuerpo, etiquetas, horas atrás, respuestas [(autor, texto, horas atrás)])
THREADS = [
    (ForumCategory.PLAGAS, "javi@agropelink.es", "¿Alerta de repilo en olivar tras las últimas lluvias?",
     "Con las lluvias de esta semana en la campiña de Sevilla he visto manchas sospechosas en hojas bajas. "
     "¿Estáis aplicando ya cobre preventivo o esperáis a que seque?", ["olivar", "repilo"], 50,
     [("rocio@agropelink.es", "Nosotros en Almería no tenemos olivar, pero con humedad alta y 15-20 °C el repilo se dispara. Yo no esperaría.", 30),
      ("admin@agropelink.es", "Recordad respetar el plazo de seguridad del cobre si vais a recoger verdeo pronto.", 20),
      ("pepe@agropelink.es", "@Javi Agricultor yo apliqué la semana pasada y de momento bien, sin manchas nuevas.", 8)]),
    (ForumCategory.PLAGAS, "rocio@agropelink.es", "Trips en pimiento: ¿Orius o Amblyseius primero?",
     "Empiezo a ver daños de trips en flor en el pimiento California. Tengo sueltas programadas de las dos especies; "
     "¿qué orden os funciona mejor en otoño?", ["pimiento", "trips", "control biológico"], 26,
     [("antonio@agropelink.es", "En nuestra nave fue mejor Amblyseius al trasplante y Orius en cuanto hay polen. Con placas azules para vigilar.", 22),
      ("javi@agropelink.es", "Muy interesante, no sabía lo del polen. ¿Cuántos individuos por metro soltáis?", 5)]),
    (ForumCategory.LONJAS, "lucia@agropelink.es", "Precios del tomate rama esta semana en las alhóndigas",
     "Abro hilo para comentar cómo van las subastas de tomate rama en el Poniente. Esta semana lo he visto algo flojo.",
     ["tomate", "subasta", "precios"], 70,
     [("rocio@agropelink.es", "Hoy hemos cerrado a 0,92 €/kg en La Mojonera, algo mejor que el lunes.", 40),
      ("pepe@agropelink.es", "En Vícar parecido. Con el frío que anuncian igual repunta la semana que viene.", 12)]),
    (ForumCategory.LONJAS, "javi@agropelink.es", "Aceite de oliva virgen extra: ¿cómo veis la campaña?",
     "Con la cosecha que se espera en Andalucía, ¿creéis que el precio en origen aguantará o bajará en diciembre?",
     ["aceite", "olivar", "mercado"], 96,
     [("lucia@agropelink.es", "Como compradora noto que las cooperativas aún no fijan precio. Habrá que esperar a ver los aforos.", 80)]),
    (ForumCategory.RIEGO, "rocio@agropelink.es", "¿Cuántos pulsos de riego dais al pepino en invierno?",
     "En enarenado estoy dando dos pulsos de 10 minutos. Con la sonda de humedad veo que a media tarde baja bastante. "
     "¿Subiríais a tres pulsos más cortos?", ["pepino", "riego", "sensores"], 18,
     [("antonio@agropelink.es", "Nosotros pasamos a tres pulsos y el drenaje quedó en torno al 20 %. La CE también se estabilizó.", 9)]),
    (ForumCategory.MAQUINARIA, "javi@agropelink.es", "Recambio de vertedera para alzar rastrojo",
     "Se me ha partido una reja de la vertedera y el distribuidor tarda dos semanas. ¿Algún taller en la zona de Carmona?",
     ["tractor", "vertedera"], 120, []),
]


# --- Siembra ------------------------------------------------------------------------------------------------------


def seed(db: Session, *, today: dt.date | None = None, now: dt.datetime | None = None, upload_dir: Path | None = None,
         rotate_passwords: bool = False, password_factory: Callable[[], str] = strong_password, log=print) -> Report:  # type: ignore[no-untyped-def]
    """Siembra idempotente. No hace commit parcial: el llamador confirma (commit) o deshace todo."""
    today = today or dt.date.today()
    now = now or utcnow()
    upload_dir = Path(upload_dir or get_settings().upload_dir)
    rng = random.Random(2026)  # datos deterministas: misma siembra en cada máquina
    rep = Report()

    # 1. Cuentas ------------------------------------------------------------------------------------------------
    log("· Cuentas de los 4 perfiles")
    users: dict[str, User] = {}
    for email, name, role, avatar, profile in ACCOUNTS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            password = password_factory()
            user = User(email=email, name=name, role=role, avatar=avatar, hashed_password=hash_password(password),
                        birth_date=dt.date(1975 + len(users) * 3, 3 + len(users), 10), created_at=now - dt.timedelta(days=120))
            db.add(user)
            db.flush()
            rep.add("cuentas")
            rep.credentials.append((profile, email, password))
        else:
            if user.role != role:
                user.role = role
                rep.fix("roles")
            if user.avatar is None:
                user.avatar = avatar
            if user.birth_date is None:
                user.birth_date = dt.date(1980, 5, 12)
            if rotate_passwords:
                password = password_factory()
                user.hashed_password = hash_password(password)
                rep.fix("contraseñas rotadas")
                rep.credentials.append((profile, email, password))
        users[email] = user

    # 2. Fincas ---------------------------------------------------------------------------------------------------
    log("· Fincas y parcelas")
    farms: dict[str, Farm] = {}
    for owner, name, location, ha, length, width, budget, mode, crops, staff, inputs in FARMS:
        farm = db.scalar(select(Farm).where(Farm.name == name, Farm.owner_id == users[owner].id))
        if farm is None:
            farm = Farm(name=name, location=location, owner_id=users[owner].id)
            db.add(farm)
            rep.add("fincas")
        # Completa la ficha sin pisar lo que el usuario ya haya rellenado.
        for field, value in (("surface_ha", money(ha)), ("length_m", money(length)), ("width_m", money(width)),
                             ("budget_total", money(budget)), ("avg_workers", staff), ("crop_types", crops), ("inputs", inputs)):
            if getattr(farm, field) in (None, [], {}):
                setattr(farm, field, value)
        farm.harvest_mode = mode if farm.harvest_mode in (None, "") else farm.harvest_mode
        if len(HARVEST_BY_FARM.get(name, [])) > 1:
            farm.harvest_mode = "multiple"
        farms[name] = farm
    db.flush()

    # 3. Cosechas -------------------------------------------------------------------------------------------------
    log("· Cosechas y campañas activas")
    harvests: dict[str, Harvest] = {}
    for farm_name, name, ha, plants, since, until, description in HARVESTS:
        farm = farms[farm_name]
        harvest = db.scalar(select(Harvest).where(Harvest.farm_id == farm.id, Harvest.name == name))
        if harvest is None:
            harvest = Harvest(farm_id=farm.id, name=name)
            db.add(harvest)
            rep.add("cosechas")
        harvest.surface_ha = harvest.surface_ha or money(ha)
        harvest.plant_count = harvest.plant_count or plants
        harvest.start_date = harvest.start_date or today - dt.timedelta(days=since)
        harvest.end_date = harvest.end_date or today + dt.timedelta(days=until)
        harvest.description = harvest.description or description
        harvests[name] = harvest
    db.flush()

    # 4. Trabajadores y tareas -----------------------------------------------------------------------------------
    log("· Trabajadores y tareas de campo")
    workers: dict[str, Worker] = {}
    for owner, name, position, salary, hourly, days, start, end, account in WORKERS:
        worker = db.scalar(select(Worker).where(Worker.owner_id == users[owner].id, Worker.name == name))
        if worker is None:
            worker = Worker(owner_id=users[owner].id, name=name, position=position, active=True)
            db.add(worker)
            rep.add("trabajadores")
        worker.position = worker.position if worker.position in VALID_POSITIONS else position
        worker.monthly_salary = worker.monthly_salary or money(salary)
        worker.hourly_cost = worker.hourly_cost or money(hourly)
        worker.schedule = worker.schedule or {"days": days, "start": start, "end": end}
        if account and worker.user_id is None:
            worker.user_id = users[account].id  # vínculo de la cuenta «trabajador» (en la app se hace con código)
        workers[name] = worker
    db.flush()

    for farm_name, title, category, offset, span, worker_name, forced, description in TASKS:
        farm = farms[farm_name]
        start = today + dt.timedelta(days=offset)
        if db.scalar(select(Task.id).where(Task.farm_id == farm.id, Task.title == title)) is not None:
            continue
        end = start + dt.timedelta(days=span - 1) if span > 1 else None
        if forced is not None:
            state = forced
        elif (end or start) < today:
            state = TaskStatus.DONE
        elif start <= today:
            state = TaskStatus.IN_PROGRESS
        else:
            state = TaskStatus.PENDING
        db.add(Task(farm_id=farm.id, title=title, category=category, date=start, end_date=end, status=state,
                    description=description, worker_id=workers[worker_name].id if worker_name else None,
                    created_at=now - dt.timedelta(days=max(1, -offset + 3))))
        rep.add("tareas")

    # 5. Costes imputados a cosechas -------------------------------------------------------------------------------
    log("· Costes por categoría imputados a cosechas")
    for harvest_name, category, concept, base, fixed, every, times in EXPENSE_PLAN:
        harvest = harvests[harvest_name]
        for i in range(times):
            when = (harvest.start_date or today) + dt.timedelta(days=every * i)
            if when > today:
                break
            label = concept if times == 1 else f"{concept} ({when.strftime('%m/%Y')})"
            # Coste único (semilla, abonado de fondo…): basta el concepto. Periódico: concepto + fecha.
            dup = select(Expense.id).where(Expense.farm_id == harvest.farm_id, Expense.concept == label)
            if times > 1:
                dup = dup.where(Expense.incurred_on == when)
            if db.scalar(dup.limit(1)) is not None:
                continue
            amount = base if fixed else base * rng.uniform(0.85, 1.15)
            db.add(Expense(farm_id=harvest.farm_id, harvest_id=harvest.id, category=category, concept=label,
                           amount=money(amount), incurred_on=when, is_fixed=fixed, created_at=now))
            rep.add("costes")

    # 6. Facturas y albaranes con su PDF -------------------------------------------------------------------------
    log("· Facturas y albaranes de proveedores")
    upload_dir.mkdir(parents=True, exist_ok=True)
    docs_by_concept: dict[str, Document] = {}
    for farm_name, doc_type, vendor, concept, amount, days_ago, doc_status in DOCUMENTS:
        farm = farms[farm_name]
        filename = f"{doc_type.value}-{concept[:40]}.pdf".replace(" ", "_").replace("/", "-")
        doc = db.scalar(select(Document).where(Document.farm_id == farm.id, Document.filename == filename))
        if doc is None:
            accrual = today - dt.timedelta(days=days_ago)
            title = "ALBARÁN DE ENTREGA" if doc_type == DocumentType.DELIVERY_NOTE else ("INFORME DE ANÁLISIS" if amount is None else "FACTURA")
            lines = [title, vendor, f"Cliente: {farm.name} ({farm.location})", f"Fecha: {accrual.strftime('%d/%m/%Y')}", "", concept]
            if amount is not None:
                base_imponible = amount / 1.21 if doc_type != DocumentType.DELIVERY_NOTE else amount
                lines += [f"Base imponible: {base_imponible:,.2f} EUR", f"IVA 21%: {amount - base_imponible:,.2f} EUR", f"TOTAL: {amount:,.2f} EUR"]
            lines += ["", "Documento de demostración generado por Agropelink (datos ficticios)."]
            pdf = make_pdf(lines)
            key = uuid.uuid4().hex
            (upload_dir / key).write_bytes(pdf)
            harvest = next((h for h in harvests.values() if h.farm_id == farm.id), None)
            doc = Document(filename=filename, file_url=key, content_type="application/pdf", size_bytes=len(pdf),
                           sha256=hashlib.sha256(pdf).hexdigest(), doc_type=doc_type, status=doc_status,
                           accrual_date=accrual, fiscal_year=accrual.year, campaign=harvest.name[:80] if harvest else None,
                           amount=money(amount) if amount is not None else None, vendor=vendor, farm_id=farm.id,
                           is_draft=False, created_at=now - dt.timedelta(days=days_ago))
            db.add(doc)
            db.flush()
            assign_reference(db, doc)
            rep.add("documentos (PDF)")
        docs_by_concept[concept] = doc

    for concept, text, days in NOTES:
        doc = docs_by_concept.get(concept)
        if doc is None or db.scalar(select(DocumentNote.id).where(DocumentNote.document_id == doc.id, DocumentNote.body == text)) is not None:
            continue
        owner_id = next(f.owner_id for f in farms.values() if f.id == doc.farm_id)
        db.add(DocumentNote(document_id=doc.id, author_id=owner_id, body=text, remind_on=today + dt.timedelta(days=days),
                            done=False, created_at=now, updated_at=now))
        rep.add("notas y recordatorios")

    # 7. Sensores IoT y lecturas --------------------------------------------------------------------------------
    log("· Sensores IoT y lecturas recientes")
    for farm_name, name, kind, zone in SENSORS:
        farm = farms[farm_name]
        sensor = db.scalar(select(Sensor).where(Sensor.farm_id == farm.id, Sensor.name == name))
        if sensor is None:
            sensor = Sensor(farm_id=farm.id, name=name, kind=kind, zone=zone, created_at=now - dt.timedelta(days=90))
            db.add(sensor)
            db.flush()
            rep.add("sensores")
        # Solo se completan los huecos: desde la última lectura (o 72 h atrás) hasta ahora, cada 15 minutos.
        last = db.scalar(select(func.max(SensorSample.recorded_at)).where(SensorSample.sensor_id == sensor.id))
        start = max(last + dt.timedelta(minutes=15), now - dt.timedelta(hours=72)) if last else now - dt.timedelta(hours=72)
        rows = []
        t = start.replace(second=0, microsecond=0)
        low, high = CATALOG[kind].valid
        while t <= now:
            value = min(high, max(low, _signal(kind, t, rng, farm_name)))
            rows.append({"sensor_id": sensor.id, "recorded_at": t, "value": round(value, CATALOG[kind].decimals + 1)})
            t += dt.timedelta(minutes=15)
        if rows:
            db.execute(insert(SensorSample), rows)
            rep.add("lecturas de sensores", len(rows))

    # Riego diario (agua y humedad media) de los últimos 60 días para las gráficas del panel.
    for farm in farms.values():
        existing = set(db.scalars(select(SensorReading.recorded_on).where(SensorReading.farm_id == farm.id,
                                                                          SensorReading.recorded_on >= today - dt.timedelta(days=60))))
        surface = float(farm.surface_ha or 5)
        rows = []
        for back in range(60, -1, -1):
            day = today - dt.timedelta(days=back)
            if day in existing:
                continue
            irrigated = back % 3 != 0
            rows.append({"farm_id": farm.id, "recorded_on": day, "source": "iot", "created_at": now,
                         "water_liters": money(surface * rng.uniform(1800, 2600)) if irrigated else Decimal("0"),
                         "soil_moisture_pct": money(34 + 6 * math.sin(back / 4) + (4 if irrigated else -3) + rng.uniform(-1.5, 1.5))})
        if rows:
            db.execute(insert(SensorReading), rows)
            rep.add("registros diarios de riego", len(rows))

    # 8. Foro --------------------------------------------------------------------------------------------------------
    log("· Foro de la comunidad")
    for category, author, title, body, tags, hours_ago, replies in THREADS:
        thread = db.scalar(select(ForumThread).where(ForumThread.title == title))
        if thread is not None:
            continue
        created = now - dt.timedelta(hours=hours_ago)
        last_activity = now - dt.timedelta(hours=min([h for _, _, h in replies], default=hours_ago))
        thread = ForumThread(category=category, title=title, body=body, tags=tags, author_id=users[author].id,
                             created_at=created, last_activity_at=last_activity)
        db.add(thread)
        db.flush()
        rep.add("hilos del foro")
        for reply_author, text, h in replies:
            reply = ForumReply(thread_id=thread.id, author_id=users[reply_author].id, body=text, created_at=now - dt.timedelta(hours=h))
            db.add(reply)
            db.flush()
            rep.add("respuestas del foro")
            # Mención real: «@Nombre» presente en el texto → aviso para el mencionado (como hace la API).
            for mentioned in users.values():
                if f"@{mentioned.name}".lower() in text.lower() and mentioned.id != reply.author_id:
                    db.add(ForumMention(user_id=mentioned.id, actor_id=reply.author_id, thread_id=thread.id,
                                        reply_id=reply.id, created_at=reply.created_at))
                    rep.add("menciones")
            _react(db, rep, thread.id, reply.id, [u for e, u in users.items() if e not in (reply_author,)][:2], rng)
        _react(db, rep, thread.id, None, [u for e, u in users.items() if e != author][:3], rng)

    _repair_legacy(db, rep, upload_dir)
    db.flush()
    return rep


HARVEST_BY_FARM: dict[str, list[str]] = {}
for _farm, _name, *_ in HARVESTS:
    HARVEST_BY_FARM.setdefault(_farm, []).append(_name)

VALID_POSITIONS = {"manager", "laborer", "tractor_driver", "applicator", "technician", "admin", "other"}
_REACTIONS = ["like", "like", "like", "heart", "thanks", "sprout", "wow"]


def _react(db: Session, rep: Report, thread_id: int, reply_id: int | None, users: list[User], rng: random.Random) -> None:
    target = f"r:{reply_id}" if reply_id else f"t:{thread_id}"
    for user in users:
        kind = rng.choice(_REACTIONS)
        exists = db.scalar(select(ForumReaction.id).where(ForumReaction.user_id == user.id, ForumReaction.target == target, ForumReaction.kind == kind))
        if exists is None:
            db.add(ForumReaction(user_id=user.id, thread_id=thread_id, reply_id=reply_id, target=target, kind=kind, created_at=utcnow()))
            rep.add("reacciones")


def _signal(kind: str, t: dt.datetime, rng: random.Random, farm: str) -> float:
    """Serie realista por tipo: ciclo diario, pulsos de riego y algo de ruido."""
    hour = t.hour + t.minute / 60
    day = math.sin((hour - 9) / 24 * 2 * math.pi)  # máximo a las 15 h
    greenhouse = farm in ("Cortijo El Alquián", "Finca Las Hortichuelas")
    noise = rng.uniform(-0.6, 0.6)
    if kind == "soil_moisture":
        since_irrigation = (hour - 8) % 12  # riego a las 8 y a las 20
        return 46 - since_irrigation * 1.4 + noise
    if kind == "air_temperature":
        return (19 if greenhouse else 15) + (9 if greenhouse else 7) * day + noise
    if kind == "air_humidity":
        return 74 - 16 * day + noise * 3
    if kind == "conductivity":
        # Algo alta a propósito en la nave 2: el panel muestra la alerta «por encima del rango».
        return 2.75 + 0.15 * day + noise * 0.05
    if kind == "water_flow":
        return 85 + noise * 4 if 7 <= hour < 9 or 19 <= hour < 21 else 0
    if kind == "co2":
        return 520 + 260 * max(0.0, -day) + noise * 20
    return 0.0


# Valores que dejó la versión anterior del script y que la app no reconoce.
_LEGACY_EXPENSE = {"gasoil": "fuel", "semillas": "seeds", "abonos": "fertilizers", "maquinaria": "machinery",
                   "fitosanitarios": "phytosanitary", "agua": "water", "energia": "energy", "energía": "energy"}
_LEGACY_TASK = {"tractor": "maintenance", "fertilizer": "fertilization", "water": "irrigation", "watering": "irrigation"}
_LEGACY_POSITION = {"tractorista": "tractor_driver", "aplicador": "applicator", "encargado": "manager", "peon": "laborer", "peón": "laborer"}
_LEGACY_SENSOR = {"moisture": "soil_moisture", "humidity": "air_humidity", "temperature": "air_temperature"}


def _repair_legacy(db: Session, rep: Report, upload_dir: Path) -> None:
    from schemas import ExpenseCategory, TaskCategory  # import diferido (schemas importa modelos)

    valid_exp = set(ExpenseCategory.__args__)
    for e in db.scalars(select(Expense).where(Expense.category.not_in(valid_exp))):
        e.category = _LEGACY_EXPENSE.get(e.category.lower(), "other")
        rep.fix("categorías de coste")
    valid_task = set(TaskCategory.__args__)
    for t in db.scalars(select(Task).where(Task.category.not_in(valid_task))):
        t.category = _LEGACY_TASK.get(t.category.lower(), "other")
        rep.fix("tipos de tarea")
    for w in db.scalars(select(Worker).where(Worker.position.not_in(VALID_POSITIONS))):
        w.position = _LEGACY_POSITION.get(w.position.lower(), "other")
        rep.fix("puestos de trabajador")
    for s in db.scalars(select(Sensor).where(Sensor.kind.not_in(list(CATALOG)))):
        s.kind = _LEGACY_SENSOR.get(s.kind.lower(), "soil_moisture")
        rep.fix("tipos de sensor")
    # Documentos sin archivo real (p. ej. «ejemplo-uuid-falso…»): se genera un PDF y su código de serie válido.
    for doc in db.scalars(select(Document).where(Document.is_draft.is_(False))):
        if (len(doc.file_url or "") == 32 and (upload_dir / doc.file_url).is_file()):
            continue
        pdf = make_pdf([f"{doc.vendor or 'Proveedor'}", doc.filename, f"Importe: {doc.amount or '-'} EUR",
                        "Documento de demostración regenerado por Agropelink."])
        key = uuid.uuid4().hex
        upload_dir.mkdir(parents=True, exist_ok=True)
        (upload_dir / key).write_bytes(pdf)
        doc.file_url, doc.size_bytes, doc.sha256, doc.content_type = key, len(pdf), hashlib.sha256(pdf).hexdigest(), "application/pdf"
        doc.accrual_date = doc.accrual_date or dt.date.today()
        if not (doc.reference or "").startswith("AGRO-"):
            assign_reference(db, doc)
        rep.fix("documentos sin archivo")


# --- Punto de entrada ---------------------------------------------------------------------------------------------


def _target() -> str:
    url = make_url(get_settings().database_url)
    return f"{url.drivername} · {url.host or 'local'} · base de datos «{url.database}»"  # sin usuario ni contraseña


def main() -> int:
    parser = argparse.ArgumentParser(description="Siembra masiva de datos de demostración (idempotente).")
    parser.add_argument("--yes", action="store_true", help="no pedir confirmación")
    parser.add_argument("--rotate-passwords", action="store_true", help="nuevas contraseñas aleatorias para las cuentas de demostración")
    parser.add_argument("--allow-production", action="store_true", help="permitir con ENVIRONMENT=production")
    args = parser.parse_args()

    if get_settings().is_production and not args.allow_production:
        print("ENVIRONMENT=production: no se siembran datos de demostración (usa --allow-production si es intencionado).", file=sys.stderr)
        return 1
    print(f"Destino: {_target()}")
    if not args.yes and input("¿Sembrar datos de demostración en esta base de datos? [s/N] ").strip().lower() not in {"s", "si", "sí", "y", "yes"}:
        print("Cancelado.")
        return 1

    sync_schema(engine)  # tablas/columnas que falten (solo añade; nunca borra)
    with Session(engine) as db:
        try:
            rep = seed(db, rotate_passwords=args.rotate_passwords)
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"Error: {type(exc).__name__}: {exc}. No se ha guardado nada.", file=sys.stderr)
            return 1

    print("\nCreado:", ", ".join(f"{v} {k}" for k, v in rep.created.items()) or "nada (ya estaba todo)")
    if rep.updated:
        print("Actualizado:", ", ".join(f"{v} {k}" for k, v in rep.updated.items()))
    if rep.credentials:
        print("\nCredenciales (se muestran UNA sola vez; guárdalas en un gestor de contraseñas):")
        for profile, email, password in rep.credentials:
            print(f"  {profile:7} {email:28} {password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
