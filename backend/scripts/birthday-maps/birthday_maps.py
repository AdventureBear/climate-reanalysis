"""Birthday maps: a novelty packet of weather maps for a friend's birth date.

The birthplace is a probe point, not a map region: the pipeline samples what
the atmosphere was doing over that spot and uses it to decide which extra maps
the day earned (snowstorm birthday, severe-weather birthday, ...). Fully
local — renders in-process through the same code path as /api/map, writes to
scripts/birthday-maps/out/<name-or-date>/.

Usage (from backend/):
    uv run python scripts/birthday-maps/birthday_maps.py 19750727 "Pittsburgh, PA" \
        --name steve [--time 07:14] [--animate]

--time is the birth time in the BIRTHPLACE's local clock; it is converted to
UTC with historical DST rules and adds a birth-moment map. Without --time the
packet is daily-mean composites only.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

import requests  # noqa: E402

SITE_BASE = "https://pyreweather.org"
OUT_ROOT = SCRIPT_DIR / "out"
GEOCODE_CACHE = OUT_ROOT / "geocode_cache.json"
SYNOPTIC_HOURS = "00,06,12,18"

# ── Trigger thresholds (first guesses — tune after seeing real output) ────────
TRIG_NORM_ANOM_SIGMA = 2.0     # |2m temp anomaly| in climatological σ
TRIG_MSLP_MIN_HPA = 990.0      # deep low anywhere in the ±10° window
TRIG_PRECIP_MM_DAY = 10.0      # daily-mean precip at the birthplace
TRIG_SNOW_TEMP_C = 0.0         # precip counts as snow at/below this 2m temp
TRIG_CAPE_JKG = 1000.0         # severe-weather birthday
TRIG_PWAT_SIGMA = 2.0          # moisture plume vs climatology
TRIG_JET_KT = 120.0            # 300mb max in the window (flagged, map in base)
TRIG_CLEAR_PCT = 20.0          # bluebird day: local-day mean cloud cover below
TRIG_OVERCAST_PCT = 90.0       # socked in: local-day mean cloud cover above
TRIG_H500_SIGMA = 2.0          # 500mb height anomaly: monster ridge / deep trough
TRIG_VORT_1E5 = 20.0           # 500mb absolute vorticity window max, 10⁻⁵/s
TRIG_DEWPOINT_F = 70.0         # sultry: local-day mean 2m dewpoint at or above
TRIG_WIND_KT = 25.0            # windy: local-day mean 10m wind at the point
TRIG_SNOWPACK_IN = 6.0         # standing snowpack, precip or not
TRIG_HOT_F = 95.0              # analysis max reached (flag only, map in base)
TRIG_COLD_F = 0.0              # analysis min reached (flag only, map in base)
TRIG_CAPPED_CAPE = 500.0       # capped day: this much fuel...
TRIG_CAPPED_CIN = 100.0        # ...held down by at least this much inhibition
WINDOW_DEG = 10.0              # half-width of the "near the birthplace" window


# Time params for every map in the packet: a daily mean without --time, or the
# single 3-hourly analysis nearest the birth moment with it.
def daily_time_params(date: str) -> dict:
    return {"date": date, "date_mode": "single", "hours": SYNOPTIC_HOURS}


def moment_time_params(date: str, hour: str) -> dict:
    return {"date": date, "date_mode": "single", "hour": hour}


# (slug, title, params) — params are /api/map query params; also the deep link.
def base_maps(time_params: dict) -> list[tuple[str, str, dict]]:
    return [
        ("500mb_height", "500mb Height (the day's fingerprint)",
         {**time_params, "variable": "height", "level": 500, "region": "CONUS",
          "fill_mode": "shaded", "contours": "height",
          "wind_step": 2, "wind_type": "barbs"}),
        ("mslp_centers", "Surface pressure with Highs and Lows",
         {**time_params, "variable": "surface_pressure", "region": "CONUS",
          "fill_mode": "shaded", "centers": 1}),
        ("2m_temp", "2m Temperature",
         {**time_params, "variable": "temp_2m", "region": "CONUS"}),
        ("2m_temp_anomaly", "2m Temperature anomaly (how unusual was it?)",
         {**time_params, "variable": "temp_2m", "region": "CONUS",
          "mode": "anomaly", "climo_source": "r2-daily"}),
        ("300mb_jet", "300mb Wind (where the jet was)",
         {**time_params, "variable": "wind_speed", "level": 300, "region": "CONUS",
          "wind_step": 2, "wind_type": "barbs"}),
        ("850_temp_wind", "850mb Temperature with wind barbs",
         {**time_params, "variable": "temp", "level": 850, "region": "CONUS",
          "wind_step": 2, "wind_type": "barbs"}),
    ]


# ── Geocoding + local time ────────────────────────────────────────────────────

def geocode(place: str) -> tuple[float, float]:
    """City/state → (lat, lon) via Nominatim, cached on disk per place."""
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    cache: dict = {}
    if GEOCODE_CACHE.exists():
        cache = json.loads(GEOCODE_CACHE.read_text())
    key = place.strip().lower()
    if key in cache:
        return cache[key]["lat"], cache[key]["lon"]

    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": place, "format": "json", "limit": 1},
        headers={"User-Agent": "PyRe-birthday-maps/1.0 (personal novelty script)"},
        timeout=30,
    )
    r.raise_for_status()
    results = r.json()
    if not results:
        raise SystemExit(f"Could not geocode {place!r} — try 'City, State' or 'City, Country'.")
    lat, lon = float(results[0]["lat"]), float(results[0]["lon"])
    cache[key] = {"lat": lat, "lon": lon, "display": results[0].get("display_name", "")}
    GEOCODE_CACHE.write_text(json.dumps(cache, indent=2))
    print(f"geocoded {place!r} → {lat:.3f}, {lon:.3f}  ({results[0].get('display_name', '')})")
    return lat, lon


def timezone_for(lat: float, lon: float) -> str:
    from timezonefinder import TimezoneFinder

    zone = TimezoneFinder().timezone_at(lat=lat, lng=lon)
    if zone is None:
        raise SystemExit(f"No timezone found for {lat:.2f}, {lon:.2f}")
    return zone


def local_day_synoptic_times(date: str, zone: str) -> list[tuple[str, str]]:
    """The synoptic analyses (00/06/12/18z) that fall inside the birthplace's
    LOCAL calendar day. A birthday is a local-time concept: the evening of the
    Palm Sunday 1965 outbreak is 00z on April 12 UTC — a UTC-day scan misses it.
    """
    start_local = datetime(int(date[:4]), int(date[4:6]), int(date[6:]), tzinfo=ZoneInfo(zone))
    start_utc = start_local.astimezone(timezone.utc)
    times = []
    t = start_utc.replace(minute=0, second=0, microsecond=0)
    if t.hour % 6:
        t += timedelta(hours=6 - t.hour % 6)
    while t < start_utc + timedelta(hours=24):
        d = t.strftime("%Y%m%d")
        if d >= "19500101":  # archive start
            times.append((d, t.strftime("%H")))
        t += timedelta(hours=6)
    return times


def local_time_to_analysis(date: str, hhmm: str, zone: str) -> tuple[str, str]:
    """Local birth time → (UTC date YYYYMMDD, nearest 3-hourly analysis 'HH').

    zoneinfo's IANA database applies the DST rules in force on the birth date
    itself (1970s Indiana, wartime rules, ...), not today's rules.
    """
    hour, minute = (int(p) for p in hhmm.split(":"))
    local = datetime(int(date[:4]), int(date[4:6]), int(date[6:]), hour, minute,
                     tzinfo=ZoneInfo(zone))
    utc = local.astimezone(timezone.utc)
    # Round to the nearest 3-hourly analysis; may roll into the adjacent day.
    slot = round((utc.hour * 60 + utc.minute) / 180)
    analysis = utc.replace(hour=0, minute=0) + timedelta(hours=3 * slot)
    print(f"birth moment: {local:%Y-%m-%d %H:%M} {zone} = {utc:%Y-%m-%d %H:%M} UTC "
          f"→ {analysis:%Y%m%d} {analysis:%H}z analysis")
    return analysis.strftime("%Y%m%d"), analysis.strftime("%H")


# ── Point diagnostics ─────────────────────────────────────────────────────────

def _sample(da, lat: float, lon: float) -> float:
    return float(da.sel(latitude=lat, longitude=lon % 360, method="nearest"))


def _window_extreme(da, lat: float, lon: float, fn) -> float:
    """min/max over the ±WINDOW_DEG box around the point (no dateline wrap)."""
    lon360 = lon % 360
    box = da.sel(latitude=slice(lat + WINDOW_DEG, lat - WINDOW_DEG),
                 longitude=slice(max(0, lon360 - WINDOW_DEG), min(360, lon360 + WINDOW_DEG)))
    return float(fn(box))


def compute_diagnostics(date: str, lat: float, lon: float, zone: str) -> dict:
    """Sample the birthplace's LOCAL day at the birthplace.

    Slow fields (temperature, moisture, snow) use the local-day mean.
    Episodic fields (MSLP, CAPE) use the extreme across the local day's
    analyses — a daily mean smears a passing low or an evening CAPE peak
    into invisibility (the Palm Sunday 1965 test case).
    """
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

    def attempt(label, fn):
        """Optional diagnostics: a field missing in this archive era becomes
        None ('n/a' in the summary) and its trigger stays quiet, instead of
        killing the whole packet."""
        try:
            return fn()
        except Exception as exc:
            print(f"  {label} unavailable for this date ({exc}) — skipped")
            return None

    print(f"fetching the local day's analyses for diagnostics: "
          f"{', '.join(f'{d} {h}z' for d, h in pairs)}")
    t2m = _mean_of_pairs(fetch_flx_field, pairs, "TMP", "2 m above ground")
    tcdc = _mean_of_pairs(fetch_flx_field, pairs, "TCDC", "atmos col")
    prate = _mean_of_pairs(fetch_flx_field, pairs, "PRATE", "surface")
    snod = _mean_of_pairs(fetch_flx_field, pairs, "SNOD", "surface")
    pwat = _mean_of_pairs(fetch_flx_field, pairs, "PWAT", "atmos col")
    jet = _mean_of_pairs(fetch_wind_speed, pairs, 300)
    h500 = _mean_of_pairs(fetch_field, pairs, "HGT", 500)
    vort = attempt("500mb vorticity", lambda: _mean_of_pairs(fetch_field, pairs, "ABSV", 500))
    wind10 = attempt("10m wind", lambda: _mean_of_pairs(
        fetch_flx_field, pairs, "WIND", "10 m above ground"))
    dewpoint = attempt("2m dewpoint", lambda: _mean_of_pairs(
        fetch_field_by_level_name, pairs, "DPT", "2 m above ground"))

    # Episodic: track the extreme analysis, not the mean.
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
            cin = attempt("CIN", lambda d=d, h=h: _sample(
                fetch_field_by_level_name(d, h, "CIN", "surface"), lat, lon))
            cin_at_peak = abs(cin) if cin is not None else 0.0
        t2m_h = _sample(fetch_flx_field(d, h, "TMP", "2 m above ground"), lat, lon)
        t2m_max, t2m_min = max(t2m_max, t2m_h), min(t2m_min, t2m_h)

    print("fetching climatology (2m temp, PWAT, 500mb height) ...")
    t2m_mean, t2m_std = get_r2_daily_climo_single_level(
        VARIABLES["temp_2m"]["r2_climo"], month, day)
    pwat_mean, pwat_std = get_r2_daily_climo_single_level(
        VARIABLES["precipitable_water"]["r2_climo"], month, day)
    h500_climo = attempt("500mb height climatology",
                         lambda: get_r2_daily_climo_field(month, day, "HGT", 500))

    t2m_pt = _sample(t2m, lat, lon)
    t2m_anom = t2m_pt - _sample(t2m_mean, lat, lon)
    t2m_sigma = t2m_anom / max(_sample(t2m_std, lat, lon), 0.1)
    pwat_pt = _sample(pwat, lat, lon)
    pwat_sigma = (pwat_pt - _sample(pwat_mean, lat, lon)) / max(_sample(pwat_std, lat, lon), 0.1)
    h500_sigma = None
    if h500_climo is not None:
        h500_mean, h500_std = h500_climo
        h500_sigma = (_sample(h500, lat, lon) - _sample(h500_mean, lat, lon)) \
            / max(_sample(h500_std, lat, lon), 0.1)

    def to_f(kelvin: float) -> float:
        return (kelvin - 273.15) * 9 / 5 + 32

    return {
        "t2m_c": t2m_pt - 273.15,
        "t2m_anom_c": t2m_anom,
        "t2m_sigma": t2m_sigma,
        "t2m_max_f": to_f(t2m_max),
        "t2m_min_f": to_f(t2m_min),
        "mslp_pt_hpa": mslp_pt_sum / len(pairs) / 100.0,
        "mslp_min_hpa": mslp_min / 100.0,
        "cloud_pct": _sample(tcdc, lat, lon),
        "precip_mm_day": _sample(prate, lat, lon) * 86400.0,
        "snow_depth_in": _sample(snod, lat, lon) * 39.3701,
        "cape_jkg": cape_max,
        "cin_at_peak": cin_at_peak,
        "pwat_mm": pwat_pt,
        "pwat_sigma": pwat_sigma,
        "jet_max_kt": _window_extreme(jet, lat, lon, lambda b: b.max()) * 1.94384,
        "h500_sigma": h500_sigma,
        "vort_1e5": None if vort is None else
            _window_extreme(vort, lat, lon, lambda b: b.max()) * 1e5,
        "wind10_kt": None if wind10 is None else _sample(wind10, lat, lon) * 1.94384,
        "dewpoint_f": None if dewpoint is None else to_f(_sample(dewpoint, lat, lon)),
    }


# ── Triggers: condition → extra maps + a summary line ─────────────────────────

def evaluate_triggers(diag: dict, time_params: dict) -> list[tuple[str, list[tuple[str, str, dict]]]]:
    """Returns [(fired-line, [extra maps])]. Adding a trigger = one entry here.
    Extra maps use the same time_params as the base set (daily mean, or the
    birth-moment analysis when --time was given)."""
    fired: list[tuple[str, list[tuple[str, str, dict]]]] = []

    if abs(diag["t2m_sigma"]) >= TRIG_NORM_ANOM_SIGMA:
        kind = "warm" if diag["t2m_sigma"] > 0 else "cold"
        fired.append((
            f"Exceptionally {kind} day: 2m temp {diag['t2m_sigma']:+.1f}σ from normal",
            [("2m_temp_normalized", "2m Temperature in standard deviations",
              {**time_params, "variable": "temp_2m", "region": "CONUS",
               "mode": "normalized", "climo_source": "r2-daily"})],
        ))

    if diag["mslp_min_hpa"] <= TRIG_MSLP_MIN_HPA:
        fired.append((
            f"Deep low nearby: {diag['mslp_min_hpa']:.0f} hPa within {WINDOW_DEG:.0f}° of the birthplace",
            [("storm_closeup", "Storm close-up: pressure + wind",
              {**time_params, "variable": "surface_pressure", "region": "CONUS",
               "fill_mode": "shaded", "centers": 1, "wind_step": 2, "wind_type": "barbs"})],
        ))

    snow_map = ("snow_depth", "Snow depth",
                {**time_params, "variable": "snow_depth", "region": "CONUS"})
    snow_map_added = False

    if diag["precip_mm_day"] >= TRIG_PRECIP_MM_DAY:
        extras = [("precip", "Precipitation rate",
                   {**time_params, "variable": "precip_rate", "region": "CONUS"})]
        line = f"Wet day: {diag['precip_mm_day']:.0f} mm/day at the birthplace"
        if diag["t2m_c"] <= TRIG_SNOW_TEMP_C:
            extras.append(snow_map)
            snow_map_added = True
            line = f"Snowy day: {diag['precip_mm_day']:.0f} mm/day with 2m temp below freezing"
        fired.append((line, extras))

    if diag["snow_depth_in"] >= TRIG_SNOWPACK_IN:
        fired.append((
            f"Born onto a snow-covered world: {diag['snow_depth_in']:.0f} in on the ground",
            [] if snow_map_added else [snow_map],
        ))

    if diag["cape_jkg"] >= TRIG_CAPE_JKG:
        fired.append((
            f"Severe-weather day: CAPE {diag['cape_jkg']:.0f} J/kg",
            [("cape", "CAPE (thunderstorm fuel)",
              {**time_params, "variable": "cape", "region": "CONUS"})],
        ))

    if diag["pwat_sigma"] >= TRIG_PWAT_SIGMA:
        fired.append((
            f"Moisture plume: PWAT {diag['pwat_sigma']:+.1f}σ above normal",
            [("pwat", "Precipitable water",
              {**time_params, "variable": "precipitable_water", "region": "CONUS"})],
        ))

    if diag["jet_max_kt"] >= TRIG_JET_KT:
        fired.append((f"Jet overhead: 300mb max {diag['jet_max_kt']:.0f} kt nearby "
                      "(see the 300mb map)", []))

    if diag["cloud_pct"] <= TRIG_CLEAR_PCT:
        fired.append((f"Bluebird day: only {diag['cloud_pct']:.0f}% average cloud cover", []))
    elif diag["cloud_pct"] >= TRIG_OVERCAST_PCT:
        fired.append((f"Socked in: {diag['cloud_pct']:.0f}% cloud cover all day", []))

    if diag["h500_sigma"] is not None and abs(diag["h500_sigma"]) >= TRIG_H500_SIGMA:
        shape = "monster ridge" if diag["h500_sigma"] > 0 else "deep trough"
        fired.append((
            f"Born under a {shape}: 500mb heights {diag['h500_sigma']:+.1f}σ from normal",
            [("500mb_height_anomaly", "500mb Height anomaly",
              {**time_params, "variable": "height", "level": 500, "region": "CONUS",
               "mode": "anomaly", "climo_source": "r2-daily",
               "wind_step": 2, "wind_type": "barbs"})],
        ))

    if diag["vort_1e5"] is not None and diag["vort_1e5"] >= TRIG_VORT_1E5:
        fired.append((
            f"Shortwave overhead: 500mb vorticity max {diag['vort_1e5']:.0f}×10⁻⁵/s nearby",
            [("vorticity", "500mb Absolute vorticity",
              {**time_params, "variable": "absv", "level": 500, "region": "CONUS"})],
        ))

    if diag["dewpoint_f"] is not None and diag["dewpoint_f"] >= TRIG_DEWPOINT_F:
        fired.append((
            f"Sultry day: 2m dewpoint {diag['dewpoint_f']:.0f} °F — air you could drink",
            [("dewpoint", "2m Dewpoint",
              {**time_params, "variable": "dewpoint_2m", "region": "CONUS"})],
        ))

    if diag["wind10_kt"] is not None and diag["wind10_kt"] >= TRIG_WIND_KT:
        fired.append((
            f"Windy day: 10m wind averaged {diag['wind10_kt']:.0f} kt at the birthplace",
            [("wind_10m", "10m Wind",
              {**time_params, "variable": "wind_10m", "region": "CONUS",
               "wind_step": 2, "wind_type": "barbs"})],
        ))

    if diag["t2m_max_f"] >= TRIG_HOT_F:
        fired.append((f"Scorcher: hit {diag['t2m_max_f']:.0f} °F", []))
    if diag["t2m_min_f"] <= TRIG_COLD_F:
        fired.append((f"Deep freeze: fell to {diag['t2m_min_f']:.0f} °F", []))

    if (diag["cape_jkg"] >= TRIG_CAPPED_CAPE and diag["cape_jkg"] < TRIG_CAPE_JKG
            and diag["cin_at_peak"] >= TRIG_CAPPED_CIN):
        fired.append((
            f"The storm that wasn't allowed: {diag['cape_jkg']:.0f} J/kg of fuel "
            f"held down by {diag['cin_at_peak']:.0f} J/kg of cap", [],
        ))

    return fired


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


# ── Rendering + output ────────────────────────────────────────────────────────

def render_all(maps: list[tuple[str, str, dict]], out_dir: Path) -> list[tuple[str, str, dict]]:
    from app.map_service import create_map_buffer
    from app.map_pipeline.request import MapRequest

    # A re-run with different flags changes the map list and numbering; stale
    # numbered files from the previous run must not survive alongside them.
    for old in out_dir.glob("[0-9][0-9]_*.png"):
        old.unlink()

    rendered = []
    for i, (slug, title, params) in enumerate(maps, start=1):
        print(f"rendering {slug} ...")
        png = create_map_buffer(MapRequest(**params)).getvalue()
        path = out_dir / f"{i:02d}_{slug}.png"
        path.write_bytes(png)
        rendered.append((slug, title, params))
        print(f"  saved {path.name}  ({len(png) // 1024} KB)")
    return rendered


def write_links(rendered: list[tuple[str, str, dict]], out_dir: Path, valid_label: str) -> None:
    lines = ["# Birthday maps — open any map live", "", f"_{valid_label}_", ""]
    for slug, title, params in rendered:
        # The star and birthday title are render-only extras; the site's map
        # builder doesn't know them, so keep the links clean.
        link_params = {k: v for k, v in params.items() if k not in ("marker", "title_note")}
        lines.append(f"- [{title}]({SITE_BASE}/map?{urlencode(link_params)})")
    (out_dir / "links.md").write_text("\n".join(lines) + "\n")


def _line_or_na(template: str, value) -> str:
    label = template.split(":")[0]
    return template.format(value) if value is not None else f"{label}: n/a"


def write_summary(diag: dict, fired, place: str, date: str, out_dir: Path) -> None:
    f = diag["t2m_c"] * 9 / 5 + 32
    lines = [
        f"Your birthday in numbers — {date[:4]}-{date[4:6]}-{date[6:]} at {place}",
        "",
        f"  2m temperature      : {f:.0f} °F ({diag['t2m_c']:.1f} °C)",
        f"  vs normal           : {diag['t2m_anom_c'] * 9 / 5:+.0f} °F ({diag['t2m_sigma']:+.1f} σ)",
        f"  day's high / low    : {diag['t2m_max_f']:.0f} / {diag['t2m_min_f']:.0f} °F  (analysis extremes)",
        f"  sky cover           : {diag['cloud_pct']:.0f}%  ({_sky_words(diag['cloud_pct'])})",
        _line_or_na("  dewpoint            : {:.0f} °F", diag["dewpoint_f"]),
        _line_or_na("  10m wind            : {:.0f} kt", diag["wind10_kt"]),
        _line_or_na("  500mb heights       : {:+.1f} σ from normal", diag["h500_sigma"]),
        _line_or_na("  500mb vort max      : {:.0f} ×10⁻⁵/s nearby", diag["vort_1e5"]),
        f"  sea-level pressure  : {diag['mslp_pt_hpa']:.0f} hPa  (lowest analysis nearby: {diag['mslp_min_hpa']:.0f} hPa)",
        f"  precipitation       : {diag['precip_mm_day']:.1f} mm/day",
        f"  snow depth          : {diag['snow_depth_in']:.1f} in",
        f"  CAPE (day's peak)   : {diag['cape_jkg']:.0f} J/kg",
        f"  precipitable water  : {diag['pwat_mm']:.0f} mm ({diag['pwat_sigma']:+.1f} σ)",
        f"  300mb jet max nearby: {diag['jet_max_kt']:.0f} kt",
        "",
    ]
    if fired:
        lines.append("What made this day special:")
        lines.extend(f"  * {line}" for line, _ in fired)
    else:
        lines.append("A quiet, well-behaved day — the base maps tell the whole story.")
    (out_dir / "summary.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def render_animation(center: datetime, out_dir: Path, birthday_extras: dict) -> None:
    """9 frames of shaded 2m temperature + wind barbs + H/L centers + isobars:
    24 hours before the center analysis to 24 hours after, at 6-hour steps —
    the system arriving, the birthday itself, and where it went."""
    from PIL import Image

    from app.map_service import create_map_buffer
    from app.map_pipeline.request import MapRequest
    from app.retrieval import DataUnavailableError

    frames = []
    for step in range(-4, 5):
        t = center + timedelta(hours=6 * step)
        if t.strftime("%Y%m%d") < "19500101":
            print(f"animation frame {t:%Y%m%d %H}z before archive start — skipped")
            continue
        print(f"animation frame {t:%Y%m%d %H}z ...")
        try:
            png = create_map_buffer(MapRequest(
                variable="temp_2m", region="CONUS",
                centers=1, contours="pressure", wind_step=2, wind_type="barbs",
                date=t.strftime("%Y%m%d"), date_mode="single", hour=t.strftime("%H"),
                **birthday_extras,
            )).getvalue()
        except DataUnavailableError as exc:
            print(f"  not in archive ({exc}) — skipped")
            continue
        frames.append(Image.open(io.BytesIO(png)).convert("P", palette=Image.ADAPTIVE))
    if len(frames) < 2:
        print("  not enough frames for an animation — no GIF written")
        return
    gif = out_dir / "birthday.gif"
    frames[0].save(gif, save_all=True, append_images=frames[1:], duration=600, loop=0)
    print(f"  saved {gif.name}  ({len(frames)} frames)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("date", help="birth date, YYYYMMDD (1950 or later)")
    parser.add_argument("place", help='birthplace, e.g. "Pittsburgh, PA"')
    parser.add_argument("--name", help="friend's name (names the output folder)")
    parser.add_argument("--time", help="birth time HH:MM in the birthplace's local clock")
    parser.add_argument("--animate", action="store_true",
                        help="also render an 8-frame 3-hourly GIF of the day")
    args = parser.parse_args()

    if len(args.date) != 8 or not args.date.isdigit() or args.date < "19500101":
        raise SystemExit("date must be YYYYMMDD, 19500101 or later (CORe archive start)")

    lat, lon = geocode(args.place)
    zone = timezone_for(lat, lon)

    folder = (args.name.lower().replace(" ", "-") + "-" if args.name else "") + args.date
    out_dir = OUT_ROOT / folder
    out_dir.mkdir(parents=True, exist_ok=True)

    # With --time every map is the analysis nearest the birth moment;
    # without it, every map is the day's mean.
    if args.time:
        moment_date, moment_hour = local_time_to_analysis(args.date, args.time, zone)
        time_params = moment_time_params(moment_date, moment_hour)
        valid_label = (f"maps valid at the analysis nearest your birth moment: "
                       f"{moment_date} {moment_hour}z ({args.time} local)")
    else:
        time_params = daily_time_params(args.date)
        valid_label = "maps are means of the day"
    maps = base_maps(time_params)

    diag = compute_diagnostics(args.date, lat, lon, zone)
    fired = evaluate_triggers(diag, time_params)
    for _, extras in fired:
        maps.extend(extras)

    # Every map gets the birthplace star and the birthday title (render-only
    # extras — stripped from the deep links).
    y, mo, d = int(args.date[:4]), int(args.date[4:6]), int(args.date[6:])
    if args.time:
        h, mi = (int(p) for p in args.time.split(":"))
        when = datetime(y, mo, d, h, mi).strftime("%B %-d, %Y %-I:%M %p")
    else:
        when = datetime(y, mo, d).strftime("%B %-d, %Y")
    who = f"{args.name.strip().title()}'s" if args.name else "A"
    birthday_extras = {
        "marker": f"{lat:.3f},{lon:.3f}",
        "title_note": f"{who} Birthday - {when}",
    }
    maps = [(slug, title, {**params, **birthday_extras}) for slug, title, params in maps]

    rendered = render_all(maps, out_dir)
    write_links(rendered, out_dir, valid_label)
    write_summary(diag, fired, args.place, args.date, out_dir)
    if args.animate:
        # Center on the birth-moment analysis when known, else the day's 12z.
        if args.time:
            center = datetime(int(moment_date[:4]), int(moment_date[4:6]),
                              int(moment_date[6:]), int(moment_hour), tzinfo=timezone.utc)
        else:
            center = datetime(int(args.date[:4]), int(args.date[4:6]),
                              int(args.date[6:]), 12, tzinfo=timezone.utc)
        render_animation(center, out_dir, birthday_extras)
    print(f"\ndone → {out_dir}")


if __name__ == "__main__":
    main()
