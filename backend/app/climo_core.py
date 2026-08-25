from __future__ import annotations

import calendar
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import xarray as xr

from .config import CLIMO_ROOT
from .disk_cache import atomic_write_netcdf, discard_corrupt, open_netcdf
from .retrieval import fetch_flx_field

log = logging.getLogger("pyre.climo_core")

CLIMO_YEARS = tuple(range(1991, 2021))
WINDOW_DAYS = 5
CORE_3HOURLY_SOURCE = "core-3hourly"
WINDOW_LABEL = f"pm{WINDOW_DAYS}d"
_CACHE_DIR = os.path.join(CLIMO_ROOT, f"core_3hourly_{WINDOW_LABEL}")

_cache: dict[tuple[str, int, int, str], dict[str, xr.DataArray]] = {}
_cache_lock = threading.Lock()


@dataclass(frozen=True)
class Core3HourlyMember:
    date: str
    hour: str


def core_3hourly_path(variable: str, month: int, day: int, hour: str) -> str:
    return os.path.join(_CACHE_DIR, f"core_3hourly_{variable}_{month:02d}{day:02d}_{hour}z_{WINDOW_LABEL}.nc")


def core_3hourly_window_members(month: int, day: int, hour: str) -> list[Core3HourlyMember]:
    members: list[Core3HourlyMember] = []
    for year in CLIMO_YEARS:
        if day > calendar.monthrange(year, month)[1]:
            continue
        center = date(year, month, day)
        for delta in range(-WINDOW_DAYS, WINDOW_DAYS + 1):
            target = center + timedelta(days=delta)
            if target.year != year:
                continue
            members.append(Core3HourlyMember(target.strftime("%Y%m%d"), hour))
    return members


def _load_disk(variable: str, month: int, day: int, hour: str) -> dict[str, xr.DataArray] | None:
    path = core_3hourly_path(variable, month, day, hour)
    if not os.path.exists(path):
        return None
    try:
        with open_netcdf(path) as ds:
            return {"mean": ds["mean"].load(), "std": ds["std"].load()}
    except Exception as exc:
        log.warning("CLIMO_CORE disk cache corrupt (%s), deleting + re-fetching", exc)
        discard_corrupt(path)
        return None


def _save_disk(variable: str, month: int, day: int, hour: str, result: dict[str, xr.DataArray]) -> None:
    path = core_3hourly_path(variable, month, day, hour)
    ds = xr.Dataset({"mean": result["mean"], "std": result["std"]})
    atomic_write_netcdf(ds, path)


def _fetch_core_pwat_member(member: Core3HourlyMember) -> xr.DataArray:
    da = fetch_flx_field(member.date, member.hour, "PWAT", "atmos col")
    da = da.where(np.abs(da) < 1e30).astype(np.float64)
    da.attrs["_pyre_climo_member"] = f"{member.date} {member.hour}z"
    return da


def _compute_core_3hourly_pwat(month: int, day: int, hour: str, workers: int = 8) -> dict[str, xr.DataArray]:
    members = core_3hourly_window_members(month, day, hour)
    if not members:
        raise RuntimeError(f"no CORe 3-hourly PWAT climatology members for {month:02d}-{day:02d} {hour}z")

    log.info(
        "CLIMO_CORE fetching PWAT %02d-%02d %sz (%d members, years=%d-%d, ±%d days)",
        month,
        day,
        hour,
        len(members),
        CLIMO_YEARS[0],
        CLIMO_YEARS[-1],
        WINDOW_DAYS,
    )
    t0 = time.perf_counter()
    arrays: list[xr.DataArray] = []
    with ThreadPoolExecutor(max_workers=min(workers, len(members))) as pool:
        futures = {pool.submit(_fetch_core_pwat_member, member): member for member in members}
        for fut in as_completed(futures):
            member = futures[fut]
            try:
                arrays.append(fut.result())
            except Exception as exc:
                log.error("CLIMO_CORE member %s %sz failed: %s", member.date, member.hour, exc)
                raise

    stacked = xr.concat(arrays, dim="sample")
    mean = stacked.mean(dim="sample")
    std = stacked.std(dim="sample", ddof=1)
    attrs = {
        "units": "kg/m²",
        "climo_source": CORE_3HOURLY_SOURCE,
        "climo_years": f"{CLIMO_YEARS[0]}-{CLIMO_YEARS[-1]}",
        "window_days": WINDOW_DAYS,
        "sample_count": len(arrays),
    }
    mean.attrs.update(attrs | {"long_name": "CORe 3-hourly PWAT climatological mean"})
    std.attrs.update(attrs | {"long_name": "CORe 3-hourly PWAT sample standard deviation"})
    result = {"mean": mean, "std": std}
    log.info("CLIMO_CORE PWAT %02d-%02d %sz computed in %.1fs", month, day, hour, time.perf_counter() - t0)
    return result


def get_core_3hourly_pwat_climo(month: int, day: int, hour: str) -> tuple[xr.DataArray, xr.DataArray]:
    key = ("pwat", WINDOW_DAYS, month, day, hour)
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return cached["mean"], cached["std"]

    result = _load_disk("pwat", month, day, hour)
    if result is None:
        result = _compute_core_3hourly_pwat(month, day, hour)
        _save_disk("pwat", month, day, hour, result)

    with _cache_lock:
        _cache[key] = result
    return result["mean"], result["std"]
