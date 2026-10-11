"""Recuperación de contraseña: anti-enumeración, token JWT de 15 min y de un solo uso, revocación de sesiones."""

import datetime as dt
import logging
import re
import urllib.parse

import jwt
import pytest

import password_reset
from conftest import PASSWORD, make_user

NEW_PASSWORD = "Nueva#Clave2026"


def _request_link(client, email, caplog):
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="agropelink.auth"):
        r = client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    m = re.search(r"http://localhost:5173/reset-password\?token=(\S+)", caplog.text)
    return r, (urllib.parse.unquote(m.group(1)) if m else None)


def test_same_generic_response_for_unknown_email(client, caplog):
    r, token = _request_link(client, "nadie@finca-test.es", caplog)
    assert token is None  # no se genera nada para cuentas inexistentes
    assert "Si el email está registrado" in r.json()["detail"]


def test_full_reset_flow_is_single_use_and_revokes_sessions(_app, client, caplog):
    session, email = make_user(_app, "Olvidadiza")
    r, token = _request_link(client, email, caplog)
    assert token, caplog.text
    assert r.json() == _request_link(client, "nadie@finca-test.es", caplog)[0].json()  # respuesta idéntica

    ok = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert ok.status_code == 200, ok.text
    assert session.get("/api/v1/auth/me").status_code == 401  # sesiones anteriores cerradas
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email, "password": NEW_PASSWORD}).status_code == 200
    # Un solo uso: el token queda invalidado al cambiar la contraseña.
    again = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Otra#Clave2026"})
    assert again.status_code == 400


def test_expired_tampered_and_foreign_tokens_rejected(_app, client, caplog):
    _, email = make_user(_app, "Victima")
    _, token = _request_link(client, email, caplog)
    payload = jwt.decode(token, options={"verify_signature": False})
    secret = password_reset._secret()

    expired = jwt.encode({**payload, "exp": dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1)}, secret, algorithm="HS256")
    forged = jwt.encode(payload, "x" * 48, algorithm="HS256")  # firmado con otro secreto
    unsigned = jwt.encode(payload, None, algorithm="none")  # ataque alg=none
    wrong_purpose = jwt.encode({**payload, "typ": "session"}, secret, algorithm="HS256")
    for bad in (expired, forged, unsigned, wrong_purpose, token[:-4] + "AAAA"):
        r = client.post("/api/v1/auth/reset-password", json={"token": bad, "new_password": NEW_PASSWORD})
        assert r.status_code in (400, 422), bad


def test_token_expires_in_15_minutes(_app, client, caplog):
    _, email = make_user(_app, "Reloj")
    _, token = _request_link(client, email, caplog)
    payload = jwt.decode(token, options={"verify_signature": False})
    assert payload["exp"] - payload["iat"] == 15 * 60


@pytest.mark.parametrize("weak", ["corta1!", "sinnumeros!!", "12345678!"])
def test_new_password_must_be_strong(client, weak):
    r = client.post("/api/v1/auth/reset-password", json={"token": "x" * 40, "new_password": weak})
    assert r.status_code == 422


def test_forgot_password_rate_limited_per_email(_app, client, caplog):
    _, email = make_user(_app, "Spam")
    codes = [client.post("/api/v1/auth/forgot-password", json={"email": email}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
