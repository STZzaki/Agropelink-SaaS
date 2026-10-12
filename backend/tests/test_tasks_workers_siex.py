"""Bloque 4: tareas multidía con gastos y adjuntos, trabajadores con vinculación por código y borrador SIEX."""

import datetime as dt
import io

import pytest
from PIL import Image

from routers import assigned

YEAR = dt.date.today().year
D = lambda m, d: dt.date(YEAR, m, d).isoformat()  # noqa: E731


def _farm(client, **extra):
    return client.post("/api/v1/farms", json={"name": "Finca Tareas", "location": "Almería", **extra}).json()["id"]


def _jpeg_with_gps():
    img = Image.new("RGB", (40, 30), (91, 173, 94))
    exif = Image.Exif()
    exif.get_ifd(0x8825).update({1: "N", 2: (36.0, 50.0, 30.0)})
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif.tobytes())
    return out.getvalue()


@pytest.fixture(autouse=True)
def _reset_link_limiter():
    """El límite de intentos es en memoria y por IP (todas las pruebas comparten la de TestClient)."""
    assigned._link_limiter._events.clear()
    yield


WORKER = {"name": "Lucía Martín", "position": "applicator", "monthly_salary": 1450, "hourly_cost": 13.5,
          "schedule": {"days": ["mon", "tue", "wed", "thu", "fri"], "start": "07:30", "end": "14:30"}}


class TestTasks:
    def test_multiday_task_with_costs_feeds_economy(self, user):
        farm_id = _farm(user)
        r = user.post("/api/v1/tasks", json={
            "title": "Tratamiento oídio", "farm_id": farm_id, "category": "treatment", "date": D(3, 10), "end_date": D(3, 12),
            "description": "Línea 1\n" + "Detalle " * 900,  # ~7 KB: descripciones largas permitidas
            "costs": [{"category": "phytosanitary", "concept": "Azufre", "amount": 85.4}, {"category": "labor", "concept": "Jornal", "amount": 60}],
        })
        assert r.status_code == 201, r.text
        task = r.json()
        assert task["end_date"] == D(3, 12) and task["direct_cost"] == 145.4
        expenses = user.get(f"/api/v1/farms/{farm_id}/expenses").json()
        assert {e["concept"] for e in expenses} == {"Azufre", "Jornal"} and all(e["incurred_on"] == D(3, 10) for e in expenses)
        assert user.get(f"/api/v1/farms/{farm_id}/finance", params={"year": YEAR}).json()["budget"]["variable"] == 145.4

        # El calendario pide un rango: la tarea de 3 días aparece en cualquier semana que toque.
        assert [t["id"] for t in user.get("/api/v1/tasks", params={"from": D(3, 12), "to": D(3, 20)}).json()] == [task["id"]]
        assert user.get("/api/v1/tasks", params={"from": D(3, 13), "to": D(3, 20)}).json() == []

        # Borrar la tarea conserva sus gastos en Economía.
        assert user.delete(f"/api/v1/tasks/{task['id']}").status_code == 204
        assert len(user.get(f"/api/v1/farms/{farm_id}/expenses").json()) == 2

    @pytest.mark.parametrize(
        "patch",
        [{"end_date": D(1, 1), "date": D(2, 1)}, {"category": "party"}, {"costs": [{"category": "seeds", "concept": "X", "amount": -5}]}, {"description": "x" * 10_001}],
        ids=["end-before-start", "bad-category", "negative-cost", "too-long"],
    )
    def test_invalid_tasks_rejected(self, user, patch):
        farm_id = _farm(user)
        assert user.post("/api/v1/tasks", json={"title": "T", "farm_id": farm_id, "date": D(2, 1), **patch}).status_code == 422

    def test_update_checks_final_span(self, user):
        farm_id = _farm(user)
        tid = user.post("/api/v1/tasks", json={"title": "T", "farm_id": farm_id, "date": D(4, 1), "end_date": D(4, 3)}).json()["id"]
        assert user.put(f"/api/v1/tasks/{tid}", json={"date": D(4, 9)}).status_code == 422
        assert user.put(f"/api/v1/tasks/{tid}", json={"date": D(4, 2)}).json()["end_date"] == D(4, 3)

    def test_attachments_secure_and_private(self, user, other_user):
        farm_id = _farm(user)
        tid = user.post("/api/v1/tasks", json={"title": "T", "farm_id": farm_id, "date": D(5, 1)}).json()["id"]
        r = user.post(f"/api/v1/tasks/{tid}/attachments", files={"file": ("foto.jpg", _jpeg_with_gps(), "image/jpeg")})
        assert r.status_code == 201, r.text
        img = r.json()["attachments"][0]
        assert img["kind"] == "image"
        photo = user.get(f"/api/v1/tasks/{tid}/attachments/{img['id']}")
        assert photo.headers["x-content-type-options"] == "nosniff" and not Image.open(io.BytesIO(photo.content)).getexif()

        pdf = user.post(f"/api/v1/tasks/{tid}/attachments", files={"file": ("receta.pdf", b"%PDF-1.4\n1 0 obj\n%%EOF\n", "application/pdf")})
        assert pdf.status_code == 201 and pdf.json()["attachments"][1]["kind"] == "pdf"
        doc = user.get(f"/api/v1/tasks/{tid}/attachments/{pdf.json()['attachments'][1]['id']}")
        assert doc.headers["content-disposition"].startswith("attachment")

        bad = [("x.php.jpg", b"<?php system($_GET['c']); ?>", "image/jpeg"), ("a.pdf", b"%PDF-1.4 /JavaScript (alert(1))", "application/pdf"), ("s.svg", b"<svg onload=alert(1)>", "image/svg+xml")]
        for name, content, mime in bad:
            assert user.post(f"/api/v1/tasks/{tid}/attachments", files={"file": (name, content, mime)}).status_code == 415, name

        assert other_user.get(f"/api/v1/tasks/{tid}/attachments/{img['id']}").status_code == 404
        assert other_user.post(f"/api/v1/tasks/{tid}/attachments", files={"file": ("f.jpg", _jpeg_with_gps(), "image/jpeg")}).status_code == 404
        assert user.delete(f"/api/v1/tasks/{tid}/attachments/{img['id']}").status_code == 204


