from __future__ import annotations

import calendar as cal
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Protocol

import xarray as xr

from ..climo_r2 import (
    get_r2_daily_climo_field,
    get_r2_daily_climo_relative_humidity,
    get_r2_daily_climo_single_level,
    get_r2_daily_climo_wind_components,
    get_r2_daily_climo_wind_speed,
    get_r2_monthly_climo_field,
    get_r2_monthly_climo_relative_humidity,
    get_r2_monthly_climo_single_level,
    get_r2_monthly_climo_wind_components,
    get_r2_monthly_climo_wind_speed,
)
from ..retrieval import (
    fetch_field,
    fetch_field_by_level_name,
    fetch_field_composite,
    fetch_field_daily_composite,
    fetch_flx_field,
    fetch_flx_wind_components,
    fetch_monthly_field_composite,
    fetch_monthly_relative_humidity_composite,
    fetch_monthly_wind_components_composite,
    fetch_monthly_wind_speed_composite,
    fetch_named_level_field_composite,
    fetch_named_level_field_daily_composite,
    fetch_relative_humidity,
    fetch_relative_humidity_composite,
    fetch_relative_humidity_daily_composite,
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
from ..config import VARIABLES, is_surface_or_named_level
from .time_selection import TimeSelection


class FetchRequest(Protocol):
    variable: str
    level: int
    hour: str


def _variable_fetch_key(variable: str) -> str:
    if VARIABLES[variable].get("stream") == "flx":
        return "flx"
    if VARIABLES[variable].get("stream") == "pgb_named_level":
        return "pgb_named_level"
    return variable if variable in {"wind_speed", "rel_humidity"} else "field"


def _uses_10m_wind_overlay(variable: str) -> bool:
    """Surface/named-level fields pair with 10m winds, not pressure-level winds."""
    return is_surface_or_named_level(variable)


def _flx_field(req: FetchRequest, date: str, hour: str):
    cfg = VARIABLES[req.variable]
    return fetch_flx_field(date, hour, cfg["grib_name"], cfg["flx_level"])


def _pgb_named_level_field(req: FetchRequest, date: str, hour: str):
    cfg = VARIABLES[req.variable]
    return fetch_field_by_level_name(date, hour, cfg["grib_name"], cfg["level_name"])


def _mean_flx_pairs(req: FetchRequest, date_hour_pairs: list[tuple[str, str]]) -> xr.DataArray:
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = [pool.submit(_flx_field, req, date, hour) for date, hour in date_hour_pairs]
        arrays = [f.result().drop_vars("valid_time", errors="ignore") for f in as_completed(futures)]
    stacked = xr.concat(arrays, dim="composite_step")
    mean = stacked.mean(dim="composite_step")
    mean.attrs = arrays[0].attrs
    return mean


def _mean_flx_wind_components(date_hour_pairs: list[tuple[str, str]]):
    """Fetch 10m (U, V) once per (date, hour) pair concurrently, mean each component."""
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = [pool.submit(fetch_flx_wind_components, date, hour) for date, hour in date_hour_pairs]
        results = [f.result() for f in futures]
    u_list = [u.drop_vars("valid_time", errors="ignore") for u, _ in results]
    v_list = [v.drop_vars("valid_time", errors="ignore") for _, v in results]
    u_mean = xr.concat(u_list, dim="composite_step").mean(dim="composite_step")
    v_mean = xr.concat(v_list, dim="composite_step").mean(dim="composite_step")
    u_mean.attrs = u_list[0].attrs
    v_mean.attrs = v_list[0].attrs
    return u_mean, v_mean


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
    ("monthly", "rel_humidity"): lambda req, sel, _grib: fetch_monthly_relative_humidity_composite(sel.year_months, req.level),
    ("monthly", "field"): lambda req, sel, grib: fetch_monthly_field_composite(sel.year_months, grib, req.level),
    ("daily", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed_daily_composite(sel.date_list, sel.daily_hours, req.level),
    ("daily", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity_daily_composite(sel.date_list, sel.daily_hours, req.level),
    ("daily", "field"): lambda req, sel, grib: fetch_field_daily_composite(sel.date_list, sel.daily_hours, grib, req.level),
    ("daily", "pgb_named_level"): lambda req, sel, _grib: fetch_named_level_field_daily_composite(
        sel.date_list,
        sel.daily_hours,
        VARIABLES[req.variable]["grib_name"],
        VARIABLES[req.variable]["level_name"],
    ),
    ("daily", "flx"): lambda req, sel, _grib: _mean_flx_pairs(req, [(d, h) for d in sel.date_list for h in sel.daily_hours]),
    ("composite", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed_composite(sel.date_list, req.hour, req.level),
    ("composite", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity_composite(sel.date_list, req.hour, req.level),
    ("composite", "field"): lambda req, sel, grib: fetch_field_composite(sel.date_list, req.hour, grib, req.level),
    ("composite", "pgb_named_level"): lambda req, sel, _grib: fetch_named_level_field_composite(
        sel.date_list,
        req.hour,
        VARIABLES[req.variable]["grib_name"],
        VARIABLES[req.variable]["level_name"],
    ),
    ("composite", "flx"): lambda req, sel, _grib: _mean_flx_pairs(req, [(d, req.hour) for d in sel.date_list]),
    ("single", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed(sel.date_list[0], req.hour, req.level),
    ("single", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity(sel.date_list[0], req.hour, req.level),
    ("single", "field"): lambda req, sel, grib: fetch_field(sel.date_list[0], req.hour, grib, req.level),
    ("single", "pgb_named_level"): lambda req, sel, _grib: _pgb_named_level_field(req, sel.date_list[0], req.hour),
    ("single", "flx"): lambda req, sel, _grib: _flx_field(req, sel.date_list[0], req.hour),
}


WindFetcher = Callable[[FetchRequest, TimeSelection], tuple]

WIND_COMPONENT_FETCHERS: dict[str, WindFetcher] = {
    "monthly": lambda req, sel: fetch_monthly_wind_components_composite(sel.year_months, req.level),
    "daily": lambda req, sel: _mean_flx_wind_components([(d, h) for d in sel.date_list for h in sel.daily_hours])
    if _uses_10m_wind_overlay(req.variable)
    else fetch_wind_components_daily_composite(sel.date_list, sel.daily_hours, req.level),
    "composite": lambda req, sel: _mean_flx_wind_components([(d, req.hour) for d in sel.date_list])
    if _uses_10m_wind_overlay(req.variable)
    else fetch_wind_components_composite(sel.date_list, req.hour, req.level),
    "single": lambda req, sel: fetch_flx_wind_components(sel.date_list[0], req.hour)
    if _uses_10m_wind_overlay(req.variable)
    else fetch_wind_components(sel.date_list[0], req.hour, req.level),
}


def fetch_climo(req: FetchRequest, climo_source: str, month: int, day: int, grib_name: str):
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


def fetch_daily_climo_for_selection(req: FetchRequest, climo_source: str, selection: TimeSelection, grib_name: str):
    days = _calendar_day_counts(selection.date_list)
    if len(days) == 1:
        (month, day), _ = days[0]
        return fetch_climo(req, climo_source, month, day, grib_name)
    total = sum(weight for _, weight in days)
    climo_data = [(weight, fetch_climo(req, climo_source, month, day, grib_name)) for (month, day), weight in days]
    mean = sum(weight * cm for weight, (cm, _) in climo_data) / total
    std = sum(weight * cs for weight, (_, cs) in climo_data) / total
    return mean, std


def fetch_wind_climo_components(req: FetchRequest, climo_source: str, month: int, day: int):
    return WIND_CLIMO_COMPONENT_FETCHERS[climo_source](month, day, req.level)


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
        return fetch_named_level_field_composite(selection.date_list, req.hour, grib, level_name)
    if kind == "daily":
        return fetch_named_level_field_daily_composite(selection.date_list, selection.daily_hours, grib, level_name)
    raise ValueError(f"MSLP centers are not available for {kind!r} selections")


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
        if selection.monthly_mode:
            return None, "monthly obs not wired for MSLET"
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
            return fetch_field_composite(selection.date_list, req.hour, "HGT", level), meta
        return fetch_field_daily_composite(selection.date_list, selection.daily_hours, "HGT", level), meta

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
            return fetch_field_composite(selection.date_list, req.hour, "TMP", level), meta
        return fetch_field_daily_composite(selection.date_list, selection.daily_hours, "TMP", level), meta

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


def fetch_daily_wind_climo_components_for_selection(req: FetchRequest, climo_source: str, selection: TimeSelection):
    days = _calendar_day_counts(selection.date_list)
    if len(days) == 1:
        (month, day), _ = days[0]
        return fetch_wind_climo_components(req, climo_source, month, day)
    total = sum(weight for _, weight in days)
    comps = [(weight, fetch_wind_climo_components(req, climo_source, month, day)) for (month, day), weight in days]
    mean_u = sum(weight * cu for weight, (cu, _) in comps) / total
    mean_v = sum(weight * cv for weight, (_, cv) in comps) / total
    return mean_u, mean_v


def fetch_obs(req: FetchRequest, selection: TimeSelection, grib_name: str):
    key = (selection.obs_kind, _variable_fetch_key(req.variable))
    return OBS_FETCHERS[key](req, selection, grib_name)


def fetch_wind(req: FetchRequest, selection: TimeSelection):
    return WIND_COMPONENT_FETCHERS[selection.obs_kind](req, selection)
