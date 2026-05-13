import calendar as cal
import logging
import time
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import PRESSURE_LEVELS, REGIONS, VARIABLES
from .retrieval import (
    CLIMO_END_YEAR, CLIMO_START_YEAR,
    VALID_HOURS,
    fetch_field, fetch_relative_humidity, fetch_wind_components, fetch_wind_speed,
    fetch_field_composite, fetch_relative_humidity_composite,
    fetch_wind_components_composite, fetch_wind_speed_composite,
    fetch_field_daily_composite, fetch_relative_humidity_daily_composite,
    fetch_wind_components_daily_composite, fetch_wind_speed_daily_composite,
    fetch_monthly_field_composite, fetch_monthly_relative_humidity_composite,
    fetch_monthly_wind_speed_composite, fetch_monthly_wind_components_composite,
    get_climatology_field, get_climatology_relative_humidity, get_climatology_wind_speed,
)
from .climo_r2 import (
    get_r2_daily_climo_field,
    get_r2_daily_climo_relative_humidity,
    get_r2_daily_climo_wind_components,
    get_r2_daily_climo_wind_speed,
    get_r2_monthly_climo_field,
    get_r2_monthly_climo_relative_humidity,
    get_r2_monthly_climo_wind_components,
    get_r2_monthly_climo_wind_speed,
)
from .visualizer import create_map_product, describe_color_scale, display_unit

log = logging.getLogger("pyre.api")

app = FastAPI(title="PyRe Climate Reanalysis API")

cors_origins = os.getenv("CORS_ORIGINS", "")

allowed_origins = [
    origin.strip()
    for origin in cors_origins.split(",")
    if origin.strip()
]

