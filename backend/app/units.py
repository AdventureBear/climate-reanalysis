from __future__ import annotations

from typing import Any

KT_TO_MS = 0.51444
MS_TO_KT = 1.0 / KT_TO_MS
MM_TO_IN = 0.03937007874
M_TO_IN = 39.3701
PRATE_TO_MM_DAY = 86400.0
PA_TO_HPA = 0.01
VORTICITY_TO_1E5 = 1e5
KELVIN_OFFSET_C = 273.15


def knots_to_meters_per_second(value: Any) -> Any:
    return value * KT_TO_MS


def meters_per_second_to_knots(value: Any) -> Any:
    return value * MS_TO_KT


def millimeters_to_inches(value: Any) -> Any:
    return value * MM_TO_IN


def meters_to_inches(value: Any) -> Any:
    return value * M_TO_IN


def precipitation_rate_to_mm_day(value: Any) -> Any:
    return value * PRATE_TO_MM_DAY


def pascals_to_hpa(value: Any) -> Any:
    return value * PA_TO_HPA


def kelvin_to_celsius(value: Any) -> Any:
    return value - KELVIN_OFFSET_C


def celsius_to_kelvin(value: Any) -> Any:
    return value + KELVIN_OFFSET_C


def fahrenheit_to_kelvin(value: Any) -> Any:
    return (value - 32.0) * 5.0 / 9.0 + KELVIN_OFFSET_C


def kelvin_to_fahrenheit(value: Any) -> Any:
    return kelvin_to_celsius(value) * 9.0 / 5.0 + 32.0


def celsius_to_fahrenheit(value: Any) -> Any:
    return value * 9.0 / 5.0 + 32.0


def delta_celsius_to_delta_fahrenheit(value: Any) -> Any:
    return value * 9.0 / 5.0
