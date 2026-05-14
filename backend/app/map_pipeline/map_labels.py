from __future__ import annotations

import calendar as cal
from typing import Protocol

from ..config import VARIABLES
from ..retrieval import CLIMO_END_YEAR, CLIMO_START_YEAR
from .time_selection import TimeSelection
from ..visualizer import display_unit


class LabelRequest(Protocol):
    hour: str
    mode: str
    variable: str
    level: int
    wind_unit: str


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
    climo_ref_lookup = {
        "r2-daily": f"vs {month_abbr} {selection.obs_day} R2-daily {climo_period}",
        "r2-monthly": f"vs {month_abbr} R2-monthly {climo_period}",
        "monthly-pgb": f"vs {month_abbr} PGB-monthly {climo_period}",
    }
    climo_ref = climo_ref_lookup[climo_source]
    obs_source_tag = f"  [{obs_source}]" if selection.monthly_mode and obs_source != "CORe-pgb" else ""
    mode_labels = {
        ("anomaly", False): "ANOMALY",
        ("anomaly", True): "VECTOR ANOMALY MAGNITUDE",
        ("normalized", False): "NORMALIZED ANOMALY",
        ("normalized", True): "NORMALIZED ANOMALY",
    }

    def fmt(date_str: str) -> str:
        return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"

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
            return f"MONTHLY {mode_label} · {period}{obs_source_tag}\n{climo_ref}"
        return f"MONTHLY COMPOSITE · {period}{obs_source_tag}"

    if req.mode == "climatology":
        return f"CLIMATOLOGY MEAN · {month_abbr} · {climo_period}"

    if req.mode in ("anomaly", "normalized"):
        mode_label = mode_labels[(req.mode, use_vector_wind_anomaly)]
        if selection.is_daily_composite:
            hours_label = "/".join(h + "z" for h in selection.daily_hours)
            if len(selection.date_list) == 1:
                return f"DAILY {mode_label} · {hours_label}  {climo_ref}\n{fmt(selection.date_list[0])}"
            return (
                f"DAILY {mode_label} · {hours_label}  {climo_ref}\n"
                f"{fmt(selection.date_list[0])} – {fmt(selection.date_list[-1])}  ({len(selection.date_list)} dates)"
            )
        if selection.composite:
            return (
                f"COMPOSITE {mode_label} · {req.hour}z  {climo_ref}\n"
                f"{fmt(selection.date_list[0])} – {fmt(selection.date_list[-1])}  ({len(selection.date_list)} dates)"
            )
        try:
            obs_time = str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
        except (KeyError, AttributeError):
            obs_time = f"{fmt(selection.date_list[0])} {req.hour}z"
        return f"{mode_label} · {obs_time}  {climo_ref}"

    if selection.is_daily_composite:
        hours_label = "/".join(h + "z" for h in selection.daily_hours)
        if len(selection.date_list) == 1:
            return f"DAILY COMPOSITE · {hours_label}\n{fmt(selection.date_list[0])}"
        return (
            f"DAILY COMPOSITE · {hours_label}\n"
            f"{fmt(selection.date_list[0])} – {fmt(selection.date_list[-1])}  ({len(selection.date_list)} dates)"
        )
    if selection.composite:
        return (
            f"COMPOSITE MEAN · {req.hour}z\n"
            f"{fmt(selection.date_list[0])} – {fmt(selection.date_list[-1])}  ({len(selection.date_list)} dates)"
        )
    try:
        return str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
    except (KeyError, AttributeError):
        return f"{fmt(selection.date_list[0])} {req.hour}z"


def variable_label(req: LabelRequest, use_vector_wind_anomaly: bool) -> str:
    units = display_unit(req.variable, req.level, wind_unit=req.wind_unit)
    if use_vector_wind_anomaly:
        return f"Wind Vector Anomaly Magnitude ({units})  {req.level}mb"
    if req.variable == "wind_speed" and req.mode == "anomaly":
        return f"Wind Speed Anomaly ({units})  {req.level}mb"
    return f"{VARIABLES[req.variable]['name']} ({units})  {req.level}mb"
