import json
import logging
import os
import inspect
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

# Load .env before importing app modules: config.CACHE_ROOT (and anything else
# read at module import time) must see .env values, not just process env.
load_dotenv()

from .api_options import (
    MAX_PRECIP_WINDOW_HOURS,
    VALID_CLIMO_SOURCES,
    VALID_MODES,
    VALID_PRECIP_UNITS,
    VALID_PWAT_UNITS,
    VALID_WIND_UNITS,
    scale_overrides_from_query,
    supported_modes,
    valid_precip_window,
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
from .variable_resolution import resolve_variable_selection
from .visualizer import DEFAULT_WIND_DENSITY, ISOTACH_INTERVALS_KT, describe_color_scale, describe_region_catalog

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)

log = logging.getLogger("pyre.api")

app = FastAPI(title="PyRe Climate Reanalysis API")
IGNORED_PARAMS_HEADER = "X-PyRe-Ignored-Params"

# Request guards: every date in a composite fans out to concurrent NOAA fetches
# (and each distinct calendar day of an r2-daily anomaly costs 30 OPeNDAP calls),
# so unbounded lists let one URL monopolize the service. The ceilings live in
# time_selection.py (the canonical parser enforces them too) — one source.
from app.map_pipeline.time_selection import (  # noqa: E402
    MAX_COMPOSITE_DATES,
    MAX_COMPOSITE_MONTHS,
    MAX_DAILY_COMPOSITE_FETCHES,
    parse_time_selection,
)
CORE_ARCHIVE_START_DATE = "19500101"
CORE_ARCHIVE_START_MONTH = "195001"
DATA_AVAILABILITY_NOTE = "The data usually lag real time by 24-36 hours."

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
    expose_headers=[IGNORED_PARAMS_HEADER],
)


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    return PlainTextResponse("User-agent: *\nDisallow: /\n")


def _validate_common(
    variable: str,
    level: int | str | None,
    mode: str,
    wind_unit: str,
    pwat_unit: str,
    precip_unit: str,
    precip_window: int,
    scale_min: float | None,
    scale_max: float | None,
    color_step: int,
) -> None:
    variable_levels = valid_levels(variable) if variable in VARIABLES else PRESSURE_LEVELS
    checks = (
        (variable in VARIABLES, f"variable must be one of {list(VARIABLES.keys())}"),
        (
            variable == "blank_map"
            or (is_surface_or_named_level(variable) and str(level or "").strip() != "")
            or level in variable_levels,
            f"level must be one of {variable_levels} for {variable}",
        ),
        (mode in VALID_MODES, f"mode must be one of {list(VALID_MODES)}"),
        (wind_unit in VALID_WIND_UNITS, f"wind_unit must be one of {list(VALID_WIND_UNITS)}"),
        (pwat_unit in VALID_PWAT_UNITS, f"pwat_unit must be one of {list(VALID_PWAT_UNITS)}"),
        (precip_unit in VALID_PRECIP_UNITS, f"precip_unit must be one of {list(VALID_PRECIP_UNITS)}"),
        (
            valid_precip_window(precip_window),
            f"precip_window must be a 3-hour multiple from 3 to {MAX_PRECIP_WINDOW_HOURS} hours",
        ),
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
    if variable != "precip_total" and precip_window != 3:
        raise HTTPException(status_code=422, detail="precip_window is only supported for precip_total maps")
    if variable not in {"precip_rate", "precip_total"} and precip_unit != "in":
        raise HTTPException(status_code=422, detail="precip_unit is only supported for precipitation maps")


def _validate_precip_total_range_metadata(
    *,
    variable: str,
    date: str,
    hour: str,
    start_date: str,
    start_hour: str,
    precip_window: int,
) -> None:
    if not start_date and not start_hour:
        return
    if variable != "precip_total":
        raise HTTPException(status_code=422, detail="start_date/start_hour are only supported for precip_total maps")
    if not start_date or not start_hour:
        raise HTTPException(status_code=422, detail="precip_total ranges require both start_date and start_hour")
    if start_hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"start_hour must be one of {VALID_HOURS}")
    try:
        start = datetime.strptime(f"{start_date}{start_hour}", "%Y%m%d%H")
        end = datetime.strptime(f"{date}{hour}", "%Y%m%d%H")
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date/date must be YYYYMMDD and hours must be HH")
    window_hours = (end - start).total_seconds() / 3600
    if not window_hours.is_integer() or window_hours <= 0 or int(window_hours) % 3 != 0:
        raise HTTPException(status_code=422, detail="precip_total range must end after the start time in 3-hour increments")
    if int(window_hours) != precip_window:
        raise HTTPException(
            status_code=422,
            detail=(
                "precip_window does not match start_date/start_hour and ending date/hour "
                f"({int(window_hours)} hours from range, {precip_window} from precip_window)"
            ),
        )


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _current_observation_date() -> str:
    return _now_utc().strftime("%Y%m%d")


