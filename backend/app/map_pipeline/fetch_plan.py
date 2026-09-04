from __future__ import annotations

import calendar as cal
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Callable, Protocol

import xarray as xr

from ..climo_core import get_core_3hourly_pwat_climo
from ..climo_r2 import (
    get_r2_daily_climo_field,
    get_r2_daily_climo_relative_humidity,
    get_r2_daily_climo_single_level,
    get_r2_daily_window_climo_single_level,
    get_r2_daily_climo_wind_components,
    get_r2_daily_climo_wind_speed,
    get_r2_monthly_climo_field,
    get_r2_monthly_climo_relative_humidity,
    get_r2_monthly_climo_single_level,
    get_r2_monthly_climo_wind_components,
    get_r2_monthly_climo_wind_speed,
)
from ..retrieval import (
    _RunningMean,
    _sum_of_pairs,
    fetch_field,
    gather_composite_members,
    fetch_monthly_named_level_composite,
    fetch_field_by_level_name,
    fetch_field_composite,
    fetch_field_daily_composite,
    fetch_flx_field,
    fetch_flx_wind_components,
    fetch_monthly_field_composite,
    fetch_monthly_relative_humidity_composite,
    fetch_monthly_relative_vorticity_composite,
    fetch_monthly_wind_components_composite,
    fetch_monthly_named_level_vector_speed_composite,
    fetch_monthly_wind_speed_composite,
    fetch_named_level_field_composite,
    fetch_named_level_field_daily_composite,
    fetch_named_level_vector_speed,
    fetch_named_level_vector_speed_composite,
    fetch_named_level_vector_speed_daily_composite,
    fetch_precip_rate,
    fetch_precip_rate_composite,
    fetch_precip_rate_daily_composite,
    fetch_precip_total,
    fetch_precip_total_composite,
    fetch_precip_total_daily_composite,
    fetch_relative_humidity,
    fetch_relative_humidity_2m,
    fetch_relative_humidity_2m_composite,
    fetch_relative_humidity_2m_daily_composite,
    fetch_relative_humidity_composite,
    fetch_relative_humidity_daily_composite,
    fetch_relative_vorticity,
    fetch_relative_vorticity_composite,
    fetch_relative_vorticity_daily_composite,
    fetch_wind_components,
    fetch_wind_components_composite,
    fetch_wind_components_daily_composite,
    fetch_wind_speed,
    fetch_wind_speed_composite,
    fetch_wind_speed_daily_composite,
    get_climatology_field,
    get_climatology_relative_humidity,
    get_climatology_wind_speed,
)
from ..climo_r1 import (
    get_r1_hourly_climo,
    get_r1_hourly_climo_field,
    get_r1_hourly_climo_spec,
    get_r1_hourly_climo_wind_speed,
)
from ..config import VARIABLES, is_surface_or_named_level
from .climo_policy import HOURLY_CLIMO_SOURCE
from .pipeline_steps import vector_sigma_from_component_std
from .time_selection import TimeSelection


class FetchRequest(Protocol):
    variable: str
    level: int | str | None
    hour: str
    precip_window: int
    skip_missing: int


def _variable_fetch_key(variable: str) -> str:
    if variable == "precip_rate":
        return "precip_rate"
    if variable == "precip_total":
        return "precip_total"
    if VARIABLES[variable].get("derive") == "relative_vorticity":
        return "relative_vorticity"
    if VARIABLES[variable].get("stream") == "flx":
        return "flx"
    if VARIABLES[variable].get("stream") == "derived_surface":
        return variable
    if VARIABLES[variable].get("stream") == "derived_named_level":
        return "derived_named_level"
    if VARIABLES[variable].get("stream") == "pgb_named_level":
        return "pgb_named_level"
    return variable if variable in {"wind_speed", "rel_humidity"} else "field"


def _uses_10m_wind_overlay(variable: str) -> bool:
    """Surface/named-level fields pair with 10m winds, not pressure-level winds."""
    return is_surface_or_named_level(variable)


def _apply_source_time_offset(date: str, hour: str, offset_hours: int) -> tuple[str, str]:
    source = datetime.strptime(f"{date}{hour}", "%Y%m%d%H") + timedelta(hours=offset_hours)
    return source.strftime("%Y%m%d"), source.strftime("%H")


def _flx_field(req: FetchRequest, date: str, hour: str):
    cfg = VARIABLES[req.variable]
    offset = int(cfg.get("source_time_offset_hours", 0))
    source_date, source_hour = _apply_source_time_offset(date, hour, offset) if offset else (date, hour)
    return fetch_flx_field(
        source_date,
        source_hour,
        cfg["grib_name"],
        cfg["flx_level"],
        time_stat=cfg.get("time_stat"),
    )


def _pgb_named_level_field(req: FetchRequest, date: str, hour: str):
    cfg = VARIABLES[req.variable]
    return fetch_field_by_level_name(date, hour, cfg["grib_name"], cfg["level_name"])


def _derived_named_level_field(req: FetchRequest, date: str, hour: str):
    cfg = VARIABLES[req.variable]
    if cfg.get("derive") == "vector_speed":
        u_grib, v_grib = cfg["grib_names"]
        return fetch_named_level_vector_speed(date, hour, u_grib, v_grib, cfg["level_name"], cfg["name"])
    raise ValueError(f"unsupported named-level derivation for {req.variable!r}")


