# PyRe — Frequently Asked Questions

A living reference covering data sources, methods, and scientific design decisions.
Organized from foundational concepts to more technical detail.
Add new Q&A pairs at the appropriate level as they come up.

---

## 1. What is PyRe?

PyRe is a community-built replacement for the NOAA/PSL interactive reanalysis composite pages that stopped updating in March 2026 when the underlying NCEP Reanalysis dataset was discontinued. PSL has no plans to rebuild the interface for the successor dataset. PyRe replicates the three PSL interfaces:

- **Monthly/Seasonal Composites** — composite means over one or more calendar months
- **Daily Mean Composites** — average of one or more calendar days across all synoptic times
- **6-Hourly Composites** — a single synoptic time (00/06/12/18z) or averaged across a date list

---

## 2. What happened to the old PSL reanalysis pages?

The PSL composite tools were built on **NCEP Reanalysis 1** (R1), a global retrospective analysis that ran from 1948 through March 2026. When NCEP discontinued R1 as the operational product and replaced it with CORe (Climate-Ocean Reanalysis), the PSL interface was not updated. PSL's existing pages are archived but show no data after March 2026.

---

## 3. What data does PyRe use for observations (the actual maps)?

PyRe uses **CORe — Climate-Ocean Reanalysis** from NCEP/CPC.

- **Resolution**: 0.25° × 0.25° (~28 km at mid-latitudes) — roughly 10× finer than R1
- **Temporal coverage**: Back to the 1950s; updated in near-real-time
- **Format**: GRIB2 ensemble mean files; PyRe fetches data surgically using HTTP byte-range requests (no full file downloads)
- **Naming**: `core.{YYYYMMDD}.t{HH}z.pgrb2.0p25.f000.grib2`

CORe is the designated successor to R1/R2 for NCEP operational reanalysis products.

---

## 4. Can I use R2 (NCEP Reanalysis 2) for the actual map data?

**No.** In PyRe, R2 is used *exclusively* for the climatological baseline — the 30-year mean and standard deviation used to compute anomaly and normalized anomaly maps. R2 is never used as the source for the observation fields shown on raw or composite maps.

**Why not?** R2 was last updated in 2021 and has no near-real-time data. Its 2.5° spatial resolution is also significantly coarser than CORe's 0.25°. For any map showing what the atmosphere looked like on a specific date, CORe is the correct source.

---

## 5. So what IS R2 used for, and why?

R2 is used as the **climatology baseline** — the reference against which we measure anomalies.

- **For daily/6-hourly modes**: PyRe uses R2 **daily** climatologies — the mean and standard deviation of each calendar day (e.g., April 27) computed across 30 years (1991–2020). This gives a day-specific baseline that captures the seasonal cycle correctly.
- **For monthly modes**: PyRe uses R2 **monthly** climatologies — the mean and standard deviation of each calendar month across the same 30 years. A single strided OPeNDAP request fetches all 30 years of a given month in one round-trip.

**Why R2 for climatology instead of CORe?** CORe is still relatively new and does not yet have a long enough archive (30 years of continuous data) to compute a statistically robust climatology. R2 covers 1979–present with a stable, well-documented methodology, making it the best currently available source for a 1991–2020 baseline.

---

## 6. What variables are available?

| Variable | Description | Derived? |
|---|---|---|
| Wind Speed | Magnitude of horizontal wind | Yes — computed from U + V components |
| Temperature | Air temperature | No |
| Geopotential Height | Height of a pressure surface | No |
| Relative Humidity | RH (%) | Yes — derived from Specific Humidity + Temperature via Bolton formula |
| Specific Humidity | Water vapor mixing ratio | No |

All variables are available at 16 standard pressure levels: 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10 mb.

---

## 7. What map modes are available?

| Mode | What it shows |
|---|---|
| Raw | The actual observed/composite value of the field |
| Climatology | The 30-year mean for that calendar period — no observations fetched |
| Anomaly | obs − climo_mean |
| Normalized Anomaly | (obs − climo_mean) / climo_σ — expressed in standard deviations |

Anomaly and normalized anomaly maps require a climatology source.

---

## 8. How are wind anomalies defined?

PyRe distinguishes between two valid but different wind-anomaly diagnostics:

### Wind Speed Anomaly

This treats wind as a scalar magnitude field:

- Compute wind speed at each grid point as `|V| = sqrt(U² + V²)`
- Compute the climatological mean wind speed for the same calendar period
- Form the anomaly as `|V|_obs − |V|_climo`

This is a **signed scalar** anomaly. Positive values indicate stronger-than-normal wind speed; negative values indicate weaker-than-normal wind speed. It answers the question: how much faster or slower was the flow than climatology at this location?

