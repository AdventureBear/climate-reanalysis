# PyRe Project Reference

Updated: 2026-07-06

This is the living project reference for the PyRe climate reanalysis project. It incorporates the current repository guidance, project brief, planning notes, color-scale notes, and the current code state. A new contributor should be able to start from this document without needing older copies of `CLAUDE.md`, `AGENTS.md`, `PROJECT_BRIEF.md`, or the staged planning notes.

## 1. Problem Statement

PyRe exists because the NOAA PSL/NCEP reanalysis plotting pages stopped updating in March 2026 after the underlying NCEP Reanalysis dataset was discontinued. Those pages were widely used in meteorology education and research because they let users create custom composites and anomaly maps across variables, pressure levels, dates, months, and regions.

PSL has not planned a replacement interface for the successor dataset. NOAA/CPC CORe now provides the underlying reanalysis data, but there is no equivalent public web interface for the fine-grained "slice and dice" workflows that the PSL tools supported.

The lost capability is practical and specific:

- A student wants to inspect the 250 mb subtropical jet over the past 30 days and compare it to normal.
- An instructor wants 3-hourly maps for storm cases used in synoptic meteorology labs.
- A researcher wants a composite of specific snowstorm dates or non-consecutive El Nino months.
- An analyst wants a daily mean composite across a list of high-impact weather days.

Existing ready-made alternatives do not reproduce the PSL-style customization for archived daily, hourly, and non-consecutive composite analysis. PyRe is the community replacement: a modern web interface backed by CORe, designed to restore and improve the old PSL research workflow.

## 2. Product Goal

PyRe is a PSL-style Composite Builder for CORe reanalysis data.

The target workflow:

1. User chooses a variable, level, region, time selection, display mode, color scale, and optional wind overlay.
2. Frontend serializes that state into a typed map recipe and API query.
3. Backend fetches only the needed data records, computes the requested product, renders a scientific PNG, and streams it back.
4. Frontend displays the rendered map and keeps the recipe shareable through URL state.

The frontend should remain a thin UI shell. Computation, climatology, compositing, anomaly math, map projection, and rendering belong on the backend.

## 3. Core Feature Set

### Time Modes

- 3-hourly maps: one date, date range, or custom date list at a selected CORe hour.
- Daily composites: one date, date range, or date list, currently averaging 00/06/12/18z.
- Monthly/seasonal composites: one month, month range, or non-consecutive month list.
- Climatology view: displays climatological mean for a selected month.

CORe valid hours are 00, 03, 06, 09, 12, 15, 18, and 21z. Daily mode currently uses the four synoptic hours 00, 06, 12, and 18z.

### Display Modes

- Raw composite.
- Anomaly: observation minus climatological mean.
- Normalized anomaly: observation minus mean, divided by climatological standard deviation.
- Climatology: mean-only map, no observation fetch.

### Variables and Levels

Pressure-level variables:

- Wind speed, derived from UGRD and VGRD.
- Temperature.
- Geopotential height.
- Specific humidity.
- Relative humidity, derived from SPFH and TMP with the Bolton formula.

Starter surface/named-level variables:

- 2 m temperature.
- 10 m wind speed.
- Mean sea-level pressure.
- Precipitable water.

Pressure levels are 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, and 10 mb.

Surface/named-level starter fields currently support raw 3-hourly and daily maps only. Monthly maps and anomaly/climatology support for these fields are not wired yet.

### Regions

The app supports named regions in `backend/app/config.py`, including CONUS, US subregions, Alaska, Hawaii, North America, Canada, hemispheres, world, Europe, Asia, Australia, South America, Africa, India, and major ocean basins. Region thumbnails are present under `frontend/public/region-thumbnails/`.

### Rendering Requirements

- Backend-rendered Matplotlib/Cartopy PNG.
- Minimum 200 DPI scientific product.
- Region-specific projections where configured.
- Fixed physical color anchors, not auto-scaled to data min/max.
- Discrete stepped color boundaries, not smooth continuous gradients.
- Provenance-aware labels sourced from data and request metadata.
- Optional wind vectors or barbs, including wind anomaly overlays for wind anomaly maps.

