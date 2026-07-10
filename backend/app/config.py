import os

# ── Disk cache root ───────────────────────────────────────────────────────────
# All persistent disk caches (monthly obs slices in obs_cache/, R2 climatology
# in climo_cache/) live under this root. Defaults to backend/ — the historical
# local-dev layout. In production set PYRE_CACHE_DIR to a persistent mount
# (e.g. a Render disk at /var/data) so caches survive deploys and restarts;
# without it, Render's ephemeral filesystem drops the cache on every deploy.
_BACKEND_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
CACHE_ROOT = os.environ.get("PYRE_CACHE_DIR") or _BACKEND_ROOT

REGIONS = {
    "CONUS": {
        # Data fetch bounds — kept larger than the display extent so Albers corners
        # never hit a data edge. The display extent lives in visualizer.py.
        "lat": (12.5, 74.5),    # (min, max)
        "lon": (215.5, 317.5),  # (min, max) — NOAA 0-360 convention (-142 to -45 W)
    },
    "Northwest US": {
        "lat": (33.5, 57.5),
        "lon": (228.5, 255.5),
    },
    "Northern Plains": {
        "lat": (35.5, 57.5),
        "lon": (247.5, 275.5),
    },
    "Central Plains": {
        "lat": (27.5, 50.5),
        "lon": (250.5, 279.5),
    },
    "Northeast": {
        "lat": (33.5, 52.5),
        "lon": (277.5, 309.5),
    },
    "Eastern US": {
        "lat": (20.5, 52.5),
        "lon": (263.5, 309.5),
    },
    "Southwest US": {
        "lat": (25.5, 45.5),
        "lon": (231.5, 259.5),
    },
    "South Central": {
        "lat": (21.5, 42.5),
        "lon": (251.5, 281.5),
    },
    "Southeast US": {
        "lat": (20.5, 41.5),
        "lon": (267.5, 299.5),
    },
    "Western US": {
        "lat": (26.5, 54.5),
        "lon": (228.5, 261.5),
    },
    "Alaska": {
        "lat": (45.5, 77.5),
        "lon": (185.5, 238.5),
    },
    "Hawaii": {
        "lat": (13.5, 27.5),
        "lon": (194.5, 209.5),
    },
    "North America": {
        "lat": (2.5, 87.5),
        "lon": (187.5, 332.5),
    },
    "Northern Hemisphere": {
        "lat": (-2.5, 90),
        "lon": (0, 360),
    },
    "Southern Hemisphere": {
        # Polar hemisphere diagnostic view: trimming at 20S avoids the stretched,
        # mostly tropical rim while retaining the midlatitude storm track and polar circulation.
        "lat": (-90, -17.5),
        "lon": (0, 360),
    },
    "North Pacific": {
        "lat": (-2.5, 72.5),
        "lon": (117.5, 262.5),
    },
    "Northern Africa": {
        "lat": (-2.5, 42.5),
        "lon": (332.5, 62.5),
    },
    "Europe": {
        "lat": (27.5, 77.5),
        "lon": (327.5, 47.5),
    },
    "Asia": {
        "lat": (2.5, 72.5),
        "lon": (52.5, 162.5),
    },
    "Middle East": {
        "lat": (2.5, 47.5),
        "lon": (22.5, 77.5),
    },
    "East Asia": {
        "lat": (7.5, 62.5),
        "lon": (92.5, 162.5),
    },
    "Australia": {
        "lat": (-47.5, -2.5),
        "lon": (102.5, 167.5),
    },
    "New Zealand": {
        # NIWA-style frame: reaches 55S for the full storm-track story and
        # crosses the dateline to 160W.
        "lat": (-57.5, -22.5),
        "lon": (147.5, 202.5),
    },
    "Southeast Canada": {
        "lat": (37.5, 72.5),
        "lon": (257.5, 322.5),
    },
    "Western Canada": {
        "lat": (42.5, 77.5),
        "lon": (217.5, 277.5),
    },
    "Canada": {
        "lat": (37.5, 87.5),
        "lon": (217.5, 322.5),
    },
    "South America": {
        "lat": (-62.5, 17.5),
        "lon": (272.5, 332.5),
    },
    "World": {
        "lat": (-62.5, 87.5),
        "lon": (0, 360),
    },
    "Indian Ocean": {
        "lat": (-22.5, 47.5),  # expanded southward for tropical diagnostics
        "lon": (22.5, 117.5),  # 0-360 = same as degrees E
    },
    "North Atlantic": {
        "lat": (-7.5, 47.5),
        "lon": (267.5, 352.5),
    },
    "Western Atlantic": {
        "lat": (-7.5, 47.5),
        "lon": (252.5, 322.5),
    },
    "Tropical Atlantic": {
        "lat": (-12.5, 37.5),
        "lon": (292.5, 1.5),
    },
    "Western Pacific": {
        "lat": (-12.5, 42.5),
        "lon": (102.5, 182.5),
    },
    "Central Pacific": {
        "lat": (-12.5, 37.5),
        "lon": (178.5, 247.5),
    },
    "Eastern Pacific": {
        "lat": (-17.5, 37.5),
        "lon": (202.5, 287.5),
    },
    "Southwest Pacific": {
        "lat": (-37.5, 12.5),
        "lon": (132.5, 182.5),
    },
    "Southeast Pacific": {
        "lat": (-42.5, 12.5),
        "lon": (212.5, 297.5),
    },
    "India": {
        "lat": (-7.5, 42.5),
        "lon": (52.5, 107.5),
    },
    "Southern Africa": {
        "lat": (-42.5, 12.5),
        "lon": (2.5, 52.5),
    },
}

