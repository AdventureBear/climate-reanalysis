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
VARIABLES = {
    "wind_speed": {
        "name": "Wind Speed",
        "units": "m/s",
        "grib_names": ["UGRD", "VGRD"],
    },
    "temp": {
        "name": "Temperature",
        "units": "K",
        "grib_name": "TMP",
    },
    "height": {
        "name": "Geopotential Height",
        "units": "gpm",
        "grib_name": "HGT",
    },
    "humidity": {
        "name": "Specific Humidity",
        "units": "kg/kg",
        "grib_name": "SPFH",
    },
    "rel_humidity": {
        "name": "Relative Humidity",
        "units": "%",
        "grib_names": ["SPFH", "TMP"],
    },
}

PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]