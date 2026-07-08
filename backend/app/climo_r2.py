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

import ctypes
import ctypes.util
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import xarray as xr

from .config import CACHE_ROOT, R2_CLIMO_FIELDS
from .disk_cache import atomic_write_netcdf

log = logging.getLogger("pyre.climo_r2")


def _silence_hdf5_errors() -> None:
    """Disable HDF5's default C-level error printing globally (thread-safe, one-time).

    When xr.open_dataset opens an OPeNDAP URL with engine='netcdf4', HDF5
    probes the URL as a local HDF5 file before falling back to the DAP protocol.
    This is normal/successful but generates HDF5-DIAG spam on stderr for every
    request. H5Eset_auto2(H5E_DEFAULT=0, NULL, NULL) disables the printer;
    Python exceptions from netCDF4 still propagate normally.
    """
    for name in ("hdf5", "hdf5_serial", "hdf5_openmpi"):
        path = ctypes.util.find_library(name)
        if not path:
            continue
        try:
            lib = ctypes.CDLL(path)
            lib.H5Eset_auto2(0, None, None)
            return
        except Exception:
            continue
    # Direct name fallback (macOS / Linux)
    for path in ("libhdf5.dylib", "libhdf5.so"):
        try:
            ctypes.CDLL(path).H5Eset_auto2(0, None, None)
            return
        except Exception:
            continue


_silence_hdf5_errors()

# ── Constants ────────────────────────────────────────────────────────────────

_THREDDS_ROOT = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2"
_CLIMO_YEARS = list(range(1991, 2021))   # 1991–2020 inclusive, 30 years
_R2M_FIRST_YEAR = 1979

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

# Strided time indices for the 1991–2020 climo period in the monthly mean files.
# For calendar month M (1-indexed):
#   t_start = (1991-1979)*12 + (M-1) = 144 + (M-1)
#   t_end   = (2020-1979)*12 + (M-1) = 492 + (M-1)
_R2M_CLIMO_T0 = (_CLIMO_YEARS[0]  - _R2M_FIRST_YEAR) * 12   # 144
_R2M_CLIMO_T1 = (_CLIMO_YEARS[-1] - _R2M_FIRST_YEAR) * 12   # 492

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


# ── Disk cache ───────────────────────────────────────────────────────────────

