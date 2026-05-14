from __future__ import annotations

import logging

from ..api_options import preview

log = logging.getLogger("pyre.api")


def log_scale_diag(scale_diag: dict) -> None:
    log.info("  scale kind    : %s", scale_diag.get("scale_kind"))
    if scale_diag.get("unit"):
        log.info("  scale unit    : %s", scale_diag.get("unit"))
    if scale_diag.get("step") is not None:
        log.info("  color step    : %s", scale_diag.get("step"))
    if scale_diag.get("group"):
        log.info("  scale group   : %s", scale_diag.get("group"))
    if scale_diag.get("data_in_range_pct") is not None:
        log.info("  data in range : %.1f%%", scale_diag.get("data_in_range_pct"))
    if scale_diag.get("data_under_pct") is not None or scale_diag.get("data_over_pct") is not None:
        log.info(
            "  under / over  : %.1f%% / %.1f%%",
            scale_diag.get("data_under_pct", 0.0),
            scale_diag.get("data_over_pct", 0.0),
        )
    if scale_diag.get("data_min") is not None and scale_diag.get("data_max") is not None:
        log.info(
            "  data display  : [%.3f, %.3f] %s",
            scale_diag.get("data_min"),
            scale_diag.get("data_max"),
            scale_diag.get("unit", ""),
        )
    for key, label in (
        ("boundaries", "boundaries"),
        ("interval_mids", "interval mids"),
        ("anchor_values", "anchors"),
        ("key_breakpoints", "key breaks"),
    ):
        values = scale_diag.get(key)
        if values:
            log.info("  %-14s: %s", label, preview(values, digits=3))
    anchor_hex = scale_diag.get("anchor_hex")
    if anchor_hex:
        if len(anchor_hex) <= 10:
            log.info("  anchor colors : %s", anchor_hex)
        else:
            log.info("  anchor colors : %s ... %s", anchor_hex[:5], anchor_hex[-5:])
    sample_labels = scale_diag.get("sample_band_labels")
    sample_hex = scale_diag.get("sample_band_hex")
    if sample_labels and sample_hex:
        samples = "  ".join(f"{label}={hex_}" for label, hex_ in zip(sample_labels, sample_hex))
        log.info("  band colors   : %s", samples)
    pct = scale_diag.get("data_percentiles")
    if pct:
        log.info(
            "  percentiles   : p01=%.3f  p05=%.3f  p25=%.3f  p50=%.3f  p75=%.3f  p95=%.3f  p99=%.3f %s",
            pct["1"],
            pct["5"],
            pct["25"],
            pct["50"],
            pct["75"],
            pct["95"],
            pct["99"],
            scale_diag.get("unit", ""),
        )
    band_edges = scale_diag.get("scale_band_edges")
    band_pcts = scale_diag.get("scale_band_pcts")
    if band_edges and band_pcts:
        band_parts = [
            f"[{band_edges[i]:.1f},{band_edges[i + 1]:.1f})={band_pcts[i]:.1f}%"
            for i in range(len(band_pcts))
        ]
        log.info("  scale bands   : %s", "  ".join(band_parts))