def _current_observation_month() -> str:
    return _now_utc().strftime("%Y%m")


def _newest_allowed_observation_date() -> str:
    """Newest CORe observation day the public map API should request."""
    return (_now_utc() - timedelta(days=1)).strftime("%Y%m%d")


def _pretty_api_date(token: str) -> str:
    parsed = datetime.strptime(token, "%Y%m%d")
    return f"{parsed.strftime('%b')} {parsed.day}, {parsed.year}"


def _pretty_api_month(token: str) -> str:
    parsed = datetime.strptime(token, "%Y%m")
    return f"{parsed.strftime('%b')} {parsed.year}"


def _valid_api_date_token(token: str) -> str:
    if len(token) != 8 or not token.isdigit():
        raise HTTPException(status_code=422, detail=f"invalid date {token!r}: expected YYYYMMDD")
    try:
        datetime.strptime(token, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid date {token!r}: expected YYYYMMDD")
    return token


def _valid_api_month_token(token: str) -> str:
    if len(token) != 6 or not token.isdigit():
        raise HTTPException(status_code=422, detail=f"invalid month {token!r}: expected YYYYMM")
    try:
        datetime.strptime(token, "%Y%m")
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid month {token!r}: expected YYYYMM")
    return token


def _validate_observation_months_available(*, months: str) -> None:
    if not months:
        return
    tokens = [m.strip() for m in months.split(",") if m.strip()]
    if not tokens:
        return
    parsed = [_valid_api_month_token(token) for token in tokens]
    earliest_requested = min(parsed)
    if earliest_requested < CORE_ARCHIVE_START_MONTH:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The CORe reanalysis data starts on {_pretty_api_date(CORE_ARCHIVE_START_DATE)}. "
                f"Please choose a month between {_pretty_api_month(CORE_ARCHIVE_START_MONTH)} "
                f"and {_pretty_api_month((_now_utc().replace(day=1) - timedelta(days=1)).strftime('%Y%m'))}."
            ),
        )
    latest_requested = max(parsed)
    current_month = _current_observation_month()
    if latest_requested >= current_month:
        raise HTTPException(
            status_code=422,
            detail=(
                "CORe monthly data is only available for "
                f"{_pretty_api_month((_now_utc().replace(day=1) - timedelta(days=1)).strftime('%Y%m'))} and earlier."
            ),
        )


def _validate_observation_dates_available(*, date: str, dates: str, start_date: str, months: str) -> None:
    if months:
        return
    tokens = [d.strip() for d in dates.split(",") if d.strip()] if dates else []
    if date:
        tokens.append(date.strip())
    if start_date:
        tokens.append(start_date.strip())
    if not tokens:
        return
    parsed = [_valid_api_date_token(token) for token in tokens]
    earliest_requested = min(parsed)
    newest_allowed = _newest_allowed_observation_date()
    if earliest_requested < CORE_ARCHIVE_START_DATE:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The CORe reanalysis data starts on {_pretty_api_date(CORE_ARCHIVE_START_DATE)}. "
                f"Please choose a date between {_pretty_api_date(CORE_ARCHIVE_START_DATE)} "
                f"and {_pretty_api_date(newest_allowed)}."
            ),
        )
    latest_requested = max(parsed)
    today = _current_observation_date()
    if latest_requested >= today:
        raise HTTPException(
            status_code=422,
            detail=(
                f"CORe reanalysis data is only available prior to today's date. "
                f"{DATA_AVAILABILITY_NOTE} "
                f"Please choose a date prior to {_pretty_api_date(today)}."
            ),
        )


def _parse_missing_member_time(label: str) -> datetime | None:
    try:
        date_part, hour_part = label.split()[:2]
        hour = hour_part.lower().removesuffix("z")
        return datetime.strptime(f"{date_part}{hour}", "%Y%m%d%H").replace(tzinfo=timezone.utc)
    except (ValueError, IndexError):
        return None


def _pretty_valid_time(value: datetime) -> str:
    return f"{value.strftime('%b')} {value.day}, {value.year} at {value:%H}z UTC"


