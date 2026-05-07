# The "Slicing" Dictionary
REGIONS = {
    "North America": {
        "lat": (10, 75),  # (min, max)
        "lon": (210, 310) # (min, max)
    }
}
# The "Variable" Dictionary
VARIABLES = {
    "wind_speed": {"name": "Wind Speed", "units": "m/s", "grib_keys": ["u", "v"]},
    "height": {"name": "Geopotential Height", "units": "gpm", "grib_keys": ["gh"]},
    "temp": {"name": "Temperature", "units": "K", "grib_keys": ["t"]}
}