"""Herramientas de lectura del agente Agropelink AI.

Cada función recibe el contexto del usuario (sus fincas, ya filtradas por propietario) y devuelve un resumen
compacto y serializable: lo usan tanto el motor local como un modelo de lenguaje (que solo ve lo necesario
para la pregunta). Todo con el ORM y acotado: nunca se leen datos de otra cuenta ni volúmenes grandes.
"""

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

import finance
from models import Document, DocumentNote, Expense, Farm, Task, TaskStatus, User, Worker

OFFLINE_AFTER = dt.timedelta(hours=2)
MAX_ITEMS = 12  # por lista: el agente resume, no vuelca tablas


@dataclass
class AgentContext:
    db: Session
    user: User
    farms: list[Farm]
    today: dt.date = field(default_factory=dt.date.today)

    @property
    def farm_ids(self) -> list[int]:
        return [f.id for f in self.farms]

    def farm_name(self, farm_id: int) -> str:
        return next((f.name for f in self.farms if f.id == farm_id), f"finca {farm_id}")


def build_context(db: Session, user: User) -> AgentContext:
    farms = list(db.scalars(select(Farm).where(Farm.owner_id == user.id).order_by(Farm.id)))
    return AgentContext(db=db, user=user, farms=farms)


def _money(v: float) -> float:
    return round(float(v or 0), 2)


# --- Fincas y cosechas ---------------------------------------------------------------------------------


def farms_snapshot(ctx: AgentContext) -> list[dict]:
    return [
        {
            "id": f.id,
            "name": f.name,
            "location": f.location,
            "surface_ha": float(f.surface_ha) if f.surface_ha else None,
            "harvest_mode": f.harvest_mode,
            "harvests": [
                {
                    "name": h.name,
                    "surface_ha": float(h.surface_ha) if h.surface_ha else None,
                    "plant_count": h.plant_count,
                    "start": h.start_date.isoformat() if h.start_date else None,
                    "end": h.end_date.isoformat() if h.end_date else None,
                }
                for h in f.harvests[:MAX_ITEMS]
            ],
        }
        for f in ctx.farms
    ]


# --- Sensores --------------------------------------------------------------------------------------------


def sensors_snapshot(ctx: AgentContext) -> dict:
    """Última lectura de cada sensor y su estado: en rango, bajo, alto o sin señal (>2 h sin datos)."""
    from routers.sensors import sensors_with_last  # import diferido: routers → agente → herramientas

    now = dt.datetime.now(dt.UTC)
    items, alerts = [], []
    for s in sensors_with_last(ctx.db, ctx.farm_ids) if ctx.farms else []:
        if s.last_at is None or now - s.last_at > OFFLINE_AFTER:
            state = "offline"
        elif s.optimal and s.last_value < s.optimal[0]:
            state = "low"
        elif s.optimal and s.last_value > s.optimal[1]:
            state = "high"
        else:
            state = "ok"
        item = {
            "farm": ctx.farm_name(s.farm_id),
            "sensor": s.name,
            "type": s.label,
            "value": s.last_value,
            "unit": s.unit,
            "optimal": list(s.optimal) if s.optimal else None,
            "state": state,
            "last_at": s.last_at.isoformat() if s.last_at else None,
        }
        items.append(item)
        if state != "ok":
            alerts.append(item)
    return {"count": len(items), "alerts": alerts[:MAX_ITEMS], "sensors": items[:MAX_ITEMS]}


# --- Tareas ------------------------------------------------------------------------------------------------


def _task_item(ctx: AgentContext, t: Task, worker: str | None) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "category": t.category,
        "farm": ctx.farm_name(t.farm_id),
        "start": t.date.isoformat(),
        "end": (t.end_date or t.date).isoformat(),
        "status": t.status.value,
        "worker": worker,
    }


def tasks_snapshot(ctx: AgentContext, days: int = 7) -> dict:
    """Tareas abiertas: vencidas, en curso hoy y próximas `days` días."""
    if not ctx.farms:
        return {"overdue": [], "today": [], "upcoming": []}
    end_col = func.coalesce(Task.end_date, Task.date)
    rows = ctx.db.execute(
        select(Task, Worker.name)
        .outerjoin(Worker, Task.worker_id == Worker.id)
        .where(Task.farm_id.in_(ctx.farm_ids), Task.status != TaskStatus.DONE, Task.date <= ctx.today + dt.timedelta(days=days))
        .order_by(Task.date, Task.id)
        .limit(200)
    ).all()
    overdue, today, upcoming = [], [], []
    for task, worker in rows:
        end = task.end_date or task.date
        item = _task_item(ctx, task, worker)
        if end < ctx.today:
            overdue.append(item)
        elif task.date <= ctx.today:
            today.append(item)
        else:
            upcoming.append(item)
    del end_col
    return {"overdue": overdue[:MAX_ITEMS], "today": today[:MAX_ITEMS], "upcoming": upcoming[:MAX_ITEMS]}


# --- Economía -------------------------------------------------------------------------------------------------


