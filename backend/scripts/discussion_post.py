#!/usr/bin/env python3
"""
Synopsis pipeline CLI (#37) — a thin wrapper over app.synopsis for local
testing. Maps render in-process, so the dev server does NOT need to be
running. Output goes to scripts/out/<timestamp>/ for review:

    post.json     the generated post
    <id>.png      one PNG per map
    preview.html  open in a browser to judge the post

Run from the backend/ directory:

    uv run python scripts/discussion_post.py --file scripts/example_discussion.txt
    uv run python scripts/discussion_post.py --fetch               # discussion from 2 days ago
    uv run python scripts/discussion_post.py --fetch --draft      # ...and save a dev draft

Needs ANTHROPIC_API_KEY (backend/.env). --draft also needs SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY. Two flags work without any keys:

    --dry-run              print the assembled system prompt and exit
    --from-json <path>     skip the model call; render maps from a saved post.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

load_dotenv()  # before app imports so keys are visible to them

from app import synopsis  # noqa: E402


def write_preview(post: dict, out_dir: Path) -> None:
    """A single local HTML file that shows the post roughly as /synopsis
    would: medium images, click for the full-size lightbox."""
    def fig(map_id: str) -> str:
        m = next((x for x in post["maps"] if x["id"] == map_id), None)
        if m is None or not (out_dir / f"{map_id}.png").exists():
            return f"<p class='missing'>[map {map_id} missing]</p>"
        return (f"<figure><img src='{map_id}.png' alt=''>"
                f"<figcaption>{m['caption']}</figcaption></figure>")

    shown: set[str] = set()

    def figs(section: dict) -> str:
        out = []
        for mid in section["map_ids"]:
            if mid not in shown:
                shown.add(mid)
                out.append(fig(mid))
        return "".join(out)

    parts = [f"<h2>{s['heading']}</h2><p>{s['body']}</p>" + figs(s)
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
  figure img {{ display:block; width:640px; max-width:100%; height:auto;
                border-radius:.5rem; margin:0 auto; cursor:zoom-in; }}
  figcaption {{ text-align:center; font-size:.82rem; color:#8fa0c5; margin-top:.45rem; }}
  .missing {{ color:#fca5a5; }}
  #lightbox {{ display:none; position:fixed; inset:0; z-index:80;
               background:rgba(0,0,0,.85); cursor:zoom-out;
               align-items:center; justify-content:center; }}
  #lightbox img {{ max-width:95vw; max-height:92vh; border-radius:.5rem; }}
</style>
<div class="shell">
  <h1>{post['title']}</h1>
  <article><p>{post['intro']}</p>{''.join(parts)}</article>
</div>
<div id="lightbox"><img alt=""></div>
<script>
  const lb = document.getElementById('lightbox');
  document.querySelectorAll('figure img').forEach(img =>
    img.addEventListener('click', () => {{
      lb.querySelector('img').src = img.src;
      lb.style.display = 'flex';
    }}));
  lb.addEventListener('click', () => lb.style.display = 'none');
  document.addEventListener('keydown', e => {{
    if (e.key === 'Escape') lb.style.display = 'none';
  }});
</script>"""
    (out_dir / "preview.html").write_text(html)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file", help="path to a forecast discussion text file")
    ap.add_argument("--fetch", action="store_true",
                    help=f"fetch the PMDSPD from {synopsis.LAG_DAYS} days ago (the day CORe has data for)")
    ap.add_argument("--date", help="override the fetch date (YYYYMMDD)")
    ap.add_argument("--from-json", help="render an existing post.json (no model call)")
    ap.add_argument("--dry-run", action="store_true", help="print the system prompt and exit")
    ap.add_argument("--draft", action="store_true",
                    help="also upload images and save an unpublished draft to Supabase")
    ap.add_argument("--out", default=str(Path(__file__).with_name("out")))
    args = ap.parse_args()

    if args.dry_run:
        print(synopsis.build_system_prompt())
        return 0

    out_dir = Path(args.out) / time.strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.from_json:
        post = json.loads(Path(args.from_json).read_text())
        post.setdefault("title", synopsis.compose_title(post))
        images, errors = synopsis.render_all_maps(post)
        result = {"post": post, "images": images, "map_errors": errors,
                  "review_flags": [], "slug": synopsis.compose_slug(post)}
        if args.draft:
            synopsis.upload_images(result["slug"], images)
            result["draft"] = synopsis.upsert_draft(
                result["slug"], post["title"], post["description"],
                synopsis.build_body_md(post, result["slug"]))
    else:
        if args.fetch or args.date:
            discussion = synopsis.fetch_discussion(args.date)
            print("Fetched discussion:", discussion.splitlines()[2])
        elif args.file:
            discussion = Path(args.file).read_text()
        else:
            ap.error("need --file, --fetch, --from-json, or --dry-run")
        print(f"Calling {synopsis.MODEL} ...")
        result = synopsis.run_pipeline(discussion, save_draft=args.draft)
        u = result["usage"]
        print(f"  tokens: {u['input_tokens']} in / {u['output_tokens']} out"
              f"  (~${u['cost_usd']:.3f})")

    post = result["post"]
    for map_id, png in result["images"].items():
        (out_dir / f"{map_id}.png").write_bytes(png)
    (out_dir / "post.json").write_text(json.dumps(
        {k: v for k, v in post.items()}, indent=2))
    write_preview(post, out_dir)

    if result["review_flags"]:
        print(f"  REVIEW: post uses impact words the discussion never does: "
              f"{', '.join(result['review_flags'])}")
    if result.get("draft"):
        print(f"  Draft {result['draft']}: '{result['slug']}' (unpublished, "
              f"category '{synopsis.CATEGORY}')")

    print(f"\nWrote {out_dir}/")
    print(f"  open {out_dir}/preview.html")
    if result["map_errors"]:
        print("\nMap errors:")
        for e in result["map_errors"]:
            print(f"  {e}")
    return 1 if result["map_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
