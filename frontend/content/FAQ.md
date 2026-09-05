# PyRe — Frequently Asked Questions

Data sources, methods, and scientific design decisions organized from foundational concepts to more technical detail.

---

## 1. What is PyRe?

PyRe is an independently built replacement for the NOAA/PSL interactive reanalysis composite pages that stopped updating in March 2026 when the underlying NCEP Reanalysis dataset was discontinued. PSL has no plans to rebuild the interface for the successor dataset. PyRe replicates the three PSL interfaces:

- **Monthly/Seasonal Composites** — composite means over one or more calendar months
- **Daily Mean Composites** — average of one or more calendar days across 00z/06z/12z/18z
- **3-Hourly Composites** — a single analysis time (00/03/06/09/12/15/18/21z) or averaged across a date list

---

## 2. What happened to the old PSL reanalysis pages?

The PSL composite tools were built on **NCEP Reanalysis 1** (R1), a global retrospective analysis that ran from 1948 through March 2026. When NCEP discontinued R1 as the operational product and replaced it with CORe (Climate-Ocean Reanalysis), the PSL interface was not updated. PSL's existing pages are archived but show no data after March 2026.

---

## 3. What data does PyRe use for observations (the actual maps)?

PyRe uses **CORe — Climate-Ocean Reanalysis** from NCEP/CPC.

- **Resolution**: 0.703° × 0.703° (~78 km at mid-latitudes), the T170 gaussian grid — about 3.5× finer than R1 in each direction, or roughly 13× smaller grid boxes by area
- **Temporal coverage**: January 1, 1950 to near-real-time
- **Format**: GRIB2 ensemble mean files; PyRe fetches data surgically using HTTP byte-range requests (no full file downloads)
- **Naming**: `pgb.{YYYYMMDD}{HH}.grb` (pressure levels) and `flx.{YYYYMMDD}{HH}.grb` (surface) in the GCS archive; `core.t{HH}z.spgb.ensmean.anl.grib2` on NOMADS for the most recent week

CORe is the designated successor to R1/R2 for NCEP operational reanalysis products.

---

## 4. Can I use R2 (NCEP Reanalysis 2) for the actual map data?

**No.** In PyRe, R2 is used *exclusively* for the climatological baseline — the 30-year mean and standard deviation used to compute anomaly and normalized anomaly maps. R2 is never used as the source for the observation fields shown on raw or composite maps.

**Why not?** R2 stopped updating in early 2026 and has no near-real-time data. Its 2.5° spatial resolution is also significantly coarser than CORe's 0.703°. For any map showing what the atmosphere looked like on a specific date, CORe is the correct source.

---

## 5. So what IS R2 used for, and why?

R2 is used as a **climatology baseline** — the reference against which we measure anomalies.

- **For daily modes**: PyRe uses R2 **daily** climatologies — the mean and standard deviation of each calendar day (e.g., April 27) computed across 30 years (1991–2020). This gives a day-specific baseline that captures the seasonal cycle correctly.
- **For monthly modes**: PyRe uses R2 **monthly** climatologies. Monthly baselines are calendar-month means and standard deviations. (A CORe-derived monthly baseline exists for pressure-level variables and older shared links that requested it still render with it, but there is currently no control for choosing it — a fuller baseline picker, covering both the source and the base period, is planned.)
- **For 3-hourly modes**: the baseline comes from R1 rather than R2, because it has to be specific to the hour as well as the day. See Q8.

**Why R2 for sub-monthly climatology instead of CORe?** CORe is still relatively new and does not yet have a full 30-year daily/3-hourly climatology product wired into PyRe. R2 covers 1979–present with a stable, well-documented methodology, making it the best currently available 1991–2020 baseline for daily anomaly maps.

---

## 6. What variables are available?

**Pressure-level variables** (16 standard levels: 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10 mb unless noted):