def _mean_flx_pairs(req: FetchRequest, date_hour_pairs: list[tuple[str, str]]) -> xr.DataArray:
    """Concurrent flx fetches averaged into one composite, under the shared
    missing-member policy (gather_composite_members, #95)."""
    acc = _RunningMean()
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = {pool.submit(_flx_field, req, date, hour): f"{date} {hour}z"
                   for date, hour in date_hour_pairs}
        _, missing = gather_composite_members(
            futures, skip_missing=bool(req.skip_missing), consume=acc.add)
    mean = acc.mean()
    if missing:
        mean.attrs["_pyre_skipped_members"] = ", ".join(sorted(missing))
    return mean


def _mean_flx_wind_components(date_hour_pairs: list[tuple[str, str]], *, skip_missing: bool = False):
    """Fetch 10m (U, V) once per (date, hour) pair concurrently, mean each
    component. Same shared missing-member policy; a pair is one member."""
    u_acc, v_acc = _RunningMean(), _RunningMean()

    def consume(pair):
        u_acc.add(pair[0])
        v_acc.add(pair[1])

    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = {pool.submit(fetch_flx_wind_components, date, hour): f"{date} {hour}z"
                   for date, hour in date_hour_pairs}
        _, missing = gather_composite_members(futures, skip_missing=skip_missing, consume=consume)
    u_mean, v_mean = u_acc.mean(), v_acc.mean()
    if missing:
        skipped = ", ".join(sorted(missing))
        u_mean.attrs["_pyre_skipped_members"] = skipped
        v_mean.attrs["_pyre_skipped_members"] = skipped
    return u_mean, v_mean


def _mean_pairs_obs(req: FetchRequest, sel: TimeSelection, grib_name: str):
    """Observation mean over exact (date, hour) members — the pairs path for
    canonical 3-hourly ranges and lists. One member = one fetch, folded through
    the shared missing-member policy exactly like every other composite."""
    fetch_one = PAIR_MEMBER_FETCHERS[_variable_fetch_key(req.variable)]
    acc = _RunningMean()
    with ThreadPoolExecutor(max_workers=min(len(sel.date_hour_members), 8)) as pool:
        futures = {pool.submit(fetch_one, req, grib_name, date, hour): f"{date} {hour}z"
                   for date, hour in sel.date_hour_members}
        _, missing = gather_composite_members(
            futures, skip_missing=bool(req.skip_missing), consume=acc.add)
    mean = acc.mean()
    if missing:
        mean.attrs["_pyre_skipped_members"] = ", ".join(sorted(missing))
    return mean


# One entry per _variable_fetch_key, each fetching a single (date, hour)
# member. precip_total is deliberately absent: an accumulation over a span is
# a precip_window question, not a mean of members (rejected at the endpoint).
PAIR_MEMBER_FETCHERS: dict[str, Callable] = {
    "wind_speed": lambda req, grib, d, h: fetch_wind_speed(d, h, req.level),
    "relative_vorticity": lambda req, grib, d, h: fetch_relative_vorticity(d, h, req.level),
    "rel_humidity": lambda req, grib, d, h: fetch_relative_humidity(d, h, req.level),
    "rel_humidity_2m": lambda req, grib, d, h: fetch_relative_humidity_2m(d, h),
    "precip_rate": lambda req, grib, d, h: fetch_precip_rate(d, h),
    "field": lambda req, grib, d, h: fetch_field(d, h, grib, req.level),
    "pgb_named_level": lambda req, grib, d, h: _pgb_named_level_field(req, d, h),
    "derived_named_level": lambda req, grib, d, h: _derived_named_level_field(req, d, h),
    "flx": lambda req, grib, d, h: _flx_field(req, d, h),
}


def _mean_wind_components_pairs(req: FetchRequest, members: list[tuple[str, str]]):
    """Pressure-level (U, V) means over exact (date, hour) members."""
    u_acc, v_acc = _RunningMean(), _RunningMean()

    def consume(pair):
        u_acc.add(pair[0])
        v_acc.add(pair[1])

    with ThreadPoolExecutor(max_workers=min(len(members), 8)) as pool:
        futures = {pool.submit(fetch_wind_components, d, h, req.level): f"{d} {h}z"
                   for d, h in members}
        _, missing = gather_composite_members(
            futures, skip_missing=bool(req.skip_missing), consume=consume)
    u_mean, v_mean = u_acc.mean(), v_acc.mean()
    if missing:
        skipped = ", ".join(sorted(missing))
        u_mean.attrs["_pyre_skipped_members"] = skipped
        v_mean.attrs["_pyre_skipped_members"] = skipped
    return u_mean, v_mean


def _mean_named_level_pairs(members: list[tuple[str, str]], grib: str, level_name: str, *, skip_missing: bool):
    """Named-level pgb field mean over exact (date, hour) members (MSLP)."""
    acc = _RunningMean()
    with ThreadPoolExecutor(max_workers=min(len(members), 8)) as pool:
        futures = {pool.submit(fetch_field_by_level_name, d, h, grib, level_name): f"{d} {h}z"
                   for d, h in members}
        _, missing = gather_composite_members(futures, skip_missing=skip_missing, consume=acc.add)
    mean = acc.mean()
    if missing:
        mean.attrs["_pyre_skipped_members"] = ", ".join(sorted(missing))
    return mean


