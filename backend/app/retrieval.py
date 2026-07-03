import calendar as _cal
import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache

import numpy as np
import requests
import xarray as xr

log = logging.getLogger("pyre.retrieval")

# ── Monthly obs disk cache ────────────────────────────────────────────────────
# Stores the decoded DataArray for each (grib_name, level, YYYYMM) slice.
# Written as NetCDF via atomic rename — safe for concurrent requests.
# Key: UGRD_500mb_202601.nc  (~42 KB for a 2.5° pgb record)

_OBS_MONTHLY_CACHE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "obs_cache", "monthly")
)


def _obs_monthly_path(grib_name: str, level: int, year: int, month: int) -> str:
    return os.path.join(_OBS_MONTHLY_CACHE_DIR, f"{grib_name}_{level}mb_{year}{month:02d}.nc")


def _load_obs_monthly(path: str) -> xr.DataArray | None:
    if not os.path.exists(path):
        return None
    try:
        ds = xr.open_dataset(path)
        da = ds["obs"].load()
        ds.close()
        log.debug("OBS_CACHE  hit  %s", os.path.basename(path))
        return da
    except Exception as exc:
        log.warning("OBS_CACHE  corrupt (%s), re-fetching", exc)
        return None


def _save_obs_monthly(da: xr.DataArray, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    da.to_dataset(name="obs").to_netcdf(tmp)
    os.replace(tmp, path)   # atomic on POSIX — safe against concurrent writers
    log.debug("OBS_CACHE  saved  %s", os.path.basename(path))

# GCS is the primary archive: 1950 → near real-time, 3-hourly, simpler URL.
# NOMADS keeps only the last 7 days and uses a more complex batch-dir structure.
GCS_BASE = "https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/pgb"
GCS_FLX_BASE = "https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/flx"
NOMADS_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod"

# CORe valid hours (3-hourly)
VALID_HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"]

# NOMADS only: maps valid hour → batch directory hour.
# 00z rolls back to the previous day's 18z batch.
_VALID_HOUR_TO_BATCH = {
    "03": "00", "06": "00",
    "09": "06", "12": "06",
    "15": "12", "18": "12",
    "21": "18", "00": "18",
}


def _gcs_url(valid_date: str, valid_hour: str) -> str:
    """GCS URL for any date from 1950 to near real-time."""
    yyyy = valid_date[:4]
    mm = valid_date[4:6]
    return f"{GCS_BASE}/{yyyy}/{mm}/pgb.{valid_date}{valid_hour}.grb"


def _gcs_index_url(valid_date: str, valid_hour: str) -> str:
    """GCS index URL — separate file, NOT .grb.idx."""
    yyyy = valid_date[:4]
    mm = valid_date[4:6]
    return f"{GCS_BASE}/{yyyy}/{mm}/pgb.{valid_date}{valid_hour}.idx"


def _gcs_flx_url(valid_date: str, valid_hour: str) -> str:
    yyyy = valid_date[:4]
    mm = valid_date[4:6]
    return f"{GCS_FLX_BASE}/{yyyy}/{mm}/flx.{valid_date}{valid_hour}.grb"


def _gcs_flx_index_url(valid_date: str, valid_hour: str) -> str:
    yyyy = valid_date[:4]
    mm = valid_date[4:6]
    return f"{GCS_FLX_BASE}/{yyyy}/{mm}/flx.{valid_date}{valid_hour}.idx"


def _nomads_url(valid_date: str, valid_hour: str) -> str:
    """NOMADS URL — last 7 days only. Requires batch-dir calculation."""
    batch_hour = _VALID_HOUR_TO_BATCH[valid_hour]
    if valid_hour == "00":
        batch_date = (datetime.strptime(valid_date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
    else:
        batch_date = valid_date
    return f"{NOMADS_BASE}/core.{batch_date}/{batch_hour}/post/spost/core.t{valid_hour}z.spgb.ensmean.anl.grib2"


def _nomads_flx_url(valid_date: str, valid_hour: str) -> str:
    """NOMADS URL for CORe flx ensemble-mean fields."""
    batch_hour = _VALID_HOUR_TO_BATCH[valid_hour]
    if valid_hour == "00":
        batch_date = (datetime.strptime(valid_date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
    else:
        batch_date = valid_date
    return f"{NOMADS_BASE}/core.{batch_date}/{batch_hour}/post/flx/core.t{valid_hour}z.flx.ensmean.grib2"


def _nomads_flx_index_url(valid_date: str, valid_hour: str) -> str:
    return _nomads_flx_url(valid_date, valid_hour) + ".idx"


def _grib_url(valid_date: str, valid_hour: str) -> str:
    """
    Route to GCS (primary, full history) or NOMADS (fallback for latest hours
    not yet on GCS). Currently defaults to GCS for all dates.
    """
    return _gcs_url(valid_date, valid_hour)


@dataclass
class IndexRecord:
    record_num: int
    byte_start: int
    variable: str
    level: str  # e.g. "850 mb", "surface"


def parse_index_text(text: str) -> list[IndexRecord]:
    """Parse raw .idx file text into IndexRecords. Handles both GCS and NOMADS formats."""
    records = []
    for line in text.strip().splitlines():
        parts = line.split(":")
        if len(parts) < 5:
            continue
        try:
            records.append(IndexRecord(
                record_num=int(parts[0]),
                byte_start=int(parts[1]),
                variable=parts[3],
                level=parts[4],
            ))
        except (ValueError, IndexError):
            continue
    return records


def fetch_index(date: str, hour: str) -> list[IndexRecord]:
    """Fetch and parse the .idx file for a given valid date (YYYYMMDD) and valid hour (HH)."""
    url = _gcs_index_url(date, hour)
    log.debug("IDX      GET %s", url)
    t0 = time.perf_counter()
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    records = parse_index_text(r.text)
    log.debug("IDX      parsed %d records  %.2fs", len(records), time.perf_counter() - t0)
    return records


def fetch_flx_index(date: str, hour: str) -> list[IndexRecord]:
    """Fetch and parse the CORe flx .idx file from GCS, with NOMADS fallback for latest data."""
    records, _ = _fetch_flx_index_and_url(date, hour)
    return records


def _fetch_flx_index_and_url(date: str, hour: str) -> tuple[list[IndexRecord], str]:
    gcs_idx_url = _gcs_flx_index_url(date, hour)
    log.debug("FLX_IDX  GET %s", gcs_idx_url)
    t0 = time.perf_counter()
    try:
        r = requests.get(gcs_idx_url, timeout=15)
        r.raise_for_status()
        grib_url = _gcs_flx_url(date, hour)
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 404:
            raise
        nomads_idx_url = _nomads_flx_index_url(date, hour)
        log.debug("FLX_IDX  GCS missing → GET %s", nomads_idx_url)
        r = requests.get(nomads_idx_url, timeout=15)
        r.raise_for_status()
        grib_url = _nomads_flx_url(date, hour)
    records = parse_index_text(r.text)
    log.debug("FLX_IDX  parsed %d records  %.2fs", len(records), time.perf_counter() - t0)
    return records, grib_url


def _fetch_record_by_level(grib_url: str, records: list[IndexRecord], variable: str, level_name: str) -> xr.DataArray:
    """
    Issue an HTTP Range request for one GRIB2 record and return it as a
    loaded DataArray. Uses a temp file because cfgrib requires a file path;
    the file is deleted before returning.
    """
    match_idx = next(
        (i for i, r in enumerate(records) if r.variable == variable and r.level == level_name),
        None
    )
    if match_idx is None:
        raise ValueError(f"{variable} at {level_name} not found in index")

    rec = records[match_idx]
    if match_idx + 1 < len(records):
        byte_end = records[match_idx + 1].byte_start - 1
        range_header = f"bytes={rec.byte_start}-{byte_end}"
        nbytes = byte_end - rec.byte_start + 1
    else:
        range_header = f"bytes={rec.byte_start}-"
        nbytes = -1

    log.debug("GRIB     GET %s  %s@%s  %s  (~%s)",
              grib_url, variable, level_name, range_header,
              f"{nbytes//1024}KB" if nbytes > 0 else "?KB")
    t0 = time.perf_counter()
    r = requests.get(grib_url, headers={"Range": range_header}, timeout=30)
    if r.status_code not in (200, 206):
        r.raise_for_status()
    log.debug("GRIB     received %dKB  %.2fs", len(r.content) // 1024, time.perf_counter() - t0)

    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(r.content)
        tmp_path = tmp.name

    try:
        ds = xr.open_dataset(tmp_path, engine="cfgrib", backend_kwargs={"indexpath": ""})
        da = ds[list(ds.data_vars)[0]].load()
        da.attrs["_pyre_grib_variable"] = variable
        da.attrs["_pyre_grib_level"] = rec.level
        ds.close()
    finally:
        os.unlink(tmp_path)

    return da


def _fetch_record(grib_url: str, records: list[IndexRecord], variable: str, level: int) -> xr.DataArray:
    return _fetch_record_by_level(grib_url, records, variable, f"{level} mb")


def fetch_flx_field(date: str, hour: str, variable: str, level_name: str) -> xr.DataArray:
    """Surgically fetch a single CORe flx field by GRIB variable and level string."""
    records, grib_url = _fetch_flx_index_and_url(date, hour)
    da = _fetch_record_by_level(grib_url, records, variable, level_name)
    da.attrs["_pyre_obs_source"] = "CORe-flx-gcs" if grib_url.startswith(GCS_FLX_BASE) else "CORe-flx-nomads"
    return da


def fetch_flx_wind_components(date: str, hour: str) -> tuple[xr.DataArray, xr.DataArray]:
    """Fetch 10m UGRD and VGRD from the CORe flx stream with one shared index fetch."""
    records, grib_url = _fetch_flx_index_and_url(date, hour)
    u = _fetch_record_by_level(grib_url, records, "UGRD", "10 m above ground")
    v = _fetch_record_by_level(grib_url, records, "VGRD", "10 m above ground")
    source = "CORe-flx-gcs" if grib_url.startswith(GCS_FLX_BASE) else "CORe-flx-nomads"
    u.attrs["_pyre_obs_source"] = source
    v.attrs["_pyre_obs_source"] = source
    return u, v


def fetch_field(date: str, hour: str, variable: str, level: int) -> xr.DataArray:
    """Surgically fetch a single variable/level field."""
    records = fetch_index(date, hour)
    return _fetch_record(_grib_url(date, hour), records, variable, level)


def fetch_field_by_level_name(date: str, hour: str, variable: str, level_name: str) -> xr.DataArray:
    """Surgically fetch a single pgb field by exact GRIB index level string."""
    records = fetch_index(date, hour)
    return _fetch_record_by_level(_grib_url(date, hour), records, variable, level_name)


def fetch_wind_components(date: str, hour: str, level: int) -> tuple[xr.DataArray, xr.DataArray]:
    """Fetch UGRD and VGRD with one shared index fetch. Returns (u, v) in m/s."""
    records = fetch_index(date, hour)
    grib_url = _grib_url(date, hour)
    u = _fetch_record(grib_url, records, "UGRD", level)
    v = _fetch_record(grib_url, records, "VGRD", level)
    return u, v


def fetch_relative_humidity(date: str, hour: str, level: int) -> xr.DataArray:
    """
    Compute relative humidity (%) from SPFH and TMP with one shared index fetch.
    Uses Bolton (1980) for saturation vapour pressure. Result clipped to 0–100 %.
    """
    records = fetch_index(date, hour)
    grib_url = _grib_url(date, hour)

    q = _fetch_record(grib_url, records, "SPFH", level)  # kg/kg
    t = _fetch_record(grib_url, records, "TMP",  level)  # K

    tc  = t - 273.15                                          # → °C
    e_s = 6.112 * np.exp(17.67 * tc / (tc + 243.5))          # saturation vapour pressure (hPa)
    e   = q * float(level) / (0.622 + 0.378 * q)             # actual vapour pressure (hPa)
    rh  = (e / e_s * 100).clip(0, 100)

    rh.attrs.update({"units": "%", "long_name": "Relative Humidity"})
    if "valid_time" in q.coords:
        rh = rh.assign_coords(valid_time=q.coords["valid_time"])
    return rh


def fetch_wind_speed(date: str, hour: str, level: int) -> xr.DataArray:
    """
    Fetch UGRD and VGRD with one shared index fetch.
    Returns wind speed magnitude (m/s) as a DataArray.
    """
    records = fetch_index(date, hour)
    grib_url = _grib_url(date, hour)

    u = _fetch_record(grib_url, records, "UGRD", level)
    v = _fetch_record(grib_url, records, "VGRD", level)

    speed = (u ** 2 + v ** 2) ** 0.5
    speed.attrs.update({"units": "m/s", "long_name": "Wind Speed"})
    # valid_time is a scalar coordinate; preserve it explicitly after arithmetic
    if "valid_time" in u.coords:
        speed = speed.assign_coords(valid_time=u.coords["valid_time"])

    return speed


# ---------------------------------------------------------------------------
# Composite (multi-date mean) helpers
# ---------------------------------------------------------------------------

def _mean_of(fetch_fn, dates: list[str], hour: str, *args) -> xr.DataArray:
    """
    Fetch the same field for multiple dates concurrently, return the mean.
    valid_time differs per date so it is dropped before stacking.
    """
    log.debug("COMPOSITE  %d dates  hour=%sz  (concurrent)", len(dates), hour)
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=min(len(dates), 8)) as pool:
        futures = {pool.submit(fetch_fn, d, hour, *args): d for d in dates}
        arrays = [fut.result() for fut in as_completed(futures)]
    log.debug("COMPOSITE  done  %.1fs", time.perf_counter() - t0)

    cleaned = [da.drop_vars("valid_time", errors="ignore") for da in arrays]
    stacked = xr.concat(cleaned, dim="composite_date")
    mean = stacked.mean(dim="composite_date")
    mean.attrs = cleaned[0].attrs
    return mean


def _mean_of_pairs(fetch_fn, date_hour_pairs: list[tuple[str, str]], *args) -> xr.DataArray:
    """
    Fetch a field for multiple (date, hour) pairs concurrently and return the mean.
    Used for daily composites that average several synoptic times.
    """
    log.debug("COMPOSITE  %d (date×hour) pairs  (concurrent)", len(date_hour_pairs))
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = {pool.submit(fetch_fn, d, h, *args): (d, h) for d, h in date_hour_pairs}
        arrays = [fut.result() for fut in as_completed(futures)]
    log.debug("COMPOSITE  done  %.1fs", time.perf_counter() - t0)
    cleaned = [da.drop_vars("valid_time", errors="ignore") for da in arrays]
    stacked = xr.concat(cleaned, dim="composite_step")
    mean = stacked.mean(dim="composite_step")
    mean.attrs = cleaned[0].attrs
    return mean


def fetch_field_daily_composite(dates: list[str], hours: list[str], variable: str, level: int) -> xr.DataArray:
    """Fetch a field across all (date × hour) combinations — daily composite."""
    return _mean_of_pairs(fetch_field, [(d, h) for d in dates for h in hours], variable, level)


def fetch_named_level_field_daily_composite(dates: list[str], hours: list[str], variable: str, level_name: str) -> xr.DataArray:
    """Fetch a named-level field across all (date × hour) combinations — daily composite."""
    return _mean_of_pairs(fetch_field_by_level_name, [(d, h) for d in dates for h in hours], variable, level_name)


def fetch_wind_speed_daily_composite(dates: list[str], hours: list[str], level: int) -> xr.DataArray:
    return _mean_of_pairs(fetch_wind_speed, [(d, h) for d in dates for h in hours], level)


def fetch_wind_components_daily_composite(dates: list[str], hours: list[str], level: int) -> tuple[xr.DataArray, xr.DataArray]:
    pairs = [(d, h) for d in dates for h in hours]
    u_mean = _mean_of_pairs(lambda d, h, lv: fetch_wind_components(d, h, lv)[0], pairs, level)
    v_mean = _mean_of_pairs(lambda d, h, lv: fetch_wind_components(d, h, lv)[1], pairs, level)
    return u_mean, v_mean


def fetch_relative_humidity_daily_composite(dates: list[str], hours: list[str], level: int) -> xr.DataArray:
    return _mean_of_pairs(fetch_relative_humidity, [(d, h) for d in dates for h in hours], level)


def fetch_field_composite(dates: list[str], hour: str, variable: str, level: int) -> xr.DataArray:
    return _mean_of(fetch_field, dates, hour, variable, level)


def fetch_named_level_field_composite(dates: list[str], hour: str, variable: str, level_name: str) -> xr.DataArray:
    return _mean_of(fetch_field_by_level_name, dates, hour, variable, level_name)


def fetch_wind_speed_composite(dates: list[str], hour: str, level: int) -> xr.DataArray:
    return _mean_of(fetch_wind_speed, dates, hour, level)


def fetch_wind_components_composite(dates: list[str], hour: str, level: int) -> tuple[xr.DataArray, xr.DataArray]:
    """Return mean U and mean V (vector mean wind — correct for compositing)."""
    u_mean = _mean_of(lambda d, h, lv: fetch_wind_components(d, h, lv)[0], dates, hour, level)
    v_mean = _mean_of(lambda d, h, lv: fetch_wind_components(d, h, lv)[1], dates, hour, level)
    return u_mean, v_mean


def fetch_relative_humidity_composite(dates: list[str], hour: str, level: int) -> xr.DataArray:
    return _mean_of(fetch_relative_humidity, dates, hour, level)


# ---------------------------------------------------------------------------
# Monthly obs — pgb pressure-level mean files (CORe, probed dynamically)
# ---------------------------------------------------------------------------

CLIMO_PGB_BASE    = "https://ftp.cpc.ncep.noaa.gov/CORe/CDAS_clone_temporary/month/pgb"
CLIMO_START_YEAR  = 1991
CLIMO_END_YEAR    = 2020

# Track months confirmed absent from the pgb archive (within this process lifetime).
# A HEAD 404 writes here so we don't re-probe; a successful fetch never writes here.
# Thread-safe: set.add() is atomic in CPython; no lock needed for reads.
_pgb_known_missing: set[tuple[int, int]] = set()

# ---------------------------------------------------------------------------
# Monthly obs — NCEP/DOE Reanalysis 2 via PSL THREDDS OPeNDAP (1979–2021)
# Covers the WMO 1981–2020 standard normal period in full.
# Same OPeNDAP surgical-fetch pattern as climo_r2.py: only the requested
# level and month are transferred per call (~42 KB per record).
# ---------------------------------------------------------------------------

R2_MONTHLY_BASE  = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/pressure"
R2_MONTHLY_START: tuple[int, int] = (1979, 1)
R2_MONTHLY_END:   tuple[int, int] = (2021, 12)   # conservative; falls back gracefully on OSError

# GRIB short name → R2 NetCDF variable name (monthly means files)
_GRIB_TO_R2M: dict[str, str] = {
    "TMP": "air",
    "HGT": "hgt",
    "UGRD": "uwnd",
    "VGRD": "vwnd",
    "RH":  "rhum",   # monthly pgb calls it "RH"; R2 file is rhum.mon.mean.nc
}


def _r2m_obs_path(grib_name: str, level: int, year: int, month: int) -> str:
    """Separate cache namespace so R2M and pgb slices don't collide."""
    return os.path.join(_OBS_MONTHLY_CACHE_DIR, f"r2m_{grib_name}_{level}mb_{year}{month:02d}.nc")


def _fetch_r2m_field(year: int, month: int, grib_name: str, level: int) -> xr.DataArray:
    """
    Fetch one variable/level/month from R2 monthly means via PSL OPeNDAP.

    OPeNDAP constraint expression requests only the single time slice and level
    (~42 KB) rather than the full multi-decade file.  Raises OSError/RuntimeError
    when PSL THREDDS is unreachable or the date is past the R2 archive.
    """
    r2_var = _GRIB_TO_R2M.get(grib_name)
    if r2_var is None:
        raise ValueError(f"No R2 monthly mapping for GRIB name {grib_name!r}")

    path = _r2m_obs_path(grib_name, level, year, month)
    cached = _load_obs_monthly(path)
    if cached is not None:
        return cached

    url = f"{R2_MONTHLY_BASE}/{r2_var}.mon.mean.nc"
    date_str = f"{year}-{month:02d}-01"
    log.debug("R2M      GET %s  %s@%dhPa  %d-%02d", url, r2_var, level, year, month)
    t0 = time.perf_counter()
    ds = xr.open_dataset(url, engine="netcdf4")
    da = ds[r2_var].sel(level=level, method="nearest").sel(
        time=date_str, method="nearest"
    ).load()
    ds.close()
    da = da.where(np.abs(da) < 1e30)
    da = da.rename({"lat": "latitude", "lon": "longitude"})
    log.debug("R2M      fetched %.0fKB in %.2fs", da.nbytes / 1024, time.perf_counter() - t0)

    da.attrs["_pyre_obs_source"] = "R2-monthly"
    _save_obs_monthly(da, path)
    return da


def _pgb_monthly_url(year: int, month: int) -> str:
    return f"{CLIMO_PGB_BASE}/pgb.f00{year:04d}{month:02d}"


def _pgb_monthly_index_url(year: int, month: int) -> str:
    return f"{CLIMO_PGB_BASE}/pgb.f00{year:04d}{month:02d}.idx"


def _fetch_monthly_index(year: int, month: int) -> list[IndexRecord]:
    url = _pgb_monthly_index_url(year, month)
    log.debug("IDX      GET %s", url)
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return parse_index_text(r.text)


def _fetch_monthly_index_if_present(year: int, month: int) -> list[IndexRecord] | None:
    """
    Optimistically probe the CORe monthly pgb archive.

    Newer months may not have precomputed monthly means yet. Treat a missing or
    empty index as "try the next tier" so those requests can still be composed
    from the 3-hourly archive without hardcoding an archive end date.
    """
    if (year, month) in _pgb_known_missing:
        return None

    try:
        records = _fetch_monthly_index(year, month)
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            log.info("OBS      CORe-pgb: %s %d not in archive → next tier", _cal.month_abbr[month], year)
            _pgb_known_missing.add((year, month))
            return None
        raise

    if not records:
        log.info("OBS      CORe-pgb: %s %d index empty/unreadable → next tier", _cal.month_abbr[month], year)
        _pgb_known_missing.add((year, month))
        return None

    return records


def _fetch_monthly_pgb_record(
    year: int,
    month: int,
    records: list[IndexRecord],
    grib_name: str,
    level: int,
) -> xr.DataArray | None:
    """
    Fetch a field from an already-probed monthly pgb index.

    Some monthly pgb files can exist without every derived field we support.
    Missing records are a normal fallback case; other ValueErrors still bubble up.
    """
    try:
        return _fetch_record(_pgb_monthly_url(year, month), records, grib_name, level)
    except ValueError as exc:
        if "not found in index" in str(exc):
            log.info(
                "OBS      CORe-pgb: %s@%dhPa missing for %s %d → next tier",
                grib_name, level, _cal.month_abbr[month], year,
            )
            return None
        raise


def _compute_monthly_from_6hourly(
    year: int, month: int, fetch_6h_fn, *args
) -> xr.DataArray:
    """
    Compute a monthly mean by averaging all 3-hourly time steps in the month.
    Used when the month is outside the pre-computed archive or when the pgb
    archive does not contain the requested field (e.g. SPFH at pressure levels).
    Concurrency is capped at 8 to avoid hammering the GCS endpoint.
    """
    days = range(1, _cal.monthrange(year, month)[1] + 1)
    specs = [(f"{year}{month:02d}{d:02d}", h)
             for d in days for h in VALID_HOURS]
    log.info("6HOURLY  %s %d  computing monthly mean from %d 3-hourly steps  (concurrent)",
             _cal.month_abbr[month], year, len(specs))
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_6h_fn, date, hour, *args): (date, hour)
                   for date, hour in specs}
        arrays = [f.result().drop_vars("valid_time", errors="ignore")
                  for f in as_completed(futures)]
    log.info("6HOURLY  done  %.1fs", time.perf_counter() - t0)
    stacked = xr.concat(arrays, dim="composite_step")
    mean    = stacked.mean(dim="composite_step")
    mean.attrs = arrays[0].attrs
    return mean


def fetch_monthly_field(year: int, month: int, grib_name: str, level: int) -> xr.DataArray:
    """
    Monthly mean with three-tier source hierarchy (all tiers disk-cached):
      1. CORe pgb archive  — surgical byte-range, 1950–present (probed dynamically)
      2. R2 monthly OPeNDAP — surgical constraint, 1979–Dec 2021
      3. CORe 3-hourly aggregate — all steps in month (slow first call, cached after)
    The '_pyre_obs_source' attr records which tier was used.
    Tier 1 is probed with an actual HTTP request rather than a hardcoded end-date
    so the archive can grow without code changes.
    """
    path = _obs_monthly_path(grib_name, level, year, month)
    cached = _load_obs_monthly(path)
    if cached is not None:
        return cached

    # R2M cache check (separate namespace)
    if R2_MONTHLY_START <= (year, month) <= R2_MONTHLY_END and grib_name in _GRIB_TO_R2M:
        r2m_cached = _load_obs_monthly(_r2m_obs_path(grib_name, level, year, month))
        if r2m_cached is not None:
            return r2m_cached

    # Tier 1: CORe pgb — try optimistically; fall through when not published yet.
    records = _fetch_monthly_index_if_present(year, month)
    if records is not None:
        log.info("OBS      %s %d  %s@%dhPa  → CORe-pgb", _cal.month_abbr[month], year, grib_name, level)
        da = _fetch_monthly_pgb_record(year, month, records, grib_name, level)
        if da is not None:
            da.attrs["_pyre_obs_source"] = "CORe-pgb"
            _save_obs_monthly(da, path)
            return da

    # Tier 2: R2 monthly OPeNDAP
    if R2_MONTHLY_START <= (year, month) <= R2_MONTHLY_END and grib_name in _GRIB_TO_R2M:
        log.info("OBS      %s %d  %s@%dhPa  → R2-monthly", _cal.month_abbr[month], year, grib_name, level)
        try:
            da = _fetch_r2m_field(year, month, grib_name, level)
            return da
        except Exception as exc:
            log.warning("OBS      R2-monthly failed (%s) → CORe-3hrly fallback", exc)

    # Tier 3: CORe 3-hourly aggregate
    log.info("OBS      %s %d  %s@%dhPa  → CORe-3hrly", _cal.month_abbr[month], year, grib_name, level)
    da = _compute_monthly_from_6hourly(year, month, fetch_field, grib_name, level)
    da.attrs["_pyre_obs_source"] = "CORe-3hrly"
    _save_obs_monthly(da, path)
    return da


def fetch_monthly_wind_speed(year: int, month: int, level: int) -> xr.DataArray:
    """Derived from cached U and V; inherits obs_source from U component."""
    u, v = fetch_monthly_wind_components(year, month, level)
    speed = (u ** 2 + v ** 2) ** 0.5
    speed.attrs.update({"units": "m/s", "long_name": "Wind Speed"})
    speed.attrs["_pyre_obs_source"] = u.attrs.get("_pyre_obs_source", "CORe-pgb")
    return speed


def fetch_monthly_relative_humidity(year: int, month: int, level: int) -> xr.DataArray:
    """
    Monthly RH with the same three-tier hierarchy.
    pgb and R2 both carry RH pre-computed; 3-hourly fallback uses Bolton formula.
    """
    path = _obs_monthly_path("RH", level, year, month)
    cached = _load_obs_monthly(path)
    if cached is not None:
        return cached

    if R2_MONTHLY_START <= (year, month) <= R2_MONTHLY_END:
        r2m_cached = _load_obs_monthly(_r2m_obs_path("RH", level, year, month))
        if r2m_cached is not None:
            return r2m_cached

    records = _fetch_monthly_index_if_present(year, month)
    if records is not None:
        log.info("OBS      %s %d  RH@%dhPa  → CORe-pgb", _cal.month_abbr[month], year, level)
        rh = _fetch_monthly_pgb_record(year, month, records, "RH", level)
        if rh is not None:
            rh.attrs.update({"units": "%", "long_name": "Relative Humidity", "_pyre_obs_source": "CORe-pgb"})
            _save_obs_monthly(rh, path)
            return rh

    if R2_MONTHLY_START <= (year, month) <= R2_MONTHLY_END:
        log.info("OBS      %s %d  RH@%dhPa  → R2-monthly", _cal.month_abbr[month], year, level)
        try:
            rh = _fetch_r2m_field(year, month, "RH", level)
            rh.attrs.update({"units": "%", "long_name": "Relative Humidity"})
            return rh
        except Exception as exc:
            log.warning("OBS      R2-monthly RH failed (%s) → CORe-3hrly fallback", exc)

    log.info("OBS      %s %d  RH@%dhPa  → CORe-3hrly", _cal.month_abbr[month], year, level)
    rh = _compute_monthly_from_6hourly(year, month, fetch_relative_humidity, level)
    rh.attrs["_pyre_obs_source"] = "CORe-3hrly"
    _save_obs_monthly(rh, path)
    return rh


def _mean_of_monthly(
    fetch_fn,
    year_months: list[tuple[int, int]],
    *args,
) -> xr.DataArray:
    """
    Fetch monthly mean files for a list of (year, month) pairs concurrently.
    Returns a day-weighted mean: each month's contribution is proportional to
    its number of days, so a 3-month range is not simply (Jan+Feb+Mar)/3.
    """
    labels = ", ".join(f"{_cal.month_abbr[m]} {y}" for y, m in year_months)
    log.info("MONTHLY  fetching %d month(s): %s  (concurrent)", len(year_months), labels)
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=min(len(year_months), 8)) as pool:
        futures = [pool.submit(fetch_fn, y, m, *args) for y, m in year_months]
        arrays  = [f.result().drop_vars("valid_time", errors="ignore") for f in futures]
    log.info("MONTHLY  done  %.1fs", time.perf_counter() - t0)

    if len(arrays) == 1:
        return arrays[0]

    day_counts = [_cal.monthrange(y, m)[1] for y, m in year_months]
    total_days = sum(day_counts)
    weighted   = sum(w * da for w, da in zip(day_counts, arrays))
    mean       = weighted / total_days
    mean.attrs = arrays[0].attrs
    return mean


def fetch_monthly_field_composite(
    year_months: list[tuple[int, int]], grib_name: str, level: int
) -> xr.DataArray:
    return _mean_of_monthly(fetch_monthly_field, year_months, grib_name, level)


def fetch_monthly_wind_speed_composite(
    year_months: list[tuple[int, int]], level: int
) -> xr.DataArray:
    return _mean_of_monthly(fetch_monthly_wind_speed, year_months, level)


def fetch_monthly_relative_humidity_composite(
    year_months: list[tuple[int, int]], level: int
) -> xr.DataArray:
    return _mean_of_monthly(fetch_monthly_relative_humidity, year_months, level)


def fetch_monthly_wind_components(year: int, month: int, level: int) -> tuple[xr.DataArray, xr.DataArray]:
    """
    Monthly mean U and V with the same three-tier hierarchy as fetch_monthly_field.
    U and V share one index fetch when either is missing from cache.
    Both are cached separately so the wind overlay hits the cache on the second request.
    """
    u_path = _obs_monthly_path("UGRD", level, year, month)
    v_path = _obs_monthly_path("VGRD", level, year, month)
    u = _load_obs_monthly(u_path)
    v = _load_obs_monthly(v_path)

    # Check R2M cache (separate namespace from pgb)
    in_r2m_range = R2_MONTHLY_START <= (year, month) <= R2_MONTHLY_END
    if u is None and in_r2m_range:
        u = _load_obs_monthly(_r2m_obs_path("UGRD", level, year, month))
    if v is None and in_r2m_range:
        v = _load_obs_monthly(_r2m_obs_path("VGRD", level, year, month))

    if u is not None and v is not None:
        return u, v

    records = _fetch_monthly_index_if_present(year, month)
    if records is not None:
        if u is None:
            u = _fetch_monthly_pgb_record(year, month, records, "UGRD", level)
            if u is not None:
                u.attrs["_pyre_obs_source"] = "CORe-pgb"
                _save_obs_monthly(u, u_path)
        if v is None:
            v = _fetch_monthly_pgb_record(year, month, records, "VGRD", level)
            if v is not None:
                v.attrs["_pyre_obs_source"] = "CORe-pgb"
                _save_obs_monthly(v, v_path)
        if u is not None and v is not None:
            return u, v

    if in_r2m_range:
        log.info("OBS      %s %d  UGRD+VGRD@%dhPa  → R2-monthly", _cal.month_abbr[month], year, level)
        try:
            if u is None:
                u = _fetch_r2m_field(year, month, "UGRD", level)
            if v is None:
                v = _fetch_r2m_field(year, month, "VGRD", level)
            return u, v
        except Exception as exc:
            log.warning("OBS      R2-monthly wind failed (%s) → CORe-3hrly fallback", exc)

    log.info("OBS      %s %d  UGRD+VGRD@%dhPa  → CORe-3hrly", _cal.month_abbr[month], year, level)
    if u is None:
        u = _compute_monthly_from_6hourly(
            year, month, lambda d, h, lv: fetch_wind_components(d, h, lv)[0], level
        )
        u.attrs["_pyre_obs_source"] = "CORe-3hrly"
        _save_obs_monthly(u, u_path)
    if v is None:
        v = _compute_monthly_from_6hourly(
            year, month, lambda d, h, lv: fetch_wind_components(d, h, lv)[1], level
        )
        v.attrs["_pyre_obs_source"] = "CORe-3hrly"
        _save_obs_monthly(v, v_path)
    return u, v


def fetch_monthly_wind_components_composite(
    year_months: list[tuple[int, int]], level: int
) -> tuple[xr.DataArray, xr.DataArray]:
    """Return day-weighted mean U and mean V from the monthly mean archive."""
    u_mean = _mean_of_monthly(lambda y, m, lv: fetch_monthly_wind_components(y, m, lv)[0], year_months, level)
    v_mean = _mean_of_monthly(lambda y, m, lv: fetch_monthly_wind_components(y, m, lv)[1], year_months, level)
    return u_mean, v_mean


def _climatology_stats(
    fetch_fn,
    month: int,
    start_year: int,
    end_year: int,
    *args,
) -> tuple[xr.DataArray, xr.DataArray]:
    """
    Fetch one field for every year in [start_year, end_year] for the given calendar
    month concurrently. Returns (mean, std) DataArrays.
    ddof=1 (sample std dev) is the statistically correct choice for a 30-year sample.
    Both arrays share the first fetched DataArray's attrs.
    """
    years = list(range(start_year, end_year + 1))
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch_fn, y, month, *args) for y in years]
        arrays  = [f.result().drop_vars("valid_time", errors="ignore") for f in futures]
    stacked = xr.concat(arrays, dim="year")
    mean = stacked.mean(dim="year")
    std  = stacked.std( dim="year", ddof=1)
    mean.attrs = std.attrs = arrays[0].attrs
    return mean, std