| Variable | Description | Notes |
|---|---|---|
| Wind Speed | Magnitude of horizontal wind | Derived from U + V components |
| Temperature | Air temperature | |
| Geopotential Height | Height of a pressure surface | |
| Relative Humidity | RH (%) | Derived from Specific Humidity + Temperature via Bolton formula |
| Specific Humidity | Water vapor mixing ratio | Raw maps only (no R2 baseline) |
| Omega | Vertical velocity (Pa/s) | 100–1000 mb only — CORe publishes no stratospheric omega |
| Absolute Vorticity | 10⁻⁵ s⁻¹ | Raw maps only |

**Surface and single-level variables:**

| Variable | Description | Notes |
|---|---|---|
| 2m Temperature | Air temperature at 2 m | |
| 10m Wind Speed | Wind speed at 10 m | Climatology derived from R2 u/v per sample |
| Mean Sea Level Pressure | MSLP | |
| Precipitable Water | Total-column water vapor | |
| Precipitation Rate | Displayed mm/day or in/day | 0–3 h average forecast field, not instantaneous; raw maps only |
| Precipitation Total | Displayed mm or inches | Accumulated from PRATE over 3/6/12/24 h windows; raw maps only |
| Cloud Cover | Total-column and layer cloud cover (%) | 0–3 h average forecast field, not instantaneous; raw maps only |
| Radiation | Surface and top-of-atmosphere shortwave/longwave fluxes | 0–3 h average forecast fields; non-OLR options are raw maps only |
| CAPE / CIN | Three parcel variants each — see Q22 | Raw maps only |
| 2m Dewpoint | Displayed °F | Raw maps only |
| Snow Depth | Displayed inches | Raw maps only |

"Raw maps only" means no climatology/anomaly modes are wired yet — either R2 has no matching baseline file, or the derivation is deferred (see `climo_sources` in `backend/app/config.py`).

---

## 7. What map modes are available?

| Mode | What it shows |
|---|---|
| Raw | The actual observed/composite value of the field |
| Climatology | The 30-year mean for that calendar period — no observations fetched |
| Anomaly | obs − climo_mean |
| Normalized Anomaly | (obs − climo_mean) / climo_σ — expressed in standard deviations |

Anomaly and normalized anomaly maps require a climatology source.

### How anomaly maps are built by time scale

| Time Scale | Observation Field | Climatology Baseline | Result |
|---|---|---|---|
| 3-hourly / single synoptic time | CORe field for the selected date and hour | Usually R1 4×-daily normal for that calendar day **and that hour**; PWAT uses R2 daily centered 15-day climatology | `obs - climo_mean` |
| 3-hourly composite | CORe fields for multiple dates at the same selected hour | Mean of the matching R1 per-hour normals | `composite - climo_mean` |
| Daily | CORe average across selected daily hours, currently 00z/06z/12z/18z | R2 daily climatology for that calendar day | `daily_mean - climo_mean` |
| Daily composite | CORe average across dates and daily hours | Weighted/averaged matching R2 daily climatologies | `composite - climo_mean` |
| Monthly | CORe monthly field/composite | Monthly climatology from `monthly-pgb` or `r2-monthly` | `monthly_value - climo_mean` |
| Multi-month monthly | CORe monthly composite | Day-weighted mean of each month’s climatology | `monthly_composite - climo_mean` |
| Climatology | No observation fetched | Monthly climatology source | The climatological mean itself |

`Climatology` is a map mode, not an anomaly. It answers “what is normal for this month?” Anomaly and normalized anomaly answer “how different was this event or composite from normal?”

Before subtraction, PyRe interpolates the coarser climatology grid onto the CORe observation grid.

Some variables are intentionally raw-only until suitable baselines or derivations are wired. Currently wired single-level / FLX-side fields with R2 daily/monthly baselines are 2m temperature, 10m wind, MSLP, PWAT, and OLR.

Precipitation, total cloud cover, and radiation fluxes come from CORe forecast-background FLX fields. They are useful for broad case-study context, but they are not gauge/radar-observed precipitation totals, direct station-observed sky-condition reports, or point pyranometer measurements.

