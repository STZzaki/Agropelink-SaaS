"""Agropelink AI conectado a la plataforma: motor local con datos reales, propuestas validadas, motores opcionales."""

import datetime as dt

import pytest

import agent_service
from config import get_settings
from routers import agent as agent_router

TODAY = dt.date.today()


@pytest.fixture(autouse=True)
def _no_third_parties(monkeypatch):
    """Por defecto el agente NO puede contactar con Gemini ni con ningún modelo externo."""

    def forbidden(*_a, **_k):
        raise AssertionError("El motor local no debe llamar a ningún modelo externo")

    monkeypatch.setattr(agent_service, "_get_client", forbidden)
    monkeypatch.setattr(get_settings(), "agent_engine", "auto")
    monkeypatch.setattr(get_settings(), "ollama_url", None)
    for limiter in (agent_router._agent_by_user, agent_router._agent_by_ip):
        limiter._events.clear()
    yield


def _ask(client, message, history=None):
    r = client.post("/api/v1/agent/chat", json={"message": message, "history": history or []})
    assert r.status_code == 200, r.text
    return r.json()


def _setup_farm(client, name="Finca Norte", budget=1000):
    farm = client.post("/api/v1/farms", json={"name": name, "location": "Níjar, Almería", "budget_total": budget}).json()["id"]
    sensor = client.post(f"/api/v1/farms/{farm}/sensors", json={"name": "Sonda CE gotero", "kind": "conductivity"}).json()["id"]
    client.post(f"/api/v1/farms/{farm}/sensors/{sensor}/samples", json={"samples": [{"value": 4.2}]})  # rango 0,5–2,5
    return farm


class TestLocalEngine:
    def test_sensors_answer_uses_real_data(self, user):
        _setup_farm(user)
        r = _ask(user, "¿Cómo están los sensores?")
        assert r["engine"] == "local" and r["action"] is None
        assert "Sonda CE gotero" in r["reply"] and "por encima del rango" in r["reply"] and "4,2" in r["reply"]

    def test_economy_and_tasks_answers(self, user):
        farm = _setup_farm(user, budget=2000)
        user.post(f"/api/v1/farms/{farm}/expenses", json={"category": "fuel", "concept": "Gasóleo", "amount": 500, "incurred_on": TODAY.isoformat()})
        user.post("/api/v1/tasks", json={"title": "Tratar oídio", "farm_id": farm, "date": (TODAY - dt.timedelta(days=3)).isoformat(), "category": "treatment"})
        eco = _ask(user, "¿Cuánto llevo gastado este año?")["reply"]
        assert "500 €" in eco and "2.000 €" in eco and "25 %" in eco
        tasks = _ask(user, "¿Qué tareas tengo pendientes?")["reply"]
        assert "Con retraso" in tasks and "Tratar oídio" in tasks

    def test_question_never_creates(self, user):
        _setup_farm(user)
        r = _ask(user, "¿Qué hay que hacer mañana?")
        assert r["action"] is None

    def test_task_proposal_with_farm_worker_and_dates(self, user):
        _setup_farm(user, name="Finca Sur")
        wid = user.post("/api/v1/workers", json={"name": "Lucía Martín", "position": "applicator"}).json()["id"]
        r = _ask(user, "Programa un tratamiento contra oídio en Finca Sur del 14 al 16 de diciembre para Lucía")
        a = r["action"]
        assert a["type"] == "create_task" and a["category"] == "treatment" and a["worker_id"] == wid
        assert a["date"].endswith("-12-14") and a["end_date"].endswith("-12-16")
        assert a["title"] == "Tratamiento contra oídio"  # sin la finca ni la persona, que van en sus campos
        # La propuesta no crea nada por sí sola.
        assert user.get("/api/v1/tasks").json() == []

    def test_expense_proposal(self, user):
        farm = _setup_farm(user)
        a = _ask(user, "He gastado 1.234,50 € en gasóleo")["action"]
        assert a == {**a, "type": "register_expense", "category": "fuel", "amount": 1234.5, "farm_id": farm, "incurred_on": TODAY.isoformat()}

    def test_knowledge_and_help(self, user):
        assert "mosca blanca" in _ask(user, "¿Qué hago contra la mosca blanca?")["reply"].lower()
        assert "Resumen de hoy" in _ask(user, "hola")["reply"]

    def test_briefing(self, user, std_user):
        farm = _setup_farm(user, budget=100)
        user.post(f"/api/v1/farms/{farm}/expenses", json={"category": "seeds", "concept": "Semilla", "amount": 150, "incurred_on": TODAY.isoformat()})
        user.post("/api/v1/tasks", json={"title": "Atrasada", "farm_id": farm, "date": (TODAY - dt.timedelta(days=1)).isoformat()})
        items = user.get("/api/v1/agent/briefing").json()["items"]
        areas = {i["area"]: i for i in items}
        assert areas["sensors"]["level"] == "alert" and areas["tasks"]["level"] == "alert" and areas["economy"]["level"] == "alert"
        assert std_user.get("/api/v1/agent/briefing").status_code == 403

    def test_data_is_scoped_to_the_account(self, user, other_user):
        _setup_farm(user, name="Finca Secreta")
        reply = _ask(other_user, "resumen")["reply"] + _ask(other_user, "¿Cómo están los sensores?")["reply"]
        assert "Finca Secreta" not in reply and "Sonda CE gotero" not in reply


