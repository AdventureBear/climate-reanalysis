# Time Selection Contract — Plan & Tracker

Status: Phase 0 in progress. Check items off as they land.

## Problem

The time-selection URL/API contract is ambiguous. The backend infers intent from
raw params (`date`, `dates`, `hour`, `hours`, `months`); the frontend time-scale
selector changes which params get emitted rather than being sent itself. This
produced wrong/ambiguous behavior around 3-hourly ranges (a `dates + hour`
request is labeled like a range but computes a same-hour slice), and a true
continuous 3-hourly range (Sep 1 09z through Sep 2 12z) is not representable.

## Vocabulary

- **Member**: one fetched grid at the finest granularity of the request — a
  `(date, hour)` field for sub-monthly products, a `(year, month)` field for
  monthly. Every product aggregates members: mean for state variables, sum for
  accumulation variables (existing `_RunningMean` / `_RunningSum` behavior).
- **Slice**: chosen hour(s) x chosen dates — the one deliberate cartesian
  product (e.g. 03z across 5 days; or 03z+18z across dates for diurnal
  phenomena).
- **Range** (3-hourly): a continuous inclusive span of members from a start
  date+hour to an end date+hour, crossing midnight freely.

## Decisions (settled 2026-09-03)

1. **`time_scale` is the v2 gate.** New params only become load-bearing when
   `time_scale` is present. Without it, full legacy inference applies and
   `date_mode` stays cosmetic (it is already emitted by generators with
   legacy meanings).
2. **Bare-date legacy URLs become daily composites.** The backend will
   distinguish "hour param absent" from "hour=00": absent + no `hours` + no
   `time_scale` means full-day synoptic composite (the user's intended
   meaning). Explicit `hour=00` stays a 00z snapshot. Frontend and all
   link generators always send `hour` explicitly, so only hand-typed/emailed
   bare-date links change meaning — those get a frontend popup notice.
3. **Slice supports multiple hours** (hours x dates cartesian, intentional).
   Legacy `dates + hours=<non-synoptic>` maps onto slice semantics — same math
   as today, so no rejection row is needed. Refinement: slice anomalies use
   hour-matched climatology baselines; the synoptic-4 set keeps the daily-mean
   baseline (it is a daily mean).
4. **Member cap stays 372** (`MAX_DAILY_COMPOSITE_FETCHES`) for now.
   Spun-off issue: caps / request cost / rate limiting / possible pro tier.
5. **Climatology stays under `mode=climatology`**, outside the `time_scale`
   contract. Spun-off issue: regroup time-scale vs climatology UI controls.
6. **Range aggregation** is the same variable-dependent operator as composites
   (mean for most, sum for accumulations).
7. **Saved maps are safe by construction**: `public.saved_maps.recipe` stores
   explicit `time.scale` / `time.subMode`. Legacy recipe rows with
   `{scale:'3-hourly', subMode:'range', hour}` (slice semantics) load as the
   new `slice` mode; the new continuous range is structurally different
   (carries an end hour).

## Canonical API (gated on `time_scale`)

| Intent | Params |
|---|---|
| 3-hourly single | `time_scale=3-hourly&date_mode=single&date=YYYYMMDD&hour=HH` |
| 3-hourly range | `time_scale=3-hourly&date_mode=range&start_time=YYYYMMDDHH&end_time=YYYYMMDDHH` |
| 3-hourly list | `time_scale=3-hourly&date_mode=list&times=YYYYMMDDHH,...` |
| 3-hourly slice | `time_scale=3-hourly&date_mode=slice&dates=...&hours=HH[,HH...]` |
| Daily single | `time_scale=daily&date_mode=single&date=YYYYMMDD` |
| Daily range | `time_scale=daily&date_mode=range&start_date=...&end_date=...` |
| Daily list | `time_scale=daily&date_mode=list&dates=...` |
| Monthly single | `time_scale=monthly&date_mode=single&month=YYYYMM` |
| Monthly range | `time_scale=monthly&date_mode=range&start_month=...&end_month=...` |
| Monthly list | `time_scale=monthly&date_mode=list&months=...` |

Stale irrelevant params are ignored when `time_scale` makes intent clear
(e.g. `time_scale=daily&hour=09`).

## Legacy inference (no `time_scale` present)

| Legacy shape | Meaning |
|---|---|
| `date`, no hour param sent | daily synoptic composite (CHANGED - popup-flagged) |
| `dates`, no hour param sent | daily synoptic composite per date (CHANGED - popup-flagged) |
| `date&hour=HH` | 3-hourly single (unchanged) |
| `dates&hour=HH` | slice, one hour (unchanged math) |
| `date&hours=...` | slice on one date (unchanged math) |
| `dates&hours=00,06,12,18` | daily composite (unchanged) |
| `dates&hours=<other>` | slice (unchanged math; hour-matched climo baseline) |
| `months=...` | monthly (unchanged) |

