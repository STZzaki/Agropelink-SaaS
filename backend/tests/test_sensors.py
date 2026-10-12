"""Sensores en directo: alta, ingesta validada, última lectura, series agregadas, aislamiento entre cuentas."""

import datetime as dt

import pytest

FARM = {"name": "Finca Sensores", "location": "Almería"}


def _farm(client):
    return client.post("/api/v1/farms", json=FARM).json()["id"]


def _iso(minutes_ago: float) -> str:
    return (dt.datetime.now(dt.UTC) - dt.timedelta(minutes=minutes_ago)).isoformat()


class TestSensors:
    def test_create_list_and_last_value(self, user):
        farm_id = _farm(user)
        r = user.post(f"/api/v1/farms/{farm_id}/sensors", json={"name": "Sonda <b>norte</b>", "kind": "soil_moisture", "zone": "Sector 1"})
        assert r.status_code == 201
        sensor = r.json()
        # El servidor fija unidad y rango; el HTML del nombre se elimina.
        assert sensor["unit"] == "%" and sensor["optimal"] == [30, 60] and "<b>" not in sensor["name"]
        assert sensor["last_value"] is None

        sid = sensor["id"]
        r = user.post(f"/api/v1/farms/{farm_id}/sensors/{sid}/samples", json={"samples": [{"value": 41.5, "recorded_at": _iso(30)}, {"value": 38.2}]})
        assert r.status_code == 201 and r.json() == {"created": 2}
        listed = user.get(f"/api/v1/farms/{farm_id}/sensors").json()
        assert listed[0]["last_value"] == 38.2
        assert listed[0]["last_at"].endswith(("Z", "+00:00"))  # UTC explícito: el navegador lo convierte a hora local

    def test_series_are_bucketed(self, user):
        farm_id = _farm(user)
        sid = user.post(f"/api/v1/farms/{farm_id}/sensors", json={"name": "Termómetro", "kind": "air_temperature"}).json()["id"]
        # Dos lecturas recientes (uno o dos tramos de 5 min según dónde caiga el límite) + una de hace 10 h.
        samples = [{"value": v, "recorded_at": _iso(m)} for v, m in [(20, 600), (22, 1), (24, 1.5)]]
        user.post(f"/api/v1/farms/{farm_id}/sensors/{sid}/samples", json={"samples": samples})

        six = user.get(f"/api/v1/farms/{farm_id}/sensors/series", params={"hours": 6}).json()
        assert six["bucket_minutes"] == 5
        points = six["series"][0]["points"]
        assert all(20 < v <= 24 for _, v in points)  # la lectura de hace 10 h queda fuera de la ventana
        assert sum(1 for _ in points) in (1, 2)

        day = user.get(f"/api/v1/farms/{farm_id}/sensors/series", params={"hours": 24}).json()
        assert day["bucket_minutes"] == 15 and len(day["series"][0]["points"]) >= 2
        assert user.get(f"/api/v1/farms/{farm_id}/sensors/series", params={"hours": 999}).status_code == 422

    @pytest.mark.parametrize(
        "payload",
        [
            {"samples": [{"value": 140}]},  # fuera del rango físico de humedad (0–100)
            {"samples": [{"value": "NaN"}]},
            {"samples": [{"value": 40, "recorded_at": "2099-01-01T00:00:00Z"}]},
            {"samples": []},
            {"samples": [{"value": 40}], "unit": "%"},  # campos extra prohibidos
        ],
        ids=["out-of-range", "nan", "future", "empty", "extra-field"],
    )
    def test_invalid_samples_rejected(self, user, payload):
        farm_id = _farm(user)
        sid = user.post(f"/api/v1/farms/{farm_id}/sensors", json={"name": "S", "kind": "soil_moisture"}).json()["id"]
        assert user.post(f"/api/v1/farms/{farm_id}/sensors/{sid}/samples", json=payload).status_code == 422

    def test_unknown_kind_rejected(self, user):
        farm_id = _farm(user)
        assert user.post(f"/api/v1/farms/{farm_id}/sensors", json={"name": "X", "kind": "radar"}).status_code == 422

    def test_other_account_cannot_touch_sensors(self, user, other_user):
        farm_id = _farm(user)
        sid = user.post(f"/api/v1/farms/{farm_id}/sensors", json={"name": "S", "kind": "ph"}).json()["id"]
        assert other_user.get(f"/api/v1/farms/{farm_id}/sensors").status_code == 404
        assert other_user.get(f"/api/v1/farms/{farm_id}/sensors/series").status_code == 404
        assert other_user.post(f"/api/v1/farms/{farm_id}/sensors/{sid}/samples", json={"samples": [{"value": 6}]}).status_code == 404
        assert other_user.delete(f"/api/v1/farms/{farm_id}/sensors/{sid}").status_code == 404
        # Un sensor de otra finca no se alcanza cambiando solo el id de la finca.
        own_farm = _farm(other_user)
        assert other_user.delete(f"/api/v1/farms/{own_farm}/sensors/{sid}").status_code == 404

    def test_delete_removes_samples(self, user):
        farm_id = _farm(user)
        sid = user.post(f"/api/v1/farms/{farm_id}/sensors", json={"name": "S", "kind": "co2"}).json()["id"]
        user.post(f"/api/v1/farms/{farm_id}/sensors/{sid}/samples", json={"samples": [{"value": 600}]})
        assert user.delete(f"/api/v1/farms/{farm_id}/sensors/{sid}").status_code == 204
        assert user.get(f"/api/v1/farms/{farm_id}/sensors").json() == []
        assert user.get(f"/api/v1/farms/{farm_id}/sensors/series").json()["series"] == []

    def test_standard_user_forbidden(self, std_user):
        assert std_user.get("/api/v1/farms/1/sensors").status_code == 403
