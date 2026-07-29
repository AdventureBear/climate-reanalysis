"""Unit tests for the R1 4x-daily per-hour climatology path (#72). No network:
open_netcdf is faked so hour selection, interpolation, and caching are provable
offline.
"""

import cftime
import numpy as np
import pytest
import xarray as xr

import app.climo_r1 as climo_r1
from app.climo_r1 import bracketing_hours, file_slot, get_r1_hourly_climo, ltm_url

# R1's gaussian-grid surface fields are 6-hour forecasts stamped at their
# initialization time (the record labelled 18z is valid at 00z); pressure and
# 2.5° surface files are analyses, valid at the hour they carry. See the
# module docstring for the verification against CORe observations.
SPEC = GAUSS_SPEC = {"file": "air.2m", "var": "air", "dataset": "surface_gauss"}
PRESSURE_SPEC = {"file": "air", "var": "air", "dataset": "pressure"}
SURFACE_SPEC = {"file": "slp", "var": "slp", "dataset": "surface"}


def fake_ltm_dataset() -> xr.Dataset:
    """A miniature 4x-daily LTM file: 365 days x 4 hours on placeholder year 1.

    Each step's value encodes its own (month, day, hour) so tests can assert
    exactly which slice was selected: value = month*10000 + day*100 + hour.
    """
    times, values = [], []
    days_in = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    for month in range(1, 13):
        for day in range(1, days_in[month - 1] + 1):
            for hour in (0, 6, 12, 18):
                times.append(cftime.DatetimeGregorian(1, month, day, hour))
                values.append(month * 10000 + day * 100 + hour)
    data = np.array(values, dtype=float)[:, None, None] * np.ones((1, 2, 2))
    return xr.Dataset(
        {"air": (("time", "lat", "lon"), data)},
        coords={"time": times, "lat": [40.0, 45.0], "lon": [280.0, 285.0]},
    )


class _FakeOpen:
    """Context-manager stand-in for open_netcdf that counts opens."""

    def __init__(self, ds):
        self.ds = ds
        self.opens = 0

    def __call__(self, *args, **kwargs):
        self.opens += 1
        outer = self

        class _Ctx:
            def __enter__(self):
                return outer.ds

            def __exit__(self, *exc):
                return False

        return _Ctx()


@pytest.fixture
def fake_dap(monkeypatch, tmp_path):
    """Route fetches at the fake dataset and caches at a temp dir; clear state."""
    fake = _FakeOpen(fake_ltm_dataset())
    monkeypatch.setattr(climo_r1, "open_netcdf", fake)
    # dap_fetch_with_retries lives in climo_r2 and opens via its own import.
    import app.climo_r2 as climo_r2
    monkeypatch.setattr(climo_r2, "open_netcdf", fake)
    monkeypatch.setattr(climo_r1, "_CACHE_DIR", str(tmp_path))
    climo_r1._cache.clear()
    return fake


def value_of(da) -> float:
    return float(np.asarray(da)[0][0])


class TestBracketingHours:
    @pytest.mark.parametrize("hour", [0, 6, 12, 18])
    def test_exact_ltm_hours_need_no_interpolation(self, hour):
        assert bracketing_hours(hour) == (hour, hour, 0.0)

    @pytest.mark.parametrize("hour,expected", [
        (3, (0, 6, 0.5)), (9, (6, 12, 0.5)), (15, (12, 18, 0.5)),
    ])
    def test_midpoints_blend_neighbours(self, hour, expected):
        assert bracketing_hours(hour) == expected

    def test_21z_wraps_to_next_00z(self):
        assert bracketing_hours(21) == (18, 0, 0.5)

    def test_non_synoptic_hour_rejected(self):
        with pytest.raises(ValueError, match="3-hourly"):
            bracketing_hours(4)


class TestHourSelection:
    def test_analysis_file_returns_the_requested_hour(self, fake_dap):
        da = get_r1_hourly_climo(PRESSURE_SPEC, 0, 5, 4, 18)
        assert value_of(da) == 5 * 10000 + 4 * 100 + 18

    def test_each_synoptic_hour_differs(self, fake_dap):
        vals = [value_of(get_r1_hourly_climo(SPEC, 0, 5, 4, h)) for h in (0, 6, 12, 18)]
        assert len(set(vals)) == 4, "the whole point: hours must not share one normal"

    def test_coords_renamed_to_core_convention(self, fake_dap):
        da = get_r1_hourly_climo(SPEC, 0, 5, 4, 12)
        assert "latitude" in da.dims and "longitude" in da.dims

    def test_feb_29_falls_back_to_feb_28(self, fake_dap):
        leap = get_r1_hourly_climo(SPEC, 0, 2, 29, 12)
        assert value_of(leap) == value_of(get_r1_hourly_climo(SPEC, 0, 2, 28, 12))


