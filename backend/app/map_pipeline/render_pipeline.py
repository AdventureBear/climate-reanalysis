from __future__ import annotations

import logging
from typing import Protocol

from .map_diagnostics import log_scale_diag
from ..visualizer import create_map_product, describe_color_scale

log = logging.getLogger("pyre.api")


class RenderRequest(Protocol):
    variable: str
    level: int
    region: str
    color_step: int
    mode: str
    wind_unit: str
    pwat_unit: str
    wind_step: int
    wind_type: str


def render_map_product(
    req: RenderRequest,
    *,
    data_array,
    bounds: dict,
    var_label: str,
    date_label: str,
    scale_overrides: dict[str, float] | None,
    use_vector_wind_anomaly: bool,
    u_subset=None,
    v_subset=None,
):
    if req.mode == "anomaly" and use_vector_wind_anomaly:
        log.info("  colormap : positive sequential (vector anomaly magnitude)")
    else:
        log.info("  colormap : %s", "diverging (Blues/Reds)" if req.mode in ("anomaly", "normalized") else "fixed-anchor stepped")

    scale_diag = describe_color_scale(
        variable=req.variable,
        level=req.level,
        color_step=req.color_step,
        mode=req.mode,
        data_array=data_array,
        scale_overrides=scale_overrides,
        wind_unit=req.wind_unit,
        pwat_unit=req.pwat_unit,
    )
    log_scale_diag(scale_diag)

    return create_map_product(
        data_array=data_array,
        region_bounds=bounds,
        var_name=var_label,
        date_str=date_label,
        variable=req.variable,
        level=req.level,
        region=req.region,
        u_array=u_subset,
        v_array=v_subset,
        wind_step=req.wind_step,
        wind_type=req.wind_type,
        color_step=req.color_step,
        mode=req.mode,
        scale_overrides=scale_overrides,
        wind_unit=req.wind_unit,
        pwat_unit=req.pwat_unit,
    )
