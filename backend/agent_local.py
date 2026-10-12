"""Motor LOCAL de Agropelink AI: entiende peticiones en español y responde con los datos reales de la cuenta.

Sin modelos externos ni terceros: detección de intención por reglas, extracción de fechas/importes/labores y
redacción con plantillas sobre las herramientas de `agent_tools`. Es gratuito, instantáneo y privado.
Las acciones (crear tarea, apuntar un gasto) son PROPUESTAS: el usuario las confirma en la interfaz.
"""

import datetime as dt
import re
import unicodedata
from dataclasses import dataclass, field

import agent_tools as tools
from agent_tools import AgentContext

# --- Normalización y utilidades ----------------------------------------------------------------------------


def fold(text: str) -> str:
    """minúsculas y sin tildes (conserva la ñ como 'n' para simplificar las reglas)."""
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _num(value: float, decimals: int = 2) -> str:
    s = f"{value:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s.rstrip("0").rstrip(",") if "," in s else s


def _eur(value: float) -> str:
    return f"{_num(value, 2)} €"


def _day(iso: str) -> str:
    d = dt.date.fromisoformat(iso)
    return f"{_WEEKDAYS_SHORT[d.weekday()]} {d.day} {_MONTHS_SHORT[d.month - 1]}"


_WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
_WEEKDAYS_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
_MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

TASK_CATEGORY_LABEL = {
    "irrigation": "Riego", "treatment": "Tratamiento", "planting": "Siembra / plantación", "pruning": "Poda",
    "harvest": "Recolección", "maintenance": "Mantenimiento", "fertilization": "Abonado", "other": "Labor",
}
EXPENSE_LABEL = {
    "seeds": "semillas y plantel", "fertilizers": "fertilizantes", "phytosanitary": "fitosanitarios", "water": "agua de riego",
    "energy": "energía", "fuel": "combustible", "labor": "mano de obra", "machinery": "maquinaria",
    "services": "servicios externos", "other": "otros",
}
STATE_LABEL = {"low": "por debajo del rango", "high": "por encima del rango", "offline": "sin señal"}

# Palabra clave (sin tildes) → tipo de labor. El orden importa: lo más específico primero.
_TASK_KEYWORDS = [
    ("fertilization", r"abon|fertiliz|fertirrig|nitrato|estiercol"),
    ("treatment", r"trat|fumig|pulveriz|azufr|fungicid|insecticid|fitosanit|plaga|desinfec"),
    ("irrigation", r"rieg|regar|goteo|riega"),
    ("pruning", r"pod[ae]|podar|deshoj|destall|entutor"),
    ("harvest", r"recol|cosech|recog|cortar\b|corte de"),
    ("planting", r"siembr|sembr|plant[ae]|plantar|trasplant"),
    ("maintenance", r"manten|repar|limpi|revis|cambiar|instal|averi"),
]
_EXPENSE_KEYWORDS = [
    ("fuel", r"gasoil|gasoleo|diesel|combustible|gasolina"),
    ("fertilizers", r"abono|fertiliz|nitrato|estiercol"),
    ("seeds", r"semilla|plantel|plantones|plantula"),
    ("phytosanitary", r"fitosanit|insecticid|fungicid|azufre|herbicid|tratamiento"),
    ("water", r"\bagua\b|comunidad de regantes"),
    ("energy", r"\bluz\b|electric|energia|placas"),
    ("labor", r"jornal|sueldo|nomina|mano de obra|peon"),
    ("machinery", r"tractor|maquin|repuesto|reparacion"),
    ("services", r"asesor|transporte|servicio|laboratorio|analisis"),
]


def _match_first(text: str, table: list[tuple[str, str]], default: str) -> str:
    return next((key for key, pattern in table if re.search(pattern, text)), default)


# --- Fechas ---------------------------------------------------------------------------------------------------


