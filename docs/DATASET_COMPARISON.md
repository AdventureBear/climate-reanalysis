# R1 vs R2 vs CORe: what each dataset actually contains

Checked against the live servers in July 2026. Sources:

- **R1** and **R2**: the PSL THREDDS `Dailies` catalogs (`ncep.reanalysis`, `ncep.reanalysis2`).
- **CORe**: the operational GRIB index files, `pgb` (pressure levels) and `flx` (surface), read from a real analysis time.

An X means the dataset publishes that field. A blank means it does not.

---

## At a glance

| Dataset | Covers | Still growing? | Latest data available | Normals available | Last checked |
|---|---|---|---|---|---|
| **R1** (NCEP/NCAR Reanalysis 1) | 1948 onward | No, retired | 17 Mar 2026 | Hourly, daily, monthly — all on a fixed 1991–2020 base period | 27 Jul 2026 |
| **R2** (NCEP/DOE Reanalysis 2) | 1979 onward | No, stopped | 28 Feb 2026 | None published. PyRe computes them from 30 years of raw files | 27 Jul 2026 |
| **CORe** (Climate-Ocean Reanalysis) | 1950 onward | Yes, updated daily | 29 Jul 2026 (3-hourly) | Monthly means only, and the latest is **Dec 2025**. Nothing daily or hourly | 27 Jul 2026 |

You were right about CORe: the monthly archive stops at December 2025. January 2026 onward returns nothing. So CORe's own monthly normals are seven months behind its observations, which are current to yesterday.

Both older datasets stopped this spring, within weeks of each other. Their normals are frozen on the 1991–2020 period, which does not change as time passes, so they stay usable as baselines even though no new observations arrive.

---

## The part that matters most: normals

"Normals" means the 30-year average used as the comparison baseline for anomaly maps. This is a different question from "does the dataset have this variable," and it is the reason PyRe mixes datasets.

| Normals product | R1 | R2 | CORe |
|---|:--:|:--:|:--:|
| Per synoptic hour (00/06/12/18z) | X | | |
| Per calendar day | X | | |
| Per calendar month | X | | X |
| Standard deviation published with the mean | | | |

**R1 is the only dataset that publishes ready-made normals.** It ships them at three time scales: hourly, daily, and monthly. Counted in the catalogs: 138 hourly files, 298 daily files, 204 monthly files.

**R2 publishes no normals at all.** It publishes the raw yearly data and monthly means per month. PyRe builds R2 normals itself by fetching 30 individual years and averaging them.

**CORe publishes monthly means per month**, from which PyRe builds 30-year monthly normals (the `monthly-pgb` source). It publishes nothing daily or hourly.

**Nobody publishes a standard deviation.** PyRe can only get one by computing it from 30 years of raw data, which is why normalized maps exist for daily and monthly but not for a single hour.

### So why does PyRe use R2 for daily normals when R1 has them ready?

Two reasons, and only the second is about availability:

1. R2 is the newer dataset. R1 was discontinued.
2. Normalized maps need a standard deviation. R1's ready-made normals contain only the average. Computing from R2's raw years gives the average and the standard deviation together.

Hourly is the exception: no dataset publishes hourly raw data we can compute from (R2 has no sub-daily files at all), so R1's ready-made hourly averages are the only option, and hourly normalized maps are unavailable as a result.

---

## Upper-air variables (pressure levels)

| Field | R1 | R2 | CORe | Native names (R1 / R2 / CORe) |
|---|:--:|:--:|:--:|---|
| Temperature | X | X | X | air / air / TMP |
| Geopotential height | X | X | X | hgt / hgt / HGT |
| U wind | X | X | X | uwnd / uwnd / UGRD |
| V wind | X | X | X | vwnd / vwnd / VGRD |
| Vertical velocity | X | X | X | omega / omega / VVEL |
| Relative humidity | X | X | X | rhum / rhum / RH |
| Specific humidity | X | | X | shum / — / SPFH |
| Absolute vorticity | | | X | — / — / ABSV |
| Ozone mixing ratio | | | X | — / — / O3MR |
| Cloud water mixing ratio | | | X | — / — / CLLMR |
| Stream function | | | X | — / — / STRM |
| Velocity potential | | | X | — / — / VPOT |
| Potential vorticity | | | X | — / — / PVORT |
| Vertical wind shear | | | X | — / — / VWSH |

