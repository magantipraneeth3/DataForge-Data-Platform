from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_user_can_register_and_log_in() -> None:
    identifier = uuid4().hex
    payload = {
        "organization_name": f"Test Workspace {identifier[:8]}",
        "organization_slug": f"test-{identifier[:12]}",
        "first_name": "Test",
        "last_name": "User",
        "email": f"{identifier}@example.com",
        "password": "Local-test-password-123",
        "role": "analyst",
    }

    with TestClient(app) as client:
        registered = client.post("/auth/register", json=payload)
        assert registered.status_code == 201, registered.text

        logged_in = client.post(
            "/auth/login",
            json={
                "email": payload["email"],
                "password": payload["password"],
            },
        )

    assert logged_in.status_code == 200, logged_in.text
    assert logged_in.json()["access_token"]


def test_public_registration_rejects_admin_role() -> None:
    identifier = uuid4().hex
    payload = {
        "organization_name": f"Test Admin Workspace {identifier[:8]}",
        "organization_slug": f"test-admin-{identifier[:12]}",
        "first_name": "Test",
        "last_name": "Admin",
        "email": f"{identifier}@example.com",
        "password": "Local-test-password-123",
        "role": "admin",
    }

    with TestClient(app) as client:
        response = client.post("/auth/register", json=payload)

    assert response.status_code == 422, response.text
    assert "Data Engineer and Analyst" in response.text