## 4. Architecture

Monorepo:

- `backend/`: Python 3.12, FastAPI, uv, xarray, cfgrib, Cartopy, Matplotlib.
- `frontend/`: React 19, TypeScript, Vite, Tailwind v4.

### Backend API

Primary endpoints:

- `GET /api/map`: validates a map recipe, fetches observation/climatology data, computes raw/anomaly/normalized products, renders PNG, and streams the image.
- `GET /api/scale-meta`: exposes backend color-scale metadata for the frontend Color Lab.

Important backend modules:

- `backend/app/main.py`: FastAPI app, endpoint validation, CORS, request wiring.
- `backend/app/config.py`: source of truth for variables, pressure levels, surface field metadata, regions, and normalized anomaly masking thresholds.
- `backend/app/retrieval.py`: CORe/GCS and NOMADS retrieval, index parsing, HTTP Range requests, composites, monthly archive fallback, and monthly slice disk cache.
- `backend/app/climo_r2.py`: NCEP/DOE Reanalysis 2 daily/monthly climatology via PSL THREDDS OPeNDAP.
- `backend/app/map_service.py`: high-level orchestration from `MapRequest` to rendered PNG.
- `backend/app/map_pipeline/`: time selection, climatology source policy, fetch planning, logging, labels, wind overlay, and computation steps.
- `backend/app/visualizer.py`: Cartopy/Matplotlib rendering, projections, display units, stepped scales, anomaly scales, wind overlay drawing, colorbar metadata, and custom scale application.

### Frontend

Important frontend modules:

- `frontend/src/App.tsx`: current Composite Builder UI, settings drawer, region browser, Color Lab, generated image display, copy/share behavior.
- `frontend/src/mapRecipe.ts`: typed URL/API recipe parsing and serialization.
- `frontend/src/variableConfig.ts`: frontend variable/level selection mapped to backend API variables.
- `frontend/src/sharedOptions.ts`: shared UI option helpers.
- `frontend/src/regionThumbnails.ts`: region thumbnail mapping.

### Data Flow

The intended data flow is:

1. Index fetch: retrieve the `.idx` file for the target GRIB to identify byte offsets.
2. Partial content request: use an HTTP `Range` header to fetch only the requested record.
3. Decode and compute: cfgrib/xarray loads the record, then the backend computes wind speed, composites, anomalies, normalized anomalies, or climatology views.
4. Render: Matplotlib/Cartopy produces the map PNG with scientific color scales.
5. Stream: FastAPI returns a `StreamingResponse` consumed by the frontend as an image.

Current retrieval uses GCS as the primary CORe archive with paths such as `pgb.{YYYYMMDD}{HH}.grb` and `flx.{YYYYMMDD}{HH}.grb`. NOMADS fallback paths exist for recent flx data. Older planning docs described a NOMADS-first GRIB2 pattern; the active code is GCS-first.

### Reference Sample Files

The repository includes two raw sample index files under `docs/reference/` that are useful for understanding and testing retrieval assumptions:

- `docs/reference/SampleGRB2 Index file.txt`:
  - 80-line pressure-level GRIB2 index sample for `2026050500`.
  - Confirms the main pressure-level fields used by PyRe: `TMP`, `UGRD`, `VGRD`, `SPFH`, and `HGT` across the supported pressure levels.
  - Shows the byte-offset pattern used to calculate HTTP Range requests: a record starts at its own byte offset and ends one byte before the next record.
  - This sample aligns well with the current pgb pressure-level retrieval logic and is already reflected in tests and parser assumptions.
- `docs/reference/grbMonthlyIdxSample.txt`:
  - 50-line monthly/surface-style index sample for `1950010100`.
  - Contains surface, flux, soil, cloud, 2 m, 10 m, and column fields such as `PWAT`, `TMP:2 m above gnd`, `UGRD:10 m above gnd`, and `VGRD:10 m above gnd`.
  - It uses level strings such as `sfc`, `above gnd`, `atmos col`, and forecast-average descriptors. Those differ from the current GCS flx exact strings in places, so this file is best treated as a compatibility/reference sample rather than the sole source of current flx matching rules.
  - It supports the roadmap direction for additional surface/flux variables, but any new variable should still be checked against live GCS/NOMADS indexes before implementation.