Grid spacing: R1 and R2 are 2.5 degrees (about 175 miles). CORe is 0.25 degrees (about 17 miles).

---

## Near-surface variables

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| 2m temperature | X | X | X | air.2m / air.2m / TMP 2m |
| Daily maximum 2m temperature | X | X | X | tmax.2m / tmax.2m / TMP 0-3h max |
| Daily minimum 2m temperature | X | X | X | tmin.2m / tmin.2m / TMP 0-3h min |
| 2m specific humidity | X | X | X | shum.2m / shum.2m / SPFH 2m |
| 2m dewpoint | | | X | — / — / DPT |
| 10m U wind | X | X | X | uwnd.10m / uwnd.10m / UGRD 10m |
| 10m V wind | X | X | X | vwnd.10m / vwnd.10m / VGRD 10m |
| 10m wind speed (direct) | | | X | — / — / WIND |
| Wind gust | | | X | — / — / GUST |
| Sea level pressure | X | X | X | slp / mslp / MSLET |
| Surface pressure | X | X | X | pres.sfc / pres.sfc / PRES |
| Skin temperature | X | X | X | skt / skt / TMP surface |
| Visibility | | | X | — / — / VIS |
| Boundary layer height | | | X | — / — / HPBL |
| Surface roughness | X | | X | sfcr / — / SFCR |
| Friction velocity | | | X | — / — / FRICV |

---

## Moisture and precipitation

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| Precipitable water | X | X | X | pr_wtr.eatm / pr_wtr.eatm / PWAT |
| Precipitation rate | X | X | X | prate / prate / PRATE |
| Convective precipitation rate | X | X | X | cprat / cprat / CPRAT |
| Categorical rain | | | X | — / — / CRAIN |
| Frozen precipitation percent | | | X | — / — / CPOFP |
| Cloud water (total column) | | | X | — / — / CWAT |
| Water equivalent snow depth | X | X | X | weasd / weasd / WEASD |
| Snow depth | | | X | — / — / SNOD |
| Snow cover | | | X | — / — / SNOWC |
| Snow melt heat flux | | | X | — / — / SNOHF |
| Sublimation | | | X | — / — / SBSNO |

---

## Cloud

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| Total cloud cover | X | X | X | tcdc.eatm / tcdc.eatm / TCDC |
| Cloud cover by layer (low/mid/high) | | | X | — / — / TCDC by layer |
| Convective cloud cover | | | X | — / — / TCDC convective |
| High cloud top/base pressure | X | X | | pres.hct, pres.hcb / same / — |
| Mid cloud top/base pressure | X | X | | pres.mct, pres.mcb / same / — |
| Low cloud top/base pressure | X | X | | pres.lct, pres.lcb / same / — |
| Sunshine duration | | | X | — / — / SUNSD |
| Cloud work function | | | X | — / — / CWORK |

---

## Radiation

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| Downward longwave, surface | X | X | X | dlwrf / dlwrf / DLWRF |
| Upward longwave, surface | X | X | X | ulwrf.sfc / ulwrf.sfc / ULWRF |
| Outgoing longwave, top of atmosphere | X | X | X | ulwrf.ntat / ulwrf.ntat / ULWRF toa |
| Downward shortwave, surface | X | X | X | dswrf.sfc / dswrf.sfc / DSWRF |
| Upward shortwave, surface | X | X | X | uswrf.sfc / uswrf.sfc / USWRF |
| Downward shortwave, top of atmosphere | X | X | X | dswrf.ntat / dswrf.ntat / DSWRF toa |
| Upward shortwave, top of atmosphere | X | X | X | uswrf.ntat / uswrf.ntat / USWRF toa |
| Clear-sky longwave down | X | | X | csdlf / — / CSDLF |
| Clear-sky shortwave down | X | | X | csdsf / — / CSDSF |
| Clear-sky shortwave up | X | | X | csusf / — / CSUSF |
| Clear-sky longwave up | | | X | — / — / CSULF |
| Beam and diffuse shortwave | X | | X | nbdsf, nddsf, vbdsf, vddsf / — / same |
| UV-B radiation | | | X | — / — / DUVB, CDUVB |
| Albedo | | | X | — / — / ALBDO |

