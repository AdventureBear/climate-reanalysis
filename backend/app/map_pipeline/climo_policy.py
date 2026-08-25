from __future__ import annotations

import logging
from typing import Protocol

from ..config import R1_4XDAY_FIELDS, VARIABLES, supported_climo_sources
from .time_selection import TimeSelection

log = logging.getLogger("pyre.api")

MONTHLY_IMPLEMENTED_CLIMO_SOURCES = {"monthly-pgb", "r2-monthly"}
MONTHLY_FALLBACK_CLIMO_SOURCE = "r2-monthly"
SUBMONTHLY_CLIMO_SOURCE = "r2-daily"
PWAT_MOVING_DAILY_CLIMO_SOURCE = "r2-daily-15day"
# Single-hour products usually compare against the normal for THAT hour, not a
# daily mean (#72). PWAT is a variable-specific exception using the WPC-style
# R2 daily centered 15-day standardized-anomaly baseline.
HOURLY_CLIMO_SOURCE = "r1-4xdaily"


class ClimoRequest(Protocol):
    variable: str
    mode: str
    climo_source: str


def has_hourly_baseline(variable: str) -> bool:
    """Whether this variable has a per-synoptic-hour (R1 4×-daily) baseline.

    Single-level variables declare an `r1_4xday` spec; pressure-level fields
    are covered when their GRIB name appears in R1_4XDAY_FIELDS. Wind speed is
    derived from the u/v files.
    """
    cfg = VARIABLES.get(variable, {})
    if not cfg.get("climo_sources"):
        return False
    if cfg.get("r1_4xday"):
        return True
    if variable == "wind_speed":
        return "UGRD" in R1_4XDAY_FIELDS and "VGRD" in R1_4XDAY_FIELDS
    if variable == "rel_humidity":
        return "RH" in R1_4XDAY_FIELDS
    return cfg.get("grib_name") in R1_4XDAY_FIELDS


def is_single_hour_product(selection: TimeSelection) -> bool:
    """True for maps valid at one analysis hour — the ones a daily-mean
    baseline biases. Daily composites average 00/06/12/18z, so a daily-mean
    baseline is the correct like-for-like comparison for them."""
    return not selection.monthly_mode and not selection.is_daily_composite


def _clamp_to_variable(source: str, variable: str) -> str:
    # r1-4xdaily is chosen by cadence, not offered per variable; the caller has
    # already confirmed the variable has an hourly baseline.
    if source == HOURLY_CLIMO_SOURCE:
        return source
    """
    Substitute an equivalent-cadence source when the variable's registry does
    not support the resolved one (e.g. single-level fields have no monthly-pgb
    baseline; their monthly requests use r2-monthly instead).
    """
    supported = supported_climo_sources(variable)
    if source in supported:
        return source
    fallback = (
        MONTHLY_FALLBACK_CLIMO_SOURCE
        if source in MONTHLY_IMPLEMENTED_CLIMO_SOURCES
        else SUBMONTHLY_CLIMO_SOURCE
    )
    if fallback in supported and fallback != source:
        log.info(
            "CLIMO    %s not wired for variable %r → using %s",
            source, variable, fallback,
        )
        return fallback
    # Mode gating rejects variables with no sources; anything else surfaces
    # downstream as an explicit fetch error rather than being masked here.
    return source


def resolve_climo_source(req: ClimoRequest, selection: TimeSelection) -> str:
    if req.mode == "raw":
        return req.climo_source
    return _clamp_to_variable(_resolve_for_cadence(req, selection), req.variable)


def _resolve_for_cadence(req: ClimoRequest, selection: TimeSelection) -> str:
    if (
        req.variable == "precipitable_water"
        and is_single_hour_product(selection)
        and req.mode in {"climatology", "anomaly", "normalized"}
    ):
        log.info(
            "CLIMO    single-hour PWAT → r2-daily-15day"
            " (R2 daily centered 15-day mean/std; WPC-style standardized anomaly baseline)",
        )
        return PWAT_MOVING_DAILY_CLIMO_SOURCE

    if req.mode == "climatology":
        # Climatology maps always show a monthly-mean baseline, regardless of how
        # the request selected its month (legacy URLs pass a single date).
        if req.climo_source in MONTHLY_IMPLEMENTED_CLIMO_SOURCES:
            return req.climo_source
        return MONTHLY_FALLBACK_CLIMO_SOURCE

    if selection.monthly_mode:
        if req.climo_source in MONTHLY_IMPLEMENTED_CLIMO_SOURCES:
            return req.climo_source
        log.warning(
            "CLIMO    %s not implemented for monthly mode → falling back to %s",
            req.climo_source,
            MONTHLY_FALLBACK_CLIMO_SOURCE,
        )
        return MONTHLY_FALLBACK_CLIMO_SOURCE

    # Single-hour maps compare against that hour's normal; a daily mean would
    # leave the diurnal cycle inside the anomaly (#72).
    if is_single_hour_product(selection) and has_hourly_baseline(req.variable):
        log.info(
            "CLIMO    single-hour product → r1-4xdaily"
            " (per-synoptic-hour baseline; a daily mean would carry the diurnal cycle)",
        )
        return HOURLY_CLIMO_SOURCE

    if req.climo_source != SUBMONTHLY_CLIMO_SOURCE:
        log.info(
            "CLIMO    overriding climo_source=%s → r2-daily"
            " (sub-monthly obs require day-of-year baseline; monthly means inflate σ)",
            req.climo_source,
        )
    return SUBMONTHLY_CLIMO_SOURCE