class TestWorkers:
    def test_worker_crud_and_assignment(self, user, other_user):
        w = user.post("/api/v1/workers", json=WORKER)
        assert w.status_code == 201 and w.json()["schedule"]["start"] == "07:30" and w.json()["linked"] is False
        wid = w.json()["id"]
        farm_id = _farm(user)
        t = user.post("/api/v1/tasks", json={"title": "Poda", "farm_id": farm_id, "date": D(6, 1), "worker_id": wid, "category": "pruning"})
        assert t.status_code == 201 and t.json()["worker_id"] == wid
        assert user.get("/api/v1/workers").json()[0]["open_tasks"] == 1
        # No se puede asignar un trabajador ajeno.
        foreign = other_user.post("/api/v1/workers", json=WORKER).json()["id"]
        assert user.post("/api/v1/tasks", json={"title": "X", "farm_id": farm_id, "date": D(6, 1), "worker_id": foreign}).status_code == 404
        assert other_user.put(f"/api/v1/workers/{wid}", json=WORKER).status_code == 404
        # Borrar el trabajador deja la tarea sin asignar.
        assert user.delete(f"/api/v1/workers/{wid}").status_code == 204
        assert user.get("/api/v1/tasks").json()[0]["worker_id"] is None

    @pytest.mark.parametrize(
        "schedule",
        [{"days": ["mon"], "start": "15:00", "end": "08:00"}, {"days": [], "start": "08:00", "end": "15:00"}, {"days": ["lun"], "start": "08:00", "end": "15:00"}],
        ids=["end-before-start", "no-days", "bad-day"],
    )
    def test_invalid_schedule(self, user, schedule):
        assert user.post("/api/v1/workers", json={**WORKER, "schedule": schedule}).status_code == 422

    def test_link_by_code_and_worker_view(self, _app, user, std_user):
        wid = user.post("/api/v1/workers", json=WORKER).json()["id"]
        farm_id = _farm(user)
        tid = user.post("/api/v1/tasks", json={"title": "Tratar sector 2", "farm_id": farm_id, "date": D(7, 1), "worker_id": wid, "category": "treatment",
                                               "costs": [{"category": "phytosanitary", "concept": "Cobre", "amount": 40}]}).json()["id"]
        user.post(f"/api/v1/tasks/{tid}/attachments", files={"file": ("foto.jpg", _jpeg_with_gps(), "image/jpeg")})
        user.post("/api/v1/tasks", json={"title": "Tarea de otro", "farm_id": farm_id, "date": D(7, 1)})

        code = user.post(f"/api/v1/workers/{wid}/invite").json()["code"]
        assert len(code) == 11 and code[5] == "-"
        assert std_user.post("/api/v1/me/worker-links", json={"code": "AAAAA-BBBBB"}).status_code == 400
        r = std_user.post("/api/v1/me/worker-links", json={"code": code.lower().replace("-", "")})
        assert r.status_code == 201 and r.json()["employer_name"] == "Ana"
        # Código de un solo uso.
        assert std_user.post("/api/v1/me/worker-links", json={"code": code}).status_code == 400

        mine = std_user.get("/api/v1/me/tasks").json()
        assert [t["title"] for t in mine] == ["Tratar sector 2"]
        assert "direct_cost" not in mine[0] and mine[0]["farm_name"] == "Finca Tareas"
        att = mine[0]["attachments"][0]["id"]
        assert std_user.get(f"/api/v1/me/tasks/{tid}/attachments/{att}").status_code == 200
        assert std_user.put(f"/api/v1/me/tasks/{tid}/status", json={"status": "done"}).json()["status"] == "done"
        # El trabajador no accede a la gestión del agricultor.
        assert std_user.get("/api/v1/tasks").status_code == 403
        assert std_user.put(f"/api/v1/me/tasks/{tid}/status", json={"status": "done", "title": "x"}).status_code == 422

        listed = user.get("/api/v1/workers").json()[0]
        assert listed["linked"] and listed["linked_account_name"] == "Carla" and "email" not in listed

        # Desactivar la ficha corta el acceso; desvincularse también.
        user.put(f"/api/v1/workers/{wid}", json={**WORKER, "active": False})
        assert std_user.get("/api/v1/me/tasks").json() == []
        assert std_user.get(f"/api/v1/me/tasks/{tid}/attachments/{att}").status_code == 404
        user.put(f"/api/v1/workers/{wid}", json=WORKER)
        assert std_user.delete(f"/api/v1/me/worker-links/{wid}").status_code == 204
        assert std_user.get("/api/v1/me/tasks").json() == []

    def test_cannot_link_to_own_worker_and_brute_force_limited(self, user):
        wid = user.post("/api/v1/workers", json=WORKER).json()["id"]
        code = user.post(f"/api/v1/workers/{wid}/invite").json()["code"]
        assert user.post("/api/v1/me/worker-links", json={"code": code}).status_code == 400
        statuses = [user.post("/api/v1/me/worker-links", json={"code": f"ZZZZZ-ZZZ{i:02d}"}).status_code for i in range(12)]
        assert 429 in statuses


