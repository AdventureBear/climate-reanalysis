from __future__ import annotations

import logging
from typing import Protocol

from ..api_options import MODE_NAMES, VAR_NAMES
from ..config import VARIABLES, is_surface_or_named_level, variable_level_label
from .time_selection import TimeSelection, period_description

log = logging.getLogger("pyre.api")


class RequestLogContext(Protocol):
    variable: str
    level: int
    region: str
    mode: str
    hour: str
    scale_min: float | None
    scale_max: float | None


def log_request_banner(req: RequestLogContext, selection: TimeSelection, climo_source: str) -> None:
    log.info("══════════════════════════════════════════════════════════════")
    log.info("REQUEST")
    log.info("  variable    : %s", VAR_NAMES.get(req.variable, req.variable))
    if is_surface_or_named_level(req.variable):
        log.info("  stream      : %s", "CORe flx" if VARIABLES[req.variable].get("stream") == "flx" else "CORe pgb")
        log.info("  level       : %s", variable_level_label(req.variable, req.level))
    else:
        log.info("  level       : %d mb", req.level)
    log.info("  date/period : %s", period_description(selection, req.hour))
    log.info("  region      : %s", req.region)
    log.info("  map type    : %s", MODE_NAMES.get(req.mode, req.mode))
    if req.scale_min is not None or req.scale_max is not None:
        log.info(
            "  scale tweak : min=%s  max=%s",
            "default" if req.scale_min is None else f"{req.scale_min:g}",
            "default" if req.scale_max is None else f"{req.scale_max:g}",
        )
    if req.mode != "raw":
        log.info("  climo source: %s", climo_source)
    log.info("══════════════════════════════════════════════════════════════")


def obs_description(req: RequestLogContext, selection: TimeSelection) -> tuple[str, str]:
    var_name = VAR_NAMES.get(req.variable, req.variable)
    obs_source = "CORe flx" if VARIABLES[req.variable].get("stream") == "flx" else "CORe pgb"
    obs_method = "CORe GCS archive  |  surgical byte-range  |  idx → Range → cfgrib decode"
    descriptions = {
        "monthly": (
            f"Monthly mean {var_name}  |  {len(selection.year_months)} month(s)",
            (
                "CORe FTP pgb monthly archive  (surgical byte-range) → day-weighted mean"
                if len(selection.year_months) > 1
                else "CORe FTP pgb monthly archive  (surgical byte-range)"
            ),
        ),
        "daily": (
            f"{var_name}  |  {len(selection.date_list)} date(s) × {len(selection.daily_hours)} synoptic times",
            (
                f"{obs_source} GCS archive  |  surgical byte-range  |  "
                f"{len(selection.date_list) * len(selection.daily_hours)} fetches concurrent → mean"
            ),
        ),
        "composite": (
            f"{var_name}  |  {len(selection.date_list)} dates  {req.hour}z",
            f"{obs_source} GCS archive  |  surgical byte-range  |  {len(selection.date_list)} fetches concurrent → mean",
        ),
        "single": (
            f"{var_name}  |  {selection.date_list[0]}  {req.hour}z",
            obs_method,
        ),
    }
    return descriptions[selection.obs_kind]
