"""Herramientas de administrador en el foro: borrado forzoso, bloqueo inmediato y middleware global 403."""

import pytest

from conftest import PASSWORD, make_user
from models import UserRole


def _thread(c, body="Consulta sobre el riego por goteo en invernadero de pimiento"):
    r = c.post("/api/v1/forum/threads", json={"category": "riego", "title": "Duda de riego en pimiento", "body": body})
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestAdminDelete:
    def test_admin_force_deletes_any_reply_and_thread(self, user, std_user, admin, client):
        thread_id = _thread(user)
        reply = std_user.post(f"/api/v1/forum/threads/{thread_id}/replies", json={"body": "Respuesta de otra persona"}).json()
        assert admin.delete(f"/api/v1/forum/posts/{reply['id']}/admin", params={"kind": "reply"}).status_code == 204
        assert client.get(f"/api/v1/forum/threads/{thread_id}").json()["replies"] == []
        assert admin.delete(f"/api/v1/forum/posts/{thread_id}/admin", params={"kind": "thread"}).status_code == 204
        assert client.get(f"/api/v1/forum/threads/{thread_id}").status_code == 404
        # Queda constancia para auditoría.
        events = admin.get("/api/v1/admin/moderation/events").json()
        assert any(e["action"] == "content_removed" and "definitivamente" in e["reason"] for e in events)

    @pytest.mark.parametrize("who", ["user", "std_user"])
    def test_non_admins_cannot_force_delete(self, request, user, who):
        thread_id = _thread(user)
        actor = request.getfixturevalue(who)
        # Ni siquiera el propio autor puede usar la herramienta de administración.
        assert actor.delete(f"/api/v1/forum/posts/{thread_id}/admin", params={"kind": "thread"}).status_code == 403

    def test_unknown_post_and_kind(self, admin):
        assert admin.delete("/api/v1/forum/posts/999999/admin", params={"kind": "reply"}).status_code == 404
        assert admin.delete("/api/v1/forum/posts/1/admin", params={"kind": "user"}).status_code == 422


class TestQuickBanAndGlobalMiddleware:
    def test_ban_blocks_every_request_with_403(self, _app, admin, client):
        c, email = make_user(_app, "Infractor", UserRole.USER)
        uid = c.get("/api/v1/auth/me").json()["id"]
        r = admin.put(f"/api/v1/users/{uid}/ban", json={"reason": "Acoso en el foro"})
        assert r.status_code == 200 and r.json() == {"id": uid, "is_banned": True, "ban_reason": "Acoso en el foro"}

        # Todas sus peticiones, incluidas las públicas y de escritura, reciben 403.
        for method, path in [("get", "/api/v1/auth/me"), ("get", "/api/v1/forum/threads"), ("get", "/api/v1/market/fuel"), ("post", "/api/v1/forum/reports")]:
            resp = getattr(c, method)(path, **({"json": {}} if method == "post" else {}))
            assert resp.status_code == 403, (path, resp.status_code)
            assert resp.json()["detail"].startswith("Tu cuenta ha sido suspendida")
        assert client.get("/api/v1/forum/threads").status_code == 200  # el resto del mundo sigue igual
        assert c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 403
        assert c.post("/api/v1/auth/logout").status_code == 204  # puede cerrar sesión

    def test_unban_restores_access(self, _app, admin):
        c, _ = make_user(_app, "Rehabilitado", UserRole.USER)
        uid = c.get("/api/v1/auth/me").json()["id"]
        admin.put(f"/api/v1/users/{uid}/ban")
        assert c.get("/api/v1/auth/me").status_code == 403
        admin.post(f"/api/v1/admin/users/{uid}/unban")
        assert c.get("/api/v1/auth/me").status_code == 200

    def test_cannot_ban_admins_or_self(self, _app, admin):
        me = admin.get("/api/v1/auth/me").json()["id"]
        other_admin, _ = make_user(_app, "Otro admin", UserRole.ADMIN)
        other_id = other_admin.get("/api/v1/auth/me").json()["id"]
        assert admin.put(f"/api/v1/users/{me}/ban").status_code == 400
        assert admin.put(f"/api/v1/users/{other_id}/ban").status_code == 400

    @pytest.mark.parametrize("who", ["user", "std_user"])
    def test_only_admins_can_ban(self, request, _app, who):
        target, _ = make_user(_app, "Objetivo", UserRole.USER)
        tid = target.get("/api/v1/auth/me").json()["id"]
        assert request.getfixturevalue(who).put(f"/api/v1/users/{tid}/ban").status_code == 403
        assert target.get("/api/v1/auth/me").status_code == 200
