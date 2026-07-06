class TestClients:
    def test_list_clients(self, client, admin_headers):
        resp = client.get("/api/clients", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_client(self, client, admin_headers):
        resp = client.post("/api/clients", json={
            "name": "ТестКлиент Автотест",
            "phone": "+79991234567",
            "email": "test@autotest.ru",
        }, headers=admin_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "ТестКлиент Автотест"
        assert data["phone"] == "+79991234567"
        return data["id"]

    def test_get_client(self, client, admin_headers):
        create = client.post("/api/clients", json={"name": "Получение тест"}, headers=admin_headers)
        cid = create.json()["id"]
        resp = client.get(f"/api/clients/{cid}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Получение тест"

    def test_update_client(self, client, admin_headers):
        create = client.post("/api/clients", json={"name": "До обновления"}, headers=admin_headers)
        cid = create.json()["id"]
        resp = client.put(f"/api/clients/{cid}", json={"name": "После обновления"}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "После обновления"

    def test_delete_client(self, client, admin_headers):
        create = client.post("/api/clients", json={"name": "Удаляемый"}, headers=admin_headers)
        cid = create.json()["id"]
        resp = client.delete(f"/api/clients/{cid}", headers=admin_headers)
        assert resp.status_code in (200, 204)

    def test_create_client_no_name(self, client, admin_headers):
        resp = client.post("/api/clients", json={"phone": "+7000"}, headers=admin_headers)
        assert resp.status_code in (400, 422)

    def test_get_nonexistent_client(self, client, admin_headers):
        resp = client.get("/api/clients/99999", headers=admin_headers)
        assert resp.status_code == 404
