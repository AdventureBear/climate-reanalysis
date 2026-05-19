from __future__ import annotations

import calendar as cal
import logging
import time

from .api_options import CLIMO_DESC, VAR_NAMES, scale_overrides_from_query
from .config import REGIONS, VARIABLES
from .map_pipeline.climo_policy import resolve_climo_source
from .map_pipeline.fetch_plan import (
    fetch_climo,
    fetch_climo_weighted,
    fetch_daily_climo_for_selection,
    fetch_daily_wind_climo_components_for_selection,
    fetch_obs,
    fetch_weighted_wind_climo_components,
    fetch_wind,
    fetch_wind_climo_components,
)
from .map_pipeline.map_labels import map_date_label, variable_label
from .map_pipeline.pipeline_steps import (
    compute_normalized_anomaly,
    compute_vector_anomaly,
    is_vector_wind_anomaly,
    normalized_mask_threshold,
    select_region,
    wind_speed_from_components,
)
from .map_pipeline.request import MapRequest
from .map_pipeline.request_logging import log_request_banner, obs_description
from .map_pipeline.render_pipeline import render_map_product
from .map_pipeline.time_selection import parse_time_selection
from .map_pipeline.wind_overlay import prepare_wind_overlay

log = logging.getLogger("pyre.api")


def create_map_buffer(req: MapRequest):
    selection = parse_time_selection(req)
    climo_source = resolve_climo_source(req, selection)
    bounds = REGIONS[req.region]
    grib_name = VARIABLES[req.variable].get("grib_name", "")
    use_vector_wind_anomaly = is_vector_wind_anomaly(req)

    log_request_banner(req, selection, climo_source)

    step = 0
    scale_overrides = scale_overrides_from_query(
        req.variable,
        req.scale_min,
        req.scale_max,
        wind_unit=req.wind_unit,
    )

    climo_mean = climo_std = None
    climo_u_mean = climo_v_mean = None
    if req.mode != "raw":
        step += 1
        multi_month_climo = selection.monthly_mode and len(set(m for _, m in selection.year_months)) > 1
        multi_day_climo = (not selection.monthly_mode) and len(selection.date_list) > 1
        climo_what = (
            f"30-year mean + σ of {VAR_NAMES.get(req.variable, req.variable)}"
            f"  for {', '.join(cal.month_abbr[m] for m in sorted(set(mn for _, mn in selection.year_months)))}"
            if multi_month_climo
            else f"30-year mean + σ of {VAR_NAMES.get(req.variable, req.variable)}"
            f"  for {len(selection.date_list)} matching calendar days"
            if multi_day_climo
            else f"30-year mean + σ of {VAR_NAMES.get(req.variable, req.variable)}"
            f"  for {cal.month_abbr[selection.obs_month]}"
            + ("" if selection.monthly_mode else f" {selection.obs_day:02d}")
        )
        log.info("")
        log.info("STEP %d  Fetch climatology", step)
        log.info("  What    : %s  |  1991–2020  |  ddof=1 (sample σ)", climo_what)
        log.info("  Source  : %s", CLIMO_DESC.get(climo_source, climo_source))
        if multi_month_climo:
            log.info("  Note    : multiple calendar months → day-weighted mean of per-month climos")
        if multi_day_climo:
            log.info("  Note    : multiple dates → mean of matching calendar-day climos")

        t0 = time.perf_counter()
        if use_vector_wind_anomaly:
            if multi_month_climo:
                climo_u_mean, climo_v_mean = fetch_weighted_wind_climo_components(req, climo_source, selection)
            elif multi_day_climo:
                climo_u_mean, climo_v_mean = fetch_daily_wind_climo_components_for_selection(req, climo_source, selection)
            else:
                climo_u_mean, climo_v_mean = fetch_wind_climo_components(
                    req, climo_source, selection.obs_month, selection.obs_day
                )
        elif multi_month_climo:
            climo_mean, climo_std = fetch_climo_weighted(req, climo_source, selection, grib_name)
        elif multi_day_climo:
            climo_mean, climo_std = fetch_daily_climo_for_selection(req, climo_source, selection, grib_name)
        else:
            climo_mean, climo_std = fetch_climo(req, climo_source, selection.obs_month, selection.obs_day, grib_name)
        climo_elapsed = time.perf_counter() - t0

        log.info("STEP %d ✓  climatology ready  (%.1fs)", step, climo_elapsed)
        if use_vector_wind_anomaly:
            climo_u_mean = select_region(climo_u_mean, bounds)
            climo_v_mean = select_region(climo_v_mean, bounds)
            log.info("  climo grid  : %s", "×".join(str(s) for s in climo_u_mean.shape))
            log.info("  U mean      : [%.3g, %.3g] m/s  (region subset)", float(climo_u_mean.min()), float(climo_u_mean.max()))
            log.info("  V mean      : [%.3g, %.3g] m/s  (region subset)", float(climo_v_mean.min()), float(climo_v_mean.max()))
        else:
            climo_mean = select_region(climo_mean, bounds)
            climo_std = select_region(climo_std, bounds)
            log.info("  climo grid  : %s", "×".join(str(s) for s in climo_mean.shape))
            log.info(
                "  mean range  : [%.3g, %.3g] %s  (region subset)",
                float(climo_mean.min()),
                float(climo_mean.max()),
                VARIABLES[req.variable].get("units", ""),
            )
            log.info(
                "  σ range     : [%.3g, %.3g] %s  (region subset)",
                float(climo_std.min()),
                float(climo_std.max()),
                VARIABLES[req.variable].get("units", ""),
            )

    obs_source = "CORe-pgb"
    cached_u = cached_v = None
    obs_u_subset = obs_v_subset = None
    anomaly_u_subset = anomaly_v_subset = None

    if req.mode == "climatology":
        subset = climo_mean
        obs = None
    else:
        step += 1
        obs_what, obs_method = obs_description(req, selection)
        log.info("")
        if req.variable == "wind_speed" and (req.wind_step > 0 or use_vector_wind_anomaly):
            purpose = "wind speed + overlay" if req.wind_step > 0 else "wind vector anomaly"
            log.info("STEP %d  Fetch U + V components @ %dmb  (%s — single fetch)", step, req.level, purpose)
            log.info("  Method  : %s", obs_method)
            log.info("  Note    : U and V fetched together; speed = √(U²+V²); components reused downstream")
            t0 = time.perf_counter()
            cached_u, cached_v = fetch_wind(req, selection)
            obs_elapsed = time.perf_counter() - t0
            obs = wind_speed_from_components(cached_u, cached_v)
        else:
            log.info("STEP %d  Fetch observation data", step)
            log.info("  What    : %s", obs_what)
            log.info("  Method  : %s", obs_method)
            t0 = time.perf_counter()
            obs = fetch_obs(req, selection, grib_name)
            obs_elapsed = time.perf_counter() - t0

        obs_source = obs.attrs.get("_pyre_obs_source", obs_source)
        obs_subset = select_region(obs, bounds)
        if cached_u is not None and cached_v is not None:
            obs_u_subset = select_region(cached_u, bounds)
            obs_v_subset = select_region(cached_v, bounds)

        log.info("STEP %d ✓  obs ready  (%.1fs)  source=%s", step, obs_elapsed, obs_source)
        log.info("  obs grid    : %s", "×".join(str(s) for s in obs_subset.shape))
        log.info(
            "  obs range   : [%.3g, %.3g] %s  (region subset)",
            float(obs_subset.min()),
            float(obs_subset.max()),
            VARIABLES[req.variable].get("units", ""),
        )

        if req.mode in ("anomaly", "normalized"):
            step += 1
            log.info("")
            log.info("STEP %d  Regrid climatology to observation grid", step)
            log.info("  To      : %s  (obs grid, 0.25°)", "×".join(str(s) for s in obs_subset.shape))
            log.info("  Method  : bilinear interpolation  (xarray interp_like)")
            if use_vector_wind_anomaly:
                log.info("  From    : %s  (climo U/V grid, ~2.5°)", "×".join(str(s) for s in climo_u_mean.shape))
                climo_u_mean = climo_u_mean.interp_like(obs_u_subset)
                climo_v_mean = climo_v_mean.interp_like(obs_v_subset)
            else:
                log.info("  From    : %s  (climo grid, ~2.5°)", "×".join(str(s) for s in climo_mean.shape))
                climo_mean = climo_mean.interp_like(obs_subset)
                if climo_std is not None:
                    climo_std = climo_std.interp_like(obs_subset)
            log.info("STEP %d ✓  regrid complete", step)

        if req.mode == "anomaly":
            step += 1
            log.info("")
            if use_vector_wind_anomaly:
                log.info("STEP %d  Compute vector anomaly magnitude  =  sqrt((U−U_climo)^2 + (V−V_climo)^2)", step)
                anomaly_u_subset, anomaly_v_subset, subset = compute_vector_anomaly(
                    obs_u_subset,
                    obs_v_subset,
                    climo_u_mean,
                    climo_v_mean,
                    obs_subset,
                )
            else:
                log.info("STEP %d  Compute anomaly  =  obs − climo_mean", step)
                subset = obs_subset - climo_mean
            log.info("STEP %d ✓  anomaly computed", step)
            log.info("  obs range   : [%.3g, %.3g] %s", float(obs_subset.min()), float(obs_subset.max()), VARIABLES[req.variable].get("units", ""))
            if use_vector_wind_anomaly:
                log.info("  climo U     : [%.3g, %.3g] m/s  (after regrid)", float(climo_u_mean.min()), float(climo_u_mean.max()))
                log.info("  climo V     : [%.3g, %.3g] m/s  (after regrid)", float(climo_v_mean.min()), float(climo_v_mean.max()))
                log.info("  anomaly |V'|: [%.3g, %.3g] %s", float(subset.min()), float(subset.max()), VARIABLES[req.variable].get("units", ""))
            else:
                log.info("  climo_mean  : [%.3g, %.3g] %s  (after regrid)", float(climo_mean.min()), float(climo_mean.max()), VARIABLES[req.variable].get("units", ""))
                log.info("  anomaly     : [%.3g, %.3g] %s", float(subset.min()), float(subset.max()), VARIABLES[req.variable].get("units", ""))

        elif req.mode == "normalized":
            step += 1
            abs_threshold = normalized_mask_threshold(req.variable, req.level)
            log.info("")
            log.info("STEP %d  Compute normalized anomaly  =  (obs − climo_mean) / climo_σ", step)
            log.info("  Note    : climo_σ < 1e-6 → NaN  (no inter-annual variability, undefined)")
            if abs_threshold is not None:
                log.info("  Mask    : obs < %.3g %s → NaN  (below threshold: physically insignificant signal)", abs_threshold, VARIABLES[req.variable].get("units", ""))
            subset, n_masked, n_before = compute_normalized_anomaly(obs_subset, climo_mean, climo_std, abs_threshold)
            if abs_threshold is not None:
                log.info("  Masked  : %d grid points below threshold (%.1f%% of domain)", n_masked, 100.0 * n_masked / max(n_before, 1))
            log.info("STEP %d ✓  normalized anomaly computed", step)
            log.info("  obs range   : [%.3g, %.3g] %s", float(obs_subset.min()), float(obs_subset.max()), VARIABLES[req.variable].get("units", ""))
            log.info("  climo_mean  : [%.3g, %.3g] %s  (after regrid)", float(climo_mean.min()), float(climo_mean.max()), VARIABLES[req.variable].get("units", ""))
            log.info("  climo_σ     : [%.3g, %.3g] %s  (after regrid)", float(climo_std.min()), float(climo_std.max()), VARIABLES[req.variable].get("units", ""))
            log.info("  result σ    : [%.3g, %.3g]  (values outside ±6 are scientifically extreme)", float(subset.min(skipna=True)), float(subset.max(skipna=True)))
        else:
            subset = obs_subset

    date_str = map_date_label(req, selection, climo_source, use_vector_wind_anomaly, obs_source, obs)

    u_subset, v_subset, step = prepare_wind_overlay(
        req,
        selection,
        bounds,
        step,
        use_vector_wind_anomaly=use_vector_wind_anomaly,
        anomaly_u_subset=anomaly_u_subset,
        anomaly_v_subset=anomaly_v_subset,
        cached_u=cached_u,
        cached_v=cached_v,
    )
    var_label = variable_label(req, use_vector_wind_anomaly)
    if u_subset is not None and v_subset is not None:
        overlay_label = "Wind Anomaly" if req.wind_overlay_mode == "anomaly" else "Wind"
        overlay_glyph = "Barbs" if req.wind_type == "barbs" else "Vectors"
        var_label = f"{var_label}, {overlay_label} {overlay_glyph} ({req.wind_unit})"

    step += 1
    log.info("")
    log.info("STEP %d  Render map", step)
    if VARIABLES[req.variable].get("stream") == "flx":
        log.info("  variable : %s  (CORe flx)", VAR_NAMES.get(req.variable, req.variable))
    else:
        log.info("  variable : %s  %dmb", VAR_NAMES.get(req.variable, req.variable), req.level)
    projection_label = {
        "CONUS": "Albers Equal-Area",
        "Northern Hemisphere": "North Polar Stereographic",
        "Southern Hemisphere": "South Polar Stereographic",
    }.get(req.region, "PlateCarree")
    log.info("  region   : %s  (projection: %s)", req.region, projection_label)
    buf = render_map_product(
        req,
        data_array=subset,
        bounds=bounds,
        var_label=var_label,
        date_label=date_str,
        scale_overrides=scale_overrides,
        use_vector_wind_anomaly=use_vector_wind_anomaly,
        u_subset=u_subset,
        v_subset=v_subset,
    )

    log.info("STEP %d ✓  render complete → streaming PNG", step)
    log.info("══════════════════════════════════════════════════════════════")
    return buf
