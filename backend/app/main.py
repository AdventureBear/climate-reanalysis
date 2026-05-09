import calendar as cal

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
    fetch_monthly_field_composite, fetch_monthly_relative_humidity_composite,
    fetch_monthly_wind_speed_composite, fetch_monthly_wind_components_composite,
    get_climatology_field, get_climatology_relative_humidity, get_climatology_wind_speed,
)
from .visualizer import create_map_product, display_unit

app = FastAPI(title="PyRe Climate Reanalysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_MODES = ("raw", "climatology", "anomaly", "normalized")
VALID_CLIMO_SOURCES = ("monthly-pgb", "r1-daily", "cfsr-daily")


@app.get("/")
def root():
    return {
        "variables": list(VARIABLES.keys()),
        "levels": PRESSURE_LEVELS,
        "regions": list(REGIONS.keys()),
        "valid_hours": VALID_HOURS,
        "modes": list(VALID_MODES),
    }


@app.get("/api/map")
async def get_map(
    date: str = "",
    dates: str = "",
    months: str = "",   # comma-separated YYYYMM — uses monthly mean archive directly
    hour: str = "00",
    variable: str = "wind_speed",
    level: int = 850,
    region: str = "CONUS",
    wind_step: int = 0,
    wind_type: str = "vectors",
    color_step: int = 1,
    mode: str = "raw",
    climo_source: str = "monthly-pgb",
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
        # For climatology month extraction, use the first month
        obs_month = year_months[0][1]
        date_list = []  # unused in monthly path
    elif dates:
        date_list = [d.strip() for d in dates.split(",") if d.strip()]
        obs_month = int(date_list[0][4:6])
        year_months = []
    elif date:
        date_list = [date]
        obs_month = int(date_list[0][4:6])
        year_months = []
    else:
        raise HTTPException(status_code=422, detail="provide 'date', 'dates', or 'months'")

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
    if climo_source != "monthly-pgb" and mode != "raw":
        raise HTTPException(status_code=501, detail=f"climo_source '{climo_source}' is not yet implemented; only 'monthly-pgb' is available")

    composite = len(date_list) > 1
    bounds    = REGIONS[region]
    grib_name = VARIABLES[variable].get("grib_name", "")

    def _sel(da):
        return da.sel(
            latitude=slice(bounds["lat"][1], bounds["lat"][0]),
            longitude=slice(bounds["lon"][0], bounds["lon"][1]),
        )

    def _fetch_climo(month: int):
        if variable == "wind_speed":
            return get_climatology_wind_speed(month, level)
        if variable == "rel_humidity":
            return get_climatology_relative_humidity(month, level)
        return get_climatology_field(month, grib_name, level)

    def _fetch_obs():
        if monthly_mode:
            if variable == "wind_speed":
                return fetch_monthly_wind_speed_composite(year_months, level)
            if variable == "rel_humidity":
                return fetch_monthly_relative_humidity_composite(year_months, level)
            return fetch_monthly_field_composite(year_months, grib_name, level)
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
        if composite:
            return fetch_wind_components_composite(date_list, hour, level)
        return fetch_wind_components(date_list[0], hour, level)

    try:
        # ── Climatology (mean + std) ─────────────────────────────────────────
        climo_mean = climo_std = None
        if mode != "raw":
            climo_mean, climo_std = _fetch_climo(obs_month)
            climo_mean = _sel(climo_mean)
            climo_std  = _sel(climo_std)

        # ── Observation data (skipped for pure climatology maps) ─────────────
        if mode == "climatology":
            subset = climo_mean
        else:
            obs        = _fetch_obs()
            obs_subset = _sel(obs)

            if mode in ("anomaly", "normalized"):
                # interp_like aligns the 2.5° pgb climo to the obs grid.
                # No-op when grids already match.
                climo_mean = climo_mean.interp_like(obs_subset)
                if climo_std is not None:
                    climo_std = climo_std.interp_like(obs_subset)

            if mode == "anomaly":
                subset = obs_subset - climo_mean
            elif mode == "normalized":
                subset = (obs_subset - climo_mean) / climo_std
            else:
                subset = obs_subset

        # ── Date string for map title ────────────────────────────────────────
        month_abbr = cal.month_abbr[obs_month]

        def _ym_label(ym: tuple[int, int]) -> str:
            return f"{cal.month_abbr[ym[1]]} {ym[0]}"

        if monthly_mode:
            if len(year_months) == 1:
                period = _ym_label(year_months[0])
            else:
                period = f"{_ym_label(year_months[0])} – {_ym_label(year_months[-1])}  ({len(year_months)} months)"
            if mode in ("anomaly", "normalized"):
                mode_label = "ANOMALY" if mode == "anomaly" else "NORMALIZED ANOMALY"
                date_str = (
                    f"MONTHLY {mode_label} · {period}\n"
                    f"vs {cal.month_abbr[obs_month]} climo {CLIMO_START_YEAR}–{CLIMO_END_YEAR}"
                )
            else:
                date_str = f"MONTHLY COMPOSITE · {period}"
        elif mode == "climatology":
            date_str = (
                f"CLIMATOLOGY MEAN · {month_abbr} · "
                f"{CLIMO_START_YEAR}–{CLIMO_END_YEAR}"
            )
        elif mode in ("anomaly", "normalized"):
            mode_label = "ANOMALY" if mode == "anomaly" else "NORMALIZED ANOMALY"
            if composite:
                d0, d1 = date_list[0], date_list[-1]
                fmt = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}"
                date_str = (
                    f"COMPOSITE {mode_label} · {hour}z  "
                    f"vs {month_abbr} climo {CLIMO_START_YEAR}–{CLIMO_END_YEAR}\n"
                    f"{fmt(d0)} – {fmt(d1)}  ({len(date_list)} dates)"
                )
            else:
                try:
                    obs_time = str(obs.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
                except (KeyError, AttributeError):
                    d = date_list[0]
                    obs_time = f"{d[:4]}-{d[4:6]}-{d[6:]} {hour}z"
                date_str = (
                    f"{mode_label} · {obs_time}  "
                    f"vs {month_abbr} climo {CLIMO_START_YEAR}–{CLIMO_END_YEAR}"
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
        units     = display_unit(variable, level)
        var_label = f"{var_cfg['name']} ({units})  {level}mb"

        # ── Wind overlay ─────────────────────────────────────────────────────────
        u_subset = v_subset = None
        if wind_step > 0 and mode != "climatology":
            u_raw, v_raw = _fetch_wind()
            u_subset = _sel(u_raw)
            v_subset = _sel(v_raw)

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
        )

        return StreamingResponse(buf, media_type="image/png")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