def parse_dates(text: str, today: dt.date) -> tuple[dt.date | None, dt.date | None]:
    """(inicio, fin) a partir de: hoy, mañana, pasado mañana, el lunes, la semana que viene, 15/10, 15 de octubre,
    «del 3 al 5 de octubre», «durante 3 días». Sin fecha reconocible → (None, None)."""
    t = fold(text)
    start: dt.date | None = None
    end: dt.date | None = None

    def build(day: int, month: int, year: int | None = None) -> dt.date | None:
        try:
            d = dt.date(year or today.year, month, day)
        except ValueError:
            return None
        # Sin año y ya pasada (más de un mes atrás): se entiende el año siguiente.
        if year is None and d < today - dt.timedelta(days=30):
            d = d.replace(year=d.year + 1)
        return d

    month_re = "|".join(_MONTHS)
    if m := re.search(rf"\bdel? (\d{{1,2}}) al (\d{{1,2}})(?: de ({month_re}))?", t):
        month = _MONTHS.index(m.group(3)) + 1 if m.group(3) else today.month
        start, end = build(int(m.group(1)), month), build(int(m.group(2)), month)
    elif m := re.search(rf"\b(\d{{1,2}}) de ({month_re})(?: de (\d{{4}}))?", t):
        start = build(int(m.group(1)), _MONTHS.index(m.group(2)) + 1, int(m.group(3)) if m.group(3) else None)
    elif m := re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", t):
        year = int(m.group(3)) if m.group(3) else None
        if year is not None and year < 100:
            year += 2000
        start = build(int(m.group(1)), int(m.group(2)), year)
    elif re.search(r"pasado manana", t):
        start = today + dt.timedelta(days=2)
    elif re.search(r"\bmanana\b", t):
        start = today + dt.timedelta(days=1)
    elif re.search(r"\bhoy\b", t):
        start = today
    elif re.search(r"\bayer\b", t):
        start = today - dt.timedelta(days=1)
    elif re.search(r"semana que viene|proxima semana", t):
        start = today + dt.timedelta(days=7 - today.weekday())
    elif m := re.search(r"\b(?:el |este |proximo )?(" + "|".join(_WEEKDAYS) + r")\b", t):
        target = _WEEKDAYS.index(m.group(1))
        start = today + dt.timedelta(days=(target - today.weekday()) % 7 or 7)

    if start and end is None and (m := re.search(r"durante (\d{1,3}) dias?", t)):
        end = start + dt.timedelta(days=max(1, int(m.group(1))) - 1)
    if start and end and end < start:
        end = None
    return start, end


# --- Importes ---------------------------------------------------------------------------------------------------

_AMOUNT = re.compile(r"(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)")


def parse_amount(text: str) -> float | None:
    m = _AMOUNT.search(fold(text))
    if not m:
        return None
    raw = m.group(1).replace(" ", "")
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", raw):
        raw = raw.replace(".", "")
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if 0 < value <= 100_000_000 else None


# --- Resultado del motor ------------------------------------------------------------------------------------


@dataclass
class LocalResult:
    reply: str
    action: dict | None = None  # {"type": "create_task"|"register_expense", ...} — se valida después
    intents: list[str] = field(default_factory=list)


# --- Intenciones -------------------------------------------------------------------------------------------------

