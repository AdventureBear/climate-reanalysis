import logging
import os
from datetime import datetime

import requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

# Load .env before importing app modules: config.CACHE_ROOT (and anything else
# read at module import time) must see .env values, not just process env.
load_dotenv()

from .api_options import (
    VALID_CLIMO_SOURCES,
    VALID_MODES,
    VALID_PWAT_UNITS,
    VALID_WIND_UNITS,
    scale_overrides_from_query,
    supported_modes,
)
from .single_date_packages import (
    SingleDatePackageRequest,
    package_file_path,
    build_zip,
    create_job,
    get_job,
    run_job,
    serialize_job,
)
from .climo_r2 import ClimatologyUnavailableError
from .config import PRESSURE_LEVELS, REGIONS, VARIABLES, is_surface_or_named_level, supports_climatology, valid_levels
from .map_pipeline.request import MapRequest
from .map_service import create_map_buffer
from .rate_limit import (
    PACKAGE_CREATE_LIMIT,
    PACKAGE_FILE_LIMIT,
    PACKAGE_STATUS_LIMIT,
    PUBLIC_MAP_LIMIT,
    enforce_rate_limit,
)
from .retrieval import DataUnavailableError, VALID_HOURS
from .visualizer import DEFAULT_WIND_DENSITY, ISOTACH_INTERVALS_KT, describe_color_scale

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
MAX_DAILY_COMPOSITE_FETCHES = MAX_COMPOSITE_DATES * 4

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


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    return PlainTextResponse("User-agent: *\nDisallow: /\n")


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
    variable_levels = valid_levels(variable) if variable in VARIABLES else PRESSURE_LEVELS
    checks = (
        (variable in VARIABLES, f"variable must be one of {list(VARIABLES.keys())}"),
        (level in variable_levels, f"level must be one of {variable_levels} for {variable}"),
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

    if mode != "raw" and not supports_climatology(variable):
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{variable}' currently supports raw maps only; "
                "no climatology baseline is wired (see config.VARIABLES climo_sources)."
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
        # Per-variable mode availability, derived from config.VARIABLES
        # climo_sources. The frontend registry mirrors this.
        "variable_modes": {name: list(supported_modes(name)) for name in VARIABLES},
    }


@app.post("/api/synopsis/generate", status_code=202)
def synopsis_generate(
    background_tasks: BackgroundTasks,
    body: dict | None = None,
    x_cron_secret: str = Header(default=""),
    authorization: str = Header(default=""),
):
    """Kick off the Synopsis WPC discussion draft pipeline (#37/#76). Two callers:
    the daily Supabase scheduler (x-cron-secret, no body) and the admin
    New WPC page (admin bearer token, optional {date, issuance}). The
    2-4 minute job runs after this returns; the response carries the slug
    so the UI can poll for the draft."""
    from . import synopsis

    secret = os.environ.get("SYNOPSIS_CRON_SECRET", "")
    cron_ok = bool(secret) and x_cron_secret == secret
    if not cron_ok:
        token = authorization.replace("Bearer ", "")
        if not synopsis.is_admin_token(token):
            raise HTTPException(status_code=401, detail="admin sign-in or cron secret required")

    body = body or {}
    date = body.get("date") or synopsis.default_target_date()
    issuance = body.get("issuance") or "morning"
    try:
        datetime.strptime(date, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYYMMDD")
    if issuance not in synopsis.ISSUANCE_WINDOWS:
        raise HTTPException(status_code=422, detail="issuance must be 'morning' or 'afternoon'")
    if date > synopsis.default_target_date():
        raise HTTPException(
            status_code=422,
            detail=f"data is not available yet for {date}; the newest allowed day is "
                   f"{synopsis.default_target_date()} (reanalysis lags real time)",
        )
    if synopsis.day_status(date) == "published":
        raise HTTPException(
            status_code=409,
            detail=f"the post for {date} is already published; it will not be overwritten",
        )
    background_tasks.add_task(synopsis.run_scheduled, date, issuance)
    return {"started": True, "date": date, "issuance": issuance,
            "slug": synopsis.slug_for_date(date)}


@app.get("/api/scale-meta")
def get_scale_meta(
    variable: str = "wind_speed",
    level: int = 850,
    color_step: int = 1,
    mode: str = "raw",
    scale_min: float | None = None,
    scale_max: float | None = None,
    wind_unit: str = "kt",
    pwat_unit: str = "in",
    temp_unit: str = "",
):
    _validate_common(variable, level, mode, wind_unit, pwat_unit, scale_min, scale_max, color_step)
    if temp_unit not in {"", "F", "C"}:
        raise HTTPException(status_code=422, detail="temp_unit must be '', 'F', or 'C'")

    return describe_color_scale(
        variable=variable,
        level=level,
        color_step=color_step,
        mode=mode,
        scale_overrides=scale_overrides_from_query(variable, scale_min, scale_max, wind_unit=wind_unit),
        wind_unit=wind_unit,
        pwat_unit=pwat_unit,
        temp_unit=temp_unit,
    )


@app.post("/api/single-date-packages", status_code=202)
def create_single_date_package(
    request: Request,
    package_request: SingleDatePackageRequest,
    background_tasks: BackgroundTasks,
):
    enforce_rate_limit(request, PACKAGE_CREATE_LIMIT)
    job = create_job(package_request)
    background_tasks.add_task(run_job, job.id)
    return serialize_job(job)


@app.get("/api/single-date-packages/{job_id}")
def get_single_date_package(request: Request, job_id: str):
    enforce_rate_limit(request, PACKAGE_STATUS_LIMIT)
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="map package not found")
    return serialize_job(job)


