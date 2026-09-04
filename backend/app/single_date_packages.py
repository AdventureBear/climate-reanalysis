from __future__ import annotations

import io
import json
import os
import re
import shutil
import threading
import uuid
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import requests
from pydantic import BaseModel, Field, field_validator

from .config import CACHE_ROOT
from .map_pipeline.request import MapRequest
from .map_service import create_map_buffer
from .retrieval import DataUnavailableError
from .units import (
    VORTICITY_TO_1E5,
    celsius_to_fahrenheit,
    delta_celsius_to_delta_fahrenheit,
    kelvin_to_celsius,
    kelvin_to_fahrenheit,
    meters_per_second_to_knots,
    meters_to_inches,
    pascals_to_hpa,
    precipitation_rate_to_mm_day,
)

PACKAGE_CACHE_ROOT = Path(CACHE_ROOT) / "map_packages"
PACKAGE_ROOT = PACKAGE_CACHE_ROOT / "single_date"
GEOCODE_CACHE = PACKAGE_CACHE_ROOT / "geocode_cache.json"
# Deep links in generated packages point at the app host, where /map lives.
SITE_BASE = os.getenv("PYRE_SITE_BASE", "https://app.pyreweather.org").rstrip("/")
PACKAGE_TTL = timedelta(hours=24)
CLEANUP_INTERVAL = timedelta(minutes=30)
JOB_STATE_FILE = "job.json"

TRIG_NORM_ANOM_SIGMA = 2.0
TRIG_MSLP_MIN_HPA = 990.0
TRIG_PRECIP_MM_DAY = 10.0
TRIG_SNOW_TEMP_C = 0.0
TRIG_CAPE_JKG = 1000.0
TRIG_PWAT_SIGMA = 2.0
TRIG_JET_KT = 120.0
TRIG_CLEAR_PCT = 20.0
TRIG_OVERCAST_PCT = 90.0
TRIG_H500_SIGMA = 2.0
TRIG_VORT_1E5 = 20.0
TRIG_DEWPOINT_F = 70.0
TRIG_WIND_KT = 25.0
TRIG_SNOWPACK_IN = 6.0
TRIG_HOT_F = 95.0
TRIG_COLD_F = 0.0
TRIG_CAPPED_CAPE = 500.0
TRIG_CAPPED_CIN = 100.0
WINDOW_DEG = 10.0


class SingleDatePackageRequest(BaseModel):
    date: str = Field(..., description="Package date as YYYY-MM-DD or YYYYMMDD.")
    place: str = Field(..., min_length=2, max_length=160)
    name: str = Field(default="", max_length=80)
    time: str = Field(default="", description="Optional location-local time as HH:MM.")
    animate: bool = False

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        date = value.replace("-", "").strip()
        if not re.fullmatch(r"\d{8}", date):
            raise ValueError("date must be YYYY-MM-DD or YYYYMMDD")
        try:
            datetime.strptime(date, "%Y%m%d")
        except ValueError as exc:
            raise ValueError("date must be a real calendar date") from exc
        if date < "19500101":
            raise ValueError("date must be 1950-01-01 or later")
        return date

    @field_validator("place", "name")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        time_value = value.strip()
        if not time_value:
            return ""
        if not re.fullmatch(r"\d{2}:\d{2}", time_value):
            raise ValueError("time must be HH:MM")
        hour, minute = (int(part) for part in time_value.split(":"))
        if hour > 23 or minute > 59:
            raise ValueError("time must be HH:MM")
        return time_value


JobStatus = Literal["queued", "running", "done", "failed"]


@dataclass
class SingleDateJob:
    id: str
    status: JobStatus
    step: int
    total: int
    message: str
    output_dir: str
    request: dict[str, Any]
    result: dict[str, Any] | None = None
    error: str = ""


_JOBS: dict[str, SingleDateJob] = {}
_JOBS_LOCK = threading.Lock()
_GEOCODE_LOCK = threading.Lock()
_CLEANUP_LOCK = threading.Lock()
_LAST_CLEANUP = datetime.min.replace(tzinfo=timezone.utc)


def create_job(request: SingleDatePackageRequest) -> SingleDateJob:
    cleanup_expired_packages()
    PACKAGE_ROOT.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4().hex
    out_dir = PACKAGE_ROOT / job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    job = SingleDateJob(
        id=job_id,
        status="queued",
        step=0,
        total=10,
        message="Queued",
        output_dir=str(out_dir),
        request=request.model_dump(),
    )
    (out_dir / "request.json").write_text(json.dumps(job.request, indent=2) + "\n")
    _save_job(job)
    return job


