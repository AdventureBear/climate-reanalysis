import numpy as np
import xarray as xr

from app.config import REGIONS
from app.map_pipeline.pipeline_steps import select_region


def _global_field():
    lat = np.arange(90, -91, -1)
    lon = np.arange(0, 360, 1)
    values = np.ones((len(lat), len(lon)))
    return xr.DataArray(
        values,
        coords={"latitude": lat, "longitude": lon},
        dims=("latitude", "longitude"),
    )


def test_wrapped_greenwich_region_is_not_empty():
    subset = select_region(_global_field(), REGIONS["Northern Africa"])

    assert subset.size > 0
    assert bool(subset.notnull().any())
    assert float(subset.longitude.min()) >= -27.5
    assert float(subset.longitude.max()) <= 62.5


def test_non_wrapped_region_keeps_0_360_longitudes():
    subset = select_region(_global_field(), REGIONS["Indian Ocean"])

    assert subset.size > 0
    assert float(subset.longitude.min()) >= 22.5
    assert float(subset.longitude.max()) <= 117.5


def test_southern_hemisphere_region_is_not_empty():
    subset = select_region(_global_field(), REGIONS["Southern Hemisphere"])

    assert subset.size > 0
    assert float(subset.latitude.min()) == -90.0
    assert float(subset.latitude.max()) <= -17.5
    assert float(subset.longitude.min()) == 0.0
    assert float(subset.longitude.max()) == 359.0
