#!/usr/bin/env python3
"""
Synopsis pipeline CLI (#37) — a thin wrapper over app.synopsis for local
testing. Maps render in-process, so the dev server does NOT need to be
running. Output goes to scripts/out/<timestamp>/ for review:

    post.json     local preview artifact: generated prose, maps, and source text
    <id>.png      one PNG per map
    preview.html  open in a browser to judge the post

Run from the backend/ directory:

    uv run python scripts/discussion_post.py --file scripts/example_discussion.txt
    uv run python scripts/discussion_post.py --fetch               # discussion from 3 days ago
    uv run python scripts/discussion_post.py --fetch --plan-only   # test the LLM plan only
    uv run python scripts/discussion_post.py --fetch --draft      # ...and save a dev draft

Needs ANTHROPIC_API_KEY (backend/.env). --draft also needs SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY. Two flags work without any keys:

    --dry-run              print the assembled system prompt and exit
    --from-json <path>     skip the model call; render maps from a local post.json
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

load_dotenv()  # before app imports so keys are visible to them

from app import synopsis  # noqa: E402


def md_inline(text: str) -> str:
    parts: list[str] = []
    pos = 0
    for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", text):
        parts.append(html.escape(text[pos:m.start()]))
        parts.append(
            f"<a href='{html.escape(m.group(2), quote=True)}'>"
            f"{html.escape(m.group(1))}</a>"
        )
        pos = m.end()
    parts.append(html.escape(text[pos:]))
    return "".join(parts)


def preview_body_html(body_md: str, out_dir: Path) -> str:
    """Render the small markdown subset emitted by synopsis.build_body_md().

    This keeps local preview content tied to the same markdown saved to drafts
    without pulling in a general markdown dependency for one dev script.
    """
    out: list[str] = []
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            out.append(f"<p>{md_inline(' '.join(paragraph))}</p>")
            paragraph.clear()

    for line in body_md.splitlines():
        s = line.strip()
        if not s:
            flush_paragraph()
            continue
        if s == "---":
            flush_paragraph()
            out.append("<hr>")
            continue
        if s.startswith("### "):
            flush_paragraph()
            out.append(f"<h3>{md_inline(s[4:])}</h3>")
            continue
        if s.startswith("## "):
            flush_paragraph()
            out.append(f"<h2>{md_inline(s[3:])}</h2>")
            continue

        image = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", s)
        if image:
            flush_paragraph()
            alt, src = image.groups()
            local = src.split("/")[-1]
            if (out_dir / local).exists():
                out.append(
                    f"<figure><img src='{html.escape(local, quote=True)}' "
                    f"alt='{html.escape(alt, quote=True)}'></figure>"
                )
            else:
                out.append(f"<p class='missing'>[map {html.escape(local)} missing]</p>")
            continue

        if s.startswith("*Source: ") and s.endswith("*"):
            flush_paragraph()
            out.append(f"<p class='source'>{md_inline(s[1:-1])}</p>")
            continue

        if s.startswith("*") and s.endswith("*"):
            flush_paragraph()
            out.append(f"<p class='caption'>{md_inline(s[1:-1])}</p>")
            continue

        paragraph.append(s)

    flush_paragraph()
    return "".join(out)


def write_preview(post: dict, out_dir: Path) -> None:
    """A single local HTML file that shows the post roughly as /synopsis
    would: medium images, click for the full-size lightbox."""
    body_html = preview_body_html(synopsis.build_body_md(post, synopsis.compose_slug(post)), out_dir)
    page_html = f"""<!doctype html><meta charset="utf-8"><title>{post['title']}</title>
