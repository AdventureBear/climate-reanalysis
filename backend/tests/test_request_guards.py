from __future__ import annotations

import io
import logging

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.climo_r2 import ClimatologyUnavailableError
from app.rate_limit import RateLimitRule, rate_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    rate_limiter.reset()
    yield
    rate_limiter.reset()


def test_map_rate_limit_returns_429_before_render(monkeypatch, caplog):
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

    with caplog.at_level(logging.WARNING, logger="app.rate_limit"):
        limited = client.get("/api/map", params=params)

    assert limited.status_code == 429
    assert "Retry-After" in limited.headers
    assert "RATE_LIMITED rule=test-map method=GET path=/api/map" in caplog.text
    assert "client=" in caplog.text
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


def test_precip_total_anomaly_is_raw_only(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "mode": "anomaly",
            "precip_window": "24",
        },
    )

    assert response.status_code == 422
    assert "raw maps only" in response.json()["detail"]


def test_pwat_advertises_normalized_mode():
    client = TestClient(main_module.app)

    response = client.get("/")

    assert response.status_code == 200
    assert "normalized" in response.json()["variable_modes"]["precipitable_water"]


def test_pwat_normalized_available_for_single_hour_and_daily(monkeypatch):
    captured = {}

    def fake_create_map_buffer(req):
        captured.setdefault("requests", []).append((req.mode, req.variable, req.hour, req.hours))
        return io.BytesIO(b"png")

    monkeypatch.setattr(main_module, "create_map_buffer", fake_create_map_buffer)
    client = TestClient(main_module.app)
    base_params = {
        "date": "20260101",
        "variable": "precipitable_water",
        "level": "1000",
        "region": "CONUS",
        "mode": "normalized",
    }

    single_hour = client.get("/api/map", params={**base_params, "hour": "12"})
    assert single_hour.status_code == 200

    daily = client.get("/api/map", params={**base_params, "hours": "00,06,12,18"})
    assert daily.status_code == 200
    assert captured == {
        "requests": [
            ("normalized", "precipitable_water", "12", ""),
            ("normalized", "precipitable_water", "00", "00,06,12,18"),
        ],
    }


def test_non_pwat_normalized_single_hour_stays_blocked(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "temp",
            "level": "850",
            "region": "CONUS",
            "mode": "normalized",
        },
    )

    assert response.status_code == 422
    assert "single-hour maps" in response.json()["detail"]


@pytest.mark.parametrize(
    ("variable", "level"),
    [
        ("rel_vorticity", "500"),
        ("storm_relative_helicity", "1000"),
        ("wind_gust", "1000"),
        ("storm_motion", "1000"),
        ("lifted_index_surface", "1000"),
        ("lifted_index_best", "1000"),
        ("lifted_index_parcel", "1000"),
    ],
)
def test_new_core_variables_enter_map_recipe(monkeypatch, variable, level):
    captured = {}

    def fake_create_map_buffer(req):
        captured["variable"] = req.variable
        captured["level"] = req.level
        captured["mode"] = req.mode
        return io.BytesIO(b"png")

    monkeypatch.setattr(main_module, "create_map_buffer", fake_create_map_buffer)
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": variable,
            "level": level,
            "region": "CONUS",
        },
    )

    assert response.status_code == 200
    assert captured == {"variable": variable, "level": int(level), "mode": "raw"}


@pytest.mark.parametrize(
    ("variable", "level"),
    [
        ("storm_relative_helicity", "1000"),
        ("wind_gust", "1000"),
        ("storm_motion", "1000"),
        ("lifted_index_surface", "1000"),
        ("lifted_index_best", "1000"),
        ("lifted_index_parcel", "1000"),
    ],
)
def test_new_named_core_variables_are_raw_only(monkeypatch, variable, level):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": variable,
            "level": level,
            "region": "CONUS",
            "mode": "anomaly",
        },
    )

    assert response.status_code == 422
    assert "raw maps only" in response.json()["detail"]


