"""
Climatology from NCEP/DOE Reanalysis 2 (R2), 1991-2020.

Two retrieval strategies:

DAILY (r2-daily): for sub-monthly (6-hourly / daily) anomaly requests.
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

Daily OPeNDAP base:
  https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/Dailies/pressure
Monthly OPeNDAP base:
  https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/pressure

R2 variables:
  air   – temperature (K)
  hgt   – geopotential height (m)
  rhum  – relative humidity (%)
  uwnd  – U-wind component (m/s)
  vwnd  – V-wind component (m/s)

R2 grid: 2.5°×2.5°, 73 lat × 144 lon, 17 levels (1000–10 hPa).
Longitude: 0–357.5°E (0-360, same as CORe). Latitude: 90°N→90°S (descending).
Coordinates renamed lat→latitude, lon→longitude to match CORe DataArrays.

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

_BASE = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/Dailies/pressure"
_R2M_BASE = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/pressure"
_CLIMO_YEARS = list(range(1991, 2021))   # 1991–2020 inclusive, 30 years
_R2M_FIRST_YEAR = 1979

# Strided time indices for the 1991–2020 climo period in the monthly mean files.
# For calendar month M (1-indexed):
#   t_start = (1991-1979)*12 + (M-1) = 144 + (M-1)
#   t_end   = (2020-1979)*12 + (M-1) = 492 + (M-1)
_R2M_CLIMO_T0 = (_CLIMO_YEARS[0]  - _R2M_FIRST_YEAR) * 12   # 144
_R2M_CLIMO_T1 = (_CLIMO_YEARS[-1] - _R2M_FIRST_YEAR) * 12   # 492

# CORe GRIB short name → R2 NetCDF variable name (shared by daily and monthly)
_GRIB_TO_R2: dict[str, str] = {
    "TMP":  "air",
    "HGT":  "hgt",
    "UGRD": "uwnd",
    "VGRD": "vwnd",
}

# Disk cache: backend/climo_cache/ (one level above app/)
_CACHE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "climo_cache"))

# In-process memory cache for daily climatology.
# Key: (r2_var, level, month, day) — DOY-granular.
# Value: dict{'mean': DataArray, 'std': DataArray} or threading.Event while loading.
_cache: dict[tuple, dict | threading.Event] = {}
_cache_lock = threading.Lock()

# In-process memory cache for monthly climatology (separate key space).
# Key: (r2_var, level, month) — calendar-month granular.
_mcache: dict[tuple, dict | threading.Event] = {}
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
        log.info("CLIMO_R2  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2  disk cache corrupt (%s), re-fetching", exc)
        return None


def _save_disk(r2_var: str, level: int, month: int, day: int, result: dict[str, xr.DataArray]) -> None:
    os.makedirs(_CACHE_DIR, exist_ok=True)
    path = _disk_path(r2_var, level, month, day)
    xr.Dataset({"mean": result["mean"], "std": result["std"]}).to_netcdf(path)
    log.info("CLIMO_R2  saved to disk   %s", os.path.basename(path))


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
        log.info("CLIMO_R2M  disk cache hit  %s", os.path.basename(path))
        return result
    except Exception as exc:
        log.warning("CLIMO_R2M  disk cache corrupt (%s), re-fetching", exc)
        return None


def _save_disk_monthly(r2_var: str, level: int, month: int, result: dict[str, xr.DataArray]) -> None:
    os.makedirs(_CACHE_DIR, exist_ok=True)
    path = _disk_path_monthly(r2_var, level, month)
    xr.Dataset({"mean": result["mean"], "std": result["std"]}).to_netcdf(path)
    log.info("CLIMO_R2M  saved to disk   %s", os.path.basename(path))


# ── Surgical OPeNDAP fetch ───────────────────────────────────────────────────

def _fetch_one_year(
    r2_var: str,
    year: int,
    level: int,
    month: int,
    day: int,
    max_retries: int = 4,
) -> xr.DataArray:
    """
    Fetch a single (year, month, day) slice at one pressure level via OPeNDAP.

    xarray + netCDF4 sends a constraint expression to the server so only the
    requested time index and level index are transferred (~42 KB per call).
    Fill values are masked and the array is cast to float64 to prevent
    overflow in subsequent std computation.
    """
    url = f"{_BASE}/{r2_var}.{year}.nc"
    date_str = f"{year}-{month:02d}-{day:02d}"

    for attempt in range(max_retries):
        try:
            ds = xr.open_dataset(url, engine="netcdf4")
            # .sel() with a date string + level value constructs an OPeNDAP
            # constraint expression; .load() issues the single small request.
            da = ds[r2_var].sel(level=level, method="nearest").sel(
                time=date_str, method="nearest"
            ).load()
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
    r2_var: str, level: int, month: int, day: int
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
            pool.submit(_fetch_one_year, r2_var, year, level, month, day): year
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
    r2_var: str, level: int, month: int
) -> dict[str, xr.DataArray]:
    """
    Fetch all 30 climo-period values for one calendar month using a single strided
    OPeNDAP isel.  isel(time=slice(t_start, t_end+1, 12)) generates an OPeNDAP
    constraint [t_start:12:t_end] which the server resolves server-side — one round
    trip instead of 30 concurrent year-file opens.  Result size: ~30 × 73 × 144.
    """
    t_start = _R2M_CLIMO_T0 + (month - 1)
    t_end   = _R2M_CLIMO_T1 + (month - 1)
    url = f"{_R2M_BASE}/{r2_var}.mon.mean.nc"
    log.info(
        "CLIMO_R2M  fetching  var=%s  level=%dhPa  month=%02d  "
        "t_slice=[%d:%d:12]  url=%s",
        r2_var, level, month, t_start, t_end + 1, url,
    )
    t0 = time.perf_counter()
    ds = xr.open_dataset(url, engine="netcdf4")
    da_30yr = (
        ds[r2_var]
        .sel(level=level, method="nearest")
        .isel(time=slice(t_start, t_end + 1, 12))
        .load()
    )
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
    ds_u = xr.open_dataset(f"{_R2M_BASE}/uwnd.mon.mean.nc", engine="netcdf4")
    ds_v = xr.open_dataset(f"{_R2M_BASE}/vwnd.mon.mean.nc", engine="netcdf4")
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


def _load_monthly(
    r2_var: str,
    level: int,
    month: int,
    fetch_fn,
) -> dict[str, xr.DataArray]:
    """Cache-aware loader for monthly climatology (same pattern as _load for daily)."""
    cache_key = (r2_var, level, month)

    with _mcache_lock:
        entry = _mcache.get(cache_key)
        if isinstance(entry, dict):
            return entry
        if isinstance(entry, threading.Event):
            event_to_wait = entry
        else:
            event_to_wait = None
            ready = threading.Event()
            _mcache[cache_key] = ready

    if event_to_wait is not None:
        log.info("CLIMO_R2M  waiting for in-flight fetch  key=%s", cache_key)
        event_to_wait.wait()
        with _mcache_lock:
            return _mcache[cache_key]

    try:
        result = _load_disk_monthly(r2_var, level, month)
        if result is None:
            result = fetch_fn()
            _save_disk_monthly(r2_var, level, month, result)

        with _mcache_lock:
            _mcache[cache_key] = result
            ready.set()
        return result

    except Exception:
        with _mcache_lock:
            if _mcache.get(cache_key) is ready:
                del _mcache[cache_key]
        ready.set()
        raise


# ── Cache-aware loader ────────────────────────────────────────────────────────

def _load(
    r2_var: str,
    level: int,
    month: int,
    day: int,
    fetch_fn,        # callable() → dict[str, DataArray]
) -> dict[str, xr.DataArray]:
    """
    Return (mean, std) for the requested key, checking caches in order:
      1. In-process memory
      2. Disk
      3. OPeNDAP (concurrent fetch)

    Thread-safe: a threading.Event sentinel blocks concurrent duplicate fetches.
    """
    cache_key = (r2_var, level, month, day)

    with _cache_lock:
        entry = _cache.get(cache_key)
        if isinstance(entry, dict):
            return entry
        if isinstance(entry, threading.Event):
            event_to_wait = entry
        else:
            event_to_wait = None
            ready = threading.Event()
            _cache[cache_key] = ready

    if event_to_wait is not None:
        log.info("CLIMO_R2  waiting for in-flight fetch  key=%s", cache_key)
        event_to_wait.wait()
        with _cache_lock:
            return _cache[cache_key]

    try:
        result = _load_disk(r2_var, level, month, day)
        if result is None:
            result = fetch_fn()
            _save_disk(r2_var, level, month, day, result)

        with _cache_lock:
            _cache[cache_key] = result
            ready.set()
        return result

    except Exception:
        with _cache_lock:
            if _cache.get(cache_key) is ready:
                del _cache[cache_key]
        ready.set()
        raise


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
    r2_var = _GRIB_TO_R2.get(grib_name)
    if r2_var is None:
        raise ValueError(
            f"No R2 mapping for GRIB name '{grib_name}'. Supported: {list(_GRIB_TO_R2)}"
        )
    result = _load(
        r2_var, level, month, day,
        fetch_fn=lambda: _fetch_scalar_climo(r2_var, level, month, day),
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
    r2_var = _GRIB_TO_R2.get(grib_name)
    if r2_var is None:
        raise ValueError(
            f"No R2 monthly mapping for GRIB name '{grib_name}'. Supported: {list(_GRIB_TO_R2)}"
        )
    result = _load_monthly(
        r2_var, level, month,
        fetch_fn=lambda: _fetch_r2m_monthly_scalar(r2_var, level, month),
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
