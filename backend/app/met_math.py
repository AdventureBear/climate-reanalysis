from __future__ import annotations

from typing import Any

import numpy as np

from .units import kelvin_to_celsius


def vector_magnitude(u: Any, v: Any) -> Any:
    """Return sqrt(u^2 + v^2) for numpy/xarray-like component arrays."""
    return (u ** 2 + v ** 2) ** 0.5


def wind_speed_from_components(
    u: Any,
    v: Any,
    *,
    obs_source_default: str | None = None,
    preserve_grib_level: bool = False,
) -> Any:
    """Derived wind speed in m/s with PyRe metadata applied consistently."""
    speed = vector_magnitude(u, v)
    speed.attrs.update({"units": "m/s", "long_name": "Wind Speed"})
    if obs_source_default is not None or "_pyre_obs_source" in u.attrs:
        speed.attrs["_pyre_obs_source"] = u.attrs.get("_pyre_obs_source", obs_source_default)
    if preserve_grib_level:
        speed.attrs["_pyre_grib_level"] = u.attrs.get("_pyre_grib_level", "")
    if "valid_time" in u.coords:
        speed = speed.assign_coords(valid_time=u.coords["valid_time"])
    return speed


def saturation_vapor_pressure_bolton_hpa(temperature_k: Any) -> Any:
    """Saturation vapor pressure in hPa using Bolton (1980), with input in K."""
    temperature_c = kelvin_to_celsius(temperature_k)
    return 6.112 * np.exp(17.67 * temperature_c / (temperature_c + 243.5))


def vapor_pressure_from_specific_humidity_hpa(specific_humidity: Any, pressure_hpa: float) -> Any:
    """Actual vapor pressure in hPa from specific humidity and pressure."""
    return specific_humidity * pressure_hpa / (0.622 + 0.378 * specific_humidity)


def relative_humidity_from_specific_humidity(
    specific_humidity: Any,
    temperature_k: Any,
    pressure_hpa: float,
) -> Any:
    """Relative humidity (%) from specific humidity, temperature, and pressure."""
    vapor_pressure = vapor_pressure_from_specific_humidity_hpa(specific_humidity, pressure_hpa)
    saturation_vapor_pressure = saturation_vapor_pressure_bolton_hpa(temperature_k)
    relative_humidity = vapor_pressure / saturation_vapor_pressure * 100.0
    if hasattr(relative_humidity, "clip"):
        return relative_humidity.clip(0, 100)
    return np.clip(relative_humidity, 0, 100)


def relative_humidity_from_dewpoint(
    temperature_k: Any,
    dewpoint_k: Any,
) -> Any:
    """Relative humidity (%) from temperature and dewpoint, both in K."""
    vapor_pressure = saturation_vapor_pressure_bolton_hpa(dewpoint_k)
    saturation_vapor_pressure = saturation_vapor_pressure_bolton_hpa(temperature_k)
    relative_humidity = vapor_pressure / saturation_vapor_pressure * 100.0
    if hasattr(relative_humidity, "clip"):
        return relative_humidity.clip(0, 100)
    return np.clip(relative_humidity, 0, 100)


def relative_humidity_from_components(
    specific_humidity: Any,
    temperature_k: Any,
    pressure_hpa: float,
) -> Any:
    """Derived relative humidity (%) with PyRe metadata applied consistently."""
    relative_humidity = relative_humidity_from_specific_humidity(specific_humidity, temperature_k, pressure_hpa)
    relative_humidity.attrs.update({"units": "%", "long_name": "Relative Humidity"})
    if "valid_time" in specific_humidity.coords:
        relative_humidity = relative_humidity.assign_coords(valid_time=specific_humidity.coords["valid_time"])
    return relative_humidity


def relative_humidity_from_dewpoint_components(
    temperature_k: Any,
    dewpoint_k: Any,
) -> Any:
    """Derived relative humidity (%) from temperature and dewpoint DataArrays."""
    relative_humidity = relative_humidity_from_dewpoint(temperature_k, dewpoint_k)
    relative_humidity.attrs.update({"units": "%", "long_name": "2m Relative Humidity"})
    if "valid_time" in temperature_k.coords:
        relative_humidity = relative_humidity.assign_coords(valid_time=temperature_k.coords["valid_time"])
    return relative_humidity