The planning screenshot in `docs/archive/` is an older UI checkpoint from May 2026. It is useful visual history for the original console layout, but it should not be treated as the current frontend state or product spec. Other files in `docs/archive/` are historical planning references, not current source-of-truth guidance.

## 5. Current Status

### Completed or Substantially Working

- Backend-rendered PNG map workflow through `/api/map`.
- Surgical record retrieval for CORe pgb/flx using `.idx` parsing and HTTP Range requests.
- GCS primary retrieval path and NOMADS fallback paths for recent flx data.
- 3-hourly single-date maps for pressure-level and starter surface/named-level fields.
- Date-list and date-range composites.
- Daily composites averaging 00/06/12/18z.
- Monthly single/range/list composites.
- Monthly observation source hierarchy:
  - CORe pgb monthly archive when available.
  - R2 monthly OPeNDAP fallback for eligible historical months/fields.
  - CORe synoptic computation fallback when monthly archive is missing.
- Climatology, anomaly, and normalized anomaly modes for supported pressure-level variables.
- Climatology, anomaly, and normalized anomaly modes for the starter surface/named-level variables (2m temperature, 10m wind speed, MSLP, precipitable water), using R2 single-level baselines (`surface` 2.5° and `gaussian_grid` T62 files) declared per-variable via `r2_climo` specs in `config.VARIABLES`. Specific humidity remains raw-only: R2 publishes no daily shum file to build a baseline from. Caveat for domain review: 3-hourly obs are compared against R2 daily-mean baselines, so sub-monthly surface anomalies include a diurnal-cycle component.
- Climatology source policy:
  - Sub-monthly anomaly modes are forced to `r2-daily`.
  - Monthly anomaly modes support `monthly-pgb` and `r2-monthly`.
  - Variables whose registry does not support the resolved source are clamped to an equivalent-cadence supported source (surface fields have no `monthly-pgb` baseline and use `r2-monthly`).
  - `cfsr-daily` is a future source option but is not implemented.
- R2 daily and monthly climatology support.
- Wind-speed derivation from U/V components.
- Vector-mean wind component handling for overlays.
- Relative humidity derivation from SPFH and TMP.
- Wind vector/barb overlay controls.
- Wind anomaly overlay for wind anomaly products.
- Many region definitions and matching display extents/projections.
- Frontend URL recipe parsing/serialization for shareable state.
- Backend scale metadata path through `/api/scale-meta`.
- Admin-only Color Lab for scale inspection and experimental scale design.
- Backend tests for URL/index parsing, monthly fallback behavior, region selection, and network/composite validation tiers.

### Current Engineering Guardrails

- Do not add scattered one-off `if`/`else` chains for variable, level, unit, overlay, region, or scale behavior. Extend typed registries/configuration instead.
- Treat map generation as a typed recipe: URL params to `MapRecipe` to UI state to backend API params to backend `MapRequest`.
- Keep URL parsing, API serialization, and variable/level mapping out of incidental component code when possible.
- Prefer production-shaped configuration contracts such as `PYRE_CACHE_DIR` instead of hardcoded paths.
- Keep the frontend thin; the map image is a backend product.
- Preserve scientific meaning: fixed anchors, discrete steps, explicit units, and provenance-aware labels.
- Make changes stepwise and verifiable.

### React / Frontend Guardrails

The current frontend works, but `frontend/src/App.tsx` has accumulated too many responsibilities. Future frontend work should avoid making that pattern worse and should move gradually toward smaller, testable units.