_CREATE_VERB = r"\b(programa\w*|crea\w*|anad\w*|apunta\w*|agenda\w*|planifica\w*|organiza\w*|pon(?:me)?|recuerda\w*|hay que|tengo que|toca)\b"
_EXPENSE_VERB = r"\b(gast\w*|pag\w*|compr\w*|apunta\w* (?:un |el )?(?:gasto|coste)|coste de|factura de)\b"
INTENTS: list[tuple[str, str]] = [
    ("briefing", r"\b(resumen|como va|como esta|como estamos|estado general|novedades|que hay hoy|buenos dias|que tal va|ponme al dia)\b"),
    ("sensors", r"\b(sensor\w*|sonda\w*|humedad|temperatura|conductividad|\bce\b|\bph\b|co2|radiacion|caudal)\b"),
    ("tasks", r"\b(tareas?|pendientes?|agenda|labores|que tengo|que hay que hacer|esta semana|calendario|atrasad\w*|retrasad\w*)\b"),
    ("economy", r"\b(gast\w*|presupuesto|costes?|dinero|economia|facturas?|cuanto llevo|invertido|consumido)\b"),
    ("reminders", r"\b(recordatorios?|vence\w*|vencimientos?|avisos)\b"),
    ("siex", r"\b(siex|cuaderno)\b"),
    ("workers", r"\b(trabajador\w*|equipo|emplead\w*|operari\w*|plantilla|personal)\b"),
    ("farms", r"\b(fincas?|granjas?|cosechas?|cultivos?|hectareas?|plantas)\b"),
]


_QUESTION = re.compile(r"^\s*¿|\?\s*$|^\s*(?:y\s+)?(?:que|cuales?|cuant\w*|como|quien\w*|cuando|donde)\b")


def detect_intents(message: str) -> list[str]:
    t = fold(message)
    found = []
    # Una pregunta («¿qué hay que hacer hoy?») consulta datos; no crea nada.
    asking = bool(_QUESTION.search(message.strip()) or _QUESTION.search(t))
    if not asking and re.search(_CREATE_VERB, t) and (re.search(r"\b(tarea|labor)\b", t) or _match_first(t, _TASK_KEYWORDS, "") or parse_dates(message, dt.date.today())[0]):
        found.append("create_task")
    if not asking and re.search(_EXPENSE_VERB, t) and parse_amount(message) is not None:
        found.append("register_expense")
    if not found:
        found = [name for name, pattern in INTENTS if re.search(pattern, t)]
    return found


# --- Propuestas de acción ------------------------------------------------------------------------------------


def _find_farm(ctx: AgentContext, t: str) -> int | None:
    for f in sorted(ctx.farms, key=lambda f: -len(f.name)):
        if fold(f.name) in t:
            return f.id
    return ctx.farms[0].id if len(ctx.farms) == 1 else None


def _find_worker(ctx: AgentContext, t: str) -> dict | None:
    for w in tools.workers_snapshot(ctx):
        first = fold(w["name"]).split()[0]
        if fold(w["name"]) in t or re.search(rf"\b(a|para|con) {re.escape(first)}\b", t):
            return w
    return None


_STRIP_PREFIX = re.compile(
    r"^\s*(?:por favor,?\s*)?(?:(?:programa|programame|crea|creame|anade|anademe|apunta|apuntame|agenda|planifica|organiza|pon|ponme|recuerdame|hay que|tengo que|toca)\s+)?"
    r"(?:(?:una|la|un)\s+)?(?:tarea|labor)?\s*(?:de|para|:)?\s*",
    re.IGNORECASE,
)


def _clean_title(message: str) -> str:
    original = message.strip()
    folded = fold(original)
    m = _STRIP_PREFIX.match(folded)
    cut = m.end() if m else 0
    title = original[cut:]
    # Quita expresiones de fecha y de asignación del final.
    title = re.sub(r"\s+del? \d{1,2} al \d{1,2}.*$", "", title, flags=re.IGNORECASE)  # rangos antes que fechas sueltas
    title = re.sub(r"\s+(?:para |el |este |del |a partir del? )?(?:hoy|mañana|manana|pasado mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2} de \w+|la semana que viene|la próxima semana)\b.*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s+durante \d+ días?.*$", "", title, flags=re.IGNORECASE)
    title = title.strip(" .,:;")
    return (title[:1].upper() + title[1:])[:200] if title else ""


