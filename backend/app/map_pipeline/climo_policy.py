from __future__ import annotations

import logging
from typing import Protocol

from .time_selection import TimeSelection

log = logging.getLogger("pyre.api")

MONTHLY_IMPLEMENTED_CLIMO_SOURCES = {"monthly-pgb", "r2-monthly"}
MONTHLY_FALLBACK_CLIMO_SOURCE = "r2-monthly"
SUBMONTHLY_CLIMO_SOURCE = "r2-daily"


class ClimoRequest(Protocol):
    mode: str
    climo_source: str


def resolve_climo_source(req: ClimoRequest, selection: TimeSelection) -> str:
    if req.mode == "raw":
        return req.climo_source

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

    if req.climo_source != SUBMONTHLY_CLIMO_SOURCE:
        log.info(
            "CLIMO    overriding climo_source=%s → r2-daily"
            " (sub-monthly obs require day-of-year baseline; monthly means inflate σ)",
            req.climo_source,
        )
    return SUBMONTHLY_CLIMO_SOURCE
