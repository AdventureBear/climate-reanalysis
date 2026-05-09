import calendar as _cal
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache

import numpy as np
import requests
import xarray as xr

# GCS is the primary archive: 1950 → near real-time, 3-hourly, simpler URL.
# NOMADS keeps only the last 7 days and uses a more complex batch-dir structure.
GCS_BASE = "https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/pgb"
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


def _nomads_url(valid_date: str, valid_hour: str) -> str:
    """NOMADS URL — last 7 days only. Requires batch-dir calculation."""
    batch_hour = _VALID_HOUR_TO_BATCH[valid_hour]
    if valid_hour == "00":
        batch_date = (datetime.strptime(valid_date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
    else:
        batch_date = valid_date
    return f"{NOMADS_BASE}/core.{batch_date}/{batch_hour}/post/spost/core.t{valid_hour}z.spgb.ensmean.anl.grib2"


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
    r = requests.get(_gcs_index_url(date, hour), timeout=15)
    r.raise_for_status()
    return parse_index_text(r.text)


def _fetch_record(grib_url: str, records: list[IndexRecord], variable: str, level: int) -> xr.DataArray:
    """
    Issue an HTTP Range request for one GRIB2 record and return it as a
    loaded DataArray. Uses a temp file because cfgrib requires a file path;
    the file is deleted before returning.
    """
    target = f"{level} mb"
    match_idx = next(
        (i for i, r in enumerate(records) if r.variable == variable and r.level == target),
        None
    )
    if match_idx is None:
        raise ValueError(f"{variable} at {level} mb not found in index")

    rec = records[match_idx]
    if match_idx + 1 < len(records):
        range_header = f"bytes={rec.byte_start}-{records[match_idx + 1].byte_start - 1}"
    else:
        range_header = f"bytes={rec.byte_start}-"

    r = requests.get(grib_url, headers={"Range": range_header}, timeout=30)
    if r.status_code not in (200, 206):
        r.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(r.content)
        tmp_path = tmp.name

    try:
        ds = xr.open_dataset(tmp_path, engine="cfgrib", backend_kwargs={"indexpath": ""})
        da = ds[list(ds.data_vars)[0]].load()
        ds.close()
    finally:
        os.unlink(tmp_path)

    return da


def fetch_field(date: str, hour: str, variable: str, level: int) -> xr.DataArray:
    """Surgically fetch a single variable/level field."""
    records = fetch_index(date, hour)
    return _fetch_record(_grib_url(date, hour), records, variable, level)


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
    with ThreadPoolExecutor(max_workers=min(len(dates), 8)) as pool:
        futures = {pool.submit(fetch_fn, d, hour, *args): d for d in dates}
        arrays = [fut.result() for fut in as_completed(futures)]

    cleaned = [da.drop_vars("valid_time", errors="ignore") for da in arrays]
    stacked = xr.concat(cleaned, dim="composite_date")
    mean = stacked.mean(dim="composite_date")
    mean.attrs = cleaned[0].attrs
    return mean


def fetch_field_composite(dates: list[str], hour: str, variable: str, level: int) -> xr.DataArray:
    return _mean_of(fetch_field, dates, hour, variable, level)


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
# Monthly climatology — pgb pressure-level mean files (1950–2025)
# ---------------------------------------------------------------------------

CLIMO_PGB_BASE    = "https://ftp.cpc.ncep.noaa.gov/CORe/CDAS_clone_temporary/month/pgb"
CLIMO_START_YEAR  = 1991
CLIMO_END_YEAR    = 2020
# Inclusive end of the pre-computed monthly pgb archive.
MONTHLY_ARCHIVE_END: tuple[int, int] = (2025, 12)


def _pgb_monthly_url(year: int, month: int) -> str:
    return f"{CLIMO_PGB_BASE}/pgb.f00{year:04d}{month:02d}"


def _pgb_monthly_index_url(year: int, month: int) -> str:
    return f"{CLIMO_PGB_BASE}/pgb.f00{year:04d}{month:02d}.idx"


def _fetch_monthly_index(year: int, month: int) -> list[IndexRecord]:
    r = requests.get(_pgb_monthly_index_url(year, month), timeout=15)
    r.raise_for_status()
    return parse_index_text(r.text)


def _compute_monthly_from_6hourly(
    year: int, month: int, fetch_6h_fn, *args
) -> xr.DataArray:
    """
    Compute a monthly mean by averaging all 6-hourly time steps in the month.
    Used when the month is outside the pre-computed archive or when the pgb
    archive does not contain the requested field (e.g. SPFH at pressure levels).
    Concurrency is capped at 8 to avoid hammering the GCS endpoint.
    """
    days = range(1, _cal.monthrange(year, month)[1] + 1)
    specs = [(f"{year}{month:02d}{d:02d}", h)
             for d in days for h in VALID_HOURS]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_6h_fn, date, hour, *args): (date, hour)
                   for date, hour in specs}
        arrays = [f.result().drop_vars("valid_time", errors="ignore")
                  for f in as_completed(futures)]
    stacked = xr.concat(arrays, dim="composite_step")
    mean    = stacked.mean(dim="composite_step")
    mean.attrs = arrays[0].attrs
    return mean