# ── R2 climatology field registry ─────────────────────────────────────────────
# NCEP/DOE Reanalysis 2 files that provide 30-year (1991–2020) baselines,
# keyed by CORe GRIB short name. Consumed by climo_r2.py (daily + monthly
# climatology) and retrieval.py (R2 monthly obs fallback).
#
#   var:     variable name inside the R2 NetCDF file (also its filename stem)
#   dataset: THREDDS subdirectory under Dailies/ and Monthlies/.
#            "pressure" files carry a level dimension; "surface" and
#            "gaussian_grid" files are single-level.
R2_CLIMO_FIELDS: dict[str, dict] = {
    "TMP":  {"var": "air",   "dataset": "pressure"},
    "HGT":  {"var": "hgt",   "dataset": "pressure"},
    "UGRD": {"var": "uwnd",  "dataset": "pressure"},
    "VGRD": {"var": "vwnd",  "dataset": "pressure"},
    "RH":   {"var": "rhum",  "dataset": "pressure"},
    "VVEL": {"var": "omega", "dataset": "pressure"},
    # No daily SPFH: R2 publishes no daily shum file, so specific humidity has
    # no sub-monthly baseline and stays raw-only until one is wired.
}

# Every climatology source wired for standard pressure-level fields.
_PRESSURE_LEVEL_CLIMO_SOURCES = ("monthly-pgb", "r2-monthly", "r2-daily")

# Surface/named-level fields have no monthly-pgb baseline (the monthly pgb
# files are pressure-level only); their baselines come from R2 single-level
# files declared per-variable via "r2_climo" specs below.
_SINGLE_LEVEL_CLIMO_SOURCES = ("r2-monthly", "r2-daily")