def _recent_data_lag_message(exc: DataUnavailableError) -> str | None:
    missing_times = [
        parsed for item in getattr(exc, "missing", [])
        if (parsed := _parse_missing_member_time(item)) is not None
    ]
    if not missing_times:
        return None
    requested_time = max(missing_times)
    now = _now_utc()
    if requested_time <= now and now - requested_time <= timedelta(hours=36):
        return (
            "CORe reanalysis data lag by 24-36 hours from the current time. "
            f"Try requesting a map prior to {_pretty_valid_time(requested_time)}."
        )
    return None


def _ignored_query_params(endpoint, request: Request) -> list[str]:
    supported = set(inspect.signature(endpoint).parameters) - {"request"}
    return sorted({key for key in request.query_params.keys() if key not in supported})


@app.get("/")
def root():
    return {
        "variables": list(VARIABLES.keys()),
        "levels": PRESSURE_LEVELS,
        "regions": list(REGIONS.keys()),
        "valid_hours": VALID_HOURS,
        "modes": list(VALID_MODES),
        "variable_aliases": {
            "cloud_cover": {
                "levels": ["total_column", "low", "middle", "high", "boundary", "convective"],
            },
            "radiation": {
                "levels": ["surface", "toa"],
                "wavebands": ["shortwave", "longwave"],
                "directions": ["down", "up"],
            },
            "lifted_index": {
                "levels": ["surface", "4-layer", "0-30mb"],
            },
        },
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
    level: str = "",
    waveband: str = "",
    direction: str = "",
    color_step: int = 1,
    mode: str = "raw",
    scale_min: float | None = None,
    scale_max: float | None = None,
    wind_unit: str = "kt",
    pwat_unit: str = "in",
    precip_unit: str = "in",
    precip_window: int = 3,
    temp_unit: str = "",
):
    try:
        resolved = resolve_variable_selection(variable, level, waveband=waveband, direction=direction)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    variable, level = resolved.variable, resolved.level
    _validate_common(variable, level, mode, wind_unit, pwat_unit, precip_unit, precip_window, scale_min, scale_max, color_step)
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
        precip_unit=precip_unit,
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
    # "" = no hour requested: a bare date expands to the daily synoptic
    # composite (Decision 2, docs/TIME_SELECTION_PLAN.md).
    hour: str = "",
    hours: str = "",
    # Canonical v2 time params — load-bearing only when time_scale is set.
    time_scale: str = "",
    times: str = "",
    start_time: str = "",
    end_time: str = "",
    end_date: str = "",
    start_month: str = "",
    end_month: str = "",
    month: str = "",
    variable: str = "wind_speed",
    level: str = "",
    waveband: str = "",
    direction: str = "",
    region: str = "CONUS",
    wind_step: int = 0,
    wind_type: str = "vectors",
    color_step: int = 1,
    scale_min: float | None = None,
    scale_max: float | None = None,
    scale_spec: str = "",
    mode: str = "raw",
    climo_source: str = "monthly-pgb",
    wind_unit: str = "kt",
    pwat_unit: str = "in",
    precip_unit: str = "in",
    precip_window: int = 3,
    start_date: str = "",
    start_hour: str = "",
    fill_mode: str = "contours",
    temp_unit: str = "",
    isotachs: int = 0,
    isotach_interval: int = 0,
    centers: int = 0,
    contours: str = "",
    skip_missing: int = 0,
):
    enforce_rate_limit(request, PUBLIC_MAP_LIMIT)
    ignored_params = _ignored_query_params(get_map, request)
    # Back-compat: isotachs was briefly a wind_type value.
    if wind_type == "isotachs":
        wind_type, wind_step, isotachs = "vectors", 0, 1
    # "Auto" density arrives as a negative sentinel. Resolve it here, at the
    # edge, so every downstream `wind_step > 0` gate (fetch planning, overlay
    # planning, rendering) keeps seeing a plain positive number (#45).
    if wind_step < 0:
        wind_step = DEFAULT_WIND_DENSITY
    try:
        resolved = resolve_variable_selection(variable, level, waveband=waveband, direction=direction)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    variable, level = resolved.variable, resolved.level
    if variable == "blank_map":
        mode = "raw"
    # precip_total is exempt from bare-date-means-daily (Decision 2): its
    # windows are anchored to an explicit ending hour, so the old 00z default
    # stands when no hour arrives.
    if variable == "precip_total" and not hour and not time_scale:
        hour = "00"
    # An accumulation over a time span is a precip_window question, not a mean
    # of members — the pairs fetch path deliberately has no precip_total entry.
    if variable == "precip_total" and time_scale == "3-hourly" and date_mode in {"range", "list"}:
        raise HTTPException(
            status_code=422,
            detail=(
                "precip_total does not support 3-hourly range/list selections; "
                "use a single ending time with precip_window for accumulations"
            ),
        )
    _validate_common(variable, level, mode, wind_unit, pwat_unit, precip_unit, precip_window, scale_min, scale_max, color_step)
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
    if not months and hour and hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"hour must be one of {VALID_HOURS}")
    _validate_precip_total_range_metadata(
        variable=variable,
        date=date,
        hour=hour,
        start_date=start_date,
        start_hour=start_hour,
        precip_window=precip_window,
    )
    # Single-hour products usually compare against a mean-only hourly baseline.
    # PWAT is allowed because it has an R2 daily centered 15-day mean/std path.
    # A bare date (hour absent) is a daily composite now, so it is exempt;
    # canonical 3-hourly selections are rejected as a class below.
    single_hour_normalized = (
        (not time_scale and bool(hour) and not hours and not months)
        or (time_scale == "3-hourly")
    )
    if mode == "normalized" and single_hour_normalized and variable != "precipitable_water":
        raise HTTPException(
            status_code=422,
            detail=(
                "normalized mode is not available for 3-hourly maps: the "
                "per-hour climatology has no standard deviation. Use the daily "
                "composite for normalized anomalies, or anomaly mode instead."
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
        if variable == "precip_total" and len(parsed_hours) != 1:
            raise HTTPException(
                status_code=422,
                detail="precip_total daily maps use one ending synoptic time.",
            )
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
    _validate_observation_months_available(months=months)
    _validate_observation_dates_available(date=date, dates=dates, start_date=start_date, months=months)
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"region must be one of {list(REGIONS.keys())}")
    if climo_source not in VALID_CLIMO_SOURCES:
        raise HTTPException(status_code=422, detail=f"climo_source must be one of {list(VALID_CLIMO_SOURCES)}")
    # Monthly obs composites are not wired for flx/named-level streams
    # (no ("monthly", "flx") obs fetcher) — a separate gap from climatology.
    # Climatology mode is exempt: it fetches no observations, and its month
    # arrives via the months param.
    if (
        is_surface_or_named_level(variable)
        and months
        and mode != "climatology"
        and not (
            VARIABLES.get(variable, {}).get("monthly_grib_name")
            or VARIABLES.get(variable, {}).get("monthly_grib_names")
        )
    ):
        raise HTTPException(
            status_code=422,
            detail="CORe surface/named-level starter fields currently support 3-hourly and daily maps only.",
        )

    map_request = MapRequest(
                date=date,
                dates=dates,
                date_mode=date_mode,
                months=months,
                hour=hour,
                hours=hours,
                time_scale=time_scale,
                times=times,
                start_time=start_time,
                end_time=end_time,
                start_date=start_date,
                end_date=end_date,
                start_month=start_month,
                end_month=end_month,
                month=month,
                variable=variable,
                level=level,
                region=region,
                wind_step=wind_step,
                wind_type=wind_type,
                color_step=color_step,
                scale_min=scale_min,
                scale_max=scale_max,
                scale_spec=scale_spec,
                mode=mode,
                climo_source=climo_source,
                wind_unit=wind_unit,
                pwat_unit=pwat_unit,
                precip_unit=precip_unit,
                fill_mode=fill_mode,
                temp_unit=temp_unit,
                precip_window=precip_window,
                isotachs=isotachs,
                isotach_interval=isotach_interval,
                centers=centers,
                contours=contours,
                skip_missing=skip_missing,
            )

    if variable != "blank_map":
        # Parse once up front: malformed time selections 422 here, and
        # canonical params (which bypass the legacy param-based guards above)
        # get their availability check from the expanded selection.
        selection_preview = parse_time_selection(map_request)
        if time_scale:
            _validate_observation_months_available(
                months=",".join(f"{y}{m:02d}" for y, m in selection_preview.year_months)
            )
            _validate_observation_dates_available(
                date="", dates=",".join(selection_preview.date_list), start_date="", months="",
            )

    try:
        buf = create_map_buffer(map_request)
        headers = {IGNORED_PARAMS_HEADER: ",".join(ignored_params)} if ignored_params else None
        return StreamingResponse(buf, media_type="image/png", headers=headers)
    except DataUnavailableError as exc:
        # Composite gaps ship a structured detail so the frontend can offer
        # an informed retry: truncate the range, or regenerate with
        # skip_missing=1 (#95).
        message = _recent_data_lag_message(exc) or str(exc)
        detail: object = message
        if getattr(exc, "missing", None):
            detail = {"message": message, "missing": exc.missing, "total": exc.total}
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

@app.get("/api/regions")
@app.get("/api/get-regions")
def return_regions():
    return describe_region_catalog(REGIONS)