## Phases

### Phase 0 — Freeze current truth (no behavior change)

- [x] **0a. Saved-map audit (Suzanne).** Done 2026-09-03 — results below.
  Zero null-scale rows: every saved recipe carries an explicit scale, none
  depend on legacy URL inference. Remap population is 8 rows of
  3-hourly/range (→ slice on load) + 2 climatology rows (null subMode is
  correct — climatology has no submode).
- [x] **0b. Default-hour dependency sweep (Claude).** Done 2026-09-03 — CLEAN.
  Every MapRequest construction site in app/ and scripts/ passes `hour` or
  `hours` explicitly (checked: synopsis.py, single_date_packages.py, all
  representative-map/animation scripts; run_monsoon_wind_experiment uses
  `hours`). `blank_map` (generate_region_thumbnails.py) returns from
  create_map_buffer before parse_time_selection — no time dependency.
  The implicit default lives in exactly two lines, both Phase 2 targets:
  `main.py:509` (endpoint `hour: str = "00"`) and `request.py:12`
  (dataclass default). scripts/out/ contains generated one-off scripts;
  ignored.
- [x] **0c. Golden corpus test (Claude).** Done 2026-09-03 —
  `backend/tests/test_time_selection_corpus.py`: 21 shape cases + 6
  rejection cases, all passing against untouched code (full suite: 295
  pass). DECISION-2 and SLICE-CLIMO rows are comment-marked for their
  deliberate Phase-2 edits. Discovery: the parser accepts unpadded months
  ("20269" → Sep 2026) via strptime leniency — unreachable through
  /api/map (endpoint validates length first), documented as a corpus case.
  Contract-guard comments added at both type-definition sites:
  `time_selection.py` (TimeRequest) and `mapRecipe.ts` (TimeScale/SubMode).

### Phase 1 — Members-first internals (backend, invisible)

- [ ] Extend `TimeSelection` (`backend/app/map_pipeline/time_selection.py`) to
  always carry expanded members (`date_hour_members`, `month_members`).
- [ ] Existing fetch paths untouched; corpus stays green.

### Phase 2 — Canonical contract + pair-aware fetch (backend)

- [ ] `time_scale` gate in the parser; new canonical params + validation
  (3-hourly grid, ordered ranges, 372-member cap, clear 422s).
- [ ] Hour-absence detection for legacy bare-date daily (Decision 2), including
  the 0b caller fixes.
- [ ] Pair-aware fetch path driven by `date_hour_members` through
  `gather_composite_members` (keeps the structured 404 `{message, missing,
  total}` contract).
- [ ] Per-member hour-matched climatology (r1-4xdaily, day+hour weighted) for
  anomaly/normalized ranges and slices.
- [ ] New selection kind added or explicitly declined in EVERY dispatch table:
  obs fetchers, wind components, MSLP/H-L centers, contour overlays,
  `map_labels`, `request_logging`.

### Phase 3 — Frontend

- [ ] `TimeRecipe` v2: `subMode` gains `slice`; 3-hourly `range` becomes
  continuous (start date+hour → end date+hour); daily/monthly ranges use
  `start_*`/`end_*`.
- [ ] `timeRecipeToParams` always emits `time_scale` + `date_mode`;
  `timeRecipeFromUrl` parses canonical first, legacy fallback second.
- [ ] Saved-recipe loader maps legacy 3-hourly `range` rows to `slice`.
- [ ] `dataGap.ts` retry surgery learns `start_time`/`end_time`/`times`.
- [ ] Popup notice for URL-borne bare-date links whose meaning changed.
- [ ] Labels: Range = continuous span with both endpoints; Slice = hour(s) @
  dates. Scale-switch stale-state cleanup.
- [ ] Smoke matrix: every scale x single/range/list/slice, old links, saved
  maps, weekly-featured cards, data-gap retries, future-date modal.

### Phase 4 — Generators + docs

- [ ] Migrate backend URL generators (single-date packages, birthday maps,
  synopsis tooling, frontpage/region scripts) to canonical params.
- [ ] Update PROJECT.md, docs/smoke-checklist.md, FAQ.md if user-visible.
- [ ] Legacy parser is permanent; no stored content rewritten.

## Spun-off issues (file separately, not in this effort)

- [ ] Member caps / request cost / rate limiting / pro-tier lever.
- [ ] Regroup time-scale vs climatology controls in the map builder UI.

## Audit results (0a, production, 2026-09-03)

| scale       | sub_mode | count |
| ----------- | -------- | ----- |
| 3-hourly    | single   | 300   |
| daily       | range    | 37    |
| daily       | single   | 35    |
| monthly     | range    | 11    |
| 3-hourly    | range    | 8     |
| monthly     | single   | 7     |
| climatology | null     | 2     |
