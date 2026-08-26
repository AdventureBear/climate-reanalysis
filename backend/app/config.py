import os

# ── Disk cache root ───────────────────────────────────────────────────────────
# All persistent disk caches (monthly obs slices in obs_cache/, R2 climatology
# in climo_cache/) live under this root. Defaults to backend/ — the historical
# local-dev layout. In production set PYRE_CACHE_DIR to a persistent mount
# (e.g. a Render disk at /var/data) so caches survive deploys and restarts;
# without it, Render's ephemeral filesystem drops the cache on every deploy.
_BACKEND_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
CACHE_ROOT = os.environ.get("PYRE_CACHE_DIR") or _BACKEND_ROOT
CLIMO_ROOT = os.environ.get("PYRE_CLIMO_DIR") or os.path.join(CACHE_ROOT, "climo_cache")

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

# R1 4×-daily long-term means: one normal per synoptic hour (00/06/12/18z),
# the baseline for 3-hourly anomalies (#72 — a daily mean leaves the diurnal
# cycle inside the anomaly). Keyed by GRIB short name, mirroring
# R2_CLIMO_FIELDS; "file" is the stem in {dataset}/{file}.4Xday.ltm.nc.
R1_4XDAY_FIELDS: dict[str, dict] = {
    "TMP":  {"file": "air",   "var": "air",   "dataset": "pressure"},
    "HGT":  {"file": "hgt",   "var": "hgt",   "dataset": "pressure"},
    "UGRD": {"file": "uwnd",  "var": "uwnd",  "dataset": "pressure"},
    "VGRD": {"file": "vwnd",  "var": "vwnd",  "dataset": "pressure"},
    "RH":   {"file": "rhum",  "var": "rhum",  "dataset": "pressure"},
    "VVEL": {"file": "omega", "var": "omega", "dataset": "pressure"},
    "SPFH": {"file": "shum",  "var": "shum",  "dataset": "pressure"},
}

# Every climatology source wired for standard pressure-level fields.
# r1-4xdaily is resolved by climo_policy for 3-hourly anomalies rather than
# chosen by the user, so it is not listed as a user-selectable source here.
_PRESSURE_LEVEL_CLIMO_SOURCES = ("monthly-pgb", "r2-monthly", "r2-daily")

# Surface/named-level fields have no monthly-pgb baseline (the monthly pgb
# files are pressure-level only); their baselines come from R2 single-level
# files declared per-variable via "r2_climo" specs below.
_SINGLE_LEVEL_CLIMO_SOURCES = ("r2-monthly", "r2-daily")
_PWAT_CLIMO_SOURCES = ("r2-monthly", "r2-daily", "r2-daily-15day")

# Keyed by UI name. wind_speed is derived from UGRD+VGRD; all others are direct GRIB fields.
#
# climo_sources: climatology baselines wired for this variable. Empty tuple →
# raw maps only; the API rejects climatology/anomaly/normalized modes and the
# UI derives mode availability from the same fact (GET / → variable_modes).
#
# r1_4xday (single-level variables only): the 4×-daily LTM file providing the
#   per-synoptic-hour baseline for 3-hourly anomalies (#72). Same field names
#   as r2_climo; dataset is the ncep.reanalysis.derived subdirectory
#   ("surface" 2.5°, "surface_gauss" T62). A variable without this spec keeps
#   3-hourly anomalies unavailable rather than using a diurnally-biased one.
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
# normalized_mask_threshold: optional non-wind guard for scalar normalized
# anomaly maps. Grid points where the observed value is below this threshold are
# masked after the sigma-validity mask. Wind anomalies/normalized anomalies use
# vector U/V departures instead of scalar wind-speed departures.

def _cloud_cover_variable(
    name: str,
    flx_level: str,
    display_level: str,
    *,
    time_stat: str | None = None,
    source_time_offset_hours: int = 0,
) -> dict:
    cfg = {
        "name": name,
        "units": "%",
        "stream": "flx",
        "grib_name": "TCDC",
        "flx_level": flx_level,
        "display_level": display_level,
        # R2 has daily tcdc on the gaussian grid, but the CORe field semantics
        # and baseline product design need review before exposing anomalies.
        "climo_sources": (),
        "normalized_mask_threshold": None,
    }
    if time_stat is not None:
        cfg["time_stat"] = time_stat
    if source_time_offset_hours:
        cfg["source_time_offset_hours"] = source_time_offset_hours
    return cfg


def _radiation_variable(name: str, grib_name: str, flx_level: str, display_level: str) -> dict:
    return {
        "name": name,
        "units": "W/m²",
        "stream": "flx",
        "grib_name": grib_name,   # 0-3 hour average forecast flux field
        "flx_level": flx_level,
        "display_level": display_level,
        "time_stat": "0-3 hour ave fcst",
        "source_time_offset_hours": -3,
        # Flux anomalies need a dedicated baseline review. OLR at TOA is the
        # existing exception below because its R2/R1 specs were already wired.
        "climo_sources": (),
        "normalized_mask_threshold": None,
    }


