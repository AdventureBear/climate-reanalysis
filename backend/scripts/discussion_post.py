#!/usr/bin/env python3
"""
Synopsis pipeline (#37): forecast discussion -> post JSON -> rendered maps.

v1 writes local files only (no bucket upload, no posts row):

    scripts/out/<timestamp>/post.json     the generated post
    scripts/out/<timestamp>/<id>.png      one PNG per map
    scripts/out/<timestamp>/preview.html  open in a browser to judge the post

Run from the backend/ directory (the local API server must be running):

    uv run python scripts/discussion_post.py --file scripts/example_discussion.txt

Needs ANTHROPIC_API_KEY (from backend/.env or the environment). Two flags
work without a key:

    --dry-run              print the assembled system prompt and exit
    --from-json <path>     skip the model call; render maps from a saved post.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import PRESSURE_LEVELS, REGIONS, VARIABLES  # noqa: E402

MODEL = "claude-opus-4-8"
COST_PER_MTOK_IN = 5.00
COST_PER_MTOK_OUT = 25.00
HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"]
PROMPT_PATH = Path(__file__).with_name("synopsis_prompt.md")

# Structured-output schema: every field is required; optional map params are
# nullable and the renderer drops nulls before building the query string.
_NULLABLE_INT = {"anyOf": [{"type": "integer"}, {"type": "null"}]}
_NULLABLE_STR = {"anyOf": [{"type": "string"}, {"type": "null"}]}
POST_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
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
                        },
                        "required": [
                            "variable", "level", "region", "date", "hour",
                            "mode", "fill_mode", "contours", "centers",
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
    "required": ["title", "description", "intro", "maps", "sections"],
}


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
        "centers 1 adds H/L pressure markers (pairs well with temp_2m plus contours 'pressure').",
        "Set unused optional fields to null.",
    ]
    return "\n".join(lines)


def build_system_prompt() -> str:
    return PROMPT_PATH.read_text() + "\n" + legal_values_block()


def generate_post(discussion: str) -> tuple[dict, dict]:
    """One model call: discussion text in, post JSON out. Returns (post, usage)."""
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=build_system_prompt(),
        output_config={"format": {"type": "json_schema", "schema": POST_SCHEMA}},
        messages=[{"role": "user", "content": discussion}],
    )
    text = next(b.text for b in response.content if b.type == "text")
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    return json.loads(text), usage


def render_maps(post: dict, api_base: str, out_dir: Path) -> list[str]:
    """GET /api/map for each entry; save PNGs next to post.json. Returns errors."""
    errors: list[str] = []
    for m in post["maps"]:
        params = {k: v for k, v in m["params"].items() if v is not None}
        url = f"{api_base}/api/map?" + urllib.parse.urlencode(params)
        print(f"  {m['id']}: {url}")
        resp = requests.get(url, timeout=300)
        if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
            errors.append(f"{m['id']}: HTTP {resp.status_code} — {resp.text[:200]}")
            continue
        (out_dir / f"{m['id']}.png").write_bytes(resp.content)
    return errors


def write_preview(post: dict, out_dir: Path) -> None:
    """A single local HTML file that shows the post roughly as /synopsis would."""
    def fig(map_id: str) -> str:
        m = next((x for x in post["maps"] if x["id"] == map_id), None)
        if m is None or not (out_dir / f"{map_id}.png").exists():
            return f"<p class='missing'>[map {map_id} missing]</p>"
        return (f"<figure><img src='{map_id}.png' alt=''>"
                f"<figcaption>{m['caption']}</figcaption></figure>")

    parts = [f"<h2>{s['heading']}</h2><p>{s['body']}</p>" + "".join(fig(i) for i in s["map_ids"])
             for s in post["sections"]]
    html = f"""<!doctype html><meta charset="utf-8"><title>{post['title']}</title>
<style>
  body {{ margin:0; background:#16224a; color:#cbd5e1; font-family:system-ui,sans-serif; }}
  .shell {{ max-width:72rem; margin:0 auto; padding:3rem 1.25rem; }}
  h1 {{ color:#e2e8f0; font-size:1.9rem; line-height:1.25; }}
  article {{ border:1px solid rgba(46,66,120,.6); background:rgba(27,42,85,.7);
             border-radius:1rem; padding:2rem; }}
  article p {{ line-height:1.75; }}
  article h2 {{ color:#e2e8f0; font-size:1.25rem; margin-top:2rem; }}
  figure {{ margin:1.4rem 0; }}
  figure img {{ display:block; max-width:100%; height:auto; border-radius:.5rem; margin:0 auto; }}
  figcaption {{ text-align:center; font-size:.82rem; color:#8fa0c5; margin-top:.45rem; }}
  .missing {{ color:#fca5a5; }}
</style>
<div class="shell">
  <h1>{post['title']}</h1>
  <article><p>{post['intro']}</p>{''.join(parts)}</article>
</div>"""
    (out_dir / "preview.html").write_text(html)


def main() -> int:
    load_dotenv()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file", help="path to a forecast discussion text file")
    ap.add_argument("--from-json", help="render an existing post.json (no model call)")
    ap.add_argument("--dry-run", action="store_true", help="print the system prompt and exit")
    ap.add_argument("--api-base", default="http://127.0.0.1:8000")
    ap.add_argument("--out", default=str(Path(__file__).with_name("out")))
    args = ap.parse_args()

    if args.dry_run:
        print(build_system_prompt())
        return 0

    if args.from_json:
        post = json.loads(Path(args.from_json).read_text())
    else:
        if not args.file:
            ap.error("--file is required (or use --from-json / --dry-run)")
        discussion = Path(args.file).read_text()
        print(f"Calling {MODEL} ...")
        post, usage = generate_post(discussion)
        cost = (usage["input_tokens"] * COST_PER_MTOK_IN
                + usage["output_tokens"] * COST_PER_MTOK_OUT) / 1_000_000
        print(f"  tokens: {usage['input_tokens']} in / {usage['output_tokens']} out"
              f"  (~${cost:.3f})")

    out_dir = Path(args.out) / time.strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "post.json").write_text(json.dumps(post, indent=2))

    print(f"Rendering {len(post['maps'])} maps via {args.api_base} ...")
    errors = render_maps(post, args.api_base, out_dir)
    write_preview(post, out_dir)

    print(f"\nWrote {out_dir}/")
    print(f"  open {out_dir}/preview.html")
    if errors:
        print("\nMap errors:")
        for e in errors:
            print(f"  {e}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
