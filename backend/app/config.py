REGIONS = {
    "CONUS": {
        # Data fetch bounds — kept larger than the display extent so Albers corners
        # never hit a data edge. The display extent lives in visualizer.py.
        "lat": (15, 72),    # (min, max)
        "lon": (218, 315),  # (min, max) — NOAA 0-360 convention (-142 to -45 W)
    },
    "Indian Ocean": {
        "lat": (-5, 45),   # 5° padding beyond 0–40 N display extent
        "lon": (25, 115),  # 5° padding beyond 30–110 E; 0-360 = same as degrees E
    },
}

# Keyed by UI name. wind_speed is derived from UGRD+VGRD; all others are direct GRIB fields.
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
        "normalized_mask_threshold": None,   # temperature anomalies always meaningful
    },
    "height": {
        "name": "Geopotential Height",
        "units": "gpm",
        "grib_name": "HGT",
        "normalized_mask_threshold": None,
    },
    "humidity": {
        "name": "Specific Humidity",
        "units": "kg/kg",
        "grib_name": "SPFH",
        "normalized_mask_threshold": None,
    },
    "rel_humidity": {
        "name": "Relative Humidity",
        "units": "%",
        "grib_names": ["SPFH", "TMP"],
        "normalized_mask_threshold": None,
    },
}

PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]