from __future__ import annotations

from dataclasses import dataclass

from .config import VARIABLES


@dataclass(frozen=True)
class ResolvedVariable:
    variable: str
    level: int


CLOUD_COVER_LEVELS = {
    "": "cloud_cover_total",
    "total": "cloud_cover_total",
    "total_column": "cloud_cover_total",
    "column": "cloud_cover_total",
    "atmos_col": "cloud_cover_total",
    "atmospheric_column": "cloud_cover_total",
    "low": "cloud_cover_low",
    "low_cloud": "cloud_cover_low",
    "middle": "cloud_cover_middle",
    "mid": "cloud_cover_middle",
    "mid_level": "cloud_cover_middle",
    "middle_cloud": "cloud_cover_middle",
    "high": "cloud_cover_high",
    "high_cloud": "cloud_cover_high",
    "boundary": "cloud_cover_boundary",
    "boundary_layer": "cloud_cover_boundary",
    "boundary_cloud": "cloud_cover_boundary",
    "convective": "cloud_cover_convective",
    "convective_cloud": "cloud_cover_convective",
}

RADIATION_LEVELS = {
    "": "surface",
    "surface": "surface",
    "sfc": "surface",
    "toa": "toa",
    "top": "toa",
    "top_of_atmosphere": "toa",
}

RADIATION_WAVEBANDS = {
    "": "shortwave",
    "shortwave": "shortwave",
    "sw": "shortwave",
    "longwave": "longwave",
    "lw": "longwave",
}

RADIATION_DIRECTIONS = {
    "": "",
    "down": "down",
    "downward": "down",
    "incoming": "down",
    "in": "down",
    "up": "up",
    "upward": "up",
    "outgoing": "up",
    "out": "up",
}

RADIATION_VARIABLES = {
    ("surface", "shortwave", "down"): "radiation_sw_down_surface",
    ("surface", "shortwave", "up"): "radiation_sw_up_surface",
    ("surface", "longwave", "down"): "radiation_lw_down_surface",
    ("surface", "longwave", "up"): "radiation_lw_up_surface",
    ("toa", "shortwave", "down"): "radiation_sw_down_toa",
    ("toa", "shortwave", "up"): "radiation_sw_up_toa",
    ("toa", "longwave", "up"): "olr",
}

LIFTED_INDEX_LEVELS = {
    "": "lifted_index_surface",
    "surface": "lifted_index_surface",
    "sfc": "lifted_index_surface",
    "surface_parcel": "lifted_index_surface",
    "4_layer": "lifted_index_best",
    "4layer": "lifted_index_best",
    "best": "lifted_index_best",
    "best_4_layer": "lifted_index_best",
    "best_4layer": "lifted_index_best",
    "0_30mb": "lifted_index_parcel",
    "0_30_mb": "lifted_index_parcel",
    "30_0mb": "lifted_index_parcel",
    "30_0_mb": "lifted_index_parcel",
    "parcel": "lifted_index_parcel",
}


def _normal_key(value: object) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _parse_int_level(level: object) -> int:
    if str(level or "").strip() == "":
        return 850
    try:
        return int(str(level).strip())
    except (TypeError, ValueError):
        raise ValueError(f"level must be a pressure level for this variable, got {level!r}") from None


def resolve_variable_selection(
    variable: str,
    level: object,
    *,
    waveband: str = "",
    direction: str = "",
) -> ResolvedVariable:
    """Resolve public URL selectors to concrete map registry variables."""
    if variable == "cloud_cover":
        key = _normal_key(level)
        concrete = CLOUD_COVER_LEVELS.get(key)
        if concrete is None:
            allowed = ["total_column", "low", "middle", "high", "boundary", "convective"]
            raise ValueError(f"cloud_cover level must be one of {allowed}")
        return ResolvedVariable(concrete, 1000)

    if variable == "radiation":
        level_key = RADIATION_LEVELS.get(_normal_key(level))
        if level_key is None:
            raise ValueError("radiation level must be 'surface' or 'toa'")
        waveband_key = RADIATION_WAVEBANDS.get(_normal_key(waveband))
        if waveband_key is None:
            raise ValueError("radiation waveband must be 'shortwave' or 'longwave'")
        direction_key = RADIATION_DIRECTIONS.get(_normal_key(direction))
        if direction_key is None:
            raise ValueError("radiation direction must be 'down' or 'up'")
        if not direction_key:
            direction_key = "up" if level_key == "toa" and waveband_key == "longwave" else "down"
        concrete = RADIATION_VARIABLES.get((level_key, waveband_key, direction_key))
        if concrete is None:
            raise ValueError(
                f"radiation combination is not available: level={level_key}, "
                f"waveband={waveband_key}, direction={direction_key}"
            )
        return ResolvedVariable(concrete, 1000)

    if variable == "lifted_index":
        concrete = LIFTED_INDEX_LEVELS.get(_normal_key(level))
        if concrete is None:
            allowed = ["surface", "4-layer", "0-30mb"]
            raise ValueError(f"lifted_index level must be one of {allowed}")
        return ResolvedVariable(concrete, 1000)

    if variable not in VARIABLES:
        raise ValueError(f"variable must be one of {list(VARIABLES.keys()) + ['cloud_cover', 'radiation', 'lifted_index']}")
    return ResolvedVariable(variable, _parse_int_level(level))