- Treat `App.tsx` as overgrown legacy surface area. Do not add large new workflows, drawers, panels, or data orchestration there unless the change is a small bridge toward extraction.
- Prefer focused components and hooks over thousand-line components. Split by product responsibility: time selection, variable/level selection, region selection, wind overlay controls, Color Lab, request lifecycle, and rendered-map display.
- Avoid using `useEffect` as a general state orchestration tool. Use it for synchronization with external systems only: network requests, subscriptions, DOM/browser APIs, timers, or URL/search-param synchronization.
- Prefer derived values from render state, event handlers, reducers, or explicit state machines over effect chains that copy state into more state. Use `useMemo` only when it avoids real work or stabilizes references for child components.
- Avoid broad `if`/`else` UI logic for variable, level, unit, mode, region, or scale behavior. Put option availability, labels, defaults, and API mappings in typed config/registry modules, then render from that model.
- Keep URL and API serialization centralized in `mapRecipe.ts`; keep variable/level mapping centralized in `variableConfig.ts`. Components should consume these contracts rather than re-encoding request logic.
- For complex UI state, prefer `useReducer` with typed actions or a small domain-specific hook over many interdependent `useState` calls and corrective effects.
- Keep server state separate from UI state. Fetch/render lifecycle should have clear loading, success, and error states, and should clean up blob URLs or abort in-flight requests where applicable.
- When refactoring existing React code, preserve behavior first, add focused tests or smoke checks where feasible, and extract one concern at a time.

## 6. Color Scales and Color Lab Status

Color scales are central to PyRe. The project explicitly rejects auto-scaling by data range because that breaks side-by-side comparison. A given color should map to a stable physical value within the relevant variable/level group.

### Backend Scale System

The active scale logic lives in `backend/app/visualizer.py`. The backend exposes the resolved scale through `/api/scale-meta`, including scale kind, unit, boundaries, interval colors, anchors, key breakpoints, and diagnostic stats when data are available.

Implemented scale categories:

- Wind speed:
  - Uses a Pivotal Weather-inspired 13-color sequence.
  - Same color sequence across levels; the physical knot range changes by level group.
  - Level groups:
    - Surface: 10-60 kt.
    - Low levels, 925/850/700/600 mb: 20-80 kt.
    - Mid levels, 500/400 mb: 20-140 kt.
    - High levels, 300 mb and above: 50-170 kt.
  - Supports kt and m/s display units.
  - Supports `scale_min`/`scale_max` overrides for wind products.
- Temperature:
  - Fixed scales are implemented for 1000, 925, 850, and 700 mb.
  - 1000 mb uses Fahrenheit display.
  - 925/850/700 mb use Celsius display.
  - Upper-air temperature levels above 700 mb are not fully production-audited and need additional scale work.
- Relative humidity:
  - Fixed 0-100 percent scale with key breaks around moist thresholds.
- Geopotential height:
  - Uses fixed contour-style scale in dam and labeled contours.
  - This is currently contour-first rather than a fully shaded color-fill product.
- Mean sea-level pressure:
  - Fixed contour scale in mb.
- Precipitable water:
  - Fixed 0-80 mm scale.
  - Supports mm and inches display units.
- Specific humidity:
  - Fixed 0-0.024 kg/kg scale.
- Absolute anomalies:
  - Diverging blue-white-red style scale.
  - Variable-specific ranges include wind, temperature, height, relative humidity, and specific humidity.
  - White zone is centered around zero.
- Normalized anomalies:
  - Diverging scale from -5 to +5 sigma.
  - Step size is based on `color_step`, with a default natural step of 0.5 sigma.
- Wind vector anomaly magnitude:
  - Positive-only scale for the magnitude of vector wind anomaly.
  - Range can follow plotted values so the overlay remains interpretable.

### Color Scale Gaps

The renderer now has more fixed scales than the older planning notes described, but the scale system is not fully production-audited.

Highest priority scale work:

