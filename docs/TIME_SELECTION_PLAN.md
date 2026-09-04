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

- [x] Extend `TimeSelection` (`backend/app/map_pipeline/time_selection.py`) to
  always carry expanded members (`date_hour_members`, `month_members`).
  Done 2026-09-03: `date_hour_members` field populated by the parser for
  every sub-monthly selection (dates x hours for daily composites, request
  hour per date otherwise; expansion order matches the fetchers — dates
  outer, hours inner). `month_members` is a property aliasing
  `year_months`. Legacy fields remain until fetch paths migrate (Phase 2).
- [x] Existing fetch paths untouched; corpus stays green. Member-level
  assertions added to 7 corpus cases (single, slice, daily x2, monthly,
  bare-date x2); corpus 27/27, full suite 295/295.

### Phase 2 — Canonical contract + pair-aware fetch (backend)

Done 2026-09-03 (both stages). Suite: 332 passing (corpus grew to 32 shape
cases + 20 rejections; new `tests/test_pairs_fetch_plan.py` + 5 endpoint
tests in `tests/test_request_guards.py`).

- [x] `time_scale` gate in the parser (`_parse_canonical` in
  time_selection.py); all canonical params + validation (3-hourly grid,
  ordered ranges, member cap, duplicate rejection, clear 422s). Cap
  constants moved to time_selection.py as the single source; main.py
  imports them. `time_scale=climatology` 422s with guidance (Decision 5).
- [x] Hour-absence detection (Decision 2): endpoint + MapRequest `hour`
  default changed "00" → ""; bare date/dates with no hour param expand to
  the synoptic daily composite. precip_total exempt (falls back to the old
  00z ending hour). Explicit `hour=00` stays a snapshot (endpoint test).
- [x] Pairs fetch path: `_mean_pairs_obs` + `PAIR_MEMBER_FETCHERS` registry
  in fetch_plan.py, one entry per single-member fetch kind, all through
  `gather_composite_members` (structured 404 contract preserved).
  precip_total deliberately excluded — endpoint 422s 3-hourly range/list
  for it ("use precip_window").
- [x] Hour-matched climatology: `fetch_climo`/`fetch_wind_climo_components`
  take an hour override; `_member_day_hour_counts` weights per
  (month, day, hour); `fetch_daily_climo_for_selection` and the wind
  variant use it whenever the source is r1-4xdaily. SLICE-CLIMO in
  climo_policy: non-synoptic slice anomalies hour-match; synoptic-4 and
  normalized keep the daily-mean baseline (r1 carries no sigma).
  map_service routes any multi-member sub-monthly selection through the
  weighted fetchers and passes the member hour on single-member paths.
- [x] "pairs" kind covered in every dispatch table: OBS_FETCHERS,
  WIND_COMPONENT_FETCHERS, MSLP (`_mean_named_level_pairs`), contour
  overlays (height/temp/2m-temp branches), `map_labels` (span labels +
  "(hour-matched)" baseline tag), `request_logging`/`period_description`.
  Completeness asserted by test_pairs_dispatch_covers_every_single_variable_kind.

- [x] Live smoke check (Suzanne, 2026-09-03): midnight-crossing range map
  compared against its four single-hour maps — correct. Titles simplified to
  her wording: raw `2026-08-31 21z – 2026-09-01 06z  (4 3-hr intervals)`,
  anomaly `3-hourly anomaly · <span>` with baseline line reduced to source +
  period.

### Phase 3 — Frontend

- [ ] `TimeRecipe` v2: `subMode` gains `slice`; 3-hourly `range` becomes
  continuous (start date+hour → end date+hour); daily/monthly ranges use
  `start_*`/`end_*`.
- [ ] `timeRecipeToParams` always emits `time_scale` + `date_mode`;
  `timeRecipeFromUrl` parses canonical first, legacy fallback second.
- [ ] Saved-recipe loader maps legacy 3-hourly `range` rows to `slice`.
- [ ] `dataGap.ts` retry surgery learns `start_time`/`end_time`/`times`.
- [ ] Popup notice for URL-borne bare-date links whose meaning changed.
- [ ] URL normalization: after parsing a legacy URL into the recipe, rewrite
  the address bar to the canonical params (router.replace, no reload) so
  copied/re-shared links leave the legacy shapes behind.
- [ ] Labels: Range = continuous span with both endpoints; Slice = hour(s) @
  dates. Scale-switch stale-state cleanup.
- [ ] Smoke matrix: every scale x single/range/list/slice, old links, saved
  maps, weekly-featured cards, data-gap retries, future-date modal.

### Phase 4 — Generators + docs

- [ ] Migrate backend URL generators (single-date packages, birthday maps,
  synopsis tooling, frontpage/region scripts) to canonical params.
- [ ] Update PROJECT.md, docs/smoke-checklist.md, FAQ.md if user-visible.
- [ ] Legacy parser is permanent; no stored content rewritten.

## Spun-off issues (filed 2026-09-03; this effort is #139)

- [ ] #142 Member caps / request cost / rate limiting / pro-tier lever.
- [ ] #143 Regroup time-scale vs climatology controls in the map builder UI.
- [ ] #140 Unify accumulation under range semantics: the aggregation operator
  (mean vs sum) is a per-variable property, so a range over an accumulating
  variable should sum its members instead of erroring. `precip_window`
  becomes UI sugar over a range; no new `*_window` params for future
  accumulating variables. (Suzanne, 2026-09-03: "windows are just ranges.")
- [ ] FAQ entries (with Phase 4 docs): "what is an anomaly of a composite?"
  and an R1-vs-R2 baseline cheat sheet (which source, what cadence, when
  each is used, why two anomaly requests for the same weather can differ
  slightly). (Done early: FAQ #24 on why daily = 4 synoptic times,
  2026-09-03.)
- [ ] #141 Generalize the r2-daily-15day windowed baseline beyond PWAT. Variables
  that swing hard hour to hour (precip when its anomalies get implemented,
  possibly others) likely need the WPC-style centered 15-day mean/σ rather
  than a single-day normal. Collect the NCEP PSL / WPC reference pages on
  anomaly construction into docs as part of this.

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
