"""
Synopsis pipeline (#37): WPC discussion -> draft setup post with maps.

One claude-opus-4-8 call turns a WPC Short Range Forecast Discussion into a
same-day setup post plan (headline, cleaned prose, topics, and optional bonus
maps). A deterministic setup gallery is added in code. Maps render in-process
through create_map_buffer — no HTTP round trip to our own server.
With publishing enabled, PNGs upload to the public post-images bucket and the
post lands in the posts table as an unpublished draft with category
'wpc discussion'.

Publishing needs two env vars (backend/.env in dev, Render env in prod):
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The model call needs
ANTHROPIC_API_KEY. The /api/synopsis/generate endpoint additionally needs
SYNOPSIS_CRON_SECRET.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path

import requests

from .config import PRESSURE_LEVELS, REGIONS, VARIABLES
from .map_pipeline.fetch_plan import fetch_obs
from .map_pipeline.request import MapRequest
from .map_pipeline.pipeline_steps import select_region
from .map_pipeline.time_selection import parse_time_selection
from .map_service import create_map_buffer
from .visualizer import _detect_pressure_centers

log = logging.getLogger("synopsis")

MODEL = "claude-opus-4-8"
COST_PER_MTOK_IN = 5.00
COST_PER_MTOK_OUT = 25.00
HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"]
CATEGORY = "wpc discussion"
PROMPT_PATH = Path(__file__).with_name("synopsis_prompt.md")
MAX_TOPICS = 6
MAX_FLAT_TAGS = 12
MAX_FLAT_REGIONS = 6
MAX_BONUS_MAPS = 2

# PMDSPD text from the IEM AFOS archive (public domain NWS product). CORe
# data lags real time by a few days, so the scheduled run reads the discussion
# from LAG_DAYS ago. Editorially, that target date is still "today" for the
# generated post; the lag is only a data-availability implementation detail.
DISCUSSION_URL = "https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py"
LAG_DAYS = 3

# Impact words that must come from the source, never from the model. The
# check is textual and deterministic — a warning, not a rewrite, since
# drafts get human review anyway.
WATCH_WORDS = ["deadly", "catastrophic", "historic", "unprecedented", "record",
               "killer", "life-threatening"]

# ── UI vocabulary (mirror of frontend variableConfig.ts) ─────────────────────
# The model emits map recipes in the BUILDER's vocabulary — the same shape
# stored in saved_maps.recipe — so a generated map is a saved map, and "Open
# in builder" works on it with no conversion anywhere. UI variable/level keys
# come from variableConfig.ts; per-variable pressure levels and anomaly
# support still derive from config.VARIABLES (the backend source of truth).
# Update this table together with variableConfig.ts when levels change.

# UI variable -> list of (ui_level, api_variable, api_level).
def _pressure(api_key: str) -> list[tuple[str, str, int]]:
    levels = VARIABLES[api_key].get("levels", PRESSURE_LEVELS)
    return [(str(lv), api_key, lv) for lv in levels]


UI_CATALOG: dict[str, list[tuple[str, str, int]]] = {
    "wind_speed": [("surface_10m", "wind_10m", 1000)] + _pressure("wind_speed"),
    "temp": [("surface_2m", "temp_2m", 1000)] + _pressure("temp"),
    "pressure": [("surface_mslp", "surface_pressure", 1000)],
    "height": _pressure("height"),
    "rel_humidity": _pressure("rel_humidity"),
    "humidity": _pressure("humidity"),
    "precipitable_water": [("total_column", "precipitable_water", 1000)],
    "omega": _pressure("omega"),
    "precip_rate": [("surface_prate", "precip_rate", 1000)],
    "olr": [("toa_olr", "olr", 1000)],
    "cape": [("surface_cape", "cape", 1000), ("ml_cape", "cape_ml", 1000),
             ("mu_cape", "cape_mu", 1000)],
    "cin": [("surface_cin", "cin", 1000), ("ml_cin", "cin_ml", 1000),
            ("mu_cin", "cin_mu", 1000)],
    "dewpoint_2m": [("surface_2m_dpt", "dewpoint_2m", 1000)],
    "absv": _pressure("absv"),
    "snow_depth": [("surface_snod", "snow_depth", 1000)],
}

# (ui_variable, ui_level) -> (api_variable, api_level), for rendering.
UI_TO_API = {(var, ui_level): (api_var, api_level)
             for var, levels in UI_CATALOG.items()
             for ui_level, api_var, api_level in levels}

WEATHER_TAGS = [
    "Cold Front", "Warm Front", "Stationary Front", "Occluded Front",
    "Frontal Boundary", "Low Pressure", "High Pressure", "Trough", "Ridge",
    "Shortwave", "Longwave", "Cyclone", "Cyclogenesis", "Jet Stream",
    "Low-Level Jet", "Cold Air Advection", "Warm Air Advection",
    "Moisture Advection", "Convergence", "Divergence", "Frontogenesis",
    "Frontolysis", "Instability", "Inversion", "Orographic Lift",
    "Overrunning", "Subsidence", "Wind Shear", "Vorticity Advection",
    "Thunderstorms", "Severe Thunderstorms", "Tornadoes", "Hail",
    "Damaging Winds", "Squall Line", "Lightning", "Heavy Rain",
    "Flash Flooding", "Flooding", "Rain", "Showers", "Snow", "Heavy Snow",
    "Blowing Snow", "Blizzard", "Sleet", "Freezing Rain",
    "Freezing Drizzle", "Ice", "Icing", "Lake-Effect Snow", "Winter Storm",
    "Tropical Cyclone", "Tropical Depression", "Tropical Storm", "Hurricane",
    "Tropical Moisture", "Extreme Heat", "Heat Wave", "Cold",
    "Extreme Cold", "Freeze", "Frost", "Fog", "High Winds", "Dust Storm",
    "Smoke", "Drought", "Critical Fire Weather", "Elevated Fire Weather",
    "Dry Thunderstorms", "Dry Lightning", "Low Relative Humidity",
    "Dry Fuels", "Gusty Winds", "Wind Shift", "Monsoon",
    "Monsoon Moisture", "Monsoonal Thunderstorms", "Downburst",
    "Santa Ana Winds", "Diablo Winds", "Offshore Winds", "Downslope Winds",
]

REGION_TAGS = [
    "Pacific Northwest", "Northern Intermountain Region", "Northern Rockies",
    "California", "Central Great Basin", "Intermountain West", "Southwest",
    "Central Rockies", "Southern Rockies", "Northern Plains",
    "Central Plains", "Southern Plains", "Upper Mississippi Valley",
    "Middle Mississippi Valley", "Lower Mississippi Valley",
    "Upper Great Lakes", "Lower Great Lakes", "Ohio Valley",
    "Tennessee Valley", "Northern Appalachians", "Central Appalachians",
    "Southern Appalachians", "Northeast", "Mid-Atlantic", "Southeast",
    "Cascades", "Sierra Nevada", "Northern High Plains",
    "Central High Plains", "Southern High Plains", "Upper Missouri Valley",
    "Middle Missouri Valley", "Lower Missouri Valley", "Upper Texas Coast",
    "Central Gulf Coast", "Eastern Gulf Coast",
]

SYNOPSIS_MAP_MENU = [
    "temp 850 or 700; raw; wind true for warm/cold advection or elevated warm layers",
    "rel_humidity 850 or 700; raw; wind true for moist upslope or low-level moisture flow",
    "dewpoint_2m surface_2m_dpt; raw; fillMode shaded for warm-season boundaries/moisture gradients",
    "temp surface_2m; raw or anomaly; fillMode shaded; contours [pressure] or centers true for heat/cold with pressure setup",
    "precipitable_water total_column; raw; fillMode shaded for named moisture/plumes/monsoon moisture",
    "precip_rate surface_prate; raw; fillMode shaded for target-date rain placement or active rain corridors",
    "cape surface_cape, ml_cape, or mu_cape; raw; fillMode shaded for named instability/severe ingredients",
    "cin surface_cin, ml_cin, or mu_cin; raw; fillMode shaded for named cap/CIN/inhibition",
]

BASE_MAP_TEMPLATES = [
    {
        "id": "overview",
        "caption": "The 500mb height field shows broad ridges and troughs that steer the large-scale weather pattern.",
        "recipe": {
            "variable": "height", "level": "500", "hour": "12",
            "displayMode": "raw", "wind": False, "fillMode": "shaded",
            "contours": ["height"], "centers": False,
        },
    },
    {
        "id": "vorticity",
        "caption": "Concentrated 500mb vorticity maxima mark shortwave disturbances where mid-level lift may help precipitation or storms develop.",
        "recipe": {
            "variable": "absv", "level": "500", "hour": "18",
            "displayMode": "raw", "wind": False, "fillMode": "shaded",
            "contours": None, "centers": False,
        },
    },
    {
        "id": "jet",
        "caption": "Look for the fastest 300mb wind streaks; they often mark corridors where upper-level forcing can organize storms and precipitation.",
        "recipe": {
            "variable": "wind_speed", "level": "300", "hour": "18",
            "displayMode": "raw", "wind": True, "fillMode": "shaded",
            "contours": None, "centers": False,
        },
    },
    {
        "id": "low_flow",
        "caption": "At 850mb, stronger flow can show low-level moisture transport, warm advection, upslope flow, or inflow into storm areas.",
        "recipe": {
            "variable": "wind_speed", "level": "850", "hour": "18",
            "displayMode": "raw", "wind": True, "fillMode": "shaded",
            "contours": None, "centers": False,
        },
    },
    {
        "id": "surface",
        "caption": "The MSLP field shows pressure centers and isobars that organize low-level flow.",
        "recipe": {
            "variable": "pressure", "level": "surface_mslp", "hour": "18",
            "displayMode": "raw", "wind": False, "fillMode": "shaded",
            "contours": ["pressure"], "centers": True,
        },
    },
]


# Structured-output schema: the model edits the official discussion into
# natural prose, region-first topics, and optional bonus map callouts.
# The deterministic base gallery is added in code so the model does not spend
# output tokens recreating the same setup maps every day.
_NULLABLE_FILL = {"anyOf": [{"type": "string", "enum": ["contours", "shaded"]},
                            {"type": "null"}]}
_NULLABLE_CONTOURS = {"anyOf": [
    {"type": "array", "items": {"type": "string", "enum": ["pressure", "height", "temp"]}},
    {"type": "null"}]}
MAP_PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "caption": {"type": "string"},
        "recipe": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "variable": {"type": "string"},
                "level": {"type": "string"},
                "region": {"type": "string"},
                "date": {"type": "string"},
                "hour": {"type": "string", "enum": HOURS},
                "displayMode": {"type": "string", "enum": ["raw", "anomaly"]},
                "wind": {"type": "boolean"},
                "fillMode": _NULLABLE_FILL,
                "contours": _NULLABLE_CONTOURS,
                "centers": {"type": "boolean"},
            },
            "required": [
                "variable", "level", "region", "date", "hour",
                "displayMode", "wind", "fillMode", "contours",
                "centers",
            ],
        },
    },
    "required": ["id", "caption", "recipe"],
}
TOPIC_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "region": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["region", "tags"],
}
SETUP_NOTES_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "overview": {"type": "string"},
        "vorticity": {"type": "string"},
        "jet": {"type": "string"},
        "low_flow": {"type": "string"},
    },
    "required": ["overview", "vorticity", "jet", "low_flow"],
}
PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "headline": {"type": "string"},
        "description": {"type": "string"},
        "intro": {"type": "string"},
        "topics": {
            "type": "array",
            "items": TOPIC_SCHEMA,
        },
        "setup_notes": SETUP_NOTES_SCHEMA,
        "bonus_maps": {
            "type": "array",
            "items": MAP_PLAN_SCHEMA,
        },
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "heading": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["heading", "body"],
            },
        },
    },
    "required": [
        "headline", "description", "intro", "topics", "setup_notes",
        "bonus_maps", "sections",
    ],
}


# ── Fetch ────────────────────────────────────────────────────────────────────

def default_target_date() -> str:
    return (datetime.utcnow() - timedelta(days=LAG_DAYS)).strftime("%Y%m%d")


# Issuance windows (UTC) for the two daily PMDSPD releases.
ISSUANCE_WINDOWS = {
    "morning": ("06:00", "14:00"),    # ~4 AM EDT release
    "afternoon": ("17:00", "23:00"),  # ~4 PM EDT release
}


@dataclass
class Discussion:
    """A fetched PMDSPD with its provenance: the trimmed product text (model
    input), a permanent IEM archive link to the exact issuance, and the
    issuance line as printed in the product ('359 AM EDT Fri Jul 17 2026')."""
    text: str
    url: str
    issued: str


# Permanent per-issuance permalink into the IEM AFOS archive. e is the UTC
# issuance stamp from the product's WMO header; IEM snaps it to the nearest
# archived entry, so header time == archive time isn't required.
ARCHIVE_URL = "https://mesonet.agron.iastate.edu/wx/afos/p.php"


def fetch_discussion(target_date: str | None = None, issuance: str = "morning") -> Discussion:
    """The PMDSPD issued on target_date (YYYYMMDD; default LAG_DAYS ago) in
    the chosen issuance window. The generated post uses the discussion as
    issued, with maps of the setup on that same target day."""
    if target_date is None:
        target_date = default_target_date()
    if issuance not in ISSUANCE_WINDOWS:
        raise ValueError(f"issuance must be one of {list(ISSUANCE_WINDOWS)}")
    start, end = ISSUANCE_WINDOWS[issuance]
    day = datetime.strptime(target_date, "%Y%m%d").strftime("%Y-%m-%d")
    resp = requests.get(
        DISCUSSION_URL,
        params={"pil": "PMDSPD", "fmt": "text", "limit": 1,
                "sdate": f"{day}T{start}Z", "edate": f"{day}T{end}Z"},
        timeout=30,
    )
    resp.raise_for_status()
    text = resp.text
    body_start = text.find("Short Range Forecast Discussion")
    if body_start == -1:
        raise RuntimeError(f"PMDSPD fetch for {target_date}: no discussion found")

    # WMO header 'FXUS01 KWBC 170800' -> ddHHMM (UTC) -> archive permalink.
    url = ""
    wmo = re.search(r"^[A-Z]{4}\d{2} [A-Z]{4} (\d{6})\s*$", text[:body_start], re.M)
    if wmo:
        url = f"{ARCHIVE_URL}?pil=PMDSPD&e={target_date[:6]}{wmo.group(1)}"

    # The product's own issuance line, e.g. '359 AM EDT Fri Jul 17 2026'.
    stamp = re.search(r"^\d{3,4} (?:AM|PM) [A-Z]{2,4} \w{3} \w{3} +\d{1,2} \d{4}\s*$",
                      text, re.M)
    issued = " ".join(stamp.group(0).split()) if stamp else ""

    return Discussion(text=text[body_start:], url=url, issued=issued)


# ── Generate ─────────────────────────────────────────────────────────────────

def legal_values_block() -> str:
    """The compact recipe vocabulary shown to the model for Synopsis posts.

    The renderer still validates against UI_CATALOG; this prompt menu is a
    narrower editorial choice set for setup-focused WPC discussion posts.
    """
    lines = ["## Legal values", "", "Bonus map menu (variable level; displayMode; options; use):"]
    lines += [f"- {line}" for line in SYNOPSIS_MAP_MENU]
    lines += [
        "",
        "hour (UTC): " + ", ".join(HOURS) + " — pick the hour that best shows the feature "
        "(21z is afternoon in the US).",
        "date: YYYYMMDD, within the discussion's valid period.",
        "bonus map region: CONUS.",
        "contours is null or a list from: pressure, height, temp. wind true adds barbs. centers true adds H/L markers.",
        "",
        "Legal weather tags for topics: " + ", ".join(WEATHER_TAGS),
        "",
        "Legal topic regions: " + ", ".join(REGION_TAGS),
    ]
    return "\n".join(lines)


def discussion_paragraphs(discussion: str) -> list[str]:
    """Official WPC text split into display/placement paragraphs.

    Whitespace is normalized only at paragraph edges; interior line breaks stay
    intact so the reposted product remains recognizably the source text.
    """
    return [p.strip() for p in re.split(r"\n\s*\n", discussion.strip()) if p.strip()]


def numbered_discussion(discussion: str) -> str:
    return "\n\n".join(
        f"[{i}] {p}" for i, p in enumerate(discussion_paragraphs(discussion), start=1)
    )


def build_system_prompt(target_date: str | None = None) -> str:
    prompt = PROMPT_PATH.read_text() + "\n" + legal_values_block()
    if target_date:
        prompt += (
            f"\nThe target date is {target_date}. In the discussion, this date is 'today'; "
            "choose maps and captions from that same-day perspective. Every map uses date "
            f"{target_date}. Treat later days in the discussion as forecasts, using simple "
            "future tense rather than hindsight in captions."
        )
    return prompt


def _anthropic_plan_call(messages: list[dict], target_date: str | None = None) -> tuple[dict, dict]:
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=build_system_prompt(target_date),
        output_config={"format": {"type": "json_schema", "schema": PLAN_SCHEMA}},
        messages=messages,
    )
    text = next(b.text for b in response.content if b.type == "text")
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    usage["cost_usd"] = round(
        (usage["input_tokens"] * COST_PER_MTOK_IN
         + usage["output_tokens"] * COST_PER_MTOK_OUT) / 1_000_000, 4)
    return json.loads(text), usage


def _add_usage(a: dict, b: dict) -> dict:
    usage = {
        "input_tokens": a.get("input_tokens", 0) + b.get("input_tokens", 0),
        "output_tokens": a.get("output_tokens", 0) + b.get("output_tokens", 0),
    }
    usage["cost_usd"] = round(
        (usage["input_tokens"] * COST_PER_MTOK_IN
         + usage["output_tokens"] * COST_PER_MTOK_OUT) / 1_000_000, 4)
    return usage


def generate_plan(discussion: str, target_date: str | None = None,
                  retries: int = 0) -> tuple[dict, dict]:
    """Official discussion text in, raw enhancement plan out.

    retries lets the caller test whether an invalid first plan can be repaired
    before rendering or saving anything.
    """
    messages = [{"role": "user", "content": numbered_discussion(discussion)}]
    plan, usage = _anthropic_plan_call(messages, target_date)
    repair_reasons: list[str] = []
    for _ in range(retries):
        try:
            validate_plan(plan)
            usage["repair_reasons"] = repair_reasons
            return plan, usage
        except ValueError as exc:
            repair_reasons.append(str(exc))
            repair = (
                f"The previous JSON was invalid: {exc}. Return a complete revised JSON object. "
                "Keep the cleaned body prose, but populate all required fields: 1-6 legal "
                "region-first topics, setup_notes, and 0-2 bonus_maps. The app adds the base setup maps."
            )
            next_plan, next_usage = _anthropic_plan_call(
                [*messages,
                 {"role": "assistant", "content": json.dumps(plan)},
                 {"role": "user", "content": repair}],
                target_date,
            )
            plan = next_plan
            usage = _add_usage(usage, next_usage)
    usage["repair_reasons"] = repair_reasons
    return plan, usage


def generate_post(discussion: str, target_date: str | None = None) -> tuple[dict, dict]:
    """One model call: official discussion text in, validated post object out.

    The model lightly rewrites the source into natural prose, chooses
    region-first topics, and may choose up to two bonus maps. assemble_post()
    adds the deterministic setup gallery and keeps the official WPC text for
    audit/provenance.
    """
    plan, usage = generate_plan(discussion, target_date, retries=1)
    return assemble_post(plan, discussion, target_date), usage


def compose_title(post: dict) -> str:
    """'US Weather Thursday July 9, 2026: <headline>' — weekday from post_date,
    so the model can never mislabel the day."""
    day = datetime.strptime(post["post_date"], "%Y%m%d")
    return f"US Weather {day.strftime('%A')} {day.strftime('%B')} {day.day}, {day.year}: {post['headline']}"


def slug_for_date(date: str) -> str:
    day = datetime.strptime(date, "%Y%m%d")
    return f"us-weather-{day.strftime('%A').lower()}-{day.strftime('%B').lower()}-{day.day}-{day.year}"


def compose_slug(post: dict) -> str:
    return slug_for_date(post["post_date"])


def unsupported_words(post: dict, discussion: str) -> list[str]:
    generated = {
        "headline": post.get("headline", ""),
        "description": post.get("description", ""),
        "intro": post.get("intro", ""),
        "sections": post.get("sections", []),
        "tags": post.get("tags", []),
        "regions": post.get("regions", []),
        "topics": post.get("topics", []),
        "maps": [
            {
                "caption": m.get("caption", ""),
            }
            for m in post.get("maps", [])
        ],
    }
    post_text = json.dumps(generated).lower()
    source = discussion.lower()
    return [w for w in WATCH_WORDS if w in post_text and w not in source]


def _legal_subset(values: list[str], legal: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    legal_set = set(legal)
    for value in values or []:
        if value in legal_set and value not in seen:
            out.append(value)
            seen.add(value)
    return out


def bonus_plan_maps(plan: dict) -> list[dict]:
    """Return optional model-selected map plans."""
    maps = plan.get("bonus_maps")
    if maps is None:
        maps = plan.get("maps") or {}
    if isinstance(maps, list):
        return maps
    if not isinstance(maps, dict):
        return []
    out: list[dict] = []
    for key in ("map1", "map2", "map3", "map4", "map5", "map6", "map7"):
        m = maps.get(key)
        if m:
            raw = dict(m)
            raw.setdefault("id", key)
            out.append(raw)
    return out


def normalize_bonus_maps(plan: dict, target_date: str) -> list[dict]:
    """Keep only valid optional maps. The base gallery is enough for a post,
    so optional map problems should not trigger another model call."""
    out: list[dict] = []
    seen: set[str] = set()
    base_ids = {m["id"] for m in BASE_MAP_TEMPLATES}
    for m in bonus_plan_maps(plan):
        if len(out) >= MAX_BONUS_MAPS:
            break
        map_id = str(m.get("id") or "")
        if not map_id or map_id in base_ids or map_id in seen:
            continue
        try:
            recipe_to_params(to_map_recipe(m["recipe"], target_date))
        except Exception:
            continue
        seen.add(map_id)
        out.append(m)
    return out


def base_map_plans(target_date: str, setup_notes: dict | None = None) -> list[dict]:
    """Deterministic daily setup gallery. Recipes use the model's flat shape
    and are normalized with the same path as bonus maps. setup_notes may supply
    day-specific captions for the fixed maps."""
    out: list[dict] = []
    for template in BASE_MAP_TEMPLATES:
        m = json.loads(json.dumps(template))
        note = (setup_notes or {}).get(m["id"])
        if m["id"] != "surface" and isinstance(note, str) and note.strip():
            m["caption"] = note.strip()
        m["recipe"]["date"] = target_date
        m["recipe"]["region"] = "CONUS"
        out.append(m)
    return out


_AREA_POINTS = [
    ("Pacific Northwest", 46.0, -122.0),
    ("northern Rockies", 46.5, -111.0),
    ("central Rockies", 39.5, -106.0),
    ("southern Rockies", 35.5, -106.0),
    ("Great Basin", 39.5, -116.0),
    ("Southwest", 34.0, -112.0),
    ("northern High Plains", 45.0, -104.0),
    ("central High Plains", 39.0, -102.0),
    ("southern High Plains", 34.0, -102.0),
    ("Central Plains", 39.0, -97.0),
    ("Southern Plains", 34.0, -98.0),
    ("Upper Midwest", 44.0, -93.0),
    ("Great Lakes", 44.0, -84.0),
    ("Ohio Valley", 39.0, -84.0),
    ("Tennessee Valley", 35.5, -86.0),
    ("Southeast", 33.0, -83.0),
    ("Gulf Coast", 29.0, -90.0),
    ("Mid-Atlantic", 39.0, -76.0),
    ("Northeast", 43.0, -72.0),
]


def _lon180(lon: float) -> float:
    return ((lon + 180.0) % 360.0) - 180.0


def _area_label(lon: float, lat: float) -> str:
    lon = _lon180(lon)
    best = min(
        _AREA_POINTS,
        key=lambda item: (lat - item[1]) ** 2 + ((lon - item[2]) * 0.75) ** 2,
    )
    return best[0]


def _in_conus_caption_domain(lon: float, lat: float) -> bool:
    lon = _lon180(lon)
    return -127.5 <= lon <= -63.5 and 20.0 <= lat <= 52.5


def _join_labels(labels: list[str]) -> str:
    unique = []
    for label in labels:
        if label not in unique:
            unique.append(label)
    if not unique:
        return ""
    if len(unique) == 1:
        return unique[0]
    return f"{unique[0]} and {unique[1]}"


def mslp_caption_from_centers(lows: list[tuple[float, float, float]],
                              highs: list[tuple[float, float, float]]) -> str:
    """Pressure-only caption language from detected H/L centers.

    This deliberately avoids fronts and boundaries. Frontal placement belongs
    on temperature/dewpoint gradient maps, not MSLP.
    """
    lows = [c for c in lows if _in_conus_caption_domain(c[0], c[1])]
    highs = [c for c in highs if _in_conus_caption_domain(c[0], c[1])]
    low_labels = _join_labels([_area_label(lon, lat) for lon, lat, _ in lows[:2]])
    high_labels = _join_labels([_area_label(lon, lat) for lon, lat, _ in highs[:2]])
    if low_labels and high_labels:
        if any("Gulf" in _area_label(lon, lat) or "Southeast" in _area_label(lon, lat)
               for lon, lat, _ in highs[:2]) and any(_lon180(lon) < -95 for lon, _, _ in lows[:2]):
            return (
                f"MSLP places lower pressure over the {low_labels} and higher pressure near the "
                f"{high_labels}, supporting return flow into the Plains."
            )
        return (
            f"MSLP places lower pressure over the {low_labels} and higher pressure near the "
            f"{high_labels}, highlighting the pressure gradient organizing low-level flow."
        )
    if low_labels:
        return f"MSLP highlights lower pressure over the {low_labels}, where the pressure field organizes low-level flow."
    if high_labels:
        return f"MSLP highlights higher pressure near the {high_labels}, where the pressure field organizes low-level flow."
    return "MSLP shows the pressure centers and isobars organizing the low-level flow pattern."


def data_driven_mslp_caption(recipe: dict) -> str | None:
    """Create a caption from the same MSLP field used to render the map."""
    try:
        req = recipe_to_request(recipe)
        selection = parse_time_selection(req)
        obs = fetch_obs(req, selection, VARIABLES[req.variable].get("grib_name", ""))
        subset = select_region(obs, REGIONS[req.region])
        lows, highs = _detect_pressure_centers(subset)
        return mslp_caption_from_centers(lows, highs)
    except Exception as exc:
        log.info("synopsis: MSLP caption fallback after data inspection failed: %s", exc)
        return None


def apply_data_driven_captions(post: dict) -> None:
    for m in post.get("maps") or []:
        recipe = m.get("recipe") or {}
        if recipe.get("variable") == "pressure" and recipe.get("level") == "surface_mslp":
            caption = data_driven_mslp_caption(recipe)
            if caption:
                m["caption"] = caption


def normalize_topics(plan: dict) -> list[dict]:
    topics: list[dict] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for raw in plan.get("topics") or []:
        if len(topics) >= MAX_TOPICS:
            break
        region = raw.get("region")
        if region not in REGION_TAGS:
            continue
        tags = _legal_subset(raw.get("tags") or [], WEATHER_TAGS)
        if not tags:
            continue
        key = (region, tuple(tags))
        if key in seen:
            continue
        seen.add(key)
        topics.append({"region": region, "tags": tags})
    return topics


def tags_regions_from_topics(topics: list[dict]) -> tuple[list[str], list[str]]:
    tags: list[str] = []
    regions: list[str] = []
    for topic in topics:
        if topic["region"] not in regions and len(regions) < MAX_FLAT_REGIONS:
            regions.append(topic["region"])
        for tag in topic["tags"]:
            if tag not in tags and len(tags) < MAX_FLAT_TAGS:
                tags.append(tag)
    return tags, regions


def validate_plan(plan: dict) -> None:
    """Fail fast when the model did not satisfy the editorial contract."""
    section_count = len(plan.get("sections") or [])
    if section_count < 2:
        raise ValueError(f"plan must include 2 or more rewritten sections; got {section_count}")

    topics = normalize_topics(plan)
    if len(topics) < 1:
        raise ValueError(f"plan must include 1-6 legal region topics; got {len(topics)}")
    tags, regions = tags_regions_from_topics(topics)
    if len(tags) < 3:
        raise ValueError(f"topics must derive at least 3 legal weather tags; got {len(tags)}")
    if len(regions) < 1:
        raise ValueError(f"topics must derive 1-6 legal region tags; got {len(regions)}")


def assemble_post(plan: dict, discussion: str, target_date: str | None = None) -> dict:
    """Plan JSON + source WPC text -> the post object used downstream."""
    validate_plan(plan)
    source_paragraphs = discussion_paragraphs(discussion)
    post_date = target_date or plan.get("post_date") or default_target_date()
    sections = plan.get("sections") or []
    topics = normalize_topics(plan)
    tags, regions = tags_regions_from_topics(topics)
    setup_notes = plan.get("setup_notes") if isinstance(plan.get("setup_notes"), dict) else {}
    maps = []
    for idx, m in enumerate(
        [*base_map_plans(post_date, setup_notes), *normalize_bonus_maps(plan, post_date)],
        start=1,
    ):
        raw = dict(m)
        raw.setdefault("id", f"map{idx}")
        maps.append(raw)

    post = {
        "headline": plan["headline"],
        "post_date": post_date,
        "description": plan["description"],
        "intro": plan["intro"],
        "sections": sections,
        "official_text": discussion,
        "official_paragraphs": source_paragraphs,
        "setup_notes": setup_notes,
        "topics": topics,
        "tags": tags,
        "regions": regions,
        "maps": maps,
    }
    normalize_recipes(post, post_date)
    return post


def to_map_recipe(raw: dict, target_date: str | None = None) -> dict:
    """The model's flat recipe -> the full MapRecipe shape stored in
    saved_maps.recipe and consumed by the map builder. Applies the house
    rules deterministically: every map pinned to the discussion's target day,
    wind glyphs always barbs at step 2, sub-monthly anomalies always
    r2-daily climatology."""
    date = target_date or raw["date"]
    iso = f"{date[:4]}-{date[4:6]}-{date[6:]}"
    recipe: dict = {
        "variable": raw["variable"],
        "level": str(raw["level"]),
        "region": raw["region"],
        "displayMode": raw["displayMode"],
        "time": {"scale": "3-hourly", "subMode": "single",
                 "date": iso, "hour": raw["hour"]},
    }
    if raw["displayMode"] == "anomaly":
        recipe["climoSource"] = "r2-daily"
    if raw.get("wind"):
        recipe["wind"] = {"on": True, "step": "2", "type": "barbs",
                          "anomalyOverlay": "none", "isotachs": False,
                          "shading": True}
    if raw.get("fillMode"):
        recipe["fillMode"] = raw["fillMode"]
    if raw.get("contours"):
        recipe["contours"] = raw["contours"]
    if raw.get("centers"):
        recipe["centers"] = True
    return recipe


def normalize_recipes(post: dict, target_date: str | None = None) -> None:
    """Replace each map's model-emitted recipe with the full MapRecipe, and
    pin post_date when a target date is known."""
    if target_date:
        post["post_date"] = target_date
    for m in post["maps"]:
        m["recipe"] = to_map_recipe(m["recipe"], target_date)


# ── Render ───────────────────────────────────────────────────────────────────

def recipe_to_params(recipe: dict) -> dict:
    """MapRecipe -> API params, the same translation mapRecipeToParams does in
    the frontend (UI variable/level -> API names via the shared catalog).
    Feeds both the in-process renderer and the /map deep link."""
    ui_var, ui_level = recipe["variable"], str(recipe["level"])
    try:
        api_var, api_level = UI_TO_API[(ui_var, ui_level)]
    except KeyError:
        raise ValueError(f"unknown variable/level: {ui_var}/{ui_level}") from None
    t = recipe["time"]
    p: dict = {"variable": api_var, "level": api_level, "region": recipe["region"],
               "date": t["date"].replace("-", ""), "hour": t["hour"]}
    if recipe.get("displayMode") == "anomaly":
        p["mode"] = "anomaly"
        p["climo_source"] = recipe.get("climoSource", "r2-daily")
    wind = recipe.get("wind")
    if wind and wind.get("on"):
        p["wind_step"] = int(wind.get("step", 2))
        p["wind_type"] = wind.get("type", "barbs")
    if recipe.get("fillMode") == "shaded" and api_var in ("surface_pressure", "height"):
        p["fill_mode"] = "shaded"
    if recipe.get("centers"):
        p["centers"] = 1
    if recipe.get("contours"):
        p["contours"] = ",".join(recipe["contours"])
    return p


def builder_url(recipe: dict) -> str:
    """Relative /map deep link that reopens this recipe in the builder —
    generated from the recipe on demand (mapRecipeFromUrl parses these same
    param names on load). Relative so it works on dev and prod alike.
    Returns "" for a recipe that can't translate — a failed map must not
    kill the draft; its recipe still reaches the library for debugging."""
    from urllib.parse import urlencode
    try:
        return "/map?" + urlencode(recipe_to_params(recipe))
    except ValueError:
        return ""


VARIABLE_TITLES = {
    "absv": "Absolute Vorticity",
    "cape": "CAPE",
    "cin": "CIN",
    "dewpoint_2m": "Dewpoint",
    "height": "Geopotential Height",
    "humidity": "Specific Humidity",
    "olr": "Outgoing Longwave Radiation",
    "omega": "Vertical Motion",
    "precip_rate": "Precipitation Rate",
    "precipitable_water": "Precipitable Water",
    "pressure": "Mean Sea Level Pressure",
    "rel_humidity": "Relative Humidity",
    "snow_depth": "Snow Depth",
    "temp": "Temperature",
    "wind_speed": "Wind Speed",
}

LEVEL_TITLES = {
    "ml_cape": "Mixed-Layer",
    "ml_cin": "Mixed-Layer",
    "mu_cape": "Most-Unstable",
    "mu_cin": "Most-Unstable",
    "surface_10m": "10m",
    "surface_2m": "2m",
    "surface_2m_dpt": "2m",
    "surface_cape": "Surface",
    "surface_cin": "Surface",
    "surface_prate": "",
    "surface_snod": "Surface",
    "toa_olr": "Top-of-Atmosphere",
    "total_column": "Total Column",
}

def _short_date_label(value: str) -> str:
    try:
        d = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return value
    return f"{d.month}/{d.day}/{d.year}"


def _friendly_date_label(value: str) -> str:
    try:
        d = datetime.strptime(value, "%Y%m%d")
    except ValueError:
        return value
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def map_text_title(recipe: dict) -> str:
    """Readable, indexable title for a generated map.

    The PNG title is part of the image, so generated posts also need real text
    near each map for SEO, accessibility, and normal scanning.
    """
    variable = recipe.get("variable", "")
    level = str(recipe.get("level", ""))
    variable_title = VARIABLE_TITLES.get(variable, variable.replace("_", " ").title())
    level_title = LEVEL_TITLES.get(level, f"{level}mb" if level.isdigit() else level.replace("_", " ").title())
    mode_title = " Anomaly" if recipe.get("displayMode") == "anomaly" else ""
    if variable == "pressure" and level == "surface_mslp":
        field = f"{variable_title}{mode_title}"
    else:
        field = " ".join(part for part in (level_title, f"{variable_title}{mode_title}") if part)

    t = recipe.get("time") or {}
    when = ""
    if t.get("scale") == "3-hourly" and t.get("date"):
        hour = f" {t['hour']}Z" if t.get("hour") else ""
        when = f", {_short_date_label(t['date'])}{hour}"
    elif t.get("scale") == "daily" and t.get("date"):
        when = f", {_short_date_label(t['date'])}"
    elif t.get("scale") == "monthly" and t.get("month"):
        when = f" for {t['month']}"
    return f"{field}{when}".strip()


def recipe_to_request(recipe: dict) -> MapRequest:
    return MapRequest(**recipe_to_params(recipe))


def render_map_png(recipe: dict) -> bytes:
    """One map, in-process — same code path as /api/map."""
    return create_map_buffer(recipe_to_request(recipe)).getvalue()


def render_all_maps(post: dict) -> tuple[dict[str, bytes], list[str]]:
    """Returns ({map_id: png_bytes}, [error strings])."""
    images: dict[str, bytes] = {}
    errors: list[str] = []
    for m in post["maps"]:
        try:
            images[m["id"]] = render_map_png(m["recipe"])
            log.info("synopsis: rendered %s", m["id"])
        except Exception as exc:  # per-map failures shouldn't kill the post
            errors.append(f"{m['id']}: {exc}")
            log.warning("synopsis: map %s failed: %s", m["id"], exc)
    return images, errors


# ── Publish (draft) ──────────────────────────────────────────────────────────

def _supabase() -> tuple[str, dict]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to save drafts"
        )
    return url, {"Authorization": f"Bearer {key}", "apikey": key}


def build_body_md(post: dict, slug: str) -> str:
    """Markdown body with rewritten WPC prose plus an ordered PyRe map gallery.

    Images are bucket paths ('post-images/...'). Each map title is followed by
    a /map deep link that reopens its recipe in the builder. When the source
    discussion is known (post['source'], attached by run_pipeline), a
    provenance line closes the post (#83) — derived from the fetch, never
    written by the model.
    """
    lines = [post["intro"], ""]
    for section in post["sections"]:
        lines += [f"## {section['heading']}", "", section["body"], ""]

    lines += [f"## Atmospheric Setup Maps for {_friendly_date_label(post['post_date'])}", ""]
    for m in post["maps"]:
        mid = m["id"]
        url = builder_url(m["recipe"])
        title = map_text_title(m["recipe"])
        alt = f"{title}. {m['caption']}" if title else m["caption"]
        lines += [f"### {title}", ""]
        if url:
            lines += [f"[Open this map in the builder]({url})", ""]
        lines += [f"![{alt}](post-images/{slug}/{mid}.png)", "",
                  f"*{m['caption']}*", ""]
    return _append_source(lines, post).strip() + "\n"


def _append_source(lines: list[str], post: dict) -> str:
    source = post.get("source") or {}
    if source.get("url"):
        issued = f", issued {source['issued']}" if source.get("issued") else ""
        lines += ["---", "",
                  f"*Source: [NWS WPC Short Range Forecast Discussion{issued}]({source['url']})*",
                  ""]
    return "\n".join(lines).strip() + "\n"


def upload_images(slug: str, images: dict[str, bytes]) -> None:
    url, headers = _supabase()
    for map_id, png in images.items():
        resp = requests.post(
            f"{url}/storage/v1/object/post-images/{slug}/{map_id}.png",
            headers={**headers, "Content-Type": "image/png", "x-upsert": "true"},
            data=png,
            timeout=60,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"image upload {map_id}: HTTP {resp.status_code} {resp.text[:200]}")


def day_status(date: str) -> str:
    """'published', 'draft', or 'none' for the day's post."""
    url, headers = _supabase()
    resp = requests.get(
        f"{url}/rest/v1/posts?slug=eq.{slug_for_date(date)}&select=published",
        headers=headers, timeout=30,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        return "none"
    return "published" if rows[0]["published"] else "draft"


def is_admin_token(token: str) -> bool:
    """True when the bearer token is a signed-in user whose profile has
    is_admin. Same gate the rebuild-site function uses."""
    if not token:
        return False
    url, headers = _supabase()
    who = requests.get(
        f"{url}/auth/v1/user",
        headers={**headers, "Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if who.status_code != 200:
        return False
    uid = who.json().get("id")
    if not uid:
        return False
    prof = requests.get(
        f"{url}/rest/v1/profiles?id=eq.{uid}&select=is_admin",
        headers=headers, timeout=30,
    )
    if prof.status_code != 200:
        return False
    rows = prof.json()
    return bool(rows and rows[0].get("is_admin"))


def event_date_iso(post_date: str) -> str:
    """YYYYMMDD -> YYYY-MM-DD for the posts.event_date column."""
    return datetime.strptime(post_date, "%Y%m%d").strftime("%Y-%m-%d")


def upsert_draft(slug: str, title: str, description: str, body_md: str,
                 event_date: str | None = None,
                 tags: list[str] | None = None,
                 regions: list[str] | None = None) -> str:
    """Insert the draft, or refresh it if a draft with this slug exists.
    A published post is never touched — regeneration then reports and stops.
    event_date (YYYY-MM-DD) is the weather day the post describes (#82)."""
    url, headers = _supabase()
    existing = requests.get(
        f"{url}/rest/v1/posts?slug=eq.{slug}&select=id,published",
        headers=headers, timeout=30,
    )
    existing.raise_for_status()
    rows = existing.json()

    if rows and rows[0]["published"]:
        raise RuntimeError(f"post '{slug}' is already published; not overwriting")

    fields = {"title": title, "description": description, "body_md": body_md,
              "category": CATEGORY, "published": False}
    if event_date:
        fields["event_date"] = event_date
    if tags is not None:
        fields["tags"] = tags
    if regions is not None:
        fields["regions"] = regions
    if rows:
        resp = requests.patch(
            f"{url}/rest/v1/posts?id=eq.{rows[0]['id']}",
            headers=headers, json=fields, timeout=30,
        )
        action = "updated"
    else:
        resp = requests.post(
            f"{url}/rest/v1/posts",
            headers=headers, json={"slug": slug, **fields}, timeout=30,
        )
        action = "created"
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"draft {action}: HTTP {resp.status_code} {resp.text[:200]}")
    return action


# ── Library save ─────────────────────────────────────────────────────────────
# Each generated map becomes a real saved_maps row (recipe JSON + PNG +
# thumbnail in the private maps bucket) under the admin's "WPC Discussions"
# project, one folder per post slug — so every generated map
# opens in the builder exactly like a user-saved map. Failed maps are saved
# too, with no image: their recipe is what the editor needs to debug them.

LIBRARY_PROJECT = "WPC Discussions"
MAPS_BUCKET = "maps"
THUMB_MAX_WIDTH = 480  # mirror of frontend lib/images.ts


def _thumbnail(png: bytes) -> bytes:
    from PIL import Image
    im = Image.open(BytesIO(png))
    if im.width > THUMB_MAX_WIDTH:
        im = im.resize((THUMB_MAX_WIDTH, round(im.height * THUMB_MAX_WIDTH / im.width)),
                       Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _rest_get(url: str, headers: dict, path: str) -> list:
    resp = requests.get(f"{url}/rest/v1/{path}", headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _rest_insert(url: str, headers: dict, table: str, row: dict) -> dict:
    resp = requests.post(
        f"{url}/rest/v1/{table}",
        headers={**headers, "Prefer": "return=representation"},
        json=row, timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"{table} insert: HTTP {resp.status_code} {resp.text[:200]}")
    return resp.json()[0]


def _admin_user_id(url: str, headers: dict) -> str:
    rows = _rest_get(url, headers, "profiles?is_admin=eq.true&select=id&limit=1")
    if not rows:
        raise RuntimeError("no admin profile found to own generated library maps")
    return rows[0]["id"]


def save_library_maps(slug: str, post: dict, images: dict[str, bytes]) -> None:
    """Save every generated map (rendered or failed) as a saved_maps row in
    the per-post folder. Regenerating a draft replaces the folder's rows and
    their storage objects, so reruns never accumulate duplicates."""
    url, headers = _supabase()
    uid = _admin_user_id(url, headers)

    projects = _rest_get(url, headers,
                         f"projects?user_id=eq.{uid}&name=eq.{requests.utils.quote(LIBRARY_PROJECT)}&select=id")
    project_id = projects[0]["id"] if projects else _rest_insert(
        url, headers, "projects", {"user_id": uid, "name": LIBRARY_PROJECT})["id"]

    folders = _rest_get(url, headers,
                        f"folders?project_id=eq.{project_id}&name=eq.{slug}&select=id")
    folder_id = folders[0]["id"] if folders else _rest_insert(
        url, headers, "folders",
        {"user_id": uid, "project_id": project_id, "name": slug})["id"]

    # Replace any rows from a previous run of this post.
    old = _rest_get(url, headers, f"saved_maps?folder_id=eq.{folder_id}&select=id")
    for row in old:
        for key in (f"{uid}/{row['id']}/full.png", f"{uid}/{row['id']}/thumb.png"):
            requests.delete(f"{url}/storage/v1/object/{MAPS_BUCKET}/{key}",
                            headers=headers, timeout=30)
    if old:
        requests.delete(f"{url}/rest/v1/saved_maps?folder_id=eq.{folder_id}",
                        headers=headers, timeout=30).raise_for_status()

    for m in post["maps"]:
        map_id = str(uuid.uuid4())
        row = {"id": map_id, "user_id": uid, "project_id": project_id,
               "folder_id": folder_id, "recipe": m["recipe"]}
        png = images.get(m["id"])
        if png is None:
            row["name"] = f"{slug} {m['id']} (failed)"
        else:
            row["name"] = f"{slug} {m['id']}"
            for key, data in ((f"{uid}/{map_id}/full.png", png),
                              (f"{uid}/{map_id}/thumb.png", _thumbnail(png))):
                up = requests.post(
                    f"{url}/storage/v1/object/{MAPS_BUCKET}/{key}",
                    headers={**headers, "Content-Type": "image/png", "x-upsert": "true"},
                    data=data, timeout=60,
                )
                if up.status_code not in (200, 201):
                    raise RuntimeError(
                        f"map upload {m['id']}: HTTP {up.status_code} {up.text[:200]}")
            row["image_path"] = f"{uid}/{map_id}/full.png"
            row["thumbnail_path"] = f"{uid}/{map_id}/thumb.png"
        _rest_insert(url, headers, "saved_maps", row)
    log.info("synopsis: %d maps saved to library folder '%s'", len(post["maps"]), slug)


# ── Orchestration ────────────────────────────────────────────────────────────

def run_pipeline(discussion: str, save_draft: bool = False,
                 target_date: str | None = None,
                 source: Discussion | None = None) -> dict:
    """The whole job. Returns a summary dict (also logged)."""
    post, usage = generate_post(discussion, target_date)
    if source:
        # Travels inside the post dict so saved post.json reruns keep it.
        post["source"] = {"url": source.url, "issued": source.issued}
    post["title"] = compose_title(post)
    slug = compose_slug(post)
    flagged = unsupported_words(post, discussion)

    images, render_errors = render_all_maps(post)
    apply_data_driven_captions(post)

    result = {
        "slug": slug,
        "title": post["title"],
        "maps_rendered": len(images),
        "map_errors": render_errors,
        "review_flags": flagged,
        "usage": usage,
        "post": post,
        "images": images,
    }

    if save_draft:
        upload_images(slug, images)
        result["draft"] = upsert_draft(
            slug, post["title"], post["description"], build_body_md(post, slug),
            event_date=event_date_iso(post["post_date"]),
            tags=post.get("tags", []),
            regions=post.get("regions", []),
        )
        save_library_maps(slug, post, images)
    return result


def run_scheduled(target_date: str | None = None, issuance: str = "morning") -> None:
    """Fetch a discussion and save a draft. Called by the cron endpoint in a
    background task; all outcomes go to the log."""
    try:
        target = target_date or default_target_date()
        if day_status(target) == "published":
            log.info("synopsis: post for %s already published — skipping", target)
            return
        disc = fetch_discussion(target, issuance)
        result = run_pipeline(disc.text, save_draft=True, target_date=target,
                              source=disc)
        log.info(
            "synopsis: draft %s '%s' (%d maps, %d errors, flags=%s, $%.3f)",
            result.get("draft"), result["slug"], result["maps_rendered"],
            len(result["map_errors"]), result["review_flags"] or "none",
            result["usage"]["cost_usd"],
        )
    except Exception:
        log.exception("synopsis: scheduled run failed")
