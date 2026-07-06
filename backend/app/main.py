import logging
import os

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .api_options import (
    VALID_CLIMO_SOURCES,
    VALID_MODES,
    VALID_PWAT_UNITS,
    VALID_WIND_UNITS,
    scale_overrides_from_query,
)
from .config import PRESSURE_LEVELS, REGIONS, VARIABLES, is_surface_or_named_level
from .map_pipeline.request import MapRequest
from .map_service import create_map_buffer
from .retrieval import DataUnavailableError, VALID_HOURS
from .visualizer import describe_color_scale

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)

log = logging.getLogger("pyre.api")

app = FastAPI(title="PyRe Climate Reanalysis API")

# Request guards: every date in a composite fans out to concurrent NOAA fetches
# (and each distinct calendar day of an r2-daily anomaly costs 30 OPeNDAP calls),
# so unbounded lists let one URL monopolize the service.
MAX_COMPOSITE_DATES = 93    # one season of daily composites
MAX_COMPOSITE_MONTHS = 60   # five years of monthly means

cors_origins = os.getenv("CORS_ORIGINS", "")
# Browser Origin headers never carry a trailing slash; strip any configured by
# accident so "https://example.com/" doesn't silently fail to match.
allowed_origins = [origin.strip().rstrip("/") for origin in cors_origins.split(",") if origin.strip("/ ")]

if allowed_origins:
    log.info("CORS origins: %s", allowed_origins)
