#!/usr/bin/env python3
"""
Render Indian monsoon late-onset wind anomaly test maps.

Run from backend/:

    uv run python scripts/run_monsoon_wind_experiment.py

Default output:

    backend/scripts/out/monsoon-wind-anomaly-experiment/

The experiment compares late-onset and on-time/early-onset year cohorts across
pre-onset and post-onset windows. It renders 850mb and 925mb wind vector anomaly
magnitude plus normalized vector anomaly magnitude over the Indian Ocean.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import REGIONS  # noqa: E402
from app.map_pipeline.request import MapRequest  # noqa: E402
from app.map_service import create_map_buffer  # noqa: E402

log = logging.getLogger("monsoon_experiment")

DEFAULT_OUT_DIR = Path("scripts/out/monsoon-wind-anomaly-experiment")

LATE_ONSET_YEARS = [2005, 2014, 2016, 2019, 2023]
CONTROL_YEARS = [2013, 2017, 2018, 2020, 2022]

SYNOPTIC_HOURS = ["00", "06", "12", "18"]


@dataclass(frozen=True)
class Cohort:
    key: str
    label: str
    years: list[int]


@dataclass(frozen=True)
class Window:
    key: str
    label: str
    start_month: int
    start_day: int
    end_month: int
    end_day: int


COHORTS = [
    Cohort("late_onset", "Late-onset years", LATE_ONSET_YEARS),
    Cohort("control", "On-time/early control years", CONTROL_YEARS),
]

WINDOWS = [
    Window("pre_onset", "Late pre-onset window", 5, 28, 6, 5),
    Window("post_onset", "Post-onset recovery window", 6, 8, 6, 15),
]

MODE_LABELS = {
    "anomaly": "vector anomaly magnitude",
    "normalized": "normalized vector anomaly magnitude",
}


def parse_csv_ints(raw: str) -> list[int]:
    return [int(part.strip()) for part in raw.split(",") if part.strip()]


def parse_csv_strings(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(",") if part.strip()]


def dates_for_window(years: list[int], window: Window) -> list[str]:
    selected: list[str] = []
    for year in years:
        current = date(year, window.start_month, window.start_day)
        end = date(year, window.end_month, window.end_day)
        while current <= end:
            selected.append(current.strftime("%Y%m%d"))
            current += timedelta(days=1)
    return selected


def output_name(cohort: Cohort, window: Window, level: int, mode: str) -> str:
    return f"{cohort.key}_{window.key}_{level}mb_wind_{mode}.png"


def build_request(
    *,
    dates: list[str],
    hours: list[str],
    level: int,
    mode: str,
    region: str,
    climo_source: str,
    wind_step: int,
    wind_type: str,
) -> MapRequest:
    return MapRequest(
        dates=",".join(dates),
        date_mode="range",
        hours=",".join(hours),
        variable="wind_speed",
        level=level,
        region=region,
        mode=mode,
        climo_source=climo_source,
        wind_step=wind_step,
        wind_type=wind_type,
        wind_unit="kt",
        color_step=1,
        title_note="Monsoon test",
    )


def row_for(
    *,
    cohort: Cohort,
    window: Window,
    level: int,
    mode: str,
    dates: list[str],
    hours: list[str],
    region: str,
    climo_source: str,
    path: Path,
    status: str,
    error: str = "",
) -> dict[str, object]:
    return {
        "cohort": cohort.key,
        "cohort_label": cohort.label,
        "years": cohort.years,
        "window": window.key,
        "window_label": window.label,
        "window_start": f"{window.start_month:02d}-{window.start_day:02d}",
        "window_end": f"{window.end_month:02d}-{window.end_day:02d}",
        "level_mb": level,
        "mode": mode,
        "mode_label": MODE_LABELS[mode],
        "region": region,
        "climo_source": climo_source,
        "hours": hours,
        "date_count": len(dates),
        "fetch_count": len(dates) * len(hours),
        "dates": dates,
        "output": str(path),
        "status": status,
        "error": error,
    }


def write_manifest(out_dir: Path, rows: list[dict[str, object]]) -> None:
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")

    csv_path = out_dir / "manifest.csv"
    fieldnames = [
        "cohort",
        "cohort_label",
        "years",
        "window",
        "window_label",
        "window_start",
        "window_end",
        "level_mb",
        "mode",
        "mode_label",
        "region",
        "climo_source",
        "hours",
        "date_count",
        "fetch_count",
        "output",
        "status",
        "error",
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            flat = dict(row)
            flat["years"] = " ".join(str(y) for y in flat["years"])
            flat["hours"] = " ".join(str(h) for h in flat["hours"])
            writer.writerow({key: flat.get(key, "") for key in fieldnames})


def run(args: argparse.Namespace) -> int:
    if args.region not in REGIONS:
        raise SystemExit(f"Unknown backend region {args.region!r}. Available: {', '.join(REGIONS)}")

    levels = parse_csv_ints(args.levels)
    modes = parse_csv_strings(args.modes)
    hours = parse_csv_strings(args.hours)
    bad_modes = [mode for mode in modes if mode not in MODE_LABELS]
    if bad_modes:
        raise SystemExit(f"Unsupported mode(s) for this experiment: {bad_modes}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, object]] = []
    rendered = 0
    for cohort in COHORTS:
        for window in WINDOWS:
            dates = dates_for_window(cohort.years, window)
            for level in levels:
                for mode in modes:
                    path = out_dir / output_name(cohort, window, level, mode)
                    if args.limit is not None and rendered >= args.limit:
                        status = "planned"
                    elif path.exists() and not args.force:
                        status = "exists"
                    elif args.dry_run:
                        status = "planned"
                    else:
                        req = build_request(
                            dates=dates,
                            hours=hours,
                            level=level,
                            mode=mode,
                            region=args.region,
                            climo_source=args.climo_source,
                            wind_step=args.wind_step,
                            wind_type=args.wind_type,
                        )
                        log.info("Rendering %s", path.name)
                        try:
                            buf = create_map_buffer(req)
                            path.write_bytes(buf.getvalue())
                            rendered += 1
                            status = "rendered"
                        except Exception as exc:
                            log.exception("Failed rendering %s", path.name)
                            rows.append(
                                row_for(
                                    cohort=cohort,
                                    window=window,
                                    level=level,
                                    mode=mode,
                                    dates=dates,
                                    hours=hours,
                                    region=args.region,
                                    climo_source=args.climo_source,
                                    path=path,
                                    status="error",
                                    error=str(exc),
                                )
                            )
                            if not args.keep_going:
                                write_manifest(out_dir, rows)
                                return 1
                            continue

                    rows.append(
                        row_for(
                            cohort=cohort,
                            window=window,
                            level=level,
                            mode=mode,
                            dates=dates,
                            hours=hours,
                            region=args.region,
                            climo_source=args.climo_source,
                            path=path,
                            status=status,
                        )
                    )

    write_manifest(out_dir, rows)
    log.info("Wrote %s map record(s) to %s", len(rows), out_dir)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Folder for PNGs and manifests.")
    parser.add_argument("--region", default="Indian Ocean", help="Backend region key to render.")
    parser.add_argument("--levels", default="850,925", help="Comma-separated pressure levels in mb.")
    parser.add_argument("--modes", default="anomaly,normalized", help="Comma-separated modes: anomaly,normalized.")
    parser.add_argument("--hours", default="00,06,12,18", help="Comma-separated synoptic hours.")
    parser.add_argument("--climo-source", default="r2-daily", help="Climatology source for daily windows.")
    parser.add_argument("--wind-step", type=int, default=3, help="Barb/vector density step.")
    parser.add_argument("--wind-type", default="barbs", choices=["barbs", "vectors"])
    parser.add_argument("--limit", type=int, default=None, help="Render at most N maps; remaining rows are planned.")
    parser.add_argument("--dry-run", action="store_true", help="Write manifests without rendering PNGs.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing PNGs.")
    parser.add_argument("--keep-going", action="store_true", help="Continue rendering after a map failure.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
