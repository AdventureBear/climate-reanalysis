REGIONS = {
    "CONUS": {
        # Data fetch bounds — kept larger than the display extent so Albers corners
        # never hit a data edge. The display extent lives in visualizer.py.
        "lat": (15, 72),    # (min, max)
        "lon": (218, 315),  # (min, max) — NOAA 0-360 convention (-142 to -45 W)
    },
    "Northwest US": {
        "lat": (36, 55),
        "lon": (231, 253),
    },
    "Northern Plains": {
        "lat": (38, 55),
        "lon": (250, 273),
    },
    "Central Plains": {
        "lat": (30, 48),
        "lon": (253, 277),
    },
    "Northeast": {
        "lat": (36, 50),
        "lon": (280, 307),
    },
    "Eastern US": {
        "lat": (23, 50),
        "lon": (266, 307),
    },
    "Southwest US": {
        "lat": (28, 43),
        "lon": (234, 257),
    },
    "South Central": {
        "lat": (24, 40),
        "lon": (254, 279),
    },
    "Southeast US": {
        "lat": (23, 39),
        "lon": (270, 297),
    },
    "Western US": {
        "lat": (29, 52),
        "lon": (231, 259),
    },
    "Alaska": {
        "lat": (48, 75),
        "lon": (188, 236),
    },
    "Hawaii": {
        "lat": (16, 25),
        "lon": (197, 207),
    },
    "North America": {
        "lat": (5, 85),
        "lon": (190, 330),
    },
    "Northern Hemisphere": {
        "lat": (0, 90),
        "lon": (0, 360),
    },
    "North Pacific": {
        "lat": (0, 70),
        "lon": (120, 260),
    },
    "Northern Africa": {
        "lat": (0, 40),
        "lon": (335, 60),
    },
    "Europe": {
        "lat": (30, 75),
        "lon": (330, 45),
    },
    "Asia": {
        "lat": (5, 70),
        "lon": (55, 160),
    },
    "Middle East": {
        "lat": (5, 45),
        "lon": (25, 75),
    },
    "East Asia": {
        "lat": (10, 60),
        "lon": (95, 160),
    },
    "Australia": {
        "lat": (-45, -5),
        "lon": (105, 165),
    },
    "Southeast Canada": {
        "lat": (40, 70),
        "lon": (260, 320),
    },
    "Western Canada": {
        "lat": (45, 75),
        "lon": (220, 275),
    },
    "Canada": {
        "lat": (40, 85),
        "lon": (220, 320),
    },
    "South America": {
        "lat": (-60, 15),
        "lon": (275, 330),
    },
    "World": {
        "lat": (-60, 85),
        "lon": (0, 360),
    },
    "Indian Ocean": {
        "lat": (-20, 45),  # expanded southward for tropical diagnostics
        "lon": (25, 115),  # 5° padding beyond 30–110 E; 0-360 = same as degrees E
    },
    "North Atlantic": {
        "lat": (-5, 45),
        "lon": (270, 350),
    },
    "Western Atlantic": {
        "lat": (-5, 45),
        "lon": (255, 320),
    },
    "Tropical Atlantic": {
        "lat": (-10, 35),
        "lon": (295, 359),
    },
    "Western Pacific": {
        "lat": (-10, 40),
        "lon": (105, 180),
    },
    "Central Pacific": {
        "lat": (-10, 35),
        "lon": (181, 245),
    },
    "Eastern Pacific": {
        "lat": (-15, 35),
        "lon": (205, 285),
    },
    "Southwest Pacific": {
        "lat": (-35, 10),
        "lon": (135, 180),
    },
    "Southeast Pacific": {
        "lat": (-40, 10),
        "lon": (215, 295),
    },
    "India": {
        "lat": (-5, 40),
        "lon": (55, 105),
    },
    "Southern Africa": {
        "lat": (-40, 10),
        "lon": (5, 50),
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
