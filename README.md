# PyRe Climate Reanalysis

PyRe is a community replacement for the NOAA PSL/NCEP interactive reanalysis plotting tools that stopped updating in March 2026. The goal is to restore PSL-style custom composites and anomaly maps using NOAA/CPC CORe data.

The app lets users build meteorological map products by selecting a variable, pressure level, region, time mode, display mode, and optional wind overlay. The frontend sends a typed recipe to the backend; the backend fetches the needed CORe fields, computes the product, renders a scientific PNG, and streams it back to the browser.

For full project context, roadmap, known issues, color-scale status, and project reference notes, see [PROJECT.md](PROJECT.md).

## Current Architecture

Monorepo:

```txt
climate-reanalysis/
  backend/    FastAPI, Python 3.12, uv, xarray/cfgrib, Matplotlib/Cartopy
  frontend/   React 19, TypeScript, Vite, Tailwind v4
```

The frontend is intentionally thin. It manages UI state and renders the returned image. All data retrieval, compositing, climatology, anomaly math, projection choice, and map rendering happen on the backend.

Active backend APIs:

- `GET /api/map` renders and streams a PNG map.
- `GET /api/scale-meta` returns backend color-scale metadata for Color Lab.

The legacy proof-of-concept approach of returning raw grids for client-side coloring should not be reintroduced.

## Core Capabilities

- 3-hourly maps for CORe hours: 00/03/06/09/12/15/18/21z.
- Daily composites averaging synoptic hours: currently 00/06/12/18z.
- Monthly, month-range, and custom month-list composites.
- Raw, anomaly, normalized anomaly, and climatology display modes for supported pressure-level variables.
- Server-rendered Matplotlib/Cartopy PNGs with fixed stepped color scales.
- Wind speed derived from U/V components.
- Wind vector/barb overlays and wind anomaly overlays.
- Relative humidity derived from specific humidity and temperature.
- Many predefined geographic regions and region thumbnails.
- Admin-only Color Lab for inspecting and prototyping color scales.

## Requirements

Backend:

- Python 3.12
- `uv`
- Native dependencies required by `cartopy`, `cfgrib`, and `eccodes`

Frontend:

- Node.js/npm

## Environment

Backend `.env` values:

```bash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Frontend `.env` values:

```bash
VITE_API_URL=http://127.0.0.1:8000
# Optional, production only: GoatCounter page-view analytics endpoint.
# Leave unset in dev so local work never counts as traffic.
# VITE_GOATCOUNTER_URL=https://<sitecode>.goatcounter.com/count
```

Without `CORS_ORIGINS`, the FastAPI app defaults to an empty CORS allowlist.

## Run Locally

Terminal 1, backend:

```bash
cd backend
uv run uvicorn app.main:app --reload
```

Backend URL:

```txt
http://127.0.0.1:8000
```

Terminal 2, frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

```txt
http://localhost:5173
```

## Testing

Backend unit tests, no network:

```bash
cd backend
uv run pytest
```

Network tests, fetches small index files:

```bash
cd backend
uv run pytest -m network
```

Validation tests, downloads a full GRIB slice and prints diagnostics:

```bash
cd backend
uv run pytest -m validation -s
```

Composite validation tests:

```bash
cd backend
uv run pytest -m composite -v
```

Frontend checks:

```bash
cd frontend
npm run build
npm run lint
```

## Development Guidance

Before making changes, read [PROJECT.md](PROJECT.md) for current project context and roadmap. If you are using an agent, also read the relevant operating file: [AGENTS.md](AGENTS.md) for Codex or [CLAUDE.md](CLAUDE.md) for Claude Code.

Key rules for first changes:

- Keep the frontend thin; backend computes and renders maps.
- Add growing behavior through typed registries/configuration rather than scattered conditionals.
- Preserve fixed scientific color scales, explicit units, and provenance-aware labels.
- Run the relevant backend/frontend checks before handing work off.

## Documentation Map

- [PROJECT.md](PROJECT.md): canonical project context, current status, roadmap, known issues, and scientific decisions.
- [AGENTS.md](AGENTS.md): Codex-specific operating guidance.
- [CLAUDE.md](CLAUDE.md): Claude Code-specific operating guidance.

Reference index samples live in `docs/reference/`. Older planning documents live in `docs/archive/` and may contain useful historical context, but `PROJECT.md` is the current project reference.

## Issue Tracking

Use GitHub Issues for ongoing development work. Labels, milestones, issue templates, and the initial issue seed list are documented in [docs/tasks/GITHUB_PROJECT_SETUP.md](docs/tasks/GITHUB_PROJECT_SETUP.md). Routine label/milestone sync uses `docs/tasks/sync_github_labels_milestones.sh`; issue seeding is one-time only.

## Deployment and Planned Infrastructure

Render.com is the current deployment target. Docker/docker-compose is not part of the active roadmap; treat Docker as optional future portability only if a concrete need appears.

Current production-readiness priorities:

- Document Render backend/frontend service settings, build commands, start commands, health checks, and required environment variables.
- Configurable cache paths such as `PYRE_CACHE_DIR`.
- Persistent storage strategy for future climatology shards.
- Rate limiting and request guards before public deployment.
- Observability for slow fetches, source fallbacks, and render errors.
