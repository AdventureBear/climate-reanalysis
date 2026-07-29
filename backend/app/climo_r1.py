"""
Per-synoptic-hour climatology from NCEP/NCAR Reanalysis 1 (R1), 1991-2020.

Why this module exists (#72): a 3-hourly anomaly map subtracts a climatology
from a single-hour snapshot. Using a DAILY-mean baseline leaves the normal
day/night cycle inside the anomaly — on a quiet day the 18z map glows warm
over land and the 06z map cold, real features get erased or doubled, and the
ocean (no diurnal cycle) stays flat. Measured at Pittsburgh for May 4, the
normals run 48F at 00z, 47F at 06z, 61F at 12z, 57F at 18z: a 14F spread that
the daily mean flattens away.

The fix is a baseline that already contains the diurnal cycle, so subtraction
cancels it. PSL/ESRL solved this the same way for the hourly composite pages
they published: 4x-daily long-term-mean files, one normal per synoptic hour.

    https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis.derived/{dataset}/{stem}.4Xday.ltm.nc

File shape (verified 2026-07-28): 1460 time steps = 365 days x 4 hours
(00/06/12/18z) stamped on a placeholder year 1, so lookup is a plain
month/day/hour match with no year arithmetic. `climatology_bounds` reports
1991-01-01 to 2020-01-01, matching the base period used everywhere else on
the site. Grids follow the dataset subdirectory, same as R2: 2.5 deg for
"pressure"/"surface", T62 gaussian for "surface_gauss".

Means only — these files carry no standard deviation, which is why 3-hourly
NORMALIZED mode is not offered (see the #72 spec).

Interim by design: R1 is a generation older than the R2 baseline used for
daily/monthly modes, but the R1-vs-R2 difference is far smaller than the
+/-10F diurnal error it removes. CORe-native 8x-daily climatology (#70) will
replace both this cross-dataset baseline and the 03/09/15/21z interpolation.
"""

from __future__ import annotations

import logging
import os
import threading

import numpy as np
import xarray as xr

from .climo_r2 import _PendingFetch, _load_cached, dap_fetch_with_retries
from .config import CACHE_ROOT
from .disk_cache import atomic_write_netcdf, discard_corrupt, open_netcdf

log = logging.getLogger("pyre.climo_r1")

_THREDDS_ROOT = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis.derived"

# The synoptic hours these files carry. 03/09/15/21z are interpolated between
# neighbours, wrapping 21z->00z through the next day.
LTM_HOURS = (0, 6, 12, 18)

# R1 stamps its gaussian-grid surface fields at the FORECAST INITIALIZATION
# time: the record labelled 18z holds the 6-hour forecast valid at 00z. The
# 2.5-degree "surface" files and all "pressure" files are analyses, valid at
# the hour they are stamped with.
#
# Verified against CORe observations (2026-07-28): at four continental points
# in both hemispheres the gaussian LTM peak sat exactly 6 hours before the
# observed peak, while pressure-level and 2.5-degree surface LTMs matched
# observations hour for hour. Ignoring this shift compares an afternoon
# observation against a mid-morning normal — a bigger error than the daily-mean
# baseline it replaces.
_FORECAST_STAMPED_DATASETS = {"surface_gauss", "other_gauss"}
_FORECAST_OFFSET_HOURS = 6

_CACHE_DIR = os.path.join(CACHE_ROOT, "climo_cache")

_cache: dict[tuple, dict | _PendingFetch] = {}
_cache_lock = threading.Lock()


def ltm_url(spec: dict) -> str:
    return f"{_THREDDS_ROOT}/{spec['dataset']}/{spec['file']}.4Xday.ltm.nc"