class TestSiex:
    def test_draft_collects_water_inputs_and_operations(self, user):
        farm_id = _farm(
            user,
            harvests=[{"name": "Tomate", "surface_ha": 2, "plant_count": 40000}],
            inputs=[{"name": "Azufre mojable", "kind": "phytosanitary"}, {"name": "Nitrato cálcico", "kind": "fertilizer"}],
        )
        user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": D(2, 3), "water_liters": 1200})
        user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": D(2, 20), "water_liters": 800})
        user.post("/api/v1/tasks", json={"title": "Azufrado", "farm_id": farm_id, "date": D(3, 1), "category": "treatment",
                                         "costs": [{"category": "phytosanitary", "concept": "Azufre", "amount": 50}]})
        user.post("/api/v1/tasks", json={"title": "Riego", "farm_id": farm_id, "date": D(3, 2), "category": "irrigation"})

        draft = user.get(f"/api/v1/farms/{farm_id}/siex/draft").json()
        assert draft["engine"] == "local" and draft["year"] == YEAR
        assert draft["water_total_liters"] == 2000 and draft["water"][1]["liters"] == 2000
        assert [t["title"] for t in draft["treatments"]] == ["Azufrado"] and len(draft["operations"]) == 2
        assert {"category": "phytosanitary", "amount": 50} in draft["input_spend"]
        messages = " ".join(c["message"] for c in draft["checks"])
        assert "sin nº de registro" in messages and "sin aplicador" in messages

    def test_siex_is_private(self, user, other_user, std_user):
        farm_id = _farm(user)
        assert other_user.get(f"/api/v1/farms/{farm_id}/siex/draft").status_code == 404
        assert std_user.get(f"/api/v1/farms/{farm_id}/siex/draft").status_code == 403
