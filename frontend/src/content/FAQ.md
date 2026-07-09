# PyRe — Frequently Asked Questions

A living reference covering data sources, methods, and scientific design decisions.
Organized from foundational concepts to more technical detail.
Add new Q&A pairs at the appropriate level as they come up.

---

## 1. What is PyRe?

PyRe is a community-built replacement for the NOAA/PSL interactive reanalysis composite pages that stopped updating in March 2026 when the underlying NCEP Reanalysis dataset was discontinued. PSL has no plans to rebuild the interface for the successor dataset. PyRe replicates the three PSL interfaces:

- **Monthly/Seasonal Composites** — composite means over one or more calendar months
- **Daily Mean Composites** — average of one or more calendar days across 00z/06z/12z/18z
- **3-Hourly Composites** — a single analysis time (00/03/06/09/12/15/18/21z) or averaged across a date list

---

## 2. What happened to the old PSL reanalysis pages?

The PSL composite tools were built on **NCEP Reanalysis 1** (R1), a global retrospective analysis that ran from 1948 through March 2026. When NCEP discontinued R1 as the operational product and replaced it with CORe (Climate-Ocean Reanalysis), the PSL interface was not updated. PSL's existing pages are archived but show no data after March 2026.

---

## 3. What data does PyRe use for observations (the actual maps)?

PyRe uses **CORe — Climate-Ocean Reanalysis** from NCEP/CPC.

- **Resolution**: 0.25° × 0.25° (~28 km at mid-latitudes) — roughly 10× finer than R1
- **Temporal coverage**: January 1, 1950 to near-real-time
- **Format**: GRIB2 ensemble mean files; PyRe fetches data surgically using HTTP byte-range requests (no full file downloads)
- **Naming**: `core.{YYYYMMDD}.t{HH}z.pgrb2.0p25.f000.grib2`

CORe is the designated successor to R1/R2 for NCEP operational reanalysis products.

---

## 4. Can I use R2 (NCEP Reanalysis 2) for the actual map data?

**No.** In PyRe, R2 is used *exclusively* for the climatological baseline — the 30-year mean and standard deviation used to compute anomaly and normalized anomaly maps. R2 is never used as the source for the observation fields shown on raw or composite maps.

**Why not?** R2 was last updated in 2021 and has no near-real-time data. Its 2.5° spatial resolution is also significantly coarser than CORe's 0.25°. For any map showing what the atmosphere looked like on a specific date, CORe is the correct source.

---

## 5. So what IS R2 used for, and why?

R2 is used as a **climatology baseline** — the reference against which we measure anomalies.

- **For daily and 3-hourly modes**: PyRe uses R2 **daily** climatologies — the mean and standard deviation of each calendar day (e.g., April 27) computed across 30 years (1991–2020). This gives a day-specific baseline that captures the seasonal cycle correctly.
- **For monthly modes**: PyRe can use either the CORe-era monthly PGB climatology source or R2 **monthly** climatologies, depending on the selected climatology source. Monthly baselines are calendar-month means and standard deviations.

**Why R2 for sub-monthly climatology instead of CORe?** CORe is still relatively new and does not yet have a full 30-year daily/3-hourly climatology product wired into PyRe. R2 covers 1979–present with a stable, well-documented methodology, making it the best currently available 1991–2020 baseline for daily and 3-hourly anomaly maps.

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
| Precipitation Rate | Displayed mm/day | 0–3 h average forecast field, not instantaneous |
| Outgoing Longwave Radiation | ULWRF at top of atmosphere | 0–3 h average forecast field |
| CAPE / CIN | Three parcel variants each — see Q21 | Raw maps only |
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
| 3-hourly / single synoptic time | CORe field for the selected date and hour | R2 daily climatology for that calendar day | `obs - climo_mean` |
| 3-hourly composite | CORe fields for multiple dates at the same selected hour | Mean of matching R2 daily climatologies | `composite - climo_mean` |
| Daily | CORe average across selected daily hours, currently 00z/06z/12z/18z | R2 daily climatology for that calendar day | `daily_mean - climo_mean` |
| Daily composite | CORe average across dates and daily hours | Weighted/averaged matching R2 daily climatologies | `composite - climo_mean` |
| Monthly | CORe monthly field/composite | Monthly climatology from `monthly-pgb` or `r2-monthly` | `monthly_value - climo_mean` |
| Multi-month monthly | CORe monthly composite | Day-weighted mean of each month’s climatology | `monthly_composite - climo_mean` |
| Climatology | No observation fetched | Monthly climatology source | The climatological mean itself |

`Climatology` is a map mode, not an anomaly. It answers “what is normal for this month?” Anomaly and normalized anomaly answer “how different was this event or composite from normal?”