<style>
  body {{ margin:0; background:#16224a; color:#cbd5e1; font-family:system-ui,sans-serif; }}
  .shell {{ max-width:72rem; margin:0 auto; padding:3rem 1.25rem; }}
  h1 {{ color:#e2e8f0; font-size:1.9rem; line-height:1.25; }}
  article {{ border:1px solid rgba(46,66,120,.6); background:rgba(27,42,85,.7);
             border-radius:1rem; padding:2rem; }}
  article p {{ line-height:1.75; }}
  article h2 {{ color:#e2e8f0; font-size:1.25rem; margin-top:2rem; }}
  article h3 {{ color:#dbeafe; font-size:1rem; line-height:1.35; text-align:center;
                max-width:42rem; margin:3.25rem auto .7rem; }}
  figure {{ margin:.8rem 0 2.2rem; }}
  figure img {{ display:block; width:640px; max-width:100%; height:auto;
                border-radius:.5rem; margin:0 auto; cursor:zoom-in; }}
  .caption {{ text-align:center; font-size:.82rem; color:#8fa0c5; margin-top:.45rem; }}
  .source {{ font-style:italic; }}
  .missing {{ color:#fca5a5; }}
  a {{ color:#7dd3fc; }}
  hr {{ border:0; border-top:1px solid rgba(46,66,120,.6); margin:2rem 0; }}
  #lightbox {{ display:none; position:fixed; inset:0; z-index:80;
               background:rgba(0,0,0,.85); cursor:zoom-out;
               align-items:center; justify-content:center; }}
  #lightbox img {{ max-width:95vw; max-height:92vh; border-radius:.5rem; }}
</style>
<div class="shell">
  <h1>{post['title']}</h1>
  <article>{body_html}</article>
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
    (out_dir / "preview.html").write_text(page_html)


def print_plan_summary(post: dict) -> None:
    print(f"  planned maps: {len(post.get('maps') or [])}")
    for m in post.get("maps") or []:
        recipe = m["recipe"]
        t = recipe["time"]
        print(
            f"    {m['id']}: {recipe['variable']} {recipe['level']} "
            f"{recipe['region']} {t['date']} {t['hour']}z"
        )
    for section in post.get("sections") or []:
        print(f"    section '{section['heading']}' maps: {', '.join(section['map_ids'])}")
    print("  tags:", ", ".join(post.get("tags") or []))
    print("  regions:", ", ".join(post.get("regions") or []))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file", help="path to a WPC discussion text file")
    ap.add_argument("--fetch", action="store_true",
                    help=f"fetch the PMDSPD from {synopsis.LAG_DAYS} days ago (the day CORe has data for)")
    ap.add_argument("--date", help="override the fetch date (YYYYMMDD)")
    ap.add_argument("--from-json", help="render an existing post.json (no model call)")
    ap.add_argument("--plan-only", action="store_true",
                    help="call the model and write post.json/preview.html, but do not render or save")
    ap.add_argument("--plan-retries", type=int, default=1,
                    help="validation repair retries for --plan-only (default: 1)")
    ap.add_argument("--dry-run", action="store_true", help="print the system prompt and exit")
    ap.add_argument("--draft", action="store_true",
                    help="also upload images and save an unpublished draft to Supabase")
    ap.add_argument("--out", default=str(Path(__file__).with_name("out")))
    args = ap.parse_args()

    if args.dry_run:
        print(synopsis.build_system_prompt())
        return 0
    if args.plan_only and args.draft:
        ap.error("--plan-only cannot be combined with --draft")

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
                synopsis.build_body_md(post, result["slug"]),
                event_date=synopsis.event_date_iso(post["post_date"]),
                tags=post.get("tags", []),
                regions=post.get("regions", []))
            synopsis.save_library_maps(result["slug"], post, images)
    else:
        target_date = None
        source = None
        if args.fetch or args.date:
            target_date = args.date or synopsis.default_target_date()
            source = synopsis.fetch_discussion(target_date)
            discussion = source.text
            print("Fetched discussion:", source.issued or discussion.splitlines()[2])
        elif args.file:
            discussion = Path(args.file).read_text()
        else:
            ap.error("need --file, --fetch, --from-json, or --dry-run")
        print(f"Calling {synopsis.MODEL} ...")
        if args.plan_only:
            plan, usage = synopsis.generate_plan(
                discussion, target_date=target_date, retries=args.plan_retries)
            (out_dir / "plan.raw.json").write_text(json.dumps(plan, indent=2))
            try:
                post = synopsis.assemble_post(plan, discussion, target_date=target_date)
            except ValueError as exc:
                print(f"  INVALID PLAN: {exc}")
                print(f"  raw plan: {out_dir / 'plan.raw.json'}")
                return 1
            if source:
                post["source"] = {"url": source.url, "issued": source.issued}
            post["title"] = synopsis.compose_title(post)
            result = {
                "post": post,
                "images": {},
                "map_errors": [],
                "review_flags": synopsis.unsupported_words(post, discussion),
                "slug": synopsis.compose_slug(post),
                "usage": usage,
            }
        else:
            result = synopsis.run_pipeline(discussion, save_draft=args.draft,
                                           target_date=target_date, source=source)
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
    if args.plan_only:
        print_plan_summary(post)
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
