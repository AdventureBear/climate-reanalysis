# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
npm run dev       # dev server at http://localhost:5173
npm run build     # Next.js production build
npm run lint      # eslint
```

### Local Workflow Preferences

- Never make code changes on `main` or `render`. If the current branch is `main` or `render`, create a new branch first, then make edits there.
- Do not build or lint for minor/small updates. If it is unclear whether a change is small, ask first.
- Build and/or lint after implementing a major feature, broad refactor, or cross-cutting behavior change.
- Do not start, restart, or kill local frontend/backend servers unless the user explicitly asks. The user normally already has servers running.
- When frontend behavior changes, tell the user which browser smoke tests to run. The user tests in their own browser and does not use Codex web preview.

---

## What This Project Is

The PSL/NCEP reanalysis interactive pages (used in meteorology education and research) stopped updating in March 2026 when the underlying NCEP Reanalysis dataset was discontinued. PSL has no plans to rebuild the interface for the successor dataset. PyRe is the community replacement.

**The three PSL interfaces being replicated:**
- Monthly/Seasonal Composites — `https://psl.noaa.gov/cgi-bin/data/composites/printpage.pl`
- Daily Mean Composites — `https://psl.noaa.gov/data/composites/day/`
- Hourly Composites — `https://psl.noaa.gov/data/composites/hour/`

The new underlying dataset is **CORe (Climate-Ocean Reanalysis)** from NCEP/CPC, available back to the 1950s.
- CORe info: `https://www.cpc.ncep.noaa.gov/products/CORe/index.html`
- PSL data info: `https://psl.noaa.gov/data/coreinfo.html`
- `get_core.py` reference: `https://ftp.cpc.ncep.noaa.gov/CORe/get_core/get_core.txt`

---

## Architecture

Monorepo: `backend/` (Python 3.12, FastAPI, uv) and `frontend/` (Next.js, React 19, TypeScript, Tailwind v4).

**The frontend is a thin UI shell. All computation and rendering happen on the backend.**

The frontend sends a "recipe" (variable, level, region, date list, mode) → backend fetches, computes, renders → streams a PNG → frontend displays in an `<img>` tag.

### Engineering Guardrails

- Do not add one-off `if` / `else` chains for variable, level, unit, overlay, or scale behavior. Add behavior to a typed registry/config and derive UI/API behavior from that source of truth.
- Treat map generation as a typed recipe: URL params ↔ `MapRecipe` ↔ UI state ↔ backend API params. Do not scatter URL parsing, API serialization, or variable/level mapping inside page components.
- If a feature will grow with variables, levels, overlays, units, regions, or modes, pause and extend the source-of-truth config first.
- Prefer production-shaped configuration contracts, such as `PYRE_CACHE_DIR`, over temporary hardcoded paths or code that will need to be deleted later.
- Trip wire for meteorological math: if a feature introduces a new meteorological formula, repeats an existing formula, converts physical units, derives a field from multiple CORe variables/levels, or needs xarray metadata preservation, first add or reuse a shared helper/module. Do not implement the math inline in the feature path.
- Before implementing a quick UI fix, ask whether this is a state/model problem instead of a component problem.
- Keep changes stepwise and verifiable: make one structural change, run the relevant build/test, then continue.

### React / Frontend Guardrails

- Treat Next.js route/page entry files as thin composition surfaces. Do not add large new workflows, drawers, panels, or data orchestration there; extend the matching hook or panel component instead.
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

The active map-rendering API is `/api/map`; it validates a map recipe, fetches the requested field(s), computes composites/anomalies, renders a server-side PNG, and streams it to the frontend. `/api/scale-meta` exposes backend color-scale metadata for Color Lab. Legacy PoC endpoints and client-side grid coloring should not be reintroduced.

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app and all API endpoints. CORS configured for `localhost:5173` / `127.0.0.1:5173`.
- **`config.py`** — `REGIONS` dict (lat/lon bounding boxes, 0–360 longitude) and `VARIABLES` dict (GRIB key mappings). Source of truth — don't hardcode bounds or variable names elsewhere.
- **`visualizer.py`** — `create_map_product()` renders a Matplotlib/Cartopy PNG, returns `io.BytesIO`.

### Frontend (`frontend/app/`)

- **`app/map/page.tsx`** — Next.js route entry for the map page.
- **`app/map/MapPageClient.tsx`** — client composition root for the Composite Builder: mode selector, variable/level/region pickers, date inputs, and rendered PNG display.
- **`app/map/builder/`**, **`app/map/chrome/`**, and **`app/map/colorLab/`** — focused map UI panels, request lifecycle hooks, shell chrome, and Color Lab.
- Styled with **Tailwind CSS v4**. Use Tailwind classes throughout; avoid inline styles and separate CSS files.

---

## Compositing Modes

| Mode | PSL Equivalent | Input |
|---|---|---|
| 3-Hourly | `composites/hour/` | 1 date + synoptic hour (00/03/06/09/12/15/18/21z) |
| Daily Mean | `composites/day/` | 1 or more dates (averaged) |
| Monthly/Seasonal | `composites/printpage.pl` | Month range or non-consecutive month list |

Anomaly mode is a toggle on any composite: subtract the 30-year climatological mean for the same calendar day/hour. Render with a divergent colormap (Blues below, Reds above, neutral at zero). Climatological means must be computed or sourced separately — this is a deferred problem.

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