print("RAW:", os.getenv("CORS_ORIGINS"))
print("Split Allowed origins", allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_MODES = ("raw", "climatology", "anomaly", "normalized")
VALID_CLIMO_SOURCES = ("monthly-pgb", "r2-monthly", "r2-daily", "cfsr-daily")
VALID_WIND_ANOMALY_STYLES = ("speed_diff", "vector_mag")
VALID_WIND_UNITS = ("kt", "m/s")


def _preview(values, digits: int = 3, n: int = 6) -> str:
    values = list(values)
    if not values:
        return "[]"
    if len(values) <= n * 2:
        return "[" + ", ".join(f"{v:.{digits}f}" for v in values) + "]"
    head = ", ".join(f"{v:.{digits}f}" for v in values[:n])
    tail = ", ".join(f"{v:.{digits}f}" for v in values[-n:])
    return f"[{head}, ..., {tail}]"


@app.get("/")
def root():
    return {
        "variables": list(VARIABLES.keys()),
        "levels": PRESSURE_LEVELS,
        "regions": list(REGIONS.keys()),
        "valid_hours": VALID_HOURS,
        "modes": list(VALID_MODES),
    }


def _scale_overrides_from_query(
    variable: str,
    scale_min: float | None,
    scale_max: float | None,
    wind_unit: str = "kt",
) -> dict[str, float] | None:
    if variable != "wind_speed":
        return None
    if scale_min is None and scale_max is None:
        return None
    unit_factor = 1.0 if wind_unit == "kt" else 1.0 / 0.51444
    overrides: dict[str, float] = {}
    if scale_min is not None:
        overrides["domain_min"] = float(scale_min) * unit_factor
    if scale_max is not None:
        overrides["domain_max"] = float(scale_max) * unit_factor
    return overrides


@app.get("/api/scale-meta")
def get_scale_meta(
    variable: str = "wind_speed",
    level: int = 850,
    color_step: int = 1,
    mode: str = "raw",
    scale_min: float | None = None,
    scale_max: float | None = None,
    wind_anomaly_style: str = "speed_diff",
    wind_unit: str = "kt",
):
    if variable not in VARIABLES:
        raise HTTPException(status_code=422, detail=f"variable must be one of {list(VARIABLES.keys())}")
    if level not in PRESSURE_LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {PRESSURE_LEVELS}")
    if mode not in VALID_MODES:
        raise HTTPException(status_code=422, detail=f"mode must be one of {list(VALID_MODES)}")
    if color_step < 1:
        raise HTTPException(status_code=422, detail="color_step must be at least 1")
    if wind_anomaly_style not in VALID_WIND_ANOMALY_STYLES:
        raise HTTPException(status_code=422, detail=f"wind_anomaly_style must be one of {list(VALID_WIND_ANOMALY_STYLES)}")
    if wind_unit not in VALID_WIND_UNITS:
        raise HTTPException(status_code=422, detail=f"wind_unit must be one of {list(VALID_WIND_UNITS)}")
    if scale_min is not None and scale_max is not None and scale_min >= scale_max:
        raise HTTPException(status_code=422, detail="scale_min must be less than scale_max")

    return describe_color_scale(
        variable=variable,
        level=level,
        color_step=color_step,
        mode=mode,
        scale_overrides=_scale_overrides_from_query(variable, scale_min, scale_max, wind_unit=wind_unit),
        wind_anomaly_style=wind_anomaly_style,
        wind_unit=wind_unit,
    )


@app.get("/api/map")
async def get_map(
    date: str = "",
    dates: str = "",
    months: str = "",   # comma-separated YYYYMM — uses monthly mean archive directly
    hour: str = "00",   # single synoptic time for 6-hourly mode
    hours: str = "",    # comma-separated list for daily composite (e.g. "00,06,12,18")
    variable: str = "wind_speed",
    level: int = 850,
    region: str = "CONUS",
    wind_step: int = 0,
    wind_type: str = "vectors",
    color_step: int = 1,
    scale_min: float | None = None,
    scale_max: float | None = None,
    mode: str = "raw",
    climo_source: str = "monthly-pgb",
    wind_anomaly_style: str = "speed_diff",
    wind_unit: str = "kt",
):
    # Resolve input — three mutually exclusive date modes:
    #   months  → monthly mean archive (YYYYMM list)
    #   dates   → daily composite from 6-hourly archive (YYYYMMDD list)
    #   date    → single 6-hourly snapshot
    monthly_mode = bool(months)
    if months:
        year_months = [(int(s[:4]), int(s[4:6])) for s in months.split(",") if s.strip()]
        if not year_months:
            raise HTTPException(status_code=422, detail="'months' contained no valid YYYYMM entries")
        # For climatology extraction, use the first month; day is irrelevant for monthly climo.
        obs_month = year_months[0][1]
        obs_day   = 15   # mid-month placeholder (monthly climo only uses obs_month)
        date_list = []   # unused in monthly path
    elif dates:
        date_list = [d.strip() for d in dates.split(",") if d.strip()]
        obs_month = int(date_list[0][4:6])
        obs_day   = int(date_list[0][6:8])
        year_months = []
    elif date:
        date_list = [date]
        obs_month = int(date_list[0][4:6])
        obs_day   = int(date_list[0][6:8])
        year_months = []
    else:
        raise HTTPException(status_code=422, detail="provide 'date', 'dates', or 'months'")

    # R2 daily climatology has no Feb 29 entry (see climo_r2.py). Map it to Feb 28.
    if obs_month == 2 and obs_day == 29:
        obs_day = 28

    # daily_hours: non-empty when the frontend requests a multi-synoptic-time daily composite.
    daily_hours = [h.strip() for h in hours.split(",") if h.strip()] if hours else []
    is_daily_composite = bool(daily_hours and not monthly_mode)

    if not monthly_mode and hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"hour must be one of {VALID_HOURS}")
    if variable not in VARIABLES:
        raise HTTPException(status_code=422, detail=f"variable must be one of {list(VARIABLES.keys())}")
    if level not in PRESSURE_LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {PRESSURE_LEVELS}")
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"region must be one of {list(REGIONS.keys())}")
    if mode not in VALID_MODES:
        raise HTTPException(status_code=422, detail=f"mode must be one of {list(VALID_MODES)}")
    if climo_source not in VALID_CLIMO_SOURCES:
        raise HTTPException(status_code=422, detail=f"climo_source must be one of {list(VALID_CLIMO_SOURCES)}")
    if wind_anomaly_style not in VALID_WIND_ANOMALY_STYLES:
        raise HTTPException(status_code=422, detail=f"wind_anomaly_style must be one of {list(VALID_WIND_ANOMALY_STYLES)}")
    if wind_unit not in VALID_WIND_UNITS:
        raise HTTPException(status_code=422, detail=f"wind_unit must be one of {list(VALID_WIND_UNITS)}")
    if scale_min is not None and scale_max is not None and scale_min >= scale_max:
        raise HTTPException(status_code=422, detail="scale_min must be less than scale_max")

    # ── Resolve climatology source ────────────────────────────────────────────
    # The user's preference is a hint. Rules:
    #   Sub-monthly (6-hourly/daily): day-of-year baseline is scientifically
    #     required — monthly means produce inflated σ. Always r2-daily.
    #   Monthly: respect user preference; fall back through the hierarchy when
    #     a source is not yet implemented or not available.
    #
    # Hierarchy for monthly mode:
    #   monthly-pgb  (CORe pgb 2.5° pre-computed monthly means, 1950–2025)
    #   r2-monthly   (NCEP/DOE R2 monthly, 1979–2020)  ← default
    #   r2-daily     (last resort: day-of-year mean, less ideal for monthly obs)
    _MONTHLY_IMPLEMENTED = {"monthly-pgb", "r2-monthly"}
    if mode != "raw":
        if monthly_mode:
            if climo_source not in _MONTHLY_IMPLEMENTED:
                fallback = "r2-monthly"
                log.warning(
                    "CLIMO    %s not implemented for monthly mode → falling back to %s",
                    climo_source, fallback,
                )
                climo_source = fallback
        else:
            # 6-hourly or daily — day-of-year baseline is required
            if climo_source != "r2-daily":
                log.info(
                    "CLIMO    overriding climo_source=%s → r2-daily"
                    " (sub-monthly obs require day-of-year baseline; monthly means inflate σ)",
                    climo_source,
                )
                climo_source = "r2-daily"

    composite = len(date_list) > 1
    bounds    = REGIONS[region]
    grib_name = VARIABLES[variable].get("grib_name", "")

    def _sel(da):
        return da.sel(
            latitude=slice(bounds["lat"][1], bounds["lat"][0]),
            longitude=slice(bounds["lon"][0], bounds["lon"][1]),
        )

    def _fetch_climo(month: int, day: int):
        if climo_source == "r2-daily":
            if variable == "wind_speed":
                return get_r2_daily_climo_wind_speed(month, day, level)
            if variable == "rel_humidity":
                return get_r2_daily_climo_relative_humidity(month, day, level)
            return get_r2_daily_climo_field(month, day, grib_name, level)
        if climo_source == "r2-monthly":
            if variable == "wind_speed":
                return get_r2_monthly_climo_wind_speed(month, level)
            if variable == "rel_humidity":
                return get_r2_monthly_climo_relative_humidity(month, level)
            return get_r2_monthly_climo_field(month, grib_name, level)
        # Default: monthly-pgb
        if variable == "wind_speed":
            return get_climatology_wind_speed(month, level)
        if variable == "rel_humidity":
            return get_climatology_relative_humidity(month, level)
        return get_climatology_field(month, grib_name, level)

    def _fetch_climo_weighted(year_months_list: list[tuple[int, int]]):
        """Day-weighted mean of per-month climatologies — correct for multi-month composites."""
        unique_months = sorted(set(m for _, m in year_months_list))
        if len(unique_months) == 1:
            return _fetch_climo(unique_months[0], 15)
        day_weights = [cal.monthrange(2001, m)[1] for m in unique_months]  # non-leap ref year
        total_days = sum(day_weights)
        climo_data = [_fetch_climo(m, 15) for m in unique_months]
        mean = sum(w * cm for w, (cm, _) in zip(day_weights, climo_data)) / total_days
        std  = sum(w * cs for w, (_, cs) in zip(day_weights, climo_data)) / total_days
        return mean, std

    def _fetch_obs():
        if monthly_mode:
            if variable == "wind_speed":
                return fetch_monthly_wind_speed_composite(year_months, level)
            if variable == "rel_humidity":
                return fetch_monthly_relative_humidity_composite(year_months, level)
            return fetch_monthly_field_composite(year_months, grib_name, level)
        if is_daily_composite:
            if variable == "wind_speed":
                return fetch_wind_speed_daily_composite(date_list, daily_hours, level)
            if variable == "rel_humidity":
                return fetch_relative_humidity_daily_composite(date_list, daily_hours, level)
            return fetch_field_daily_composite(date_list, daily_hours, grib_name, level)
        if composite:
            if variable == "wind_speed":
                return fetch_wind_speed_composite(date_list, hour, level)
            if variable == "rel_humidity":
                return fetch_relative_humidity_composite(date_list, hour, level)
            return fetch_field_composite(date_list, hour, grib_name, level)
        if variable == "wind_speed":
            return fetch_wind_speed(date_list[0], hour, level)
        if variable == "rel_humidity":
            return fetch_relative_humidity(date_list[0], hour, level)
        return fetch_field(date_list[0], hour, grib_name, level)

    def _fetch_wind():
        if monthly_mode:
            return fetch_monthly_wind_components_composite(year_months, level)
        if is_daily_composite:
            return fetch_wind_components_daily_composite(date_list, daily_hours, level)
        if composite:
            return fetch_wind_components_composite(date_list, hour, level)
        return fetch_wind_components(date_list[0], hour, level)

    # ── Narrative logging helpers ────────────────────────────────────────────
    _VAR_NAMES = {
        "wind_speed":   "Wind Speed",
        "temp":         "Temperature",
        "height":       "Geopotential Height",
        "rel_humidity": "Relative Humidity  (derived: SPFH + TMP → Bolton formula)",
        "humidity":     "Specific Humidity",
    }
    _MODE_NAMES = {
        "raw":         "Raw composite",
        "climatology": "Climatology mean only  (no obs fetched)",
        "anomaly":     "Anomaly  =  obs − climo_mean",
        "normalized":  "Normalized anomaly  =  (obs − climo_mean) / climo_σ",
    }
    _CLIMO_DESC = {
        "r2-daily":    "NCEP/DOE Reanalysis 2  |  PSL THREDDS OPeNDAP  |  30 concurrent year-file fetches  |  1991–2020  |  2.5° grid",
        "r2-monthly":  "NCEP/DOE Reanalysis 2  |  PSL THREDDS OPeNDAP  |  single strided request (30 monthly slices)  |  1991–2020  |  2.5° grid",
        "monthly-pgb": "CORe pgb monthly means  |  FTP surgical byte-range  |  1991–2020  |  0.25° grid",
    }

    if monthly_mode:
        if len(year_months) == 1:
            _period_desc = f"{cal.month_abbr[year_months[0][1]]} {year_months[0][0]}  (single month)"
        else:
            _period_desc = (
                f"{cal.month_abbr[year_months[0][1]]} {year_months[0][0]} → "
                f"{cal.month_abbr[year_months[-1][1]]} {year_months[-1][0]}"
                f"  ({len(year_months)} months, day-weighted mean)"
            )
    elif is_daily_composite:
        _period_desc = (
            f"{date_list[0][:4]}-{date_list[0][4:6]}-{date_list[0][6:]} → "
            f"{date_list[-1][:4]}-{date_list[-1][4:6]}-{date_list[-1][6:]}"
            f"  ({len(date_list)} dates × {len(daily_hours)} synoptic times = {len(date_list)*len(daily_hours)} fetches)"
        ) if len(date_list) > 1 else (
            f"{date_list[0][:4]}-{date_list[0][4:6]}-{date_list[0][6:]}"
            f"  (1 date × {len(daily_hours)} synoptic times = {len(daily_hours)} fetches)"
        )
    elif composite:
        _period_desc = (
            f"{date_list[0][:4]}-{date_list[0][4:6]}-{date_list[0][6:]} → "
            f"{date_list[-1][:4]}-{date_list[-1][4:6]}-{date_list[-1][6:]}"
            f"  ({len(date_list)} dates  {hour}z each)"
        )
    else:
        _period_desc = f"{date_list[0][:4]}-{date_list[0][4:6]}-{date_list[0][6:]}  {hour}z  (single snapshot)"

    log.info("══════════════════════════════════════════════════════════════")
    log.info("REQUEST")
    log.info("  variable    : %s", _VAR_NAMES.get(variable, variable))
    log.info("  level       : %d mb", level)
    log.info("  date/period : %s", _period_desc)
    log.info("  region      : %s", region)
    log.info("  map type    : %s", _MODE_NAMES.get(mode, mode))
    if scale_min is not None or scale_max is not None:
        log.info("  scale tweak : min=%s  max=%s",
                 "default" if scale_min is None else f"{scale_min:g}",
                 "default" if scale_max is None else f"{scale_max:g}")
    if mode != "raw":
        log.info("  climo source: %s", climo_source)
    if variable == "wind_speed" and mode == "anomaly":
        log.info("  anomaly type: %s", wind_anomaly_style)
    log.info("══════════════════════════════════════════════════════════════")

    try:
        step = 0
        scale_overrides = _scale_overrides_from_query(variable, scale_min, scale_max, wind_unit=wind_unit)
        use_vector_wind_anomaly = (
            variable == "wind_speed" and mode == "anomaly" and wind_anomaly_style == "vector_mag"
        )

        # ── Climatology (mean + std) ─────────────────────────────────────────
        climo_mean = climo_std = None
        climo_u_mean = climo_v_mean = None
        if mode != "raw":
            step += 1
            _multi_month_climo = monthly_mode and len(set(m for _, m in year_months)) > 1
            _climo_what = (
                f"30-year mean + σ of {_VAR_NAMES.get(variable, variable)}"
                f"  for {', '.join(cal.month_abbr[m] for m in sorted(set(mn for _, mn in year_months)))}"
                if _multi_month_climo else
                f"30-year mean + σ of {_VAR_NAMES.get(variable, variable)}"
                f"  for {cal.month_abbr[obs_month]}"
                + ("" if monthly_mode else f" {obs_day:02d}")
            )
            log.info("")
            log.info("STEP %d  Fetch climatology", step)
            log.info("  What    : %s  |  1991–2020  |  ddof=1 (sample σ)", _climo_what)
            log.info("  Source  : %s", _CLIMO_DESC.get(climo_source, climo_source))
            if _multi_month_climo:
                log.info("  Note    : multiple calendar months → day-weighted mean of per-month climos")

            def _fetch_wind_climo_components(month: int, day: int):
                if climo_source == "r2-daily":
                    return get_r2_daily_climo_wind_components(month, day, level)
                if climo_source == "r2-monthly":
                    return get_r2_monthly_climo_wind_components(month, level)
                return (
                    get_climatology_field(month, "UGRD", level)[0],
                    get_climatology_field(month, "VGRD", level)[0],
                )

            def _fetch_weighted_wind_climo_components(year_months_list: list[tuple[int, int]]):
                unique_months = sorted(set(m for _, m in year_months_list))
                if len(unique_months) == 1:
                    return _fetch_wind_climo_components(unique_months[0], 15)
                day_weights = [cal.monthrange(2001, m)[1] for m in unique_months]
                total_days = sum(day_weights)
                comps = [_fetch_wind_climo_components(m, 15) for m in unique_months]
                mean_u = sum(w * cu for w, (cu, _) in zip(day_weights, comps)) / total_days
                mean_v = sum(w * cv for w, (_, cv) in zip(day_weights, comps)) / total_days
                return mean_u, mean_v

            t0 = time.perf_counter()
            if use_vector_wind_anomaly:
                if _multi_month_climo:
                    climo_u_mean, climo_v_mean = _fetch_weighted_wind_climo_components(year_months)
                else:
                    climo_u_mean, climo_v_mean = _fetch_wind_climo_components(obs_month, obs_day)
            elif _multi_month_climo:
                climo_mean, climo_std = _fetch_climo_weighted(year_months)
            else:
                climo_mean, climo_std = _fetch_climo(obs_month, obs_day)
            _climo_elapsed = time.perf_counter() - t0

            log.info("STEP %d ✓  climatology ready  (%.1fs)", step, _climo_elapsed)
            if use_vector_wind_anomaly:
                climo_u_sel = _sel(climo_u_mean)
                climo_v_sel = _sel(climo_v_mean)
                log.info("  climo grid  : %s", "×".join(str(s) for s in climo_u_sel.shape))
                log.info("  U mean      : [%.3g, %.3g] m/s  (region subset)",
                         float(climo_u_sel.min()), float(climo_u_sel.max()))
                log.info("  V mean      : [%.3g, %.3g] m/s  (region subset)",
                         float(climo_v_sel.min()), float(climo_v_sel.max()))
                climo_u_mean = climo_u_sel
                climo_v_mean = climo_v_sel
            else:
                climo_mean_sel = _sel(climo_mean)
                climo_std_sel  = _sel(climo_std)
                log.info("  climo grid  : %s", "×".join(str(s) for s in climo_mean_sel.shape))
                log.info("  mean range  : [%.3g, %.3g] %s  (region subset)",
                         float(climo_mean_sel.min()), float(climo_mean_sel.max()),
                         VARIABLES[variable].get("units", ""))
                log.info("  σ range     : [%.3g, %.3g] %s  (region subset)",
                         float(climo_std_sel.min()), float(climo_std_sel.max()),
                         VARIABLES[variable].get("units", ""))
                climo_mean = climo_mean_sel
                climo_std  = climo_std_sel

        # ── Observation data (skipped for pure climatology maps) ─────────────
        obs_source = "CORe-pgb"
        _cached_u = _cached_v = None   # set when wind_speed obs and overlay share one fetch
        obs_u_subset = obs_v_subset = None
        anomaly_u_subset = anomaly_v_subset = None

        if mode == "climatology":
            subset = climo_mean
        else:
            step += 1

            # Build method description (used in logging for both fetch paths).
            if monthly_mode:
                _obs_what = f"Monthly mean {_VAR_NAMES.get(variable, variable)}  |  {len(year_months)} month(s)"
                _obs_method = (
                    "CORe FTP pgb monthly archive  (surgical byte-range) → day-weighted mean"
                    if len(year_months) > 1 else
                    "CORe FTP pgb monthly archive  (surgical byte-range)"
                )
            elif is_daily_composite:
                _obs_what = (
                    f"{_VAR_NAMES.get(variable, variable)}  |  "
                    f"{len(date_list)} date(s) × {len(daily_hours)} synoptic times"
                )
                _obs_method = (
                    f"CORe GCS archive  |  surgical byte-range  |  "
                    f"{len(date_list)*len(daily_hours)} fetches concurrent → mean"
                )
            elif composite:
                _obs_what = f"{_VAR_NAMES.get(variable, variable)}  |  {len(date_list)} dates  {hour}z"
                _obs_method = (
                    f"CORe GCS archive  |  surgical byte-range  |  "
                    f"{len(date_list)} fetches concurrent → mean"
                )
            else:
                _obs_what = f"{_VAR_NAMES.get(variable, variable)}  |  {date_list[0]}  {hour}z"
                _obs_method = "CORe GCS archive  |  surgical byte-range  (idx → Range → cfgrib decode)"

            log.info("")
            if variable == "wind_speed" and (wind_step > 0 or use_vector_wind_anomaly):
                # Combined fetch: U+V once for both wind speed (obs) and the overlay.
                # Avoids fetching the same files twice when wind_speed is the mapped variable.
                purpose = "wind speed + overlay" if wind_step > 0 else "wind vector anomaly"
                log.info("STEP %d  Fetch U + V components @ %dmb  (%s — single fetch)", step, level, purpose)
                log.info("  Method  : %s", _obs_method)
                log.info("  Note    : U and V fetched together; speed = √(U²+V²); components reused downstream")
                t0 = time.perf_counter()
                _cached_u, _cached_v = _fetch_wind()
                _obs_elapsed = time.perf_counter() - t0
                obs = (_cached_u ** 2 + _cached_v ** 2) ** 0.5
                obs.attrs.update({"units": "m/s", "long_name": "Wind Speed"})
                obs.attrs["_pyre_obs_source"] = _cached_u.attrs.get("_pyre_obs_source", "CORe-pgb")
            else:
                log.info("STEP %d  Fetch observation data", step)
                log.info("  What    : %s", _obs_what)
                log.info("  Method  : %s", _obs_method)
                t0 = time.perf_counter()
                obs = _fetch_obs()
                _obs_elapsed = time.perf_counter() - t0

            obs_source = obs.attrs.get("_pyre_obs_source", obs_source)
            obs_subset = _sel(obs)
            if _cached_u is not None and _cached_v is not None:
                obs_u_subset = _sel(_cached_u)
                obs_v_subset = _sel(_cached_v)

            log.info("STEP %d ✓  obs ready  (%.1fs)  source=%s", step, _obs_elapsed, obs_source)
            log.info("  obs grid    : %s", "×".join(str(s) for s in obs_subset.shape))
            log.info("  obs range   : [%.3g, %.3g] %s  (region subset)",
                     float(obs_subset.min()), float(obs_subset.max()),
                     VARIABLES[variable].get("units", ""))

            if mode in ("anomaly", "normalized"):
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
                    _climo_grid_before = "×".join(str(s) for s in climo_mean.shape)
                    log.info("  From    : %s  (climo grid, ~2.5°)", _climo_grid_before)
                    climo_mean = climo_mean.interp_like(obs_subset)
                    if climo_std is not None:
                        climo_std = climo_std.interp_like(obs_subset)
                log.info("STEP %d ✓  regrid complete", step)

            if mode == "anomaly":
                step += 1
                log.info("")
                if use_vector_wind_anomaly:
                    log.info("STEP %d  Compute vector anomaly magnitude  =  sqrt((U−U_climo)^2 + (V−V_climo)^2)", step)
                    anomaly_u_subset = obs_u_subset - climo_u_mean
                    anomaly_v_subset = obs_v_subset - climo_v_mean
                    subset = (anomaly_u_subset ** 2 + anomaly_v_subset ** 2) ** 0.5
                    subset.attrs.update({"units": "m/s", "long_name": "Wind Vector Anomaly Magnitude"})
                    if "valid_time" in obs_subset.coords:
                        subset = subset.assign_coords(valid_time=obs_subset.coords["valid_time"])
                else:
                    log.info("STEP %d  Compute anomaly  =  obs − climo_mean", step)
                    subset = obs_subset - climo_mean
                log.info("STEP %d ✓  anomaly computed", step)
                log.info("  obs range   : [%.3g, %.3g] %s",
                         float(obs_subset.min()), float(obs_subset.max()),
                         VARIABLES[variable].get("units", ""))
                if use_vector_wind_anomaly:
                    log.info("  climo U     : [%.3g, %.3g] m/s  (after regrid)",
                             float(climo_u_mean.min()), float(climo_u_mean.max()))
                    log.info("  climo V     : [%.3g, %.3g] m/s  (after regrid)",
                             float(climo_v_mean.min()), float(climo_v_mean.max()))
                    log.info("  anomaly |V'|: [%.3g, %.3g] %s",
                             float(subset.min()), float(subset.max()),
                             VARIABLES[variable].get("units", ""))
                else:
                    log.info("  climo_mean  : [%.3g, %.3g] %s  (after regrid)",
                             float(climo_mean.min()), float(climo_mean.max()),
                             VARIABLES[variable].get("units", ""))
                    log.info("  anomaly     : [%.3g, %.3g] %s",
                             float(subset.min()), float(subset.max()),
                             VARIABLES[variable].get("units", ""))

            elif mode == "normalized":
                step += 1
                _thresh_cfg = VARIABLES[variable].get("normalized_mask_threshold")
                if isinstance(_thresh_cfg, dict):
                    # Pick the entry whose level is closest to the requested level.
                    _abs_threshold = _thresh_cfg[min(_thresh_cfg, key=lambda k: abs(k - level))]
                else:
                    _abs_threshold = _thresh_cfg  # scalar or None
                log.info("")
                log.info("STEP %d  Compute normalized anomaly  =  (obs − climo_mean) / climo_σ", step)
                log.info("  Note    : climo_σ < 1e-6 → NaN  (no inter-annual variability, undefined)")
                if _abs_threshold is not None:
                    log.info("  Mask    : obs < %.3g %s → NaN  "
                             "(below threshold: physically insignificant signal)",
                             _abs_threshold, VARIABLES[variable].get("units", ""))
                safe_std = climo_std.where(climo_std > 1e-6)
                subset = (obs_subset - climo_mean) / safe_std
                if _abs_threshold is not None:
                    n_before = int(subset.notnull().sum())
                    subset = subset.where(obs_subset >= _abs_threshold)
                    n_masked = n_before - int(subset.notnull().sum())
                    log.info("  Masked  : %d grid points below threshold (%.1f%% of domain)",
                             n_masked, 100.0 * n_masked / max(n_before, 1))
                log.info("STEP %d ✓  normalized anomaly computed", step)
                log.info("  obs range   : [%.3g, %.3g] %s",
                         float(obs_subset.min()), float(obs_subset.max()),
                         VARIABLES[variable].get("units", ""))
                log.info("  climo_mean  : [%.3g, %.3g] %s  (after regrid)",
                         float(climo_mean.min()), float(climo_mean.max()),
                         VARIABLES[variable].get("units", ""))
                log.info("  climo_σ     : [%.3g, %.3g] %s  (after regrid)",
                         float(climo_std.min()), float(climo_std.max()),
                         VARIABLES[variable].get("units", ""))
                log.info("  result σ    : [%.3g, %.3g]  (values outside ±6 are scientifically extreme)",
                         float(subset.min(skipna=True)), float(subset.max(skipna=True)))
            else:
                subset = obs_subset

        # ── Date string for map title ────────────────────────────────────────
        month_abbr = cal.month_abbr[obs_month]

        def _ym_label(ym: tuple[int, int]) -> str:
            return f"{cal.month_abbr[ym[1]]} {ym[0]}"

        # climo_ref: short phrase describing the baseline, shown after "vs" in titles.
        # Encodes the source and whether it matched by day or only by month.
        _climo_period = f"{CLIMO_START_YEAR}–{CLIMO_END_YEAR}"
        if climo_source == "r2-daily" and not monthly_mode:
            climo_ref = f"vs {month_abbr} {obs_day} R2-daily {_climo_period}"
        elif climo_source == "r2-monthly":
            climo_ref = f"vs {month_abbr} R2-monthly {_climo_period}"
        else:
            climo_ref = f"vs {month_abbr} PGB-monthly {_climo_period}"

        # obs_source_tag: blank for the expected primary; shown in title otherwise
        _obs_source_tag = (
            f"  [{obs_source}]" if monthly_mode and obs_source != "CORe-pgb" else ""
        )

        if monthly_mode:
            if len(year_months) == 1:
                period = _ym_label(year_months[0])
            else:
                period = f"{_ym_label(year_months[0])} – {_ym_label(year_months[-1])}  ({len(year_months)} months)"
            if mode in ("anomaly", "normalized"):
                if mode == "anomaly" and use_vector_wind_anomaly:
                    mode_label = "VECTOR ANOMALY MAGNITUDE"
                else:
                    mode_label = "ANOMALY" if mode == "anomaly" else "NORMALIZED ANOMALY"
                date_str = (
                    f"MONTHLY {mode_label} · {period}{_obs_source_tag}\n"
                    f"{climo_ref}"
                )
            else:
                date_str = f"MONTHLY COMPOSITE · {period}{_obs_source_tag}"
        elif mode == "climatology":
            date_str = (
                f"CLIMATOLOGY MEAN · {month_abbr} · "
                f"{_climo_period}"
            )
        elif mode in ("anomaly", "normalized"):
            if mode == "anomaly" and use_vector_wind_anomaly:
                mode_label = "VECTOR ANOMALY MAGNITUDE"
            else:
                mode_label = "ANOMALY" if mode == "anomaly" else "NORMALIZED ANOMALY"
            fmt = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}"
            if is_daily_composite:
                hours_label = "/".join(h + "z" for h in daily_hours)
                if len(date_list) == 1:
                    date_str = (
                        f"DAILY {mode_label} · {hours_label}  {climo_ref}\n"
                        f"{fmt(date_list[0])}"
                    )
                else:
                    date_str = (
                        f"DAILY {mode_label} · {hours_label}  {climo_ref}\n"
                        f"{fmt(date_list[0])} – {fmt(date_list[-1])}  ({len(date_list)} dates)"
                    )
            elif composite:
                d0, d1 = date_list[0], date_list[-1]
                date_str = (
                    f"COMPOSITE {mode_label} · {hour}z  {climo_ref}\n"
                    f"{fmt(d0)} – {fmt(d1)}  ({len(date_list)} dates)"
                )
            else:
                try:
                    obs_time = str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
                except (KeyError, AttributeError):
                    d = date_list[0]
                    obs_time = f"{d[:4]}-{d[4:6]}-{d[6:]} {hour}z"
                date_str = (
                    f"{mode_label} · {obs_time}  {climo_ref}"
                )
        elif is_daily_composite:
            hours_label = "/".join(h + "z" for h in daily_hours)
            fmt = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}"
            if len(date_list) == 1:
                date_str = f"DAILY COMPOSITE · {hours_label}\n{fmt(date_list[0])}"
            else:
                date_str = (
                    f"DAILY COMPOSITE · {hours_label}\n"
                    f"{fmt(date_list[0])} – {fmt(date_list[-1])}  ({len(date_list)} dates)"
                )
        elif composite:
            d0, d1 = date_list[0], date_list[-1]
            fmt = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}"
            date_str = (
                f"COMPOSITE MEAN · {hour}z\n"
                f"{fmt(d0)} – {fmt(d1)}  ({len(date_list)} dates)"
            )
        else:
            try:
                date_str = str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
            except (KeyError, AttributeError):
                d = date_list[0]
                date_str = f"{d[:4]}-{d[4:6]}-{d[6:]} {hour}z"

        # ── Variable label ───────────────────────────────────────────────────
        var_cfg   = VARIABLES[variable]
        units     = display_unit(variable, level, wind_unit=wind_unit)
        if use_vector_wind_anomaly:
            var_label = f"Wind Vector Anomaly Magnitude ({units})  {level}mb"
        else:
            var_label = f"{var_cfg['name']} ({units})  {level}mb"

        # ── Wind overlay ─────────────────────────────────────────────────────────
        u_subset = v_subset = None
        if wind_step > 0 and mode != "climatology":
            step += 1
            log.info("")
            if use_vector_wind_anomaly and anomaly_u_subset is not None and anomaly_v_subset is not None:
                log.info("STEP %d  Wind overlay  (reusing computed anomaly U+V)", step)
                u_subset = anomaly_u_subset
                v_subset = anomaly_v_subset
                log.info("STEP %d ✓  wind overlay ready  (anomaly vectors cached)", step)
            elif _cached_u is not None:
                # U+V were already fetched in the obs step — reuse them, no extra network call.
                log.info("STEP %d  Wind overlay  (reusing U+V from obs step — no additional fetch)", step)
                u_subset = _sel(_cached_u)
                v_subset = _sel(_cached_v)
                log.info("STEP %d ✓  wind overlay ready  (cached)", step)
            else:
                log.info("STEP %d  Fetch wind overlay  (U + V components @ %dmb)", step, level)
                log.info("  Purpose : vector arrows / barbs overlaid on scalar field")
                log.info("  Method  : same source/method as obs step  (U and V fetched with shared index)")
                t0 = time.perf_counter()
                u_raw, v_raw = _fetch_wind()
                log.info("STEP %d ✓  wind overlay ready  (%.1fs)", step, time.perf_counter() - t0)
                u_subset = _sel(u_raw)
                v_subset = _sel(v_raw)

        step += 1
        log.info("")
        log.info("STEP %d  Render map", step)
        log.info("  variable : %s  %dmb", _VAR_NAMES.get(variable, variable), level)
        log.info("  region   : %s  (projection: %s)", region,
                 "Albers Equal-Area" if region == "CONUS" else "PlateCarree")
        if mode == "anomaly" and use_vector_wind_anomaly:
            log.info("  colormap : positive sequential (vector anomaly magnitude)")
        else:
            log.info("  colormap : %s", "diverging (Blues/Reds)" if mode in ("anomaly","normalized") else "fixed-anchor stepped")
        scale_diag = describe_color_scale(
            variable=variable,
            level=level,
            color_step=color_step,
            mode=mode,
            data_array=subset,
            scale_overrides=scale_overrides,
            wind_anomaly_style=wind_anomaly_style,
            wind_unit=wind_unit,
        )
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
            log.info("  under / over  : %.1f%% / %.1f%%",
                     scale_diag.get("data_under_pct", 0.0),
                     scale_diag.get("data_over_pct", 0.0))
        if scale_diag.get("data_min") is not None and scale_diag.get("data_max") is not None:
            log.info("  data display  : [%.3f, %.3f] %s",
                     scale_diag.get("data_min"),
                     scale_diag.get("data_max"),
                     scale_diag.get("unit", ""))
        boundaries = scale_diag.get("boundaries")
        if boundaries:
            log.info("  boundaries    : %s", _preview(boundaries, digits=3))
        mids = scale_diag.get("interval_mids")
        if mids:
            log.info("  interval mids : %s", _preview(mids, digits=3))
        anchor_values = scale_diag.get("anchor_values")
        if anchor_values:
            log.info("  anchors       : %s", _preview(anchor_values, digits=3))
        key_breakpoints = scale_diag.get("key_breakpoints")
        if key_breakpoints:
            log.info("  key breaks    : %s", _preview(key_breakpoints, digits=3))
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
                pct["1"], pct["5"], pct["25"], pct["50"], pct["75"], pct["95"], pct["99"],
                scale_diag.get("unit", ""),
            )
        band_edges = scale_diag.get("scale_band_edges")
        band_pcts = scale_diag.get("scale_band_pcts")
        if band_edges and band_pcts:
            band_parts = [
                f"[{band_edges[i]:.1f},{band_edges[i+1]:.1f})={band_pcts[i]:.1f}%"
                for i in range(len(band_pcts))
            ]
            log.info("  scale bands   : %s", "  ".join(band_parts))
        buf = create_map_product(
            data_array=subset,
            region_bounds=bounds,
            var_name=var_label,
            date_str=date_str,
            variable=variable,
            level=level,
            region=region,
            u_array=u_subset,
            v_array=v_subset,
            wind_step=wind_step,
            wind_type=wind_type,
            color_step=color_step,
            mode=mode,
            scale_overrides=scale_overrides,
            wind_anomaly_style=wind_anomaly_style,
            wind_unit=wind_unit,
        )

        log.info("STEP %d ✓  render complete → streaming PNG", step)
        log.info("══════════════════════════════════════════════════════════════")
        return StreamingResponse(buf, media_type="image/png")

    except Exception as e:
        log.exception("ERROR    %s", e)
        raise HTTPException(status_code=500, detail=str(e))
