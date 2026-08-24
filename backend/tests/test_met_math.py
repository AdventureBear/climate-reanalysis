import numpy as np
import pytest
import xarray as xr

from app.met_math import (
    CORE_EARTH_RADIUS_M,
    relative_humidity_from_components,
    relative_humidity_from_dewpoint,
    relative_humidity_from_dewpoint_components,
    relative_humidity_from_specific_humidity,
    relative_vorticity_from_components,
    saturation_vapor_pressure_bolton_hpa,
    vector_speed_from_components,
    vapor_pressure_from_specific_humidity_hpa,
    vector_magnitude,
    with_derived_metadata,
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


def test_vector_speed_from_components_sets_custom_long_name():
    valid_time = np.datetime64("2026-07-30T00:00")
    u = xr.DataArray([8.0], dims=("x",), coords={"valid_time": valid_time})
    v = xr.DataArray([15.0], dims=("x",), coords={"valid_time": valid_time})

    speed = vector_speed_from_components(u, v, long_name="Storm Motion")

    assert float(speed[0]) == 17.0
    assert speed.attrs["units"] == "m/s"
    assert speed.attrs["long_name"] == "Storm Motion"
    assert speed.coords["valid_time"].item() == valid_time


def test_relative_vorticity_from_components_uses_spherical_grid():
    lats = np.array([50.0, 40.0, 30.0, 20.0])
    lons = np.array([250.0, 260.0, 270.0, 280.0])
    lat_rad = np.deg2rad(lats)
    lon_rad = np.deg2rad(lons)
    expected_vorticity = 2.0e-5

    u_values = np.zeros((lats.size, lons.size))
    v_values = expected_vorticity * CORE_EARTH_RADIUS_M * np.cos(lat_rad)[:, None] * lon_rad[None, :]
    u = xr.DataArray(
        u_values,
        dims=("latitude", "longitude"),
        coords={"latitude": lats, "longitude": lons},
        attrs={"_pyre_obs_source": "CORe-pgb", "_pyre_grib_level": "500 mb"},
    )
    v = xr.DataArray(v_values, dims=u.dims, coords=u.coords)

    vorticity = relative_vorticity_from_components(u, v, preserve_grib_level=True)

    np.testing.assert_allclose(vorticity.values, expected_vorticity, rtol=1e-10, atol=1e-12)
    assert vorticity.attrs["units"] == "1/s"
    assert vorticity.attrs["long_name"] == "Relative Vorticity"
    assert vorticity.attrs["_pyre_obs_source"] == "CORe-pgb"
    assert vorticity.attrs["_pyre_grib_level"] == "500 mb"


def test_with_derived_metadata_sets_attrs_and_preserves_template_context():
    valid_time = np.datetime64("2026-07-30T00:00")
    template = xr.DataArray([1.0], dims=("x",), coords={"valid_time": valid_time})
    template.attrs["_pyre_obs_source"] = "CORe-pgb"
    template.attrs["_pyre_grib_level"] = "850 mb"
    derived = xr.DataArray([2.0], dims=("x",))

    result = with_derived_metadata(
        derived,
        units="widgets",
        long_name="Derived Widgets",
        template=template,
        obs_source_default="fallback",
        preserve_grib_level=True,
    )

    assert result.attrs["units"] == "widgets"
    assert result.attrs["long_name"] == "Derived Widgets"
    assert result.attrs["_pyre_obs_source"] == "CORe-pgb"
    assert result.attrs["_pyre_grib_level"] == "850 mb"
    assert result.coords["valid_time"].item() == valid_time


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