def _mean_field_pairs(req: FetchRequest, members: list[tuple[str, str]], grib: str, level):
    """Pressure-level field mean over exact (date, hour) members (overlays)."""
    acc = _RunningMean()
    with ThreadPoolExecutor(max_workers=min(len(members), 8)) as pool:
        futures = {pool.submit(fetch_field, d, h, grib, level): f"{d} {h}z"
                   for d, h in members}
        _, missing = gather_composite_members(
            futures, skip_missing=bool(req.skip_missing), consume=acc.add)
    mean = acc.mean()
    if missing:
        mean.attrs["_pyre_skipped_members"] = ", ".join(sorted(missing))
    return mean


ClimoFetcher = Callable[[int, int, int, str], tuple]


def _pgb_field_climo(month: int, _day: int, level: int, grib_name: str):
    return get_climatology_field(month, grib_name, level)


CLIMO_FETCHERS: dict[tuple[str, str], ClimoFetcher] = {
    ("r2-daily", "wind_speed"): lambda month, day, level, _grib: get_r2_daily_climo_wind_speed(month, day, level),
    ("r2-daily", "rel_humidity"): lambda month, day, level, _grib: get_r2_daily_climo_relative_humidity(month, day, level),
    ("r2-daily", "field"): lambda month, day, level, grib: get_r2_daily_climo_field(month, day, grib, level),
    ("r2-monthly", "wind_speed"): lambda month, _day, level, _grib: get_r2_monthly_climo_wind_speed(month, level),
    ("r2-monthly", "rel_humidity"): lambda month, _day, level, _grib: get_r2_monthly_climo_relative_humidity(month, level),
    ("r2-monthly", "field"): lambda month, _day, level, grib: get_r2_monthly_climo_field(month, grib, level),
    ("monthly-pgb", "wind_speed"): lambda month, _day, level, _grib: get_climatology_wind_speed(month, level),
    ("monthly-pgb", "rel_humidity"): lambda month, _day, level, _grib: get_climatology_relative_humidity(month, level),
    ("monthly-pgb", "field"): _pgb_field_climo,
}


WindClimoFetcher = Callable[[int, int, int], tuple]

WIND_CLIMO_COMPONENT_FETCHERS: dict[str, WindClimoFetcher] = {
    "r2-daily": lambda month, day, level: get_r2_daily_climo_wind_components(month, day, level),
    "r2-monthly": lambda month, _day, level: get_r2_monthly_climo_wind_components(month, level),
    "monthly-pgb": lambda month, _day, level: (
        get_climatology_field(month, "UGRD", level)[0],
        get_climatology_field(month, "VGRD", level)[0],
    ),
}


ObsFetcher = Callable[[FetchRequest, TimeSelection, str], object]