- Verify upper-air temperature scales above 700 mb.
- Replace placeholder wind-speed mid/high ranges with domain-reviewed breakpoints.
- Confirm whether 600 mb should stay in the low-level wind group or move toward the mid-level group.
- Confirm whether 400 mb should stay in the mid-level wind group or move toward the high-level group.
- Decide whether height should remain contour-first, become shaded, or be user-selectable.
- Confirm MSLP, PWAT, specific humidity, and RH palettes with domain experts.
- Move scale definitions toward a structured registry if scale work continues to grow; `visualizer.py` is currently carrying a lot of scale configuration and rendering logic together.

### Color Lab

Color Lab is implemented as an admin-only experimental tool in `frontend/src/App.tsx`.

What works now:

- Opens from the UI only when `adminMode` is enabled.
- Pulls backend scale metadata from `/api/scale-meta`.
- Lets the user choose variable, scale family, level, display mode, interval, and relevant units.
- Shows current and original scale previews.
- Displays metadata such as scale kind, group, unit, interval, and bin count.
- Allows editing anchors, anchor values, colors, active/inactive anchors, and scale domain endpoints.
- Supports segment editing modes:
  - Linear RGB blend.
  - Discrete steps.
  - Bucket/held-color behavior.
  - Palette-based segments with presets.
- Can export a JSON scale specification.
- When the designed scale matches the currently generated map variable/level/mode, the frontend sends `scale_spec`, `scale_min`, and `scale_max` to `/api/map`.
- The backend can parse and apply `scale_spec` for matching variable, level, and mode.

Current limitations:

- Color Lab is an experiment/design tool, not a persisted scale-management system.
- Custom scales are not saved to a backend database or durable registry.
- There is no formal approval workflow for promoting a Color Lab scale into production defaults.
- Custom scale application is request-scoped: it affects the generated map request when the Color Lab design matches that map's variable/level/mode.
- It currently lives inside the already-large `App.tsx`, so future work should extract it into focused components.
- Scientific validation still has to happen outside the UI. Color Lab can help design and inspect scales, but it does not answer whether a scale is meteorologically correct.

Recommended next step for Color Lab:

- Use it to prototype scale candidates, export JSON, review with a meteorology/domain expert, then migrate approved scales into the backend scale registry/configuration rather than relying on ad hoc request-scoped specs.

## 7. Roadmap

### Phase 1: Stabilize the Current App

- Keep README, PROJECT, AGENTS, and CLAUDE aligned through the documentation process below.
- Keep required environment variables documented in README and deployment notes:
  - `CORS_ORIGINS`, for example `http://localhost:5173,http://127.0.0.1:5173`.
  - `VITE_API_URL`, pointing the frontend to the backend API.
- Run and keep green:
  - `cd backend && uv run pytest`
  - `cd frontend && npm run build`
  - `cd frontend && npm run lint`
- Add a small smoke checklist for one map in each major time mode.
- Reduce documentation drift by updating the smallest appropriate document for each change and avoiding duplicate long-form status sections.

### Phase 2: Scientific Rendering Hardening

- Audit all default color scales against meteorology reference sources.
- Finish upper-air temperature scales.
- Verify wind scale ranges by level group.
- Decide the production approach for height and pressure display: contour-only, shaded, or user-selectable.
- Add visual regression/smoke images for known map recipes.
- Add source/provenance disclaimers where cross-dataset climatology is used.

### Phase 3: Climatology and Anomaly Decisions

- Confirm the preferred climatology source with professor/domain experts:
  - CORe-derived daily/3-hourly climatology is best long term.
  - R2 daily is implemented and useful but mixes CORe observations with R2 climatology.
  - CFSR daily is a known reference-site convention but is not implemented.
- Decide whether normalized anomalies should remain enabled for all supported modes or be gated by source/mode confidence.
- If CORe daily climatology is approved:
  - Build a server-side batch process for 1991-2020 CORe.
  - Group by calendar day and possibly synoptic hour.
  - Store mean and standard deviation as NetCDF shards.
  - Read shards through a production-shaped config path such as `PYRE_CLIMO_DIR`.

### Phase 4: Surface and Expanded Variable Support

- Done (July 2026): climatology/anomaly support for the starter surface/named-level variables via R2 single-level baselines.
- Wire monthly support for flx/named-level fields where appropriate.
- Expand variables only through the backend/frontend registries.
- Keep derived variables explicit in metadata so users know what is raw vs computed.

