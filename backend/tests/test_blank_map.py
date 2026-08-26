from __future__ import annotations

import io

import pytest

import app.map_service as map_service
from app import visualizer
from app.map_pipeline.request import MapRequest


def test_blank_map_bypasses_data_fetch(monkeypatch):
    def fail_fetch(*_args, **_kwargs):
        pytest.fail("blank map should not fetch observation data")

    captured = {}

    def fake_render_map_product(req, **kwargs):
        captured["request"] = req
        captured["kwargs"] = kwargs
        return io.BytesIO(b"png")

    monkeypatch.setattr(map_service, "fetch_obs", fail_fetch)
    monkeypatch.setattr(map_service, "fetch_wind", fail_fetch)
    monkeypatch.setattr(map_service, "render_map_product", fake_render_map_product)

    result = map_service.create_map_buffer(
        MapRequest(
            date="20260101",
            hour="12",
            variable="blank_map",
            level=None,
            region="CONUS",
        )
    )

    assert result.getvalue() == b"png"
    assert captured["request"].variable == "blank_map"
    assert captured["request"].level is None
    assert captured["kwargs"]["data_array"] is None
    assert captured["kwargs"]["var_label"] == "Blank Map"
    assert captured["kwargs"]["date_label"] == ""


def test_blank_map_metadata_label_uses_region_projection_and_extent():
    proj = visualizer._REGION_PROJECTIONS["North America"]
    lon0, lon1, lat0, lat1 = visualizer._REGION_EXTENTS["North America"]

    assert visualizer._projection_label(proj) == "Lambert Conformal"
    assert visualizer._extent_label(lon0, lon1, lat0, lat1) == "Lon: 135°W to 67°W; Lat: 13°N to 78°N"