# Keyed by UI name. wind_speed is derived from UGRD+VGRD; all others are direct GRIB fields.
#
# climo_sources: climatology baselines wired for this variable. Empty tuple →
# raw maps only; the API rejects climatology/anomaly/normalized modes and the
# UI derives mode availability from the same fact (GET / → variable_modes).
#
# r2_climo (single-level variables only): which R2 file provides the baseline.
#   file:    filename stem on THREDDS (e.g. "air.2m" → air.2m.gauss.{year}.nc)
#   var:     variable name inside the NetCDF file (often differs from the stem)
#   dataset: THREDDS subdirectory ("surface" 2.5° grid, "gaussian_grid" T62)
#   derive:  "wind_speed" → fetch u/v specs and compute sqrt(u²+v²) per year;
#            derived specs carry a "stem" used as the cache filename identifier.
# Units were verified against CORe obs fields (Pa, kg/m², K, m/s) — no
# conversions applied at fetch time.
#
# normalized_mask_threshold: for normalized anomaly maps, grid points where the
# observed value is BELOW this threshold are masked (set to NaN before rendering).
# Prevents physically meaningless high-sigma values over weak background flow.
# e.g. a +5σ wind anomaly at 15 m/s is noise against a near-zero summer mean —
# the jet simply isn't there. Set to None to suppress masking for that variable.
VARIABLES = {
    "wind_speed": {
        "name": "Wind Speed",
        "units": "m/s",
        "grib_names": ["UGRD", "VGRD"],
        "climo_sources": _PRESSURE_LEVEL_CLIMO_SOURCES,
        # Minimum observed wind (m/s) for a normalized anomaly to be physically meaningful.
        # Below threshold → masked to NaN. Scales with pressure level because wind speed
        # climatology drops significantly from upper troposphere to the surface.
        # 250mb: jet core threshold (~25 kt minimum to call it jet-level flow)
        # 850mb: LLJ / strong surface wind threshold
        # Levels not listed → nearest level's value is used.
        "normalized_mask_threshold": {
            1000: 8.0,
            925:  8.0,
            850: 12.0,   # LLJ threshold; below this is weak background flow
            700: 12.0,
            600: 14.0,
            500: 15.0,
            400: 18.0,
            300: 20.0,
            250: 20.0,   # jet core; below this is summer background noise
            200: 22.0,
            150: 20.0,
            100: 15.0,
            70:  12.0,
            50:  10.0,
            20:   8.0,
            10:   8.0,
        },
    },
    "temp": {
        "name": "Temperature",
        "units": "K",
        "grib_name": "TMP",
        "climo_sources": _PRESSURE_LEVEL_CLIMO_SOURCES,
        "normalized_mask_threshold": None,   # temperature anomalies always meaningful
    },
    "height": {
        "name": "Geopotential Height",
        "units": "gpm",
        "grib_name": "HGT",
        "climo_sources": _PRESSURE_LEVEL_CLIMO_SOURCES,
        "normalized_mask_threshold": None,
    },
    "humidity": {
        "name": "Specific Humidity",
        "units": "kg/kg",
        "grib_name": "SPFH",
        "climo_sources": (),   # R2 has no daily shum file — see R2_CLIMO_FIELDS
        "normalized_mask_threshold": None,
    },
    "rel_humidity": {
        "name": "Relative Humidity",
        "units": "%",
        "grib_names": ["SPFH", "TMP"],
        "climo_sources": _PRESSURE_LEVEL_CLIMO_SOURCES,
        "normalized_mask_threshold": None,
    },
    "omega": {
        "name": "Omega (Vertical Velocity)",
        "units": "Pa/s",
        "grib_name": "VVEL",
        # CORe publishes VVEL on 100–1000 mb only (no stratospheric levels).
        "levels": [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100],
        "climo_sources": _PRESSURE_LEVEL_CLIMO_SOURCES,
        "normalized_mask_threshold": None,
    },
    "temp_2m": {
        "name": "2m Temperature",
        "units": "K",
        "stream": "flx",
        "grib_name": "TMP",
        "flx_level": "2 m above ground",
        "display_level": "2 m above ground",
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {"file": "air.2m", "var": "air", "dataset": "gaussian_grid"},
        "normalized_mask_threshold": None,
    },
    "wind_10m": {
        "name": "10m Wind Speed",
        "units": "m/s",
        "stream": "flx",
        "grib_name": "WIND",
        "flx_level": "10 m above ground",
        "display_level": "10 m above ground",
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {
            "derive": "wind_speed",
            "stem": "wind.10m",   # cache filename identifier (no single source file)
            "u": {"file": "uwnd.10m", "var": "uwnd", "dataset": "gaussian_grid"},
            "v": {"file": "vwnd.10m", "var": "vwnd", "dataset": "gaussian_grid"},
        },
        "normalized_mask_threshold": None,
    },
    "surface_pressure": {
        "name": "Mean Sea Level Pressure",
        "units": "Pa",
        "stream": "pgb_named_level",
        # MSLET (Eta/membrane reduction), not PRES:mean sea level: the PRES
        # field nearly erases summer thermal lows over elevated terrain
        # (Jul 7 2026 18z CO heat low: PRES 1011 mb vs MSLET 1007.5 mb vs
        # GFS PRMSL ~1002 mb). MSLET is the closest GFS-comparable reduction
        # CORe publishes and is consistent with the 10m wind field.
        "grib_name": "MSLET",
        "level_name": "mean sea level",
        "display_level": "mean sea level",
        # Monthly archive carries only the PRES reduction (level string "MSL",
        # no MSLET). Fine for monthly/seasonal composites and anomalies —
        # the PRES-vs-MSLET disagreement is a heated-terrain effect.
        "monthly_grib_name": "PRES",
        "monthly_level_name": "MSL",
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {"file": "mslp", "var": "mslp", "dataset": "surface"},
        "normalized_mask_threshold": None,
    },
    "precipitable_water": {
        "name": "Precipitable Water",
        "units": "kg/m²",
        "stream": "flx",
        "grib_name": "PWAT",
        "flx_level": "atmos col",
        "display_level": "total column",
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {"file": "pr_wtr.eatm", "var": "pr_wtr", "dataset": "surface"},
        "normalized_mask_threshold": None,
    },
    "precip_rate": {
        "name": "Precipitation Rate",
        "units": "kg/m²/s",
        "stream": "flx",
        "grib_name": "PRATE",   # 0-3 hour average forecast field, not instantaneous
        "flx_level": "surface",
        "display_level": "surface",
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {"file": "prate.sfc", "var": "prate", "dataset": "gaussian_grid"},
        # ~1 mm/day in native units: a high-σ precip anomaly over an
        # essentially dry background is noise, not signal.
        "normalized_mask_threshold": 1.16e-5,
    },
    "olr": {
        "name": "Outgoing Longwave Radiation",
        "units": "W/m²",
        "stream": "flx",
        "grib_name": "ULWRF",   # 0-3 hour average forecast field
        "flx_level": "top of atmosphere",
        "display_level": "top of atmosphere",
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {"file": "ulwrf.ntat", "var": "ulwrf", "dataset": "gaussian_grid"},
        "normalized_mask_threshold": None,
    },
    # ── Raw-only case-study fields ─────────────────────────────────────────
    # No R2 baseline exists (or none is wired yet), so climo_sources is empty
    # and the API/UI offer raw maps only.
    # CAPE/CIN parcel variants. NCEP layer definitions: the 180-0 mb layer is
    # the mixed-layer parcel (note: SPC mesoanalysis uses 100 mb) and the
    # 255-0 mb layer is the "best" parcel — the conventional MUCAPE proxy.
    "cape": {
        "name": "CAPE (Surface-Based)",
        "units": "J/kg",
        "stream": "pgb_named_level",
        "grib_name": "CAPE",
        "level_name": "surface",
        "display_level": "surface-based",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "cape_ml": {
        "name": "CAPE (180-0 mb Mixed-Layer)",
        "units": "J/kg",
        "stream": "pgb_named_level",
        "grib_name": "CAPE",
        "level_name": "180-0 mb above ground",
        "display_level": "180-0 mb mixed layer",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "cape_mu": {
        "name": "CAPE (255-0 mb Most-Unstable)",
        "units": "J/kg",
        "stream": "pgb_named_level",
        "grib_name": "CAPE",
        "level_name": "255-0 mb above ground",
        "display_level": "255-0 mb most-unstable",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "cin": {
        "name": "CIN (Surface-Based)",
        "units": "J/kg",
        "stream": "pgb_named_level",
        "grib_name": "CIN",
        "level_name": "surface",
        "display_level": "surface-based",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "cin_ml": {
        "name": "CIN (180-0 mb Mixed-Layer)",
        "units": "J/kg",
        "stream": "pgb_named_level",
        "grib_name": "CIN",
        "level_name": "180-0 mb above ground",
        "display_level": "180-0 mb mixed layer",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "cin_mu": {
        "name": "CIN (255-0 mb Most-Unstable)",
        "units": "J/kg",
        "stream": "pgb_named_level",
        "grib_name": "CIN",
        "level_name": "255-0 mb above ground",
        "display_level": "255-0 mb most-unstable",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "dewpoint_2m": {
        "name": "2m Dewpoint",
        "units": "K",
        "stream": "pgb_named_level",
        "grib_name": "DPT",
        "level_name": "2 m above ground",
        "display_level": "2 m above ground",
        "climo_sources": (),   # R2 has no 2m dewpoint; derivable later from shum/pres
        "normalized_mask_threshold": None,
    },
    "absv": {
        "name": "Absolute Vorticity",
        "units": "1/s",
        "grib_name": "ABSV",
        "climo_sources": (),   # no R2 vorticity files; derivable later from uwnd/vwnd
        "normalized_mask_threshold": None,
    },
    "snow_depth": {
        "name": "Snow Depth",
        "units": "m",
        "stream": "flx",
        "grib_name": "SNOD",
        "flx_level": "surface",
        "display_level": "surface",
        "climo_sources": (),   # R2 has weasd (water equivalent), not depth — decide later
        "normalized_mask_threshold": None,
    },
}

PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]


def is_surface_or_named_level(variable: str) -> bool:
    """Return True for fields that are not selected by pressure level."""
    return VARIABLES[variable].get("stream") in {"flx", "pgb_named_level"}


def valid_levels(variable: str) -> list[int]:
    """Pressure levels available for this variable (some CORe fields are truncated)."""
    return VARIABLES[variable].get("levels", PRESSURE_LEVELS)


def supported_climo_sources(variable: str) -> tuple[str, ...]:
    """Climatology baselines wired for this variable; empty → raw-only."""
    return tuple(VARIABLES[variable].get("climo_sources", ()))


def supports_climatology(variable: str) -> bool:
    """Return True when climatology/anomaly/normalized modes are available."""
    return bool(supported_climo_sources(variable))


def variable_level_label(variable: str, level: int) -> str:
    """Human-readable vertical coordinate for logs and map titles."""
    return VARIABLES[variable].get("display_level", f"{level} mb")