def economy_snapshot(ctx: AgentContext, year: int | None = None) -> dict:
    """Presupuesto anual consumido por finca (mismo cálculo que la vista Economía) y categorías principales."""
    year = year or ctx.today.year
    farms = []
    categories: dict[str, float] = defaultdict(float)
    for f in ctx.farms:
        consumed = finance.consumed(ctx.db, [f.id], year)
        total = float(f.budget_total) if f.budget_total is not None else None
        farms.append(
            {
                "farm": f.name,
                "budget": total,
                "consumed": consumed,
                "pct": round(consumed / total * 100, 1) if total else None,
                "remaining": round(total - consumed, 2) if total is not None else None,
            }
        )
        for _m, category, _h, _fx, amount in finance.expense_rows(ctx.db, [f.id], year):
            categories[category] += finance.money(amount)
        for _m, doc_type, amount in finance.invoice_rows(ctx.db, [f.id], year):
            categories[finance.INVOICE_CATEGORY[doc_type]] += finance.money(amount)
    top = sorted(categories.items(), key=lambda kv: -kv[1])[:6]
    return {
        "year": year,
        "farms": farms,
        "total_consumed": _money(sum(x["consumed"] for x in farms)),
        "top_categories": [{"category": k, "amount": _money(v)} for k, v in top],
    }


# --- Documentos (recordatorios) ---------------------------------------------------------------------------


def reminders_snapshot(ctx: AgentContext, days: int = 14) -> list[dict]:
    if not ctx.farms:
        return []
    rows = ctx.db.execute(
        select(DocumentNote, Document.reference, Document.filename)
        .join(Document, DocumentNote.document_id == Document.id)
        .where(
            Document.farm_id.in_(ctx.farm_ids),
            Document.is_draft.is_(False),
            DocumentNote.done.is_(False),
            DocumentNote.remind_on.is_not(None),
            DocumentNote.remind_on <= ctx.today + dt.timedelta(days=days),
        )
        .order_by(DocumentNote.remind_on)
        .limit(MAX_ITEMS)
    ).all()
    return [
        {"date": n.remind_on.isoformat(), "overdue": n.remind_on < ctx.today, "note": n.body[:200], "document": ref or name}
        for n, ref, name in rows
    ]


# --- Equipo ----------------------------------------------------------------------------------------------------


def workers_snapshot(ctx: AgentContext) -> list[dict]:
    """Equipo activo y tareas abiertas por persona. Sin sueldos: el agente no los necesita para organizar trabajo."""
    workers = list(ctx.db.scalars(select(Worker).where(Worker.owner_id == ctx.user.id, Worker.active.is_(True)).order_by(Worker.name)))
    if not workers:
        return []
    counts = dict(
        ctx.db.execute(
            select(Task.worker_id, func.count(Task.id))
            .where(Task.worker_id.in_([w.id for w in workers]), Task.status != TaskStatus.DONE)
            .group_by(Task.worker_id)
        ).all()
    )
    return [
        {"id": w.id, "name": w.name, "position": w.position, "open_tasks": counts.get(w.id, 0), "schedule": w.schedule}
        for w in workers[:50]
    ]


# --- SIEX -------------------------------------------------------------------------------------------------------


def siex_snapshot(ctx: AgentContext, year: int | None = None) -> list[dict]:
    from routers.siex import build_draft  # import diferido (siex → agent_service → agent_tools)

    year = year or ctx.today.year
    out = []
    for f in ctx.farms[:5]:
        draft = build_draft(ctx.db, f, year)
        out.append(
            {
                "farm": f.name,
                "year": year,
                "treatments": len(draft.treatments),
                "operations": len(draft.operations),
                "water_m3": round(draft.water_total_liters / 1000, 1),
                "checks": [c.message for c in draft.checks],
            }
        )
    return out


# --- Resumen diario ------------------------------------------------------------------------------------------


def briefing(ctx: AgentContext) -> list[dict]:
    """Lo importante de hoy, priorizado: alertas de sensores, tareas vencidas o de hoy, recordatorios y presupuesto."""
    items: list[dict] = []
    sensors = sensors_snapshot(ctx)
    for a in sensors["alerts"][:4]:
        if a["state"] == "offline":
            items.append({"level": "warning", "area": "sensors", "text": f"{a['sensor']} ({a['farm']}) sin señal", "link": "/dashboard"})
        else:
            word = "por debajo" if a["state"] == "low" else "por encima"
            items.append({
                "level": "alert", "area": "sensors",
                "text": f"{a['type']} {word} del rango en {a['sensor']} ({a['farm']}): {a['value']:g} {a['unit']}",
                "link": "/dashboard",
            })
    tasks = tasks_snapshot(ctx, days=0)
    if tasks["overdue"]:
        n = len(tasks["overdue"])
        items.append({"level": "alert", "area": "tasks", "text": f"{n} tarea{'s' if n > 1 else ''} con retraso: {tasks['overdue'][0]['title']}{'…' if n > 1 else ''}", "link": "/tasks"})
    if tasks["today"]:
        n = len(tasks["today"])
        items.append({"level": "info", "area": "tasks", "text": f"{n} tarea{'s' if n > 1 else ''} para hoy: {', '.join(t['title'] for t in tasks['today'][:3])}", "link": "/tasks"})
    reminders = reminders_snapshot(ctx, days=3)
    if reminders:
        late = sum(1 for r in reminders if r["overdue"])
        items.append({
            "level": "alert" if late else "info", "area": "documents",
            "text": f"{len(reminders)} recordatorio{'s' if len(reminders) > 1 else ''} de documentos{f' ({late} vencido)' if late else ''}: {reminders[0]['note'][:80]}",
            "link": "/documents",
        })
    for f in economy_snapshot(ctx)["farms"]:
        if f["pct"] is not None and f["pct"] >= 90:
            items.append({
                "level": "alert" if f["pct"] >= 100 else "warning", "area": "economy",
                "text": f"{f['farm']}: presupuesto al {f['pct']:g} % ({f['consumed']:.2f} € de {f['budget']:.2f} €)",
                "link": "/economia",
            })
    if not items:
        items.append({"level": "ok", "area": "general", "text": "Todo en orden: sin alertas de sensores, tareas atrasadas ni recordatorios próximos.", "link": None})
    return items