def get_job(job_id: str) -> SingleDateJob | None:
    if not _valid_job_id(job_id):
        return None
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is not None:
        return job
    state = _read_job_state(job_id)
    if state is not None:
        return state
    manifest = _job_dir(job_id) / "manifest.json"
    if not manifest.exists():
        return None
    result = json.loads(manifest.read_text())
    return SingleDateJob(
        id=job_id,
        status="done",
        step=result.get("progress", {}).get("total", 10),
        total=result.get("progress", {}).get("total", 10),
        message="Complete",
        output_dir=str(_job_dir(job_id)),
        request=result.get("request", {}),
        result=result,
    )


def serialize_job(job: SingleDateJob) -> dict[str, Any]:
    payload = asdict(job)
    payload["status_url"] = f"/api/single-date-packages/{job.id}"
    if job.result is not None:
        payload["result"] = _with_file_urls(job.id, job.result)
    return payload


def package_file_path(job_id: str, filename: str) -> Path:
    if not _valid_job_id(job_id):
        raise FileNotFoundError(job_id)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", filename):
        raise FileNotFoundError(filename)
    path = _job_dir(job_id) / filename
    if path.suffix.lower() not in {".png", ".gif", ".txt", ".md", ".json"}:
        raise FileNotFoundError(filename)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(filename)
    return path


def build_zip(job_id: str) -> io.BytesIO:
    job = get_job(job_id)
    if job is None or job.status != "done":
        raise FileNotFoundError(job_id)
    out_dir = Path(job.output_dir)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(out_dir.iterdir()):
            if path.name == JOB_STATE_FILE:
                continue
            if path.suffix.lower() in {".png", ".gif", ".txt", ".md", ".json"}:
                zf.write(path, path.name)
    buf.seek(0)
    return buf


def run_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return
    request = SingleDatePackageRequest(**job.request)
    out_dir = Path(job.output_dir)

    try:
        _set_progress(job_id, "running", 1, 10, "Finding the location")
        lat, lon, place_display = geocode(request.place)

        _set_progress(job_id, "running", 2, 10, "Resolving local time")
        zone = timezone_for(lat, lon)
        time_params, valid_label, center = package_time_context(request.date, request.time, zone)

        _set_progress(job_id, "running", 3, 10, "Reading the date atmosphere")
        diagnostics = compute_diagnostics(request.date, lat, lon, zone)
        fired = evaluate_triggers(diagnostics, time_params)

        maps = base_maps(time_params)
        for _, extras in fired:
            maps.extend(extras)
        package_extras = package_render_extras(request, lat, lon)
        maps = [(slug, title, {**params, **package_extras}) for slug, title, params in maps]

        rendered: list[dict[str, Any]] = []
        total = len(maps) + (2 if request.animate else 1)
        for index, (slug, title, params) in enumerate(maps, start=1):
            _set_progress(job_id, "running", index, total, f"Rendering {title}")
            png = create_map_buffer(MapRequest(**params)).getvalue()
            filename = f"{index:02d}_{slug}.png"
            (out_dir / filename).write_bytes(png)
            rendered.append(
                {
                    "slug": slug,
                    "title": title,
                    "filename": filename,
                    "live_url": live_map_url(params),
                    "size_kb": len(png) // 1024,
                }
            )

        animation_filename = ""
        if request.animate:
            _set_progress(job_id, "running", len(maps) + 1, total, "Rendering animation")
            animation_filename = render_animation(center, out_dir, package_extras) or ""

        highlights = [line for line, _ in fired]
        summary_text = summary_lines(diagnostics, highlights, request.place, request.date)
        (out_dir / "summary.txt").write_text(summary_text + "\n")
        (out_dir / "links.md").write_text(links_text(rendered, valid_label) + "\n")

        result = {
            "id": job_id,
            "request": request.model_dump(),
            "date": request.date,
            "place": request.place,
            "place_display": place_display,
            "lat": round(lat, 3),
            "lon": round(lon, 3),
            "timezone": zone,
            "valid_label": valid_label,
            "maps": rendered,
            "animation_filename": animation_filename,
            "summary_text": summary_text,
            "highlights": highlights,
            "diagnostics": diagnostics,
            "progress": {"step": total, "total": total},
        }
        (out_dir / "manifest.json").write_text(json.dumps(result, indent=2) + "\n")
        _finish_job(job_id, result)
    except Exception as exc:
        _fail_job(job_id, str(exc))


