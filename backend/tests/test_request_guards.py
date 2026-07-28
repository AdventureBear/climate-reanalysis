from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.rate_limit import RateLimitRule, rate_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    rate_limiter.reset()
    yield
    rate_limiter.reset()


def test_map_rate_limit_returns_429_before_render(monkeypatch):
    renders = 0

    def fake_create_map_buffer(_req):
        nonlocal renders
        renders += 1
        return io.BytesIO(b"png")

    monkeypatch.setattr(main_module, "PUBLIC_MAP_LIMIT", RateLimitRule("test-map", 2, 60))
    monkeypatch.setattr(main_module, "create_map_buffer", fake_create_map_buffer)
    client = TestClient(main_module.app)
    params = {
        "date": "20260101",
        "hour": "12",
        "variable": "height",
        "level": "500",
        "region": "CONUS",
    }

    assert client.get("/api/map", params=params).status_code == 200
    assert client.get("/api/map", params=params).status_code == 200

    limited = client.get("/api/map", params=params)

    assert limited.status_code == 429
    assert "Retry-After" in limited.headers
    assert renders == 2


def test_duplicate_hours_are_rejected(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "dates": "20260101,20260102",
            "hours": "00,00",
            "variable": "height",
            "level": "500",
            "region": "CONUS",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "hours contains duplicate synoptic times"


def test_duplicate_dates_are_rejected(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "dates": "20260101,20260101",
            "hour": "12",
            "variable": "height",
            "level": "500",
            "region": "CONUS",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "dates contains duplicate dates"


def test_daily_composite_date_hour_pairs_are_bounded(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)
    dates = ",".join(f"202601{day:02d}" for day in range(1, 32))
    dates += "," + ",".join(f"202602{day:02d}" for day in range(1, 17))

    response = client.get(
        "/api/map",
        params={
            "dates": dates,
            "hours": "00,03,06,09,12,15,18,21",
            "variable": "height",
            "level": "500",
            "region": "CONUS",
        },
    )

    assert response.status_code == 422
    assert "daily composites are limited" in response.json()["detail"]


def test_package_create_rate_limit_returns_429_before_job_creation(monkeypatch):
    created = 0

    class Job:
        id = "abc123"

    def fake_create_job(_request):
        nonlocal created
        created += 1
        return Job()

    monkeypatch.setattr(main_module, "PACKAGE_CREATE_LIMIT", RateLimitRule("test-package", 1, 60))
    monkeypatch.setattr(main_module, "create_job", fake_create_job)
    monkeypatch.setattr(main_module, "run_job", lambda _job_id: None)
    monkeypatch.setattr(main_module, "serialize_job", lambda job: {"id": job.id})
    client = TestClient(main_module.app)
    payload = {"date": "2026-01-01", "place": "Cincinnati, OH", "time": "12:00"}

    assert client.post("/api/single-date-packages", json=payload).status_code == 202

    limited = client.post("/api/single-date-packages", json=payload)

    assert limited.status_code == 429
    assert created == 1
