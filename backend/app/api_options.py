from .config import supports_climatology

VALID_MODES = ("raw", "climatology", "anomaly", "normalized")
VALID_CLIMO_SOURCES = ("monthly-pgb", "r2-monthly", "r2-daily", "cfsr-daily")
VALID_WIND_UNITS = ("kt", "m/s")
VALID_PWAT_UNITS = ("mm", "in")

VAR_NAMES = {
    "wind_speed": "Wind Speed",
    "temp": "Temperature",
    "height": "Geopotential Height",
    "rel_humidity": "Relative Humidity  (derived: SPFH + TMP → Bolton formula)",
    "humidity": "Specific Humidity",
    "temp_2m": "2m Temperature",
    "wind_10m": "10m Wind Speed",
    "surface_pressure": "Mean Sea Level Pressure",
    "precipitable_water": "Precipitable Water",
    "omega": "Omega (Vertical Velocity)",
    "precip_rate": "Precipitation Rate",
    "olr": "Outgoing Longwave Radiation",
    "cape": "CAPE (Surface-Based)",
    "cape_ml": "CAPE (180-0 mb Mixed-Layer)",
    "cape_mu": "CAPE (255-0 mb Most-Unstable)",
    "cin": "CIN (Surface-Based)",
    "cin_ml": "CIN (180-0 mb Mixed-Layer)",
    "cin_mu": "CIN (255-0 mb Most-Unstable)",
    "dewpoint_2m": "2m Dewpoint",
    "absv": "Absolute Vorticity",
    "snow_depth": "Snow Depth",
}

MODE_NAMES = {
    "raw": "Raw composite",
    "climatology": "Climatology mean only  (no obs fetched)",
    "anomaly": "Anomaly  =  obs − climo_mean",
    "normalized": "Normalized anomaly  =  (obs − climo_mean) / climo_σ",
}

CLIMO_DESC = {
    "r2-daily": (
        "NCEP/DOE Reanalysis 2  |  PSL THREDDS OPeNDAP  |  "
        "30 concurrent year-file fetches  |  1991–2020  |  2.5° grid"
    ),
    "r2-monthly": (
        "NCEP/DOE Reanalysis 2  |  PSL THREDDS OPeNDAP  |  "
        "single strided request (30 monthly slices)  |  1991–2020  |  2.5° grid"
    ),
    "monthly-pgb": "CORe pgb monthly means  |  FTP surgical byte-range  |  1991–2020  |  0.25° grid",
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
    if variable not in {"wind_speed", "wind_10m"}:
        return None
    if scale_min is None and scale_max is None:
        return None
    unit_factor = 1.0 if wind_unit == "kt" else 1.0 / 0.51444
    overrides: dict[str, float] = {}
    if scale_min is not None:
        overrides["domain_min"] = float(scale_min) * unit_factor
    if scale_max is not None:
        overrides["domain_max"] = float(scale_max) * unit_factor
    return overrides