---

## Surface fluxes

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| Latent heat flux | X | X | X | lhtfl / lhtfl / LHTFL |
| Sensible heat flux | X | X | X | shtfl / shtfl / SHTFL |
| Ground heat flux | X | X | X | gflux / gflux / GFLUX |
| Momentum flux, U and V | X | X | X | uflx, vflx / same / UFLX, VFLX |
| Gravity wave stress | X | X | | ugwd, vgwd / same / — |
| Potential evaporation | X | X | X | pevpr / pevpr / PEVPR |
| Runoff | X | X | X | runof / runof / SSRUN, WATR |
| Thermal conductivity | | | X | — / — / ACOND |
| Exchange coefficient | | | X | — / — / SFEXC |

---

## Land surface and soil

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| Soil temperature | X | | X | tmp.300cm / — / TSOIL (4 layers) |
| Soil moisture (volumetric) | | | X | — / — / SOILW (4 layers) |
| Soil moisture (total column) | | | X | — / — / SOILM |
| Liquid soil moisture | | | X | — / — / SOILL |
| Field capacity | | | X | — / — / FLDCP |
| Wilting point | | | X | — / — / WILT |
| Soil type | | | X | — / — / SOTYP, SLTYP |
| Vegetation fraction and type | | | X | — / — / VEG, VGTYP |
| Canopy water | | | X | — / — / CNWAT |
| Evaporation (bare soil, canopy) | | | X | — / — / EVBS, EVCW |
| Transpiration | | | X | — / — / TRANS |
| Land/sea mask | X | X | X | land / land / LAND |
| Sea ice concentration | X | X | X | icec / icec / ICEC |
| Sea ice thickness | | | X | — / — / ICETK |

---

## Stability and severe weather

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| CAPE (3 parcel types) | | | X | — / — / CAPE |
| CIN (3 parcel types) | | | X | — / — / CIN |
| Lifted index | X | | X | lftx.sfc, lftx4.sfc / — / LFTX, 4LFTX |
| Parcel lifted index | | | X | — / — / PLI |
| Pressure of lifting parcel | | | X | — / — / PLPL |
| Storm relative helicity | | | X | — / — / HLCY |
| Storm motion (U and V) | | | X | — / — / USTM, VSTM |
| Ventilation rate | | | X | — / — / VRATE |
| Brightness temperature | | | X | — / — / BRTEMP |
| Total ozone | | | X | — / — / TOZNE |
| Tropopause / max wind height | | | X | — / — / ICAHT |
| Montgomery stream function | | | X | — / — / MNTSF |

---

## Sigma-level variables (0.995 sigma, near ground)

| Field | R1 | R2 | CORe | Native names |
|---|:--:|:--:|:--:|---|
| Temperature | X | | X | air.sig995 / — / TMP 0.995 sigma |
| Potential temperature | X | | X | pottmp.sig995 / — / POT |
| Relative humidity | X | | X | rhum.sig995 / — / RH sigma layers |
| U and V wind | X | | X | uwnd.sig995, vwnd.sig995 / — / UGRD, VGRD 0.995 |
| Vertical velocity | X | | X | omega.sig995 / — / VVEL 0.995 |

---

## Summary

**CORe has the most variables by a wide margin.** 39 fields in the pressure files and 67 in the surface files, including everything needed for severe weather work (CAPE, CIN, helicity, storm motion) that neither older dataset carries. It is also ten times finer in grid spacing.

**R1 has the most normals.** It is the only dataset publishing ready-made 30-year averages, and the only one publishing them per hour.

**R2 has the fewest variables of the three** and publishes no normals at all, but its raw yearly files let PyRe compute both the average and the standard deviation, which is what normalized maps require.

That split is why PyRe currently mixes sources: observations from CORe, monthly normals from CORe, daily normals computed from R2, hourly normals read from R1.
