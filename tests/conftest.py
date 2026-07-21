import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def admin_token(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def biba_token(client):
    resp = client.post("/api/auth/login", json={"username": "biba", "password": "123"})
    assert resp.status_code == 200, f"Login biba failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def biba_headers(biba_token):
    return {"Authorization": f"Bearer {biba_token}"}
