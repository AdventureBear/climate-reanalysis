import numpy as np
import pytest

from app.units import (
    celsius_to_fahrenheit,
    celsius_to_kelvin,
    delta_celsius_to_delta_fahrenheit,
    fahrenheit_to_kelvin,
    kelvin_to_celsius,
    kelvin_to_fahrenheit,
    knots_to_meters_per_second,
    meters_per_second_to_knots,
    meters_to_inches,
    millimeters_to_inches,
    pascals_to_hpa,
    precipitation_rate_to_mm_day,
)


def test_wind_speed_conversions():
    assert knots_to_meters_per_second(10.0) == pytest.approx(5.1444)
    assert meters_per_second_to_knots(0.51444) == pytest.approx(1.0)


def test_temperature_conversions():
    assert kelvin_to_celsius(273.15) == pytest.approx(0.0)
    assert celsius_to_kelvin(0.0) == pytest.approx(273.15)
    assert kelvin_to_fahrenheit(273.15) == pytest.approx(32.0)
    assert fahrenheit_to_kelvin(32.0) == pytest.approx(273.15)
    assert celsius_to_fahrenheit(10.0) == pytest.approx(50.0)
    assert delta_celsius_to_delta_fahrenheit(10.0) == pytest.approx(18.0)


def test_hydrology_and_pressure_conversions():
    assert precipitation_rate_to_mm_day(1.0) == pytest.approx(86400.0)
    assert pascals_to_hpa(100000.0) == pytest.approx(1000.0)
    assert meters_to_inches(1.0) == pytest.approx(39.3701)
    assert millimeters_to_inches(25.4) == pytest.approx(1.0)


def test_conversions_support_numpy_arrays():
    values = np.array([273.15, 274.15])

    np.testing.assert_allclose(kelvin_to_celsius(values), np.array([0.0, 1.0]))
