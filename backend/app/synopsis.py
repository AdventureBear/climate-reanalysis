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
from datetime import datetime, timedelta
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

# Structured-output schema: every field is required; optional map params are
# nullable and the renderer drops nulls before building the MapRequest.
_NULLABLE_INT = {"anyOf": [{"type": "integer"}, {"type": "null"}]}
_NULLABLE_STR = {"anyOf": [{"type": "string"}, {"type": "null"}]}
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
                    "params": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "variable": {"type": "string"},
                            "level": _NULLABLE_INT,
                            "region": {"type": "string"},
                            "date": {"type": "string"},
                            "hour": {"type": "string", "enum": HOURS},
                            "mode": {"type": "string", "enum": ["raw", "anomaly"]},
                            "fill_mode": _NULLABLE_STR,
                            "contours": _NULLABLE_STR,
                            "centers": _NULLABLE_INT,
                            "wind_step": _NULLABLE_INT,
                            "wind_type": _NULLABLE_STR,
                        },
                        "required": [
                            "variable", "level", "region", "date", "hour",
                            "mode", "fill_mode", "contours", "centers",
                            "wind_step", "wind_type",
                        ],
                    },
                },
                "required": ["id", "caption", "params"],
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


def fetch_discussion(target_date: str | None = None) -> str:
    """The morning PMDSPD for target_date (YYYYMMDD; default LAG_DAYS ago).
    The 4 AM EDT issuance's valid period starts that same day, so the post
    recaps a day whose data CORe already has."""
    if target_date is None:
        target_date = default_target_date()
    day = datetime.strptime(target_date, "%Y%m%d").strftime("%Y-%m-%d")
    resp = requests.get(
        DISCUSSION_URL,
        params={"pil": "PMDSPD", "fmt": "text", "limit": 1,
                "sdate": f"{day}T06:00Z", "edate": f"{day}T14:00Z"},
        timeout=30,
    )
    resp.raise_for_status()
    text = resp.text
    start = text.find("Short Range Forecast Discussion")
    if start == -1:
        raise RuntimeError(f"PMDSPD fetch for {target_date}: no discussion found")
    return text[start:]


# ── Generate ─────────────────────────────────────────────────────────────────

def legal_values_block() -> str:
    """The lists of valid params, generated live from app.config."""
    lines = ["## Legal values", "", "Regions: " + ", ".join(REGIONS)]
    lines += ["", "Variables (key — name; modes; level):"]
    for key, cfg in VARIABLES.items():
        modes = "raw, anomaly" if cfg.get("climo_sources") else "raw only"
        if "display_level" in cfg:
            level = f"single-level ({cfg['display_level']}) — set level to null"
        else:
            levels = cfg.get("levels", PRESSURE_LEVELS)
            level = "levels (mb): " + ", ".join(str(v) for v in levels)
        lines.append(f"- {key} — {cfg['name']}; {modes}; {level}")
    lines += [
        "",
        "hour (UTC): " + ", ".join(HOURS) + " — pick the hour that best shows the feature "
        "(21z is afternoon in the US).",
        "date: YYYYMMDD, within the discussion's valid period.",
        "Overlays: fill_mode 'shaded' is recommended for height maps. "
        "contours takes a comma list from: pressure, height, temp. "
        "centers 1 adds H/L pressure markers (pairs well with temp_2m plus contours 'pressure'). "
        "wind_step 2 with wind_type 'barbs' adds wind barbs to wind_speed maps.",
        "Set unused optional fields to null.",
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


def compose_slug(post: dict) -> str:
    day = datetime.strptime(post["post_date"], "%Y%m%d")
    return f"us-weather-{day.strftime('%A').lower()}-{day.strftime('%B').lower()}-{day.day}-{day.year}"


def unsupported_words(post: dict, discussion: str) -> list[str]:
    post_text = json.dumps(post).lower()
    source = discussion.lower()
    return [w for w in WATCH_WORDS if w in post_text and w not in source]


def pin_dates(post: dict, target_date: str) -> None:
    """Force the post and every map onto the discussion's own day. Later days
    in the valid period are forecasts — CORe has no data for them, and the
    column recaps one day only. Deterministic, like the barbs rule: the model
    is told the date, but this makes it impossible to get wrong."""
    post["post_date"] = target_date
    for m in post["maps"]:
        m["params"]["date"] = target_date


# ── Render ───────────────────────────────────────────────────────────────────

def render_map_png(params: dict) -> bytes:
    """One map, in-process — same code path as /api/map."""
    p = {k: v for k, v in params.items() if v is not None}
    # House rule: wind glyphs are always barbs (vectors read poorly at our
    # render size), and step 2 is the right density for CONUS and smaller.
    if p.get("wind_type") or p.get("wind_step"):
        p["wind_type"] = "barbs"
        p["wind_step"] = 2
    allowed = {f for f in MapRequest.__dataclass_fields__}
    req = MapRequest(**{k: v for k, v in p.items() if k in allowed})
    return create_map_buffer(req).getvalue()


def render_all_maps(post: dict) -> tuple[dict[str, bytes], list[str]]:
    """Returns ({map_id: png_bytes}, [error strings])."""
    images: dict[str, bytes] = {}
    errors: list[str] = []
    for m in post["maps"]:
        try:
            images[m["id"]] = render_map_png(m["params"])
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
    ('post-images/...'), embedded at their first reference only."""
    captions = {m["id"]: m["caption"] for m in post["maps"]}
    lines = [post["intro"], ""]
    embedded: set[str] = set()
    for s in post["sections"]:
        lines += [f"## {s['heading']}", "", s["body"], ""]
        for mid in s["map_ids"]:
            if mid in embedded or mid not in captions:
                continue
            embedded.add(mid)
            lines += [f"![{captions[mid]}](post-images/{slug}/{mid}.png)", "",
                      f"*{captions[mid]}*", ""]
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


def upsert_draft(slug: str, title: str, description: str, body_md: str) -> str:
    """Insert the draft, or refresh it if a draft with this slug exists.
    A published post is never touched — regeneration then reports and stops."""
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


# ── Orchestration ────────────────────────────────────────────────────────────

def run_pipeline(discussion: str, save_draft: bool = False,
                 target_date: str | None = None) -> dict:
    """The whole job. Returns a summary dict (also logged)."""
    post, usage = generate_post(discussion, target_date)
    if target_date:
        pin_dates(post, target_date)
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
            slug, post["title"], post["description"], build_body_md(post, slug)
        )
    return result


def run_scheduled() -> None:
    """Fetch the newest discussion and save a draft. Called by the cron
    endpoint in a background task; all outcomes go to the log."""
    try:
        target = default_target_date()
        discussion = fetch_discussion(target)
        result = run_pipeline(discussion, save_draft=True, target_date=target)
        log.info(
            "synopsis: draft %s '%s' (%d maps, %d errors, flags=%s, $%.3f)",
            result.get("draft"), result["slug"], result["maps_rendered"],
            len(result["map_errors"]), result["review_flags"] or "none",
            result["usage"]["cost_usd"],
        )
    except Exception:
        log.exception("synopsis: scheduled run failed")
