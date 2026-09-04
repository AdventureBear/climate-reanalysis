# Repository Agent Guide

This file is identical in `AGENTS.md` and `CLAUDE.md`. It is for coding agents working in this repository.

For project background, roadmap, and current product notes, read `PROJECT.md`. For CORe/GRIB/index details, read `docs/ReanalysisFileFormats.md`.

## Commands

```bash
cd backend
uv run uvicorn app.main:app --reload
uv add <package>
```

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

Supabase schema history lives in `supabase/migrations/`. Schema changes are file-first: write the migration file, then apply that exact content only after explicit approval.

## Local Workflow

- Never edit on `main` or `render`; create or switch to a feature branch first.
- Check `git branch --show-current` and `git status --short` before edits and before commit-adjacent work.
- The user owns `git commit`, `git merge`, `git push`, production deploys, and routine server restarts unless they ask otherwise.
- Do not start, restart, or kill local frontend/backend servers unless the user explicitly asks.
- Do not build or lint for minor updates. Build/lint after major features, broad refactors, or cross-cutting behavior changes.
- When frontend behavior changes, tell the user what browser smoke tests to run. The user tests in their own browser.
- Use complete, runnable shell commands when sharing commands with the user.
- Do not prompt the user to commit. Implement, verify, summarize, and stop unless they ask for git actions.

## Planning And Issues

- GitHub issues are the tracker of record. Keep one issue in flight at a time.
- For issue work, use spec, then plan, then explicit "go" before coding.
- "Add issue" means file issue text and stop. Do not diagnose, run commands, or edit code until the user picks it up.
- Done means the acceptance criteria work in the dev app. Production deploy is separate and user-initiated.
- If a request mirrors an existing feature, read that implementation first and reuse its tables, fields, code paths, and UI patterns.

## Database Rules

- No migrations, DDL, grants, RLS changes, bucket changes, or data changes without explicit approval for that exact SQL, immediately before it runs. No exceptions.
- Approval of a spec or plan is not approval to run a migration.
- Keep migration filenames aligned with applied history.
- MCP-applied migrations can skip default grants; include explicit grants with RLS policies.
- Whenever you create a table in Supabase, turn on Row Level Security and write its policies in the same step. Never leave a table reachable by the publishable key without policies protecting it.

## Project Shape

PyRe replaces the discontinued PSL/NCEP reanalysis plotting workflows using NOAA/CPC CORe data.

- `backend/`: Python 3.12, FastAPI, uv. Owns data retrieval, computation, climatology, compositing, projection choice, and Matplotlib/Cartopy rendering.
- `frontend/`: Next.js App Router static export, React 19, TypeScript, Tailwind v4. It is a thin UI shell around backend-rendered PNGs.
- `supabase/`: auth, saved-map library, analytics, Synopsis posts, object storage, and the `rebuild-site` Edge Function.
- Frontend production is a static export: `next build` emits `frontend/out/`. Do not add Next API routes or server components that require a runtime.
- `GET /api/map`: validates a typed recipe, fetches observation/climatology fields, computes map products, renders PNG, and streams it.
- `GET /api/scale-meta`: exposes backend color-scale metadata for Color Lab.
- Frontend flow: `MapRecipe` URL/API state -> backend request -> streamed PNG -> `<img>` display. Keep URL/API serialization in `frontend/mapRecipe.ts`; keep variable/level mapping in `frontend/variableConfig.ts`.

## Source Of Truth

- Backend variables, levels, streams, units, climatology support, and regions belong in `backend/app/config.py` and helpers derived from it.
- Backend mode/unit/climo-source validation belongs in `backend/app/api_options.py`.
- Map orchestration belongs in `backend/app/map_service.py` and `backend/app/map_pipeline/`.
- Data retrieval belongs in `backend/app/retrieval.py`.
- Meteorological formulas and unit conversions belong in shared helpers such as `backend/app/met_math.py` and `backend/app/units.py`.
- Rendering and color scales belong in `backend/app/visualizer.py`.
- Frontend map composition lives in `frontend/app/map/MapBuilder.tsx`; recipe state and request lifecycle live in focused hooks under `frontend/app/map/builder/`.

## Engineering Guardrails

- Do not add scattered one-off `if`/`else` chains for variable, level, unit, overlay, region, mode, or scale behavior. Extend typed registries/configuration instead.
- Keep the frontend thin. Scientific computation and rendering belong on the backend.
- Treat map generation as a typed recipe from URL params through backend `MapRequest`.
- Prefer production-shaped configuration contracts such as `PYRE_CACHE_DIR`, `PYRE_CLIMO_DIR`, `CORS_ORIGINS`, and `NEXT_PUBLIC_API_URL`.
- Do not reintroduce legacy proof-of-concept endpoints or client-side grid coloring.
- If adding meteorological math, conversions, multi-field derivations, or xarray metadata handling, add or reuse a shared helper before wiring the feature path.
- All HDF5/netCDF access must use `disk_cache.open_netcdf()` or otherwise hold `disk_cache.HDF5_LOCK`; the bundled HDF5 C library is not thread-safe.
- Do not tighten `climo_r2.dap_fetch_with_retries` to require `datetime64`; valid `cftime` climatology files can fall outside `datetime64[ns]`.
- Preserve scientific rendering meaning: fixed physical color anchors, discrete stepped boundaries, explicit units, provenance-aware labels, and 200+ DPI output.
- New public page types or public content features should ship matching schema.org JSON-LD. Use `LearningResource`, `Article`/`BlogPosting`, `Person`, `WebSite`, and `BreadcrumbList` where appropriate.
- Verify a library cannot do something before designing around it; check docs or installed types.
- Shared maps should travel as `/map` deep links so the recipe can be regenerated.

## React Guardrails

- Keep route `page.tsx` files thin; mount focused client components from them.
- Do not add workflows, drawers, panels, or data orchestration back into `MapBuilder.tsx`; extend the matching hook or panel, or add a focused module.
- Prefer focused components and hooks over thousand-line components.
- Use `useEffect` only for external synchronization such as network requests, subscriptions, DOM APIs, timers, or URL/search-param sync.
- Prefer derived render values, event handlers, reducers, and explicit state machines over effect chains that copy state into more state.
- Keep server state separate from UI state; request lifecycle should have clear loading, success, error, abort, and blob cleanup behavior.
- Use Tailwind classes throughout; avoid inline styles and separate CSS files.

## Communication

- Be concise, concrete, and literal.
- Ask when a technical note seems stale or when a change may affect science, data, or deployment behavior.
- State what changed, how it was verified, and any remaining browser smoke tests.