def fetch_monthly_field(year: int, month: int, grib_name: str, level: int) -> xr.DataArray:
    """
    Monthly mean from the pgb archive (2.5° CDAS grid, 179 fields, 1950–Dec 2025).
    Falls back to averaging all 6-hourly time steps for months past the archive end.
    """
    if (year, month) <= MONTHLY_ARCHIVE_END:
        records = _fetch_monthly_index(year, month)
        return _fetch_record(_pgb_monthly_url(year, month), records, grib_name, level)
    return _compute_monthly_from_6hourly(year, month, fetch_field, grib_name, level)


def fetch_monthly_wind_speed(year: int, month: int, level: int) -> xr.DataArray:
    if (year, month) <= MONTHLY_ARCHIVE_END:
        records = _fetch_monthly_index(year, month)
        url = _pgb_monthly_url(year, month)
        u = _fetch_record(url, records, "UGRD", level)
        v = _fetch_record(url, records, "VGRD", level)
        speed = (u ** 2 + v ** 2) ** 0.5
        speed.attrs.update({"units": "m/s", "long_name": "Wind Speed"})
        return speed
    return _compute_monthly_from_6hourly(year, month, fetch_wind_speed, level)


def fetch_monthly_relative_humidity(year: int, month: int, level: int) -> xr.DataArray:
    """
    Monthly pgb has RH pre-computed at 1000–300 mb — fetch it directly.
    For months past Dec 2025, fall back to averaging 6-hourly Bolton-computed RH.
    """
    if (year, month) <= MONTHLY_ARCHIVE_END:
        records = _fetch_monthly_index(year, month)
        rh = _fetch_record(_pgb_monthly_url(year, month), records, "RH", level)
        rh.attrs.update({"units": "%", "long_name": "Relative Humidity"})
        return rh
    return _compute_monthly_from_6hourly(year, month, fetch_relative_humidity, level)


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
    with ThreadPoolExecutor(max_workers=min(len(year_months), 8)) as pool:
        futures = [pool.submit(fetch_fn, y, m, *args) for y, m in year_months]
        arrays  = [f.result().drop_vars("valid_time", errors="ignore") for f in futures]

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
    """Monthly mean U and V from the pgb archive; falls back to 6-hourly for months past Dec 2025."""
    if (year, month) <= MONTHLY_ARCHIVE_END:
        records = _fetch_monthly_index(year, month)
        url = _pgb_monthly_url(year, month)
        u = _fetch_record(url, records, "UGRD", level)
        v = _fetch_record(url, records, "VGRD", level)
        return u, v
    u = _compute_monthly_from_6hourly(year, month, lambda d, h, lv: fetch_wind_components(d, h, lv)[0], level)
    v = _compute_monthly_from_6hourly(year, month, lambda d, h, lv: fetch_wind_components(d, h, lv)[1], level)
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