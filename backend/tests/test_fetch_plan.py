from types import SimpleNamespace

from app.map_pipeline import fetch_plan


def test_averaged_flx_field_fetches_prior_cycle_for_selected_valid_hour(monkeypatch):
    calls = []

    def fake_fetch_flx_field(date, hour, grib_name, level_name, *, time_stat=None):
        calls.append((date, hour, grib_name, level_name, time_stat))
        return object()

    monkeypatch.setattr(fetch_plan, "fetch_flx_field", fake_fetch_flx_field)

    fetch_plan._flx_field(SimpleNamespace(variable="radiation_sw_down_surface"), "20260101", "00")

    assert calls == [("20251231", "21", "DSWRF", "surface", "0-3 hour ave fcst")]


def test_averaged_cloud_cover_fetches_prior_cycle_for_selected_valid_hour(monkeypatch):
    calls = []

    def fake_fetch_flx_field(date, hour, grib_name, level_name, *, time_stat=None):
        calls.append((date, hour, grib_name, level_name, time_stat))
        return object()

    monkeypatch.setattr(fetch_plan, "fetch_flx_field", fake_fetch_flx_field)

    fetch_plan._flx_field(SimpleNamespace(variable="cloud_cover_total"), "20260101", "00")

    assert calls == [("20251231", "21", "TCDC", "atmos col", "0-3 hour ave fcst")]


def test_analysis_flx_field_uses_selected_cycle(monkeypatch):
    calls = []

    def fake_fetch_flx_field(date, hour, grib_name, level_name, *, time_stat=None):
        calls.append((date, hour, grib_name, level_name, time_stat))
        return object()

    monkeypatch.setattr(fetch_plan, "fetch_flx_field", fake_fetch_flx_field)

    fetch_plan._flx_field(SimpleNamespace(variable="cloud_cover_convective"), "20260101", "00")

    assert calls == [("20260101", "00", "TCDC", "convective cloud layer", None)]
