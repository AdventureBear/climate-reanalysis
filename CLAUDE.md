# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `PROJECT.md` for the current project context, user stories, scientific design principles, roadmap, and reference notes.

---

## Commands

All backend commands run from the `backend/` directory using `uv`.

**Backend**
```bash
cd backend
uv run uvicorn app.main:app --reload   # dev server at http://127.0.0.1:8000
uv add <package>                       # add a dependency
```

**Frontend**
```bash
cd frontend
npm install       # install deps
npm run dev       # next dev at http://localhost:5173
npm run build     # next build → static export in out/
npm run lint      # eslint
```

**Supabase** (dev project only — production gets its own project; keep this one localhost-oriented)
```bash
supabase migration list    # compare local files vs applied history
```
Schema changes are file-first: write the migration in `supabase/migrations/`, then apply that exact content (see Working Agreement).

---

## What This Project Is

The PSL/NCEP reanalysis interactive pages (used in meteorology education and research) stopped updating in March 2026 when the underlying NCEP Reanalysis dataset was discontinued. PSL has no plans to rebuild the interface for the successor dataset. PyRe is the community replacement.

**The three PSL interfaces being replicated:**
- Monthly/Seasonal Composites — `https://psl.noaa.gov/cgi-bin/data/composites/printpage.pl`
- Daily Mean Composites — `https://psl.noaa.gov/data/composites/day/`
- Hourly Composites — `https://psl.noaa.gov/data/composites/hour/` (PyRe supports CORe's 3-hourly 00/03/06/09/12/15/18/21z analyses)

The new underlying dataset is **CORe (Climate-Ocean Reanalysis)** from NCEP/CPC, available back to the 1950s.
- CORe info: `https://www.cpc.ncep.noaa.gov/products/CORe/index.html`
- PSL data info: `https://psl.noaa.gov/data/coreinfo.html`
- `get_core.py` reference: `https://ftp.cpc.ncep.noaa.gov/CORe/get_core/get_core.txt`

---

## Architecture

Monorepo, three legs:

- `backend/` — Python 3.12, FastAPI, uv. All scientific computation and map rendering.
- `frontend/` — Next.js 16 **static export** (React 19, TypeScript, Tailwind v4, React Compiler). No Node server in production: `next build` emits `out/`, served by Render's static site. Dev server runs on port 5173.
- `supabase/` — accounts, saved-map library, visitor analytics, blog posts, object storage, and the `rebuild-site` Edge Function. The React app talks to Supabase directly with the anon key; RLS enforces ownership and admin gates.

**The frontend is a thin UI shell. All computation and rendering happen on the backend.**

The frontend sends a "recipe" (variable, level, region, date list, mode) → backend fetches, computes, renders → streams a PNG → frontend displays in an `<img>` tag.

**Deployment:** frontend `out/` on a Render static site (rebuilt via a deploy hook that only the `rebuild-site` Edge Function calls); backend on a Render service with `CORS_ORIGINS`, `PYRE_CACHE_DIR`, etc. set in the environment. The current Supabase project is DEV only. Deploying to production is always a user-initiated act.

### Working Agreement (issue-driven workflow)

GitHub issues are the tracker of record; one issue in flight at a time. New ideas become issues, not code.

1. **Spec-in-issue before code.** Before building an issue, post the spec as a comment on it — approach, files touched, any migration — and get approval there before writing code.
2. **Done-when lists.** Every issue gets 2–4 observable acceptance criteria before work starts. Verification means demonstrating those criteria against the running app, not just green checks.
3. **Done means working in development.** An issue closes when its change is verified in dev. Deploying to production is a separate, user-initiated act (push to the deploy branch) — never a condition for closing an issue.
4. **Fixes get mini-specs too.** Unplanned bugs and small changes go through the same spec-comment step (a few lines is fine) — never straight to code.
5. **Filing is not fixing.** "Add issue: X" and comments on backlogged issues produce issue text only. Triage reasoning, ruled-out causes, and ready-to-run diagnostic commands belong in issue comments; executing any of them (running commands, probing prod, editing code) waits until the issue is explicitly picked up to work. The turn ends when the comment is posted.
6. **Claude never commits to main.** Every piece of work — features, fixes, docs, one-line changes — is committed on a feature branch (`feat/…`, `fix/…`). Every new feature starts with a fresh branch off current main. Only the user merges to main, and only the user pushes anywhere (the deploy branch is named `render` — her name, don't rename it). If the working tree is on main when work starts, branch first.
7. **Discussion stays in chat; the issue gets one comment per phase.** While a spec or plan is under discussion, never post to the GitHub issue — draft thinking there becomes stale noise she deletes by hand. Post to the issue exactly once per phase, only after she explicitly confirms agreement ("go", "agreed", "post it"). During discussion, no point is "settled" or "confirmed" until she declares the discussion done; restate working state neutrally, ask clarifying questions about the ticket, and don't push toward closure.
8. **Explicit "go" before building.** Spec approval and answered clarifying questions are NOT a green light. After the discussion converges, present the concrete ordered build plan in chat (migration DDL, modules touched, verification steps) and end the turn. Code, migrations, and branch creation start only after she explicitly says go. This applies to experiments too — discuss the exact commands/requests before running them.
9. **Commits happen only when she says "commit."** During design/tuning iterations: implement → show the result → stop. Don't commit per iteration, don't prompt or remind her to commit — she decides when work has earned it, and approved tweaks batch into one commit.
10. **Verify shared state before each work chunk, don't infer it.** She changes the repo and database between turns (merges, deletes branches, pushes, runs SQL). Run `git branch --show-current` + `git status --short` before starting any piece of work — if the expected branch is gone she merged it, so branch fresh off current main. For the database, check `supabase migration list` or query the actual schema; never act on remembered state.
11. **Plain literal language; complete runnable commands.** Programming vocabulary and short code snippets, not prose metaphors, in both explanations and status updates. Explanations are written at a 10th-grade reading level: short sentences, one idea per sentence, no dense academic prose — the terms can be technical, the sentence structure stays simple. Shell commands are always complete: `cd <absolute path>` first when the directory matters, full file paths, explicit `<placeholders>`.
12. **Don't redo routine ops she knows.** Starting/restarting dev servers and similar are hers — state what needs to happen and let her run it. Reserve tool calls for work that genuinely needs Claude.

**NO MIGRATIONS, PERIOD, UNLESS SHE EXPLICITLY APPROVES THAT SPECIFIC MIGRATION.** Claude never applies any change to any database — schema, grants, RLS, buckets, data — without her saying yes to that exact migration first, shown to her as SQL in chat. This has no exceptions: not for one-liners, not for grants, not to unblock a failing run, not because a migration was named in an approved spec. Approval of a plan is not approval of a migration; each `apply_migration` or DDL `execute_sql` call requires its own explicit yes, immediately before it runs.

Database schema changes additionally follow the migrations rule: write the file in `supabase/migrations/` first; apply that exact content; keep filename versions matching the applied history.

### Engineering Guardrails

- Do not add one-off `if` / `else` chains for variable, level, unit, overlay, region, mode, or scale behavior. Add behavior to typed registries/configuration and derive UI/API behavior from those sources of truth.
- Treat map generation as a typed recipe: URL params ↔ `MapRecipe` ↔ UI state ↔ backend API params ↔ backend `MapRequest`. Do not scatter URL parsing, API serialization, or variable/level mapping inside incidental component code.
- If a feature will grow with variables, levels, overlays, units, regions, modes, or color scales, extend the source-of-truth config first.
- Keep the frontend thin. All scientific computation, climatology, compositing, projection choice, and map rendering belong on the backend.
- Preserve scientific rendering meaning: fixed physical color anchors, discrete stepped boundaries, explicit units, provenance-aware labels, and 200+ DPI output.
- Prefer production-shaped configuration contracts, such as `PYRE_CACHE_DIR` or `PYRE_CLIMO_DIR`, over temporary hardcoded paths.
- Do not reintroduce legacy proof-of-concept endpoints or client-side grid coloring. `/api/map` and `/api/scale-meta` are the active API surface.
- Keep changes stepwise and verifiable: make one structural change, run the relevant backend/frontend check, then continue.

### React / Frontend Guardrails

- `app/map/MapBuilder.tsx` is a thin composition root (July 2026 refactor, formerly `App.tsx`): state lives in `app/map/builder/useCompositeRecipe.ts` and `useMapGeneration.ts`, UI in focused panel components. Do not add workflows, drawers, panels, or data orchestration back into `MapBuilder.tsx` — extend the matching hook or panel, or add a new focused module.
- Routes are Next.js App Router directories under `frontend/app/`. The site is a static export: no server components that need a runtime, no API routes. Build-time data fetching (e.g. published posts) is fine.
- Interactive pages are `'use client'` components mounted from small `page.tsx` files; keep the page files thin.
- Prefer focused components and hooks over thousand-line components. Split by product responsibility: time selection, variable/level selection, region selection, wind overlay controls, Color Lab, request lifecycle, and rendered-map display.
- Avoid using `useEffect` as a general state orchestration tool. Use it for synchronization with external systems only: network requests, subscriptions, DOM/browser APIs, timers, or URL/search-param synchronization.
- Prefer derived values from render state (`useMemo` only when it avoids real work or stabilizes references), event handlers, reducers, or explicit state machines over effect chains that copy state into more state.
- Avoid broad `if`/`else` UI logic for variable, level, unit, mode, region, or scale behavior. Put option availability, labels, defaults, and API mappings in typed config/registry modules, then render from that model.
- Keep URL and API serialization centralized in `mapRecipe.ts`; keep variable/level mapping centralized in `variableConfig.ts`. Components should consume these contracts rather than re-encoding request logic.
- For complex UI state, prefer `useReducer` with typed actions or a small domain-specific hook over many interdependent `useState` calls and corrective effects.
- Keep server state separate from UI state. Fetch/render lifecycle should have clear loading, success, and error states, and should clean up blob URLs or abort in-flight requests where applicable.
- When refactoring existing React code, preserve behavior first, add focused tests or smoke checks where feasible, and extract one concern at a time.

### Target Data Flow: Surgical Retrieval

1. **Index fetch** — retrieve the `.idx` file for the target GRIB2 to identify byte offsets for the requested field(s).
2. **Partial Content Request** — HTTP `Range` header pulls only the bytes for that field. No disk I/O.
3. **In-memory compute** — load bytes into xarray/numpy. Calculate wind speed, anomaly, or composite mean across N time steps.
4. **Render** — Matplotlib + Cartopy PNG at 200+ DPI. Title metadata extracted from the data, never from user input.
5. **Stream** — FastAPI `StreamingResponse` returns PNG to frontend.

**GRIB2 naming:** `core.{YYYYMMDD}.t{HH}z.pgrb2.0p25.f000.grib2`
**Index files:** same name + `.{hash}.idx`
**NOAA NOMADS base:** `https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/`

### Index File Format

Each line: `{record}:{byte_start}:d={YYYYMMDDhh}:{VAR}:{level}:anl:ens mean`

The byte range for a record is `byte_start` to `next_record_byte_start - 1`. Parse the `.idx` to find offsets, then issue a single `Range: bytes=start-end` request.

### CORe Variables and Pressure Levels

Variables available in the 0.25° ensemble mean files (`spgb.ensmean`):

| GRIB Short Name | Description | Levels (mb) |
|---|---|---|
| TMP | Temperature | 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10 |
| UGRD | U-component wind | same 16 levels |
| VGRD | V-component wind | same 16 levels |
| SPFH | Specific Humidity | same 16 levels |
| HGT | Geopotential Height | same 16 levels |
| PRES | Surface Pressure | surface only |

Wind speed is derived: `sqrt(UGRD² + VGRD²)`. Wind direction is derived similarly. Both UGRD and VGRD must be fetched together.

`config.py` `VARIABLES` dict should use these GRIB short names as keys.

### Current Code Status

The active map-rendering API is `/api/map`. It validates a typed map recipe, fetches requested observation and climatology fields, computes raw composites, anomalies, normalized anomalies, and climatology views, renders a server-side Matplotlib/Cartopy PNG, and streams it to the frontend.

The active scale metadata API is `/api/scale-meta`. It exposes backend color-scale metadata for the frontend Color Lab.

Legacy proof-of-concept endpoints and client-side grid coloring should not be reintroduced.

Current backend capabilities include:
- Surgical CORe pgb/flx retrieval using `.idx` parsing and HTTP Range requests.
- GCS-first retrieval with NOMADS fallback paths for some recent flx data.
- 3-hourly maps, daily composites, and monthly/month-list composites.
- Climatology, anomaly, and normalized anomaly modes for supported pressure-level variables.
- R2 daily/monthly climatology support, with sub-monthly anomaly modes forced to `r2-daily`.
- Climatology/anomaly modes for the starter surface/named-level variables (2m temp, 10m wind, MSLP, PWAT) via R2 single-level baselines declared as `r2_climo` specs in `config.VARIABLES`; specific humidity is raw-only.
- Omega (VVEL, 100–1000 mb via per-variable `levels` lists), precipitation rate (mm/day display), and OLR (ULWRF at TOA), all with full climatology/anomaly support; PRATE/ULWRF are 0–3h average forecast fields.
- Raw-only case-study variables: CAPE/CIN in three parcel variants (surface-based, mixed-layer `_ml`, most-unstable `_mu`), 2m dewpoint (°F), absolute vorticity (10⁻⁵/s), snow depth (in) — empty `climo_sources` gates them to raw mode everywhere.
- MSLP plots MSLET (Eta/membrane reduction), not `PRES:mean sea level` — see the comment in `config.py`.
- Wind speed, combinable wind overlays (shading/isotachs/barbs/vectors), H/L pressure centers, pressure/height/temp contour overlays, relative humidity derivation, many named regions, and fixed stepped color scales.
- All HDF5/netCDF access is serialized behind `disk_cache.HDF5_LOCK` (#51: the bundled HDF5 C library is not thread-safe and concurrent access segfaulted the Render service). Every netCDF open/read/write must hold it; the GRIB path (cfgrib/eccodes) intentionally stays concurrent.

Current frontend capabilities include:
- A public site shell: landing page (`/`), map builder (`/map`), About, FAQ, Terms/Privacy (markdown in `content/`), and the Synopsis blog (`/synopsis`).
- The Composite Builder composed in `app/map/MapBuilder.tsx` from focused panels (`app/map/builder/`), Color Lab modules (`app/map/colorLab/`), and shared primitives (`ui/controls.tsx`).
- Typed recipe serialization in `mapRecipe.ts` (repo-root of `frontend/`); variable/level API mapping in `variableConfig.ts`. Old `/?variable=…` share links redirect to `/map` via `app/RecipeRedirect.tsx`.
- Accounts (Supabase auth, `app/auth/`), a saved-map library (projects → folders → maps: recipe JSON in Postgres, PNG + thumbnail in the private `maps` bucket), and save/load modals in `app/map/projects/`.
- Admin-only surfaces: Color Lab, Admin Stats panel (`chrome/AdminStatsPanel.tsx`, tabbed usage/visitor/growth views over SECURITY DEFINER RPCs), and the Synopsis editor.
- Synopsis blog (#36): admin-only BlockNote editor at `/synopsis/editor`, drafts/scheduling/publish in the `posts` table, static post pages baked at build time (`app/synopsis/[slug]/`, dependency-free `BlockRenderer`), images referenced as bucket paths and resolved at build.
- GoatCounter page-view analytics (env-gated) plus anonymous per-render `map_requests` logging.

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app and all API endpoints. Loads `.env` before app-module imports. CORS origins come from the `CORS_ORIGINS` env var (comma-separated; empty = warn and allow none).
- **`config.py`** — `REGIONS` dict (lat/lon bounding boxes, 0–360 longitude) and `VARIABLES` dict (GRIB key mappings, per-variable `levels`, `climo_sources` gating). Source of truth — don't hardcode bounds or variable names elsewhere.
- **`api_options.py`** — valid modes/units/climo-source enums and query-param helpers derived from config.
- **`map_service.py`** — orchestrates `MapRequest` → fetch/compute/render pipeline.
- **`map_pipeline/`** — time selection, climatology policy, fetch planning, labels, request logging, computation helpers, and wind overlays.
- **`retrieval.py`** — surgical CORe GRIB retrieval (`.idx` parsing, HTTP Range, GCS-first with NOMADS fallback).
- **`climo_r2.py`** — R2 daily/monthly climatology over OPeNDAP with constraint-expression fetches and disk caching.
- **`disk_cache.py`** — cache roots (`PYRE_CACHE_DIR`) and `HDF5_LOCK` + `open_netcdf()`; all netCDF access goes through here.
- **`visualizer.py`** — renders Matplotlib/Cartopy PNGs and owns current color-scale logic.
- **`scripts/`** — `precompute_climo.py`, `generate_region_thumbnails.py`.

### Frontend (`frontend/`)

Next.js App Router, static export. Domain modules live at the `frontend/` root (not `src/`):

- **`app/`** — routes: `page.tsx` (landing, plus `RecipeRedirect` for legacy share links), `map/` (builder), `about/`, `faq/`, `privacy/`, `terms/`, `synopsis/` (blog: index, `[slug]/`, `editor/`, `preview/`), `auth/` (provider, modal, callback, reset), `sitemap.ts`, `layout.tsx`.
- **`app/map/`** — `MapBuilder.tsx` (composition root: wires recipe/generation/designer hooks, URL sync, save/load glue, modal visibility), `SettingsDrawer.tsx`, and:
  - **`builder/`** — `useCompositeRecipe.ts` (all recipe state + MapRecipe conversion + guard effects), `useMapGeneration.ts` (request lifecycle, blob URL handling), panel components (`VariableLevelPanel`, `TemporalPanel`, `AnalysisPanel`, `OverlaysPanel`, `TimeScaleControls`, `MapPanel`, `RegionsModal`, `PanelsSection`), and the region catalogue (`regionCatalog.ts`, `RegionThumbnail.tsx`).
  - **`colorLab/`** — `scaleModel.ts` (pure scale math + types), `useScaleDesigner.ts` (designer state + scale-meta fetch + generate-time `scale_spec`), `ColorLabPanel.tsx` (modal UI).
  - **`projects/`** — saved-library modals (`LibraryModal`, `SaveMapModal`, `NameModal`).
- **`mapRecipe.ts`**, **`variableConfig.ts`**, **`sharedOptions.ts`** — typed recipe/URL/API serialization and variable/level mapping (root-level; the guardrail contracts).
- **`lib/`** — `supabase.ts` (null-safe client: site fully works without accounts config), `library.ts` (projects/folders/saved maps), `storage.ts`, `posts.ts` (build-time published-post fetch), `postsAdmin.ts` (editor CRUD + rebuild trigger), `api.ts` (`API_BASE` from `NEXT_PUBLIC_API_URL`), `images.ts`, `goatcounter.ts`, `database.types.ts`.
- **`chrome/`** — `SiteHeader.tsx`, `SiteFooter.tsx`, `AdminStatsPanel.tsx`.
- **`ui/`** — `controls.tsx` (TabStrip, SelectField, ToggleButton, Section, etc.), `PageShell.tsx` (standard reading-page width).
- **`content/`** — FAQ/TERMS/PRIVACY markdown rendered by their routes.
- Styled with **Tailwind CSS v4** (via `@tailwindcss/postcss`). Use Tailwind classes throughout; avoid inline styles and separate CSS files.
- Env vars are `NEXT_PUBLIC_*`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, GoatCounter URL.

### Supabase (`supabase/`)

- **Migrations** (`supabase/migrations/`, tracked in git) are the schema history. File-first rule: write the file, apply that exact content, keep filename versions matching applied history. Gotcha: MCP-applied migrations skip default grants — always add explicit `GRANT`s alongside RLS policies or authenticated calls hit 42501.
- **Tables:** `profiles` (+ `is_admin` flag — the single admin gate), `projects`/`folders`/`saved_maps` (owner-scoped library; recipe JSON in rows, PNGs in storage), `map_requests` (anonymous per-render analytics with visitor hashing), `posts` (Synopsis blog: drafts, `publish_at` scheduling, published flag).
- **Storage buckets:** `maps` (private; saved-map PNGs + thumbnails), `post-images` (public; blog photos and copies of saved-map PNGs). Body/image references store bucket paths, never full URLs.
- **RPCs:** admin stats functions (SECURITY DEFINER, admin-checked) backing `AdminStatsPanel`.
- **Edge Functions:** `rebuild-site` — the one place the Render deploy-hook URL lives. Mode `rebuild` (admin JWT) rebuilds the static site; mode `cron` (`x-cron-secret`) publishes due scheduled posts, then rebuilds.

---

## Compositing Modes

| Mode | PSL Equivalent | Input |
|---|---|---|
| 3-Hourly | `composites/hour/` | 1 date, date range, or date list + hour (00/03/06/09/12/15/18/21z) |
| Daily Mean | `composites/day/` | 1 or more dates averaged across synoptic hours (currently 00/06/12/18z) |
| Monthly/Seasonal | `composites/printpage.pl` | Month range or non-consecutive month list |

Anomaly mode is a toggle on supported composites: subtract the 30-year climatological mean. Sub-monthly anomaly modes currently use R2 daily climatology; monthly anomaly modes support `monthly-pgb` and `r2-monthly`. Render with a divergent colormap centered at zero. CORe-native daily/3-hourly climatology remains a longer-term open problem.

---

## Scientific Rendering Constraints

These apply to all code in `visualizer.py` and any future rendering module:

- **Fixed color anchors** — colors map to absolute physical values, never auto-scaled to data range.
- **Discrete stepped boundaries** — use `BoundaryNorm`, not smooth gradients.
- **Provenance in title** — extract valid time and level from xarray dataset metadata; never accept as free-text parameters.
- **Projection** — match CRS to region (PlateCarree for broad coverage, Albers/Stereographic for regional).
- **Resolution** — 200+ DPI minimum.

---

## GRIB2 / cfgrib Notes

- Open with `engine="cfgrib"`. Use `filter_by_keys` in `backend_kwargs` to select by `typeOfLevel` and `level`.
- NOAA uses 0–360 longitude; frontend maps expect -180–180. Convert with `lon - 360` for western hemisphere.
- `.idx` files are auto-generated alongside GRIB2 files when cfgrib opens them locally.