VARIABLES = {
    "blank_map": {
        "name": "Blank Map",
        "units": "",
        "stream": "blank",
        "display_level": "base map",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "wind_speed": {
        "name": "Wind Speed",
        "units": "m/s",
        "grib_names": ["UGRD", "VGRD"],
        "climo_sources": _PRESSURE_LEVEL_CLIMO_SOURCES,
        "normalized_mask_threshold": None,
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
        # Raw obs are derived from CORe SPFH + TMP. Keep anomaly/climatology
        # modes disabled until a consistent derived-RH baseline is wired and
        # validated instead of mixing this path with direct R2 RH.
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "rel_humidity_2m": {
        "name": "2m Relative Humidity",
        "units": "%",
        "stream": "derived_surface",
        "display_level": "2 m above ground",
        "levels": [1000],
        "climo_sources": (),   # derivable from R2 2m TMP + humidity later
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
    "rel_vorticity": {
        "name": "Relative Vorticity",
        "units": "1/s",
        # CORe docs explicitly note RELV must be computed from U/V by the user.
        "grib_names": ["UGRD", "VGRD"],
        "derive": "relative_vorticity",
        "climo_sources": (),   # vorticity climatology can be derived later from U/V baselines
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
        "r1_4xday": {"file": "air.2m", "var": "air", "dataset": "surface_gauss"},
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
        "r1_4xday": {
            "derive": "wind_speed",
            "stem": "wind.10m",
            "u": {"file": "uwnd.10m", "var": "uwnd", "dataset": "surface_gauss"},
            "v": {"file": "vwnd.10m", "var": "vwnd", "dataset": "surface_gauss"},
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
        "r1_4xday": {"file": "slp", "var": "slp", "dataset": "surface"},
        "normalized_mask_threshold": None,
    },
    "precipitable_water": {
        "name": "Precipitable Water",
        "units": "kg/m²",
        "stream": "flx",
        "grib_name": "PWAT",
        "flx_level": "atmos col",
        "display_level": "total column",
        "climo_sources": _PWAT_CLIMO_SOURCES,
        "r2_climo": {"file": "pr_wtr.eatm", "var": "pr_wtr", "dataset": "surface"},
        "r1_4xday": {"file": "pr_wtr.eatm", "var": "pr_wtr", "dataset": "surface"},
        "normalized_mask_threshold": None,
    },
    "precip_rate": {
        "name": "Precipitation Rate",
        "units": "kg/m²/s",
        "stream": "flx",
        "grib_name": "PRATE",   # 0-3 hour average forecast field, not instantaneous
        "flx_level": "surface",
        "display_level": "surface",
        # Precipitation anomalies need a separate product design: short-window
        # rate anomalies are timing-sensitive and zero-heavy. Keep raw-only
        # until accumulated/percentile-style baselines are wired.
        "climo_sources": (),
        "r2_climo": {"file": "prate.sfc", "var": "prate", "dataset": "gaussian_grid"},
        "r1_4xday": {"file": "prate.sfc", "var": "prate", "dataset": "surface_gauss"},
        # ~1 mm/day in native units: a high-σ precip anomaly over an
        # essentially dry background is noise, not signal.
        "normalized_mask_threshold": 1.16e-5,
    },
    "precip_total": {
        "name": "Precipitation Total",
        "units": "kg/m²",
        "stream": "flx",
        "grib_name": "PRATE",
        "flx_level": "surface",
        "display_level": "surface",
        # Accumulated precip needs a like-for-like accumulated climatology
        # window. Keep raw-only until that baseline is designed and wired.
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "cloud_cover_total": _cloud_cover_variable(
        "Total Cloud Cover",
        "atmos col",
        "atmospheric column",
        time_stat="0-3 hour ave fcst",
        source_time_offset_hours=-3,
    ),
    "cloud_cover_low": _cloud_cover_variable(
        "Low Cloud Cover",
        "low cloud layer",
        "low cloud layer",
        time_stat="0-3 hour ave fcst",
        source_time_offset_hours=-3,
    ),
    "cloud_cover_middle": _cloud_cover_variable(
        "Middle Cloud Cover",
        "middle cloud layer",
        "middle cloud layer",
        time_stat="0-3 hour ave fcst",
        source_time_offset_hours=-3,
    ),
    "cloud_cover_high": _cloud_cover_variable(
        "High Cloud Cover",
        "high cloud layer",
        "high cloud layer",
        time_stat="0-3 hour ave fcst",
        source_time_offset_hours=-3,
    ),
    "cloud_cover_boundary": _cloud_cover_variable(
        "Boundary-Layer Cloud Cover",
        "boundary layer cloud layer",
        "boundary layer cloud layer",
        time_stat="0-3 hour ave fcst",
        source_time_offset_hours=-3,
    ),
    "cloud_cover_convective": _cloud_cover_variable("Convective Cloud Cover", "convective cloud layer", "convective cloud layer"),
    "radiation_sw_down_surface": _radiation_variable("Surface Downward Shortwave Radiation", "DSWRF", "surface", "surface"),
    "radiation_sw_up_surface": _radiation_variable("Surface Upward Shortwave Radiation", "USWRF", "surface", "surface"),
    "radiation_lw_down_surface": _radiation_variable("Surface Downward Longwave Radiation", "DLWRF", "surface", "surface"),
    "radiation_lw_up_surface": _radiation_variable("Surface Upward Longwave Radiation", "ULWRF", "surface", "surface"),
    "radiation_sw_down_toa": _radiation_variable("TOA Downward Shortwave Radiation", "DSWRF", "top of atmosphere", "top of atmosphere"),
    "radiation_sw_up_toa": _radiation_variable("TOA Upward Shortwave Radiation", "USWRF", "top of atmosphere", "top of atmosphere"),
    "olr": {
        "name": "Outgoing Longwave Radiation",
        "units": "W/m²",
        "stream": "flx",
        "grib_name": "ULWRF",   # 0-3 hour average forecast field
        "flx_level": "top of atmosphere",
        "display_level": "top of atmosphere",
        "time_stat": "0-3 hour ave fcst",
        "source_time_offset_hours": -3,
        "climo_sources": _SINGLE_LEVEL_CLIMO_SOURCES,
        "r2_climo": {"file": "ulwrf.ntat", "var": "ulwrf", "dataset": "gaussian_grid"},
        "r1_4xday": {"file": "ulwrf.ntat", "var": "ulwrf", "dataset": "other_gauss"},
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
    "storm_relative_helicity": {
        "name": "Storm-Relative Helicity",
        "units": "m²/s²",
        "stream": "pgb_named_level",
        "grib_name": "HLCY",
        "level_name": "3000-0 m above ground",
        "display_level": "0–3 km AGL",
        "monthly_grib_name": "HLCY",
        "monthly_level_name": "3000-0 m above ground",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "wind_gust": {
        "name": "Wind Gust",
        "units": "m/s",
        "stream": "pgb_named_level",
        "grib_name": "GUST",
        "level_name": "surface",
        "display_level": "surface",
        "monthly_grib_name": "GUST",
        "monthly_level_name": "surface",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "storm_motion": {
        "name": "Storm Motion",
        "units": "m/s",
        "stream": "derived_named_level",
        "grib_names": ["USTM", "VSTM"],
        "derive": "vector_speed",
        "level_name": "6000-0 m above ground",
        "display_level": "0–6 km AGL",
        "monthly_grib_names": ["USTM", "VSTM"],
        "monthly_level_name": "6000-0 m above ground",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "lifted_index_surface": {
        "name": "Lifted Index (Surface)",
        "units": "K",
        "stream": "pgb_named_level",
        "grib_name": "LFTX",
        "level_name": "surface",
        "display_level": "surface parcel",
        "monthly_grib_name": "LFTX",
        "monthly_level_name": "surface",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "lifted_index_best": {
        "name": "Lifted Index (Best 4-layer)",
        "units": "K",
        "stream": "pgb_named_level",
        "grib_name": "4LFTX",
        "level_name": "surface",
        "display_level": "best 4-layer parcel",
        "monthly_grib_name": "4LFTX",
        "monthly_level_name": "surface",
        "climo_sources": (),
        "normalized_mask_threshold": None,
    },
    "lifted_index_parcel": {
        "name": "Lifted Index (30-0 mb Parcel)",
        "units": "K",
        "stream": "pgb_named_level",
        "grib_name": "PLI",
        "level_name": "30-0 mb above ground",
        "display_level": "30–0 mb AGL parcel",
        "monthly_grib_name": "PLI",
        "monthly_level_name": "30-0 mb above ground",
        "climo_sources": (),
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
    return VARIABLES[variable].get("stream") in {"flx", "pgb_named_level", "derived_named_level", "derived_surface"}


def valid_levels(variable: str) -> list[int]:
    """Pressure levels available for this variable (some CORe fields are truncated)."""
    return VARIABLES[variable].get("levels", PRESSURE_LEVELS)


def supported_climo_sources(variable: str) -> tuple[str, ...]:
    """Climatology baselines wired for this variable; empty → raw-only."""
    return tuple(VARIABLES[variable].get("climo_sources", ()))


def supports_climatology(variable: str) -> bool:
    """Return True when climatology/anomaly/normalized modes are available."""
    return bool(supported_climo_sources(variable))


def variable_level_label(variable: str, level: int | str | None) -> str:
    """Human-readable vertical coordinate for logs and map titles."""
    return VARIABLES[variable].get("display_level", f"{level} mb")