@pytest.mark.parametrize(
    ("variable", "level", "scale_kind", "unit", "domain_min", "domain_max", "group"),
    [
        ("rel_vorticity", "500", "fixed-rel-vorticity", "10⁻⁵/s", -40, 55, None),
        ("storm_relative_helicity", "1000", "fixed-storm-relative-helicity", "m²/s²", -300, 600, None),
        ("wind_gust", "1000", "fixed-wind", "kt", 8, 60, "surface"),
        ("storm_motion", "1000", "fixed-wind", "kt", 15, 80, "low"),
        ("lifted_index_best", "1000", "fixed-lifted-index-best", "K", -18, 0, None),
    ],
)
def test_new_core_variable_scale_meta(variable, level, scale_kind, unit, domain_min, domain_max, group):
    client = TestClient(main_module.app)

    response = client.get(
        "/api/scale-meta",
        params={
            "variable": variable,
            "level": level,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scale_kind"] == scale_kind
    assert payload["unit"] == unit
    assert payload["domain_min"] == domain_min
    assert payload["domain_max"] == domain_max
    if group is not None:
        assert payload["group"] == group


@pytest.mark.parametrize(
    ("pwat_unit", "domain_max"),
    [
        ("mm", 90),
        ("in", pytest.approx(3.543, abs=0.001)),
    ],
)
def test_pwat_scale_meta_extends_to_90mm_with_blue_purple_top_end(pwat_unit, domain_max):
    client = TestClient(main_module.app)

    response = client.get(
        "/api/scale-meta",
        params={
            "variable": "precipitable_water",
            "level": "1000",
            "pwat_unit": pwat_unit,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scale_kind"] == "fixed-pwat"
    assert payload["domain_max"] == domain_max
    assert payload["boundaries"][-1] == domain_max
    assert payload["anchor_values"][-1] == domain_max
    assert payload["anchor_hex"][-4:] == ["#225ea8", "#253494", "#6a51a3", "#cbc9e2"]


@pytest.mark.parametrize(
    ("level", "resolved_variable"),
    [
        ("surface", "lifted_index_surface"),
        ("4-layer", "lifted_index_best"),
        ("0-30mb", "lifted_index_parcel"),
    ],
)
def test_lifted_index_public_variable_resolves_named_level(monkeypatch, level, resolved_variable):
    captured = {}

    def fake_create_map_buffer(req):
        captured["variable"] = req.variable
        captured["level"] = req.level
        return io.BytesIO(b"png")

    monkeypatch.setattr(main_module, "create_map_buffer", fake_create_map_buffer)
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "lifted_index",
            "level": level,
            "region": "CONUS",
        },
    )

    assert response.status_code == 200
    assert captured == {"variable": resolved_variable, "level": 1000}


@pytest.mark.parametrize(
    ("level", "resolved_variable"),
    [
        ("total_column", "cloud_cover_total"),
        ("low", "cloud_cover_low"),
        ("middle", "cloud_cover_middle"),
        ("high", "cloud_cover_high"),
        ("boundary", "cloud_cover_boundary"),
        ("convective", "cloud_cover_convective"),
    ],
)
def test_cloud_cover_public_variable_resolves_named_level(monkeypatch, level, resolved_variable):
    captured = {}

    def fake_create_map_buffer(req):
        captured["variable"] = req.variable
        captured["level"] = req.level
        return io.BytesIO(b"png")

    monkeypatch.setattr(main_module, "create_map_buffer", fake_create_map_buffer)
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "cloud_cover",
            "level": level,
            "region": "CONUS",
        },
    )

    assert response.status_code == 200
    assert captured == {"variable": resolved_variable, "level": 1000}


def test_cloud_cover_rejects_numeric_alias_level(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "cloud_cover",
            "level": "1000",
            "region": "CONUS",
        },
    )

    assert response.status_code == 422
    assert "cloud_cover level must be one of" in response.json()["detail"]


@pytest.mark.parametrize("level", ["total_column", "low"])
def test_cloud_cover_anomaly_is_raw_only(monkeypatch, level):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "cloud_cover",
            "level": level,
            "region": "CONUS",
            "mode": "anomaly",
        },
    )

    assert response.status_code == 422
    assert "raw maps only" in response.json()["detail"]