Normalized anomaly is not offered on most 3-hourly maps because the per-hour R1 baseline has no sigma. PWAT is the current exception. See the next question.

---

## 8. Why does a 3-hourly map use a different baseline than a daily map?

Because a single hour has to be compared against that same hour, not against the whole day.

Afternoons are warmer than the daily average and nights are colder. That is true on a completely ordinary day. So if a 2 p.m. reading is compared against the average of the whole 24 hours, it looks warmer than normal even when nothing unusual is happening, and a 5 a.m. reading looks colder.

On a map this is worse than a simple offset. One map covers many time zones at once, so the size of the error changes across the map, and it is near zero over the ocean, which barely warms or cools between day and night. The result looks like a weather pattern but is really a picture of the clock.

Measured on a quiet day (May 4, 1986, CONUS 2m temperature), the average anomaly across the map swung 5.5°F between hours when compared against a daily average. Against per-hour normals, that swing dropped to 2.0°F, and the warm-afternoon, cold-night pattern disappeared.

**Where the per-hour normals come from.** PSL publishes 4×-daily long-term means from R1 (Reanalysis 1), giving one normal per synoptic hour for each calendar day, averaged over 1991–2020. PyRe reads these for 00/06/12/18z and interpolates between neighbouring hours for 03/09/15/21z. The map title names the baseline and hour, for example `Baseline: May 4 18z · R1 4×-daily 1991–2020`.

**Why mix in a third dataset.** Observations are CORe, daily and monthly baselines are R2, and per-hour baselines are R1. That is not ideal. But the difference between R1 and R2 as datasets is much smaller than the ±10°F artifact the daily baseline was introducing, so the swap is a clear improvement. A CORe-native climatology covering all eight 3-hourly analyses would remove the mixing entirely, and is planned.

**Why normalized is usually unavailable for a single hour.** A normalized map divides by the standard deviation. The published per-hour R1 files contain averages only, with no standard deviation, so most single-hour normalized maps have nothing defensible to divide by. PWAT is handled separately: PyRe uses an R2 daily centered 15-day PWAT mean/std baseline, following the WPC-style standardized-anomaly convention, while still shading the selected CORe 3-hourly PWAT observation.

WPC describes this kind of standardized anomaly as a daily NCEP/NCAR climatology with a centered 15-day average, then `(field - mean) / sigma`: <https://www.wpc.ncep.noaa.gov/training/prod_gen.html>. PSL's NCEP atlas notes that standard deviation can be defined differently depending on the product, so PyRe labels the baseline source on the map: <https://psl.noaa.gov/data/ncep_reanalysis/procedures.html>.

---

## 9. How are wind anomalies defined?

PyRe treats wind anomalies as vector departures from climatology:

- Compute component anomalies `U' = U_obs − U_climo` and `V' = V_obs − V_climo`
- Compute the magnitude of the anomaly vector as `|V'| = sqrt(U'² + V'²)`

The shaded field is **positive-definite**. It does not indicate stronger vs weaker than normal in a signed scalar sense; instead it measures the size of the departure from the climatological flow vector. When vectors or barbs are enabled on this map, they show the anomaly components `(U', V')`, not the actual observed wind.

Use this when the main question is circulation: monsoon onset, cross-equatorial flow, directional shifts, displaced jets, anomalous inflow, or broad pattern changes.

For example, if the climatological 850 mb wind is weak easterly and the observed wind is strong southwesterly, the wind anomaly emphasizes the anomalous southwesterly flow rather than only asking whether the wind speed was faster or slower than normal.

---

## 10. How is the standard deviation (sigma) calculated?

For R2 climatology, PyRe computes sigma **itself** from the raw R2 time series — it is not pre-fetched from a file.

- For each calendar day (or month), PyRe fetches 30 individual years of that day/month from R2 (1991–2020).
- The mean and sample standard deviation (ddof=1) are computed across those 30 values at each grid point.
- **ddof=1** (sample standard deviation) is used because we have a finite 30-year sample, not the full population of all possible climate states.

