class TestProducts:
    def test_list_products(self, client, admin_headers):
        resp = client.get("/api/products", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_catalog_product(self, client, admin_headers):
        resp = client.post("/api/products", json={
            "name": "Автотест Продукт A4",
            "unit_type": "sheet",
            "unit_price": 100.0,
            "default_cut_width_mm": 210,
            "default_cut_height_mm": 297,
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Автотест Продукт A4"
        assert data["unit_type"] == "sheet"
        return data["id"]

    def test_create_product_with_raw_material(self, client, admin_headers):
        rms = client.get("/api/raw-materials", headers=admin_headers).json()
        rm_id = rms[0]["id"] if rms else None
        if not rm_id:
            return
        resp = client.post("/api/products", json={
            "name": "Продукт с сырьём",
            "unit_type": "sheet",
            "unit_price": 50.0,
            "raw_material_id": rm_id,
            "material_coefficient": 1.0,
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)

    def test_update_product(self, client, admin_headers):
        create = client.post("/api/products", json={
            "name": "До обновления",
            "unit_type": "sheet",
            "unit_price": 10.0,
        }, headers=admin_headers)
        pid = create.json()["id"]
        resp = client.put(f"/api/products/{pid}", json={
            "name": "После обновления",
            "unit_price": 20.0,
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "После обновления"

    def test_delete_product(self, client, admin_headers):
        create = client.post("/api/products", json={
            "name": "Удаляемый",
            "unit_type": "sheet",
            "unit_price": 1.0,
        }, headers=admin_headers)
        pid = create.json()["id"]
        resp = client.delete(f"/api/products/{pid}", headers=admin_headers)
        assert resp.status_code in (200, 204)

    def test_get_nonexistent_product(self, client, admin_headers):
        resp = client.get("/api/products/99999", headers=admin_headers)
        assert resp.status_code == 404

    def test_scripts_list(self, client, admin_headers):
        resp = client.get("/api/scripts", headers=admin_headers)
        assert resp.status_code == 200
        scripts = resp.json()
        assert isinstance(scripts, list)
        names = [s["name"] for s in scripts]
        assert "sheet_stock_calc" in names
        assert "roll_stock_calc" in names