class TestModelEngines:
    def test_ollama_gets_minimal_context_and_actions_are_validated(self, user, other_user, monkeypatch):
        monkeypatch.setattr(get_settings(), "ollama_url", "http://ollama.interno:11434")
        farm = _setup_farm(user)
        user.post("/api/v1/workers", json={"name": "Pepe", "position": "laborer", "monthly_salary": 1800})
        foreign_farm = other_user.post("/api/v1/farms", json={"name": "Ajena", "location": "X"}).json()["id"]
        seen = {}

        async def fake_ollama(system, history, message):
            seen["system"] = system
            return f'Te propongo regar.\n```json\n{{"action": "create_task", "title": "Riego", "category": "irrigation", "farm_id": {foreign_farm}, "date": "{TODAY.isoformat()}"}}\n```'

        monkeypatch.setattr(agent_service, "_ollama_generate", fake_ollama)
        r = _ask(user, "¿Cómo están los sensores de la finca?")
        assert r["engine"] == "ollama" and r["reply"] == "Te propongo regar."
        assert r["action"]["farm_id"] is None  # finca ajena inventada por el modelo → descartada
        assert "Sonda CE gotero" in seen["system"]  # recibe los datos que necesita…
        assert "1800" not in seen["system"] and "monthly_salary" not in seen["system"]  # …y no los que no (sueldos)
        assert farm

    def test_ollama_down_falls_back_to_local(self, user, monkeypatch):
        monkeypatch.setattr(get_settings(), "ollama_url", "http://ollama.interno:11434")
        _setup_farm(user)

        async def down(*_):
            raise ConnectionError("sin servicio")

        monkeypatch.setattr(agent_service, "_ollama_generate", down)
        r = _ask(user, "¿Cómo están los sensores?")
        assert r["engine"] == "local" and "Sonda CE gotero" in r["reply"]

    def test_actions_are_always_parsed_locally(self, user, monkeypatch):
        """Aunque haya modelo, «programa/apunta» se interpreta con reglas deterministas (sin llamar al modelo)."""
        monkeypatch.setattr(get_settings(), "ollama_url", "http://ollama.interno:11434")

        async def must_not_call(*_):
            raise AssertionError("no debe llamarse")

        monkeypatch.setattr(agent_service, "_ollama_generate", must_not_call)
        _setup_farm(user)
        assert _ask(user, "Apunta un gasto de 80 euros de abono")["action"]["type"] == "register_expense"


class TestSiexAssist:
    def test_local_narrative(self, user):
        farm = _setup_farm(user)
        user.post("/api/v1/tasks", json={"title": "Azufrado", "farm_id": farm, "date": TODAY.isoformat(), "category": "treatment"})
        d = user.get(f"/api/v1/farms/{farm}/siex/draft", params={"assist": True}).json()
        assert d["engine"] == "local"
        assert "1 tratamiento o abonado (0 realizados)" in d["narrative"]
        assert any("aplicador" in s for s in d["next_steps"])
        plain = user.get(f"/api/v1/farms/{farm}/siex/draft").json()
        assert plain["narrative"] is None and plain["next_steps"] == []

    def test_model_narrative_with_fallback(self, user, monkeypatch):
        monkeypatch.setattr(get_settings(), "ollama_url", "http://ollama.interno:11434")
        farm = _setup_farm(user)

        async def fake(system, history, message):
            return "Resumen redactado por el modelo."

        monkeypatch.setattr(agent_service, "_ollama_generate", fake)
        d = user.get(f"/api/v1/farms/{farm}/siex/draft", params={"assist": True}).json()
        assert d["engine"] == "ollama" and d["narrative"] == "Resumen redactado por el modelo."

        async def down(*_):
            raise TimeoutError()

        monkeypatch.setattr(agent_service, "_ollama_generate", down)
        d = user.get(f"/api/v1/farms/{farm}/siex/draft", params={"assist": True}).json()
        assert d["engine"] == "local" and d["narrative"]
