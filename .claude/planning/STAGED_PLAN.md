# PyRe: Staged Implementation Plan

## Implementation Status (as of 2026-05-09)

Stages 1–6 are **complete and working**. The system is a functioning end-to-end application with polished rendering and a settings panel.

| Stage | Status |
|---|---|
| 1 — Surgical Retrieval Engine | ✅ Complete |
| 2 — 3-Hourly Viewer | ✅ Complete |
| 3 — Daily Mean Composites | ✅ Complete |
| 4 — Monthly / Seasonal Composites | ✅ Complete — uses CPC monthly mean pgb archive |
| 5 — Anomaly Mode | ✅ Complete — anomaly, normalized anomaly, climatology mean display |
| 6 — Rendering Polish & Settings Panel | ✅ Complete — see details below |

### What's working now

**Backend (`backend/app/`)**
- `retrieval.py`: surgical byte-range fetch from GCS (primary) and NOMADS (fallback). Handles single dates, date composites, monthly archive composites, and 30-year climatology stats (`lru_cache` for fast repeat calls).
- `main.py`: single `/api/map` endpoint handling all modes. Three date input paths: `date=` (6-hourly single), `dates=` (composite), `months=` (monthly archive). Four display modes: `raw`, `anomaly`, `normalized`, `climatology`. DRY inner closures `_fetch_climo`, `_fetch_obs`, `_fetch_wind` replace previously scattered if/elif chains. `climo_source` parameter accepted and validated; returns 501 for unimplemented sources.
- `visualizer.py`: Matplotlib/Cartopy PNG at 200+ DPI. Fixed color anchors, discrete `BoundaryNorm` steps, diverging blue/red colormap for anomaly modes, wind vectors or barbs overlay.

**Rendering details (Stage 6, completed 2026-05-09)**
- **Map title**: Single `ax.set_title()` with `\n` separator — no more two-line overlap in anomaly mode.
- **Vertical colorbar**: All colorbars moved to right edge (`orientation='vertical'`, shrink 0.85). More room for value labels.
- **Anomaly color scales DRYed up**: `_ANOMALY_SCALES` dict in `visualizer.py` is the single source of truth. `color_step` does **not** modify anomaly step size.
  - Wind speed: ±20 m/s, 2 m/s steps
  - Temperature: ±10 K, 1 K steps
  - Height: ±39 dam, 3 dam steps
  - Rel. humidity: ±30%, 3% steps
  - Specific humidity: ±0.003 kg/kg, 0.0003 steps
- **White zone**: Exactly 1 step each side of 0 is white on all absolute anomaly maps (`white_steps=1`).
- **Normalized anomaly**: ±5σ range, 0.5σ steps; only ±0.5σ is white.
- **Height raw contours**: Labeled isopleths at 4-dam intervals, fontsize 9, using `ax.clabel()`.
- **scipy dependency**: Added (`uv add scipy`) — required by `interp_like` for grid interpolation.

**Frontend (`frontend/src/App.tsx`)**
- Three-tab layout: 6-Hourly | Monthly | Climatology
- Fixed-position controls (uses CSS `visibility: hidden` not `display: none` — layout never shifts when tabs switch)
- Hour selector in Row 2 next to date, visible only for 6-hourly single mode
- Display (Raw / Anomaly / Normalized) disabled and replaced with label for Climatology tab
- Hour disabled for Monthly and Climatology tabs
- **Settings drawer** (gear icon, slides in from right): climatology source radio selector; toggle to enable normalized for 6-hourly; active source badge. Pending sources (`r1-daily`, `cfsr-daily`) are disabled/grayed until implemented.

**Climatology baseline (monthly mean — current approach)**
The 30-year baseline is computed from the CPC monthly mean pgb archive (1991–2020). Anomaly = observation − monthly climatological mean for that calendar month. This is the same approach PSL used for their 6-hourly and daily composite tools. It is scientifically defensible and what the meteorology community expects from a PSL-style interface.

---

## Open Question: Daily Climatology

### The Issue
The project brief specifies computing anomalies against the same synoptic hour's 30-year mean (e.g., May 4 00z anomaly vs. May 4 00z 1991–2020 mean). We currently use the **monthly mean** as the baseline instead of a true **daily** or **6-hourly** climatology.

This matters most for **normalized anomaly**: monthly interannual std (~10–20 gpm at 500mb) is far smaller than daily synoptic std (~50–80 gpm), causing normalized values to appear inflated (>5σ everywhere) compared to reference sites like Tropical Tidbits which use CFSR 1981–2010 daily climatology and show ±2–2.5σ for the same maps.

Normalized anomaly is therefore **disabled for 6-hourly mode by default** in the settings panel until a proper daily climatology source is wired in.

### Pending Decision: Climatology Source Selection

The settings panel has a placeholder for three sources. The selector is built; pending sources are disabled until implemented:

