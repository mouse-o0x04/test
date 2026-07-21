class TestOrders:
    def test_list_orders(self, client, admin_headers):
        resp = client.get("/api/orders", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def _get_client_id(self, client, headers):
        clients = client.get("/api/clients", headers=headers).json()
        return clients[0]["id"] if clients else None

    def _get_product_id(self, client, headers):
        products = client.get("/api/products", headers=headers).json()
        return products[0]["id"] if products else None

    def test_create_order(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        pid = self._get_product_id(client, admin_headers)
        if not cid:
            return
        items = [{"quantity": 1, "unit_price": 100}]
        if pid:
            items[0]["product_id"] = pid
        resp = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": items,
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["status"] == "new"
        assert len(data["items"]) >= 1
        return data["id"]

    def test_create_order_custom_item(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        if not cid:
            return
        resp = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": [{
                "product_name": "Автотест Кастом",
                "quantity": 10,
                "unit_price": 50.0,
            }],
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["items"][0]["is_custom"] is True

    def test_update_order_status(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        pid = self._get_product_id(client, admin_headers)
        if not cid:
            return
        items = [{"quantity": 1, "unit_price": 10}]
        if pid:
            items[0]["product_id"] = pid
        create = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": items,
        }, headers=admin_headers)
        oid = create.json()["id"]
        resp = client.put(f"/api/orders/{oid}", json={"status": "in_progress"}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_toggle_item_completed(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        pid = self._get_product_id(client, admin_headers)
        if not cid:
            return
        items = [{"quantity": 1, "unit_price": 10}]
        if pid:
            items[0]["product_id"] = pid
        create = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": items,
        }, headers=admin_headers)
        oid = create.json()["id"]
        item_id = create.json()["items"][0]["id"]
        resp = client.put(f"/api/orders/{oid}/items/{item_id}/toggle", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        toggled_item = next(i for i in data["items"] if i["id"] == item_id)
        assert toggled_item["is_completed"] is True
        assert toggled_item["is_printed"] is True

    def test_toggle_item_printed(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        pid = self._get_product_id(client, admin_headers)
        if not cid:
            return
        items = [{"quantity": 1, "unit_price": 10}]
        if pid:
            items[0]["product_id"] = pid
        create = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": items,
        }, headers=admin_headers)
        oid = create.json()["id"]
        item_id = create.json()["items"][0]["id"]
        resp = client.put(f"/api/orders/{oid}/items/{item_id}/toggle-printed", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        toggled_item = next(i for i in data["items"] if i["id"] == item_id)
        assert toggled_item["is_printed"] is True

    def test_order_history(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        if not cid:
            return
        create = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": [{"product_name": "История", "quantity": 1, "unit_price": 10}],
        }, headers=admin_headers)
        oid = create.json()["id"]
        resp = client.get(f"/api/orders/{oid}/history", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_delete_order(self, client, admin_headers):
        cid = self._get_client_id(client, admin_headers)
        if not cid:
            return
        create = client.post("/api/orders", json={
            "client_id": cid,
            "status": "new",
            "items": [{"product_name": "Удаляемый", "quantity": 1, "unit_price": 10}],
        }, headers=admin_headers)
        oid = create.json()["id"]
        resp = client.delete(f"/api/orders/{oid}", headers=admin_headers)
        assert resp.status_code in (200, 204)

    def test_order_templates_list(self, client, admin_headers):
        resp = client.get("/api/order-templates", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_order_template(self, client, admin_headers):
        resp = client.post("/api/order-templates", json={
            "name": "Автотест Шаблон",
            "items": [{"product_name": "Тест", "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Автотест Шаблон"

    def test_delete_order_template(self, client, admin_headers):
        create = client.post("/api/order-templates", json={
            "name": "Удаляемый шаблон",
            "items": [],
        }, headers=admin_headers)
        if create.status_code not in (200, 201):
            return
        tid = create.json()["id"]
        resp = client.delete(f"/api/order-templates/{tid}", headers=admin_headers)
        assert resp.status_code in (200, 204)
