"""Ficha ampliada de fincas (asistente), foto privada, lecturas de sensores, analítica, carpetas y extracción local."""

import datetime as dt
import io
import os

import pytest
from PIL import Image

import agent_service
from config import get_settings

GPS_TAG = 0x8825

FULL_FARM = {
    "name": "Finca El Alquián",
    "location": "Almería",
    "surface_ha": 3.5,
    "length_m": 250,
    "width_m": 140,
    "avg_workers": 6,
    "operators": [{"name": "Lucía Martín", "position": "Encargada"}, {"name": "Omar B.", "position": "Tractorista"}],
    "crop_types": ["Tomate", "Pimiento", "tomate"],
    "schedules": [{"name": "Riego sector norte", "frequency": "daily", "notes": "2 pulsos de 15 min"}],
    "labs": ["Laboratorio Agroanalítico Sur"],
    "inputs": [{"name": "Azufre mojable", "kind": "phytosanitary", "registry": "ES-00123"}, {"name": "Bacillus subtilis", "kind": "ferment"}],
    "budget_total": 50000,
    "budget_spent": 12500.5,
}


def _jpeg_with_gps():
    img = Image.new("RGB", (80, 60), (91, 173, 94))
    exif = Image.Exif()
    exif.get_ifd(GPS_TAG).update({1: "N", 2: (36.0, 50.0, 30.0)})
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif.tobytes())
    return out.getvalue()


def _pdf(text_lines):
    """PDF mínimo con texto real (Helvetica), suficiente para pypdf."""
    content = "BT /F1 11 Tf 50 750 Td 14 TL " + " ".join(f"({line}) Tj T*" for line in text_lines) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


class TestFarmWizard:
    def test_full_profile_round_trip(self, user):
        r = user.post("/api/v1/farms", json=FULL_FARM)
        assert r.status_code == 201, r.text
        farm = r.json()
        assert farm["crop_types"] == ["Tomate", "Pimiento"]  # duplicados eliminados
        assert farm["operators"][0] == {"name": "Lucía Martín", "position": "Encargada"}
        assert farm["schedules"][0]["frequency"] == "daily" and farm["budget_spent"] == 12500.5
        assert user.get(f"/api/v1/farms/{farm['id']}").json()["labs"] == ["Laboratorio Agroanalítico Sur"]

    def test_minimal_farm_still_valid(self, user):
        r = user.post("/api/v1/farms", json={"name": "Finca simple", "location": "Níjar"})
        assert r.status_code == 201 and r.json()["operators"] == [] and r.json()["has_photo"] is False

    @pytest.mark.parametrize(
        "patch",
        [
            {"operators": [{"name": "Ana", "position": "Jefa", "dni": "12345678Z"}]},  # sin datos personales extra
            {"schedules": [{"name": "Riego", "frequency": "hourly"}]},
            {"inputs": [{"name": "X", "kind": "veneno"}]},
            {"budget_spent": -1},
            {"avg_workers": -3},
            {"surface_ha": 0},
            {"owner_id": 1},
            {"operators": [{"name": "N", "position": "P"}] * 101},
        ],
        ids=["operario-dni", "frecuencia", "insumo", "presupuesto", "trabajadores", "superficie", "owner", "demasiados"],
    )
    def test_invalid_profiles_rejected(self, user, patch):
        assert user.post("/api/v1/farms", json={**FULL_FARM, **patch}).status_code == 422

    def test_html_is_stripped(self, user):
        body = {**FULL_FARM, "operators": [{"name": "<b>Pepe</b><script>x()</script>", "position": "Riego"}]}
        assert user.post("/api/v1/farms", json=body).json()["operators"][0]["name"] == "Pepe"

    def test_update_and_idor(self, user, other_user):
        farm_id = user.post("/api/v1/farms", json=FULL_FARM).json()["id"]
        r = user.put(f"/api/v1/farms/{farm_id}", json={"budget_spent": 20000, "crop_types": ["Calabacín"]})
        assert r.json()["budget_spent"] == 20000 and r.json()["crop_types"] == ["Calabacín"] and r.json()["name"] == FULL_FARM["name"]
        assert other_user.get(f"/api/v1/farms/{farm_id}").status_code == 404
        assert other_user.put(f"/api/v1/farms/{farm_id}", json={"name": "Robada"}).status_code == 404
        assert user.put(f"/api/v1/farms/{farm_id}", json={"name": None}).status_code == 422