Before subtraction, PyRe interpolates the coarser climatology grid onto the CORe observation grid.

Specific humidity and surface/named-level starter fields currently support raw maps only. Their anomaly and climatology modes are intentionally disabled until suitable baselines are wired.

---

## 8. How are wind anomalies defined?

PyRe treats wind anomalies as vector departures from climatology:

- Compute component anomalies `U' = U_obs − U_climo` and `V' = V_obs − V_climo`
- Compute the magnitude of the anomaly vector as `|V'| = sqrt(U'² + V'²)`

The shaded field is **positive-definite**. It does not indicate stronger vs weaker than normal in a signed scalar sense; instead it measures the size of the departure from the climatological flow vector. When vectors or barbs are enabled on this map, they show the anomaly components `(U', V')`, not the actual observed wind.

Use this when the main question is circulation: monsoon onset, cross-equatorial flow, directional shifts, displaced jets, anomalous inflow, or broad pattern changes.

For example, if the climatological 850 mb wind is weak easterly and the observed wind is strong southwesterly, the wind anomaly emphasizes the anomalous southwesterly flow rather than only asking whether the wind speed was faster or slower than normal.

---

## 9. How is the standard deviation (sigma) calculated?

For R2 climatology, PyRe computes sigma **itself** from the raw R2 time series — it is not pre-fetched from a file.

- For each calendar day (or month), PyRe fetches 30 individual years of that day/month from R2 (1991–2020).
- The mean and sample standard deviation (ddof=1) are computed across those 30 values at each grid point.
- **ddof=1** (sample standard deviation) is used because we have a finite 30-year sample, not the full population of all possible climate states.

**Do the R2 files contain pre-computed sigma?** No. The PSL THREDDS long-term mean (LTM) files contain only the mean field and a `valid_yr_count` variable — no sigma. PyRe computes R2 sigma from scratch and caches the result after the first request.

---

## 10. Why does PyRe mask low wind speeds on normalized anomaly maps?

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

## 11. Why does CORe produce better maps than what PSL was showing?

| Attribute | PSL (R1) | PyRe (CORe) |
|---|---|---|
| Grid resolution | ~2.5° (~275 km) | 0.25° (~28 km) |
| Coverage | 1948–March 2026 | 1950s–present (near real-time) |
| Spectral truncation | T62 | Significantly higher |
| Current? | Discontinued | Active and updating |

The practical effect: features like the low-level jet (LLJ), frontal boundaries, and upper-level troughs are positioned more accurately at 0.25° than at 2.5°. A wind maximum that appears 200–300 km north of where you expect it on PSL's map may be correct at CORe's resolution. That is not an error — it is better data.

---

## 12. My CORe map looks different from the old PSL map for the same date. Which is right?

CORe, almost certainly. The differences are usually explained by:

1. **Resolution**: 0.25° vs 2.5° — PSL was averaging over grid boxes 10× larger. Fine-scale features (LLJ cores, jet streaks, moisture plumes) were smeared.
2. **Different reanalysis system**: R1 and CORe use different data assimilation schemes, model backgrounds, and observational inputs. They are not expected to produce identical fields.
3. **Improved observational coverage**: CORe incorporates more recent observational datasets and better quality control even when retrospectively applied.

The best independent validation for a specific historical date is **ERA5** (ECMWF, 0.25°, available free via Copernicus CDS) or the **SPC mesoanalysis archive** (observationally based, available for events back to the early 2000s at spc.noaa.gov).

---

## 13. What data sources are researchers actually using for case studies?

This varies by event date and paper vintage:

| Product | Resolution | Coverage | Use Case |
|---|---|---|---|
| **ERA5** | 0.25° | 1940–present | Current gold standard for CONUS case studies; most post-2020 severe weather papers |
| **NARR** | ~32 km | 1979–2021 | North American Regional Reanalysis; widely cited in older severe wx literature |
| **CORe** | 0.25° | 1950s–present | What PyRe uses; comparable resolution to ERA5 |
| **NAM/GFS archived analyses** | 12–4 km | ~2004–present | Operational analysis grids from NCEI; used for real-time event reconstruction |
| **HRRR** | ~3 km | 2014–present (operational) | High-resolution convective-scale; NOT available for pre-2014 events |

**Important**: If a paper or talk about a pre-2014 event (like the April 27, 2011 Super Outbreak) references HRRR, it is almost certainly either a hindcast (a model re-run using the HRRR configuration, which is a specialized research product) or a misidentified product. HRRR operational archives begin around 2014–2016.

For the 2011 Super Outbreak, researchers most commonly use ERA5 or NARR. CORe at 0.25° is directly comparable to ERA5 in resolution and appropriate for that validation.