| Source | Period | Status | Notes |
|---|---|---|---|
| CORe monthly pgb (current) | 1991–2020 | ✅ Active | Works for absolute anomaly; inflated normalized |
| NCEP/NCAR R1 daily | 1991–2020 | ⏳ Pending data source decision | ~85 MB/year NetCDF; requires one-time offline download + precompute |
| CFSR daily | 1981–2010 | ⏳ Pending data source decision | What Tropical Tidbits and most reference sites use |

**Next step:** Consult with professor/domain experts about whether a daily climatology will be published for CORe, or which existing daily climatology is most appropriate to cross-reference against CORe data.

### Why We Don't Have It Yet
There is no pre-computed daily climatology for CORe. The options are:

| Option | Notes |
|---|---|
| NCEI Climate Normals | Station-based surface observations only (GHCN-D/ASOS). Not applicable to upper-air gridded reanalysis. |
| ERA5 daily climatology | Published by Copernicus/ECMWF for ERA5. Not applicable to CORe — mixing datasets is scientifically questionable. |
| CFSR daily | Used by most reference sites (Tropical Tidbits, etc.). 1981–2010 period. Cross-dataset comparison is non-ideal but common practice. |
| Compute from CORe | **The right answer long-term.** One-time batch job: fetch all 3-hourly CORe data for 1991–2020, group by calendar day, average across 30 years per day. ~87,600 files, several hours of compute, output ~a few GB NetCDF per variable. |

### Decision: Defer Until Server Deployment (and data source confirmed)

Computing daily climatology on a laptop is impractical for two reasons:
1. **Rate limiting risk** — 87,600 NOAA GCS requests in a single batch will likely trigger rate limiting or temporary blocks.
2. **Storage** — the output NetCDF files need a permanent home, not a laptop that might be reformatted.

**The right sequence:**
1. Confirm climatology source with professor/domain experts
2. Deploy PyRe to a cloud server (VPS, AWS, GCP, etc.)
3. Run the climatology batch job from the server — one time, in controlled bursts with appropriate delays
4. Store output NetCDF on the server's persistent volume
5. Update `retrieval.py` to read from local NetCDF when available
6. Enable the appropriate source in the settings panel

Until then, the monthly mean baseline is the working standard. It is what PSL shipped and is acceptable for absolute anomaly maps. Normalized anomaly is visually available for monthly mode where the temporal scale mismatch is smaller.

### Implementation Sketch (when ready)

```python
# scripts/build_daily_climo.py  (run once on the server)
# For each variable × level × calendar day (1–365):
#   fetch all 30 years of that day from CORe 3-hourly archive
#   compute mean and std
#   write to NetCDF shard
# Output: climo/{variable}/{level}/day_{001..365}.nc
```

```python
# retrieval.py additions (when NetCDF exists):
CLIMO_DAILY_PATH = Path(os.environ.get("CLIMO_DAILY_PATH", ""))

def get_daily_climatology(variable, level, calendar_day) -> tuple[xr.DataArray, xr.DataArray]:
    path = CLIMO_DAILY_PATH / variable / str(level) / f"day_{calendar_day:03d}.nc"
    if path.exists():
        ds = xr.open_dataset(path)
        return ds["mean"], ds["std"]
    # fall back to monthly mean
    month = (calendar_day_to_month(calendar_day))
    return get_climatology_field(month, ...)
```

---

## Next Priorities

### Near-term (can be done now, no server required)
1. **Temperature color scales** — levels above 700mb need correct isothermal color anchors (see `COLOR_SCALES.md`). Currently auto-scaled placeholder at 250mb, 500mb, etc.
2. **Wind speed color scales** — mid (500/400mb) and high (300mb+) level groups are placeholder even-spacing; need Pivotal Weather-sourced breakpoints (see `COLOR_SCALES.md`).
3. **Additional regions** — Global, North America, Europe, Pacific (extend `config.py` REGIONS dict; update Albers/PlateCarree projection selection in `visualizer.py`)
4. **Surface/flux variables** — from `grb2d` files (different GRIB2 filename pattern); not yet started

### Requires server deployment
5. **Server deployment** — Docker + docker-compose, cloud VPS (prerequisite for items below)
6. **Daily climatology batch computation** — confirm source with professor first; run from server, store as NetCDF; wire into settings panel
7. **Caching layer** — in-memory or Redis cache for frequently-requested fields
8. **Rate limiting / multi-user handling** — required before public deployment

### Deferred PSL features
9. **Monthly time series plots**
10. **Correlation mapping**

---

## Original Staged Plan (reference)

### Stage 1 — Surgical Retrieval Engine
Replace full-file GRIB2 downloads with index-parse → HTTP Range request. Core infrastructure. ✅

### Stage 2 — 3-Hourly Viewer
Single `/api/map` endpoint, React Composite Builder UI, Cartopy PNG renderer. ✅

### Stage 3 — Daily Mean Composites
Multiple dates, concurrent fetch, mean across time dimension. ✅

### Stage 4 — Monthly / Seasonal Composites
Month range or non-consecutive months, monthly mean pgb archive. ✅

### Stage 5 — Anomaly Mode
Subtract 30-year climatological mean; divergent colormap; standardized anomaly. ✅
Climatology baseline source resolved: CPC monthly mean pgb archive (1991–2020).