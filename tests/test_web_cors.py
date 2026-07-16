from fastapi import FastAPI
from fastapi.testclient import TestClient

from excel_metadata_extractor.web import configure_cors


def preflight(client: TestClient, origin: str):
    return client.options(
        "/api/extract",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


def test_cors_allows_cloudflare_pages_by_default(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN_REGEX", raising=False)
    api = FastAPI()
    configure_cors(api)
    client = TestClient(api)

    response = preflight(client, "https://miner-frontend.pages.dev")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "https://miner-frontend.pages.dev"
    )


def test_cors_allows_local_vite_by_default(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN_REGEX", raising=False)
    api = FastAPI()
    configure_cors(api)
    client = TestClient(api)

    response = preflight(client, "http://localhost:5173")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_unconfigured_origins(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN_REGEX", raising=False)
    api = FastAPI()
    configure_cors(api)
    client = TestClient(api)

    response = preflight(client, "https://example.com")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
