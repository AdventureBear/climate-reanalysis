from __future__ import annotations

import logging
import time
from typing import Protocol

from .fetch_plan import fetch_wind
from .pipeline_steps import select_region
from .time_selection import TimeSelection

log = logging.getLogger("pyre.api")


class WindOverlayRequest(Protocol):
    wind_step: int
    wind_overlay_mode: str
    mode: str
    level: int


def prepare_wind_overlay(
    req: WindOverlayRequest,
    selection: TimeSelection,
    bounds: dict,
    step: int,
    *,
    use_vector_wind_anomaly: bool,
    anomaly_u_subset=None,
    anomaly_v_subset=None,
    cached_u=None,
    cached_v=None,
):
    if req.wind_step <= 0 or req.mode == "climatology":
        return None, None, step

    step += 1
    log.info("")
    if (
        req.wind_overlay_mode == "anomaly"
        and use_vector_wind_anomaly
        and anomaly_u_subset is not None
        and anomaly_v_subset is not None
    ):
        log.info("STEP %d  Wind overlay  (reusing computed anomaly U+V)", step)
        log.info("  Meaning : vectors/barbs show U' and V' departures from climatology")
        log.info("STEP %d ✓  wind overlay ready  (anomaly vectors cached)", step)
        return anomaly_u_subset, anomaly_v_subset, step

    if cached_u is not None:
        log.info("STEP %d  Wind overlay  (reusing U+V from obs step — no additional fetch)", step)
        log.info("  Meaning : vectors/barbs show actual observed/composite wind")
        log.info("STEP %d ✓  wind overlay ready  (cached)", step)
        return select_region(cached_u, bounds), select_region(cached_v, bounds), step

    log.info("STEP %d  Fetch wind overlay  (U + V components @ %dmb)", step, req.level)
    log.info("  Purpose : vector arrows / barbs overlaid on scalar field")
    log.info("  Meaning : vectors/barbs show actual observed/composite wind")
    log.info("  Method  : same source/method as obs step  (U and V fetched with shared index)")
    t0 = time.perf_counter()
    u_raw, v_raw = fetch_wind(req, selection)
    log.info("STEP %d ✓  wind overlay ready  (%.1fs)", step, time.perf_counter() - t0)
    return select_region(u_raw, bounds), select_region(v_raw, bounds), step