def _disk_path(r2_var: str, level: int, month: int, day: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2_daily_{r2_var}_{level}hPa_{month:02d}{day:02d}.nc")


def _load_disk(r2_var: str, level: int, month: int, day: int) -> dict[str, xr.DataArray] | None:
    path = _disk_path(r2_var, level, month, day)
    if not os.path.exists(path):
        return None
    try:
        ds = xr.open_dataset(path)
        result = {"mean": ds["mean"].load(), "std": ds["std"].load()}
        ds.close()
        log.debug("CLIMO_R2  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2  disk cache corrupt (%s), re-fetching", exc)
        return None


def _save_disk(r2_var: str, level: int, month: int, day: int, result: dict[str, xr.DataArray]) -> None:
    path = _disk_path(r2_var, level, month, day)
    atomic_write_netcdf(xr.Dataset({"mean": result["mean"], "std": result["std"]}), path)
    log.debug("CLIMO_R2  saved to disk   %s", os.path.basename(path))


def _disk_path_monthly(r2_var: str, level: int, month: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2m_climo_{r2_var}_{level}hPa_{month:02d}.nc")


def _load_disk_monthly(r2_var: str, level: int, month: int) -> dict[str, xr.DataArray] | None:
    path = _disk_path_monthly(r2_var, level, month)
    if not os.path.exists(path):
        return None
    try:
        ds = xr.open_dataset(path)
        result = {"mean": ds["mean"].load(), "std": ds["std"].load()}
        ds.close()
        log.debug("CLIMO_R2M  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2M  disk cache corrupt (%s), re-fetching", exc)
        return None


def _save_disk_monthly(r2_var: str, level: int, month: int, result: dict[str, xr.DataArray]) -> None:
    path = _disk_path_monthly(r2_var, level, month)
    atomic_write_netcdf(xr.Dataset({"mean": result["mean"], "std": result["std"]}), path)
    log.debug("CLIMO_R2M  saved to disk   %s", os.path.basename(path))


# ── Surgical OPeNDAP fetch ───────────────────────────────────────────────────

def _fetch_one_year(
    r2_var: str,
    year: int,
    level: int,
    month: int,
    day: int,
    max_retries: int = 4,
    dataset: str = "pressure",
) -> xr.DataArray:
    """
    Fetch a single (year, month, day) slice at one pressure level via OPeNDAP.

    xarray + netCDF4 sends a constraint expression to the server so only the
    requested time index and level index are transferred (~42 KB per call).
    Fill values are masked and the array is cast to float64 to prevent
    overflow in subsequent std computation.

    Single-level datasets ("surface", "gaussian_grid") have no level dimension;
    the level argument is ignored for them.
    """
    url = _daily_url(r2_var, year, dataset)
    date_str = f"{year}-{month:02d}-{day:02d}"

    for attempt in range(max_retries):
        try:
            ds = xr.open_dataset(url, engine="netcdf4")
            # .sel() with a date string + level value constructs an OPeNDAP
            # constraint expression; .load() issues the single small request.
            da = ds[r2_var]
            if "level" in da.dims:
                da = da.sel(level=level, method="nearest")
            da = da.sel(time=date_str, method="nearest").load()
            ds.close()
            # Mask R2 fill value (-9.96921e36) and upcast to float64
            da = da.where(np.abs(da) < 1e30).astype(np.float64)
            return da
        except OSError as exc:
            if attempt == max_retries - 1:
                raise RuntimeError(
                    f"R2 OPeNDAP failed after {max_retries} attempts: {url} "
                    f"({date_str} @ {level} hPa)\n"
                    f"PSL THREDDS may be down — try again in a few minutes.\n"
                    f"Underlying error: {exc}"
                ) from exc
            wait = 5 * (2 ** attempt)
            log.warning(
                "CLIMO_R2  OPeNDAP error  var=%s year=%d attempt=%d/%d retry in %ds",
                r2_var, year, attempt + 1, max_retries, wait,
            )
            time.sleep(wait)
    raise RuntimeError("unreachable")


def _fetch_scalar_climo(
    r2_var: str, level: int, month: int, day: int, dataset: str = "pressure"
) -> dict[str, xr.DataArray]:
    """
    Fetch one (month, day) from all 30 years concurrently, return (mean, std).
    Equivalent to monthly-pgb's _climatology_stats but for daily R2 data.
    """
    log.info(
        "CLIMO_R2  fetching  var=%s  level=%dhPa  %02d-%02d  (%d years concurrent)",
        r2_var, level, month, day, len(_CLIMO_YEARS),
    )
    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_fetch_one_year, r2_var, year, level, month, day, dataset=dataset): year
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
        np.sqrt(u_by_year[y] ** 2 + v_by_year[y] ** 2)
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
    r2_var: str, level: int, month: int, dataset: str = "pressure"
) -> dict[str, xr.DataArray]:
    """
    Fetch all 30 climo-period values for one calendar month using a single strided
    OPeNDAP isel.  isel(time=slice(t_start, t_end+1, 12)) generates an OPeNDAP
    constraint [t_start:12:t_end] which the server resolves server-side — one round
    trip instead of 30 concurrent year-file opens.  Result size: ~30 × 73 × 144.

    Single-level datasets ("surface", "gaussian_grid") have no level dimension;
    the level argument is ignored for them.
    """
    t_start = _R2M_CLIMO_T0 + (month - 1)
    t_end   = _R2M_CLIMO_T1 + (month - 1)
    url = _monthly_url(r2_var, dataset)
    log.info(
        "CLIMO_R2M  fetching  var=%s  level=%dhPa  month=%02d  "
        "t_slice=[%d:%d:12]  url=%s",
        r2_var, level, month, t_start, t_end + 1, url,
    )
    t0 = time.perf_counter()
    ds = xr.open_dataset(url, engine="netcdf4")
    da_30yr = ds[r2_var]
    if "level" in da_30yr.dims:
        da_30yr = da_30yr.sel(level=level, method="nearest")
    da_30yr = da_30yr.isel(time=slice(t_start, t_end + 1, 12)).load()
    ds.close()
    log.info("CLIMO_R2M  fetched in %.1fs  shape=%s", time.perf_counter() - t0, da_30yr.shape)

    da_30yr = da_30yr.where(np.abs(da_30yr) < 1e30).astype(np.float64)
    mean = da_30yr.mean(dim="time")
    std  = da_30yr.std( dim="time", ddof=1)
    mean = mean.rename({"lat": "latitude", "lon": "longitude"})
    std  = std.rename( {"lat": "latitude", "lon": "longitude"})
    return {"mean": mean, "std": std}


def _fetch_r2m_monthly_wind_speed(level: int, month: int) -> dict[str, xr.DataArray]:
    """
    Fetch U and V monthly means via two strided OPeNDAP requests (one per file),
    compute sqrt(u²+v²) per year-step before averaging — exact mean speed.
    """
    t_start = _R2M_CLIMO_T0 + (month - 1)
    t_end   = _R2M_CLIMO_T1 + (month - 1)
    log.info(
        "CLIMO_R2M  fetching wind speed  level=%dhPa  month=%02d  t_slice=[%d:%d:12]",
        level, month, t_start, t_end + 1,
    )
    t0 = time.perf_counter()
    ds_u = xr.open_dataset(_monthly_url("uwnd", "pressure"), engine="netcdf4")
    ds_v = xr.open_dataset(_monthly_url("vwnd", "pressure"), engine="netcdf4")
    u_30yr = (
        ds_u["uwnd"].sel(level=level, method="nearest")
        .isel(time=slice(t_start, t_end + 1, 12)).load()
    )
    v_30yr = (
        ds_v["vwnd"].sel(level=level, method="nearest")
        .isel(time=slice(t_start, t_end + 1, 12)).load()
    )
    ds_u.close()
    ds_v.close()
    log.info("CLIMO_R2M  fetched in %.1fs", time.perf_counter() - t0)

    u_30yr = u_30yr.where(np.abs(u_30yr) < 1e30).astype(np.float64)
    v_30yr = v_30yr.where(np.abs(v_30yr) < 1e30).astype(np.float64)
    speed_30yr = (u_30yr ** 2 + v_30yr ** 2) ** 0.5
    mean = speed_30yr.mean(dim="time")
    std  = speed_30yr.std( dim="time", ddof=1)
    mean = mean.rename({"lat": "latitude", "lon": "longitude"})
    std  = std.rename( {"lat": "latitude", "lon": "longitude"})
    return {"mean": mean, "std": std}


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
