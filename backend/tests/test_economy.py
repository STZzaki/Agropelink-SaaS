"""Cosechas (única/múltiple), costes fijos del alta, costes variables y vista económica con su desglose."""

import datetime as dt

import pytest

TODAY = dt.date.today()
YEAR = TODAY.year


def _d(month: int, day: int = 15, year: int = YEAR) -> str:
    return dt.date(year, month, day).isoformat()


MULTI_FARM = {
    "name": "Finca Economía",
    "location": "Almería",
    "budget_total": 20000,
    "harvest_mode": "multiple",
    "harvests": [
        {"name": "Tomate otoño", "surface_ha": 2, "length_m": 200, "width_m": 100, "plant_count": 40000,
         "start_date": _d(1, 10), "end_date": _d(3, 10), "description": "Rama <script>x</script> en suelo enarenado"},
        {"name": "Pimiento", "surface_ha": 1.5, "plant_count": 30000},
    ],
    "fixed_costs": [
        {"category": "seeds", "concept": "Semilla tomate", "amount": 1200, "harvest_index": 0, "incurred_on": _d(1, 5)},
        {"category": "fertilizers", "concept": "Abonado de fondo", "amount": 800.5, "incurred_on": _d(1, 6)},
    ],
}


class TestFarmCreationWithHarvests:
    def test_multiple_harvests_and_fixed_costs_created_atomically(self, user):
        r = user.post("/api/v1/farms", json=MULTI_FARM)
        assert r.status_code == 201, r.text
        farm = r.json()
        assert farm["harvest_mode"] == "multiple"

        harvests = user.get(f"/api/v1/farms/{farm['id']}/harvests").json()
        assert [h["name"] for h in harvests] == ["Tomate otoño", "Pimiento"]
        assert harvests[0]["duration_days"] == 60 and harvests[0]["plant_count"] == 40000
        assert "<script>" not in harvests[0]["description"]

        expenses = user.get(f"/api/v1/farms/{farm['id']}/expenses").json()
        assert len(expenses) == 2 and all(e["is_fixed"] for e in expenses)
        seed = next(e for e in expenses if e["category"] == "seeds")
        assert seed["harvest_id"] == harvests[0]["id"]

    @pytest.mark.parametrize(
        ("patch", "reason"),
        [
            ({"harvest_mode": "single"}, "single-with-two"),
            ({"fixed_costs": [{"category": "seeds", "concept": "X", "amount": 5, "harvest_index": 7}]}, "bad-index"),
            ({"fixed_costs": [{"category": "seeds", "concept": "X", "amount": 0}]}, "zero-amount"),
            ({"fixed_costs": [{"category": "jewelry", "concept": "X", "amount": 5}]}, "bad-category"),
            ({"harvests": [{"name": "T", "start_date": _d(5), "end_date": _d(4)}]}, "end-before-start"),
            ({"harvests": [{"name": "T", "plant_count": -1}]}, "negative-plants"),
        ],
        ids=lambda v: v if isinstance(v, str) else "",
    )
    def test_invalid_payloads_rejected_and_nothing_saved(self, user, patch, reason):
        before = len(user.get("/api/v1/farms").json())
        assert user.post("/api/v1/farms", json={**MULTI_FARM, **patch}).status_code == 422, reason
        assert len(user.get("/api/v1/farms").json()) == before

    def test_single_mode_blocks_second_harvest(self, user):
        farm_id = user.post("/api/v1/farms", json={"name": "U", "location": "Murcia", "harvests": [{"name": "Lechuga"}]}).json()["id"]
        assert user.post(f"/api/v1/farms/{farm_id}/harvests", json={"name": "Otra"}).status_code == 409
        assert user.put(f"/api/v1/farms/{farm_id}", json={"harvest_mode": "multiple"}).status_code == 200
        assert user.post(f"/api/v1/farms/{farm_id}/harvests", json={"name": "Otra"}).status_code == 201
        # Con dos cosechas no se puede volver a cosecha única sin borrar una.
        assert user.put(f"/api/v1/farms/{farm_id}", json={"harvest_mode": "single"}).status_code == 409


