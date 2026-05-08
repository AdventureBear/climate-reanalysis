# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `PROJECT_BRIEF.md` for full project context, user stories, scientific design principles, and reference URLs.

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
- 6-Hourly Composites (00z/06z/12z/18z) — `https://psl.noaa.gov/data/composites/hour/`

The new underlying dataset is **CORe (Climate-Ocean Reanalysis)** from NCEP/CPC, available back to the 1950s.
- CORe info: `https://www.cpc.ncep.noaa.gov/products/CORe/index.html`
- PSL data info: `https://psl.noaa.gov/data/coreinfo.html`
- `get_core.py` reference: `https://ftp.cpc.ncep.noaa.gov/CORe/get_core/get_core.txt`

---

## Architecture

Monorepo: `backend/` (Python 3.12, FastAPI, uv) and `frontend/` (React 19, TypeScript, Vite, Tailwind v4).

**The frontend is a thin UI shell. All computation and rendering happen on the backend.**

The frontend sends a "recipe" (variable, level, region, date list, mode) → backend fetches, computes, renders → streams a PNG → frontend displays in an `<img>` tag.

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

### Current Code Status (Proof of Concept)

Both existing endpoints (`/get-map`, `/map-image`) and the Leaflet rectangle renderer are **scaffolding only**:
- Download entire GRIB2 files to disk instead of byte-range extraction.
- `/get-map` returns a raw JSON grid for frontend coloring — replaced by server-side PNG.
- `/map-image` streams a Cartopy PNG (closer to target) but still does full-file download.

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app and all API endpoints. CORS configured for `localhost:5173` / `127.0.0.1:5173`.
- **`config.py`** — `REGIONS` dict (lat/lon bounding boxes, 0–360 longitude) and `VARIABLES` dict (GRIB key mappings). Source of truth — don't hardcode bounds or variable names elsewhere.
- **`visualizer.py`** — `create_map_product()` renders a Matplotlib/Cartopy PNG, returns `io.BytesIO`.

### Frontend (`frontend/src/`)

- **`App.tsx`** — current PoC. Will become the Composite Builder: mode selector, variable/level/region pickers, date list input, and an `<img>` tag showing the returned PNG.
- Styled with **Tailwind CSS v4** (installed via `@tailwindcss/vite` plugin). Use Tailwind classes throughout; avoid inline styles and separate CSS files.

---

## Compositing Modes

| Mode | PSL Equivalent | Input |
|---|---|---|
| 6-Hourly | `composites/hour/` | 1 date + synoptic hour (00/06/12/18z) |
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