def bracketing_hours(hour: int) -> tuple[int, int, float]:
    """(lower LTM hour, upper LTM hour, weight of the upper) for any 3-hourly hour.

    An exact LTM hour returns weight 0 so the caller can skip the second fetch.
    21z brackets 18z and 00z, the latter read from the following day.
    """
    if hour % 3:
        raise ValueError(f"hour must be a 3-hourly analysis hour, got {hour}")
    lower = max(h for h in LTM_HOURS if h <= hour) if hour <= 18 else 18
    if hour in LTM_HOURS:
        return lower, lower, 0.0
    upper = lower + 6          # 21z -> 24, normalised to 00z of the next day
    return lower, upper % 24, (hour - lower) / 6.0


def _select_hour(ds: xr.Dataset, var: str, month: int, day: int, hour: int) -> xr.DataArray:
    """The (month, day, hour) slice from a 4x-daily LTM file.

    Times sit on placeholder year 1 as cftime objects, so match on the
    calendar fields rather than constructing a datetime.
    """
    times = ds["time"].values
    idx = [
        i for i, t in enumerate(times)
        if t.month == month and t.day == day and t.hour == hour
    ]
    if not idx:
        raise RuntimeError(f"R1 LTM file has no {month:02d}-{day:02d} {hour:02d}z step")
    return ds[var].isel(time=idx[0])


def _fetch_hour(spec: dict, month: int, day: int, hour: int) -> xr.DataArray:
    """One LTM slice: a single OPeNDAP constraint request."""
    url = ltm_url(spec)

    def extract(ds):
        da = _select_hour(ds, spec["var"], month, day, hour)
        if "level" in da.dims:
            da = da.sel(level=spec["level"], method="nearest")
        return da.load()

    da = dap_fetch_with_retries(
        url, extract,
        describe=f"R1 LTM {spec['file']} {month:02d}-{day:02d} {hour:02d}z",
    )
    da = da.where(np.abs(da) < 1e30).astype(np.float64)
    return da.rename({"lat": "latitude", "lon": "longitude"})


def _disk_path(stem: str, level: int, month: int, day: int, hour: int) -> str:
    return os.path.join(
        _CACHE_DIR, f"r1_4xday_{stem}_{level}hPa_{month:02d}{day:02d}_{hour:02d}z.nc"
    )


def _load_disk(stem: str, level: int, month: int, day: int, hour: int) -> dict | None:
    path = _disk_path(stem, level, month, day, hour)
    if not os.path.exists(path):
        return None
    try:
        with open_netcdf(path) as ds:
            return {"mean": ds["mean"].load()}
    except Exception as exc:
        log.warning("CLIMO_R1  disk cache corrupt (%s), deleting + re-fetching", exc)
        discard_corrupt(path)
        return None


def _save_disk(stem: str, level: int, month: int, day: int, hour: int, result: dict) -> None:
    path = _disk_path(stem, level, month, day, hour)
    # Already-fetched data: a failed cache save must never fail the request.
    try:
        atomic_write_netcdf(xr.Dataset({"mean": result["mean"]}), path)
        log.debug("CLIMO_R1  saved to disk  %s", os.path.basename(path))
    except Exception as exc:
        log.warning("CLIMO_R1  cache save failed (%s) — serving uncached", exc)


def file_slot(spec: dict, month: int, day: int, valid_hour: int) -> tuple[int, int, int]:
    """(month, day, label hour) holding the normal VALID at `valid_hour`.

    Analysis files return the request unchanged. Forecast-stamped files are
    read 6 hours earlier — and 00z/03z valid times fall on the previous day's
    18z record (see _FORECAST_STAMPED_DATASETS).
    """
    if spec["dataset"] not in _FORECAST_STAMPED_DATASETS:
        return month, day, valid_hour
    label = valid_hour - _FORECAST_OFFSET_HOURS
    if label < 0:
        month, day = _previous_day(month, day)
        label += 24
    return month, day, label