class TestFinance:
    def test_budget_breakdown_quarters_categories_and_harvests(self, user):
        farm_id = user.post("/api/v1/farms", json=MULTI_FARM).json()["id"]
        harvests = user.get(f"/api/v1/farms/{farm_id}/harvests").json()
        user.post(f"/api/v1/farms/{farm_id}/expenses", json={"category": "water", "concept": "Riego", "amount": 300, "incurred_on": _d(5), "harvest_id": harvests[1]["id"]})
        user.post(f"/api/v1/farms/{farm_id}/expenses", json={"category": "labor", "concept": "Jornales", "amount": 1000, "incurred_on": _d(11)})
        user.post(f"/api/v1/farms/{farm_id}/expenses", json={"category": "labor", "concept": "Año pasado", "amount": 999, "incurred_on": _d(6, year=YEAR - 1)})
        # Factura archivada en Documentos (cuenta como gasto en su trimestre de devengo).
        doc = user.post(
            "/api/v1/documents/upload",
            data={"farm_id": farm_id, "doc_type": "invoice_fuel", "status": "pending", "amount": "250", "accrual_date": _d(8)},
            files={"file": ("f.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf")},
        )
        assert doc.status_code == 201, doc.text

        fin = user.get(f"/api/v1/farms/{farm_id}/finance").json()
        b = fin["budget"]
        assert (b["fixed"], b["variable"], b["invoices"], b["declared"]) == (2000.5, 1300, 250, 0)
        assert b["consumed"] == 3550.5 and b["remaining"] == 16449.5 and b["consumed_pct"] == pytest.approx(17.8, abs=0.1)

        q = {p["quarter"]: p for p in fin["by_quarter"]}
        assert q[1]["fixed"] == 2000.5 and q[2]["variable"] == 300 and q[3]["invoices"] == 250 and q[4]["variable"] == 1000
        cats = {c["key"]: c["amount"] for c in fin["by_category"]}
        assert cats == {"seeds": 1200, "fertilizers": 800.5, "water": 300, "labor": 1000, "fuel": 250}
        by_h = {h["name"]: h for h in fin["by_harvest"]}
        assert by_h["Tomate otoño"]["cost_per_ha"] == 600 and by_h["Pimiento"]["amount"] == 300
        assert by_h["Sin cosecha asignada"]["amount"] == 1800.5
        years = {y["year"]: y["amount"] for y in fin["by_year"]}
        assert years[YEAR] == 3550.5 and years[YEAR - 1] == 999 and len(years) == 5

        # La vista de un año anterior solo ve lo de ese año.
        prev = user.get(f"/api/v1/farms/{farm_id}/finance", params={"year": YEAR - 1}).json()["budget"]
        assert prev["consumed"] == 999

        # El KPI del panel usa exactamente el mismo cálculo.
        kpis = user.get("/api/v1/analytics/overview", params={"farm_id": farm_id}).json()["kpis"]
        assert kpis["budget_spent"] == 3550.5

    def test_legacy_declared_spend_counts_only_this_year(self, user):
        farm_id = user.post("/api/v1/farms", json={"name": "Antigua", "location": "Huelva", "budget_total": 1000, "budget_spent": 400}).json()["id"]
        fin = user.get(f"/api/v1/farms/{farm_id}/finance").json()["budget"]
        assert fin["declared"] == 400 and fin["consumed"] == 400 and fin["consumed_pct"] == 40
        assert user.get(f"/api/v1/farms/{farm_id}/finance", params={"year": YEAR - 1}).json()["budget"]["declared"] == 0

    def test_deleting_harvest_keeps_its_costs(self, user):
        farm_id = user.post("/api/v1/farms", json=MULTI_FARM).json()["id"]
        hid = user.get(f"/api/v1/farms/{farm_id}/harvests").json()[0]["id"]
        assert user.delete(f"/api/v1/farms/{farm_id}/harvests/{hid}").status_code == 204
        expenses = user.get(f"/api/v1/farms/{farm_id}/expenses").json()
        assert len(expenses) == 2 and all(e["harvest_id"] is None for e in expenses)


class TestIsolation:
    def test_other_account_cannot_read_or_write(self, user, other_user):
        farm_id = user.post("/api/v1/farms", json=MULTI_FARM).json()["id"]
        hid = user.get(f"/api/v1/farms/{farm_id}/harvests").json()[0]["id"]
        eid = user.get(f"/api/v1/farms/{farm_id}/expenses").json()[0]["id"]
        for path in ("harvests", "expenses", "finance"):
            assert other_user.get(f"/api/v1/farms/{farm_id}/{path}").status_code == 404
        assert other_user.delete(f"/api/v1/farms/{farm_id}/expenses/{eid}").status_code == 404
        assert other_user.put(f"/api/v1/farms/{farm_id}/harvests/{hid}", json={"name": "X"}).status_code == 404

        # No se puede imputar un coste propio a la cosecha de otra cuenta.
        own = other_user.post("/api/v1/farms", json={"name": "B", "location": "Sevilla"}).json()["id"]
        r = other_user.post(f"/api/v1/farms/{own}/expenses", json={"category": "seeds", "concept": "X", "amount": 1, "incurred_on": _d(2), "harvest_id": hid})
        assert r.status_code == 404

    def test_standard_user_forbidden(self, std_user):
        assert std_user.get("/api/v1/farms/1/finance").status_code == 403
