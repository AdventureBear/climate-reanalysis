# MEMENTO — glance-first reference for time selection, datasets, and baselines

Diagrams first, tables second, no long paragraphs. When a diagram isn't
enough: FAQ #24 (why daily = 4 times), docs/TIME_SELECTION_PLAN.md (the
whole redesign), or the issue list at the bottom.

---

## 1. Which parser reads my URL?

```
URL has time_scale?
├── NO  → legacy parser (old links, saved maps, generators)
│         date+hour        → one snapshot
│         date, NO hour    → daily composite (00/06/12/18z)   ← changed 2026-09-03
│         dates+hour       → slice (that hour, each date)
│         dates+hours      → slice (those hours × those dates)
│         date(s)+hours=00,06,12,18 → daily composite
│         months           → monthly
└── YES → canonical parser (v2)
          date_mode=single → date+hour        (one snapshot)
          date_mode=range  → start_time..end_time, every 3h, can cross midnight
          date_mode=list   → times=YYYYMMDDHH,...
          date_mode=slice  → dates × hours (the ONE allowed cartesian)
          daily/monthly    → date/dates/start_date..end_date/month/months
```

## 2. What gets averaged? (members)

```
member = one fetched grid at one (date, hour)   [monthly: one (year, month)]

single  ▪                                1 member
slice   ▪ ▪ ▪        (21z on 3 dates)    dates × hours members
range   ▪▪▪▪▪▪▪▪▪▪   (09z Sep1→12z Sep2) every 3h step, 10 members
daily   ▪ ▪ ▪ ▪      (00/06/12/18z)      4 members per date
monthly ▪            (one archive file per month)

map = mean of members            (precip: SUM, not mean)
cap = 372 members per map
```

## 3. Anomaly = two sides, subtract

```
   ANOMALY MAP  =  OBSERVATION SIDE  −  BASELINE SIDE
                   (the weather you       (the 30-year normal
                    asked about)           for those dates/hours)

   avg(obs members) − avg(matching normals)  ==  avg(each member's anomaly)
```

Each member's normal matches its own calendar day — and since 2026-09-03,
its own HOUR (ranges/slices). Daily composites match the daily-mean normal.

## 4. Which baseline dataset, and what it costs

```
your map is…            baseline used        who averaged 30 yrs?   first-use cost
─────────────────────   ──────────────────   ───────────────────   ──────────────
3-hourly (any form)     r1-4xdaily           NOAA (published)      1 fetch/hour
daily composite         r2-daily             US, on demand         30 fetches/day-of-year
monthly (toggle OFF)    r2-monthly           US, on demand         ~30 fetches/month
monthly (toggle ON,     monthly-pgb (CORe)   US, from CORe         ~30 fetches/month
  pressure-level only)
PWAT single-hour        r2-daily-15day       US, ±7-day window     ~450 fetches, cached
precip (any)            NONE — anomaly mode not implemented yet (#135)
```

Everything computed lands in the disk cache and is free afterward.
Disk cache is single-server → #144 before scaling to multiple instances.

## 5. R1 gives 4 hours/day — where do 03/09/15/21z normals come from?

```
00z ──────── 03z ──────── 06z
 ▪  ← blend:  ◐  = ½·00z + ½·06z  → ▪
21z blends 18z with the NEXT day's 00z (midnight wraps cleanly)
Each synoptic normal is fetched once and cached; blends are free math.
```

## 6. Monthly OBSERVATION lookup (the archive-lag fallback)

This is the OBSERVATION side. The settings toggle does NOT touch it.

```
requested month (e.g. Aug 2026)
├── Tier 1: CORe monthly archive file          → fast    [CORe-pgb]
├── Tier 2: R2 monthly (ends Dec 2021 —        → fast    [R2-monthly]
│           never rescues recent months)
└── Tier 3: compute from 3-hourly data         → SLOW    [CORe-synoptic]
            days × 4 synoptic ≈ 124 fetches, then cached
            (announcing this in the UI = #145)
```

The BASELINE side never lags: normals come from 1991–2020 files,
which are decades old and fully published.

## 7. Why daily = 00/06/12/18z and not all 8 times

```
obs daily average  ──── built from 00/06/12/18z ┐
                                                 ├─ same construction → fair subtraction
r2-daily normal    ──── built from 00/06/12/18z ┘

want all 8 times anyway?  request a range 00z→21z of one day
(its baseline switches to hour-matched r1-4xdaily; result is close, not identical)
```

Full explanation: FAQ #24.

## 8. Caching at a glance

```
3-hourly obs grids     NOT cached (small byte-range fetches, always fresh)
monthly obs grids      cached per (variable, level, year, month)
all climatology        cached per exact coordinates (variable, level, day[, hour])
cache location         one server's disk (PYRE_CACHE_DIR)  →  #144 to scale
```

## 9. Issues this file points at

| # | Title | Why you'd open it |
|---|---|---|
| #139 | Time-selection contract v2 | the redesign itself; Phases 3–4 remain |
| #140 | Unify accumulation under range semantics | "windows are just ranges" |
| #141 | Generalize 15-day windowed baseline beyond PWAT | volatile variables |
| #142 | Request cost controls / caps / pro tier | the 372 cap, growth |
| #143 | Regroup time-scale vs climatology UI controls | climatology isn't a time scale |
| #144 | Shared climatology cache for multi-instance scaling | disk cache blocks scaling |
| #145 | Label toggle scope + announce synoptic fallback | monthly transparency |
| #70 | Precompute our own R2 climatology files | kills the 30-fetch pattern |
| #66 | Climatology source comparison (ERA5/R2/CORe) | prerequisite for #70 |
| #125 | TRACKING: climatology sources legible | umbrella for baseline UX |
| #146 | TRACKING: precomputed climatology infrastructure | umbrella for #66→#70→#144→#141 |
| #135 | Design valid precipitation anomaly products | why precip is raw-only |

## 10. Method references (where the science came from)

```
15-day moving average / standardized anomaly  →  WPC training page
    https://www.wpc.ncep.noaa.gov/training/prod_gen.html
    (daily climatology, centered 15-day mean, (field − mean) / σ)
    fullest write-up: PROJECT.md "Single-hour PWAT baseline" sections
    public version:   FAQ, normalized-anomaly section

σ definitions vary by product → why maps label their baseline source
    https://psl.noaa.gov/data/ncep_reanalysis/procedures.html

NCEI gridded normals — ruled out: station-based, US-only
    (docs/archive/STAGED_PLAN.md)
```

---

*Update this file when a diagram stops matching the code. Last: 2026-09-03.*