**Do the R2 files contain pre-computed sigma?** No. The PSL THREDDS long-term mean (LTM) files contain only the mean field and a `valid_yr_count` variable — no sigma. PyRe computes R2 sigma from scratch and caches the result after the first request.

The same is true of the R1 4×-daily per-hour files used for 3-hourly baselines: mean only, no sigma. Computing a per-hour sigma would mean assembling 30 years of data separately for each analysis hour, which is why 3-hourly normalized maps are not offered.

Legend: ✅ PyRe does this already · ☐ in progress · ⚠️ possible, not wired yet · ❌ not available from that source/path.

Actual upstream source data:

| Source data | What the upstream source actually provides | Used as observation data? | Climo mean from source? | Climo sigma from source? | Anomaly path | Normalized anomaly path |
|---|---|---:|---:|---:|---|---|
| CORe 3-hourly `pgb` / `flx` files | Real analysis/forecast-background fields every 3 hours | ✅ | ❌ | ❌ | ✅ Fetch selected synoptic hour(s), then subtract a separate climatology | ⚠️ Observation side only; normalized maps require a separate climatology sigma at matching cadence |
| CORe monthly archive | Yearly monthly mean pressure-level fields | ✅ | ⚠️ Samples only | ❌ | ✅ Use as monthly observations; for climatology, compute/cache a 30-year monthly mean where wired | ✅ Compute/cache sample sigma from the monthly archive samples where wired |
| R1 4×-daily LTM | Long-term mean for each calendar day at 00/06/12/18z | ❌ | ✅ | ❌ | ✅ Per-hour anomaly baseline for wired variables; 03/09/15/21z interpolate neighboring means | ❌ No sigma in these files |
| R2 daily files | Annual daily fields | ❌ | ⚠️ Samples only | ❌ | ✅ Compute/cache 1991–2020 calendar-day mean | ✅ Compute/cache 1991–2020 calendar-day sample sigma |
| R2 monthly files | Monthly time series | ❌ | ⚠️ Samples only | ❌ | ✅ Compute/cache 1991–2020 calendar-month mean | ✅ Compute/cache 1991–2020 calendar-month sample sigma |
| CFSR daily files | Candidate daily baseline source | ❌ | ⚠️ Candidate only | ⚠️ Candidate only | ⚠️ Decide, wire, validate, cache means | ⚠️ Decide, wire, validate, cache sigma |

PyRe-derived products and caches:

| Derived product/cache | Built from | What it is | Status | Anomaly path | Normalized anomaly path |
|---|---|---|---:|---|---|
| Daily observation composite | CORe 3-hourly files | Mean of selected synoptic hours, currently 00/06/12/18z for daily mode | ✅ | ✅ Subtract daily climatology, usually `r2-daily` | ✅ Divide by daily climatology sigma, usually `r2-daily` |
| Monthly observation fallback | CORe 3-hourly files | Monthly mean computed from synoptic fields when the CORe monthly archive is missing | ✅ | ✅ Observation side only; still needs a monthly climatology source | ✅ Observation side only; still needs monthly climatology sigma |
| R2 daily climo cache | R2 daily files | Calendar-day mean and sample sigma, computed from 1991–2020 | ✅ | ✅ Mean field used as daily/sub-monthly baseline | ✅ Sigma field used for normalized maps |
| R2 daily centered 15-day PWAT climo cache | R2 daily climo cache | Pooled mean/sigma across the target calendar day ±7 days, 1991–2020 | ✅ | ✅ Current single-hour PWAT anomaly/climatology baseline | ✅ Current single-hour PWAT normalized baseline |
| R2 monthly climo cache | R2 monthly files | Calendar-month mean and sample sigma, computed from 1991–2020 | ✅ | ✅ Mean field used as monthly baseline | ✅ Sigma field used for normalized maps |
| CORe monthly climo cache | CORe monthly archive | Calendar-month mean and sample sigma from monthly archive samples | ✅ where wired | ✅ Mean field used as monthly pressure-level baseline | ✅ Sigma field used for normalized monthly maps |
| CORe-native daily climo cache | CORe 3-hourly files | Calendar-day means/sigmas from 30 years of CORe daily composites | ⚠️ | ⚠️ Would provide same-dataset daily anomaly baselines | ⚠️ Would provide same-dataset daily normalized baselines |
| CORe-native 3-hourly climo cache | CORe 3-hourly files | Calendar-day + synoptic-hour means/sigmas from 30 years of CORe | ⚠️ | ⚠️ Would provide true per-hour anomaly baselines | ⚠️ Would provide true per-hour normalized baselines |

