from __future__ import annotations

import calendar as cal
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Protocol

import xarray as xr

from ..climo_r2 import (
    get_r2_daily_climo_field,
    get_r2_daily_climo_relative_humidity,
    get_r2_daily_climo_wind_components,
    get_r2_daily_climo_wind_speed,
    get_r2_monthly_climo_field,
    get_r2_monthly_climo_relative_humidity,
    get_r2_monthly_climo_wind_components,
    get_r2_monthly_climo_wind_speed,
)
from ..retrieval import (
    fetch_field,
    fetch_field_composite,
    fetch_field_daily_composite,
    fetch_flx_field,
    fetch_flx_wind_components,
    fetch_monthly_field_composite,
    fetch_monthly_relative_humidity_composite,
    fetch_monthly_wind_components_composite,
    fetch_monthly_wind_speed_composite,
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
from ..config import VARIABLES
from .time_selection import TimeSelection


class FetchRequest(Protocol):
    variable: str
    level: int
    hour: str


def _variable_fetch_key(variable: str) -> str:
    if VARIABLES[variable].get("stream") == "flx":
        return "flx"
    return variable if variable in {"wind_speed", "rel_humidity"} else "field"


def _flx_field(req: FetchRequest, date: str, hour: str):
    cfg = VARIABLES[req.variable]
    return fetch_flx_field(date, hour, cfg["grib_name"], cfg["flx_level"])


def _mean_flx_pairs(req: FetchRequest, date_hour_pairs: list[tuple[str, str]]) -> xr.DataArray:
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = [pool.submit(_flx_field, req, date, hour) for date, hour in date_hour_pairs]
        arrays = [f.result().drop_vars("valid_time", errors="ignore") for f in as_completed(futures)]
    stacked = xr.concat(arrays, dim="composite_step")
    mean = stacked.mean(dim="composite_step")
    mean.attrs = arrays[0].attrs
    return mean


def _mean_flx_wind_components(date_hour_pairs: list[tuple[str, str]]):
    u_mean = _mean_flx_component(date_hour_pairs, 0)
    v_mean = _mean_flx_component(date_hour_pairs, 1)
    return u_mean, v_mean


def _mean_flx_component(date_hour_pairs: list[tuple[str, str]], component_idx: int) -> xr.DataArray:
    with ThreadPoolExecutor(max_workers=min(len(date_hour_pairs), 8)) as pool:
        futures = [pool.submit(lambda d, h: fetch_flx_wind_components(d, h)[component_idx], date, hour)
                   for date, hour in date_hour_pairs]
        arrays = [f.result().drop_vars("valid_time", errors="ignore") for f in as_completed(futures)]
    stacked = xr.concat(arrays, dim="composite_step")
    mean = stacked.mean(dim="composite_step")
    mean.attrs = arrays[0].attrs
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
    ("monthly", "rel_humidity"): lambda req, sel, _grib: fetch_monthly_relative_humidity_composite(sel.year_months, req.level),
    ("monthly", "field"): lambda req, sel, grib: fetch_monthly_field_composite(sel.year_months, grib, req.level),
    ("daily", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed_daily_composite(sel.date_list, sel.daily_hours, req.level),
    ("daily", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity_daily_composite(sel.date_list, sel.daily_hours, req.level),
    ("daily", "field"): lambda req, sel, grib: fetch_field_daily_composite(sel.date_list, sel.daily_hours, grib, req.level),
    ("daily", "flx"): lambda req, sel, _grib: _mean_flx_pairs(req, [(d, h) for d in sel.date_list for h in sel.daily_hours]),
    ("composite", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed_composite(sel.date_list, req.hour, req.level),
    ("composite", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity_composite(sel.date_list, req.hour, req.level),
    ("composite", "field"): lambda req, sel, grib: fetch_field_composite(sel.date_list, req.hour, grib, req.level),
    ("composite", "flx"): lambda req, sel, _grib: _mean_flx_pairs(req, [(d, req.hour) for d in sel.date_list]),
    ("single", "wind_speed"): lambda req, sel, _grib: fetch_wind_speed(sel.date_list[0], req.hour, req.level),
    ("single", "rel_humidity"): lambda req, sel, _grib: fetch_relative_humidity(sel.date_list[0], req.hour, req.level),
    ("single", "field"): lambda req, sel, grib: fetch_field(sel.date_list[0], req.hour, grib, req.level),
    ("single", "flx"): lambda req, sel, _grib: _flx_field(req, sel.date_list[0], req.hour),
}


WindFetcher = Callable[[FetchRequest, TimeSelection], tuple]

WIND_COMPONENT_FETCHERS: dict[str, WindFetcher] = {
    "monthly": lambda req, sel: fetch_monthly_wind_components_composite(sel.year_months, req.level),
    "daily": lambda req, sel: _mean_flx_wind_components([(d, h) for d in sel.date_list for h in sel.daily_hours])
    if VARIABLES[req.variable].get("stream") == "flx"
    else fetch_wind_components_daily_composite(sel.date_list, sel.daily_hours, req.level),
    "composite": lambda req, sel: _mean_flx_wind_components([(d, req.hour) for d in sel.date_list])
    if VARIABLES[req.variable].get("stream") == "flx"
    else fetch_wind_components_composite(sel.date_list, req.hour, req.level),
    "single": lambda req, sel: fetch_flx_wind_components(sel.date_list[0], req.hour)
    if VARIABLES[req.variable].get("stream") == "flx"
    else fetch_wind_components(sel.date_list[0], req.hour, req.level),
}


def fetch_climo(req: FetchRequest, climo_source: str, month: int, day: int, grib_name: str):
    key = (climo_source, _variable_fetch_key(req.variable))
    return CLIMO_FETCHERS[key](month, day, req.level, grib_name)


def fetch_climo_weighted(req: FetchRequest, climo_source: str, selection: TimeSelection, grib_name: str):
    unique_months = sorted(set(m for _, m in selection.year_months))
    if len(unique_months) == 1:
        return fetch_climo(req, climo_source, unique_months[0], 15, grib_name)
    day_weights = [cal.monthrange(2001, m)[1] for m in unique_months]
    total_days = sum(day_weights)
    climo_data = [fetch_climo(req, climo_source, m, 15, grib_name) for m in unique_months]
    mean = sum(w * cm for w, (cm, _) in zip(day_weights, climo_data)) / total_days
    std = sum(w * cs for w, (_, cs) in zip(day_weights, climo_data)) / total_days
    return mean, std


def fetch_wind_climo_components(req: FetchRequest, climo_source: str, month: int, day: int):
    return WIND_CLIMO_COMPONENT_FETCHERS[climo_source](month, day, req.level)


def fetch_weighted_wind_climo_components(req: FetchRequest, climo_source: str, selection: TimeSelection):
    unique_months = sorted(set(m for _, m in selection.year_months))
    if len(unique_months) == 1:
        return fetch_wind_climo_components(req, climo_source, unique_months[0], 15)
    day_weights = [cal.monthrange(2001, m)[1] for m in unique_months]
    total_days = sum(day_weights)
    comps = [fetch_wind_climo_components(req, climo_source, m, 15) for m in unique_months]
    mean_u = sum(w * cu for w, (cu, _) in zip(day_weights, comps)) / total_days
    mean_v = sum(w * cv for w, (_, cv) in zip(day_weights, comps)) / total_days
    return mean_u, mean_v


def fetch_obs(req: FetchRequest, selection: TimeSelection, grib_name: str):
    key = (selection.obs_kind, _variable_fetch_key(req.variable))
    return OBS_FETCHERS[key](req, selection, grib_name)


def fetch_wind(req: FetchRequest, selection: TimeSelection):
    return WIND_COMPONENT_FETCHERS[selection.obs_kind](req, selection)