def cleanup_expired_packages(now: datetime | None = None, *, force: bool = False) -> None:
    global _LAST_CLEANUP
    now = now or datetime.now(timezone.utc)
    if not force and now - _LAST_CLEANUP < CLEANUP_INTERVAL:
        return
    with _CLEANUP_LOCK:
        if not force and now - _LAST_CLEANUP < CLEANUP_INTERVAL:
            return
        _LAST_CLEANUP = now
        if not PACKAGE_ROOT.exists():
            return
        cutoff = now - PACKAGE_TTL
        for path in PACKAGE_ROOT.iterdir():
            if not path.is_dir() or not _valid_job_id(path.name):
                continue
            marker = path / JOB_STATE_FILE
            if not marker.exists():
                marker = path / "manifest.json"
            if not marker.exists():
                marker = path
            try:
                touched = datetime.fromtimestamp(marker.stat().st_mtime, tz=timezone.utc)
            except OSError:
                continue
            if touched >= cutoff:
                continue
            shutil.rmtree(path, ignore_errors=True)
            with _JOBS_LOCK:
                _JOBS.pop(path.name, None)


def daily_time_params(date: str) -> dict[str, Any]:
    # Canonical time params (docs/TIME_SELECTION_PLAN.md): daily implies the
    # four synoptic times, no hours param needed.
    return {"time_scale": "daily", "date_mode": "single", "date": date}


def moment_time_params(date: str, hour: str) -> dict[str, Any]:
    return {"time_scale": "3-hourly", "date_mode": "single", "date": date, "hour": hour}


def package_time_context(date: str, hhmm: str, zone: str) -> tuple[dict[str, Any], str, datetime]:
    if hhmm:
        moment_date, moment_hour = local_time_to_analysis(date, hhmm, zone)
        label = f"maps valid at the analysis nearest the selected time: {moment_date} {moment_hour}z ({hhmm} local)"
        center = datetime(
            int(moment_date[:4]),
            int(moment_date[4:6]),
            int(moment_date[6:]),
            int(moment_hour),
            tzinfo=timezone.utc,
        )
        return moment_time_params(moment_date, moment_hour), label, center

    label = "maps are means of the day"
    center = datetime(int(date[:4]), int(date[4:6]), int(date[6:]), 12, tzinfo=timezone.utc)
    return daily_time_params(date), label, center


