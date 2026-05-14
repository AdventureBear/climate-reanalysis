import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .api_options import (
    VALID_CLIMO_SOURCES,
    VALID_MODES,
    VALID_WIND_ANOMALY_STYLES,
    VALID_WIND_UNITS,
    scale_overrides_from_query,
)
from .config import PRESSURE_LEVELS, REGIONS, VARIABLES
from .map_pipeline.request import MapRequest
from .map_service import create_map_buffer
from .retrieval import VALID_HOURS
from .visualizer import describe_color_scale

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)

log = logging.getLogger("pyre.api")

app = FastAPI(title="PyRe Climate Reanalysis API")

cors_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]

log.info("CORS origins: %s", allowed_origins)

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
    wind_anomaly_style: str,
    wind_unit: str,
    scale_min: float | None,
    scale_max: float | None,
) -> None:
    checks = (
        (variable in VARIABLES, f"variable must be one of {list(VARIABLES.keys())}"),
        (level in PRESSURE_LEVELS, f"level must be one of {PRESSURE_LEVELS}"),
        (mode in VALID_MODES, f"mode must be one of {list(VALID_MODES)}"),
        (
            wind_anomaly_style in VALID_WIND_ANOMALY_STYLES,
            f"wind_anomaly_style must be one of {list(VALID_WIND_ANOMALY_STYLES)}",
        ),
        (wind_unit in VALID_WIND_UNITS, f"wind_unit must be one of {list(VALID_WIND_UNITS)}"),
        (
            scale_min is None or scale_max is None or scale_min < scale_max,
            "scale_min must be less than scale_max",
        ),
    )
    for ok, detail in checks:
        if not ok:
            raise HTTPException(status_code=422, detail=detail)


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
    wind_anomaly_style: str = "speed_diff",
    wind_unit: str = "kt",
):
    _validate_common(variable, level, mode, wind_anomaly_style, wind_unit, scale_min, scale_max)
    if color_step < 1:
        raise HTTPException(status_code=422, detail="color_step must be at least 1")

    return describe_color_scale(
        variable=variable,
        level=level,
        color_step=color_step,
        mode=mode,
        scale_overrides=scale_overrides_from_query(variable, scale_min, scale_max, wind_unit=wind_unit),
        wind_anomaly_style=wind_anomaly_style,
        wind_unit=wind_unit,
    )


@app.get("/api/map")
async def get_map(
    date: str = "",
    dates: str = "",
    months: str = "",
    hour: str = "00",
    hours: str = "",
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
    _validate_common(variable, level, mode, wind_anomaly_style, wind_unit, scale_min, scale_max)
    if not months and hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"hour must be one of {VALID_HOURS}")
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"region must be one of {list(REGIONS.keys())}")
    if climo_source not in VALID_CLIMO_SOURCES:
        raise HTTPException(status_code=422, detail=f"climo_source must be one of {list(VALID_CLIMO_SOURCES)}")

    try:
        buf = create_map_buffer(
            MapRequest(
                date=date,
                dates=dates,
                months=months,
                hour=hour,
                hours=hours,
                variable=variable,
                level=level,
                region=region,
                wind_step=wind_step,
                wind_type=wind_type,
                color_step=color_step,
                scale_min=scale_min,
                scale_max=scale_max,
                mode=mode,
                climo_source=climo_source,
                wind_anomaly_style=wind_anomaly_style,
                wind_unit=wind_unit,
            )
        )
        return StreamingResponse(buf, media_type="image/png")
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("ERROR    %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