else:
    log.warning(
        "CORS_ORIGINS is empty — browsers on any other origin cannot call this API. "
        "Set CORS_ORIGINS (comma-separated) if the frontend is served from a different origin."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_common(
    variable: str,
    level: int,
    mode: str,
    wind_unit: str,
    pwat_unit: str,
    scale_min: float | None,
    scale_max: float | None,
    color_step: int,
) -> None:
    checks = (
        (variable in VARIABLES, f"variable must be one of {list(VARIABLES.keys())}"),
        (level in PRESSURE_LEVELS, f"level must be one of {PRESSURE_LEVELS}"),
        (mode in VALID_MODES, f"mode must be one of {list(VALID_MODES)}"),
        (wind_unit in VALID_WIND_UNITS, f"wind_unit must be one of {list(VALID_WIND_UNITS)}"),
        (pwat_unit in VALID_PWAT_UNITS, f"pwat_unit must be one of {list(VALID_PWAT_UNITS)}"),
        (
            scale_min is None or scale_max is None or scale_min < scale_max,
            "scale_min must be less than scale_max",
        ),
        (color_step >= 1, "color_step must be at least 1"),
    )
    for ok, detail in checks:
        if not ok:
            raise HTTPException(status_code=422, detail=detail)

    if is_surface_or_named_level(variable) and mode != "raw":
        raise HTTPException(
            status_code=422,
            detail=(
                "CORe surface/named-level starter fields currently support raw maps only; "
                "climatology/anomaly support is not wired yet."
            ),
        )


@app.get("/")
def root():
    return {
        "variables": list(VARIABLES.keys()),
        "levels": PRESSURE_LEVELS,
        "regions": list(REGIONS.keys()),
        "valid_hours": VALID_HOURS,
        "modes": list(VALID_MODES),
    }


@app.get("/api/scale-meta")
def get_scale_meta(
    variable: str = "wind_speed",
    level: int = 850,
    color_step: int = 1,
    mode: str = "raw",
    scale_min: float | None = None,
    scale_max: float | None = None,
    wind_unit: str = "kt",
    pwat_unit: str = "mm",
):
    _validate_common(variable, level, mode, wind_unit, pwat_unit, scale_min, scale_max, color_step)

    return describe_color_scale(
        variable=variable,
        level=level,
        color_step=color_step,
        mode=mode,
        scale_overrides=scale_overrides_from_query(variable, scale_min, scale_max, wind_unit=wind_unit),
        wind_unit=wind_unit,
        pwat_unit=pwat_unit,
    )


@app.get("/api/map")
def get_map(
    date: str = "",
    dates: str = "",
    date_mode: str = "",
    months: str = "",
    hour: str = "00",
    hours: str = "",
    variable: str = "wind_speed",
    level: int = 850,
    region: str = "CONUS",
    wind_step: int = 0,
    wind_type: str = "vectors",
    wind_overlay_mode: str = "actual",
    color_step: int = 1,
    scale_min: float | None = None,
    scale_max: float | None = None,
    scale_spec: str = "",
    mode: str = "raw",
    climo_source: str = "monthly-pgb",
    wind_unit: str = "kt",
    pwat_unit: str = "mm",
):
    _validate_common(variable, level, mode, wind_unit, pwat_unit, scale_min, scale_max, color_step)
    if not months and hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"hour must be one of {VALID_HOURS}")
    if hours:
        parsed_hours = [h.strip() for h in hours.split(",") if h.strip()]
        invalid_hours = [h for h in parsed_hours if h not in VALID_HOURS]
        if invalid_hours:
            raise HTTPException(status_code=422, detail=f"hours contains invalid values: {invalid_hours}; valid hours are {VALID_HOURS}")
    if dates:
        n_dates = len([d for d in dates.split(",") if d.strip()])
        if n_dates > MAX_COMPOSITE_DATES:
            raise HTTPException(
                status_code=422,
                detail=f"too many dates ({n_dates}); composites are limited to {MAX_COMPOSITE_DATES} dates per map",
            )
    if months:
        n_months = len([m for m in months.split(",") if m.strip()])
        if n_months > MAX_COMPOSITE_MONTHS:
            raise HTTPException(
                status_code=422,
                detail=f"too many months ({n_months}); composites are limited to {MAX_COMPOSITE_MONTHS} months per map",
            )
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"region must be one of {list(REGIONS.keys())}")
    if climo_source not in VALID_CLIMO_SOURCES:
        raise HTTPException(status_code=422, detail=f"climo_source must be one of {list(VALID_CLIMO_SOURCES)}")
    if wind_overlay_mode not in {"actual", "anomaly"}:
        raise HTTPException(status_code=422, detail="wind_overlay_mode must be 'actual' or 'anomaly'")
    if wind_overlay_mode == "anomaly" and not (variable == "wind_speed" and mode == "anomaly"):
        raise HTTPException(status_code=422, detail="wind_overlay_mode='anomaly' is only supported for wind anomaly maps")
    if is_surface_or_named_level(variable) and months:
        raise HTTPException(
            status_code=422,
            detail="CORe surface/named-level starter fields currently support 3-hourly and daily raw maps only.",
        )
    # SPFH has no R2 climatology mapping, so every non-raw humidity map would 500
    # in the climo fetch. Reject up front until a baseline is wired.
    if variable == "humidity" and mode != "raw":
        raise HTTPException(
            status_code=422,
            detail="Specific humidity currently supports raw maps only; no climatology baseline is wired for SPFH yet.",
        )

    try:
        buf = create_map_buffer(
            MapRequest(
                date=date,
                dates=dates,
                date_mode=date_mode,
                months=months,
                hour=hour,
                hours=hours,
                variable=variable,
                level=level,
                region=region,
                wind_step=wind_step,
                wind_type=wind_type,
                wind_overlay_mode=wind_overlay_mode,
                color_step=color_step,
                scale_min=scale_min,
                scale_max=scale_max,
                scale_spec=scale_spec,
                mode=mode,
                climo_source=climo_source,
                wind_unit=wind_unit,
                pwat_unit=pwat_unit,
            )
        )
        return StreamingResponse(buf, media_type="image/png")
    except DataUnavailableError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HTTPException:
        raise
    except requests.RequestException as exc:
        log.exception("UPSTREAM %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Upstream data source error while fetching CORe/R2 data. Please try again shortly.",
        ) from exc
    except Exception as exc:
        log.exception("ERROR    %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