### Phase 5: Render Deployment and Production Readiness

- Render.com is the current deployment target; Docker/docker-compose is not part of the active roadmap.
- Document Render backend/frontend service settings, including build commands, start commands, health checks, and required environment variables.
- Confirm Render environment variables for `CORS_ORIGINS`, `VITE_API_URL`, cache paths, and any future climatology storage paths.
- Add persistent storage strategy for caches and future climatology shards.
- Replace the current hardcoded monthly cache location with a configurable path such as `PYRE_CACHE_DIR`.
- Add cache bounds/cleanup policy.
- Add rate limiting and request guards before public release.
- Add observability for slow fetches, failed fallbacks, and render errors.
- Treat Docker as optional future portability only if a concrete deployment or local-dev need appears.

### Phase 6: Deferred PSL Parity

- Monthly time series plots.
- Correlation maps.
- Export/share workflows beyond URL state, such as image download metadata or saved recipes.

## 8. Known Issues and Open Questions

### Climatology Source Mismatch

Sub-monthly anomalies currently use R2 daily climatology by policy. This is more appropriate than monthly means for daily/3-hourly normalized anomalies, but it mixes CORe observations with R2 climatology. A domain expert should explicitly approve or replace this choice.

### CORe Daily Climatology Not Built

The long-term ideal is a CORe-native daily or 3-hourly climatology for 1991-2020. It requires substantial batch fetching, storage, and server-side persistence. This is deferred until deployment or a controlled compute environment exists.

### `cfsr-daily` Placeholder

`cfsr-daily` is accepted as a valid API source option and appears in the UI as unavailable, but backend fetchers are not implemented. Do not enable it without adding fetchers and source policy handling.

### Surface/Named-Level Fields Are Raw-Only

The backend intentionally rejects anomaly/climatology modes for `temp_2m`, `wind_10m`, `surface_pressure`, and `precipitable_water`. Monthly mode is also rejected for these starter fields. This is product debt, not an accidental regression.

### Color Scales Need Final Scientific Review

Many fixed scales exist, but some are practical defaults rather than fully verified agency-style palettes. Upper-air temperature and mid/high wind scales are the most important unresolved items.

### Runtime Cache Path

Resolved 2026-07: all disk caches (monthly obs slices, R2 climatology) live under a root configured by `PYRE_CACHE_DIR` (`config.CACHE_ROOT`), defaulting to `backend/` for local dev. In production, point `PYRE_CACHE_DIR` at a persistent mount (e.g. a Render disk) so caches survive deploys.

### CORS Defaults

`main.py` reads `CORS_ORIGINS` from the environment and defaults to an empty allowlist. Local development needs explicit origins.

### Network-Dependent Confidence

Unit tests cover parsing and some fallback behavior, but many important validations depend on live NOAA/PSL services. Use the network, validation, and composite pytest markers when changing retrieval, compositing, or climatology code.

### Frontend Size

`frontend/src/App.tsx` is large and carries builder UI, settings, Color Lab, region browser, image loading, and copy/share behavior. Future frontend work should extract focused components while preserving typed recipe flow through `mapRecipe.ts`.

### Region Registry Split

Regions are defined in `config.py`, display extents/projections in `visualizer.py`, and frontend grouping in `App.tsx`. This is workable but split. If regions keep growing, move toward a shared registry/export contract.

### Documentation Drift

README, PROJECT, AGENTS, and CLAUDE are now current as of 2026-07-06. The risk is future drift across those files. Use the documentation process below to avoid circular updates.

## 9. Commands and Verification

Backend:

```bash
cd backend
uv run uvicorn app.main:app --reload
uv run pytest
uv run pytest -m network
uv run pytest -m validation -s
uv run pytest -m composite -v
```

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

Local development URLs:

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://localhost:5173`

## 10. Project Operating Principles

These principles explain the project-level tradeoffs behind the shorter guardrails in `AGENTS.md` and `CLAUDE.md`.

