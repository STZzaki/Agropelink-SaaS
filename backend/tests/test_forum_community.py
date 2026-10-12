"""Bloque 5: respuestas recientes primero, «Me gusta» y reacciones, fotos en respuestas y @menciones."""

import time

import pytest

from conftest import make_user
from models import UserRole
from routers import forum
from test_forum_media import _image, _mp4, _stored, _upload


@pytest.fixture(autouse=True)
def _reset_limits():
    # Límites en memoria compartidos por todo el proceso de pruebas.
    for limiter in (forum._posts_by_user, forum._reactions_by_user, forum._mention_search, forum._uploads_by_user):
        limiter._events.clear()
    yield


def _thread(c, body="¿Qué umbral de trips usáis en pimiento de otoño en Níjar?", **extra):
    r = c.post("/api/v1/forum/threads", json={"category": "plagas", "title": "Umbral de trips en pimiento", "body": body, **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _reply(c, thread_id, body, **extra):
    return c.post(f"/api/v1/forum/threads/{thread_id}/replies", json={"body": body, **extra})


class TestOrderingAndReactions:
    def test_newest_replies_first(self, user, std_user):
        tid = _thread(user)
        for text in ("primera", "segunda", "tercera"):
            assert _reply(std_user, tid, f"Respuesta {text}").status_code == 201
            time.sleep(0.01)
        bodies = [r["body"] for r in user.get(f"/api/v1/forum/threads/{tid}").json()["replies"]]
        assert bodies == ["Respuesta tercera", "Respuesta segunda", "Respuesta primera"]

    def test_like_and_emoji_reactions_toggle(self, user, std_user, client):
        tid = _thread(user)
        rid = _reply(std_user, tid, "Yo uso 3 trips por flor").json()["id"]

        r = user.put("/api/v1/forum/reactions", json={"thread_id": tid, "reply_id": rid, "kind": "like"})
        assert r.status_code == 200 and r.json() == {"counts": {"like": 1}, "mine": ["like"]}
        std_user.put("/api/v1/forum/reactions", json={"thread_id": tid, "reply_id": rid, "kind": "like"})
        user.put("/api/v1/forum/reactions", json={"thread_id": tid, "reply_id": rid, "kind": "sprout"})
        user.put("/api/v1/forum/reactions", json={"thread_id": tid, "kind": "heart"})  # sobre el tema

        detail = user.get(f"/api/v1/forum/threads/{tid}").json()
        assert detail["replies"][0]["reactions"]["counts"] == {"like": 2, "sprout": 1}
        assert sorted(detail["replies"][0]["reactions"]["mine"]) == ["like", "sprout"]
        assert detail["reactions"] == {"counts": {"heart": 1}, "mine": ["heart"]}
        # Un visitante anónimo ve los recuentos, pero no tiene reacciones propias.
        assert client.get(f"/api/v1/forum/threads/{tid}").json()["replies"][0]["reactions"]["mine"] == []

        # Segundo clic: se quita.
        r = user.put("/api/v1/forum/reactions", json={"thread_id": tid, "reply_id": rid, "kind": "like"})
        assert r.json()["counts"] == {"like": 1, "sprout": 1} and r.json()["mine"] == ["sprout"]

    @pytest.mark.parametrize("payload", [{"kind": "💩"}, {"kind": "like", "reply_id": 999999}, {"kind": "like", "extra": 1}], ids=["free-emoji", "bad-reply", "extra"])
    def test_invalid_reactions(self, user, payload):
        tid = _thread(user)
        assert user.put("/api/v1/forum/reactions", json={"thread_id": tid, **payload}).status_code in (404, 422)

    def test_anonymous_cannot_react(self, user, client):
        tid = _thread(user)
        assert client.put("/api/v1/forum/reactions", json={"thread_id": tid, "kind": "like"}).status_code == 401


class TestReplyPhotos:
    def test_reply_with_photos(self, user, std_user, client):
        tid = _thread(user)
        media = _upload(std_user, "trips.jpg", _image(gps=True), "image/jpeg").json()
        r = _reply(std_user, tid, "Mirad cómo tengo la hoja", media_ids=[media["id"]])
        assert r.status_code == 201, r.text
        assert r.json()["media"][0]["id"] == media["id"]
        reply = client.get(f"/api/v1/forum/threads/{tid}").json()["replies"][0]
        assert reply["media"][0]["url"] == media["url"]
        assert client.get(f"/api/v1/{media['url'].lstrip('/')}").status_code == 200
        # La foto no aparece en la galería del tema, solo en su respuesta.
        assert client.get(f"/api/v1/forum/threads/{tid}").json()["media"] == []

    def test_reply_photos_ownership_and_kind(self, user, std_user):
        tid = _thread(user)
        foreign = _upload(user, "a.jpg", _image(), "image/jpeg").json()["id"]
        assert _reply(std_user, tid, "Robo de foto ajena", media_ids=[foreign]).status_code == 422
        video = _upload(std_user, "v.mp4", _mp4(), "video/mp4").json()["id"]
        assert _reply(std_user, tid, "Un vídeo en respuesta", media_ids=[video]).status_code == 422
        # Una foto ya publicada no se puede reutilizar.
        mine = _upload(std_user, "b.jpg", _image(), "image/jpeg").json()["id"]
        assert _reply(std_user, tid, "Primera vez", media_ids=[mine]).status_code == 201
        assert _reply(std_user, tid, "Reutilizada", media_ids=[mine]).status_code == 422

    def test_admin_hard_delete_removes_reply_photo(self, user, std_user, admin, client):
        tid = _thread(user)
        media = _upload(std_user, "c.jpg", _image(), "image/jpeg").json()
        rid = _reply(std_user, tid, "Respuesta con foto", media_ids=[media["id"]]).json()["id"]
        path = _stored(media["url"])
        assert path.exists()
        assert admin.delete(f"/api/v1/forum/posts/{rid}/admin", params={"kind": "reply"}).status_code == 204
        assert not path.exists()
        assert client.get(f"/api/v1/{media['url'].lstrip('/')}").status_code == 404


class TestMentions:
    """Nombres únicos por prueba: la base de datos de pruebas es compartida entre tests."""

    def test_mention_is_validated_highlighted_and_notified(self, _app):
        olga, _ = make_user(_app, "Olga Mencionada", UserRole.USER)
        pablo, _ = make_user(_app, "Pablo Ignorado", UserRole.USER)
        rita, _ = make_user(_app, "Rita Autora", UserRole.USER)
        tid = _thread(olga)  # Olga ya participa en el foro
        _reply(pablo, tid, "Yo también tengo trips")  # Pablo también

        found = rita.get("/api/v1/forum/mentionable", params={"q": "Olga Menc"}).json()
        assert [u["name"] for u in found] == ["Olga Mencionada"] and "email" not in found[0]

        # Solo cuenta la mención cuyo «@Nombre» aparece en el texto; la de Pablo se ignora.
        ids = [c.get("/api/v1/auth/me").json()["id"] for c in (olga, pablo)]
        r = _reply(rita, tid, "@Olga Mencionada prueba con azufre en polvo", mentions=ids)
        assert r.status_code == 201
        assert [m["name"] for m in r.json()["mentions"]] == ["Olga Mencionada"]

        inbox = olga.get("/api/v1/forum/mentions").json()
        assert inbox["unread"] == 1 and inbox["items"][0]["actor"]["name"] == "Rita Autora" and inbox["items"][0]["thread_id"] == tid
        assert pablo.get("/api/v1/forum/mentions").json()["unread"] == 0
        assert olga.post("/api/v1/forum/mentions/read").status_code == 204
        assert olga.get("/api/v1/forum/mentions").json()["unread"] == 0

    def test_cannot_mention_self_or_non_participants(self, _app):
        sara, _ = make_user(_app, "Sara Sola", UserRole.USER)
        tomas, _ = make_user(_app, "Tomás Silencioso", UserRole.USER)
        tid = _thread(sara)
        me = sara.get("/api/v1/auth/me").json()["id"]
        assert _reply(sara, tid, "@Sara Sola me cito a mí misma", mentions=[me]).json()["mentions"] == []
        # Tomás no ha publicado nada: no aparece en el autocompletado.
        assert sara.get("/api/v1/forum/mentionable", params={"q": "Tomás Sil"}).json() == []
        assert tomas.get("/api/v1/forum/mentionable", params={"q": "Sara Sola"}).json()[0]["name"] == "Sara Sola"
