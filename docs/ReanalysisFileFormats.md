# Reanalysis File Formats

This note collects durable CORe/GRIB/index details that are useful to developers but are not agent operating instructions. Treat `backend/app/retrieval.py` and `backend/app/config.py` as the executable source of truth when this note and code disagree.

## CORe Retrieval Sources

PyRe currently uses GCS as the primary CORe 3-hourly archive and NOMADS as a fallback for recent files where supported.

Primary GCS pressure-level stream:

```text
https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/pgb/{YYYY}/{MM}/pgb.{YYYYMMDD}{HH}.grb
https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/pgb/{YYYY}/{MM}/pgb.{YYYYMMDD}{HH}.idx
```

Primary GCS flux/named-level stream:

```text
https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/flx/{YYYY}/{MM}/flx.{YYYYMMDD}{HH}.grb
https://storage.googleapis.com/noaa-nws-ncep-core/grib/3hour/flx/{YYYY}/{MM}/flx.{YYYYMMDD}{HH}.idx
```

Recent NOMADS fallback pressure-level stream:

```text
https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.{batch_date}/{batch_hour}/post/spost/core.t{HH}z.spgb.ensmean.anl.grib2
```

Recent NOMADS fallback flux stream:

```text
https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.{batch_date}/{batch_hour}/post/flx/core.t{HH}z.flx.ensmean.grib2
```

The active CORe 3-hourly grid is the 0.703125 degree T170 gaussian grid.

CORe monthly pressure-level observations are probed dynamically from:

```text
https://ftp.cpc.ncep.noaa.gov/CORe/CDAS_clone_temporary/month/pgb/pgb.f00{YYYY}{MM}
https://ftp.cpc.ncep.noaa.gov/CORe/CDAS_clone_temporary/month/pgb/pgb.f00{YYYY}{MM}.idx
```

## Index Files

CORe index files list GRIB records and byte offsets. GCS and NOMADS formats differ slightly, so parsing should remain tolerant; see `parse_idx()` in `backend/app/retrieval.py`.

Typical pressure-level line:

```text
{record}:{byte_start}:d={YYYYMMDDHH}:{VAR}:{level}:anl:ens mean
```

The byte range for a record starts at its own `byte_start` and ends one byte before the next record's `byte_start`. Retrieval should fetch only that range:

```text
Range: bytes={start}-{end}
```

The last record may require an open-ended range when the next offset is unavailable.

## Variables And Levels

Pressure-level variables currently come from the `pgb` stream. Supported levels are declared in `backend/app/config.py`; the common set is:

```text
1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10 mb
```

Common pressure-level GRIB short names include:

| Short name | Meaning |
| --- | --- |
| TMP | Temperature |
| UGRD | U-component wind |
| VGRD | V-component wind |
| SPFH | Specific humidity |
| HGT | Geopotential height |
| VVEL | Omega |
| RH | Relative humidity where available |

Flux and named-level fields use exact GRIB level strings from the index, such as `2 m above ground`, `10 m above ground`, `surface`, `atmos col`, and `top of atmosphere`. Always verify a new named-level variable against a live index before wiring it.

Derived fields should use shared helpers:

- Wind speed: derive from UGRD and VGRD.
- Relative humidity: derive through shared meteorological math when not provided directly.
- Unit conversions: use shared unit helpers, not inline formulas.

## cfgrib And Coordinates

- Decode GRIB bytes with `engine="cfgrib"` and appropriate `filter_by_keys`.
- Preserve xarray metadata needed for valid time, level, units, and provenance labels.
- NOAA longitudes are 0-360. Convert for western-hemisphere display where needed.
- cfgrib may create sidecar `.idx` files when opening local GRIB files; PyRe's retrieval indexes are upstream HTTP index files used for byte-range planning.

## Reference Samples

The repo includes sample raw index files:

- `docs/reference/SampleGRB2 Index file.txt`: pressure-level sample useful for byte-offset and pressure-level assumptions.
- `docs/reference/grbMonthlyIdxSample.txt`: monthly/surface-style sample useful for compatibility checks, not a sole source for current flx matching rules.

Archived planning files under `docs/archive/` are historical context, not current implementation guidance.