def propose_task(ctx: AgentContext, message: str) -> LocalResult:
    t = fold(message)
    category = _match_first(t, _TASK_KEYWORDS, "other")
    start, end = parse_dates(message, ctx.today)
    farm_id = _find_farm(ctx, t)
    worker = _find_worker(ctx, t)
    title = _clean_title(message)
    if farm_id is not None:  # la finca ya va en su campo: no se repite en el título
        name = re.escape(ctx.farm_name(farm_id))
        title = re.sub(rf"\s*(?:en|de|para)\s+(?:la\s+)?{name}\b", "", title, flags=re.IGNORECASE).strip(" ,.")
    if worker is not None:  # ni la persona asignada («para Lucía»)
        first = re.escape(worker["name"].split()[0])
        title = re.sub(rf"\s*(?:para|a|con)\s+{first}(?:\s+\S+)?\s*$", "", title, flags=re.IGNORECASE).strip(" ,.")
    title = title or TASK_CATEGORY_LABEL[category]
    action = {
        "type": "create_task",
        "title": title,
        "description": f"Propuesta de Agropelink AI a partir de: «{message.strip()[:300]}»",
        "category": category,
        "date": (start or ctx.today).isoformat(),
        "end_date": end.isoformat() if end else None,
        "farm_id": farm_id,
        "worker_id": worker["id"] if worker else None,
    }
    lines = [f"He preparado esta tarea de **{TASK_CATEGORY_LABEL[category].lower()}**:"]
    lines.append(f"• {title}")
    lines.append(f"• Fecha: {_day(action['date'])}" + (f" → {_day(action['end_date'])}" if end else "") + ("" if start else " (no indicaste fecha: he puesto hoy)"))
    if farm_id:
        lines.append(f"• Finca: {ctx.farm_name(farm_id)}")
    elif ctx.farms:
        lines.append("• Elige la finca en la tarjeta.")
    if worker:
        lines.append(f"• Asignada a: {worker['name']}")
    lines.append("Revísala y pulsa «Aprobar» para crearla; nada se guarda sin tu confirmación.")
    if not ctx.farms:
        return LocalResult("Para programar tareas primero necesitas una finca. Créala en Resumen → «Nueva granja».", None, ["create_task"])
    return LocalResult("\n".join(lines), action, ["create_task"])


def propose_expense(ctx: AgentContext, message: str) -> LocalResult:
    t = fold(message)
    amount = parse_amount(message)
    category = _match_first(t, _EXPENSE_KEYWORDS, "other")
    start, _ = parse_dates(message, ctx.today)
    farm_id = _find_farm(ctx, t)
    concept = re.sub(_AMOUNT, "", message).strip()
    concept = re.sub(r"^\s*(?:he |hemos )?(?:gastado|pagado|comprado|apunta(?:me)? (?:un |el )?(?:gasto|coste)(?: de)?)\s*", "", concept, flags=re.IGNORECASE)
    concept = re.sub(r"\b(?:hoy|ayer|anteayer|esta semana)\b", "", concept, flags=re.IGNORECASE)
    concept = re.sub(r"^\s*(?:de|en|por)\s+", "", concept.strip(" .,:;"), flags=re.IGNORECASE)
    concept = concept.strip(" .,:;") or EXPENSE_LABEL[category].capitalize()
    concept = (concept[:1].upper() + concept[1:])[:120]
    if not ctx.farms:
        return LocalResult("Para registrar gastos primero necesitas una finca.", None, ["register_expense"])
    action = {
        "type": "register_expense",
        "farm_id": farm_id,
        "category": category,
        "concept": concept,
        "amount": amount,
        "incurred_on": (start or ctx.today).isoformat(),
    }
    lines = [
        f"Apunto un gasto de **{_eur(amount)}** en {EXPENSE_LABEL[category]}:",
        f"• Concepto: {concept}",
        f"• Fecha: {_day(action['incurred_on'])}",
        f"• Finca: {ctx.farm_name(farm_id)}" if farm_id else "• Elige la finca en la tarjeta.",
        "Confírmalo y lo verás en Economía como coste variable.",
    ]
    return LocalResult("\n".join(lines), action, ["register_expense"])


# --- Respuestas de consulta --------------------------------------------------------------------------------------