def _cached_hour(spec: dict, level: int, month: int, day: int, hour: int) -> xr.DataArray:
    """Normal valid at `hour` — cached by VALID time, fetched by file slot."""
    stem = spec["file"]
    f_month, f_day, f_hour = file_slot(spec, month, day, hour)
    result = _load_cached(
        _cache,
        _cache_lock,
        (stem, level, month, day, hour),
        disk_load=lambda: _load_disk(stem, level, month, day, hour),
        disk_save=lambda result: _save_disk(stem, level, month, day, hour, result),
        fetch_fn=lambda: {"mean": _fetch_hour({**spec, "level": level}, f_month, f_day, f_hour)},
        log_tag="CLIMO_R1",
    )
    return result["mean"]


def get_r1_hourly_climo(spec: dict, level: int, month: int, day: int, hour: int) -> xr.DataArray:
    """Per-synoptic-hour climatological mean for one (day, hour).

    spec is a variable's `r1_4xday` entry from config.VARIABLES:
    {"file": "air.2m", "var": "air", "dataset": "surface_gauss"}.

    Feb 29 reads Feb 28, matching the R2 daily path. Off-LTM hours
    (03/09/15/21z) interpolate linearly between neighbours; 21z blends 18z with
    the next day's 00z, so the diurnal curve stays continuous across midnight.
    """
    if (month, day) == (2, 29):
        month, day = 2, 28

    lower, upper, weight = bracketing_hours(hour)
    lower_da = _cached_hour(spec, level, month, day, lower)
    if weight == 0.0:
        return lower_da

    up_month, up_day = (month, day)
    if upper == 0:                      # 21z borrows 00z from the following day
        up_month, up_day = _next_day(month, day)
    upper_da = _cached_hour(spec, level, up_month, up_day, upper)
    return lower_da * (1.0 - weight) + upper_da * weight


def get_r1_hourly_climo_spec(spec: dict, level: int, month: int, day: int, hour: int) -> xr.DataArray:
    """Per-hour mean for a variable's `r1_4xday` spec, scalar or derived.

    Derived wind speed combines the u and v normals as sqrt(u²+v²). That is the
    speed of the *mean wind vector*, not the mean of the speeds — the same
    approximation the R2 monthly path makes, and acceptable here because the
    baseline only has to remove the diurnal cycle, not set an absolute record.
    """
    if spec.get("derive") == "wind_speed":
        u = get_r1_hourly_climo(spec["u"], level, month, day, hour)
        v = get_r1_hourly_climo(spec["v"], level, month, day, hour)
        return (u ** 2 + v ** 2) ** 0.5
    return get_r1_hourly_climo(spec, level, month, day, hour)


def get_r1_hourly_climo_field(grib_name: str, level: int, month: int, day: int, hour: int) -> xr.DataArray:
    """Per-hour mean for a pressure-level GRIB field (see config.R1_4XDAY_FIELDS)."""
    from .config import R1_4XDAY_FIELDS

    spec = R1_4XDAY_FIELDS.get(grib_name)
    if spec is None:
        raise ValueError(f"No R1 4×-daily mapping for GRIB name {grib_name!r}")
    return get_r1_hourly_climo(spec, level, month, day, hour)


def get_r1_hourly_climo_wind_speed(level: int, month: int, day: int, hour: int) -> xr.DataArray:
    """Per-hour wind-speed mean at a pressure level, from the u/v LTM files."""
    u = get_r1_hourly_climo_field("UGRD", level, month, day, hour)
    v = get_r1_hourly_climo_field("VGRD", level, month, day, hour)
    return (u ** 2 + v ** 2) ** 0.5


_DAYS_IN_LTM_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _next_day(month: int, day: int) -> tuple[int, int]:
    """Next calendar day on a fixed 365-day LTM year (Feb has 28 days)."""
    if day < _DAYS_IN_LTM_MONTH[month - 1]:
        return month, day + 1
    return (1, 1) if month == 12 else (month + 1, 1)


def _previous_day(month: int, day: int) -> tuple[int, int]:
    """Previous calendar day on the same fixed 365-day LTM year."""
    if day > 1:
        return month, day - 1
    prev = 12 if month == 1 else month - 1
    return prev, _DAYS_IN_LTM_MONTH[prev - 1]
