from fastapi.testclient import TestClient

from app.main import app


class FailingSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return None

    async def execute(self, statement):
        raise RuntimeError("sensitive database details")


def test_database_health_reports_service_unavailable(monkeypatch) -> None:
    monkeypatch.setattr("app.main.AsyncSessionLocal", FailingSession)

    with TestClient(app) as client:
        response = client.get("/health/database")

    assert response.status_code == 503
    assert response.json() == {
        "database": "disconnected",
        "status": "unhealthy",
    }
    assert "sensitive database details" not in response.text