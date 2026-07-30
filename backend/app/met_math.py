from __future__ import annotations

from typing import Any

import numpy as np

from .units import kelvin_to_celsius


def with_derived_metadata(
    data: Any,
    *,
    units: str,
    long_name: str,
    template: Any | None = None,
    obs_source_default: str | None = None,
    preserve_grib_level: bool = False,
) -> Any:
    """Apply standard PyRe metadata to a derived xarray-like result."""
    if hasattr(data, "attrs"):
        data.attrs.update({"units": units, "long_name": long_name})
        template_attrs = getattr(template, "attrs", {})
        if obs_source_default is not None or "_pyre_obs_source" in template_attrs:
            data.attrs["_pyre_obs_source"] = template_attrs.get("_pyre_obs_source", obs_source_default)
        if preserve_grib_level:
            data.attrs["_pyre_grib_level"] = template_attrs.get("_pyre_grib_level", "")
    if template is not None and hasattr(data, "assign_coords") and "valid_time" in getattr(template, "coords", {}):
        data = data.assign_coords(valid_time=template.coords["valid_time"])
    return data


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
    return with_derived_metadata(
        speed,
        units="m/s",
        long_name="Wind Speed",
        template=u,
        obs_source_default=obs_source_default,
        preserve_grib_level=preserve_grib_level,
    )


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
    return with_derived_metadata(
        relative_humidity,
        units="%",
        long_name="Relative Humidity",
        template=specific_humidity,
    )


def relative_humidity_from_dewpoint_components(
    temperature_k: Any,
    dewpoint_k: Any,
) -> Any:
    """Derived relative humidity (%) from temperature and dewpoint DataArrays."""
    relative_humidity = relative_humidity_from_dewpoint(temperature_k, dewpoint_k)
    return with_derived_metadata(
        relative_humidity,
        units="%",
        long_name="2m Relative Humidity",
        template=temperature_k,
    )
