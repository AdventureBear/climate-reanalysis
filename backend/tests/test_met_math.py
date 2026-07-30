import numpy as np
import pytest
import xarray as xr

from app.met_math import (
    relative_humidity_from_components,
    relative_humidity_from_dewpoint,
    relative_humidity_from_dewpoint_components,
    relative_humidity_from_specific_humidity,
    saturation_vapor_pressure_bolton_hpa,
    vapor_pressure_from_specific_humidity_hpa,
    vector_magnitude,
    wind_speed_from_components,
)


def test_vector_magnitude_accepts_numpy_arrays():
    u = np.array([3.0, 5.0])
    v = np.array([4.0, 12.0])

    np.testing.assert_allclose(vector_magnitude(u, v), np.array([5.0, 13.0]))


def test_wind_speed_from_components_sets_units_and_preserves_valid_time():
    valid_time = np.datetime64("2026-07-30T00:00")
    u = xr.DataArray([3.0], dims=("x",), coords={"valid_time": valid_time})
    v = xr.DataArray([4.0], dims=("x",), coords={"valid_time": valid_time})

    speed = wind_speed_from_components(u, v)

    assert float(speed[0]) == 5.0
    assert speed.attrs["units"] == "m/s"
    assert speed.attrs["long_name"] == "Wind Speed"
    assert speed.coords["valid_time"].item() == valid_time


def test_wind_speed_from_components_preserves_pyre_metadata_when_requested():
    u = xr.DataArray([8.0], dims=("x",))
    v = xr.DataArray([6.0], dims=("x",))
    u.attrs["_pyre_obs_source"] = "CORe-pgb"
    u.attrs["_pyre_grib_level"] = "850 mb"

    speed = wind_speed_from_components(
        u,
        v,
        obs_source_default="fallback",
        preserve_grib_level=True,
    )

    assert float(speed[0]) == 10.0
    assert speed.attrs["_pyre_obs_source"] == "CORe-pgb"
    assert speed.attrs["_pyre_grib_level"] == "850 mb"


def test_bolton_saturation_vapor_pressure_at_freezing():
    assert saturation_vapor_pressure_bolton_hpa(273.15) == pytest.approx(6.112)


def test_vapor_pressure_from_specific_humidity():
    vapor_pressure = vapor_pressure_from_specific_humidity_hpa(0.01, 850.0)

    assert vapor_pressure == pytest.approx(13.583048)


def test_relative_humidity_from_specific_humidity_clips_to_physical_range():
    low = relative_humidity_from_specific_humidity(0.0, 293.15, 850.0)
    high = relative_humidity_from_specific_humidity(0.02, 253.15, 850.0)

    assert low == 0.0
    assert high == 100.0


def test_relative_humidity_from_components_sets_units_and_preserves_valid_time():
    valid_time = np.datetime64("2026-07-30T00:00")
    specific_humidity = xr.DataArray([0.01], dims=("x",), coords={"valid_time": valid_time})
    temperature = xr.DataArray([293.15], dims=("x",), coords={"valid_time": valid_time})

    relative_humidity = relative_humidity_from_components(specific_humidity, temperature, 850.0)

    assert float(relative_humidity[0]) == pytest.approx(58.123045)
    assert relative_humidity.attrs["units"] == "%"
    assert relative_humidity.attrs["long_name"] == "Relative Humidity"
    assert relative_humidity.coords["valid_time"].item() == valid_time


def test_relative_humidity_from_dewpoint_uses_dewpoint_vapor_pressure():
    relative_humidity = relative_humidity_from_dewpoint(293.15, 283.15)

    assert relative_humidity == pytest.approx(52.511655)


def test_relative_humidity_from_dewpoint_components_sets_2m_metadata():
    valid_time = np.datetime64("2026-07-30T00:00")
    temperature = xr.DataArray([293.15], dims=("x",), coords={"valid_time": valid_time})
    dewpoint = xr.DataArray([283.15], dims=("x",), coords={"valid_time": valid_time})

    relative_humidity = relative_humidity_from_dewpoint_components(temperature, dewpoint)

    assert float(relative_humidity[0]) == pytest.approx(52.511655)
    assert relative_humidity.attrs["units"] == "%"
    assert relative_humidity.attrs["long_name"] == "2m Relative Humidity"
    assert relative_humidity.coords["valid_time"].item() == valid_time
