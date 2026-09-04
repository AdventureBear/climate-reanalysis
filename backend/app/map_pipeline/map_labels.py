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
    level: int | str | None
    wind_unit: str
    pwat_unit: str
    precip_unit: str
    precip_window: int
    temp_unit: str


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
        "r2-daily-15day": "R2-daily 15-day",
        "r2-monthly": "R2-monthly",
        # Names the dataset, not the file layout: this baseline is built from
        # CORe's own monthly means, the same dataset as the observations.
        "monthly-pgb": "CORe-monthly",
        # Per-synoptic-hour baseline (#72). A different reanalysis than the
        # daily/monthly baselines, so the title says so outright.
        "r1-4xdaily": "R1 4×-daily",
        "core-3hourly": "CORe 3-hourly ±5d",
    }
    obs_source_tag = f"  [{obs_source}]" if selection.monthly_mode and obs_source != "CORe-pgb" else ""
    mode_labels = {
        ("anomaly", False): "anomaly",
        ("anomaly", True): "vector anomaly",
        ("normalized", False): "normalized anomaly",
        ("normalized", True): "normalized vector anomaly",
    }

    def fmt(date_str: str) -> str:
        return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"

    def date_list_label() -> str:
        return ", ".join(fmt(date_str) for date_str in selection.date_list)

    def multi_date_label() -> str:
        if req.date_mode == "list":
            return date_list_label()
        return f"{fmt(selection.date_list[0])} – {fmt(selection.date_list[-1])}  ({len(selection.date_list)} dates)"

    def selection_months_label() -> str:
        seen: list[int] = []
        for _, m in selection.year_months:
            if m not in seen:
                seen.append(m)
        if len(seen) == 1:
            return cal.month_abbr[seen[0]]
        contiguous = all(seen[i + 1] == seen[i] % 12 + 1 for i in range(len(seen) - 1))
        if contiguous:
            return f"{cal.month_abbr[seen[0]]}–{cal.month_abbr[seen[-1]]}"
        return ", ".join(cal.month_abbr[m] for m in seen)

    def climo_ref() -> str:
        source = climo_source_labels.get(climo_source, climo_source)
        # The hourly baseline is specific to the analysis hour, so the label
        # names it — "May 4 18z", not just "May 4" (#72). Pairs and multi-hour
        # slices match each member's own hour, so the label says so instead.
        # Ranges/slices keep the baseline line terse (source + period only);
        # how per-member matching works is FAQ material, not title material.
        if selection.pairs_mode:
            return f"Baseline: {source} {climo_period}"
        hour_tag = ""
        if climo_source in {"r1-4xdaily", "core-3hourly"}:
            member_hours = {h for _, h in selection.date_hour_members}
            hour_tag = f" {req.hour}z" if req.hour and len(member_hours) <= 1 else ""
        if selection.monthly_mode:
            return f"Baseline: {selection_months_label()} · {source} {climo_period}"
        if len(selection.date_list) > 1:
            if req.date_mode == "range":
                return f"Baseline: matching calendar days{hour_tag} · {source} {climo_period}"
            return f"Baseline: listed calendar days{hour_tag} · {source} {climo_period}"
        return f"Baseline: {month_abbr} {selection.obs_day}{hour_tag} · {source} {climo_period}"

    def ym_label(ym: tuple[int, int]) -> str:
        return f"{cal.month_abbr[ym[1]]} {ym[0]}"

    if req.mode == "climatology":
        source = climo_source_labels.get(climo_source, climo_source)
        if climo_source == "r2-daily-15day":
            return f"Climatology mean · {month_abbr} {selection.obs_day}\nBaseline: {source} {climo_period}"
        return f"Climatology mean · {month_abbr}\nBaseline: {source} {climo_period}"

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

    def pairs_span_label() -> str:
        members = selection.date_hour_members
        first_d, first_h = members[0]
        last_d, last_h = members[-1]
        if selection.selection_mode == "list":
            n = len(members)
            if n <= 3:
                listed = ", ".join(f"{fmt(d)} {h}z" for d, h in members)
            else:
                listed = ", ".join(f"{fmt(d)} {h}z" for d, h in members[:2]) + f", +{n - 2} more"
            return f"Composite ({n} times): {listed}"
        return f"{fmt(first_d)} {first_h}z – {fmt(last_d)} {last_h}z  ({len(members)} 3-hr intervals)"

    if req.mode in ("anomaly", "normalized"):
        mode_label = mode_labels[(req.mode, use_vector_wind_anomaly)]
        if selection.pairs_mode:
            return f"3-hourly {mode_label} · {pairs_span_label()}\n{climo_ref()}"
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

    if selection.pairs_mode:
        return pairs_span_label()
    if selection.is_daily_composite:
        hours_label = "/".join(h + "z" for h in selection.daily_hours)
        if req.variable == "precip_total":
            if len(selection.date_list) == 1:
                return f"Daily total · {req.precip_window}-hour ending {hours_label} · {fmt(selection.date_list[0])}"
            return f"Daily total · {req.precip_window}-hour ending {hours_label} · {multi_date_label()}"
        if len(selection.date_list) == 1:
            return f"Daily composite · {hours_label} · {fmt(selection.date_list[0])}"
        return (
            f"Daily composite · {hours_label} · {multi_date_label()}"
        )
    if selection.composite:
        if req.variable == "precip_total":
            return (
                f"Total · {req.hour}z · {multi_date_label()}"
            )
        return (
            f"Composite mean · {req.hour}z · {multi_date_label()}"
        )
    try:
        return str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
    except (KeyError, AttributeError):
        return f"{fmt(selection.date_list[0])} {req.hour}z"


def variable_label(req: LabelRequest, use_vector_wind_anomaly: bool) -> str:
    if req.variable == "blank_map":
        return VARIABLES[req.variable]["name"]
    units = display_unit(
        req.variable, req.level, wind_unit=req.wind_unit, pwat_unit=req.pwat_unit,
        temp_unit=req.temp_unit, precip_unit=req.precip_unit,
    )
    if is_surface_or_named_level(req.variable):
        if req.variable == "precip_total":
            return f"{req.precip_window}-hour {VARIABLES[req.variable]['name']} ({units})"
        if req.variable.startswith("cloud_cover_"):
            return f"{VARIABLES[req.variable]['name']} (3-hour average) ({units})"
        if req.variable.startswith("radiation_") or req.variable == "olr":
            return f"{VARIABLES[req.variable]['name']} (3-hour average) ({units})"
        return f"{VARIABLES[req.variable]['name']} ({units})"
    if use_vector_wind_anomaly:
        if req.mode == "normalized":
            return f"Wind Vector Normalized Anomaly Magnitude (σ)  {req.level}mb"
        return f"Wind Vector Anomaly Magnitude ({units})  {req.level}mb"
    return f"{VARIABLES[req.variable]['name']} ({units})  {req.level}mb"