---

## 14. What is the R2 daily climatology, specifically?

For a given calendar day (e.g., April 27), the R2 daily climatology is computed as follows:

1. The 5-day window centered on April 27 (April 25–29) is used for each of the 30 climo years — this adds samples and smooths day-to-day noise.
2. All 30 × 5 = 150 individual daily fields are fetched concurrently from PSL's THREDDS OPeNDAP server.
3. The mean and sample standard deviation (ddof=1) are computed at each grid point across those 150 samples.
4. Results are cached to disk after the first computation.

The R2 daily climatology is the correct baseline for 3-hourly and daily mode anomaly/normalized maps. Daily composites currently average the four primary synoptic times, 00z/06z/12z/18z, to preserve the traditional daily-mean workflow without doubling request volume. Using a monthly mean as the baseline for a daily map inflates sigma artificially because it doesn't account for intra-month variability.

---

## 15. Why is there no R2 February 29 climatology entry?

The R2 daily climatology uses 1991–2020. Not every year has Feb 29. PyRe maps leap day observations (Feb 29) to Feb 28 for the purpose of climatology lookup. This is standard practice and introduces negligible error.

---

## 16. What does the wind overlay show and does it cost extra fetches?

The wind overlay draws vectors or barbs on top of any scalar field. It requires U and V wind components.

**When the mapped variable is already wind speed**: PyRe fetches U and V once, derives wind speed as `sqrt(U²+V²)`, and reuses the same U/V arrays for the overlay — no additional network requests.

**When the mapped variable is something else** (e.g., temperature with a wind overlay): U and V are fetched separately as a second step.

**On Vector Wind Anomaly maps**: the overlay shows anomaly vectors/barbs, `(U_obs − U_climo, V_obs − V_climo)`. The arrows can point opposite the actual wind if the observed flow is weaker than the climatological flow.

**On Raw and Normalized maps**: the overlay shows the actual observed/composite wind components unless a future mode explicitly says otherwise.

---

## 17. What does "surgical byte-range extraction" mean?

PyRe never downloads an entire GRIB2 file. Instead:

1. It fetches the `.idx` index file (a few KB) which lists byte offsets for every field in the GRIB2.
2. It issues an HTTP `Range: bytes=start-end` request to retrieve only the bytes for the needed field(s).
3. The bytes are decoded in memory by cfgrib. No disk I/O.

This is the same technique NOMADS uses internally and what enables PyRe to respond quickly even for large files.

---

## 18. Where is data cached and why?

Climatology data is cached to disk on the server after the first computation. This includes R2 daily climatology and R2 monthly climatology; monthly PGB climatology has its own retrieval path. Caching is appropriate because:

- Climatology values are the same regardless of who requests them — they only depend on calendar day/month and variable.
- The first computation takes 2–10 seconds (30 concurrent OPeNDAP requests); subsequent requests are instant.
- Offloading to Redis or S3 would add network latency with no benefit at single-server scale for a scientific tool with modest concurrent users.

Observation data (CORe fields) is **not** disk-cached — it updates on a 3-hourly cycle and is already fast due to byte-range extraction.

---

## 19. Should PyRe pre-compute all climatology files in advance or compute on demand?

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

## 20. Why does the batch script use a 5-day window but the on-demand code uses 1 day per year?

The batch script computes a ±2 day window (5 samples per year × 30 years = **150 samples** per DOY). The on-demand code was written for simplicity and uses the exact date only (**30 samples** per DOY).

The 5-day window is how PSL computed their own LTM values. It is strictly better: more samples produce lower variance in the climatological mean and sigma estimates, which makes anomaly maps more accurate. Once the pre-computed files exist, all requests use the better 150-sample version automatically — the on-demand fallback is only reached for combinations the batch script hasn't covered yet.

---

## 21. What do the CAPE/CIN parcel options mean, and how do they compare to SPC's?

CORe publishes three CAPE records (and matching CIN), exposed in the Level selector:

- **Surface-based** — the parcel lifted from the surface (SBCAPE).
- **Mixed-layer (180-0 mb)** — the parcel built from the lowest 180 mb of the atmosphere. Note that SPC mesoanalysis mixed-layer products use a **100 mb** layer, so values are not directly comparable.
- **Most-unstable (255-0 mb)** — NCEP's "best" CAPE, drawn from the lowest 255 mb; this is the conventional MUCAPE proxy in NCEP products and captures elevated instability that surface-based CAPE misses (e.g. north of a warm front).

Labels state the layer depths explicitly so maps are honest about which definition is plotted.

---

*Last updated: 2026-07-08 — add new Q&A pairs at the appropriate level as they arise.*