@app.get("/api/single-date-packages/{job_id}/files/{filename}")
def get_single_date_package_file(request: Request, job_id: str, filename: str):
    enforce_rate_limit(request, PACKAGE_FILE_LIMIT)
    try:
        path = package_file_path(job_id, filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="map package file not found") from exc
    media_type = {
        ".gif": "image/gif",
        ".png": "image/png",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".json": "application/json",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.get("/api/single-date-packages/{job_id}/download")
def download_single_date_package(request: Request, job_id: str):
    enforce_rate_limit(request, PACKAGE_FILE_LIMIT)
    job = get_job(job_id)
    if job is None or job.status != "done":
        raise HTTPException(status_code=404, detail="map package not found")
    try:
        buf = build_zip(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="map package not found") from exc
    request = job.request
    date_part = str(request.get("date") or job_id)
    time_part = str(request.get("time") or "").replace(":", "")
    stamp = f"{date_part}-{time_part}" if time_part else date_part
    headers = {"Content-Disposition": f'attachment; filename="{stamp}-map-package.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@app.get("/api/map")
def get_map(
    request: Request,
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
    pwat_unit: str = "in",
    fill_mode: str = "contours",
    temp_unit: str = "",
    isotachs: int = 0,
    isotach_interval: int = 0,
    centers: int = 0,
    contours: str = "",
    skip_missing: int = 0,
):
    enforce_rate_limit(request, PUBLIC_MAP_LIMIT)
    # Back-compat: isotachs was briefly a wind_type value.
    if wind_type == "isotachs":
        wind_type, wind_step, isotachs = "vectors", 0, 1
    # "Auto" density arrives as a negative sentinel. Resolve it here, at the
    # edge, so every downstream `wind_step > 0` gate (fetch planning, overlay
    # planning, rendering) keeps seeing a plain positive number (#45).
    if wind_step < 0:
        wind_step = DEFAULT_WIND_DENSITY
    _validate_common(variable, level, mode, wind_unit, pwat_unit, scale_min, scale_max, color_step)
    if fill_mode not in {"contours", "shaded", "none"}:
        raise HTTPException(status_code=422, detail="fill_mode must be 'contours', 'shaded', or 'none'")
    if temp_unit not in {"", "F", "C"}:
        raise HTTPException(status_code=422, detail="temp_unit must be '', 'F', or 'C'")
    parsed_contours = {c.strip() for c in contours.split(",") if c.strip()}
    if not parsed_contours <= {"pressure", "height", "temp"}:
        raise HTTPException(status_code=422, detail="contours accepts a comma-separated subset of: pressure, height, temp")
    # A wind map with shading, isotachs, and glyphs all off would be blank.
    # Isotachs do not count on an anomaly map, where they are not drawn (#45).
    if isotach_interval and isotach_interval not in ISOTACH_INTERVALS_KT:
        raise HTTPException(
            status_code=422,
            detail=f"isotach_interval must be one of {list(ISOTACH_INTERVALS_KT)} knots, or 0 to derive it from the level",
        )
    isotachs_would_draw = bool(isotachs) and mode not in ("anomaly", "normalized")
    if (
        variable in {"wind_speed", "wind_10m"}
        and fill_mode == "none"
        and not isotachs_would_draw
        and wind_step <= 0
    ):
        raise HTTPException(
            status_code=422,
            detail="wind maps need at least one layer: shading, isotachs, or barbs/vectors",
        )
    if not months and hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"hour must be one of {VALID_HOURS}")
    # Single-hour products (no `hours`, no `months`) compare against that
    # hour's normal, which is a mean-only baseline — there is no per-hour
    # sigma to normalize by (#72). The daily map answers the same question
    # in standard deviations.
    if mode == "normalized" and not hours and not months:
        raise HTTPException(
            status_code=422,
            detail=(
                "normalized mode is not available for single-hour maps: the "
                "per-hour climatology has no standard deviation. Use the daily "
                "composite for normalized anomalies, or anomaly mode for this hour."
            ),
        )
    if hours:
        parsed_hours = [h.strip() for h in hours.split(",") if h.strip()]
        invalid_hours = [h for h in parsed_hours if h not in VALID_HOURS]
        if invalid_hours:
            raise HTTPException(status_code=422, detail=f"hours contains invalid values: {invalid_hours}; valid hours are {VALID_HOURS}")
        if len(parsed_hours) > len(VALID_HOURS):
            raise HTTPException(
                status_code=422,
                detail=f"too many hours ({len(parsed_hours)}); hourly composites are limited to {len(VALID_HOURS)} synoptic hours per day",
            )
        if len(set(parsed_hours)) != len(parsed_hours):
            raise HTTPException(status_code=422, detail="hours contains duplicate synoptic times")
    parsed_dates: list[str] = []
    if dates:
        parsed_dates = [d.strip() for d in dates.split(",") if d.strip()]
        n_dates = len(parsed_dates)
        if n_dates > MAX_COMPOSITE_DATES:
            raise HTTPException(
                status_code=422,
                detail=f"too many dates ({n_dates}); composites are limited to {MAX_COMPOSITE_DATES} dates per map",
            )
        if len(set(parsed_dates)) != len(parsed_dates):
            raise HTTPException(status_code=422, detail="dates contains duplicate dates")
        if hours and n_dates * len(parsed_hours) > MAX_DAILY_COMPOSITE_FETCHES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"too many date/hour pairs ({n_dates * len(parsed_hours)}); "
                    f"daily composites are limited to {MAX_DAILY_COMPOSITE_FETCHES} fetches per map"
                ),
            )
    if months:
        parsed_months = [m.strip() for m in months.split(",") if m.strip()]
        n_months = len(parsed_months)
        if n_months > MAX_COMPOSITE_MONTHS:
            raise HTTPException(
                status_code=422,
                detail=f"too many months ({n_months}); composites are limited to {MAX_COMPOSITE_MONTHS} months per map",
            )
        if len(set(parsed_months)) != len(parsed_months):
            raise HTTPException(status_code=422, detail="months contains duplicate months")
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"region must be one of {list(REGIONS.keys())}")
    if climo_source not in VALID_CLIMO_SOURCES:
        raise HTTPException(status_code=422, detail=f"climo_source must be one of {list(VALID_CLIMO_SOURCES)}")
    if wind_overlay_mode not in {"actual", "anomaly"}:
        raise HTTPException(status_code=422, detail="wind_overlay_mode must be 'actual' or 'anomaly'")
    if wind_overlay_mode == "anomaly" and not (variable == "wind_speed" and mode == "anomaly"):
        raise HTTPException(status_code=422, detail="wind_overlay_mode='anomaly' is only supported for wind anomaly maps")
    # Monthly obs composites are not wired for flx/named-level streams
    # (no ("monthly", "flx") obs fetcher) — a separate gap from climatology.
    # Climatology mode is exempt: it fetches no observations, and its month
    # arrives via the months param.
    if (
        is_surface_or_named_level(variable)
        and months
        and mode != "climatology"
        and not VARIABLES.get(variable, {}).get("monthly_grib_name")
    ):
        raise HTTPException(
            status_code=422,
            detail="CORe surface/named-level starter fields currently support 3-hourly and daily maps only.",
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
                fill_mode=fill_mode,
                temp_unit=temp_unit,
                isotachs=isotachs,
                isotach_interval=isotach_interval,
                centers=centers,
                contours=contours,
                skip_missing=skip_missing,
            )
        )
        return StreamingResponse(buf, media_type="image/png")
    except DataUnavailableError as exc:
        # Composite gaps ship a structured detail so the frontend can offer
        # an informed retry: truncate the range, or regenerate with
        # skip_missing=1 (#95).
        detail: object = str(exc)
        if getattr(exc, "missing", None):
            detail = {"message": str(exc), "missing": exc.missing, "total": exc.total}
        raise HTTPException(status_code=404, detail=detail) from exc
    except HTTPException:
        raise
    except ClimatologyUnavailableError as exc:
        # PSL would not serve the baseline. The full message names the dataset
        # URL and the underlying errno, which belongs in the log and not in
        # someone's browser; the user gets a sentence they can act on.
        log.error("CLIMO    %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "NOAA PSL is limiting requests for the climatology this map needs. "
                "Please try again in a few minutes."
                if exc.rate_limited else
                "The climatology service (NOAA PSL) is not responding. "
                "Raw maps still work; anomaly maps need it. Please try again shortly."
            ),
        ) from exc
    except requests.RequestException as exc:
        log.exception("UPSTREAM %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Upstream data source error while fetching CORe/R2 data. Please try again shortly.",
        ) from exc
    except Exception as exc:
        # Catch-all: never str(exc). It covers every unhandled failure in this
        # endpoint, so it can carry file paths, cache directories and library
        # internals. log.exception keeps the whole thing for whoever is on call.
        log.exception("ERROR    %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while building this map. Please try again.",
        ) from exc
