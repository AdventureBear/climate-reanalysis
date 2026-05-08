# PyRe: Staged Implementation Plan

## Overview

Five stages, each delivering a usable increment before the next begins. Stages 1–2 are the foundation; Stages 3–5 layer compositing and analysis capability on top.

---

## Stage 1 — Surgical Retrieval Engine

**Goal:** Replace full-file GRIB2 downloads with the two-step index-parse → HTTP Range request approach. This is the core infrastructure everything else builds on.

**Deliverables:**
- `backend/app/retrieval.py` — reusable module with:
  - `fetch_index(date, hour)` — fetches and parses the `.idx` file into a list of `{record, byte_start, variable, level}` dicts
  - `fetch_field(date, hour, variable, level)` — uses the index to issue a `Range` HTTP request and returns an in-memory xarray DataArray
  - Support for fetching multiple fields in one call (e.g., UGRD + VGRD together for wind)
- Update `config.py` `VARIABLES` dict to use CORe GRIB short names (TMP, UGRD, VGRD, SPFH, HGT, PRES)
- Existing `/map-image` endpoint updated to use `fetch_field()` internally — no behavior change, just replaces the download

**Key details:**
- Index line format: `{record}:{byte_start}:d={YYYYMMDDhh}:{VAR}:{level}:anl:ens mean`
- Byte range for record N = `byte_start[N]` to `byte_start[N+1] - 1`
- Last record: omit end byte (fetch to EOF)
- NOMADS `.idx` URL pattern: `https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.{date}/{hour}/post/spost/core.t{hour}z.spgb.ensmean.anl.grib2.idx`
- Parse the byte-range GRIB2 chunk with `cfgrib.open_file()` via `io.BytesIO`

---

## Stage 2 — 3-Hourly Viewer (First Real Page)

**Goal:** Working end-to-end UI for viewing any single valid time. Replaces the PoC `App.tsx`.

**CORe time structure:** Data is 3-hourly (03/06/09/12/15/18/21/00z). NOMADS organizes it in 6-hourly batch directories (00/06/12/18), each containing two valid times. 00z rolls back to the previous day's 18z batch. The `retrieval.py` module handles this mapping transparently — callers always think in valid date+hour.

**Deliverables:**
- **Backend:** Clean `/api/map` endpoint accepting `date`, `hour`, `variable`, `level`, `region` query params. Returns streaming PNG. Removes old `/get-map` and `/map-image` PoC endpoints.
- **Frontend:**
  - Add React Router — single route for now: `/`
  - Rebuild `App.tsx` as a Composite Builder shell with Tailwind styling
  - Controls: date picker, hour selector (03/06/09/12/15/18/21/00z), variable dropdown, level dropdown, region selector
  - Map display area: shows the PNG returned by `/api/map` in an `<img>` tag
  - URL reflects current query params (shareable links)
- **Visualizer:** Ensure `create_map_product()` handles all supported variables (not just wind speed) — at minimum TMP, HGT, and wind speed from UGRD+VGRD

**UI layout (approximate):**
```
[ Header: PyRe — Climate Reanalysis ]
[ Control panel: Date | Hour | Variable | Level | Region | [Generate Map] ]
[ Map image display — full width ]
```

---

## Stage 3 — Daily Mean Composites

**Goal:** Accept multiple dates, fetch concurrently, return a composite mean map.

**Deliverables:**
- Backend: extend retrieval to accept a list of dates; use `asyncio` / concurrent fetches to pull all fields in parallel; compute `mean` across the time dimension before rendering
- New endpoint or extend `/api/map` with a `dates` list parameter
- Frontend: multi-date input (add/remove dates from a list), "Daily Mean" mode toggle

---

## Stage 4 — Monthly / Seasonal Composites

**Goal:** Composite across all 6-hourly time steps within a month range or non-consecutive month list.

**Deliverables:**
- Backend: given a month range or list of months, enumerate all 6-hourly time steps (up to 120+ per month), fetch concurrently, compute mean
- Frontend: month-range picker and non-consecutive month list builder (the most complex UI component)
- Performance: this is the most data-intensive operation — needs concurrency limits and progress feedback

---

## Stage 5 — Anomaly Mode

**Goal:** Toggle on any composite to show departure from 30-year climatological mean.

**Open question:** Source of climatological means. Options:
1. Pre-compute from CORe historical archive (1950s–present) — one-time batch job
2. Fetch from an existing climatology dataset if one is published alongside CORe
3. Use PSL's existing climatology files (still available for the old dataset) as an interim approximation

**Deliverables (once climatology source is resolved):**
- Backend: `fetch_climatology(variable, level, calendar_day, hour)` — returns the 30-year mean field
- Anomaly calculation: `current_field - climo_field`
- Optional: standardized anomaly `(current - climo) / stddev`
- Visualizer: divergent colormap (Blues below-normal, Reds above-normal, neutral at zero) — separate from the absolute-value colormap
- Frontend: "Anomaly" toggle button; legend updates to show departure units

---

## Deferred / Future

- Correlation mapping
- Monthly time series plots
- Multiple projection support (Albers, Stereographic) — currently PlateCarree only
- Caching layer for frequently-requested fields
- Rate limiting / multi-user load handling (required before public deployment)
- Docker + docker-compose for deployment