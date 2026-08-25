import numpy as np
import xarray as xr

from app.climo_core import WINDOW_DAYS, core_3hourly_path, core_3hourly_window_members
from app.map_pipeline.fetch_plan import fetch_climo
from app.map_pipeline.request import MapRequest


def test_core_3hourly_window_members_use_same_hour_and_do_not_cross_year_boundary():
    members = core_3hourly_window_members(1, 1, "00")

    assert WINDOW_DAYS == 5
    assert len(members) == 180
    assert members[0].date == "19910101"
    assert members[-1].date == "20200106"
    assert {member.hour for member in members} == {"00"}
    assert "19901231" not in {member.date for member in members}


def test_core_3hourly_window_members_midyear_use_330_samples():
    members = core_3hourly_window_members(8, 19, "12")

    assert len(members) == 330
    assert members[0].date == "19910814"
    assert members[-1].date == "20200824"
    assert {member.hour for member in members} == {"12"}


def test_core_3hourly_cache_path_is_window_versioned():
    path = core_3hourly_path("pwat", 8, 19, "12")

    assert "pm5d" in path
    assert path.endswith("core_3hourly_pwat_0819_12z_pm5d.nc")


def test_fetch_climo_uses_core_3hourly_pwat_reader(monkeypatch):
    mean = xr.DataArray(np.array([[1.0]]), dims=("latitude", "longitude"))
    std = xr.DataArray(np.array([[0.5]]), dims=("latitude", "longitude"))
    calls = []

    def fake_get_core_3hourly_pwat_climo(month, day, hour):
        calls.append((month, day, hour))
        return mean, std

    monkeypatch.setattr(
        "app.map_pipeline.fetch_plan.get_core_3hourly_pwat_climo",
        fake_get_core_3hourly_pwat_climo,
    )

    req = MapRequest(variable="precipitable_water", hour="12", level=1000)

    result_mean, result_std = fetch_climo(req, "core-3hourly", 8, 19, "PWAT")
    assert result_mean is mean
    assert result_std is std
    assert calls == [(8, 19, "12")]


def test_fetch_climo_uses_r2_daily_15day_pwat_reader(monkeypatch):
    mean = xr.DataArray(np.array([[2.0]]), dims=("latitude", "longitude"))
    std = xr.DataArray(np.array([[0.75]]), dims=("latitude", "longitude"))
    calls = []

    def fake_get_r2_daily_window_climo_single_level(spec, month, day):
        calls.append((spec, month, day))
        return mean, std

    monkeypatch.setattr(
        "app.map_pipeline.fetch_plan.get_r2_daily_window_climo_single_level",
        fake_get_r2_daily_window_climo_single_level,
    )

    req = MapRequest(variable="precipitable_water", hour="12", level=1000)

    result_mean, result_std = fetch_climo(req, "r2-daily-15day", 8, 19, "PWAT")
    assert result_mean is mean
    assert result_std is std
    assert calls == [({"file": "pr_wtr.eatm", "var": "pr_wtr", "dataset": "surface"}, 8, 19)]