Currently wired single-level / FLX-side fields with R2 daily/monthly baselines are 2m temperature, 10m wind, MSLP, PWAT, and OLR. Those baselines support daily and monthly normalized maps. PWAT also supports single-hour normalized maps through the R2 daily centered 15-day baseline.

---

## 11. Why does PyRe mask low wind speeds on normalized anomaly maps?

A normalized anomaly of +5σ at 850mb is meaningless if the actual wind speed is 3 m/s. The background flow is essentially calm — there is no jet or meaningful circulation to be anomalous. The σ denominator can be very small in regions of weak climatological flow, producing inflated sigma values that look dramatic but carry no physical significance.

PyRe applies a **level-dependent absolute value threshold** for wind speed normalized anomaly maps: grid points where the observed wind speed is below the threshold are masked to NaN before rendering.

| Level (mb) | Threshold (m/s) | Rationale |
|---|---|---|
| 250 | 20.0 | Jet core; below this is summer background noise |
| 300 | 20.0 | |
| 400 | 18.0 | |
| 500 | 15.0 | |
| 600 | 14.0 | |
| 700 | 12.0 | |
| 850 | 12.0 | LLJ threshold; below this is weak background flow |
| 925 | 8.0 | |
| 1000 | 8.0 | |

Other variables (temperature, height, humidity) do not require this masking — their anomalies are physically meaningful at any value.

---

## 12. Why does CORe produce better maps than what PSL was showing?

| Attribute | PSL (R1) | PyRe (CORe) |
|---|---|---|
| Grid resolution | ~2.5° (~275 km) | 0.703° (~78 km) |
| Coverage | 1948–March 2026 | 1950s–present (near real-time) |
| Spectral truncation | T62 | Significantly higher |
| Current? | Discontinued | Active and updating |

The practical effect: features like the low-level jet (LLJ), frontal boundaries, and upper-level troughs are positioned more accurately at 0.703° than at 2.5°. A wind maximum that appears 200–300 km north of where you expect it on PSL's map may be correct at CORe's resolution. That is not an error — it is better data.

---

## 13. My CORe map looks different from the old PSL map for the same date. Which is right?

CORe, almost certainly. The differences are usually explained by:

1. **Resolution**: 0.703° vs 2.5° — PSL was averaging over grid boxes roughly 13× larger in area. Fine-scale features (LLJ cores, jet streaks, moisture plumes) were smeared.
2. **Different reanalysis system**: R1 and CORe use different data assimilation schemes, model backgrounds, and observational inputs. They are not expected to produce identical fields.
3. **Improved observational coverage**: CORe incorporates more recent observational datasets and better quality control even when retrospectively applied.

The best independent validation for a specific historical date is **ERA5** (ECMWF, 0.25°, available free via Copernicus CDS) or the **SPC mesoanalysis archive** (observationally based, available for events back to the early 2000s at spc.noaa.gov).

---

## 14. What data sources are researchers actually using for case studies?

This varies by event date and paper vintage:

| Product | Resolution | Coverage | Use Case |
|---|---|---|---|
| **ERA5** | 0.25° | 1940–present | Current gold standard for CONUS case studies; most post-2020 severe weather papers |
| **NARR** | ~32 km | 1979–2021 | North American Regional Reanalysis; widely cited in older severe wx literature |
| **CORe** | 0.703° | 1950–present | What PyRe uses; coarser than ERA5, but reaches back to 1950 and is still updating |
| **NAM/GFS archived analyses** | 12–4 km | ~2004–present | Operational analysis grids from NCEI; used for real-time event reconstruction |
| **HRRR** | ~3 km | 2014–present (operational) | High-resolution convective-scale; NOT available for pre-2014 events |

**Important**: If a paper or talk about a pre-2014 event (like the April 27, 2011 Super Outbreak) references HRRR, it is almost certainly either a hindcast (a model re-run using the HRRR configuration, which is a specialized research product) or a misidentified product. HRRR operational archives begin around 2014–2016.

For the 2011 Super Outbreak, researchers most commonly use ERA5 or NARR. CORe at 0.703° is coarser than either, so it is well suited to the synoptic pattern — the trough, the jet, the moisture return — and less suited to fine mesoscale structure. Use ERA5 or NARR when the question is about storm-scale detail.

---

## 15. What is the R2 daily climatology, specifically?

For a given calendar day (e.g., April 27), the R2 daily climatology is computed as follows:

1. The matching calendar day is fetched from each of the 30 climo years.
2. All 30 individual daily fields are fetched concurrently from PSL's THREDDS OPeNDAP server.
3. The mean and sample standard deviation (ddof=1) are computed at each grid point across those 30 samples.
4. Results are cached to disk after the first computation.

The R2 daily climatology is the current baseline for daily anomaly and normalized anomaly maps. Daily composites currently average the four primary synoptic times, 00z/06z/12z/18z, to preserve the traditional daily-mean workflow without doubling request volume. Single-hour anomaly maps usually use R1 4×-daily means instead, because a per-hour baseline avoids day-night artifacts. Single-hour normalized maps are blocked because the per-hour baseline has no sigma. Using a monthly mean as the baseline for a daily map inflates sigma artificially because it doesn't account for intra-month variability.

---

## 16. Why is there no R2 February 29 climatology entry?

The R2 daily climatology uses 1991–2020. Not every year has Feb 29. PyRe maps leap day observations (Feb 29) to Feb 28 for the purpose of climatology lookup. This is standard practice and introduces negligible error.

---

## 17. What does the wind overlay show and does it cost extra fetches?

The wind overlay draws vectors, barbs, or isotachs (labeled speed contours) on top of any scalar field. It requires U and V wind components, taken **at the map's own level** — 10m winds for surface/single-level fields — and the map title states which (e.g. "850mb Wind Barbs", "10m Wind Barbs").

**On composite maps**: the overlay is the **vector-mean wind over the same dates/hours as the composite** — each of U and V is averaged across the selection, then drawn. Where wind direction varies between the composited times, the mean barb is shorter than any single day's wind; that's the correct composite, not a bug.

**Fetch accounting**: every (date, synoptic hour) is its own GRIB file. A 3-day daily-mean composite touches 3 × 4 = 12 files — one `.idx` fetch plus byte-range requests for just the needed records per file, run concurrently. When the mapped variable is already wind speed, U and V are fetched once and reused for the overlay — no additional requests. On any other variable, the overlay is a second fetch pass. Sub-monthly records are *not* disk-cached (monthly slices and all climatology are), so repeating one of those days re-fetches it.

**Isotachs**: contour the full-resolution speed field `sqrt(U²+V²)` every 20 kt starting at 30 kt (10 m/s / 15 m/s in metric); the density setting only affects barbs/vectors.

**On Vector Wind Anomaly maps**: the overlay shows anomaly vectors/barbs, `(U_obs − U_climo, V_obs − V_climo)`. The arrows can point opposite the actual wind if the observed flow is weaker than the climatological flow.

**On Raw and Normalized maps**: the overlay shows the actual observed/composite wind components unless a future mode explicitly says otherwise.

---

## 18. What does "surgical byte-range extraction" mean?