OBS_FETCHERS: dict[tuple[str, str], ObsFetcher] = {
    ("monthly", "wind_speed"): lambda req, sel, _grib: fetch_monthly_wind_speed_composite(sel.year_months, req.level),
    ("monthly", "relative_vorticity"): lambda req, sel, _grib: fetch_monthly_relative_vorticity_composite(sel.year_months, req.level),
    ("monthly", "rel_humidity"): lambda req, sel, _grib: fetch_monthly_relative_humidity_composite(sel.year_months, req.level),
    ("monthly", "field"): lambda req, sel, grib: fetch_monthly_field_composite(sel.year_months, grib, req.level),
    ("monthly", "pgb_named_level"): lambda req, sel, _grib: fetch_monthly_named_level_composite(
        sel.year_months,
        VARIABLES[req.variable]["monthly_grib_name"],
        VARIABLES[req.variable]["monthly_level_name"],
    ),
    ("monthly", "derived_named_level"): lambda req, sel, _grib: fetch_monthly_named_level_vector_speed_composite(
        sel.year_months,
        VARIABLES[req.variable]["monthly_grib_names"][0],
        VARIABLES[req.variable]["monthly_grib_names"][1],
        VARIABLES[req.variable]["monthly_level_name"],
        VARIABLES[req.variable]["name"],
    ),
    ("daily", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed_daily_composite(sel.date_list, sel.daily_hours, req.level, skip_missing=bool(req.skip_missing)),
    ("daily", "relative_vorticity"): lambda req, sel, _grib: fetch_relative_vorticity_daily_composite(sel.date_list, sel.daily_hours, req.level, skip_missing=bool(req.skip_missing)),
    ("daily", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity_daily_composite(sel.date_list, sel.daily_hours, req.level, skip_missing=bool(req.skip_missing)),
    ("daily", "rel_humidity_2m"): lambda req, sel, _grib: fetch_relative_humidity_2m_daily_composite(sel.date_list, sel.daily_hours, skip_missing=bool(req.skip_missing)),
    ("daily", "precip_rate"): lambda req, sel, _grib: fetch_precip_rate_daily_composite(sel.date_list, sel.daily_hours, skip_missing=bool(req.skip_missing)),
    ("daily", "precip_total"): lambda req, sel, _grib: fetch_precip_total_daily_composite(sel.date_list, sel.daily_hours, req.precip_window, skip_missing=bool(req.skip_missing)),
    ("daily", "field"): lambda req, sel, grib: fetch_field_daily_composite(sel.date_list, sel.daily_hours, grib, req.level, skip_missing=bool(req.skip_missing)),
    ("daily", "pgb_named_level"): lambda req, sel, _grib: fetch_named_level_field_daily_composite(
        sel.date_list,
        sel.daily_hours,
        VARIABLES[req.variable]["grib_name"],
        VARIABLES[req.variable]["level_name"],
        skip_missing=bool(req.skip_missing),
    ),
    ("daily", "derived_named_level"): lambda req, sel, _grib: fetch_named_level_vector_speed_daily_composite(
        sel.date_list,
        sel.daily_hours,
        VARIABLES[req.variable]["grib_names"][0],
        VARIABLES[req.variable]["grib_names"][1],
        VARIABLES[req.variable]["level_name"],
        VARIABLES[req.variable]["name"],
        skip_missing=bool(req.skip_missing),
    ),
    ("daily", "flx"): lambda req, sel, _grib: _mean_flx_pairs(req, [(d, h) for d in sel.date_list for h in sel.daily_hours]),
    ("composite", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed_composite(sel.date_list, req.hour, req.level, skip_missing=bool(req.skip_missing)),
    ("composite", "relative_vorticity"): lambda req, sel, _grib: fetch_relative_vorticity_composite(sel.date_list, req.hour, req.level, skip_missing=bool(req.skip_missing)),
    ("composite", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity_composite(sel.date_list, req.hour, req.level, skip_missing=bool(req.skip_missing)),
    ("composite", "rel_humidity_2m"): lambda req, sel, _grib: fetch_relative_humidity_2m_composite(sel.date_list, req.hour, skip_missing=bool(req.skip_missing)),
    ("composite", "precip_rate"): lambda req, sel, _grib: fetch_precip_rate_composite(sel.date_list, req.hour, skip_missing=bool(req.skip_missing)),
    ("composite", "precip_total"): lambda req, sel, _grib: fetch_precip_total_composite(sel.date_list, req.hour, req.precip_window, skip_missing=bool(req.skip_missing)),
    ("composite", "field"): lambda req, sel, grib: fetch_field_composite(sel.date_list, req.hour, grib, req.level, skip_missing=bool(req.skip_missing)),
    ("composite", "pgb_named_level"): lambda req, sel, _grib: fetch_named_level_field_composite(
        sel.date_list,
        req.hour,
        VARIABLES[req.variable]["grib_name"],
        VARIABLES[req.variable]["level_name"],
        skip_missing=bool(req.skip_missing),
    ),
    ("composite", "derived_named_level"): lambda req, sel, _grib: fetch_named_level_vector_speed_composite(
        sel.date_list,
        req.hour,
        VARIABLES[req.variable]["grib_names"][0],
        VARIABLES[req.variable]["grib_names"][1],
        VARIABLES[req.variable]["level_name"],
        VARIABLES[req.variable]["name"],
        skip_missing=bool(req.skip_missing),
    ),
    ("composite", "flx"): lambda req, sel, _grib: _mean_flx_pairs(req, [(d, req.hour) for d in sel.date_list]),
    ("single", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed(sel.date_list[0], req.hour, req.level),
    ("single", "relative_vorticity"): lambda req, sel, _grib: fetch_relative_vorticity(sel.date_list[0], req.hour, req.level),
    ("single", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity(sel.date_list[0], req.hour, req.level),
    ("single", "rel_humidity_2m"): lambda req, sel, _grib: fetch_relative_humidity_2m(sel.date_list[0], req.hour),
    ("single", "precip_rate"): lambda req, sel, _grib: fetch_precip_rate(sel.date_list[0], req.hour),
    ("single", "precip_total"): lambda req, sel, _grib: fetch_precip_total(sel.date_list[0], req.hour, req.precip_window),
    ("single", "field"): lambda req, sel, grib: fetch_field(sel.date_list[0], req.hour, grib, req.level),
    ("single", "pgb_named_level"): lambda req, sel, _grib: _pgb_named_level_field(req, sel.date_list[0], req.hour),
    ("single", "derived_named_level"): lambda req, sel, _grib: _derived_named_level_field(req, sel.date_list[0], req.hour),
    ("single", "flx"): lambda req, sel, _grib: _flx_field(req, sel.date_list[0], req.hour),
}

# Pairs selections (canonical 3-hourly range/list) share one generic
# implementation: the per-member fetcher table above drives every variable
# that has a single-member fetch.
for _pair_key in PAIR_MEMBER_FETCHERS:
    OBS_FETCHERS[("pairs", _pair_key)] = lambda req, sel, grib: _mean_pairs_obs(req, sel, grib)

# precip_total sums its members (one accumulation window each) instead of
# averaging; the endpoint guarantees the ending times don't overlap.
OBS_FETCHERS[("pairs", "precip_total")] = lambda req, sel, _grib: _sum_of_pairs(
    fetch_precip_total, sel.date_hour_members, req.precip_window,
    skip_missing=bool(req.skip_missing),
)


WindFetcher = Callable[[FetchRequest, TimeSelection], tuple]

WIND_COMPONENT_FETCHERS: dict[str, WindFetcher] = {
    "monthly": lambda req, sel: fetch_monthly_wind_components_composite(sel.year_months, req.level),
    "daily": lambda req, sel: _mean_flx_wind_components([(d, h) for d in sel.date_list for h in sel.daily_hours], skip_missing=bool(req.skip_missing))
    if _uses_10m_wind_overlay(req.variable)
    else fetch_wind_components_daily_composite(sel.date_list, sel.daily_hours, req.level, skip_missing=bool(req.skip_missing)),
    "composite": lambda req, sel: _mean_flx_wind_components([(d, req.hour) for d in sel.date_list], skip_missing=bool(req.skip_missing))
    if _uses_10m_wind_overlay(req.variable)
    else fetch_wind_components_composite(sel.date_list, req.hour, req.level, skip_missing=bool(req.skip_missing)),
    "single": lambda req, sel: fetch_flx_wind_components(sel.date_list[0], req.hour)
    if _uses_10m_wind_overlay(req.variable)
    else fetch_wind_components(sel.date_list[0], req.hour, req.level),
    "pairs": lambda req, sel: _mean_flx_wind_components(sel.date_hour_members, skip_missing=bool(req.skip_missing))
    if _uses_10m_wind_overlay(req.variable)
    else _mean_wind_components_pairs(req, sel.date_hour_members),
}


def fetch_climo(req: FetchRequest, climo_source: str, month: int, day: int, grib_name: str, *, hour: int | None = None):
    if climo_source == "core-3hourly":
        if req.variable != "precipitable_water":
            raise ValueError(f"core-3hourly climatology is only wired for PWAT, not {req.variable!r}")
        return get_core_3hourly_pwat_climo(month, day, req.hour)

    if climo_source == "r2-daily-15day":
        if req.variable != "precipitable_water":
            raise ValueError(f"r2-daily-15day climatology is only wired for PWAT, not {req.variable!r}")
        spec = VARIABLES[req.variable]["r2_climo"]
        return get_r2_daily_window_climo_single_level(spec, month, day)

    # Per-synoptic-hour baseline for single-hour products (#72). Mean only —
    # the LTM files carry no sigma, which is why 3-hourly normalized mode is
    # not offered; std is returned as None and never read on this path.
    if climo_source == HOURLY_CLIMO_SOURCE:
        # Callers with heterogeneous member hours (pairs, multi-hour slices)
        # pass hour explicitly; single-hour requests fall back to req.hour.
        hour = int(req.hour) if hour is None else hour
        hourly_spec = VARIABLES[req.variable].get("r1_4xday")
        if hourly_spec is not None:
            return get_r1_hourly_climo_spec(hourly_spec, req.level, month, day, hour), None
        if req.variable == "wind_speed":
            return get_r1_hourly_climo_wind_speed(req.level, month, day, hour), None
        return get_r1_hourly_climo_field(grib_name, req.level, month, day, hour), None

    # Single-level variables declare their R2 baseline as an r2_climo spec;
    # climo_policy guarantees climo_source is one of the two R2 sources here.
    spec = VARIABLES[req.variable].get("r2_climo")
    if spec is not None:
        if climo_source == "r2-monthly":
            return get_r2_monthly_climo_single_level(spec, month)
        if climo_source == "r2-daily":
            return get_r2_daily_climo_single_level(spec, month, day)
        raise ValueError(
            f"climo_source {climo_source!r} is not wired for single-level variable {req.variable!r}"
        )
    key = (climo_source, _variable_fetch_key(req.variable))
    return CLIMO_FETCHERS[key](month, day, req.level, grib_name)


def _selection_month_weights(selection: TimeSelection) -> list[tuple[int, int]]:
    """
    Weight each unique calendar month by the actual number of days it contributes
    to the obs selection (a month picked from several years counts every year).
    Mirrors the day-weighting that _mean_of_monthly applies to the observations,
    so the anomaly baseline stays aligned with the composite.
    """
    counts: dict[int, int] = {}
    for year, month in selection.year_months:
        counts[month] = counts.get(month, 0) + cal.monthrange(year, month)[1]
    return sorted(counts.items())


def fetch_climo_weighted(req: FetchRequest, climo_source: str, selection: TimeSelection, grib_name: str):
    month_weights = _selection_month_weights(selection)
    if len(month_weights) == 1:
        return fetch_climo(req, climo_source, month_weights[0][0], 15, grib_name)
    total_days = sum(weight for _, weight in month_weights)
    climo_data = [(weight, fetch_climo(req, climo_source, month, 15, grib_name)) for month, weight in month_weights]
    mean = sum(weight * cm for weight, (cm, _) in climo_data) / total_days
    std = sum(weight * cs for weight, (_, cs) in climo_data) / total_days
    return mean, std


def _calendar_day_counts(dates: list[str]) -> list[tuple[tuple[int, int], int]]:
    counts: dict[tuple[int, int], int] = {}
    for date in dates:
        key = (int(date[4:6]), int(date[6:8]))
        if key == (2, 29):
            key = (2, 28)
        counts[key] = counts.get(key, 0) + 1
    return sorted(counts.items())


def _member_calendar_day_counts(selection: TimeSelection) -> list[tuple[tuple[int, int], int]]:
    """Weight each unique (month, day) by how many members fall on it, so the
    baseline mean carries the same day weights as the member-weighted
    observation mean (a range crossing midnight has unequal members per day).
    Uniform selections (dates × identical hours) keep their old equal-day
    ratios. Falls back to date_list when no members are expanded (monthly)."""
    dates = [d for d, _ in selection.date_hour_members] or selection.date_list
    return _calendar_day_counts(dates)


def _member_day_hour_counts(selection: TimeSelection) -> list[tuple[tuple[int, int, int], int]]:
    """Weight each unique (month, day, hour) by how many members carry it —
    the hour-matched analogue of _calendar_day_counts, for the r1-4xdaily
    baseline under pairs selections and multi-hour slices (Feb 29 folds)."""
    counts: dict[tuple[int, int, int], int] = {}
    for date, hour in selection.date_hour_members:
        month, day = int(date[4:6]), int(date[6:8])
        if (month, day) == (2, 29):
            month, day = 2, 28
        key = (month, day, int(hour))
        counts[key] = counts.get(key, 0) + 1
    return sorted(counts.items())


def fetch_daily_climo_for_selection(req: FetchRequest, climo_source: str, selection: TimeSelection, grib_name: str):
    # Hour-matched baseline: weight per (month, day, hour) member so a range
    # crossing midnight (or a 03z+18z slice) compares each member against the
    # normal for its own hour, not one borrowed hour.
    if climo_source == HOURLY_CLIMO_SOURCE:
        member_weights = _member_day_hour_counts(selection)
        if len(member_weights) == 1:
            (month, day, hour), _ = member_weights[0]
            return fetch_climo(req, climo_source, month, day, grib_name, hour=hour)
        total = sum(weight for _, weight in member_weights)
        # Fetch the per-(month, day, hour) baseline slices concurrently, the
        # same way the observation side fetches its members (_mean_pairs_obs);
        # a long range needs up to ~185 unique slices and doing them one at a
        # time on a cold cache took minutes.
        with ThreadPoolExecutor(max_workers=min(len(member_weights), 8)) as pool:
            futures = [
                (weight, pool.submit(fetch_climo, req, climo_source, month, day, grib_name, hour=hour))
                for (month, day, hour), weight in member_weights
            ]
            climo_data = [(weight, future.result()) for weight, future in futures]
        mean = sum(weight * cm for weight, (cm, _) in climo_data) / total
        return mean, None  # the hourly baseline is mean-only

    days = _member_calendar_day_counts(selection)
    if len(days) == 1:
        (month, day), _ = days[0]
        return fetch_climo(req, climo_source, month, day, grib_name)
    total = sum(weight for _, weight in days)
    climo_data = [(weight, fetch_climo(req, climo_source, month, day, grib_name)) for (month, day), weight in days]
    mean = sum(weight * cm for weight, (cm, _) in climo_data) / total
    # The hourly baseline is mean-only (see fetch_climo); every other source
    # carries sigma for all days.
    if any(cs is None for _, (_, cs) in climo_data):
        return mean, None
    std = sum(weight * cs for weight, (_, cs) in climo_data) / total
    return mean, std


def fetch_wind_climo_components(req: FetchRequest, climo_source: str, month: int, day: int, *, hour: int | None = None):
    if climo_source == HOURLY_CLIMO_SOURCE:
        hour = int(req.hour) if hour is None else hour
        spec = VARIABLES[req.variable].get("r1_4xday")
        if spec is not None and spec.get("derive") == "wind_speed":
            return (get_r1_hourly_climo(spec["u"], req.level, month, day, hour),
                    get_r1_hourly_climo(spec["v"], req.level, month, day, hour))
        return (get_r1_hourly_climo_field("UGRD", req.level, month, day, hour),
                get_r1_hourly_climo_field("VGRD", req.level, month, day, hour))
    return WIND_CLIMO_COMPONENT_FETCHERS[climo_source](month, day, req.level)


def fetch_wind_vector_climo(req: FetchRequest, climo_source: str, month: int, day: int):
    if climo_source == HOURLY_CLIMO_SOURCE:
        mean_u, mean_v = fetch_wind_climo_components(req, climo_source, month, day)
        return mean_u, mean_v, None
    if climo_source == "r2-daily":
        u_mean, u_std = get_r2_daily_climo_field(month, day, "UGRD", req.level)
        v_mean, v_std = get_r2_daily_climo_field(month, day, "VGRD", req.level)
    elif climo_source == "r2-monthly":
        u_mean, u_std = get_r2_monthly_climo_field(month, "UGRD", req.level)
        v_mean, v_std = get_r2_monthly_climo_field(month, "VGRD", req.level)
    elif climo_source == "monthly-pgb":
        u_mean, u_std = get_climatology_field(month, "UGRD", req.level)
        v_mean, v_std = get_climatology_field(month, "VGRD", req.level)
    else:
        raise KeyError(f"wind vector climatology is not wired for {climo_source!r}")
    return u_mean, v_mean, vector_sigma_from_component_std(u_std, v_std)


def fetch_mslp_field_for_selection(req: FetchRequest, selection: TimeSelection):
    """
    MSLP (MSLET) matching the map's time selection, for H/L center detection
    on any variable's map. Monthly selections are not wired (no monthly obs
    fetcher for named-level fields).
    """
    cfg = VARIABLES["surface_pressure"]
    grib, level_name = cfg["grib_name"], cfg["level_name"]
    kind = selection.obs_kind
    if kind == "single":
        return fetch_field_by_level_name(selection.date_list[0], req.hour, grib, level_name)
    if kind == "composite":
        return fetch_named_level_field_composite(selection.date_list, req.hour, grib, level_name, skip_missing=bool(req.skip_missing))
    if kind == "daily":
        return fetch_named_level_field_daily_composite(selection.date_list, selection.daily_hours, grib, level_name, skip_missing=bool(req.skip_missing))
    if kind == "pairs":
        return _mean_named_level_pairs(selection.date_hour_members, grib, level_name, skip_missing=bool(req.skip_missing))
    # Monthly selections use the monthly archive (PRES:MSL reduction).
    return fetch_monthly_named_level_composite(
        selection.year_months, cfg["monthly_grib_name"], cfg["monthly_level_name"]
    )


def _mean_named_flx_pairs(date_hour_pairs: list[tuple[str, str]], grib: str, level_name: str) -> xr.DataArray:
    """Composite mean of one named flx field across (date, hour) pairs."""
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = [pool.submit(fetch_flx_field, d, h, grib, level_name) for d, h in date_hour_pairs]
        arrays = [f.result().drop_vars("valid_time", errors="ignore") for f in futures]
    stacked = xr.concat(arrays, dim="composite_step")
    mean = stacked.mean(dim="composite_step")
    mean.attrs = arrays[0].attrs
    return mean


def fetch_contour_overlay_field(kind: str, req: FetchRequest, selection: TimeSelection, mode: str, month: int):
    """
    Field for a contour overlay ("pressure" isobars, "height" contours,
    "temp" isotherms) matching the map's time selection.

    Returns (DataArray, meta) or (None, reason). Level rule: pressure-level
    maps overlay at their own level; surface/named-level maps use 500 mb
    heights and 2 m isotherms. Climatology mode contours the R2 monthly
    means; monthly obs selections support pressure-level overlays only.
    """
    surface_map = is_surface_or_named_level(req.variable)
    kind_key = selection.obs_kind

    if kind == "pressure":
        if req.variable == "surface_pressure":
            return None, "map already draws isobars"
        meta = {"kind": "pressure"}
        if mode == "climatology":
            spec = VARIABLES["surface_pressure"]["r2_climo"]
            return get_r2_monthly_climo_single_level(spec, month)[0], meta
        return fetch_mslp_field_for_selection(req, selection), meta

    if kind == "height":
        level = 500 if surface_map else req.level
        if req.variable == "height":
            return None, "map already draws height contours"
        meta = {"kind": "height", "level": level}
        if mode == "climatology":
            return get_r2_monthly_climo_field(month, "HGT", level)[0], meta
        if selection.monthly_mode:
            return fetch_monthly_field_composite(selection.year_months, "HGT", level), meta
        if kind_key == "single":
            return fetch_field(selection.date_list[0], req.hour, "HGT", level), meta
        if kind_key == "composite":
            return fetch_field_composite(selection.date_list, req.hour, "HGT", level, skip_missing=bool(req.skip_missing)), meta
        if kind_key == "pairs":
            return _mean_field_pairs(req, selection.date_hour_members, "HGT", level), meta
        return fetch_field_daily_composite(selection.date_list, selection.daily_hours, "HGT", level, skip_missing=bool(req.skip_missing)), meta

    if kind == "temp":
        if req.variable in {"temp", "temp_2m"}:
            return None, "map already shades temperature"
        if surface_map:
            meta = {"kind": "temp", "level": 1000, "is_2m": True}
            if mode == "climatology":
                spec = VARIABLES["temp_2m"]["r2_climo"]
                return get_r2_monthly_climo_single_level(spec, month)[0], meta
            if selection.monthly_mode:
                return None, "monthly obs not wired for 2m temperature"
            cfg = VARIABLES["temp_2m"]
            if kind_key == "single":
                return fetch_flx_field(selection.date_list[0], req.hour, cfg["grib_name"], cfg["flx_level"]), meta
            if kind_key == "composite":
                return _mean_named_flx_pairs([(d, req.hour) for d in selection.date_list], cfg["grib_name"], cfg["flx_level"]), meta
            if kind_key == "pairs":
                return _mean_named_flx_pairs(selection.date_hour_members, cfg["grib_name"], cfg["flx_level"]), meta
            return _mean_named_flx_pairs(
                [(d, h) for d in selection.date_list for h in selection.daily_hours], cfg["grib_name"], cfg["flx_level"]
            ), meta
        level = req.level
        meta = {"kind": "temp", "level": level, "is_2m": False}
        if mode == "climatology":
            return get_r2_monthly_climo_field(month, "TMP", level)[0], meta
        if selection.monthly_mode:
            return fetch_monthly_field_composite(selection.year_months, "TMP", level), meta
        if kind_key == "single":
            return fetch_field(selection.date_list[0], req.hour, "TMP", level), meta
        if kind_key == "composite":
            return fetch_field_composite(selection.date_list, req.hour, "TMP", level, skip_missing=bool(req.skip_missing)), meta
        if kind_key == "pairs":
            return _mean_field_pairs(req, selection.date_hour_members, "TMP", level), meta
        return fetch_field_daily_composite(selection.date_list, selection.daily_hours, "TMP", level, skip_missing=bool(req.skip_missing)), meta

    return None, f"unknown contour kind {kind!r}"


def fetch_climo_overlay_wind_components(req: FetchRequest, climo_source: str, month: int):
    """
    Climatological mean (U, V) for barbs/vectors/isotachs on climatology-mode
    maps: 10m components for surface/named-level fields, otherwise the map's
    pressure level. Climatology mode always resolves to a monthly source.
    """
    if _uses_10m_wind_overlay(req.variable):
        spec = VARIABLES["wind_10m"]["r2_climo"]
        u_mean, _ = get_r2_monthly_climo_single_level(spec["u"], month)
        v_mean, _ = get_r2_monthly_climo_single_level(spec["v"], month)
        return u_mean, v_mean
    return WIND_CLIMO_COMPONENT_FETCHERS[climo_source](month, 15, req.level)


def fetch_weighted_wind_climo_components(req: FetchRequest, climo_source: str, selection: TimeSelection):
    month_weights = _selection_month_weights(selection)
    if len(month_weights) == 1:
        return fetch_wind_climo_components(req, climo_source, month_weights[0][0], 15)
    total_days = sum(weight for _, weight in month_weights)
    comps = [(weight, fetch_wind_climo_components(req, climo_source, month, 15)) for month, weight in month_weights]
    mean_u = sum(weight * cu for weight, (cu, _) in comps) / total_days
    mean_v = sum(weight * cv for weight, (_, cv) in comps) / total_days
    return mean_u, mean_v


def fetch_weighted_wind_vector_climo(req: FetchRequest, climo_source: str, selection: TimeSelection):
    month_weights = _selection_month_weights(selection)
    if len(month_weights) == 1:
        return fetch_wind_vector_climo(req, climo_source, month_weights[0][0], 15)
    total_days = sum(weight for _, weight in month_weights)
    comps = [(weight, fetch_wind_vector_climo(req, climo_source, month, 15)) for month, weight in month_weights]
    mean_u = sum(weight * cu for weight, (cu, _, _) in comps) / total_days
    mean_v = sum(weight * cv for weight, (_, cv, _) in comps) / total_days
    vector_std = sum(weight * cs for weight, (_, _, cs) in comps) / total_days
    return mean_u, mean_v, vector_std


def fetch_daily_wind_climo_components_for_selection(req: FetchRequest, climo_source: str, selection: TimeSelection):
    # Same hour-matched weighting as fetch_daily_climo_for_selection.
    if climo_source == HOURLY_CLIMO_SOURCE:
        member_weights = _member_day_hour_counts(selection)
        if len(member_weights) == 1:
            (month, day, hour), _ = member_weights[0]
            return fetch_wind_climo_components(req, climo_source, month, day, hour=hour)
        total = sum(weight for _, weight in member_weights)
        # Concurrent like the scalar branch above; each key fetches U then V,
        # so the pool overlaps members rather than doubling the serial wait.
        with ThreadPoolExecutor(max_workers=min(len(member_weights), 8)) as pool:
            futures = [
                (weight, pool.submit(fetch_wind_climo_components, req, climo_source, month, day, hour=hour))
                for (month, day, hour), weight in member_weights
            ]
            comps = [(weight, future.result()) for weight, future in futures]
        mean_u = sum(weight * cu for weight, (cu, _) in comps) / total
        mean_v = sum(weight * cv for weight, (_, cv) in comps) / total
        return mean_u, mean_v

    days = _member_calendar_day_counts(selection)
    if len(days) == 1:
        (month, day), _ = days[0]
        return fetch_wind_climo_components(req, climo_source, month, day)
    total = sum(weight for _, weight in days)
    comps = [(weight, fetch_wind_climo_components(req, climo_source, month, day)) for (month, day), weight in days]
    mean_u = sum(weight * cu for weight, (cu, _) in comps) / total
    mean_v = sum(weight * cv for weight, (_, cv) in comps) / total
    return mean_u, mean_v


def fetch_daily_wind_vector_climo_for_selection(req: FetchRequest, climo_source: str, selection: TimeSelection):
    days = _member_calendar_day_counts(selection)
    if len(days) == 1:
        (month, day), _ = days[0]
        return fetch_wind_vector_climo(req, climo_source, month, day)
    total = sum(weight for _, weight in days)
    comps = [(weight, fetch_wind_vector_climo(req, climo_source, month, day)) for (month, day), weight in days]
    mean_u = sum(weight * cu for weight, (cu, _, _) in comps) / total
    mean_v = sum(weight * cv for weight, (_, cv, _) in comps) / total
    if any(cs is None for _, (_, _, cs) in comps):
        return mean_u, mean_v, None
    vector_std = sum(weight * cs for weight, (_, _, cs) in comps) / total
    return mean_u, mean_v, vector_std


def fetch_obs(req: FetchRequest, selection: TimeSelection, grib_name: str):
    key = (selection.obs_kind, _variable_fetch_key(req.variable))
    return OBS_FETCHERS[key](req, selection, grib_name)


def fetch_wind(req: FetchRequest, selection: TimeSelection):
    return WIND_COMPONENT_FETCHERS[selection.obs_kind](req, selection)
