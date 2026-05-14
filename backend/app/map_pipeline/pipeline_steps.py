from __future__ import annotations

from typing import Protocol

from ..config import VARIABLES


class AnalysisRequest(Protocol):
    variable: str
    level: int
    mode: str
    wind_anomaly_style: str


def is_vector_wind_anomaly(req: AnalysisRequest) -> bool:
    return req.variable == "wind_speed" and req.mode == "anomaly" and req.wind_anomaly_style == "vector_mag"


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
    speed = (u ** 2 + v ** 2) ** 0.5
    speed.attrs.update({"units": "m/s", "long_name": "Wind Speed"})
    speed.attrs["_pyre_obs_source"] = u.attrs.get("_pyre_obs_source", "CORe-pgb")
    return speed


def compute_vector_anomaly(obs_u, obs_v, climo_u, climo_v, obs_template):
    anomaly_u = obs_u - climo_u
    anomaly_v = obs_v - climo_v
    magnitude = (anomaly_u ** 2 + anomaly_v ** 2) ** 0.5
    magnitude.attrs.update({"units": "m/s", "long_name": "Wind Vector Anomaly Magnitude"})
    if "valid_time" in obs_template.coords:
        magnitude = magnitude.assign_coords(valid_time=obs_template.coords["valid_time"])
    return anomaly_u, anomaly_v, magnitude


def normalized_mask_threshold(variable: str, level: int):
    thresh_cfg = VARIABLES[variable].get("normalized_mask_threshold")
    if isinstance(thresh_cfg, dict):
        return thresh_cfg[min(thresh_cfg, key=lambda k: abs(k - level))]
    return thresh_cfg


def compute_normalized_anomaly(obs, climo_mean, climo_std, abs_threshold):
    safe_std = climo_std.where(climo_std > 1e-6)
    subset = (obs - climo_mean) / safe_std
    if abs_threshold is None:
        return subset, 0, int(subset.notnull().sum())

    n_before = int(subset.notnull().sum())
    subset = subset.where(obs >= abs_threshold)
    n_masked = n_before - int(subset.notnull().sum())
    return subset, n_masked, n_before