PyRe never downloads an entire GRIB2 file. Instead:

1. It fetches the `.idx` index file (a few KB) which lists byte offsets for every field in the GRIB2.
2. It issues an HTTP `Range: bytes=start-end` request to retrieve only the bytes for the needed field(s).
3. The bytes are decoded in memory by cfgrib. No disk I/O.

This is the same technique NOMADS uses internally and what enables PyRe to respond quickly even for large files.

---

## 19. Where is data cached and why?

Climatology data is cached to disk on the server after the first computation. This includes R2 daily climatology and R2 monthly climatology; monthly PGB climatology has its own retrieval path. Caching is appropriate because:

- Climatology values are the same regardless of who requests them — they only depend on calendar day/month and variable.
- The first computation takes 2–10 seconds (30 concurrent OPeNDAP requests); subsequent requests are instant.
- Offloading to Redis or S3 would add network latency with no benefit at single-server scale for a scientific tool with modest concurrent users.

Observation data (CORe fields) is **not** disk-cached — it updates on a 3-hourly cycle and is already fast due to byte-range extraction.

---

## 20. Should PyRe pre-compute all climatology files in advance or compute on demand?

**Short answer: pre-compute. Run the batch script once.**

The lazy disk cache (compute on first request, save to disk) works but means the first user to request a cold combination (e.g., temperature at 300mb on February 14) waits 5–10 seconds. This is fine for development but poor for shared use.

`backend/scripts/precompute_climo.py` pre-populates the entire cache. It uses a smarter bulk-load approach for daily climatology: instead of making 30 separate OPeNDAP requests per day-of-year (the on-demand path), it loads all 30 years of one variable+level in parallel (~15 MB each), then computes all 365 calendar days in memory. This reduces the total number of remote requests by ~365× for each variable/level combination.

**Runtime estimates** (PSL THREDDS OPeNDAP bandwidth limited, not compute limited):

| Mode | Combinations | Estimated time |
|---|---|---|
| Monthly | 16 levels x 6 vars x 12 months = 1,152 | ~1-2 hours |
| Daily | 16 levels x 6 vars, 1 bulk load each | ~2-4 hours |

```bash
cd backend
uv run python scripts/precompute_climo.py --mode monthly   # do this first
uv run python scripts/precompute_climo.py --mode daily     # run overnight
```

The script is resume-friendly — existing files are skipped. Use `--force` to regenerate.
The pre-computed files are in the same format the API already reads — no server restart or code changes needed once files are present.

**Deployment note:** These files (~500 MB total with compression) should be committed or transferred to the server before going live. Alternatively, run the script on the server before opening to users.

---

## 21. Why does the batch script use a 5-day window but the on-demand code uses 1 day per year?

The batch script computes a ±2 day window (5 samples per year × 30 years = **150 samples** per DOY). The on-demand code was written for simplicity and uses the exact date only (**30 samples** per DOY).

The 5-day window is how PSL computed their own LTM values. It is strictly better: more samples produce lower variance in the climatological mean and sigma estimates, which makes anomaly maps more accurate. Once the pre-computed files exist, all requests use the better 150-sample version automatically — the on-demand fallback is only reached for combinations the batch script hasn't covered yet.

---

## 22. What do the CAPE/CIN parcel options mean, and how do they compare to SPC's?

CORe publishes three CAPE records (and matching CIN), exposed in the Level selector:

- **Surface-based** — the parcel lifted from the surface (SBCAPE).
- **Mixed-layer (180-0 mb)** — the parcel built from the lowest 180 mb of the atmosphere. Note that SPC mesoanalysis mixed-layer products use a **100 mb** layer, so values are not directly comparable.
- **Most-unstable (255-0 mb)** — NCEP's "best" CAPE, drawn from the lowest 255 mb; this is the conventional MUCAPE proxy in NCEP products and captures elevated instability that surface-based CAPE misses (e.g. north of a warm front).

Labels state the layer depths explicitly so maps are honest about which definition is plotted.

