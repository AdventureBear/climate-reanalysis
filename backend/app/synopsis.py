"""
Synopsis pipeline (#37): forecast discussion -> draft blog post with maps.

One claude-opus-4-8 call turns a WPC Short Range Forecast Discussion into a
post (headline, intro, sections, map params). Maps render in-process through
create_map_buffer — no HTTP round trip to our own server. With publishing
enabled, PNGs upload to the public post-images bucket and the post lands in
the posts table as an unpublished draft with category 'forecast discussion'.

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
from .map_pipeline.request import MapRequest
from .map_service import create_map_buffer

log = logging.getLogger("synopsis")

MODEL = "claude-opus-4-8"
COST_PER_MTOK_IN = 5.00
COST_PER_MTOK_OUT = 25.00
HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"]
CATEGORY = "forecast discussion"
PROMPT_PATH = Path(__file__).with_name("synopsis_prompt.md")

# PMDSPD text from the IEM AFOS archive (public domain NWS product). The
# pipeline recaps a day that already happened, and CORe data lags real time
# by 1-2 days — so the scheduled run reads the discussion from LAG_DAYS ago
# (its morning issuance, whose valid period covers that same day).
DISCUSSION_URL = "https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py"
LAG_DAYS = 2

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


# Structured-output schema: the per-map recipe uses builder vocabulary.
# Flat date/hour here; to_map_recipe() folds them into the stored MapRecipe's
# time object and applies house rules (barbs step 2, r2-daily climatology).
_NULLABLE_FILL = {"anyOf": [{"type": "string", "enum": ["contours", "shaded"]},
                            {"type": "null"}]}
_NULLABLE_CONTOURS = {"anyOf": [
    {"type": "array", "items": {"type": "string", "enum": ["pressure", "height", "temp"]}},
    {"type": "null"}]}
POST_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "headline": {"type": "string"},
        "post_date": {"type": "string"},
        "description": {"type": "string"},
        "intro": {"type": "string"},
        "maps": {
            "type": "array",
            "items": {
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
            },
        },
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "heading": {"type": "string"},
                    "body": {"type": "string"},
                    "map_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["heading", "body", "map_ids"],
            },
        },
    },
    "required": ["headline", "post_date", "description", "intro", "maps", "sections"],
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
    the chosen issuance window. An AFD post is a historical forecast: the
    discussion as issued, with maps of the setup on that same day."""
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
    """The lists of valid recipe values, generated from the UI catalog (which
    itself derives per-variable levels and anomaly support from app.config)."""
    lines = ["## Legal values", "", "Regions: " + ", ".join(REGIONS)]
    lines += ["", "Variables (variable — name; displayMode; level values):"]
    for ui_key, levels in UI_CATALOG.items():
        api_keys = {api for _, api, _ in levels}
        modes = ("raw, anomaly"
                 if any(VARIABLES[a].get("climo_sources") for a in api_keys)
                 else "raw only")
        name = VARIABLES[ui_key]["name"] if ui_key in VARIABLES else VARIABLES[levels[0][1]]["name"]
        level_values = ", ".join(ui_level for ui_level, _, _ in levels)
        lines.append(f"- {ui_key} — {name}; {modes}; level: {level_values}")
    lines += [
        "",
        "hour (UTC): " + ", ".join(HOURS) + " — pick the hour that best shows the feature "
        "(21z is afternoon in the US).",
        "date: YYYYMMDD, within the discussion's valid period.",
        "level is always a string from the variable's level list (pressure levels are mb).",
        "Overlays: fillMode 'shaded' is recommended for height maps. "
        "contours is a list from: pressure, height, temp. "
        "centers true adds H/L pressure markers (pairs well with temp surface_2m plus contours ['pressure']). "
        "wind true adds wind barbs — use it on wind_speed maps to show flow direction.",
        "Set fillMode and contours to null when unused.",
    ]
    return "\n".join(lines)


def build_system_prompt(target_date: str | None = None) -> str:
    prompt = PROMPT_PATH.read_text() + "\n" + legal_values_block()
    if target_date:
        prompt += (f"\nThis column covers {target_date} only. Every map uses date {target_date} — "
                   "later days in the discussion are forecasts, and no data exists for them yet.")
    return prompt


def generate_post(discussion: str, target_date: str | None = None) -> tuple[dict, dict]:
    """One model call: discussion text in, post JSON out. Returns (post, usage)."""
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=build_system_prompt(target_date),
        output_config={"format": {"type": "json_schema", "schema": POST_SCHEMA}},
        messages=[{"role": "user", "content": discussion}],
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
    post_text = json.dumps(post).lower()
    source = discussion.lower()
    return [w for w in WATCH_WORDS if w in post_text and w not in source]


def to_map_recipe(raw: dict, target_date: str | None = None) -> dict:
    """The model's flat recipe -> the full MapRecipe shape stored in
    saved_maps.recipe and consumed by the map builder. Applies the house
    rules deterministically: every map pinned to the discussion's own day
    (later days are forecasts with no data), wind glyphs always barbs at
    step 2, sub-monthly anomalies always r2-daily climatology."""
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
    """Markdown body in the blog's existing format: images are bucket paths
    ('post-images/...'), embedded at their first reference only. Each map's
    caption ends with a /map deep link that reopens its recipe in the
    builder. When the source discussion is known (post['source'], attached by
    run_pipeline), a provenance line closes the post (#83) — derived from the
    fetch, never written by the model."""
    maps = {m["id"]: m for m in post["maps"]}
    lines = [post["intro"], ""]
    embedded: set[str] = set()
    for s in post["sections"]:
        lines += [f"## {s['heading']}", "", s["body"], ""]
        for mid in s["map_ids"]:
            if mid in embedded or mid not in maps:
                continue
            embedded.add(mid)
            m = maps[mid]
            url = builder_url(m["recipe"])
            link = f" · [Open this map in the builder]({url})" if url else ""
            lines += [f"![{m['caption']}](post-images/{slug}/{mid}.png)", "",
                      f"*{m['caption']}{link}*", ""]
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
                 event_date: str | None = None) -> str:
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
# thumbnail in the private maps bucket) under the admin's "Forecast
# Discussions" project, one folder per post slug — so every AFD map opens in
# the builder exactly like a user-saved map. Failed maps are saved too, with
# no image: their recipe is what the editor needs to debug them.

LIBRARY_PROJECT = "Forecast Discussions"
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
    normalize_recipes(post, target_date)
    if source:
        # Travels inside the post dict so saved post.json reruns keep it.
        post["source"] = {"url": source.url, "issued": source.issued}
    post["title"] = compose_title(post)
    slug = compose_slug(post)
    flagged = unsupported_words(post, discussion)

    images, render_errors = render_all_maps(post)

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