@pytest.mark.parametrize(
    "variable",
    [
        "cloud_cover_total",
        "cloud_cover_low",
        "cloud_cover_middle",
        "cloud_cover_high",
        "cloud_cover_boundary",
        "cloud_cover_convective",
    ],
)
def test_cloud_cover_scale_meta_uses_percent_fixed_scale(variable):
    client = TestClient(main_module.app)

    response = client.get(
        "/api/scale-meta",
        params={
            "variable": variable,
            "level": "1000",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scale_kind"] == f"fixed-{variable.replace('_', '-')}"
    assert payload["unit"] == "%"
    assert payload["domain_min"] == 0
    assert payload["domain_max"] == 100


def test_cloud_cover_scale_meta_accepts_public_variable_and_named_level():
    client = TestClient(main_module.app)

    response = client.get(
        "/api/scale-meta",
        params={
            "variable": "cloud_cover",
            "level": "middle",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scale_kind"] == "fixed-cloud-cover-middle"
    assert payload["unit"] == "%"


@pytest.mark.parametrize(
    ("level", "waveband", "direction", "resolved_variable"),
    [
        ("surface", "shortwave", "down", "radiation_sw_down_surface"),
        ("surface", "shortwave", "up", "radiation_sw_up_surface"),
        ("surface", "longwave", "down", "radiation_lw_down_surface"),
        ("surface", "longwave", "up", "radiation_lw_up_surface"),
        ("toa", "shortwave", "down", "radiation_sw_down_toa"),
        ("toa", "shortwave", "up", "radiation_sw_up_toa"),
        ("toa", "longwave", "up", "olr"),
    ],
)
def test_radiation_public_variable_resolves_options(monkeypatch, level, waveband, direction, resolved_variable):
    captured = {}

    def fake_create_map_buffer(req):
        captured["variable"] = req.variable
        captured["level"] = req.level
        return io.BytesIO(b"png")

    monkeypatch.setattr(main_module, "create_map_buffer", fake_create_map_buffer)
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "radiation",
            "level": level,
            "waveband": waveband,
            "direction": direction,
            "region": "CONUS",
        },
    )

    assert response.status_code == 200
    assert captured == {"variable": resolved_variable, "level": 1000}


def test_radiation_rejects_numeric_alias_level(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "radiation",
            "level": "1000",
            "waveband": "shortwave",
            "direction": "down",
            "region": "CONUS",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "radiation level must be 'surface' or 'toa'"


def test_radiation_rejects_unavailable_option_combo(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "radiation",
            "level": "toa",
            "waveband": "longwave",
            "direction": "down",
            "region": "CONUS",
        },
    )

    assert response.status_code == 422
    assert "radiation combination is not available" in response.json()["detail"]


@pytest.mark.parametrize(
    ("level", "waveband", "direction"),
    [
        ("surface", "shortwave", "down"),
        ("surface", "longwave", "up"),
    ],
)
def test_radiation_anomaly_is_raw_only(monkeypatch, level, waveband, direction):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "radiation",
            "level": level,
            "waveband": waveband,
            "direction": direction,
            "region": "CONUS",
            "mode": "anomaly",
        },
    )

    assert response.status_code == 422
    assert "raw maps only" in response.json()["detail"]