@lru_cache(maxsize=None)
def get_climatology_field(
    month: int,
    grib_name: str,
    level: int,
    start_year: int = CLIMO_START_YEAR,
    end_year:   int = CLIMO_END_YEAR,
) -> tuple[xr.DataArray, xr.DataArray]:
    """Cached 30-year (mean, std) for a direct GRIB field."""
    return _climatology_stats(fetch_monthly_field, month, start_year, end_year, grib_name, level)


@lru_cache(maxsize=None)
def get_climatology_wind_speed(
    month: int,
    level: int,
    start_year: int = CLIMO_START_YEAR,
    end_year:   int = CLIMO_END_YEAR,
) -> tuple[xr.DataArray, xr.DataArray]:
    """Cached 30-year (mean, std) for wind speed magnitude."""
    return _climatology_stats(fetch_monthly_wind_speed, month, start_year, end_year, level)


@lru_cache(maxsize=None)
def get_climatology_relative_humidity(
    month: int,
    level: int,
    start_year: int = CLIMO_START_YEAR,
    end_year:   int = CLIMO_END_YEAR,
) -> tuple[xr.DataArray, xr.DataArray]:
    """Cached 30-year (mean, std) for relative humidity."""
    return _climatology_stats(fetch_monthly_relative_humidity, month, start_year, end_year, level)
