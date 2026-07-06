class TestAuth:
    def test_login_admin(self, client):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/auth/login", json={"username": "nobody", "password": "123"})
        assert resp.status_code == 401

    def test_me(self, client, admin_headers):
        resp = client.get("/api/auth/me", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "admin"

    def test_me_no_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_users_list(self, client, admin_headers):
        resp = client.get("/api/auth/users", headers=admin_headers)
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        assert len(users) >= 2

    def test_roles_list(self, client, admin_headers):
        resp = client.get("/api/auth/roles", headers=admin_headers)
        assert resp.status_code == 200
        roles = resp.json()
        assert isinstance(roles, list)
        assert len(roles) >= 1

    def test_permissions_list(self, client, admin_headers):
        resp = client.get("/api/auth/permissions", headers=admin_headers)
        assert resp.status_code == 200
        perms = resp.json()
        assert isinstance(perms, list)
        assert len(perms) > 10

    def test_login_biba(self, client):
        resp = client.post("/api/auth/login", json={"username": "biba", "password": "123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
