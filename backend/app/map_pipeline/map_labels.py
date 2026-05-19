from __future__ import annotations

import calendar as cal
from typing import Protocol

from ..config import VARIABLES, is_surface_or_named_level
from ..retrieval import CLIMO_END_YEAR, CLIMO_START_YEAR
from .time_selection import TimeSelection
from ..visualizer import display_unit


class LabelRequest(Protocol):
    date_mode: str
    hour: str
    mode: str
    variable: str
    level: int
    wind_unit: str
    pwat_unit: str


def map_date_label(
    req: LabelRequest,
    selection: TimeSelection,
    climo_source: str,
    use_vector_wind_anomaly: bool,
    obs_source: str,
    obs,
) -> str:
    month_abbr = cal.month_abbr[selection.obs_month]
    climo_period = f"{CLIMO_START_YEAR}–{CLIMO_END_YEAR}"
    climo_source_labels = {
        "r2-daily": "R2-daily",
        "r2-monthly": "R2-monthly",
        "monthly-pgb": "PGB-monthly",
    }
    obs_source_tag = f"  [{obs_source}]" if selection.monthly_mode and obs_source != "CORe-pgb" else ""
    mode_labels = {
        ("anomaly", False): "anomaly",
        ("anomaly", True): "anomaly",
        ("normalized", False): "normalized anomaly",
        ("normalized", True): "normalized anomaly",
    }

    def fmt(date_str: str) -> str:
        return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"

    def date_list_label() -> str:
        return ", ".join(fmt(date_str) for date_str in selection.date_list)

    def multi_date_label() -> str:
        if req.date_mode == "list":
            return date_list_label()
        return f"{fmt(selection.date_list[0])} – {fmt(selection.date_list[-1])}  ({len(selection.date_list)} dates)"

    def climo_ref() -> str:
        source = climo_source_labels.get(climo_source, climo_source)
        if selection.monthly_mode:
            return f"Baseline: {month_abbr} · {source} {climo_period}"
        if len(selection.date_list) > 1:
            if req.date_mode == "range":
                return f"Baseline: matching calendar days · {source} {climo_period}"
            return f"Baseline: listed calendar days · {source} {climo_period}"
        return f"Baseline: {month_abbr} {selection.obs_day} · {source} {climo_period}"

    def ym_label(ym: tuple[int, int]) -> str:
        return f"{cal.month_abbr[ym[1]]} {ym[0]}"

    if selection.monthly_mode:
        period = (
            ym_label(selection.year_months[0])
            if len(selection.year_months) == 1
            else f"{ym_label(selection.year_months[0])} – {ym_label(selection.year_months[-1])}  ({len(selection.year_months)} months)"
        )
        if req.mode in ("anomaly", "normalized"):
            mode_label = mode_labels[(req.mode, use_vector_wind_anomaly)]
            return f"Monthly {mode_label} · {period}{obs_source_tag}\n{climo_ref()}"
        return f"Monthly composite · {period}{obs_source_tag}"

    if req.mode == "climatology":
        return f"Climatology mean · {month_abbr}\nBaseline: {climo_period}"

    if req.mode in ("anomaly", "normalized"):
        mode_label = mode_labels[(req.mode, use_vector_wind_anomaly)]
        if selection.is_daily_composite:
            hours_label = "/".join(h + "z" for h in selection.daily_hours)
            if len(selection.date_list) == 1:
                return f"Daily {mode_label} · {hours_label} · {fmt(selection.date_list[0])}\n{climo_ref()}"
            return (
                f"Daily {mode_label} composite · {hours_label} · {multi_date_label()}\n"
                f"{climo_ref()}"
            )
        if selection.composite:
            return (
                f"{mode_label.capitalize()} composite · {req.hour}z · {multi_date_label()}\n"
                f"{climo_ref()}"
            )
        try:
            obs_time = str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
        except (KeyError, AttributeError):
            obs_time = f"{fmt(selection.date_list[0])} {req.hour}z"
        return f"{mode_label.capitalize()} · {obs_time}\n{climo_ref()}"

    if selection.is_daily_composite:
        hours_label = "/".join(h + "z" for h in selection.daily_hours)
        if len(selection.date_list) == 1:
            return f"Daily composite · {hours_label} · {fmt(selection.date_list[0])}"
        return (
            f"Daily composite · {hours_label} · {multi_date_label()}"
        )
    if selection.composite:
        return (
            f"Composite mean · {req.hour}z · {multi_date_label()}"
        )
    try:
        return str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
    except (KeyError, AttributeError):
        return f"{fmt(selection.date_list[0])} {req.hour}z"


def variable_label(req: LabelRequest, use_vector_wind_anomaly: bool) -> str:
    units = display_unit(req.variable, req.level, wind_unit=req.wind_unit, pwat_unit=req.pwat_unit)
    if is_surface_or_named_level(req.variable):
        return f"{VARIABLES[req.variable]['name']} ({units})"
    if use_vector_wind_anomaly:
        return f"Wind Vector Anomaly Magnitude ({units})  {req.level}mb"
    return f"{VARIABLES[req.variable]['name']} ({units})  {req.level}mb"