class TestInterpolation:
    def test_midpoint_is_the_average_of_neighbours(self, fake_dap):
        at_09 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 4, 9))
        at_06 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 4, 6))
        at_12 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 4, 12))
        assert at_09 == pytest.approx((at_06 + at_12) / 2)

    def test_21z_blends_across_midnight(self, fake_dap):
        at_21 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 4, 21))
        at_18 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 4, 18))
        next_00 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 5, 0))
        assert at_21 == pytest.approx((at_18 + next_00) / 2)

    def test_21z_on_month_end_rolls_into_next_month(self, fake_dap):
        at_21 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 31, 21))
        at_18 = value_of(get_r1_hourly_climo(SPEC, 0, 5, 31, 18))
        june_00 = value_of(get_r1_hourly_climo(SPEC, 0, 6, 1, 0))
        assert at_21 == pytest.approx((at_18 + june_00) / 2)

    def test_21z_on_dec_31_wraps_to_jan_1(self, fake_dap):
        at_21 = value_of(get_r1_hourly_climo(SPEC, 0, 12, 31, 21))
        at_18 = value_of(get_r1_hourly_climo(SPEC, 0, 12, 31, 18))
        jan_00 = value_of(get_r1_hourly_climo(SPEC, 0, 1, 1, 0))
        assert at_21 == pytest.approx((at_18 + jan_00) / 2)


class TestCaching:
    def test_second_request_does_not_refetch(self, fake_dap):
        get_r1_hourly_climo(SPEC, 0, 5, 4, 12)
        opens_after_first = fake_dap.opens
        get_r1_hourly_climo(SPEC, 0, 5, 4, 12)
        assert fake_dap.opens == opens_after_first, "memory cache should serve the repeat"

    def test_exact_hour_costs_one_fetch(self, fake_dap):
        get_r1_hourly_climo(SPEC, 0, 5, 4, 12)
        assert fake_dap.opens == 1

    def test_interpolated_hour_costs_two_fetches(self, fake_dap):
        get_r1_hourly_climo(SPEC, 0, 5, 4, 9)
        assert fake_dap.opens == 2


class TestUrl:
    def test_url_follows_psl_layout(self):
        assert ltm_url(SPEC) == (
            "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis.derived/"
            "surface_gauss/air.2m.4Xday.ltm.nc"
        )


# ── Forecast-stamped datasets ────────────────────────────────────────────────

class TestForecastStampOffset:
    @pytest.mark.parametrize("spec", [PRESSURE_SPEC, SURFACE_SPEC])
    @pytest.mark.parametrize("hour", [0, 6, 12, 18])
    def test_analysis_files_read_the_hour_they_are_asked_for(self, spec, hour):
        assert file_slot(spec, 5, 4, hour) == (5, 4, hour)

    @pytest.mark.parametrize("valid,expected", [
        (6, (5, 4, 0)), (12, (5, 4, 6)), (18, (5, 4, 12)),
    ])
    def test_forecast_files_read_six_hours_earlier(self, valid, expected):
        assert file_slot(GAUSS_SPEC, 5, 4, valid) == expected

    def test_00z_valid_reads_previous_day_18z(self):
        assert file_slot(GAUSS_SPEC, 5, 4, 0) == (5, 3, 18)

    def test_month_start_00z_rolls_back_a_month(self):
        assert file_slot(GAUSS_SPEC, 6, 1, 0) == (5, 31, 18)

    def test_jan_1_00z_wraps_to_dec_31(self):
        assert file_slot(GAUSS_SPEC, 1, 1, 0) == (12, 31, 18)

    def test_march_1_00z_rolls_back_to_feb_28(self):
        assert file_slot(GAUSS_SPEC, 3, 1, 0) == (2, 28, 18)

    def test_gaussian_diurnal_phase_shifts_by_one_step(self, fake_dap):
        """The fake file encodes its own slot, so the returned value proves
        which record was read: 18z valid must come from the 12z record."""
        assert value_of(get_r1_hourly_climo(GAUSS_SPEC, 0, 5, 4, 18)) == 5 * 10000 + 4 * 100 + 12

    def test_pressure_files_are_unshifted(self, fake_dap):
        assert value_of(get_r1_hourly_climo(PRESSURE_SPEC, 0, 5, 4, 18)) == 5 * 10000 + 4 * 100 + 18