- Scientific comparability matters more than visual novelty. Fixed color anchors, discrete boundaries, explicit units, and provenance-aware labels are core product requirements.
- Climatology source choice is a scientific/product decision, not just an implementation detail. Cross-dataset baselines, normalized anomalies, and future CORe-native climatology should be reviewed with domain experts.
- The frontend should stay a recipe-building interface. Backend services own data retrieval, compositing, anomaly math, projection choice, and scientific rendering.
- Frontend cleanup should preserve the typed recipe flow through `mapRecipe.ts` and variable/level mapping through `variableConfig.ts`.
- Configuration and registries are preferred over scattered conditionals because variables, levels, regions, overlays, units, and scales will keep growing.
- Deployment work should follow the Render.com path unless the deployment strategy explicitly changes. Docker is optional future portability, not active infrastructure work.
- Public-readiness work should prioritize cache configurability, request/rate guards, source disclaimers, observability, and a validation story for color scales and climatology.

## 11. Documentation Process

Use this process to keep documentation useful without creating circular maintenance churn:

1. Pick one owner document per type of change.
   - `README.md`: human-facing quickstart, current architecture summary, local setup, test commands, deployment summary, and links.
   - `PROJECT.md`: canonical project/product status, roadmap, known issues, scientific decisions, and cross-cutting technical context.
   - `AGENTS.md`: concise Codex operating rules and non-negotiable guardrails.
   - `CLAUDE.md`: concise Claude Code operating rules and non-negotiable guardrails.
   - `docs/reference/`: durable sample data or technical reference artifacts.
   - `docs/archive/`: historical planning material only.
2. Avoid duplicating long-form status. If a detail belongs in `PROJECT.md`, link to it from README/agent files instead of copying it.
3. Duplicate only short operational guardrails that tools must see directly, such as registry-first changes, typed recipe flow, thin frontend, and React anti-pattern guidance.
4. For each project change, update docs in this order:
   - Code behavior changed: update the code-adjacent comments/types if needed, then `PROJECT.md` only if it changes product status, roadmap, or known issues.
   - Setup/deployment changed: update `README.md`; update `PROJECT.md` only if roadmap or production strategy changes.
   - Agent workflow changed: update `AGENTS.md` and/or `CLAUDE.md`; update `PROJECT.md` only if the guardrail is project-wide and durable.
   - Historical context moved: update links only; do not rewrite archived files except to add an archive note.
5. Before ending any documentation task, run a quick reference scan:
   - Search for old paths such as `.claude/HANDOFF`, `.claude/planning`, and stale deployment references.
   - Confirm README and agent files point to `PROJECT.md`, not to archived documents.
6. Prefer pruning over expanding. If two files say the same long thing, keep the canonical version in `PROJECT.md` and replace the other copy with a short pointer.

## 12. Issue Tracking Process

Use GitHub Issues as the execution tracker for ongoing work.

- `PROJECT.md` describes strategy, status, roadmap, known issues, and scientific/product decisions.
- GitHub Issues describe actionable work.
- Pull requests describe implementation history and verification.

Labels, milestones, issue templates, and seed issues are documented in `docs/tasks/GITHUB_PROJECT_SETUP.md`. Use `docs/tasks/sync_github_labels_milestones.sh` for safe rerunnable label/milestone sync; `docs/tasks/seed_github_issues.sh` is one-time only and can create duplicate issues.

Current milestone model:

- M1 Stabilize Deployed App
- M2 Scientific Rendering Audit
- M3 Frontend Refactor Foundation
- M4 Surface + Expanded Variables
- M5 Production Readiness

Working agreement:

- Keep only 1-3 issues actively in progress at a time.
- Treat scientifically misleading output as a production bug.
- Every issue should include acceptance criteria and verification.
- Update `PROJECT.md` only when status, roadmap, known issues, or scientific/product decisions change.
- Update `README.md` only when setup, deployment, or onboarding changes.
- Update `AGENTS.md` or `CLAUDE.md` only when agent operating rules change.