def base_maps(time_params: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    return [
        (
            "500mb_height",
            "500mb Height",
            {
                **time_params,
                "variable": "height",
                "level": 500,
                "region": "CONUS",
                "fill_mode": "shaded",
                "contours": "height",
                "wind_step": 2,
                "wind_type": "barbs",
            },
        ),
        (
            "mslp_centers",
            "Surface Pressure",
            {
                **time_params,
                "variable": "surface_pressure",
                "region": "CONUS",
                "fill_mode": "shaded",
                "centers": 1,
            },
        ),
        ("2m_temp", "2m Temperature", {**time_params, "variable": "temp_2m", "region": "CONUS"}),
        (
            "2m_temp_anomaly",
            "2m Temperature Anomaly",
            {
                **time_params,
                "variable": "temp_2m",
                "region": "CONUS",
                "mode": "anomaly",
                "climo_source": "r2-daily",
            },
        ),
        (
            "300mb_jet",
            "300mb Wind",
            {
                **time_params,
                "variable": "wind_speed",
                "level": 300,
                "region": "CONUS",
                "wind_step": 2,
                "wind_type": "barbs",
            },
        ),
        (
            "850_temp_wind",
            "850mb Temperature With Wind Barbs",
            {
                **time_params,
                "variable": "temp",
                "level": 850,
                "region": "CONUS",
                "wind_step": 2,
                "wind_type": "barbs",
            },
        ),
    ]


def geocode(place: str) -> tuple[float, float, str]:
    PACKAGE_ROOT.mkdir(parents=True, exist_ok=True)
    key = place.strip().lower()
    with _GEOCODE_LOCK:
        cache: dict[str, Any] = {}
        if GEOCODE_CACHE.exists():
            cache = json.loads(GEOCODE_CACHE.read_text())
        if key in cache:
            record = cache[key]
            return float(record["lat"]), float(record["lon"]), record.get("display", "")

        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": place, "format": "json", "limit": 1},
            headers={"User-Agent": "PyRe-single-date-packages/1.0 (https://pyreweather.org)"},
            timeout=30,
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            raise ValueError(f"Could not geocode {place!r}. Try City, State or City, Country.")
        lat, lon = float(results[0]["lat"]), float(results[0]["lon"])
        display = results[0].get("display_name", "")
        cache[key] = {"lat": lat, "lon": lon, "display": display}
        GEOCODE_CACHE.write_text(json.dumps(cache, indent=2) + "\n")
        return lat, lon, display


def timezone_for(lat: float, lon: float) -> str:
    from timezonefinder import TimezoneFinder

    zone = TimezoneFinder().timezone_at(lat=lat, lng=lon)
    if zone is None:
        raise ValueError(f"No timezone found for {lat:.2f}, {lon:.2f}")
    return zone


def local_day_synoptic_times(date: str, zone: str) -> list[tuple[str, str]]:
    start_local = datetime(int(date[:4]), int(date[4:6]), int(date[6:]), tzinfo=ZoneInfo(zone))
    start_utc = start_local.astimezone(timezone.utc)
    times = []
    t = start_utc.replace(minute=0, second=0, microsecond=0)
    if t.hour % 6:
        t += timedelta(hours=6 - t.hour % 6)
    while t < start_utc + timedelta(hours=24):
        d = t.strftime("%Y%m%d")
        if d >= "19500101":
            times.append((d, t.strftime("%H")))
        t += timedelta(hours=6)
    return times


def local_time_to_analysis(date: str, hhmm: str, zone: str) -> tuple[str, str]:
    hour, minute = (int(p) for p in hhmm.split(":"))
    local = datetime(int(date[:4]), int(date[4:6]), int(date[6:]), hour, minute, tzinfo=ZoneInfo(zone))
    utc = local.astimezone(timezone.utc)
    slot = round((utc.hour * 60 + utc.minute) / 180)
    analysis = utc.replace(hour=0, minute=0) + timedelta(hours=3 * slot)
    return analysis.strftime("%Y%m%d"), analysis.strftime("%H")


def compute_diagnostics(date: str, lat: float, lon: float, zone: str) -> dict[str, Any]:
    from app.climo_r2 import get_r2_daily_climo_field, get_r2_daily_climo_single_level
    from app.config import VARIABLES
    from app.retrieval import (
        _mean_of_pairs,
        fetch_field,
        fetch_field_by_level_name,
        fetch_flx_field,
        fetch_wind_speed,
    )

    pairs = local_day_synoptic_times(date, zone)
    month, day = int(date[4:6]), int(date[6:])
    if (month, day) == (2, 29):
        month, day = 2, 28

    def attempt(fn):
        try:
            return fn()
        except Exception:
            return None

    t2m = _mean_of_pairs(fetch_flx_field, pairs, "TMP", "2 m above ground")
    tcdc = _mean_of_pairs(fetch_flx_field, pairs, "TCDC", "atmos col")
    prate = _mean_of_pairs(fetch_flx_field, pairs, "PRATE", "surface")
    snod = _mean_of_pairs(fetch_flx_field, pairs, "SNOD", "surface")
    pwat = _mean_of_pairs(fetch_flx_field, pairs, "PWAT", "atmos col")
    jet = _mean_of_pairs(fetch_wind_speed, pairs, 300)
    h500 = _mean_of_pairs(fetch_field, pairs, "HGT", 500)
    vort = attempt(lambda: _mean_of_pairs(fetch_field, pairs, "ABSV", 500))
    wind10 = attempt(lambda: _mean_of_pairs(fetch_flx_field, pairs, "WIND", "10 m above ground"))
    dewpoint = attempt(lambda: _mean_of_pairs(fetch_field_by_level_name, pairs, "DPT", "2 m above ground"))

    mslp_pt_sum, mslp_min = 0.0, float("inf")
    cape_max, cin_at_peak = 0.0, 0.0
    t2m_max, t2m_min = -float("inf"), float("inf")
    for d, h in pairs:
        mslp = fetch_field_by_level_name(d, h, "MSLET", "mean sea level")
        mslp_pt_sum += _sample(mslp, lat, lon)
        mslp_min = min(mslp_min, _window_extreme(mslp, lat, lon, lambda b: b.min()))
        cape_h = _sample(fetch_field_by_level_name(d, h, "CAPE", "surface"), lat, lon)
        if cape_h > cape_max:
            cape_max = cape_h
            cin = attempt(lambda d=d, h=h: _sample(fetch_field_by_level_name(d, h, "CIN", "surface"), lat, lon))
            cin_at_peak = abs(cin) if cin is not None else 0.0
        t2m_h = _sample(fetch_flx_field(d, h, "TMP", "2 m above ground"), lat, lon)
        t2m_max, t2m_min = max(t2m_max, t2m_h), min(t2m_min, t2m_h)

    t2m_mean, t2m_std = get_r2_daily_climo_single_level(VARIABLES["temp_2m"]["r2_climo"], month, day)
    pwat_mean, pwat_std = get_r2_daily_climo_single_level(VARIABLES["precipitable_water"]["r2_climo"], month, day)
    h500_climo = attempt(lambda: get_r2_daily_climo_field(month, day, "HGT", 500))

    t2m_pt = _sample(t2m, lat, lon)
    t2m_anom = t2m_pt - _sample(t2m_mean, lat, lon)
    t2m_sigma = t2m_anom / max(_sample(t2m_std, lat, lon), 0.1)
    pwat_pt = _sample(pwat, lat, lon)
    pwat_sigma = (pwat_pt - _sample(pwat_mean, lat, lon)) / max(_sample(pwat_std, lat, lon), 0.1)
    h500_sigma = None
    if h500_climo is not None:
        h500_mean, h500_std = h500_climo
        h500_sigma = (_sample(h500, lat, lon) - _sample(h500_mean, lat, lon)) / max(_sample(h500_std, lat, lon), 0.1)

    return {
        "t2m_c": kelvin_to_celsius(t2m_pt),
        "t2m_anom_c": t2m_anom,
        "t2m_sigma": t2m_sigma,
        "t2m_max_f": kelvin_to_fahrenheit(t2m_max),
        "t2m_min_f": kelvin_to_fahrenheit(t2m_min),
        "mslp_pt_hpa": pascals_to_hpa(mslp_pt_sum / len(pairs)),
        "mslp_min_hpa": pascals_to_hpa(mslp_min),
        "cloud_pct": _sample(tcdc, lat, lon),
        "precip_mm_day": precipitation_rate_to_mm_day(_sample(prate, lat, lon)),
        "snow_depth_in": meters_to_inches(_sample(snod, lat, lon)),
        "cape_jkg": cape_max,
        "cin_at_peak": cin_at_peak,
        "pwat_mm": pwat_pt,
        "pwat_sigma": pwat_sigma,
        "jet_max_kt": meters_per_second_to_knots(_window_extreme(jet, lat, lon, lambda b: b.max())),
        "h500_sigma": h500_sigma,
        "vort_1e5": None if vort is None else _window_extreme(vort, lat, lon, lambda b: b.max()) * VORTICITY_TO_1E5,
        "wind10_kt": None if wind10 is None else meters_per_second_to_knots(_sample(wind10, lat, lon)),
        "dewpoint_f": None if dewpoint is None else kelvin_to_fahrenheit(_sample(dewpoint, lat, lon)),
    }


def evaluate_triggers(
    diag: dict[str, Any],
    time_params: dict[str, Any],
) -> list[tuple[str, list[tuple[str, str, dict[str, Any]]]]]:
    fired: list[tuple[str, list[tuple[str, str, dict[str, Any]]]]] = []

    if abs(diag["t2m_sigma"]) >= TRIG_NORM_ANOM_SIGMA:
        kind = "warm" if diag["t2m_sigma"] > 0 else "cold"
        fired.append(
            (
                f"Exceptionally {kind} day: 2m temp {diag['t2m_sigma']:+.1f} sigma from normal",
                [
                    (
                        "2m_temp_normalized",
                        "2m Temperature in Standard Deviations",
                        {
                            **time_params,
                            "variable": "temp_2m",
                            "region": "CONUS",
                            "mode": "normalized",
                            "climo_source": "r2-daily",
                        },
                    )
                ],
            )
        )

    if diag["mslp_min_hpa"] <= TRIG_MSLP_MIN_HPA:
        fired.append(
            (
                f"Deep low nearby: {diag['mslp_min_hpa']:.0f} hPa within {WINDOW_DEG:.0f} degrees of the location",
                [
                    (
                        "storm_closeup",
                        "Storm Close-up",
                        {
                            **time_params,
                            "variable": "surface_pressure",
                            "region": "CONUS",
                            "fill_mode": "shaded",
                            "centers": 1,
                            "wind_step": 2,
                            "wind_type": "barbs",
                        },
                    )
                ],
            )
        )

    snow_map = ("snow_depth", "Snow Depth", {**time_params, "variable": "snow_depth", "region": "CONUS"})
    snow_map_added = False

    if diag["precip_mm_day"] >= TRIG_PRECIP_MM_DAY:
        extras = [("precip", "Precipitation Rate", {**time_params, "variable": "precip_rate", "region": "CONUS"})]
        line = f"Wet day: {diag['precip_mm_day']:.0f} mm/day at the location"
        if diag["t2m_c"] <= TRIG_SNOW_TEMP_C:
            extras.append(snow_map)
            snow_map_added = True
            line = f"Snowy day: {diag['precip_mm_day']:.0f} mm/day with 2m temp below freezing"
        fired.append((line, extras))

    if diag["snow_depth_in"] >= TRIG_SNOWPACK_IN:
        fired.append(
            (f"Snow-covered location: {diag['snow_depth_in']:.0f} in on the ground", [] if snow_map_added else [snow_map])
        )

    if diag["cape_jkg"] >= TRIG_CAPE_JKG:
        fired.append(
            (
                f"Severe-weather day: CAPE {diag['cape_jkg']:.0f} J/kg",
                [("cape", "CAPE", {**time_params, "variable": "cape", "region": "CONUS"})],
            )
        )

    if diag["pwat_sigma"] >= TRIG_PWAT_SIGMA:
        fired.append(
            (
                f"Moisture plume: PWAT {diag['pwat_sigma']:+.1f} sigma above normal",
                [("pwat", "Precipitable Water", {**time_params, "variable": "precipitable_water", "region": "CONUS"})],
            )
        )

    if diag["jet_max_kt"] >= TRIG_JET_KT:
        fired.append((f"Jet overhead: 300mb max {diag['jet_max_kt']:.0f} kt nearby", []))
    if diag["cloud_pct"] <= TRIG_CLEAR_PCT:
        fired.append((f"Bluebird day: only {diag['cloud_pct']:.0f}% 3-hour average cloud cover", []))
    elif diag["cloud_pct"] >= TRIG_OVERCAST_PCT:
        fired.append((f"Socked in: {diag['cloud_pct']:.0f}% 3-hour average cloud cover", []))
    if diag["h500_sigma"] is not None and abs(diag["h500_sigma"]) >= TRIG_H500_SIGMA:
        shape = "monster ridge" if diag["h500_sigma"] > 0 else "deep trough"
        fired.append(
            (
                f"Pattern highlight: {shape}, with 500mb heights {diag['h500_sigma']:+.1f} sigma from normal",
                [
                    (
                        "500mb_height_anomaly",
                        "500mb Height Anomaly",
                        {
                            **time_params,
                            "variable": "height",
                            "level": 500,
                            "region": "CONUS",
                            "mode": "anomaly",
                            "climo_source": "r2-daily",
                            "wind_step": 2,
                            "wind_type": "barbs",
                        },
                    )
                ],
            )
        )
    if diag["vort_1e5"] is not None and diag["vort_1e5"] >= TRIG_VORT_1E5:
        fired.append(
            (
                f"Shortwave overhead: 500mb vorticity max {diag['vort_1e5']:.0f} x 10^-5/s nearby",
                [("vorticity", "500mb Absolute Vorticity", {**time_params, "variable": "absv", "level": 500, "region": "CONUS"})],
            )
        )
    if diag["dewpoint_f"] is not None and diag["dewpoint_f"] >= TRIG_DEWPOINT_F:
        fired.append(
            (
                f"Sultry day: 2m dewpoint {diag['dewpoint_f']:.0f} F",
                [("dewpoint", "2m Dewpoint", {**time_params, "variable": "dewpoint_2m", "region": "CONUS"})],
            )
        )
    if diag["wind10_kt"] is not None and diag["wind10_kt"] >= TRIG_WIND_KT:
        fired.append(
            (
                f"Windy day: 10m wind averaged {diag['wind10_kt']:.0f} kt at the location",
                [
                    (
                        "wind_10m",
                        "10m Wind",
                        {**time_params, "variable": "wind_10m", "region": "CONUS", "wind_step": 2, "wind_type": "barbs"},
                    )
                ],
            )
        )
    if diag["t2m_max_f"] >= TRIG_HOT_F:
        fired.append((f"Scorcher: hit {diag['t2m_max_f']:.0f} F", []))
    if diag["t2m_min_f"] <= TRIG_COLD_F:
        fired.append((f"Deep freeze: fell to {diag['t2m_min_f']:.0f} F", []))
    if diag["cape_jkg"] >= TRIG_CAPPED_CAPE and diag["cape_jkg"] < TRIG_CAPE_JKG and diag["cin_at_peak"] >= TRIG_CAPPED_CIN:
        fired.append(
            (
                f"The storm that was capped: {diag['cape_jkg']:.0f} J/kg of fuel held down by {diag['cin_at_peak']:.0f} J/kg of cap",
                [],
            )
        )
    return fired


def render_animation(center: datetime, out_dir: Path, package_extras: dict[str, Any]) -> str | None:
    from PIL import Image

    frames = []
    for step in range(-4, 5):
        t = center + timedelta(hours=6 * step)
        if t.strftime("%Y%m%d") < "19500101":
            continue
        try:
            png = create_map_buffer(
                MapRequest(
                    variable="temp_2m",
                    region="CONUS",
                    centers=1,
                    contours="pressure",
                    wind_step=2,
                    wind_type="barbs",
                    date=t.strftime("%Y%m%d"),
                    date_mode="single",
                    hour=t.strftime("%H"),
                    **package_extras,
                )
            ).getvalue()
        except DataUnavailableError:
            continue
        frames.append(Image.open(io.BytesIO(png)).convert("P", palette=Image.ADAPTIVE))
    if len(frames) < 2:
        return None
    filename = "package.gif"
    frames[0].save(out_dir / filename, save_all=True, append_images=frames[1:], duration=600, loop=0)
    return filename


def summary_lines(diag: dict[str, Any], highlights: list[str], place: str, date: str) -> str:
    temp_f = celsius_to_fahrenheit(diag["t2m_c"])
    lines = [
        f"Your date in numbers - {date[:4]}-{date[4:6]}-{date[6:]} at {place}",
        "",
        f"2m temperature      : {temp_f:.0f} F ({diag['t2m_c']:.1f} C)",
        f"vs normal           : {delta_celsius_to_delta_fahrenheit(diag['t2m_anom_c']):+.0f} F ({diag['t2m_sigma']:+.1f} sigma)",
        f"day's high / low    : {diag['t2m_max_f']:.0f} / {diag['t2m_min_f']:.0f} F (analysis extremes)",
        f"sky cover (3h avg)  : {diag['cloud_pct']:.0f}% ({_sky_words(diag['cloud_pct'])})",
        _line_or_na("dewpoint            : {:.0f} F", diag["dewpoint_f"]),
        _line_or_na("10m wind            : {:.0f} kt", diag["wind10_kt"]),
        _line_or_na("500mb heights       : {:+.1f} sigma from normal", diag["h500_sigma"]),
        _line_or_na("500mb vort max      : {:.0f} x 10^-5/s nearby", diag["vort_1e5"]),
        f"sea-level pressure  : {diag['mslp_pt_hpa']:.0f} hPa (lowest analysis nearby: {diag['mslp_min_hpa']:.0f} hPa)",
        f"precipitation       : {diag['precip_mm_day']:.1f} mm/day",
        f"snow depth          : {diag['snow_depth_in']:.1f} in",
        f"CAPE day's peak     : {diag['cape_jkg']:.0f} J/kg",
        f"precipitable water  : {diag['pwat_mm']:.0f} mm ({diag['pwat_sigma']:+.1f} sigma)",
        f"300mb jet max nearby: {diag['jet_max_kt']:.0f} kt",
        "",
    ]
    if highlights:
        lines.append("What made this day special:")
        lines.extend(f"* {line}" for line in highlights)
    else:
        lines.append("A quiet, well-behaved day - the base maps tell the whole story.")
    return "\n".join(lines)


def links_text(rendered: list[dict[str, Any]], valid_label: str) -> str:
    lines = ["# Map package - open any map live", "", f"_{valid_label}_", ""]
    for item in rendered:
        lines.append(f"- [{item['title']}]({item['live_url']})")
    return "\n".join(lines)


def live_map_url(params: dict[str, Any]) -> str:
    link_params = {key: value for key, value in params.items() if key not in {"marker", "title_note"}}
    return f"{SITE_BASE}/map?{urlencode(link_params)}"


def package_render_extras(request: SingleDatePackageRequest, lat: float, lon: float) -> dict[str, str]:
    y, mo, d = int(request.date[:4]), int(request.date[4:6]), int(request.date[6:])
    if request.time:
        h, mi = (int(p) for p in request.time.split(":"))
        when = _format_datetime(datetime(y, mo, d, h, mi))
    else:
        when = _format_date(datetime(y, mo, d))
    who = f"{request.name.strip().title()}'s" if request.name else "A"
    return {
        "marker": f"{lat:.3f},{lon:.3f}",
        "title_note": f"{who} - {when}",
    }


def _sample(da, lat: float, lon: float) -> float:
    return float(da.sel(latitude=lat, longitude=lon % 360, method="nearest"))


def _window_extreme(da, lat: float, lon: float, fn) -> float:
    lon360 = lon % 360
    box = da.sel(
        latitude=slice(lat + WINDOW_DEG, lat - WINDOW_DEG),
        longitude=slice(max(0, lon360 - WINDOW_DEG), min(360, lon360 + WINDOW_DEG)),
    )
    return float(fn(box))


def _line_or_na(template: str, value: Any) -> str:
    label = template.split(":")[0]
    return template.format(value) if value is not None else f"{label}: n/a"


def _sky_words(pct: float) -> str:
    if pct <= 10:
        return "clear"
    if pct <= 30:
        return "mostly sunny"
    if pct <= 60:
        return "partly cloudy"
    if pct <= 85:
        return "mostly cloudy"
    return "overcast"


def _format_date(value: datetime) -> str:
    return f"{value:%B} {value.day}, {value:%Y}"


def _format_datetime(value: datetime) -> str:
    hour = value.strftime("%I").lstrip("0") or "0"
    return f"{value:%B} {value.day}, {value:%Y} {hour}:{value:%M} {value:%p}"


def _with_file_urls(job_id: str, result: dict[str, Any]) -> dict[str, Any]:
    updated = dict(result)
    maps = []
    for item in result.get("maps", []):
        with_url = dict(item)
        with_url["url"] = f"/api/single-date-packages/{job_id}/files/{item['filename']}"
        maps.append(with_url)
    updated["maps"] = maps
    if result.get("animation_filename"):
        updated["animation_url"] = f"/api/single-date-packages/{job_id}/files/{result['animation_filename']}"
    updated["download_url"] = f"/api/single-date-packages/{job_id}/download"
    updated["summary_url"] = f"/api/single-date-packages/{job_id}/files/summary.txt"
    updated["links_url"] = f"/api/single-date-packages/{job_id}/files/links.md"
    return updated


def _save_job(job: SingleDateJob) -> None:
    with _JOBS_LOCK:
        _JOBS[job.id] = job
    _write_job_state(job)


def _set_progress(job_id: str, status: JobStatus, step: int, total: int, message: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS[job_id]
        job.status = status
        job.step = step
        job.total = total
        job.message = message
    _write_job_state(job)


def _finish_job(job_id: str, result: dict[str, Any]) -> None:
    with _JOBS_LOCK:
        job = _JOBS[job_id]
        job.status = "done"
        job.step = result["progress"]["step"]
        job.total = result["progress"]["total"]
        job.message = "Complete"
        job.result = result
    _write_job_state(job)


def _fail_job(job_id: str, error: str) -> None:
    with _JOBS_LOCK:
        job = _JOBS[job_id]
        job.status = "failed"
        job.message = "Failed"
        job.error = error
    _write_job_state(job)


def _valid_job_id(job_id: str) -> bool:
    return bool(re.fullmatch(r"[a-f0-9]{32}", job_id))


def _job_dir(job_id: str) -> Path:
    if not _valid_job_id(job_id):
        raise FileNotFoundError(job_id)
    return PACKAGE_ROOT / job_id


def _job_state_path(job_id: str) -> Path:
    return _job_dir(job_id) / JOB_STATE_FILE


def _read_job_state(job_id: str) -> SingleDateJob | None:
    path = _job_state_path(job_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        job = SingleDateJob(**data)
    except (OSError, TypeError, ValueError):
        return None
    if job.result is None and job.status in {"queued", "running"}:
        job.status = "failed"
        job.message = "Interrupted"
        job.error = "Package generation was interrupted. Please start a new package."
        _write_job_state(job)
    return job


def _write_job_state(job: SingleDateJob) -> None:
    out_dir = Path(job.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / JOB_STATE_FILE
    tmp = out_dir / f"{JOB_STATE_FILE}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(asdict(job), indent=2) + "\n")
    os.replace(tmp, path)