@pytest.mark.parametrize(
    ("variable", "domain_max"),
    [
        ("radiation_sw_down_surface", 1200),
        ("radiation_sw_up_surface", 600),
        ("radiation_lw_down_surface", 600),
        ("radiation_lw_up_surface", 600),
        ("radiation_sw_down_toa", 1200),
        ("radiation_sw_up_toa", 600),
    ],
)
def test_radiation_scale_meta_uses_fixed_watts_scale(variable, domain_max):
    client = TestClient(main_module.app)

    response = client.get(
        "/api/scale-meta",
        params={
            "variable": variable,
            "level": "1000",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scale_kind"] == f"fixed-{variable.replace('_', '-')}"
    assert payload["unit"] == "W/m²"
    assert payload["domain_max"] == domain_max


def test_radiation_scale_meta_accepts_public_variable_and_options():
    client = TestClient(main_module.app)

    response = client.get(
        "/api/scale-meta",
        params={
            "variable": "radiation",
            "level": "toa",
            "waveband": "shortwave",
            "direction": "up",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scale_kind"] == "fixed-radiation-sw-up-toa"
    assert payload["unit"] == "W/m²"


def test_precip_window_is_only_for_precip_total(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "precip_rate",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "6",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "precip_window is only supported for precip_total maps"


def test_precip_total_accepts_one_daily_hour(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hours": "00",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "24",
        },
    )

    assert response.status_code == 200


def test_precip_total_rejects_multiple_daily_hours(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hours": "00,06,12,18",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "24",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "precip_total daily maps use one ending synoptic time."


def test_precip_total_accepts_date_list(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "dates": "20260101,20260102",
            "hour": "12",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "6",
        },
    )

    assert response.status_code == 200


def test_precip_total_accepts_custom_3_hour_window(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260102",
            "hour": "12",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "36",
        },
    )

    assert response.status_code == 200


def test_precip_total_range_metadata_must_match_window(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    ok = client.get(
        "/api/map",
        params={
            "date": "20260102",
            "hour": "12",
            "start_date": "20260101",
            "start_hour": "00",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "36",
        },
    )
    bad = client.get(
        "/api/map",
        params={
            "date": "20260102",
            "hour": "12",
            "start_date": "20260101",
            "start_hour": "00",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "24",
        },
    )

    assert ok.status_code == 200
    assert bad.status_code == 422
    assert "precip_window does not match" in bad.json()["detail"]


def test_precip_total_rejects_non_3_hour_window(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260102",
            "hour": "12",
            "variable": "precip_total",
            "level": "1000",
            "region": "CONUS",
            "precip_window": "5",
        },
    )

    assert response.status_code == 422
    assert "3-hour multiple" in response.json()["detail"]


def test_precip_unit_is_only_for_precip_maps(monkeypatch):
    monkeypatch.setattr(main_module, "create_map_buffer", lambda _req: io.BytesIO(b"png"))
    client = TestClient(main_module.app)

    response = client.get(
        "/api/map",
        params={
            "date": "20260101",
            "hour": "12",
            "variable": "height",
            "level": "500",
            "region": "CONUS",
            "precip_unit": "mm",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "precip_unit is only supported for precipitation maps"


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


# ── Error responses never carry internals (#45 follow-up) ────────────────────
#
# A rate-limited PSL fetch used to reach the browser as the raw exception text:
# the OPeNDAP URL, the dataset path and the errno. The catch-all that produced
# it covers every unhandled failure in the endpoint, so it could just as easily
# have shipped a cache directory or a library trace.

_MAP_PARAMS = {
    "date": "20260101", "hour": "12", "variable": "height",
    "level": "500", "region": "CONUS",
}
_LEAKY = ("psl.noaa.gov", "dodsC", "Errno", "Traceback", "/Users/", ".venv")


def _map_error_body(monkeypatch, exc):
    def boom(_req):
        raise exc
    monkeypatch.setattr(main_module, "create_map_buffer", boom)
    return TestClient(main_module.app, raise_server_exceptions=False).get(
        "/api/map", params=_MAP_PARAMS)


def test_rate_limited_climatology_answers_503_without_the_url(monkeypatch, caplog):
    exc = ClimatologyUnavailableError(
        "R2 OPeNDAP failed after 2 attempts: "
        "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis.derived/"
        "pressure/uwnd.4Xday.ltm.nc (R1 LTM uwnd 07-27 18z)\n"
        "Underlying error: [Errno -77] NetCDF: Access failure",
        rate_limited=True,
    )
    with caplog.at_level(logging.ERROR, logger="pyre.api"):
        response = _map_error_body(monkeypatch, exc)

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "try again in a few minutes" in detail
    for secret in _LEAKY:
        assert secret not in detail
    # The operator still gets everything.
    assert "psl.noaa.gov" in caplog.text


def test_unreachable_climatology_says_raw_maps_still_work(monkeypatch):
    exc = ClimatologyUnavailableError("dap://internal detail", rate_limited=False)
    response = _map_error_body(monkeypatch, exc)

    assert response.status_code == 503
    assert "Raw maps still work" in response.json()["detail"]
    assert "internal detail" not in response.json()["detail"]


def test_unexpected_failure_does_not_echo_the_exception(monkeypatch, caplog):
    exc = RuntimeError("/Users/someone/.cache/pyre/secret.nc is missing")
    with caplog.at_level(logging.ERROR, logger="pyre.api"):
        response = _map_error_body(monkeypatch, exc)

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail == "Something went wrong while building this map. Please try again."
    for secret in _LEAKY:
        assert secret not in detail
    assert "secret.nc" in caplog.text