class TestFarmPhoto:
    def test_photo_reencoded_private_and_replaceable(self, user, other_user, client):
        farm_id = user.post("/api/v1/farms", json=FULL_FARM).json()["id"]
        r = user.put(f"/api/v1/farms/{farm_id}/photo", files={"file": ("nave.jpg", _jpeg_with_gps(), "image/jpeg")})
        assert r.status_code == 200 and r.json()["has_photo"]
        photo = user.get(f"/api/v1/farms/{farm_id}/photo")
        assert photo.status_code == 200 and photo.headers["x-content-type-options"] == "nosniff"
        assert not Image.open(io.BytesIO(photo.content)).getexif()  # GPS y EXIF eliminados
        assert other_user.get(f"/api/v1/farms/{farm_id}/photo").status_code == 404
        assert client.get(f"/api/v1/farms/{farm_id}/photo").status_code == 401
        # Reemplazo: el archivo anterior se borra del disco.
        folder = get_settings().farm_photo_dir
        import pathlib

        before = set(pathlib.Path(folder).iterdir())
        user.put(f"/api/v1/farms/{farm_id}/photo", files={"file": ("nave2.jpg", _jpeg_with_gps(), "image/jpeg")})
        assert len(set(pathlib.Path(folder).iterdir())) == len(before)

    @pytest.mark.parametrize(
        ("name", "content", "mime"),
        [("v.mp4", b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64, "video/mp4"), ("x.php", b"<?php echo 1; ?>", "image/jpeg")],
        ids=["video", "php"],
    )
    def test_only_images_accepted(self, user, name, content, mime):
        farm_id = user.post("/api/v1/farms", json=FULL_FARM).json()["id"]
        assert user.put(f"/api/v1/farms/{farm_id}/photo", files={"file": (name, content, mime)}).status_code == 415

    def test_real_size_photo_not_capped_by_json_limit(self, user):
        """Regresión "Request body too large": la ruta con id debe usar el límite de subida, no el de 64 KB del JSON."""
        farm_id = user.post("/api/v1/farms", json=FULL_FARM).json()["id"]
        noisy = Image.frombytes("RGB", (400, 400), os.urandom(400 * 400 * 3))  # ruido: el PNG no comprime (~480 KB)
        out = io.BytesIO()
        noisy.save(out, format="PNG")
        assert len(out.getvalue()) > get_settings().max_json_body_bytes
        r = user.put(f"/api/v1/farms/{farm_id}/photo", files={"file": ("nave.png", out.getvalue(), "image/png")})
        assert r.status_code == 200 and r.json()["has_photo"]

    def test_json_body_on_photo_route_keeps_small_limit(self, user):
        """Sin multipart la ruta no hereda el límite grande: un JSON enorme sigue cortándose en 64 KB."""
        farm_id = user.post("/api/v1/farms", json=FULL_FARM).json()["id"]
        big = b'{"x":"' + b"a" * (get_settings().max_json_body_bytes + 10) + b'"}'
        r = user.put(f"/api/v1/farms/{farm_id}/photo", content=big, headers={"Content-Type": "application/json"})
        assert r.status_code == 413


