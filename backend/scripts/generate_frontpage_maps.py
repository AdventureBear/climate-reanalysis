#!/usr/bin/env python3
"""
Generate the simple fallback "Last week in the Atmosphere" homepage gallery.

This is the lightweight cron path: pick known-good map types from the prior
completed week, render them in-process, upload PNGs to the public post-images
bucket, and publish post-images/last-week/manifest.json.

Run from backend/:

    uv run python scripts/generate_frontpage_maps.py

Required env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

load_dotenv()

from app import synopsis  # noqa: E402

log = logging.getLogger("frontpage-maps")

BUCKET = "post-images"
HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"]


@dataclass(frozen=True)
class FeatureGroup:
    title: str
    description: str
    alt: str
    candidates: tuple[dict[str, Any], ...]


FEATURE_GROUPS = (
    FeatureGroup(
        title="500mb heights",
        description="The steering pattern aloft",
        alt="500mb geopotential height map from last week",
        candidates=(
            {"variable": "height", "level": "500", "region": "CONUS", "fillMode": "shaded"},
            {"variable": "height", "level": "500", "region": "North America", "fillMode": "shaded"},
            {"variable": "height", "level": "500", "region": "North Atlantic", "fillMode": "shaded"},
            {"variable": "height", "level": "500", "region": "North Pacific", "fillMode": "shaded"},
        ),
    ),
    FeatureGroup(
        title="Jet stream winds",
        description="Where the fastest upper winds were",
        alt="Upper-level wind speed map from last week",
        candidates=(
            {"variable": "wind_speed", "level": "250", "region": "CONUS"},
            {"variable": "wind_speed", "level": "300", "region": "North America"},
            {"variable": "wind_speed", "level": "250", "region": "North Atlantic"},
            {"variable": "wind_speed", "level": "300", "region": "North Pacific"},
        ),
    ),
    FeatureGroup(
        title="Moisture and heat",
        description="A colorful slice near the surface",
        alt="Moisture or near-surface temperature map from last week",
        candidates=(
            {"variable": "precipitable_water", "level": "total_column", "region": "CONUS"},
            {"variable": "precipitable_water", "level": "total_column", "region": "Tropical Atlantic"},
            {"variable": "temp", "level": "surface_2m", "region": "CONUS"},
            {"variable": "temp", "level": "surface_2m", "region": "Eastern US"},
            {"variable": "pressure", "level": "surface_mslp", "region": "CONUS", "fillMode": "shaded", "centers": True},
        ),
    ),
)


def previous_completed_week(as_of: date) -> tuple[date, date]:
    this_week_monday = as_of - timedelta(days=as_of.weekday())
    return this_week_monday - timedelta(days=7), this_week_monday - timedelta(days=1)


def yyyymmdd(value: date) -> str:
    return value.strftime("%Y%m%d")


def date_range(start: date, end: date) -> list[date]:
    days = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def date_range_label(start: date, end: date) -> str:
    if start.year != end.year:
        return f"{start:%b} {start.day}, {start.year}-{end:%b} {end.day}, {end.year}"
    if start.month != end.month:
        return f"{start:%b} {start.day}-{end:%b} {end.day}, {end.year}"
    return f"{start:%b} {start.day}-{end.day}, {end.year}"


def rng_for_week(week_slug: str) -> random.Random:
    seed = int(hashlib.sha256(week_slug.encode()).hexdigest()[:16], 16)
    return random.Random(seed)


def recipe_for(candidate: dict[str, Any], valid_date: date, hour: str) -> dict[str, Any]:
    recipe = {
        "variable": candidate["variable"],
        "level": str(candidate["level"]),
        "region": candidate["region"],
        "displayMode": "raw",
        "time": {
            "scale": "3-hourly",
            "subMode": "single",
            "date": valid_date.isoformat(),
            "hour": hour,
        },
    }
    for key in ("fillMode", "centers", "contours"):
        if key in candidate:
            recipe[key] = candidate[key]
    return recipe


def upload_object(key: str, content: bytes, content_type: str) -> None:
    url, headers = synopsis._supabase()
    response = requests.post(
        f"{url}/storage/v1/object/{BUCKET}/{key}",
        headers={**headers, "Content-Type": content_type, "x-upsert": "true"},
        data=content,
        timeout=60,
    )
    if response.status_code not in (200, 201):
        raise RuntimeError(f"upload {key}: HTTP {response.status_code} {response.text[:200]}")


def build_gallery(as_of: date, dry_run: bool = False) -> dict[str, Any]:
    start, end = previous_completed_week(as_of)
    week_slug = f"{yyyymmdd(start)}-{yyyymmdd(end)}"
    rng = rng_for_week(week_slug)
    days = date_range(start, end)
    items = []

    for index, group in enumerate(FEATURE_GROUPS, start=1):
        attempts = [
            (candidate, valid_date, hour)
            for candidate in group.candidates
            for valid_date in days
            for hour in HOURS
        ]
        rng.shuffle(attempts)
        last_error: Exception | None = None

        for candidate, valid_date, hour in attempts:
            recipe = recipe_for(candidate, valid_date, hour)
            key = f"last-week/{week_slug}/map-{index}.png"
            item = {
                "title": group.title,
                "description": group.description,
                "src": f"{BUCKET}/{key}",
                "alt": group.alt,
                "href": synopsis.builder_url(recipe),
            }

            if dry_run:
                items.append(item)
                break

            try:
                log.info("rendering %s: %s", group.title, item["href"])
                png = synopsis.render_map_png(recipe)
                upload_object(key, png, "image/png")
                items.append(item)
                break
            except Exception as exc:
                last_error = exc
                log.warning("skipped candidate for %s: %s", group.title, exc)

        if len(items) < index:
            raise RuntimeError(f"could not render {group.title}: {last_error}")

    return {
        "dateRangeLabel": date_range_label(start, end),
        "weekStart": start.isoformat(),
        "weekEnd": end.isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="YYYY-MM-DD, defaults to today in UTC")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date() if args.as_of else datetime.now(timezone.utc).date()
    manifest = build_gallery(as_of, dry_run=args.dry_run)

    if args.dry_run:
        print(json.dumps(manifest, indent=2))
        return 0

    upload_object(
        "last-week/manifest.json",
        (json.dumps(manifest, indent=2) + "\n").encode(),
        "application/json",
    )
    log.info("updated %s/last-week/manifest.json", BUCKET)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
