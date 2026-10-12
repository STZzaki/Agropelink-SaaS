"""Siembra masiva: idempotente, contraseñas Argon2, datos válidos para la API y reparación de valores antiguos."""

import datetime as dt
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import seed as seed_module
from config import get_settings
from conftest import CSRF
from database import SessionLocal
from models import Document, Expense, Farm, ForumThread, Harvest, Sensor, SensorSample, Task, TaskStatus, User, Worker
from security import verify_password


@pytest.fixture(scope="module")
def seeded(_app):
    upload_dir = Path(get_settings().upload_dir)  # el mismo almacenamiento privado del que descarga la API
    with SessionLocal() as db:
        # Restos de la versión anterior del script: valores fuera de catálogo y factura sin archivo.
        legacy_owner = User(email="legacy@finca-test.es", name="Legado", hashed_password="x", role=seed_module.UserRole.FARMER)
        db.add(legacy_owner)
        db.flush()
        farm = Farm(name="Finca Legado", location="Écija, Sevilla", owner_id=legacy_owner.id)
        db.add(farm)
        db.flush()
        db.add(Expense(farm_id=farm.id, category="Gasoil", concept="Repostaje tractor B", amount=450, incurred_on=dt.date.today()))
        db.add(Task(farm_id=farm.id, title="Revisión de riego", category="water", date=dt.date.today()))
        db.add(Document(farm_id=farm.id, filename="factura.pdf", file_url="ejemplo-uuid-falso-para-archivo", doc_type=seed_module.DocumentType.INVOICE_FUEL, reference="FCT-2026-001"))
        db.commit()

        first = seed_module.seed(db, upload_dir=upload_dir, log=lambda *_: None)
        db.commit()
        second = seed_module.seed(db, upload_dir=upload_dir, log=lambda *_: None)
        db.commit()
    return first, second, upload_dir


def _login(app, email, password):
    c = TestClient(app, base_url="https://testserver", headers=CSRF)
    assert c.post("/api/v1/auth/login", json={"email": email, "password": password}).status_code == 200
    return c


class TestSeed:
    def test_creates_everything_once(self, seeded):
        first, second, _ = seeded
        for kind in ("cuentas", "fincas", "cosechas", "trabajadores", "tareas", "costes", "documentos (PDF)", "sensores", "hilos del foro", "respuestas del foro"):
            assert first.created.get(kind, 0) > 0, kind
        # Segunda ejecución: nada duplicado (solo, como mucho, unas pocas lecturas nuevas del último cuarto de hora).
        assert set(second.created) <= {"lecturas de sensores"} and second.credentials == []
        with SessionLocal() as db:
            seeded_titles = [t[2] for t in seed_module.THREADS]  # la BD de pruebas es compartida: solo los de la siembra
            titles = db.scalars(select(ForumThread.title).where(ForumThread.title.in_(seeded_titles))).all()
            assert sorted(titles) == sorted(seeded_titles)
            assert db.scalar(select(func.count(Farm.id)).where(Farm.name == "Cortijo El Alquián")) == 1

    def test_four_profiles_with_argon2(self, seeded):
        first, _, _ = seeded
        profiles = {p for p, _, _ in first.credentials}
        assert profiles == {"admin", "farmer", "worker", "user"}
        with SessionLocal() as db:
            for _, email, password in first.credentials:
                user = db.scalar(select(User).where(User.email == email))
                assert user.hashed_password.startswith("$argon2id$") and verify_password(password, user.hashed_password)
                assert len(password) >= 16
            # Las cuentas «trabajador» están vinculadas a su ficha de trabajador.
            worker = db.scalar(select(Worker).where(Worker.name == "Manuel Operario"))
            assert worker.user_id == db.scalar(select(User.id).where(User.email == "manuel@agropelink.es"))

    def test_data_is_valid_through_the_api(self, _app, seeded):
        first, _, _ = seeded
        creds = {email: pwd for _, email, pwd in first.credentials}
        rocio = _login(_app, "rocio@agropelink.es", creds["rocio@agropelink.es"])
        farm = next(f for f in rocio.get("/api/v1/farms").json() if f["name"] == "Cortijo El Alquián")
        assert farm["harvest_mode"] == "multiple" and farm["budget_total"] == 42000

        fin = rocio.get(f"/api/v1/farms/{farm['id']}/finance").json()
        assert fin["budget"]["consumed"] > 0 and {c["key"] for c in fin["by_category"]} >= {"seeds", "fertilizers"}

        tasks = rocio.get("/api/v1/tasks", params={"farm_id": farm["id"]}).json()
        assert {t["status"] for t in tasks} == {"pending", "in_progress", "done"} and all(t["worker_id"] for t in tasks)

        docs = rocio.get("/api/v1/documents").json()["items"]
        assert all(d["reference"].startswith("AGRO-") for d in docs)
        pdf = rocio.get(f"/api/v1/documents/{docs[0]['id']}/download")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")

        sensors = rocio.get(f"/api/v1/farms/{farm['id']}/sensors").json()
        assert len(sensors) == 4 and all(s["last_value"] is not None for s in sensors)
        ce = next(s for s in sensors if s["kind"] == "conductivity")
        assert ce["last_value"] > ce["optimal"][1]  # alerta visible en el panel
        series = rocio.get(f"/api/v1/farms/{farm['id']}/sensors/series", params={"hours": 24}).json()
        assert all(len(s["points"]) >= 90 for s in series["series"])

        briefing = rocio.get("/api/v1/agent/briefing").json()["items"]
        assert any(i["area"] == "sensors" for i in briefing)

        manuel = _login(_app, "manuel@agropelink.es", creds["manuel@agropelink.es"])
        assert manuel.get("/api/v1/me/tasks").json()  # el trabajador ve sus tareas

        forum = rocio.get("/api/v1/forum/threads", params={"limit": 50}).json()["items"]
        assert {t["category"] for t in forum} >= {"plagas", "lonjas", "riego"}
        assert rocio.get("/api/v1/forum/mentions").status_code == 200

    def test_legacy_values_are_repaired(self, seeded):
        _, _, upload_dir = seeded
        with SessionLocal() as db:
            legacy = db.scalar(select(Farm).where(Farm.name == "Finca Legado"))
            assert db.scalar(select(Expense.category).where(Expense.farm_id == legacy.id)) == "fuel"
            assert db.scalar(select(Task.category).where(Task.farm_id == legacy.id)) == "irrigation"
            doc = db.scalar(select(Document).where(Document.farm_id == legacy.id))
            assert doc.reference.startswith("AGRO-") and (upload_dir / doc.file_url).read_bytes().startswith(b"%PDF-")

    def test_pdf_generator_is_valid_and_inert(self):
        pdf = seed_module.make_pdf(["FACTURA", "Gasóleo (B) 600 l", "TOTAL: 702,00 EUR"])
        assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
        assert b"/JavaScript" not in pdf and b"/Launch" not in pdf