def answer_sensors(ctx: AgentContext) -> str:
    snap = tools.sensors_snapshot(ctx)
    if not snap["count"]:
        return "No tienes sensores vinculados todavía. Añádelos en Resumen → «Tu finca en directo» → «+ Sensor»."
    lines = [f"**Sensores** ({snap['count']} en total):"]
    if snap["alerts"]:
        for a in snap["alerts"][:6]:
            value = "" if a["state"] == "offline" else f": {_num(a['value'])} {a['unit']}"
            lines.append(f"• {a['sensor']} ({a['farm']}) — {a['type']} {STATE_LABEL[a['state']]}{value}")
    else:
        lines.append("• Todas las lecturas están dentro del rango recomendado.")
    ok = [s for s in snap["sensors"] if s["state"] == "ok"][:4]
    if ok and snap["alerts"]:
        lines.append("En rango: " + ", ".join(f"{s['sensor']} {_num(s['value'])} {s['unit']}" for s in ok) + ".")
    return "\n".join(lines)


def answer_tasks(ctx: AgentContext) -> str:
    snap = tools.tasks_snapshot(ctx, days=7)
    if not any(snap.values()):
        return "No tienes tareas abiertas para los próximos 7 días. Dime qué labor quieres programar y te la preparo."
    lines = ["**Tareas**:"]
    for key, title in (("overdue", "Con retraso"), ("today", "Hoy"), ("upcoming", "Próximos 7 días")):
        if snap[key]:
            lines.append(f"{title}:")
            for t in snap[key][:5]:
                who = f" · {t['worker']}" if t["worker"] else ""
                span = _day(t["start"]) + (f" → {_day(t['end'])}" if t["end"] != t["start"] else "")
                lines.append(f"• {t['title']} ({t['farm']}, {span}{who})")
    return "\n".join(lines)


def answer_economy(ctx: AgentContext) -> str:
    snap = tools.economy_snapshot(ctx)
    if not snap["farms"]:
        return "Aún no tienes fincas con datos económicos."
    lines = [f"**Economía {snap['year']}** · gasto total {_eur(snap['total_consumed'])}:"]
    for f in snap["farms"]:
        if f["budget"] is not None:
            lines.append(f"• {f['farm']}: {_eur(f['consumed'])} de {_eur(f['budget'])} ({_num(f['pct'] or 0, 1)} %) · quedan {_eur(f['remaining'])}")
        else:
            lines.append(f"• {f['farm']}: {_eur(f['consumed'])} (sin presupuesto anual definido)")
    if snap["top_categories"]:
        lines.append("Principales partidas: " + ", ".join(f"{EXPENSE_LABEL.get(c['category'], c['category'])} {_eur(c['amount'])}" for c in snap["top_categories"][:4]) + ".")
    return "\n".join(lines)


def answer_reminders(ctx: AgentContext) -> str:
    items = tools.reminders_snapshot(ctx, days=30)
    if not items:
        return "No tienes recordatorios de documentos pendientes en los próximos 30 días."
    lines = ["**Recordatorios de documentos**:"]
    for r in items[:6]:
        lines.append(f"• {'VENCIDO · ' if r['overdue'] else ''}{_day(r['date'])} — {r['note'][:90]} ({r['document']})")
    return "\n".join(lines)


def answer_siex(ctx: AgentContext) -> str:
    items = tools.siex_snapshot(ctx)
    if not items:
        return "Necesitas una finca para preparar el cuaderno SIEX."
    lines = ["**Cuaderno SIEX** (borrador del año en curso):"]
    for s in items:
        lines.append(f"• {s['farm']}: {s['treatments']} tratamientos, {s['operations']} labores, {_num(s['water_m3'], 1)} m³ de agua.")
        for c in s["checks"][:3]:
            lines.append(f"   – {c}")
    lines.append("Pulsa «Generar SIEX con IA» en Tareas para ver el borrador completo y descargarlo.")
    return "\n".join(lines)