Use this when the main question is intensity: low-level jet strength, trade-wind acceleration or weakening, upper-level jet streak strength, or general wind impacts.

### Vector Wind Anomaly

This treats wind as a vector field and preserves directional departures:

- Compute component anomalies `U' = U_obs − U_climo` and `V' = V_obs − V_climo`
- Compute the magnitude of the anomaly vector as `|V'| = sqrt(U'² + V'²)`

The shaded field is **positive-definite**. It does not indicate stronger vs weaker than normal in a signed scalar sense; instead it measures the size of the departure from the climatological flow vector. When vectors or barbs are enabled on this map, they show the anomaly components `(U', V')`, not the actual observed wind.

Use this when the main question is circulation: monsoon onset, cross-equatorial flow, directional shifts, displaced jets, anomalous inflow, or broad pattern changes.

These two products are not interchangeable. A circulation can have a small scalar speed anomaly but a large vector anomaly if the flow direction changes substantially.

For example, if the climatological 850 mb wind is weak easterly and the observed wind is strong southwesterly, the Vector Wind Anomaly will emphasize the anomalous southwesterly flow. A Wind Speed Anomaly will only say that the wind was faster than normal; it will not preserve the direction of the departure.

PyRe suggests a wind-anomaly type from the selected region and pressure level, but the user still chooses the diagnostic. Low-level tropical and monsoon regions usually default scientifically toward Vector Wind Anomaly. Upper-level jet diagnostics often start with Wind Speed Anomaly, while displaced or unusually directed jet flow may still be better diagnosed with Vector Wind Anomaly.

---

## 9. How is the standard deviation (sigma) calculated?

PyRe computes sigma **itself** from the raw R2 time series — it is not pre-fetched from a file.

- For each calendar day (or month), PyRe fetches 30 individual years of that day/month from R2 (1991–2020).
- The mean and sample standard deviation (ddof=1) are computed across those 30 values at each grid point.
- **ddof=1** (sample standard deviation) is used because we have a finite 30-year sample, not the full population of all possible climate states.

**Do the R2 files contain pre-computed sigma?** No. The PSL THREDDS long-term mean (LTM) files contain only the mean field and a `valid_yr_count` variable — no sigma. PyRe computes sigma from scratch each time (cached to disk after the first request).

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

The R2 daily climatology is the correct baseline for 6-hourly and daily mode anomaly/normalized maps. Using a monthly mean as the baseline for a daily map inflates sigma artificially because it doesn't account for intra-month variability.

---

## 15. Why is there no R2 February 29 climatology entry?

The R2 daily climatology uses 1991–2020. Not every year has Feb 29. PyRe maps leap day observations (Feb 29) to Feb 28 for the purpose of climatology lookup. This is standard practice and introduces negligible error.

---

## 16. What does the wind overlay show and does it cost extra fetches?

The wind overlay draws vectors or barbs on top of any scalar field. It requires U and V wind components.

**When the mapped variable is already wind speed**: PyRe fetches U and V once, derives wind speed as √(U²+V²), and reuses the same U/V arrays for the overlay — no additional network requests.

**When the mapped variable is something else** (e.g., temperature with a wind overlay): U and V are fetched separately as a second step.

**On Vector Wind Anomaly maps**: the overlay shows anomaly vectors/barbs, `(U_obs − U_climo, V_obs − V_climo)`. The arrows can point opposite the actual wind if the observed flow is weaker than the climatological flow.

**On Wind Speed Anomaly, Raw, and Normalized maps**: the overlay shows the actual observed/composite wind components unless a future mode explicitly says otherwise.

---

## 17. What does "surgical byte-range extraction" mean?

PyRe never downloads an entire GRIB2 file. Instead:

1. It fetches the `.idx` index file (a few KB) which lists byte offsets for every field in the GRIB2.
2. It issues an HTTP `Range: bytes=start-end` request to retrieve only the bytes for the needed field(s).
3. The bytes are decoded in memory by cfgrib. No disk I/O.

This is the same technique NOMADS uses internally and what enables PyRe to respond quickly even for large files.

---

## 18. Where is data cached and why?

Climatology data (R2 daily and monthly means/sigmas) is cached to disk on the server after the first computation. This is appropriate because:

- Climatology values are the same regardless of who requests them — they only depend on calendar day/month and variable.
- The first computation takes 2–10 seconds (30 concurrent OPeNDAP requests); subsequent requests are instant.
- Offloading to Redis or S3 would add network latency with no benefit at single-server scale for a scientific tool with modest concurrent users.

Observation data (CORe fields) is **not** disk-cached — it changes every 6 hours and is already fast due to byte-range extraction.

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

*Last updated: 2026-05-10 — add new Q&A pairs at the appropriate level as they arise.*
