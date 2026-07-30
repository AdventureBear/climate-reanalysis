import numpy as np
import xarray as xr

from app.visualizer import describe_color_scale


def test_wind_vector_anomaly_experiment_scale_uses_one_knot_bins():
    data = xr.DataArray(
        np.array([[0.0, 3.0]], dtype=float),
        dims=("latitude", "longitude"),
        coords={"latitude": [10.0], "longitude": [70.0, 72.5]},
    )

    scale = describe_color_scale(
        variable="wind_speed",
        level=850,
        color_step=1,
        mode="anomaly",
        data_array=data,
        wind_unit="kt",
    )

    assert scale["scale_kind"] == "vector-anomaly-magnitude"
    assert scale["variant"] == "esrl-1kt-experiment"
    assert scale["unit"] == "kt"
    assert scale["step"] == 1.0
    assert scale["boundaries"][:5] == [1.0, 2.0, 3.0, 4.0, 5.0]
