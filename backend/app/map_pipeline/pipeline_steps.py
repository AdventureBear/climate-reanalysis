from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..config import VARIABLES
from ..met_math import vector_magnitude
from ..met_math import wind_speed_from_components as _wind_speed_from_components


class AnalysisRequest(Protocol):
    variable: str
    level: int
    mode: str


@dataclass(frozen=True)
class NormalizedAnomalyMaskStats:
    total_valid_input: int
    invalid_sigma_masked: int
    threshold_masked: int
    final_valid: int


def is_vector_wind_anomaly(req: AnalysisRequest) -> bool:
    return req.variable == "wind_speed" and req.mode in ("anomaly", "normalized")


def select_region(da, bounds: dict):
    lat_subset = da.sel(latitude=slice(bounds["lat"][1], bounds["lat"][0]))
    lon_min, lon_max = bounds["lon"]
    if lon_min <= lon_max:
        return lat_subset.sel(longitude=slice(lon_min, lon_max))

    west = lat_subset.sel(longitude=slice(lon_min, 360))
    east = lat_subset.sel(longitude=slice(0, lon_max))
    west = west.assign_coords(longitude=((west.longitude + 180) % 360) - 180)
    return west.combine_first(east).sortby("longitude")


def wind_speed_from_components(u, v):
    return _wind_speed_from_components(
        u,
        v,
        obs_source_default="CORe-pgb",
        preserve_grib_level=True,
    )


def compute_vector_anomaly(obs_u, obs_v, climo_u, climo_v, obs_template):
    anomaly_u = obs_u - climo_u
    anomaly_v = obs_v - climo_v
    magnitude = vector_magnitude(anomaly_u, anomaly_v)
    magnitude.attrs.update({"units": "m/s", "long_name": "Wind Vector Anomaly Magnitude"})
    if "valid_time" in obs_template.coords:
        magnitude = magnitude.assign_coords(valid_time=obs_template.coords["valid_time"])
    return anomaly_u, anomaly_v, magnitude


def vector_sigma_from_component_std(u_std, v_std):
    sigma = vector_magnitude(u_std, v_std)
    sigma.attrs.update({"units": "m/s", "long_name": "Wind Vector Variability"})
    return sigma


def normalized_mask_threshold(variable: str, level: int):
    thresh_cfg = VARIABLES[variable].get("normalized_mask_threshold")
    if isinstance(thresh_cfg, dict):
        return thresh_cfg[min(thresh_cfg, key=lambda k: abs(k - level))]
    return thresh_cfg


def compute_normalized_anomaly(obs, climo_mean, climo_std, abs_threshold):
    valid_input = obs.notnull() & climo_mean.notnull() & climo_std.notnull()
    total_valid_input = int(valid_input.sum())

    safe_std = climo_std.where(climo_std > 1e-6)
    subset = (obs - climo_mean) / safe_std
    valid_after_sigma = int(subset.notnull().sum())
    invalid_sigma_masked = total_valid_input - valid_after_sigma

    if abs_threshold is None:
        return subset, NormalizedAnomalyMaskStats(
            total_valid_input=total_valid_input,
            invalid_sigma_masked=invalid_sigma_masked,
            threshold_masked=0,
            final_valid=valid_after_sigma,
        )

    subset = subset.where(obs >= abs_threshold)
    final_valid = int(subset.notnull().sum())
    return subset, NormalizedAnomalyMaskStats(
        total_valid_input=total_valid_input,
        invalid_sigma_masked=invalid_sigma_masked,
        threshold_masked=valid_after_sigma - final_valid,
        final_valid=final_valid,
    )


def compute_normalized_vector_anomaly(obs_u, obs_v, climo_u, climo_v, vector_std, obs_template):
    anomaly_u, anomaly_v, magnitude = compute_vector_anomaly(
        obs_u,
        obs_v,
        climo_u,
        climo_v,
        obs_template,
    )
    valid_input = (
        obs_u.notnull()
        & obs_v.notnull()
        & climo_u.notnull()
        & climo_v.notnull()
        & vector_std.notnull()
    )
    total_valid_input = int(valid_input.sum())

    safe_std = vector_std.where(vector_std > 1e-6)
    subset = magnitude / safe_std
    final_valid = int(subset.notnull().sum())
    subset.attrs.update({"units": "sigma", "long_name": "Wind Vector Normalized Anomaly Magnitude"})
    return anomaly_u, anomaly_v, subset, NormalizedAnomalyMaskStats(
        total_valid_input=total_valid_input,
        invalid_sigma_masked=total_valid_input - final_valid,
        threshold_masked=0,
        final_valid=final_valid,
    )
