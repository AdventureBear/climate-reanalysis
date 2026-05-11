#!/usr/bin/env python3
"""
Pre-compute R2 climatology (mean + σ, 1991–2020) for every variable × level
combination and save to backend/climo_cache/.

Files are written in the exact same format the API server already reads, so no
code changes are needed — the server finds pre-computed files on first request.

Run from the backend/ directory:

    uv run python scripts/precompute_climo.py                  # both modes
    uv run python scripts/precompute_climo.py --mode monthly   # ~1–2 hours
    uv run python scripts/precompute_climo.py --mode daily     # ~2–4 hours
    uv run python scripts/precompute_climo.py --mode daily --var wind_speed --level 850

The script is resume-friendly: existing files are skipped unless --force is passed.

--- Daily strategy ---
The current on-demand path fetches one 73×144 slice per year (30 requests per DOY).
The batch path is smarter: load all 30 years of one variable+level in parallel, then
compute 5-day centered window statistics for all 365 DOYs in memory.
  - 30 year-file loads (concurrent) vs 365×30 = 10,950 individual requests
  - Estimated: ~3–5 min per variable/level combo vs hours total
  - Window stats: 5 samples/year × 30 years = 150 samples per DOY (3× current)
    (boundary DOYs: 90–120 samples — still far more than the current 30)

--- Monthly strategy ---
Uses the same strided OPeNDAP approach as the on-demand code:
one request per (var, level, month) = 1,152 total requests.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from calendar import monthrange
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

import numpy as np
import xarray as xr

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("precompute")

# ── Constants (kept local so the script runs standalone) ─────────────────────
_R2D_BASE = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/Dailies/pressure"
_R2M_BASE = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/pressure"

_CLIMO_YEARS = list(range(1991, 2021))   # 30 years

# Calendar months → OPeNDAP time slice indices in the monthly mean files.
# t = (year - 1979) * 12 + (month - 1)
_R2M_T0 = (1991 - 1979) * 12   # 144
_R2M_T1 = (2020 - 1979) * 12   # 492

_PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]

# Scalar R2 variable names (daily files: {var}.{year}.nc)
_SCALAR_VARS = ["air", "hgt", "rhum", "uwnd", "vwnd"]

# Disk cache directory — same as climo_r2.py uses
_CACHE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "climo_cache")
)


# ── File path helpers (must match climo_r2._disk_path / _disk_path_monthly) ──

def _daily_path(r2_var: str, level: int, month: int, day: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2_daily_{r2_var}_{level}hPa_{month:02d}{day:02d}.nc")


def _monthly_path(r2_var: str, level: int, month: int) -> str:
    return os.path.join(_CACHE_DIR, f"r2m_climo_{r2_var}_{level}hPa_{month:02d}.nc")


def _save(path: str, mean: xr.DataArray, std: xr.DataArray) -> None:
    os.makedirs(_CACHE_DIR, exist_ok=True)
    xr.Dataset({"mean": mean, "std": std}).to_netcdf(
        path,
        encoding={
            "mean": {"zlib": True, "complevel": 4},
            "std":  {"zlib": True, "complevel": 4},
        },
    )


# ── OPeNDAP helpers ───────────────────────────────────────────────────────────

def _load_year(r2_var: str, year: int, level: int) -> tuple[int, xr.DataArray]:
    """
    Load all days of one year at one pressure level.
    Returns (year, DataArray[time, lat, lon]).
    The server receives a level-constrained OPeNDAP request; all time steps
    at that level are transferred (~15 MB per year, not the full multi-level file).
    """
    url = f"{_R2D_BASE}/{r2_var}.{year}.nc"
    ds = xr.open_dataset(url, engine="netcdf4")
    da = ds[r2_var].sel(level=level, method="nearest").load()
    ds.close()
    da = da.where(np.abs(da) < 1e30).astype(np.float64)
    return year, da


def _load_year_retry(r2_var: str, year: int, level: int, retries: int = 3) -> tuple[int, xr.DataArray]:
    for attempt in range(retries):
        try:
            return _load_year(r2_var, year, level)
        except Exception as exc:
            if attempt == retries - 1:
                raise
            wait = 10 * (2 ** attempt)
            log.warning("  retry %d/%d for %s %d @ %dhPa in %ds: %s",
                        attempt + 1, retries, r2_var, year, level, wait, exc)
            time.sleep(wait)
    raise RuntimeError("unreachable")


# ── Daily pre-computation ────────────────────────────────────────────────────

def precompute_daily_scalar(r2_var: str, level: int, workers: int = 8, force: bool = False) -> int:
    """
    Load all 30 years of r2_var at level, then compute 5-day window
    mean+std for every calendar day (365 DOYs, non-leap reference).
    Returns number of files written.
    """
    # Count how many files already exist
    all_days = [(m, d) for m in range(1, 13) for d in range(1, monthrange(2001, m)[1] + 1)]
    to_write = [(m, d) for m, d in all_days if force or not os.path.exists(_daily_path(r2_var, level, m, d))]

    if not to_write:
        log.info("  %s @ %dhPa  all %d daily files exist — skipping", r2_var, level, len(all_days))
        return 0

    log.info("  %s @ %dhPa  loading %d years concurrently (workers=%d) ...",
             r2_var, level, len(_CLIMO_YEARS), workers)
    t0 = time.perf_counter()

    year_data: dict[int, xr.DataArray] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_load_year_retry, r2_var, yr, level): yr for yr in _CLIMO_YEARS}
        for fut in as_completed(futures):
            yr = futures[fut]
            try:
                _, da = fut.result()
                year_data[yr] = da
                log.info("    year %d loaded", yr)
            except Exception as exc:
                log.error("    year %d FAILED: %s", yr, exc)
                raise

    log.info("  all 30 years loaded in %.0fs — computing DOY statistics", time.perf_counter() - t0)

    written = 0
    for month, day in to_write:
        samples: list[xr.DataArray] = []
        for yr, da in year_data.items():
            center = date(yr, month, day)
            for delta in range(-2, 3):           # ±2 day window
                target = center + timedelta(days=delta)
                if target.year != yr:
                    continue                      # don't cross year boundary
                try:
                    s = da.sel(time=target.strftime("%Y-%m-%d"), method="nearest")
                    samples.append(s)
                except (KeyError, ValueError):
                    pass                          # Feb 29 in non-leap years

        if not samples:
            log.warning("  no samples for %s %02d-%02d — skipping", r2_var, month, day)
            continue

        stacked = xr.concat(samples, dim="sample")
        mean = stacked.mean("sample").rename({"lat": "latitude", "lon": "longitude"})
        std  = stacked.std("sample", ddof=1).rename({"lat": "latitude", "lon": "longitude"})
        _save(_daily_path(r2_var, level, month, day), mean, std)
        written += 1

    log.info("  %s @ %dhPa  wrote %d files (%.0fs total)",
             r2_var, level, written, time.perf_counter() - t0)
    return written


def precompute_daily_wind_speed(level: int, workers: int = 8, force: bool = False) -> int:
    """
    Wind speed climo: load uwnd+vwnd, compute sqrt(u²+v²) per sample
    before averaging — exact mean speed, not approximation from component means.
    """
    all_days = [(m, d) for m in range(1, 13) for d in range(1, monthrange(2001, m)[1] + 1)]
    to_write = [(m, d) for m, d in all_days
                if force or not os.path.exists(_daily_path("wind_speed", level, m, d))]

    if not to_write:
        log.info("  wind_speed @ %dhPa  all %d daily files exist — skipping", level, len(all_days))
        return 0

    log.info("  wind_speed @ %dhPa  loading uwnd+vwnd for %d years (workers=%d) ...",
             level, len(_CLIMO_YEARS), workers)
    t0 = time.perf_counter()

    u_data: dict[int, xr.DataArray] = {}
    v_data: dict[int, xr.DataArray] = {}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        u_fut = {pool.submit(_load_year_retry, "uwnd", yr, level): yr for yr in _CLIMO_YEARS}
        v_fut = {pool.submit(_load_year_retry, "vwnd", yr, level): yr for yr in _CLIMO_YEARS}
        for fut in as_completed(u_fut):
            yr = u_fut[fut]
            try:
                _, da = fut.result()
                u_data[yr] = da
            except Exception as exc:
                log.error("    uwnd year %d FAILED: %s", yr, exc)
                raise
        for fut in as_completed(v_fut):
            yr = v_fut[fut]
            try:
                _, da = fut.result()
                v_data[yr] = da
            except Exception as exc:
                log.error("    vwnd year %d FAILED: %s", yr, exc)
                raise

    log.info("  uwnd+vwnd loaded in %.0fs", time.perf_counter() - t0)

    written = 0
    for month, day in to_write:
        samples: list[xr.DataArray] = []
        for yr in _CLIMO_YEARS:
            center = date(yr, month, day)
            for delta in range(-2, 3):
                target = center + timedelta(days=delta)
                if target.year != yr:
                    continue
                try:
                    ts = target.strftime("%Y-%m-%d")
                    u = u_data[yr].sel(time=ts, method="nearest")
                    v = v_data[yr].sel(time=ts, method="nearest")
                    samples.append(np.sqrt(u ** 2 + v ** 2))
                except (KeyError, ValueError):
                    pass

        if not samples:
            continue

        stacked = xr.concat(samples, dim="sample")
        mean = stacked.mean("sample").rename({"lat": "latitude", "lon": "longitude"})
        std  = stacked.std("sample", ddof=1).rename({"lat": "latitude", "lon": "longitude"})
        _save(_daily_path("wind_speed", level, month, day), mean, std)
        written += 1

    log.info("  wind_speed @ %dhPa  wrote %d files (%.0fs total)",
             level, written, time.perf_counter() - t0)
    return written


# ── Monthly pre-computation ───────────────────────────────────────────────────

def precompute_monthly_scalar(r2_var: str, level: int, force: bool = False) -> int:
    written = 0
    for month in range(1, 13):
        path = _monthly_path(r2_var, level, month)
        if not force and os.path.exists(path):
            continue

        t_start = _R2M_T0 + (month - 1)
        t_end   = _R2M_T1 + (month - 1)
        url = f"{_R2M_BASE}/{r2_var}.mon.mean.nc"

        log.info("  monthly %s @ %dhPa  month=%02d  t_slice=[%d:%d:12]",
                 r2_var, level, month, t_start, t_end + 1)
        t0 = time.perf_counter()
        ds = xr.open_dataset(url, engine="netcdf4")
        da = (
            ds[r2_var]
            .sel(level=level, method="nearest")
            .isel(time=slice(t_start, t_end + 1, 12))
            .load()
        )
        ds.close()

        da = da.where(np.abs(da) < 1e30).astype(np.float64)
        mean = da.mean("time").rename({"lat": "latitude", "lon": "longitude"})
        std  = da.std("time", ddof=1).rename({"lat": "latitude", "lon": "longitude"})
        _save(path, mean, std)
        log.info("    done in %.1fs", time.perf_counter() - t0)
        written += 1

    return written


def precompute_monthly_wind_speed(level: int, force: bool = False) -> int:
    written = 0
    for month in range(1, 13):
        # Monthly wind speed uses a separate cache key ("wind_speed_monthly")
        path = _monthly_path("wind_speed_monthly", level, month)
        if not force and os.path.exists(path):
            continue

        t_start = _R2M_T0 + (month - 1)
        t_end   = _R2M_T1 + (month - 1)

        log.info("  monthly wind_speed @ %dhPa  month=%02d", level, month)
        t0 = time.perf_counter()
        ds_u = xr.open_dataset(f"{_R2M_BASE}/uwnd.mon.mean.nc", engine="netcdf4")
        ds_v = xr.open_dataset(f"{_R2M_BASE}/vwnd.mon.mean.nc", engine="netcdf4")
        u30 = ds_u["uwnd"].sel(level=level, method="nearest").isel(time=slice(t_start, t_end + 1, 12)).load()
        v30 = ds_v["vwnd"].sel(level=level, method="nearest").isel(time=slice(t_start, t_end + 1, 12)).load()
        ds_u.close(); ds_v.close()

        u30 = u30.where(np.abs(u30) < 1e30).astype(np.float64)
        v30 = v30.where(np.abs(v30) < 1e30).astype(np.float64)
        speed = (u30 ** 2 + v30 ** 2) ** 0.5
        mean = speed.mean("time").rename({"lat": "latitude", "lon": "longitude"})
        std  = speed.std("time", ddof=1).rename({"lat": "latitude", "lon": "longitude"})
        _save(path, mean, std)
        log.info("    done in %.1fs", time.perf_counter() - t0)
        written += 1

    return written


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["daily", "monthly", "both"], default="both",
                        help="Which climatology to pre-compute (default: both)")
    parser.add_argument("--var", choices=_SCALAR_VARS + ["wind_speed", "all"], default="all",
                        help="Limit to one variable (default: all)")
    parser.add_argument("--level", type=int, choices=_PRESSURE_LEVELS, default=None,
                        help="Limit to one pressure level (default: all)")
    parser.add_argument("--workers", type=int, default=8,
                        help="Concurrent year-file downloads for daily mode (default: 8)")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing cache files")
    args = parser.parse_args()

    levels = [args.level] if args.level else _PRESSURE_LEVELS

    # Resolve variable lists
    if args.var == "all":
        scalar_vars = _SCALAR_VARS
        do_wind = True
    elif args.var == "wind_speed":
        scalar_vars = []
        do_wind = True
    else:
        scalar_vars = [args.var]
        do_wind = False

    os.makedirs(_CACHE_DIR, exist_ok=True)
    grand_total = 0
    t_start = time.perf_counter()

    # ── Monthly ───────────────────────────────────────────────────────────────
    if args.mode in ("monthly", "both"):
        log.info("═══ MONTHLY CLIMATOLOGY ═══")
        log.info("Variables: %s%s  |  Levels: %d  |  Months: 12",
                 scalar_vars, " + wind_speed" if do_wind else "", len(levels))
        for level in levels:
            for r2_var in scalar_vars:
                log.info("── %s @ %d hPa", r2_var, level)
                n = precompute_monthly_scalar(r2_var, level, force=args.force)
                grand_total += n
            if do_wind:
                log.info("── wind_speed @ %d hPa", level)
                n = precompute_monthly_wind_speed(level, force=args.force)
                grand_total += n

    # ── Daily ─────────────────────────────────────────────────────────────────
    if args.mode in ("daily", "both"):
        log.info("═══ DAILY CLIMATOLOGY ═══")
        log.info("Variables: %s%s  |  Levels: %d  |  DOYs: 365",
                 scalar_vars, " + wind_speed" if do_wind else "", len(levels))
        log.info("Strategy: load all 30 years per (var, level) then compute ±2 day window in-memory")
        for level in levels:
            for r2_var in scalar_vars:
                log.info("── %s @ %d hPa", r2_var, level)
                n = precompute_daily_scalar(r2_var, level, workers=args.workers, force=args.force)
                grand_total += n
            if do_wind:
                log.info("── wind_speed @ %d hPa", level)
                n = precompute_daily_wind_speed(level, workers=args.workers, force=args.force)
                grand_total += n

    elapsed = time.perf_counter() - t_start
    log.info("═══ DONE  |  %d files written  |  %.0f min total ═══",
             grand_total, elapsed / 60)


if __name__ == "__main__":
    main()
