from .config import supports_climatology
from .units import MS_TO_KT

VALID_MODES = ("raw", "climatology", "anomaly", "normalized")
# r1-4xdaily is resolved internally for 3-hourly anomalies (#72), never
# requested directly, so it is not offered as a user-selectable source.
VALID_CLIMO_SOURCES = ("monthly-pgb", "r2-monthly", "r2-daily", "r2-daily-15day", "core-3hourly", "cfsr-daily")
VALID_WIND_UNITS = ("kt", "m/s")
VALID_PWAT_UNITS = ("mm", "in")
VALID_PRECIP_UNITS = ("mm", "in")
MAX_PRECIP_WINDOW_HOURS = 24 * 31
VALID_PRECIP_WINDOWS = (3, 6, 12, 24)


def valid_precip_window(value: int) -> bool:
    return value > 0 and value % 3 == 0 and value <= MAX_PRECIP_WINDOW_HOURS

VAR_NAMES = {
    "wind_speed": "Wind Speed",
    "temp": "Temperature",
    "height": "Geopotential Height",
    "rel_humidity": "Relative Humidity  (derived: SPFH + TMP → Bolton formula)",
    "rel_humidity_2m": "2m Relative Humidity  (derived: TMP + DPT)",
    "humidity": "Specific Humidity",
    "temp_2m": "2m Temperature",
    "wind_10m": "10m Wind Speed",
    "surface_pressure": "Mean Sea Level Pressure",
    "precipitable_water": "Precipitable Water",
    "omega": "Omega (Vertical Velocity)",
    "rel_vorticity": "Relative Vorticity  (derived: UGRD + VGRD)",
    "precip_rate": "Precipitation Rate",
    "precip_total": "Precipitation Total",
    "cloud_cover_total": "Total Cloud Cover",
    "cloud_cover_low": "Low Cloud Cover",
    "cloud_cover_middle": "Middle Cloud Cover",
    "cloud_cover_high": "High Cloud Cover",
    "cloud_cover_boundary": "Boundary-Layer Cloud Cover",
    "cloud_cover_convective": "Convective Cloud Cover",
    "radiation_sw_down_surface": "Surface Downward Shortwave Radiation",
    "radiation_sw_up_surface": "Surface Upward Shortwave Radiation",
    "radiation_lw_down_surface": "Surface Downward Longwave Radiation",
    "radiation_lw_up_surface": "Surface Upward Longwave Radiation",
    "radiation_sw_down_toa": "TOA Downward Shortwave Radiation",
    "radiation_sw_up_toa": "TOA Upward Shortwave Radiation",
    "olr": "Outgoing Longwave Radiation",
    "cape": "CAPE (Surface-Based)",
    "cape_ml": "CAPE (180-0 mb Mixed-Layer)",
    "cape_mu": "CAPE (255-0 mb Most-Unstable)",
    "cin": "CIN (Surface-Based)",
    "cin_ml": "CIN (180-0 mb Mixed-Layer)",
    "cin_mu": "CIN (255-0 mb Most-Unstable)",
    "dewpoint_2m": "2m Dewpoint",
    "absv": "Absolute Vorticity",
    "storm_relative_helicity": "Storm-Relative Helicity (0-3 km AGL)",
    "wind_gust": "Wind Gust",
    "storm_motion": "Storm Motion (0-6 km AGL)",
    "lifted_index_surface": "Lifted Index (Surface)",
    "lifted_index_best": "Lifted Index (Best 4-layer)",
    "lifted_index_parcel": "Lifted Index (30-0 mb Parcel)",
    "snow_depth": "Snow Depth",
}

MODE_NAMES = {
    "raw": "Raw composite",
    "climatology": "Climatology mean only  (no obs fetched)",
    "anomaly": "Anomaly  =  obs − climo_mean",
    "normalized": "Normalized anomaly  =  standardized departure from climatology",
}

CLIMO_DESC = {
    "r2-daily": (
        "NCEP/DOE Reanalysis 2  |  PSL THREDDS OPeNDAP  |  "
        "30 concurrent year-file fetches  |  1991–2020  |  2.5° grid"
    ),
    "r2-daily-15day": (
        "NCEP/DOE Reanalysis 2 daily PWAT  |  PSL THREDDS OPeNDAP  |  "
        "centered 15-day pooled mean/std  |  1991–2020  |  2.5° grid"
    ),
    "r2-monthly": (
        "NCEP/DOE Reanalysis 2  |  PSL THREDDS OPeNDAP  |  "
        "single strided request (30 monthly slices)  |  1991–2020  |  2.5° grid"
    ),
    "monthly-pgb": (
        "CORe monthly means  |  FTP surgical byte-range  |  "
        "single strided request (30 monthly slices)  |  1991–2020  |  2.5° grid  |  "
        "same dataset as the observations"
    ),
    "core-3hourly": (
        "CORe 3-hourly PWAT climatology  |  GCS/NOMADS surgical byte-range  |  "
        "±5-day same-hour window  |  1991–2020  |  native CORe grid"
    ),
}


def supported_modes(variable: str) -> tuple[str, ...]:
    """Display modes available for a variable, derived from config.VARIABLES.

    Variables with no wired climatology baseline (empty climo_sources) are
    raw-only; everything else supports all modes.
    """
    return VALID_MODES if supports_climatology(variable) else ("raw",)


def preview(values, digits: int = 3, n: int = 6) -> str:
    values = list(values)
    if not values:
        return "[]"
    if len(values) <= n * 2:
        return "[" + ", ".join(f"{v:.{digits}f}" for v in values) + "]"
    head = ", ".join(f"{v:.{digits}f}" for v in values[:n])
    tail = ", ".join(f"{v:.{digits}f}" for v in values[-n:])
    return f"[{head}, ..., {tail}]"


def scale_overrides_from_query(
    variable: str,
    scale_min: float | None,
    scale_max: float | None,
    wind_unit: str = "kt",
) -> dict[str, float] | None:
    if variable not in {"wind_speed", "wind_10m", "wind_gust", "storm_motion"}:
        return None
    if scale_min is None and scale_max is None:
        return None
    unit_factor = 1.0 if wind_unit == "kt" else MS_TO_KT
    overrides: dict[str, float] = {}
    if scale_min is not None:
        overrides["domain_min"] = float(scale_min) * unit_factor
    if scale_max is not None:
        overrides["domain_max"] = float(scale_max) * unit_factor
    return overrides