class TestReadingsAndAnalytics:
    def test_readings_feed_water_vs_moisture_and_kpis(self, user, other_user):
        farm_id = user.post("/api/v1/farms", json=FULL_FARM).json()["id"]
        today = dt.date.today()
        for i, (water, moisture) in enumerate([(1200, 31.5), (900, 28.0), (1500, 35.0)]):
            day = (today - dt.timedelta(days=i)).isoformat()
            assert user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": day, "water_liters": water, "soil_moisture_pct": moisture}).status_code == 201
        assert user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": (today + dt.timedelta(days=1)).isoformat(), "water_liters": 1}).status_code == 422
        assert user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": today.isoformat(), "soil_moisture_pct": 120}).status_code == 422
        assert user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": today.isoformat()}).status_code == 422
        assert other_user.post(f"/api/v1/farms/{farm_id}/readings", json={"recorded_on": today.isoformat(), "water_liters": 5}).status_code == 404

        data = user.get("/api/v1/analytics/overview", params={"farm_id": farm_id}).json()
        assert [p["water_liters"] for p in data["water_vs_moisture"]] == [1500, 900, 1200]  # orden cronológico
        k = data["kpis"]
        assert k["water_liters_30d"] == 3600 and k["avg_moisture_7d"] == pytest.approx(31.5)
        assert k["budget_total"] == 50000 and k["surface_ha"] == 3.5
        assert other_user.get("/api/v1/analytics/overview", params={"farm_id": farm_id}).status_code == 404

    def test_inputs_spend_this_year_vs_last_from_invoices(self, user):
        farm_id = user.post("/api/v1/farms", json={"name": "Finca gastos", "location": "Dalías"}).json()["id"]
        year = dt.date.today().year
        pdf = b"%PDF-1.7\n" + b"0" * 64
        for date, amount, kind in [(f"{year}-01-15", "300.00", "invoice_phyto"), (f"{year - 1}-01-20", "200.00", "invoice_phyto"), (f"{year}-01-10", "999.00", "invoice_fuel")]:
            r = user.post("/api/v1/documents/upload", data={"farm_id": farm_id, "doc_type": kind, "accrual_date": date, "amount": amount, "campaign": "Tomate 2026"}, files={"file": ("f.pdf", pdf, "application/pdf")})
            assert r.status_code == 201, r.text
        january = user.get("/api/v1/analytics/overview", params={"farm_id": farm_id}).json()["inputs_spend"][0]
        assert (january["this_year"], january["last_year"]) == (300.0, 200.0)  # el gasóleo no cuenta como insumo

    def test_empty_account_has_empty_series(self, _app):
        from conftest import make_user

        c, _ = make_user(_app, "Nuevo")
        data = c.get("/api/v1/analytics/overview").json()
        assert data["water_vs_moisture"] == [] and all(p["this_year"] == 0 for p in data["inputs_spend"])

    def test_standard_user_forbidden(self, std_user):
        assert std_user.get("/api/v1/analytics/overview").status_code == 403


class TestDocumentFoldersAndLocalAI:
    def test_folders_group_by_farm_year_campaign(self, user):
        farm_id = user.post("/api/v1/farms", json={"name": "Finca carpetas", "location": "Adra"}).json()["id"]
        pdf = b"%PDF-1.7\n" + b"0" * 64
        for campaign, year in [("Tomate 2026", "2026"), ("Tomate 2026", "2026"), ("Pepino 2025", "2025")]:
            user.post("/api/v1/documents/upload", data={"farm_id": farm_id, "fiscal_year": year, "campaign": campaign}, files={"file": ("f.pdf", pdf, "application/pdf")})
        folders = [f for f in user.get("/api/v1/documents/folders").json() if f["farm_id"] == farm_id]
        assert {(f["year"], f["campaign"], f["count"]) for f in folders} == {(2026, "Tomate 2026", 2), (2025, "Pepino 2025", 1)}

    def test_local_pdf_extraction_without_third_parties(self, user, monkeypatch):
        def must_not_call():
            raise AssertionError("No debe contactar con Gemini con la opción desactivada")

        monkeypatch.setattr(agent_service, "_get_client", must_not_call)
        user.post("/api/v1/farms", json={"name": "Finca Local", "location": "Vícar"})
        pdf = _pdf(["Agroquimicos del Sur S.L.", "Factura 2026-118   Fecha 12/03/2026", "Fungicida azufre 25 kg   120,00 EUR", "IVA 21%   25,20 EUR", "TOTAL 1.234,56 EUR"])
        r = user.post("/api/v1/documents/analyze", files={"file": ("doc.pdf", pdf, "application/pdf")})
        assert r.status_code == 201, r.text
        p = r.json()["proposal"]
        assert r.json()["engine"] == "heuristic"
        assert p["doc_type"] == "invoice_phyto" and p["amount"] == 1234.56 and p["accrual_date"] == "2026-03-12"
        assert p["vendor"].startswith("Agroquimicos del Sur S.L") and "1.234,56 €" in p["summary"]

    def test_instructions_override_document_content(self, user):
        user.post("/api/v1/farms", json={"name": "Finca Prioridad", "location": "Roquetas"})
        pdf = _pdf(["Proveedor X S.L.", "TOTAL 99,00 EUR"])
        r = user.post("/api/v1/documents/analyze", data={"instructions": "Factura de gasoleo de 450 euros"}, files={"file": ("d.pdf", pdf, "application/pdf")})
        p = r.json()["proposal"]
        assert p["doc_type"] == "invoice_fuel" and p["amount"] == 450.0 and p["vendor"].startswith("Proveedor X")