def answer_workers(ctx: AgentContext) -> str:
    items = tools.workers_snapshot(ctx)
    if not items:
        return "No tienes trabajadores dados de alta. Hazlo en Tareas → «Trabajadores» y podrás asignarles labores."
    lines = ["**Equipo activo**:"]
    for w in items[:8]:
        lines.append(f"• {w['name']} — {w['open_tasks']} tarea{'s' if w['open_tasks'] != 1 else ''} abierta{'s' if w['open_tasks'] != 1 else ''}")
    return "\n".join(lines)


def answer_farms(ctx: AgentContext) -> str:
    items = tools.farms_snapshot(ctx)
    if not items:
        return "Aún no tienes fincas. Créala con el asistente en Resumen → «Nueva granja»."
    lines = ["**Tus fincas**:"]
    for f in items:
        surface = f" · {_num(f['surface_ha'])} ha" if f["surface_ha"] else ""
        lines.append(f"• {f['name']} ({f['location']}){surface} — {'cosecha única' if f['harvest_mode'] == 'single' else 'varias cosechas'}")
        for h in f["harvests"][:4]:
            extra = ", ".join(x for x in (f"{_num(h['surface_ha'])} ha" if h["surface_ha"] else "", f"{h['plant_count']:,} plantas".replace(",", ".") if h["plant_count"] else "") if x)
            lines.append(f"   – {h['name']}{f' ({extra})' if extra else ''}")
    return "\n".join(lines)


def answer_briefing(ctx: AgentContext) -> str:
    items = tools.briefing(ctx)
    prefix = {"alert": "• Atención: ", "warning": "• Aviso: "}
    return "**Tu resumen de hoy**:\n" + "\n".join(f"{prefix.get(i['level'], '• ')}{i['text']}" for i in items)


# --- Conocimiento agronómico general (orientativo, sin dosis ni marcas) ----------------------------------------

KNOWLEDGE: list[tuple[str, str]] = [
    (r"\btrips\b", "Los **trips** se vigilan con placas cromotrópicas azules y conteos en flor. En control integrado se combinan sueltas de enemigos naturales (Orius, Amblyseius), mallas y eliminación de malas hierbas; si hace falta un tratamiento, usa materias activas autorizadas para el cultivo y rota modos de acción."),
    (r"mosca blanca|bemisia|trialeurodes", "Para la **mosca blanca**: placas amarillas para seguimiento, mallas en bandas, control biológico (Nesidiocoris, Amblyseius swirskii) y retirar restos de cultivo. Los tratamientos, siempre con productos registrados y rotando modos de acción para evitar resistencias."),
    (r"\btuta\b|polilla del tomate", "Contra **Tuta absoluta**: trampas de feromona para detectar picos, confusión sexual, Nesidiocoris tenuis y eliminación de hojas y frutos afectados. Mantén el invernadero bien cerrado y el suelo limpio de restos."),
    (r"\boidio\b|ceniza", "El **oídio** aparece con humedad relativa media y temperaturas suaves. Ayuda una buena ventilación, evitar exceso de nitrógeno y vigilar el envés de las hojas. El azufre y otros productos autorizados se aplican de forma preventiva y respetando plazos de seguridad."),
    (r"botritis|botrytis|podredumbre gris", "La **botritis** se favorece con humedad alta y condensación. Ventila, evita mojar hojas, retira restos vegetales y desinfecta herramientas de poda. Vigila tu sensor de humedad relativa: por encima del 85–90 % sostenido aumenta el riesgo."),
    (r"arana roja|tetranychus", "La **araña roja** prospera con calor y ambiente seco. Subir algo la humedad ambiental, sueltas de Phytoseiulus persimilis y tratar solo focos con productos autorizados suele funcionar bien."),
    (r"\bmildiu\b", "El **mildiu** necesita agua libre sobre la hoja: ventila, evita riegos por aspersión y condensaciones nocturnas, y usa tratamientos preventivos autorizados cuando el riesgo sea alto."),
    (r"pulgon", "Los **pulgones** se controlan bien con enemigos naturales (Aphidius, crisopas) y vigilando los primeros focos. Evita excesos de nitrógeno, que favorecen brotes tiernos."),
    (r"nematod", "Contra **nematodos**: rotación de cultivos, solarización o biosolarización en verano, portainjertos resistentes y análisis de suelo para conocer la población."),
    (r"\bce\b|conductividad|salinidad", "La **conductividad (CE)** indica la salinidad de la solución. Valores altos estresan la planta: revisa la CE del agua de riego, la del drenaje y aplica fracciones de lavado. Tus sensores de CE te avisan aquí mismo cuando se salen de rango."),
    (r"\bph\b", "La mayoría de hortícolas prefieren un **pH** de la solución en torno a 5,5–6,5. Fuera de ese rango se bloquea la absorción de algunos nutrientes (hierro, fósforo…)."),
    (r"golpe de calor|ola de calor|calor extremo", "Ante **golpes de calor**: blanqueo o mallas de sombreo, riegos cortos y frecuentes, ventilación máxima y evitar tratamientos en las horas centrales."),
    (r"helad", "Ante **heladas**: cierra el invernadero por la tarde para acumular calor, riega la víspera (el suelo húmedo retiene más calor) y considera mantas térmicas en cultivos sensibles."),
    (r"riego|regar|goteo", "Para ajustar el **riego** fíjate en la humedad del suelo (tu sensor marca el rango recomendado), el drenaje y la previsión de lluvia del widget de clima. Mejor varios pulsos cortos que uno largo en suelos arenosos."),
]


