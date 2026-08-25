"""
Climatology from NCEP/DOE Reanalysis 2 (R2), 1991-2020.

Two retrieval strategies:

DAILY (r2-daily): for sub-monthly (3-hourly / daily) anomaly requests.
  - For a requested (month, day), open 30 year-files via OPeNDAP concurrently.
  - Each open uses a constraint expression to fetch ONLY the requested day and
    level: one 73×144 array (~42 KB) instead of a full year file (~170 MB).
  - Compute mean and std across the 30 annual values.
  - Cache to disk: one small file per DOY/level.
  - First request: ~5–10 s. Warm cache: instant.

MONTHLY (r2-monthly): for monthly composite anomaly requests.
  - R2 monthly means: one multi-decade file per variable covering 1979–2021.
  - A single strided OPeNDAP isel(time=slice(t_start, t_end+1, 12)) fetches
    all 30 climo-period values for a given calendar month in one request.
    t_start = (1991-1979)*12 + (month-1) = 144 + (month-1)
    t_end   = (2020-1979)*12 + (month-1) = 492 + (month-1)
  - Compute mean and std across the 30 selected time steps.
  - Cache to disk: one small file per calendar-month/level.
  - First request: ~2–5 s. Warm cache: instant.

--- URL and variable reference ---

OPeNDAP roots (subdirectory per dataset — "pressure", "surface", "gaussian_grid"):
  https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/Dailies/{dataset}
  https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/Monthlies/{dataset}

Which R2 file/variable backs each CORe GRIB field is declared in
config.R2_CLIMO_FIELDS; this module only knows how to fetch a declared spec.
"pressure" files carry a level dimension (17 levels, 1000–10 hPa); "surface"
and "gaussian_grid" files are single-level.

R2 pressure/surface grid: 2.5°×2.5°, 73 lat × 144 lon; gaussian_grid: T62 (~1.9°).
Longitude: 0–360 ascending, same as CORe. Latitude: 90°N→90°S (descending).
Coordinates renamed lat→latitude, lon→longitude to match CORe DataArrays;
anomaly computation regrids climo onto the obs grid via interp_like.

Fill value: R2 files use -9.96921e36. Values beyond ±1e30 are masked to NaN
and arrays are cast to float64 before computing statistics to prevent overflow.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

import numpy as np
import xarray as xr

from .config import CACHE_ROOT, R2_CLIMO_FIELDS
from .disk_cache import atomic_write_netcdf, discard_corrupt, open_netcdf
from .met_math import vector_magnitude

log = logging.getLogger("pyre.climo_r2")


# HDF5-DIAG stderr suppression lives in disk_cache (per-thread, inside
# open_netcdf/atomic_write_netcdf) — the printer setting is per-thread state,
# so a one-time module-level call here silenced only the importing thread.

# ── Constants ────────────────────────────────────────────────────────────────

_THREDDS_ROOT = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2"
_CLIMO_YEARS = list(range(1991, 2021))   # 1991–2020 inclusive, 30 years
R2_DAILY_CENTERED_WINDOW_DAYS = 15

# Daily file naming per THREDDS dataset subdirectory. Monthly files are
# uniformly "{var}.mon.mean.nc" in every subdirectory.
_DAILY_FNAME = {
    "pressure":      "{var}.{year}.nc",
    "surface":       "{var}.{year}.nc",
    "gaussian_grid": "{var}.gauss.{year}.nc",
}


def _daily_url(r2_var: str, year: int, dataset: str) -> str:
    fname = _DAILY_FNAME[dataset].format(var=r2_var, year=year)
    return f"{_THREDDS_ROOT}/Dailies/{dataset}/{fname}"


def _monthly_url(r2_var: str, dataset: str) -> str:
    return f"{_THREDDS_ROOT}/Monthlies/{dataset}/{r2_var}.mon.mean.nc"

def _r2m_climo_time_slice(ds: xr.Dataset, month: int) -> slice:
    """
    Strided time slice selecting the 1991–2020 values of one calendar month.

    Computed from the file's actual time axis rather than an assumed start
    year: most R2 monthly files begin 1979-01, but pr_wtr.eatm.mon.mean.nc
    begins 1948-01. The matching indices are always 12 apart, so a single
    strided slice resolves server-side as one OPeNDAP request.
    """
    times = ds.indexes["time"]
    idx = [
        i for i, t in enumerate(times)
        if t.month == month and _CLIMO_YEARS[0] <= t.year <= _CLIMO_YEARS[-1]
    ]
    if len(idx) != len(_CLIMO_YEARS):
        raise RuntimeError(
            f"R2 monthly file does not cover the full climo period for month {month:02d}: "
            f"found {len(idx)} of {len(_CLIMO_YEARS)} expected years"
        )
    strides = {b - a for a, b in zip(idx, idx[1:])}
    if strides != {12}:
        raise RuntimeError(f"R2 monthly time axis is not annually strided (strides={strides})")
    return slice(idx[0], idx[-1] + 1, 12)

# Disk cache: climo_cache/ under the configurable cache root (see config.py;
# defaults to backend/, override with PYRE_CACHE_DIR in production).
_CACHE_DIR = os.path.join(CACHE_ROOT, "climo_cache")

class _PendingFetch:
    """In-flight fetch sentinel. Carries the outcome to waiting threads so a
    failed fetch raises in every waiter instead of leaving them to KeyError on
    a deleted cache entry."""

    def __init__(self) -> None:
        self.event = threading.Event()
        self.result: dict | None = None
        self.error: Exception | None = None


# In-process memory cache for daily climatology.
# Key: (r2_var, level, month, day) — DOY-granular.
# Value: dict{'mean': DataArray, 'std': DataArray} or _PendingFetch while loading.
_cache: dict[tuple, dict | _PendingFetch] = {}
_cache_lock = threading.Lock()

# In-process memory cache for monthly climatology (separate key space).
# Key: (r2_var, level, month) — calendar-month granular.
_mcache: dict[tuple, dict | _PendingFetch] = {}
_mcache_lock = threading.Lock()
_wcache: dict[tuple, dict | _PendingFetch] = {}
_wcache_lock = threading.Lock()


# ── Disk cache ───────────────────────────────────────────────────────────────

def _disk_path(r2_var: str, level: int, month: int, day: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2_daily_{r2_var}_{level}hPa_{month:02d}{day:02d}.nc")


def _load_disk(r2_var: str, level: int, month: int, day: int) -> dict[str, xr.DataArray] | None:
    path = _disk_path(r2_var, level, month, day)
    if not os.path.exists(path):
        return None
    try:
        with open_netcdf(path) as ds:
            result = {"mean": ds["mean"].load(), "std": ds["std"].load()}
        log.debug("CLIMO_R2  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2  disk cache corrupt (%s), deleting + re-fetching", exc)
        discard_corrupt(path)
        return None


def _save_disk(r2_var: str, level: int, month: int, day: int, result: dict[str, xr.DataArray]) -> None:
    path = _disk_path(r2_var, level, month, day)
    # The data is already computed — a failed cache save must never fail the
    # request (#51 incident 2 500'd here on a sick disk).
    try:
        atomic_write_netcdf(xr.Dataset({"mean": result["mean"], "std": result["std"]}), path)
        log.debug("CLIMO_R2  saved to disk   %s", os.path.basename(path))
    except Exception as exc:
        log.warning("CLIMO_R2  cache save failed (%s) — serving uncached", exc)


def _disk_path_monthly(r2_var: str, level: int, month: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2m_climo_{r2_var}_{level}hPa_{month:02d}.nc")


def _load_disk_monthly(r2_var: str, level: int, month: int) -> dict[str, xr.DataArray] | None:
    path = _disk_path_monthly(r2_var, level, month)
    if not os.path.exists(path):
        return None
    try:
        with open_netcdf(path) as ds:
            result = {"mean": ds["mean"].load(), "std": ds["std"].load()}
        log.debug("CLIMO_R2M  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2M  disk cache corrupt (%s), deleting + re-fetching", exc)
        discard_corrupt(path)
        return None


def _save_disk_monthly(r2_var: str, level: int, month: int, result: dict[str, xr.DataArray]) -> None:
    path = _disk_path_monthly(r2_var, level, month)
    try:
        atomic_write_netcdf(xr.Dataset({"mean": result["mean"], "std": result["std"]}), path)
        log.debug("CLIMO_R2M  saved to disk   %s", os.path.basename(path))
    except Exception as exc:
        log.warning("CLIMO_R2M  cache save failed (%s) — serving uncached", exc)


# ── Surgical OPeNDAP fetch ───────────────────────────────────────────────────

class ClimatologyUnavailableError(RuntimeError):
    """PSL's OPeNDAP server would not serve a baseline this request needs.

    A named type so main.py can answer with a short 503 sentence instead of
    letting the catch-all put this message, and its URL, in the browser.
    Carries `rate_limited` because "they are throttling us" and "the service
    is down" mean different things to whoever reads the log.
    """

    def __init__(self, message: str, *, rate_limited: bool):
        super().__init__(message)
        self.rate_limited = rate_limited


def _is_rate_limited(exc: Exception) -> bool:
    text = str(exc)
    return "429" in text or "undecoded" in text


# Measured against PSL on 2026-07-31: they serve about three requests, then
# 429 every caller from that IP, and the counter needs roughly 60 seconds of
# idle to reset. Idle waits of 1, 2, 3, 5, 8 and 30 seconds all still got 429;
# 60 seconds got 200. So a 429 backoff has to outlast that window or it is
# just noise, and the ladder below is sized to span it rather than to feel
# fast. Do not "improve" this by failing fast: an 8 second retry cannot clear
# a 60 second penalty, it only guarantees the map never renders.
RATE_LIMIT_WAITS_S = (15, 30, 45)


def dap_fetch_with_retries(url: str, extract, *, describe: str, max_retries: int = 4):
    """Open a PSL OPeNDAP dataset and return extract(ds), retrying transient failures.

    Every OPeNDAP fetch in the backend goes through this loop. PSL's nginx
    answers bursts with 429, and a rate-limited/failed DAP response can still
    "open" but with an undecoded numeric time axis — selecting by date string
    then dies with a misleading dtype ValueError (#94). Both are treated as
    the fetch failures they are and retried with backoff. A rate limit waits
    longer than a transient error, because PSL's counter resets on idle time
    rather than on elapsed time (see RATE_LIMIT_WAITS_S).

    extract(ds) runs inside the open dataset context and must .load() what it
    returns. describe appears in logs and the final error message.
    """
    attempt = 0
    budget = max_retries
    while attempt < budget:
        try:
            # open_netcdf holds HDF5_LOCK: fetches serialize (#51).
            with open_netcdf(url, engine="netcdf4") as ds:
                # A rate-limited response decodes to a NUMERIC time axis. Test
                # for that, not for datetime64: the 4x-daily LTM files (#72)
                # stamp a placeholder year 1, outside the datetime64[ns] range
                # (1677-2262), so xarray hands back cftime objects — correctly
                # decoded, and previously mistaken here for a failed fetch.
                if "time" in ds and np.issubdtype(ds["time"].dtype, np.number):
                    raise OSError(
                        "time axis undecoded (rate-limited or corrupt DAP "
                        f"response: {url})"
                    )
                return extract(ds)
        except (OSError, ValueError) as exc:
            rate_limited = _is_rate_limited(exc)
            attempt += 1
            if attempt >= budget:
                raise ClimatologyUnavailableError(
                    f"R2 OPeNDAP failed after {attempt} attempts: {url} "
                    f"({describe})\n"
                    f"PSL THREDDS may be down or rate-limiting (HTTP 429) — "
                    f"try again in a few minutes.\n"
                    f"Underlying error: {exc}",
                    rate_limited=rate_limited,
                ) from exc
            wait = (
                RATE_LIMIT_WAITS_S[min(attempt - 1, len(RATE_LIMIT_WAITS_S) - 1)]
                if rate_limited else 5 * (2 ** (attempt - 1))
            )
            log.warning(
                "CLIMO_R2  OPeNDAP error  %s  attempt=%d/%d retry in %ds  (%s)",
                describe, attempt, budget, wait, exc,
            )
            time.sleep(wait)
    raise RuntimeError("unreachable")


def _fetch_one_year(
    r2_var: str,
    year: int,
    level: int,
    month: int,
    day: int,
    max_retries: int = 4,
    dataset: str = "pressure",
    file_stem: str | None = None,
) -> xr.DataArray:
    """
    Fetch a single (year, month, day) slice at one pressure level via OPeNDAP.

    xarray + netCDF4 sends a constraint expression to the server so only the
    requested time index and level index are transferred (~42 KB per call).
    Fill values are masked and the array is cast to float64 to prevent
    overflow in subsequent std computation.

    Single-level datasets ("surface", "gaussian_grid") have either no level
    dimension or a size-1 one; the level argument is effectively ignored.
    file_stem covers files whose name differs from the variable inside them
    (e.g. air.2m.gauss.{year}.nc contains variable "air").
    """
    url = _daily_url(file_stem or r2_var, year, dataset)
    date_str = f"{year}-{month:02d}-{day:02d}"

    def extract(ds):
        # .sel() with a date string + level value constructs an OPeNDAP
        # constraint expression; .load() issues the single small request.
        da = ds[r2_var]
        if "level" in da.dims:
            da = da.sel(level=level, method="nearest")
        return da.sel(time=date_str, method="nearest").load()

    da = dap_fetch_with_retries(
        url, extract,
        describe=f"var={r2_var} {date_str} @ {level} hPa",
        max_retries=max_retries,
    )
    # Mask R2 fill value (-9.96921e36) and upcast to float64
    return da.where(np.abs(da) < 1e30).astype(np.float64)


def _fetch_scalar_climo(
    r2_var: str,
    level: int,
    month: int,
    day: int,
    dataset: str = "pressure",
    file_stem: str | None = None,
) -> dict[str, xr.DataArray]:
    """
    Fetch one (month, day) from all 30 years concurrently, return (mean, std).
    Equivalent to monthly-pgb's _climatology_stats but for daily R2 data.
    """
    log.info(
        "CLIMO_R2  fetching  var=%s  level=%dhPa  %02d-%02d  (%d years concurrent)",
        file_stem or r2_var, level, month, day, len(_CLIMO_YEARS),
    )
    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(
                _fetch_one_year, r2_var, year, level, month, day,
                dataset=dataset, file_stem=file_stem,
            ): year
            for year in _CLIMO_YEARS
        }
        arrays: list[xr.DataArray] = []
        for fut in as_completed(futures):
            year = futures[fut]
            try:
                arrays.append(fut.result())
            except Exception as exc:
                log.error("CLIMO_R2  year %d failed: %s", year, exc)
                raise

    log.info("CLIMO_R2  fetched in %.1fs", time.perf_counter() - t0)

    stacked = xr.concat(arrays, dim="year")
    mean = stacked.mean(dim="year")
    std  = stacked.std( dim="year", ddof=1)

    mean = mean.rename({"lat": "latitude", "lon": "longitude"})
    std  = std.rename( {"lat": "latitude", "lon": "longitude"})
    return {"mean": mean, "std": std}


def _fetch_wind_speed_climo(level: int, month: int, day: int) -> dict[str, xr.DataArray]:
    """
    Fetch u and v for a specific (month, day) from all 30 years concurrently.
    Compute sqrt(u²+v²) per year before averaging — exact mean speed, not an
    approximation from component means.
    """
    log.info(
        "CLIMO_R2  fetching wind speed  level=%dhPa  %02d-%02d  (%d years concurrent)",
        level, month, day, len(_CLIMO_YEARS),
    )
    t0 = time.perf_counter()

    # Submit u and v fetches together (60 concurrent requests)
    with ThreadPoolExecutor(max_workers=16) as pool:
        u_futures = {
            pool.submit(_fetch_one_year, "uwnd", year, level, month, day): year
            for year in _CLIMO_YEARS
        }
        v_futures = {
            pool.submit(_fetch_one_year, "vwnd", year, level, month, day): year
            for year in _CLIMO_YEARS
        }
        u_by_year: dict[int, xr.DataArray] = {}
        for fut in as_completed(u_futures):
            year = u_futures[fut]
            try:
                u_by_year[year] = fut.result()
            except Exception as exc:
                log.error("CLIMO_R2  uwnd year %d failed: %s", year, exc)
                raise

        v_by_year: dict[int, xr.DataArray] = {}
        for fut in as_completed(v_futures):
            year = v_futures[fut]
            try:
                v_by_year[year] = fut.result()
            except Exception as exc:
                log.error("CLIMO_R2  vwnd year %d failed: %s", year, exc)
                raise

    log.info("CLIMO_R2  fetched in %.1fs", time.perf_counter() - t0)

    speed_arrays = [
        vector_magnitude(u_by_year[y], v_by_year[y])
        for y in _CLIMO_YEARS
    ]
    stacked = xr.concat(speed_arrays, dim="year")
    mean = stacked.mean(dim="year")
    std  = stacked.std( dim="year", ddof=1)

    mean = mean.rename({"lat": "latitude", "lon": "longitude"})
    std  = std.rename( {"lat": "latitude", "lon": "longitude"})
    return {"mean": mean, "std": std}


# ── Monthly OPeNDAP fetch (strided — single request for 30 years) ─────────────

def _fetch_r2m_monthly_scalar(
    r2_var: str,
    level: int,
    month: int,
    dataset: str = "pressure",
    file_stem: str | None = None,
) -> dict[str, xr.DataArray]:
    """
    Fetch all 30 climo-period values for one calendar month using a single strided
    OPeNDAP isel.  The slice generates an OPeNDAP constraint [start:12:end] which
    the server resolves server-side — one round trip instead of 30 concurrent
    year-file opens.  Result size: ~30 × 73 × 144.

    Single-level datasets ("surface", "gaussian_grid") have either no level
    dimension or a size-1 one; the level argument is effectively ignored.
    """
    url = _monthly_url(file_stem or r2_var, dataset)
    t0 = time.perf_counter()

    def extract(ds):
        time_slice = _r2m_climo_time_slice(ds, month)
        log.info(
            "CLIMO_R2M  fetching  var=%s  level=%dhPa  month=%02d  "
            "t_slice=[%d:%d:12]  url=%s",
            file_stem or r2_var, level, month, time_slice.start, time_slice.stop, url,
        )
        da = ds[r2_var]
        if "level" in da.dims:
            da = da.sel(level=level, method="nearest")
        return da.isel(time=time_slice).load()

    da_30yr = dap_fetch_with_retries(
        url, extract, describe=f"monthly var={file_stem or r2_var} @ {level} hPa month={month:02d}",
    )
    log.info("CLIMO_R2M  fetched in %.1fs  shape=%s", time.perf_counter() - t0, da_30yr.shape)

    da_30yr = da_30yr.where(np.abs(da_30yr) < 1e30).astype(np.float64)
    return _mean_std(da_30yr, dim="time")


def _mean_std(stacked: xr.DataArray, dim: str) -> dict[str, xr.DataArray]:
    """(mean, std) across the climo sample, coords renamed to match CORe."""
    mean = stacked.mean(dim=dim)
    std  = stacked.std( dim=dim, ddof=1)
    mean = mean.rename({"lat": "latitude", "lon": "longitude"})
    std  = std.rename( {"lat": "latitude", "lon": "longitude"})
    return {"mean": mean, "std": std}


def _fetch_r2m_monthly_wind_speed(level: int, month: int) -> dict[str, xr.DataArray]:
    """
    Fetch U and V monthly means via two strided OPeNDAP requests (one per file),
    compute sqrt(u²+v²) per year-step before averaging — exact mean speed.
    """
    log.info("CLIMO_R2M  fetching wind speed  level=%dhPa  month=%02d", level, month)
    t0 = time.perf_counter()

    def component(var: str) -> xr.DataArray:
        return dap_fetch_with_retries(
            _monthly_url(var, "pressure"),
            lambda ds: (
                ds[var].sel(level=level, method="nearest")
                .isel(time=_r2m_climo_time_slice(ds, month)).load()
            ),
            describe=f"monthly var={var} @ {level} hPa month={month:02d}",
        )

    u_30yr = component("uwnd")
    v_30yr = component("vwnd")
    log.info("CLIMO_R2M  fetched in %.1fs", time.perf_counter() - t0)

    u_30yr = u_30yr.where(np.abs(u_30yr) < 1e30).astype(np.float64)
    v_30yr = v_30yr.where(np.abs(v_30yr) < 1e30).astype(np.float64)
    speed_30yr = vector_magnitude(u_30yr, v_30yr)
    mean = speed_30yr.mean(dim="time")
    std  = speed_30yr.std( dim="time", ddof=1)
    mean = mean.rename({"lat": "latitude", "lon": "longitude"})
    std  = std.rename( {"lat": "latitude", "lon": "longitude"})
    return {"mean": mean, "std": std}


# ── Single-level fields (surface / gaussian_grid) ────────────────────────────
# Driven by per-variable "r2_climo" specs in config.VARIABLES. Scalar specs
# name one file; derived wind-speed specs name u/v files combined per sample.

def _spec_stem(spec: dict) -> str:
    """Stable cache identifier for a spec (explicit stem for derived specs)."""
    return spec["stem"] if "derive" in spec else spec["file"]


def _fetch_single_level_daily(spec: dict, month: int, day: int) -> dict[str, xr.DataArray]:
    if spec.get("derive") == "wind_speed":
        return _fetch_single_level_daily_wind_speed(spec["u"], spec["v"], month, day)
    return _fetch_scalar_climo(
        spec["var"], 0, month, day, dataset=spec["dataset"], file_stem=spec["file"],
    )


def _fetch_single_level_daily_wind_speed(
    u_spec: dict, v_spec: dict, month: int, day: int
) -> dict[str, xr.DataArray]:
    """
    Fetch u and v for a specific (month, day) from all 30 years concurrently.
    Speed is sqrt(u²+v²) per year before averaging — exact mean speed.
    """
    log.info(
        "CLIMO_R2  fetching single-level wind speed  %s/%s  %02d-%02d  (%d years concurrent)",
        u_spec["file"], v_spec["file"], month, day, len(_CLIMO_YEARS),
    )
    t0 = time.perf_counter()

    def submit(pool, spec):
        return {
            pool.submit(
                _fetch_one_year, spec["var"], year, 0, month, day,
                dataset=spec["dataset"], file_stem=spec["file"],
            ): year
            for year in _CLIMO_YEARS
        }

    with ThreadPoolExecutor(max_workers=16) as pool:
        u_futures = submit(pool, u_spec)
        v_futures = submit(pool, v_spec)
        u_by_year: dict[int, xr.DataArray] = {}
        v_by_year: dict[int, xr.DataArray] = {}
        for futures, by_year, name in ((u_futures, u_by_year, "u"), (v_futures, v_by_year, "v")):
            for fut in as_completed(futures):
                year = futures[fut]
                try:
                    by_year[year] = fut.result()
                except Exception as exc:
                    log.error("CLIMO_R2  %s year %d failed: %s", name, year, exc)
                    raise

    log.info("CLIMO_R2  fetched in %.1fs", time.perf_counter() - t0)

    speed_arrays = [
        vector_magnitude(u_by_year[y], v_by_year[y])
        for y in _CLIMO_YEARS
    ]
    return _mean_std(xr.concat(speed_arrays, dim="year"), dim="year")


def _fetch_single_level_monthly(spec: dict, month: int) -> dict[str, xr.DataArray]:
    if spec.get("derive") == "wind_speed":
        return _fetch_single_level_monthly_wind_speed(spec["u"], spec["v"], month)
    return _fetch_r2m_monthly_scalar(
        spec["var"], 0, month, dataset=spec["dataset"], file_stem=spec["file"],
    )


def _fetch_r2m_30yr(spec: dict, month: int) -> xr.DataArray:
    """One strided OPeNDAP request for the 30 climo-period values of a month."""
    def extract(ds):
        da = ds[spec["var"]]
        if "level" in da.dims:
            da = da.isel(level=0)
        return da.isel(time=_r2m_climo_time_slice(ds, month)).load()

    da = dap_fetch_with_retries(
        _monthly_url(spec["file"], spec["dataset"]), extract,
        describe=f"monthly var={spec['var']} month={month:02d}",
    )
    return da.where(np.abs(da) < 1e30).astype(np.float64)


def _fetch_single_level_monthly_wind_speed(
    u_spec: dict, v_spec: dict, month: int
) -> dict[str, xr.DataArray]:
    """Monthly-mean speed climatology: sqrt(u²+v²) per time-step before stats."""
    log.info(
        "CLIMO_R2M  fetching single-level wind speed  %s/%s  month=%02d",
        u_spec["file"], v_spec["file"], month,
    )
    t0 = time.perf_counter()
    u_30yr = _fetch_r2m_30yr(u_spec, month)
    v_30yr = _fetch_r2m_30yr(v_spec, month)
    log.info("CLIMO_R2M  fetched in %.1fs", time.perf_counter() - t0)
    return _mean_std(vector_magnitude(u_30yr, v_30yr), dim="time")


def _disk_path_single_level(stem: str, month: int, day: int | None) -> str:
    if day is None:
        return os.path.join(_CACHE_DIR, f"r2m_climo_{stem}_sfc_{month:02d}.nc")
    return os.path.join(_CACHE_DIR, f"r2_daily_{stem}_sfc_{month:02d}{day:02d}.nc")


def _disk_path_single_level_window(stem: str, month: int, day: int, window_days: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2_daily_{window_days}day_{stem}_sfc_{month:02d}{day:02d}.nc")


def _load_disk_single_level(stem: str, month: int, day: int | None) -> dict[str, xr.DataArray] | None:
    path = _disk_path_single_level(stem, month, day)
    if not os.path.exists(path):
        return None
    try:
        with open_netcdf(path) as ds:
            result = {"mean": ds["mean"].load(), "std": ds["std"].load()}
        log.debug("CLIMO_R2  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2  disk cache corrupt (%s), deleting + re-fetching", exc)
        discard_corrupt(path)
        return None


def _load_disk_single_level_window(stem: str, month: int, day: int, window_days: int) -> dict[str, xr.DataArray] | None:
    path = _disk_path_single_level_window(stem, month, day, window_days)
    if not os.path.exists(path):
        return None
    try:
        with open_netcdf(path) as ds:
            result = {"mean": ds["mean"].load(), "std": ds["std"].load()}
        log.debug("CLIMO_R2W  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2W  disk cache corrupt (%s), deleting + re-fetching", exc)
        discard_corrupt(path)
        return None


def _save_disk_single_level(stem: str, month: int, day: int | None, result: dict[str, xr.DataArray]) -> None:
    path = _disk_path_single_level(stem, month, day)
    try:
        atomic_write_netcdf(xr.Dataset({"mean": result["mean"], "std": result["std"]}), path)
        log.debug("CLIMO_R2  saved to disk   %s", os.path.basename(path))
    except Exception as exc:
        log.warning("CLIMO_R2  cache save failed (%s) — serving uncached", exc)


def _save_disk_single_level_window(stem: str, month: int, day: int, window_days: int, result: dict[str, xr.DataArray]) -> None:
    path = _disk_path_single_level_window(stem, month, day, window_days)
    try:
        atomic_write_netcdf(xr.Dataset({"mean": result["mean"], "std": result["std"]}), path)
        log.debug("CLIMO_R2W  saved to disk   %s", os.path.basename(path))
    except Exception as exc:
        log.warning("CLIMO_R2W  cache save failed (%s) — serving uncached", exc)


# ── Cache-aware loader ────────────────────────────────────────────────────────

def _load_cached(
    cache: dict,
    lock: threading.Lock,
    cache_key: tuple,
    disk_load,       # callable() → dict | None
    disk_save,       # callable(result) → None
    fetch_fn,        # callable() → dict[str, DataArray]
    log_tag: str,
) -> dict[str, xr.DataArray]:
    """
    Return (mean, std) for the requested key, checking caches in order:
      1. In-process memory
      2. Disk
      3. OPeNDAP (concurrent fetch)

    Thread-safe: a _PendingFetch sentinel blocks concurrent duplicate fetches,
    and hands the fetch outcome (result or exception) to every waiter.
    """
    with lock:
        entry = cache.get(cache_key)
        if isinstance(entry, dict):
            return entry
        if isinstance(entry, _PendingFetch):
            pending = entry
        else:
            pending = None
            mine = _PendingFetch()
            cache[cache_key] = mine

    if pending is not None:
        log.debug("%s  waiting for in-flight fetch  key=%s", log_tag, cache_key)
        pending.event.wait()
        if pending.error is not None:
            raise pending.error
        return pending.result

    try:
        result = disk_load()
        if result is None:
            result = fetch_fn()
            disk_save(result)

        with lock:
            cache[cache_key] = result
        mine.result = result
        return result

    except Exception as exc:
        with lock:
            if cache.get(cache_key) is mine:
                del cache[cache_key]
        mine.error = exc
        raise
    finally:
        mine.event.set()


def _load_monthly(
    r2_var: str,
    level: int,
    month: int,
    fetch_fn,
) -> dict[str, xr.DataArray]:
    """Cache-aware loader for monthly climatology (same pattern as _load for daily)."""
    return _load_cached(
        _mcache,
        _mcache_lock,
        (r2_var, level, month),
        disk_load=lambda: _load_disk_monthly(r2_var, level, month),
        disk_save=lambda result: _save_disk_monthly(r2_var, level, month, result),
        fetch_fn=fetch_fn,
        log_tag="CLIMO_R2M",
    )


def _load(
    r2_var: str,
    level: int,
    month: int,
    day: int,
    fetch_fn,        # callable() → dict[str, DataArray]
) -> dict[str, xr.DataArray]:
    """Cache-aware loader for daily (DOY-granular) climatology."""
    return _load_cached(
        _cache,
        _cache_lock,
        (r2_var, level, month, day),
        disk_load=lambda: _load_disk(r2_var, level, month, day),
        disk_save=lambda result: _save_disk(r2_var, level, month, day, result),
        fetch_fn=fetch_fn,
        log_tag="CLIMO_R2",
    )


def _centered_calendar_days(month: int, day: int, window_days: int) -> list[tuple[int, int]]:
    if window_days % 2 != 1:
        raise ValueError("window_days must be odd for a centered climatology window")
    # Non-leap anchor year keeps Feb 29 out of the climatological calendar.
    center = date(2001, month, day)
    half_window = window_days // 2
    return [
        ((center + timedelta(days=delta)).month, (center + timedelta(days=delta)).day)
        for delta in range(-half_window, half_window + 1)
    ]


def _pooled_daily_climo(
    daily_climos: list[tuple[xr.DataArray, xr.DataArray]],
    *,
    samples_per_day: int,
    attrs: dict[str, object],
) -> dict[str, xr.DataArray]:
    means = [mean.astype(np.float64) for mean, _ in daily_climos]
    stds = [std.astype(np.float64) for _, std in daily_climos]
    total_n = samples_per_day * len(daily_climos)

    pooled_mean = sum(mean * samples_per_day for mean in means) / total_n
    sum_squares_about_zero = sum(
        (samples_per_day - 1) * (std ** 2) + samples_per_day * (mean ** 2)
        for mean, std in zip(means, stds)
    )
    pooled_var = (sum_squares_about_zero - total_n * (pooled_mean ** 2)) / (total_n - 1)
    pooled_std = np.sqrt(pooled_var.where(pooled_var > 0))
    pooled_mean.attrs.update(attrs | {"long_name": "R2 daily moving-window climatological mean"})
    pooled_std.attrs.update(attrs | {"long_name": "R2 daily moving-window sample standard deviation"})
    return {"mean": pooled_mean, "std": pooled_std}


# ── Public API ────────────────────────────────────────────────────────────────

def get_r2_daily_climo_field(
    month: int,
    day: int,
    grib_name: str,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    (mean, std) for a single GRIB variable / pressure level / calendar day.
    Dimensions: (latitude, longitude), 2.5° R2 grid (73 × 144).
    Pass Feb 29 dates as (2, 28).
    """
    spec = R2_CLIMO_FIELDS.get(grib_name)
    if spec is None:
        raise ValueError(
            f"No R2 mapping for GRIB name '{grib_name}'. Supported: {list(R2_CLIMO_FIELDS)}"
        )
    r2_var, dataset = spec["var"], spec["dataset"]
    result = _load(
        r2_var, level, month, day,
        fetch_fn=lambda: _fetch_scalar_climo(r2_var, level, month, day, dataset=dataset),
    )
    return result["mean"], result["std"]


def get_r2_daily_climo_relative_humidity(
    month: int,
    day: int,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """(mean, std) relative humidity (%) for the given calendar day."""
    result = _load(
        "rhum", level, month, day,
        fetch_fn=lambda: _fetch_scalar_climo("rhum", level, month, day),
    )
    return result["mean"], result["std"]


def get_r2_daily_climo_wind_speed(
    month: int,
    day: int,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    (mean, std) wind speed (m/s) for the given calendar day.
    Speed is computed as sqrt(u²+v²) per year before averaging.
    """
    result = _load(
        "wind_speed", level, month, day,
        fetch_fn=lambda: _fetch_wind_speed_climo(level, month, day),
    )
    return result["mean"], result["std"]


def get_r2_daily_climo_wind_components(
    month: int,
    day: int,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """(mean_u, mean_v) wind components (m/s) for the given calendar day."""
    u_result = _load(
        "uwnd", level, month, day,
        fetch_fn=lambda: _fetch_scalar_climo("uwnd", level, month, day),
    )
    v_result = _load(
        "vwnd", level, month, day,
        fetch_fn=lambda: _fetch_scalar_climo("vwnd", level, month, day),
    )
    return u_result["mean"], v_result["mean"]


# ── Public API — monthly climatology ─────────────────────────────────────────

def get_r2_monthly_climo_field(
    month: int,
    grib_name: str,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    (mean, std) for a single GRIB variable / pressure level / calendar month.
    Dimensions: (latitude, longitude), 2.5° R2 grid (73 × 144).
    Uses a single strided OPeNDAP request — faster than 30 concurrent year fetches.
    """
    spec = R2_CLIMO_FIELDS.get(grib_name)
    if spec is None:
        raise ValueError(
            f"No R2 monthly mapping for GRIB name '{grib_name}'. Supported: {list(R2_CLIMO_FIELDS)}"
        )
    r2_var, dataset = spec["var"], spec["dataset"]
    result = _load_monthly(
        r2_var, level, month,
        fetch_fn=lambda: _fetch_r2m_monthly_scalar(r2_var, level, month, dataset=dataset),
    )
    return result["mean"], result["std"]


def get_r2_monthly_climo_relative_humidity(
    month: int,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """(mean, std) relative humidity (%) for the given calendar month."""
    result = _load_monthly(
        "rhum", level, month,
        fetch_fn=lambda: _fetch_r2m_monthly_scalar("rhum", level, month),
    )
    return result["mean"], result["std"]


def get_r2_monthly_climo_wind_speed(
    month: int,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    (mean, std) wind speed (m/s) for the given calendar month.
    Speed is computed as sqrt(u²+v²) per time-step before averaging.
    """
    result = _load_monthly(
        "wind_speed_monthly", level, month,
        fetch_fn=lambda: _fetch_r2m_monthly_wind_speed(level, month),
    )
    return result["mean"], result["std"]


def get_r2_monthly_climo_wind_components(
    month: int,
    level: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """(mean_u, mean_v) monthly wind components (m/s) for the given calendar month."""
    u_result = _load_monthly(
        "uwnd_monthly", level, month,
        fetch_fn=lambda: _fetch_r2m_monthly_scalar("uwnd", level, month),
    )
    v_result = _load_monthly(
        "vwnd_monthly", level, month,
        fetch_fn=lambda: _fetch_r2m_monthly_scalar("vwnd", level, month),
    )
    return u_result["mean"], v_result["mean"]


# ── Public API — single-level (surface / gaussian_grid) climatology ──────────

def get_r2_daily_climo_single_level(
    spec: dict,
    month: int,
    day: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    (mean, std) for a single-level r2_climo spec (see config.VARIABLES) and
    calendar day. Grid follows the spec's dataset: 2.5° for "surface", T62
    gaussian for "gaussian_grid". Pass Feb 29 dates as (2, 28).
    """
    stem = _spec_stem(spec)
    result = _load_cached(
        _cache,
        _cache_lock,
        (stem, "sfc", month, day),
        disk_load=lambda: _load_disk_single_level(stem, month, day),
        disk_save=lambda result: _save_disk_single_level(stem, month, day, result),
        fetch_fn=lambda: _fetch_single_level_daily(spec, month, day),
        log_tag="CLIMO_R2",
    )
    return result["mean"], result["std"]


def get_r2_daily_window_climo_single_level(
    spec: dict,
    month: int,
    day: int,
    window_days: int = R2_DAILY_CENTERED_WINDOW_DAYS,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    (mean, std) for a centered moving-window daily climatology.

    Each member day is first reduced to its 1991-2020 daily mean/std through
    get_r2_daily_climo_single_level. The window std is then recomputed from
    pooled moments, preserving the between-day spread instead of averaging
    daily sigmas.
    """
    if (month, day) == (2, 29):
        month, day = 2, 28
    stem = _spec_stem(spec)
    result = _load_cached(
        _wcache,
        _wcache_lock,
        (stem, "sfc", month, day, window_days),
        disk_load=lambda: _load_disk_single_level_window(stem, month, day, window_days),
        disk_save=lambda result: _save_disk_single_level_window(stem, month, day, window_days, result),
        fetch_fn=lambda: _pooled_daily_climo(
            [
                get_r2_daily_climo_single_level(spec, member_month, member_day)
                for member_month, member_day in _centered_calendar_days(month, day, window_days)
            ],
            samples_per_day=len(_CLIMO_YEARS),
            attrs={
                "units": "kg/m²",
                "climo_source": f"r2-daily-{window_days}day",
                "climo_years": f"{_CLIMO_YEARS[0]}-{_CLIMO_YEARS[-1]}",
                "window_days": window_days,
                "sample_count": len(_CLIMO_YEARS) * window_days,
            },
        ),
        log_tag="CLIMO_R2W",
    )
    return result["mean"], result["std"]


def get_r2_monthly_climo_single_level(
    spec: dict,
    month: int,
) -> tuple[xr.DataArray, xr.DataArray]:
    """(mean, std) for a single-level r2_climo spec and calendar month."""
    stem = _spec_stem(spec)
    result = _load_cached(
        _mcache,
        _mcache_lock,
        (stem, "sfc", month),
        disk_load=lambda: _load_disk_single_level(stem, month, None),
        disk_save=lambda result: _save_disk_single_level(stem, month, None, result),
        fetch_fn=lambda: _fetch_single_level_monthly(spec, month),
        log_tag="CLIMO_R2M",
    )
    return result["mean"], result["std"]
