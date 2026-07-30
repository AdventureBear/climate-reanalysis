import numpy as np
import xarray as xr

from app.map_pipeline.pipeline_steps import (
    compute_normalized_anomaly,
    compute_normalized_vector_anomaly,
    is_vector_wind_anomaly,
    normalized_mask_threshold,
    vector_sigma_from_component_std,
)
from app.map_pipeline.request import MapRequest


def _da(values):
    return xr.DataArray(np.array(values, dtype=float), dims=("point",))


def test_normalized_anomaly_masks_tiny_sigma_only():
    obs = _da([3.0, 3.0, 3.0])
    climo_mean = _da([1.0, 1.0, 1.0])
    climo_std = _da([1.0, 0.0, 1e-7])

    result, stats = compute_normalized_anomaly(obs, climo_mean, climo_std, None)

    assert result.values[0] == 2.0
    assert np.isnan(result.values[1])
    assert np.isnan(result.values[2])
    assert stats.total_valid_input == 3
    assert stats.invalid_sigma_masked == 2
    assert stats.threshold_masked == 0
    assert stats.final_valid == 1


def test_normalized_wind_uses_vector_departure_not_scalar_speed():
    obs_u = _da([4.0])
    obs_v = _da([0.0])
    climo_u = _da([0.0])
    climo_v = _da([3.0])
    vector_std = _da([5.0])

    _, _, result, stats = compute_normalized_vector_anomaly(
        obs_u,
        obs_v,
        climo_u,
        climo_v,
        vector_std,
        obs_u,
    )

    # Scalar speeds are nearly identical (4 vs 3), but the vector departure is
    # sqrt(4^2 + -3^2) = 5, so the normalized vector anomaly is 1 sigma.
    np.testing.assert_allclose(result.values, [1.0])
    assert stats.invalid_sigma_masked == 0
    assert stats.threshold_masked == 0
    assert stats.final_valid == 1


def test_normalized_vector_anomaly_masks_tiny_vector_sigma():
    obs_u = _da([1.0, 1.0])
    obs_v = _da([0.0, 0.0])
    climo_u = _da([0.0, 0.0])
    climo_v = _da([0.0, 0.0])
    vector_std = _da([1.0, 1e-7])

    _, _, result, stats = compute_normalized_vector_anomaly(
        obs_u,
        obs_v,
        climo_u,
        climo_v,
        vector_std,
        obs_u,
    )

    assert result.values[0] == 1.0
    assert np.isnan(result.values[1])
    assert stats.invalid_sigma_masked == 1
    assert stats.final_valid == 1


def test_vector_sigma_combines_component_variability():
    u_std = _da([3.0])
    v_std = _da([4.0])

    result = vector_sigma_from_component_std(u_std, v_std)

    np.testing.assert_allclose(result.values, [5.0])


def test_optional_absolute_threshold_still_masks_non_wind_cases():
    obs = _da([0.5, 2.0, 3.0])
    climo_mean = _da([0.0, 0.0, 0.0])
    climo_std = _da([1.0, 1.0, 1.0])

    result, stats = compute_normalized_anomaly(obs, climo_mean, climo_std, 2.0)

    assert np.isnan(result.values[0])
    np.testing.assert_allclose(result.values[1:], [2.0, 3.0])
    assert stats.invalid_sigma_masked == 0
    assert stats.threshold_masked == 1
    assert stats.final_valid == 2


def test_wind_normalized_paths_resolve_no_absolute_threshold():
    assert normalized_mask_threshold("wind_speed", 1000) is None
    assert normalized_mask_threshold("wind_speed", 850) is None
    assert normalized_mask_threshold("wind_speed", 250) is None


def test_wind_normalized_resolves_to_vector_path():
    assert is_vector_wind_anomaly(MapRequest(variable="wind_speed", mode="normalized"))
    assert is_vector_wind_anomaly(MapRequest(variable="wind_speed", mode="anomaly"))
    assert not is_vector_wind_anomaly(MapRequest(variable="temp", mode="normalized"))