def answer_knowledge(message: str) -> str | None:
    t = fold(message)
    hits = [text for pattern, text in KNOWLEDGE if re.search(pattern, t)]
    if not hits:
        return None
    return "\n\n".join(hits[:2]) + "\n\nEs una orientación general: confirma productos y dosis con tu técnico y en el Registro de Productos Fitosanitarios del MAPA."


HELP = (
    "Soy Agropelink AI y trabajo con los datos de tu explotación, sin enviarlos fuera. Prueba con:\n"
    "• «Resumen de hoy»\n• «¿Cómo están los sensores?»\n• «¿Qué tareas tengo esta semana?»\n"
    "• «¿Cuánto llevo gastado?»\n• «Programa un riego en Finca Norte mañana para Lucía»\n"
    "• «He gastado 120 € en abono»\n• «¿Cómo está el cuaderno SIEX?»\n• «¿Qué hago contra la mosca blanca?»"
)

_ANSWERS = {
    "briefing": answer_briefing, "sensors": answer_sensors, "tasks": answer_tasks, "economy": answer_economy,
    "reminders": answer_reminders, "siex": answer_siex, "workers": answer_workers, "farms": answer_farms,
}


def respond(ctx: AgentContext, message: str) -> LocalResult:
    intents = detect_intents(message)
    # Con importe y verbo de gasto manda el gasto («apunta un gasto de 80 €»), aunque «apunta» también cree tareas.
    if "register_expense" in intents:
        return propose_expense(ctx, message)
    if "create_task" in intents:
        return propose_task(ctx, message)
    knowledge = answer_knowledge(message)
    parts = [_ANSWERS[i](ctx) for i in intents[:3] if i in _ANSWERS]
    # Una pregunta agronómica («¿qué hago contra el oídio?») prima sobre datos tangenciales.
    if knowledge and (not parts or not intents or intents == ["sensors"]):
        parts = [knowledge] + parts[:1]
    if not parts:
        if re.search(r"\b(hola|buenas|hey|ayuda|que puedes|que sabes|como funcionas)\b", fold(message)):
            return LocalResult(HELP, None, ["help"])
        return LocalResult("No estoy seguro de haberte entendido.\n\n" + HELP, None, ["unknown"])
    return LocalResult("\n\n".join(parts), None, intents or ["knowledge"])
