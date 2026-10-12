"""Bloque 6: notas personales y recordatorios en cada documento del archivo."""

import datetime as dt

import pytest

TODAY = dt.date.today()


def _doc(client):
    farm_id = client.post("/api/v1/farms", json={"name": "Finca Docs", "location": "Huelva"}).json()["id"]
    r = client.post(
        "/api/v1/documents/upload",
        data={"farm_id": farm_id, "doc_type": "invoice_seeds", "status": "pending", "amount": "120"},
        files={"file": ("factura.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf")},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestNotes:
    def test_crud_and_summary_in_list(self, user):
        doc = _doc(user)
        r = user.post(f"/api/v1/documents/{doc}/notes", json={"body": "Pagar antes del <b>día 30</b>\nTransferencia", "remind_on": (TODAY + dt.timedelta(days=5)).isoformat()})
        assert r.status_code == 201, r.text
        note = r.json()
        assert note["body"] == "Pagar antes del día 30\nTransferencia" and note["done"] is False  # HTML eliminado, saltos conservados
        user.post(f"/api/v1/documents/{doc}/notes", json={"body": "Reclamar el IVA"})

        notes = user.get(f"/api/v1/documents/{doc}/notes").json()
        assert [n["body"].split("\n")[0] for n in notes] == ["Pagar antes del día 30", "Reclamar el IVA"]  # con fecha primero
        listed = next(d for d in user.get("/api/v1/documents").json()["items"] if d["id"] == doc)
        assert listed["note_count"] == 2 and listed["next_reminder"] == (TODAY + dt.timedelta(days=5)).isoformat()

        r = user.patch(f"/api/v1/documents/{doc}/notes/{note['id']}", json={"done": True})
        assert r.json()["done"] is True
        listed = next(d for d in user.get("/api/v1/documents").json()["items"] if d["id"] == doc)
        assert listed["next_reminder"] is None  # las hechas no cuentan como pendientes

        assert user.patch(f"/api/v1/documents/{doc}/notes/{note['id']}", json={"body": "Pagado"}).json()["body"] == "Pagado"
        assert user.delete(f"/api/v1/documents/{doc}/notes/{note['id']}").status_code == 204
        assert len(user.get(f"/api/v1/documents/{doc}/notes").json()) == 1

    def test_reminders_overdue_and_upcoming(self, user):
        doc = _doc(user)
        for days, body in ((-2, "Vencida"), (3, "Pronto"), (90, "Lejana")):
            user.post(f"/api/v1/documents/{doc}/notes", json={"body": body, "remind_on": (TODAY + dt.timedelta(days=days)).isoformat()})
        mine = [r for r in user.get("/api/v1/documents/reminders").json() if r["document_id"] == doc]
        assert [(r["body"], r["overdue"]) for r in mine] == [("Vencida", True), ("Pronto", False)]
        assert mine[0]["reference"].startswith("AGRO-") and mine[0]["filename"] == "factura.pdf"
        assert len([r for r in user.get("/api/v1/documents/reminders", params={"days": 120}).json() if r["document_id"] == doc]) == 3

    @pytest.mark.parametrize(
        "payload",
        [{"body": ""}, {"body": "x" * 2001}, {"body": "ok", "remind_on": "1999-01-01"}, {"body": "ok", "extra": 1}, {"body": "<script></script>"}],
        ids=["empty", "too-long", "old-date", "extra-field", "only-html"],
    )
    def test_invalid_notes(self, user, payload):
        doc = _doc(user)
        assert user.post(f"/api/v1/documents/{doc}/notes", json=payload).status_code == 422

    def test_notes_are_private(self, user, other_user, std_user):
        doc = _doc(user)
        nid = user.post(f"/api/v1/documents/{doc}/notes", json={"body": "Privada", "remind_on": TODAY.isoformat()}).json()["id"]
        assert other_user.get(f"/api/v1/documents/{doc}/notes").status_code == 404
        assert other_user.post(f"/api/v1/documents/{doc}/notes", json={"body": "Intrusa"}).status_code == 404
        assert other_user.patch(f"/api/v1/documents/{doc}/notes/{nid}", json={"done": True}).status_code == 404
        assert other_user.delete(f"/api/v1/documents/{doc}/notes/{nid}").status_code == 404
        assert all(r["document_id"] != doc for r in other_user.get("/api/v1/documents/reminders").json())
        assert std_user.get("/api/v1/documents/reminders").status_code == 403
        # Una nota no se alcanza a través de OTRO documento (aunque sea propio).
        other_doc = _doc(user)
        assert user.patch(f"/api/v1/documents/{other_doc}/notes/{nid}", json={"done": True}).status_code == 404

    def test_deleting_document_removes_notes(self, user):
        doc = _doc(user)
        user.post(f"/api/v1/documents/{doc}/notes", json={"body": "Se irá con el documento", "remind_on": TODAY.isoformat()})
        assert user.delete(f"/api/v1/documents/{doc}").status_code == 204
        assert all(r["document_id"] != doc for r in user.get("/api/v1/documents/reminders").json())
