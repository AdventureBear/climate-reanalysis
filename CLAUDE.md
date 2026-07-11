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
npm run dev       # dev server at http://localhost:5173
npm run build     # tsc + vite production build
npm run lint      # eslint
```

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

Monorepo: `backend/` (Python 3.12, FastAPI, uv) and `frontend/` (React 19, TypeScript, Vite, Tailwind v4).

**The frontend is a thin UI shell. All computation and rendering happen on the backend.**

The frontend sends a "recipe" (variable, level, region, date list, mode) → backend fetches, computes, renders → streams a PNG → frontend displays in an `<img>` tag.

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

- `App.tsx` is a thin composition root (July 2026 refactor): state lives in `builder/useCompositeRecipe.ts` and `builder/useMapGeneration.ts`, UI in focused panel components. Do not add workflows, drawers, panels, or data orchestration back into `App.tsx` — extend the matching hook or panel, or add a new focused module.
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
- Raw-only case-study variables: surface-based CAPE/CIN, 2m dewpoint (°F), absolute vorticity (10⁻⁵/s), snow depth (in) — empty `climo_sources` gates them to raw mode everywhere.
- Wind speed, wind overlays, relative humidity derivation, many named regions, and fixed stepped color scales.

Current frontend capabilities include:
- A Composite Builder composed in `App.tsx` from focused panels (`builder/`), header/settings chrome (`chrome/`), Color Lab modules (`colorLab/`), and shared primitives (`ui/controls.tsx`).
- Typed recipe serialization in `mapRecipe.ts`.
- Frontend variable/level API mapping in `variableConfig.ts`.
- Region browser/thumbnails, settings controls, rendered PNG display, and admin-only Color Lab.

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app and all API endpoints. CORS configured for `localhost:5173` / `127.0.0.1:5173`.
- **`config.py`** — `REGIONS` dict (lat/lon bounding boxes, 0–360 longitude) and `VARIABLES` dict (GRIB key mappings). Source of truth — don't hardcode bounds or variable names elsewhere.
- **`map_service.py`** — orchestrates `MapRequest` → fetch/compute/render pipeline.
- **`map_pipeline/`** — time selection, climatology policy, fetch planning, labels, logging, computation helpers, and wind overlays.
- **`visualizer.py`** — renders Matplotlib/Cartopy PNGs and owns current color-scale logic.

### Frontend (`frontend/src/`)

- **`App.tsx`** — composition root (~285 lines): wires the recipe/generation/designer hooks, URL sync, save/load glue, and modal visibility; renders the panels below.
- **`builder/`** — Composite Builder domain: `useCompositeRecipe.ts` (all recipe state + MapRecipe conversion + guard effects), `useMapGeneration.ts` (request lifecycle, blob URL handling), panel components (`VariableLevelPanel`, `TemporalPanel`, `AnalysisPanel`, `OverlaysPanel`, `TimeScaleControls`, `MapPanel`, `RegionsModal`, `PanelsSection`), and the region catalogue (`regionCatalog.ts`, `RegionThumbnail.tsx`).
- **`chrome/`** — `AppHeader.tsx` (brand, save, account/mobile menus) and `SettingsDrawer.tsx`.
- **`colorLab/`** — `scaleModel.ts` (pure scale math + types), `useScaleDesigner.ts` (designer state + scale-meta fetch + generate-time `scale_spec`), `ColorLabPanel.tsx` (modal UI).
- **`ui/controls.tsx`** — shared presentational primitives (TabStrip, SelectField, ToggleButton, Section, etc.).
- Styled with **Tailwind CSS v4** (installed via `@tailwindcss/vite` plugin). Use Tailwind classes throughout; avoid inline styles and separate CSS files.

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
