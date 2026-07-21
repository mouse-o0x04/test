class TestWarehouse:
    def test_list_warehouse(self, client, admin_headers):
        resp = client.get("/api/warehouse", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_warehouse_item(self, client, admin_headers):
        rms = client.get("/api/raw-materials", headers=admin_headers).json()
        rm_ids = [r["id"] for r in rms]
        existing = client.get("/api/warehouse", headers=admin_headers).json()
        existing_rm_ids = [e["raw_material_id"] for e in existing]
        available = [r for r in rm_ids if r not in existing_rm_ids]
        if not available:
            return
        resp = client.post("/api/warehouse", json={
            "raw_material_id": available[0],
            "quantity": 100.0,
            "min_quantity": 10.0,
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)

    def test_update_warehouse_item(self, client, admin_headers):
        items = client.get("/api/warehouse", headers=admin_headers).json()
        if not items:
            return
        item = items[0]
        resp = client.put(f"/api/warehouse/{item['id']}", json={
            "quantity": item["quantity"] + 50,
        }, headers=admin_headers)
        assert resp.status_code == 200

    def test_writeoffs_list(self, client, admin_headers):
        resp = client.get("/api/writeoffs", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_raw_materials_list(self, client, admin_headers):
        resp = client.get("/api/raw-materials", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_raw_material(self, client, admin_headers):
        resp = client.post("/api/raw-materials", json={
            "name": "Автотест Сырьё",
            "unit": "м",
            "width_mm": 1000,
            "height_mm": 1000,
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Автотест Сырьё"
        return data["id"]

    def test_delete_raw_material(self, client, admin_headers):
        create = client.post("/api/raw-materials", json={
            "name": "Удаляемое сырьё",
            "unit": "шт",
        }, headers=admin_headers)
        if create.status_code not in (200, 201):
            return
        rid = create.json()["id"]
        resp = client.delete(f"/api/raw-materials/{rid}", headers=admin_headers)
        assert resp.status_code in (200, 204)