---

## 23. Why does PyRe's MSLP look weaker than GFS maps over the Rockies in summer?

"Sea-level pressure" over high terrain is an extrapolation, and different reduction methods disagree most under strong surface heating. A concrete comparison for July 7 2026 18z (the Colorado thermal low):

| Field | Heat-low minimum |
|---|---|
| CORe `PRES:mean sea level` | 1011 mb |
| CORe `MSLET:mean sea level` (Eta/membrane reduction — **what PyRe plots**) | 1007.5 mb |
| GFS PRMSL (Shuell reduction — what Tropical Tidbits/Pivotal plot) | ~1002 mb |

PyRe plots MSLET, the closest GFS-comparable reduction CORe publishes (CORe has no PRMSL). Two residual differences remain: PRMSL's Shuell reduction is known to deepen (arguably exaggerate) summer heat lows over elevated terrain, and CORe is an **ensemble mean** at T170 (~0.7°) while the GFS analysis is a single 0.25° field — averaging members smooths extremes. Expect PyRe heat lows to run a few mb weaker than PRMSL-based maps; highs and oceanic lows agree closely.

---

## 24. Why do daily maps average only 00z/06z/12z/18z when CORe has data every 3 hours?

Two reasons, and the first is the one that matters.

**Like-for-like anomalies.** The daily climatology baseline (the NCEP R2 daily normal that a daily anomaly subtracts) is itself built from the four synoptic analysis times: 00z, 06z, 12z, and 18z. PyRe's daily observation average uses the same four times, so the anomaly compares two quantities constructed the same way. Averaging all eight 3-hourly times against a four-time baseline would add a small systematic offset wherever the daily cycle is asymmetric — temperature especially.

**Cost.** Four fetches instead of eight.

An eight-time daily mean is still available: request a 3-hourly range from 00z through 21z of one day. Its anomaly compares each of the eight times against the normal for that specific hour (the R1 4×-daily baseline) instead of the R2 daily normal, so it is close to — but not identical to — the standard daily anomaly. The same weather requested both ways can differ slightly because the two baselines come from different reanalysis datasets.

## 25. What does an "anomaly" of a composite show?

Exactly what it sounds like, once you know both halves. The observation side averages the selected grids — 4 synoptic times for a daily map, every 3-hourly step for a range, the chosen hour(s) × dates for a slice. The climatology side averages the *matching normals*: each selected time is paired with the 30-year normal for its own calendar day (and, for 3-hourly selections, its own hour). The map is the first average minus the second.

That is mathematically identical to computing each individual time's anomaly and averaging those — subtraction and averaging commute. So "the anomaly of a composite" and "the composite of the anomalies" are the same map.

## 26. Which climatology dataset is the baseline — R1, R2, or CORe?

It depends on the map's time scale, because different datasets publish (or allow us to compute) normals at different granularities:

| Map | Baseline | Who averaged the 30 years |
|---|---|---|
| 3-hourly (single, range, list, slice) | NCEP R1 4×-daily normals | NOAA — published finished files, one per day and hour |
| Daily composite | NCEP R2 daily normals | PyRe — computed from R2's daily series and cached |
| Monthly | R2 monthly normals (older shared links that requested CORe's own monthly means still render with them) | PyRe — from the 1991–2020 monthly files |
| PWAT single-hour | R2 daily centered 15-day mean/σ | PyRe — following the WPC standardized-anomaly convention (see the normalized-anomaly section) |

Two consequences worth knowing. First, R1's files hold only 00/06/12/18z; the in-between hours (03/09/15/21z) are the blend of the two neighboring normals, so a 21z baseline is half 18z and half the next day's 00z. Second, because the daily and 3-hourly baselines come from two different reanalyses, the same weather requested as a daily composite and as an 8-step 3-hourly range produces close but not identical anomalies — part sampling difference, part R1-versus-R2 difference.

---

*Last updated: 2026-09-04 — add new Q&A pairs at the appropriate level as they arise.*
