import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta

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