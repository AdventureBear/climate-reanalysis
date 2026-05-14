import io

import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib.cm as mcm
import matplotlib.colorbar as mcolorbar
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np

# ── Per-region map projection and extent ─────────────────────────────────────────
# Extent is in -180/180 lon convention (passed with crs=PlateCarree to set_extent).
# Data arrives in 0-360; Cartopy handles the wrap transparently via transform=.

_REGION_PROJECTIONS: dict[str, ccrs.Projection] = {
    "CONUS": ccrs.AlbersEqualArea(
        central_longitude=-96,
        central_latitude=37.5,
        standard_parallels=(29.5, 45.5),  # USGS standard parallels for CONUS
    ),
    "Northwest US": ccrs.AlbersEqualArea(central_longitude=-118, central_latitude=44, standard_parallels=(34, 46)),
    "Northern Plains": ccrs.AlbersEqualArea(central_longitude=-99, central_latitude=45, standard_parallels=(36, 48)),
    "Central Plains": ccrs.AlbersEqualArea(central_longitude=-97, central_latitude=39, standard_parallels=(31, 43)),
    "Northeast": ccrs.AlbersEqualArea(central_longitude=-73, central_latitude=43, standard_parallels=(38, 46)),
    "Eastern US": ccrs.AlbersEqualArea(central_longitude=-80, central_latitude=36, standard_parallels=(26, 43)),
    "Southwest US": ccrs.AlbersEqualArea(central_longitude=-114, central_latitude=35, standard_parallels=(29, 39)),
    "South Central": ccrs.AlbersEqualArea(central_longitude=-96, central_latitude=32, standard_parallels=(26, 36)),
    "Southeast US": ccrs.AlbersEqualArea(central_longitude=-82, central_latitude=31, standard_parallels=(25, 35)),
    "Western US": ccrs.AlbersEqualArea(central_longitude=-115, central_latitude=39, standard_parallels=(32, 45)),
    "Alaska": ccrs.NorthPolarStereo(central_longitude=-150),
    "Hawaii": ccrs.PlateCarree(),
    "North America": ccrs.PlateCarree(),
    "Northern Hemisphere": ccrs.PlateCarree(),
    "North Pacific": ccrs.PlateCarree(central_longitude=180),
    "Northern Africa": ccrs.PlateCarree(),
    "Europe": ccrs.PlateCarree(),
    "Asia": ccrs.PlateCarree(),
    "Middle East": ccrs.PlateCarree(),
    "East Asia": ccrs.PlateCarree(),
    "Australia": ccrs.PlateCarree(),
    "Southeast Canada": ccrs.PlateCarree(),
    "Western Canada": ccrs.PlateCarree(),
    "Canada": ccrs.PlateCarree(),
    "South America": ccrs.PlateCarree(),
    "World": ccrs.PlateCarree(central_longitude=180),
    "Indian Ocean": ccrs.PlateCarree(),
    "North Atlantic": ccrs.PlateCarree(),
    "Western Atlantic": ccrs.PlateCarree(),
    "Tropical Atlantic": ccrs.PlateCarree(),
    "Western Pacific": ccrs.PlateCarree(),
    "Central Pacific": ccrs.PlateCarree(),
    "Eastern Pacific": ccrs.PlateCarree(),
    "Southwest Pacific": ccrs.PlateCarree(),
    "Southeast Pacific": ccrs.PlateCarree(),
    "India": ccrs.PlateCarree(),
    "Southern Africa": ccrs.PlateCarree(),
}

_REGION_EXTENTS: dict[str, tuple[float, float, float, float]] = {
    "CONUS": (-125, -66, 24, 50),   # (lon_min, lon_max, lat_min, lat_max)
    "Northwest US": (-126, -108, 40, 50),
    "Northern Plains": (-106, -90, 41, 50),
    "Central Plains": (-103, -89, 33, 46),
    "Northeast": (-79, -66, 39, 48),
    "Eastern US": (-90, -66, 25, 47),
    "Southwest US": (-124, -108, 30, 40),
    "South Central": (-104, -89, 26, 37),
    "Southeast US": (-90, -74, 24, 37),
    "Western US": (-125, -103, 31, 49),
    "Alaska": (-172, -129, 50, 72),
    "Hawaii": (-161, -154, 18, 23),
    "North America": (-170, -30, 10, 80),
    "Northern Hemisphere": (-180, 180, 0, 90),
    "North Pacific": (120, -100, 0, 65),
    "Northern Africa": (-25, 55, 0, 35),
    "Europe": (-15, 40, 30, 72),
    "Asia": (55, 155, 5, 65),
    "Middle East": (25, 75, 5, 42),
    "East Asia": (95, 155, 10, 55),
    "Australia": (110, 160, -45, -8),
    "Southeast Canada": (-100, -40, 40, 68),
    "Western Canada": (-140, -85, 45, 75),
    "Canada": (-140, -40, 42, 82),
    "South America": (-90, -30, -58, 15),
    "World": (-180, 180, -60, 85),
    "Indian Ocean": (30, 110, -15, 40),
    "North Atlantic": (-85, -15, 0, 40),
    "Western Atlantic": (-100, -45, 0, 40),
    "Tropical Atlantic": (-65, 0, -5, 30),
    "Western Pacific": (110, 180, -5, 35),
    "Central Pacific": (-179, -120, -5, 30),
    "Eastern Pacific": (-150, -80, -10, 30),
    "Southwest Pacific": (140, 180, -30, 5),
    "Southeast Pacific": (-140, -70, -35, 5),
    "India": (60, 100, 0, 35),
    "Southern Africa": (10, 45, -35, 5),
}

# ── Wind speed scale ─────────────────────────────────────────────────────────────
# Source: Pivotal Weather. Same color sequence for all levels; only the m/s
# thresholds at each step change. See .claude/planning/COLOR_SCALES.md.

_WIND_COLORS = [
    '#f2f9ff', '#87cefa', '#6b5acc', '#e695db', '#c95bbe',
    '#a11397', '#c90028', '#de2a3c', '#f04f4f',
    '#faf061', '#faf061', '#8b5a2b', '#a15d0a',
]

# Same 13 colors for every level — only the kt range (min, max) changes.
# 600mb defaults to the 700mb (low) range; try "mid" if winds look clipped.
# 400mb defaults to the 500mb (mid) range; try "high" if winds look clipped.
_KT_TO_MS = 0.51444

_WIND_SCALE_CONFIGS: dict[str, dict] = {
    "surface": {
        "mapping": "scaled",
        "domain_min": 10,
        "domain_max": 60,
        "anchor_colors": _WIND_COLORS,
        "key_breakpoints": [],
    },
    "low": {
        "mapping": "scaled",
        "domain_min": 20,
        "domain_max": 80,
        "anchor_colors": _WIND_COLORS,
        "key_breakpoints": [],
    },
    "mid": {
        "mapping": "scaled",
        "domain_min": 20,
        "domain_max": 140,
        "anchor_colors": _WIND_COLORS,
        "key_breakpoints": [],
    },
    "high": {
        "mapping": "scaled",
        "domain_min": 50,
        "domain_max": 170,
        "anchor_colors": _WIND_COLORS,
        "key_breakpoints": [],
    },
}


_QUIVER_BASE_SCALE = 520  # calibrated at 925/850mb (80kt max); ~10% longer than prior value


def _wind_unit_factor(wind_unit: str) -> float:
    return 1.0 if wind_unit == "m/s" else 1.0 / _KT_TO_MS


def _wind_unit_label(wind_unit: str) -> str:
    return "m/s" if wind_unit == "m/s" else "kt"


def _wind_display_value(value_ms: float, wind_unit: str) -> float:
    return value_ms * _wind_unit_factor(wind_unit)


def _wind_scale_display_value(value_kt: float, wind_unit: str) -> float:
    return value_kt * _KT_TO_MS if wind_unit == "m/s" else value_kt


def _interval_midpoints(boundaries: list[float]) -> list[float]:
    """Return the center value of each color interval defined by boundaries."""
    return [
        (boundaries[i] + boundaries[i + 1]) / 2
        for i in range(len(boundaries) - 1)
    ]


def _resolve_anchor_values(scale_cfg: dict) -> list[float]:
    mapping = scale_cfg["mapping"]
    if mapping == "fixed_anchors":
        return list(scale_cfg["anchor_values"])
    if mapping == "scaled":
        n = len(scale_cfg["anchor_colors"])
        v0 = scale_cfg["domain_min"]
        v1 = scale_cfg["domain_max"]
        if n == 1:
            return [v0]
        return [v0 + i * (v1 - v0) / (n - 1) for i in range(n)]
    raise ValueError(f"unsupported scale mapping: {mapping}")


def _interpolate_interval_colors(
    boundaries: list[float],
    anchor_values: list[float],
    anchor_hex: list[str],
) -> list[tuple[float, float, float]]:
    """
    Reusable fixed-scale color sampling:
    - boundaries define the actual color intervals shown on the bar/map
    - anchor_values define where sampled palette colors live along that scale
    - colors are evaluated at interval midpoints, so the result stays visually
      proportional regardless of absolute magnitudes or breakpoint spacing
    """
    mids = _interval_midpoints(boundaries)
    anchor_rgb = np.array([mcolors.to_rgb(c) for c in anchor_hex])
    colors = []
    for value in mids:
        r = float(np.interp(value, anchor_values, anchor_rgb[:, 0]))
        g = float(np.interp(value, anchor_values, anchor_rgb[:, 1]))
        b = float(np.interp(value, anchor_values, anchor_rgb[:, 2]))
        colors.append((r, g, b))
    return colors

def _quiver_scale(level: int) -> int:
    """
    Scale quiver arrows so visual length stays roughly constant across levels despite
    increasing wind speeds aloft. 1000mb is treated the same as the low group.
    Formula: base_scale * (this_group_max_kt / low_group_max_kt)
    """
    if level in (500, 400):
        max_kt = _WIND_SCALE_CONFIGS["mid"]["domain_max"]
    elif level not in (925, 850, 700, 600, 1000):
        max_kt = _WIND_SCALE_CONFIGS["high"]["domain_max"]
    else:
        max_kt = _WIND_SCALE_CONFIGS["low"]["domain_max"]
    return round(_QUIVER_BASE_SCALE * max_kt / _WIND_SCALE_CONFIGS["low"]["domain_max"])


def _make_wind_scale(
    level: int,
    step_kt: int = 1,
    scale_overrides: dict[str, float] | None = None,
) -> tuple[list[float], list[tuple], int, int]:
    """
    Interpolate wind colors at step_kt resolution across the level's kt range.
    Colors are sampled at interval midpoints, not interval edges, so the first
    and last anchor colors occupy their full bins instead of appearing visually
    compressed toward the center of the bar.
    """
    _, scale_cfg = _resolved_wind_scale_config(level, scale_overrides)
    min_kt = scale_cfg["domain_min"]
    max_kt = scale_cfg["domain_max"]
    anchor_kt = _resolve_anchor_values(scale_cfg)
    steps_kt = np.arange(min_kt, max_kt, step_kt, dtype=float).tolist()
    if not steps_kt or abs(steps_kt[0] - min_kt) > 1e-9:
        steps_kt.insert(0, float(min_kt))
    if abs(steps_kt[-1] - max_kt) > 1e-9:
        steps_kt.append(float(max_kt))
    colors = _interpolate_interval_colors(steps_kt, anchor_kt, scale_cfg["anchor_colors"])

    breakpoints_ms = [round(kt * _KT_TO_MS, 3) for kt in steps_kt]
    return breakpoints_ms, colors, min_kt, max_kt


# ── Temperature scales ────────────────────────────────────────────────────────────
# Anchors sampled at key meteorological thresholds; RGB interpolated at 1°F steps.
# Colorbar displays every 10°F. Add new levels by extending _TEMP_SCALES.
# See .claude/planning/COLOR_SCALES.md.

# 925/850/700mb share the same anchor colors and temperatures (°C).
# 700mb simply stops at +30°C instead of +40°C.
_TEMP_LOW_ANCHORS_C  = [-40, -20,  -9,   1,   2,   9,  27,  37,  40]
_TEMP_LOW_ANCHOR_HEX = [
    '#b4ede1', '#8a27ab', '#dfecf2', '#1650b5', '#10505e',
    '#f2f1a7', '#610000', '#f2e7dc', '#c7bfb7',
]

_TEMP_SCALES: dict[int, dict] = {
    1000: {
        "mapping": "fixed_anchors",
        "unit": "F",
        "anchors":    [-60, -40,   0,   1,  15,  31,  32,   50,   70,   80,  81,  100, 120],
        "anchor_hex": [
            '#2a4d73', '#ace3db', '#7a26ab', '#a149b3', '#d8e3eb',
            '#1650b5', '#104354', '#f2f1a7', '#610d0c', '#7d2f43',
            '#7a4036', '#f2e7dc', '#4a4a44',
        ],
        "t_min": -60,
        "t_max": 120,
        "key_breakpoints": [32],
    },
    925: {"mapping": "fixed_anchors", "unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  40, "key_breakpoints": [0]},
    850: {"mapping": "fixed_anchors", "unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  40, "key_breakpoints": [0]},
    700: {"mapping": "fixed_anchors", "unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  30, "key_breakpoints": [0]},
}


def _f_to_k(f: float) -> float:
    return (f - 32.0) * 5.0 / 9.0 + 273.15


def _c_to_k(c: float) -> float:
    return c + 273.15


def _make_temp_scale(cfg: dict, step: int = 1) -> tuple[list[float], list[tuple], callable]:
    """
    Build a discrete temperature scale from a _TEMP_SCALES config entry.
    step controls bucket size in display units (1 = fine, 5 = coarse zones, etc.).
    Returns (breakpoints_K, interval_RGB_colors, to_k_fn).
    """
    to_k = _c_to_k if cfg["unit"] == "C" else _f_to_k
    steps = list(range(cfg["t_min"], cfg["t_max"], step)) + [cfg["t_max"]]
    scale_cfg = {
        "mapping": cfg["mapping"],
        "anchor_values": cfg["anchors"],
        "anchor_colors": cfg["anchor_hex"],
    }
    colors = _interpolate_interval_colors(steps, _resolve_anchor_values(scale_cfg), cfg["anchor_hex"])
    breakpoints_k = [round(to_k(t), 4) for t in steps]
    return breakpoints_k, colors, to_k


def display_unit(variable: str, level: int, wind_unit: str = "kt") -> str:
    """
    Single source of truth for the unit string shown on map titles and colorbars.
    Always matches what the colorbar actually displays.
    """
    if variable == "wind_speed":
        return _wind_unit_label(wind_unit)
    if variable == "temp":
        cfg = _TEMP_SCALES.get(level)
        return f"°{cfg['unit']}" if cfg else "K"
    if variable == "rel_humidity":
        return "%"
    if variable == "height":
        return "dam"
    if variable == "humidity":
        return "kg/kg"
    return ""


# ── Relative humidity scale ───────────────────────────────────────────────────────
# 1 % steps, 0–100 %. Breakpoints are plain percentages (data is already in %).
_RH_ANCHORS_PCT = [  0,   9,  39,  40,  89,  90, 100]
_RH_ANCHOR_HEX  = ['#c87800', '#2d0d04', '#f0e8d0', '#c8f0c0', '#0f4c0f', '#0a3d0a', '#0a1860']
_RH_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0,
    "domain_max": 100,
    "anchor_values": _RH_ANCHORS_PCT,
    "anchor_colors": _RH_ANCHOR_HEX,
    "key_breakpoints": [70, 90],
}


def _make_rh_scale(step: int = 1) -> tuple[list[int], list[tuple]]:
    """Breakpoints (0–100 %) and RGB interval colors at the given % step size."""
    steps = list(range(0, 100, step)) + [100]
    colors = _interpolate_interval_colors(
        steps,
        _resolve_anchor_values(_RH_SCALE_CONFIG),
        _RH_SCALE_CONFIG["anchor_colors"],
    )
    return steps, colors


# ── Placeholder scales for other variables ────────────────────────────────────────
_VAR_CMAPS = {
    "humidity": "YlGnBu",
}


# ── Diverging anomaly scale ───────────────────────────────────────────────────────
# Blue → white → red. Anchors normalized to [-1, 1]; interpolated at runtime.

_DIV_ANCHORS = [-1.0, -0.7, -0.4, -0.1, 0.0, 0.1, 0.4, 0.7, 1.0]
_DIV_HEX     = [
    "#053061", "#2166ac", "#92c5de", "#d1e5f0", "#f7f7f7",
    "#fddbc7", "#d6604d", "#b2182b", "#67001f",
]

# Per-variable anomaly scale: (max_display_value, natural_step) in display units.
# color_step from the UI multiplies the natural_step.
_ANOMALY_SCALES: dict[str, tuple[float, float]] = {
    "wind_speed":   (20.0, 2.0),    # kt
    "temp":         (10.0, 1.0),    # °C / °F
    "height":       (39.0, 3.0),    # dam
    "rel_humidity": (30.0, 3.0),    # %
    "humidity":     (0.003, 0.0003),
}

_WIND_VECTOR_ANOMALY_HEX = [
    "#ffffff", "#d8d5ff", "#1d19ff", "#1d5ae0", "#1aa0b8",
    "#16b87b", "#26ff00", "#cfff00", "#ffe100", "#ff9a00", "#ff2500",
]

_NORMALIZED_MAX = 5.0   # standard deviations (±5σ, 0.5σ step)


def _make_diverging_scale(max_val: float, step: float, white_steps: int = 2) -> tuple[list[float], list[tuple]]:
    """
    Symmetric diverging colormap from -max_val to +max_val in `step` increments.
    The first `white_steps` intervals on each side of 0 are forced to pure white.
    Returns (breakpoints, interval_RGB_colors).
    """
    n = round(max_val / step)
    breakpoints = [round(i * step, 6) for i in range(-n, n + 1)]
    anchor_rgb  = np.array([mcolors.to_rgb(h) for h in _DIV_HEX])
    mids = [(breakpoints[i] + breakpoints[i + 1]) / 2 for i in range(len(breakpoints) - 1)]
    norm = [m / max_val for m in mids]
    r = np.interp(norm, _DIV_ANCHORS, anchor_rgb[:, 0])
    g = np.interp(norm, _DIV_ANCHORS, anchor_rgb[:, 1])
    b = np.interp(norm, _DIV_ANCHORS, anchor_rgb[:, 2])
    white_limit = white_steps * step
    colors = [
        (1.0, 1.0, 1.0) if abs(mid) <= white_limit + 1e-9 else (float(r[i]), float(g[i]), float(b[i]))
        for i, mid in enumerate(mids)
    ]
    return breakpoints, colors


def _make_positive_scale(
    max_val: float,
    step: float,
    anchor_hex: list[str],
    white_below: float = 0.0,
    color_start: float = 0.0,
    start_at: float = 0.0,
) -> tuple[list[float], list[tuple]]:
    """
    Positive-only stepped scale from 0 to max_val using evenly distributed anchors.
    Intended for magnitude-style diagnostics such as vector wind anomaly magnitude.
    """
    breakpoints = [round(v, 6) for v in np.arange(start_at, max_val + step / 2, step)]
    if breakpoints[-1] < max_val - 1e-9:
        breakpoints.append(round(max_val, 6))
    scale_cfg = {
        "mapping": "scaled",
        "domain_min": color_start,
        "domain_max": max_val,
        "anchor_colors": anchor_hex,
    }
    colors = _interpolate_interval_colors(breakpoints, _resolve_anchor_values(scale_cfg), anchor_hex)
    if white_below > 0:
        mids = _interval_midpoints(breakpoints)
        colors = [
            (1.0, 1.0, 1.0) if mid <= white_below + 1e-9 else color
            for mid, color in zip(mids, colors)
        ]
    return breakpoints, colors


def _wind_vector_anomaly_native_config(
    wind_unit: str,
    color_step: int,
    plot_values: np.ndarray | None = None,
) -> dict[str, object]:
    """
    Native display-unit scale for positive-only wind vector anomaly magnitude.
    Uses the original smoother positive palette, but lets the upper end follow
    the actual plotted values for the current request.
    """
    native_step = 1.0 if wind_unit == "m/s" else 2.0
    start_val = native_step
    white_below = 2.0 if wind_unit == "m/s" else 4.0
    step = native_step * max(color_step, 1)

    data_max = None
    if plot_values is not None:
        finite = np.asarray(plot_values, dtype=float)
        finite = finite[np.isfinite(finite)]
        if finite.size:
            data_max = float(np.nanmax(finite))

    fallback_max = 10.0 if wind_unit == "m/s" else 20.0
    target_max = max(data_max or fallback_max, white_below + step, start_val + step)
    max_val = float(np.ceil(target_max / step) * step)

    boundaries, colors = _make_positive_scale(
        max_val=max_val,
        step=step,
        anchor_hex=_WIND_VECTOR_ANOMALY_HEX,
        white_below=white_below,
        color_start=white_below,
        start_at=start_val,
    )
    tick_vals = list(boundaries)
    return {
        "max_val": max_val,
        "step": step,
        "breakpoints": boundaries,
        "colors": colors,
        "tick_vals": tick_vals,
        "over_color": _WIND_VECTOR_ANOMALY_HEX[-1],
    }


def _anomaly_to_display(values: np.ndarray, variable: str, level: int) -> np.ndarray:
    """Convert anomaly array from native GRIB units to the variable's display units."""
    return _anomaly_to_display_with_unit(values, variable, level)


def _anomaly_to_display_with_unit(values: np.ndarray, variable: str, level: int, wind_unit: str = "kt") -> np.ndarray:
    """Convert anomaly array from native units to the requested display units."""
    if variable == "wind_speed":
        return values * _wind_unit_factor(wind_unit)
    if variable == "temp":
        cfg = _TEMP_SCALES.get(level)
        if cfg and cfg["unit"] == "F":
            return values * 9 / 5          # ΔK = Δ°C → Δ°F
        return values                       # ΔK = Δ°C — no offset needed for differences
    if variable == "height":
        return values / 10                  # gpm → dam
    return values


def _wind_group(level: int) -> str:
    if level == 1000:
        return "surface"
    if level in (925, 850, 700, 600):
        return "low"
    if level in (500, 400):
        return "mid"
    return "high"


def _resolved_wind_scale_config(level: int, scale_overrides: dict[str, float] | None = None) -> tuple[str, dict]:
    group = _wind_group(level)
    scale_cfg = dict(_WIND_SCALE_CONFIGS[group])
    if scale_overrides:
        if scale_overrides.get("domain_min") is not None:
            scale_cfg["domain_min"] = float(scale_overrides["domain_min"])
        if scale_overrides.get("domain_max") is not None:
            scale_cfg["domain_max"] = float(scale_overrides["domain_max"])
    return group, scale_cfg


def _preview(values: list[float], digits: int = 3, n: int = 6) -> str:
    if not values:
        return "[]"
    if len(values) <= n * 2:
        return "[" + ", ".join(f"{v:.{digits}f}" for v in values) + "]"
    head = ", ".join(f"{v:.{digits}f}" for v in values[:n])
    tail = ", ".join(f"{v:.{digits}f}" for v in values[-n:])
    return f"[{head}, ..., {tail}]"


def _scale_data_stats(values: np.ndarray, boundaries: list[float]) -> dict[str, object]:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return {}

    pct_points = [0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 100]
    pct_vals = np.percentile(finite, pct_points)
    under = 100.0 * np.mean(finite < boundaries[0])
    over = 100.0 * np.mean(finite > boundaries[-1])
    in_range = 100.0 - under - over

    # Coarse occupancy by sixths of the scale, to expose whether values are
    # bunching at the low end, middle, or high end irrespective of bin count.
    band_edges = np.linspace(boundaries[0], boundaries[-1], 7)
    band_counts, _ = np.histogram(finite, bins=band_edges)
    band_pcts = [100.0 * c / finite.size for c in band_counts]

    return {
        "data_min": float(finite.min()),
        "data_max": float(finite.max()),
        "data_percentiles": {str(p): float(v) for p, v in zip(pct_points, pct_vals)},
        "data_under_pct": under,
        "data_over_pct": over,
        "data_in_range_pct": in_range,
        "scale_band_edges": [float(v) for v in band_edges],
        "scale_band_pcts": band_pcts,
    }


def _rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(max(0, min(1, c)) * 255):02x}" for c in rgb)


def _uniform_tick_positions(boundaries: list[float], ticks: list[float]) -> list[float]:
    """
    Map data-value ticks onto the colorbar's uniform interval coordinate system.
    This keeps tick spacing proportional to the numeric scale even when the
    rendered colorbar uses equal-height discrete bins.
    """
    if len(boundaries) < 2:
        return ticks
    idx = np.arange(len(boundaries), dtype=float)
    return np.interp(ticks, boundaries, idx).tolist()


def _format_scale_value(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.1f}".rstrip("0").rstrip(".")


def describe_color_scale(
    variable: str,
    level: int,
    color_step: int,
    mode: str,
    data_array=None,
    scale_overrides: dict[str, float] | None = None,
    wind_anomaly_style: str = "speed_diff",
    wind_unit: str = "kt",
) -> dict[str, object]:
    """
    Return render-time scale diagnostics in display units so backend logs can
    explain exactly how color bands were derived for a given request.
    """
    if mode in ("anomaly", "normalized"):
        if mode == "normalized":
            max_val = _NORMALIZED_MAX
            step = max(color_step * 0.5, 0.5)
            unit = "σ"
            breakpoints = [round(v, 6) for v in np.arange(-max_val, max_val + step / 2, step)]
            anchor_values = _DIV_ANCHORS
            anchor_hex = _DIV_HEX
            plot_values = np.asarray(data_array.values, dtype=float) if data_array is not None else None
            _, interval_colors = _make_diverging_scale(max_val, step, white_steps=1)
            scale_kind = mode
        else:
            max_val, step = _ANOMALY_SCALES.get(variable, (10.0, 1.0))
            if variable == "wind_speed" and wind_unit == "m/s":
                max_val *= _KT_TO_MS
                step *= _KT_TO_MS
            unit = display_unit(variable, level, wind_unit=wind_unit)
            plot_values = (
                np.asarray(_anomaly_to_display_with_unit(data_array.values, variable, level, wind_unit=wind_unit), dtype=float)
                if data_array is not None else None
            )
            if variable == "wind_speed" and wind_anomaly_style == "vector_mag":
                native_cfg = _wind_vector_anomaly_native_config(wind_unit, color_step, plot_values)
                breakpoints = native_cfg["breakpoints"]
                interval_colors = native_cfg["colors"]
                anchor_values = breakpoints[:-1]
                anchor_hex = [_rgb_to_hex(c) for c in interval_colors]
                scale_kind = "vector-anomaly-magnitude"
            else:
                breakpoints, interval_colors = _make_diverging_scale(max_val, step, white_steps=1)
                anchor_values = _DIV_ANCHORS
                anchor_hex = _DIV_HEX
                scale_kind = mode
        mids = _interval_midpoints(breakpoints)
        stats = _scale_data_stats(plot_values, breakpoints) if plot_values is not None else {}
        return {
            "scale_kind": scale_kind,
            "unit": unit,
            "step": step,
            "boundaries": breakpoints,
            "interval_mids": mids,
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": anchor_values,
            "anchor_hex": anchor_hex,
            **stats,
        }

    if variable == "wind_speed":
        group, scale_cfg = _resolved_wind_scale_config(level, scale_overrides)
        min_kt = scale_cfg["domain_min"]
        max_kt = scale_cfg["domain_max"]
        anchor_kt = _resolve_anchor_values(scale_cfg)
        boundaries_ms, interval_colors, _, _ = _make_wind_scale(level, step_kt=color_step, scale_overrides=scale_overrides)
        boundaries = [_wind_display_value(b, wind_unit) for b in boundaries_ms]
        data_vals = np.asarray(data_array.values, dtype=float) * _wind_unit_factor(wind_unit) if data_array is not None else None
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        domain_min = _wind_scale_display_value(min_kt, wind_unit)
        domain_max = _wind_scale_display_value(max_kt, wind_unit)
        sample_edges = np.linspace(domain_min, domain_max, 7)
        sample_labels = [
            f"[{sample_edges[i]:.0f},{sample_edges[i+1]:.0f})"
            for i in range(len(sample_edges) - 1)
        ]
        sample_idx = np.linspace(0, len(interval_colors) - 1, 6).round().astype(int).tolist()
        sample_hex = [_rgb_to_hex(interval_colors[i]) for i in sample_idx]
        return {
            "scale_kind": "fixed-wind",
            "group": group,
            "unit": _wind_unit_label(wind_unit),
            "step": color_step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": [_wind_scale_display_value(v, wind_unit) for v in anchor_kt],
            "anchor_hex": scale_cfg["anchor_colors"],
            "key_breakpoints": scale_cfg["key_breakpoints"],
            "domain_min": domain_min,
            "domain_max": domain_max,
            "sample_band_labels": sample_labels,
            "sample_band_hex": sample_hex,
            **stats,
        }

    if variable == "temp" and level in _TEMP_SCALES:
        cfg = _TEMP_SCALES[level]
        boundaries_k, interval_colors, _ = _make_temp_scale(cfg, step=color_step)
        from_k = (lambda k: (k - 273.15) * 9.0 / 5.0 + 32.0) if cfg["unit"] == "F" else (lambda k: k - 273.15)
        boundaries = [from_k(v) for v in boundaries_k]
        data_vals = np.asarray([from_k(v) for v in np.ravel(data_array.values)], dtype=float) if data_array is not None else None
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": "fixed-temp",
            "unit": f"°{cfg['unit']}",
            "step": color_step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": cfg["anchors"],
            "anchor_hex": cfg["anchor_hex"],
            "key_breakpoints": cfg["key_breakpoints"],
            **stats,
        }

    if variable == "rel_humidity":
        boundaries, interval_colors = _make_rh_scale(step=color_step)
        data_vals = np.asarray(data_array.values, dtype=float) if data_array is not None else None
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": "fixed-rh",
            "unit": "%",
            "step": color_step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": _RH_SCALE_CONFIG["anchor_values"],
            "anchor_hex": _RH_SCALE_CONFIG["anchor_colors"],
            "key_breakpoints": _RH_SCALE_CONFIG["key_breakpoints"],
            **stats,
        }

    return {
        "scale_kind": "auto-or-uninstrumented",
        "unit": display_unit(variable, level, wind_unit=wind_unit),
        "step": color_step,
    }


# ── Core rendering function ──────────────────────────────────────────────────────

def create_map_product(data_array, region_bounds, var_name, date_str, variable="wind_speed", level=850, region="CONUS", u_array=None, v_array=None, wind_step=0, wind_type="vectors", color_step=1, mode="raw", scale_overrides: dict[str, float] | None = None, wind_anomaly_style: str = "speed_diff", wind_unit: str = "kt"):
    plt.close('all')
    fig = plt.figure(figsize=(14, 9))
    proj = _REGION_PROJECTIONS.get(region, ccrs.PlateCarree())
    ax = plt.axes(projection=proj)

    # Phase 1: create the filled plot; collect colorbar config separately.
    # The colorbar is added AFTER fig.canvas.draw() so we can read the final
    # Cartopy-adjusted axes position and place cax to exactly match it.
    plot_obj   = None
    cbar_cfg   = None   # {ticks, ticklabels, ylabel} — None means no colorbar

    if mode in ("anomaly", "normalized"):
        if mode == "normalized":
            max_val    = _NORMALIZED_MAX
            step       = max(color_step * 0.5, 0.5)
            unit_label = "σ"
            plot_vals  = data_array.values
        else:
            max_val, step = _ANOMALY_SCALES.get(variable, (10.0, 1.0))
            if variable == "wind_speed" and wind_unit == "m/s":
                max_val *= _KT_TO_MS
                step *= _KT_TO_MS
            unit_label = display_unit(variable, level, wind_unit=wind_unit)
            plot_vals  = _anomaly_to_display_with_unit(data_array.values, variable, level, wind_unit=wind_unit)
        if mode == "anomaly" and variable == "wind_speed" and wind_anomaly_style == "vector_mag":
            native_cfg = _wind_vector_anomaly_native_config(wind_unit, color_step, plot_vals)
            breakpoints = native_cfg["breakpoints"]
            colors = native_cfg["colors"]
            cmap = mcolors.ListedColormap(colors)
            cmap.set_under(colors[0])
            cmap.set_over(mcolors.to_rgb(_WIND_VECTOR_ANOMALY_HEX[-1]))
            norm = mcolors.BoundaryNorm(breakpoints, ncolors=len(colors))
            plot_obj = ax.contourf(
                data_array.longitude, data_array.latitude, plot_vals,
                levels=breakpoints, cmap=cmap, norm=norm,
                transform=ccrs.PlateCarree(), extend='max',
            )
            cbar_cfg = {
                'ticks': native_cfg["tick_vals"],
                'ticklabels': [_format_scale_value(v) for v in native_cfg["tick_vals"]],
                'ylabel': f'Wind Vector Anomaly Magnitude  ({unit_label})',
                'extend': 'max',
                'colors': colors, 'boundaries': breakpoints,
            }
        else:
            white_steps = 1
            breakpoints, colors = _make_diverging_scale(max_val, step, white_steps=white_steps)
            cmap = mcolors.ListedColormap(colors)
            cmap.set_under(colors[0])
            cmap.set_over(colors[-1])
            norm = mcolors.BoundaryNorm(breakpoints, ncolors=len(colors))
            plot_obj = ax.contourf(
                data_array.longitude, data_array.latitude, plot_vals,
                levels=breakpoints, cmap=cmap, norm=norm,
                transform=ccrs.PlateCarree(), extend='both',
            )
            n_steps = round(max_val / step)
            stride  = max(1, round(n_steps / 5))
            tick_vals = [round(i * step * stride, 9)
                         for i in range(-(n_steps // stride), n_steps // stride + 1)
                         if abs(i * step * stride) <= max_val + 1e-6]
            mode_label = "Anomaly" if mode == "anomaly" else "Normalized Anomaly"
            cbar_cfg = {
                'ticks':      tick_vals,
                'ticklabels': [
                    ("0" if abs(v) < 1e-9 else f"{'+' if v > 0 else '-'}{_format_scale_value(abs(v))}")
                    for v in tick_vals
                ],
                'ylabel':     f"{mode_label}  ({unit_label})",
                'extend':     'both',
                'colors': colors, 'boundaries': breakpoints,
            }

    elif variable == "wind_speed":
        breakpoints_ms, interval_colors, min_kt, max_kt = _make_wind_scale(
            level,
            step_kt=color_step,
            scale_overrides=scale_overrides,
        )
        cmap = mcolors.ListedColormap(interval_colors)
        cmap.set_over(mcolors.to_rgb(_WIND_COLORS[-1]))
        norm = mcolors.BoundaryNorm(breakpoints_ms, ncolors=len(interval_colors))
        plot_obj = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=breakpoints_ms, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='max',
        )
        tick_step = max(color_step, 5)
        tick_kt = np.arange(min_kt, max_kt + tick_step / 2, tick_step, dtype=float).tolist()
        if abs(tick_kt[-1] - max_kt) > 1e-9:
            tick_kt.append(float(max_kt))
        tick_display = [_wind_scale_display_value(kt, wind_unit) for kt in tick_kt]
        min_display = _wind_scale_display_value(min_kt, wind_unit)
        max_display = _wind_scale_display_value(max_kt, wind_unit)
        cbar_cfg = {
            'ticks':      [kt * _KT_TO_MS for kt in tick_kt],
            'ticklabels': [_format_scale_value(v) for v in tick_display],
            'ylabel':     f'Wind Speed  ·  {_format_scale_value(min_display)}–{_format_scale_value(max_display)} {_wind_unit_label(wind_unit)}',
            'extend':     'max',
            'colors': interval_colors, 'boundaries': breakpoints_ms,
        }

    elif variable == "temp" and level in _TEMP_SCALES:
        cfg = _TEMP_SCALES[level]
        breakpoints_k, interval_colors, to_k = _make_temp_scale(cfg, step=color_step)
        cmap = mcolors.ListedColormap(interval_colors)
        cmap.set_under(interval_colors[0])
        cmap.set_over(mcolors.to_rgb(cfg["anchor_hex"][-1]))
        norm = mcolors.BoundaryNorm(breakpoints_k, ncolors=len(interval_colors))
        plot_obj = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=breakpoints_k, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='both',
        )
        tick_step = color_step if color_step >= 10 else max(color_step * round(10 / color_step), color_step)
        tick_vals = list(range(cfg["t_min"], cfg["t_max"] + 1, tick_step))
        cbar_cfg = {
            'ticks':      [to_k(t) for t in tick_vals],
            'ticklabels': [str(t) for t in tick_vals],
            'ylabel':     f'Temperature  ·  {level} mb',
            'extend':     'both',
            'colors': interval_colors, 'boundaries': breakpoints_k,
        }

    elif variable == "height":
        dam = data_array / 10.0
        interval = color_step * 4
        v0 = float(np.floor(dam.values.min() / interval) * interval)
        v1 = float(np.ceil( dam.values.max() / interval) * interval)
        levels = np.arange(v0, v1 + interval / 2, interval)
        cs = ax.contour(
            data_array.longitude, data_array.latitude, dam.values,
            levels=levels, colors='black', linewidths=0.8,
            transform=ccrs.PlateCarree(),
        )
        ax.clabel(cs, cs.levels, inline=True, fontsize=9, fmt='%d')
        # height uses contour lines only — no colorbar

    elif variable == "rel_humidity":
        steps, interval_colors = _make_rh_scale(step=color_step)
        cmap = mcolors.ListedColormap(interval_colors)
        cmap.set_under(interval_colors[0])
        cmap.set_over(mcolors.to_rgb(_RH_ANCHOR_HEX[-1]))
        norm = mcolors.BoundaryNorm(steps, ncolors=len(interval_colors))
        plot_obj = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=steps, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='both',
        )
        cbar_cfg = {
            'ticks':      list(range(0, 101, 10)),
            'ticklabels': [str(v) for v in range(0, 101, 10)],
            'ylabel':     'Relative Humidity',
            'extend':     'both',
            'colors': interval_colors, 'boundaries': steps,
        }

    else:
        cmap = _VAR_CMAPS.get(variable, "viridis")
        plot_obj = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=15, cmap=cmap,
            transform=ccrs.PlateCarree(), extend='both',
        )
        units = {"humidity": "kg/kg"}.get(variable, "")
        cbar_cfg = {
            'ticks':      None,
            'ticklabels': None,
            'ylabel':     f'{units}  (auto-scaled placeholder)',
            'extend':     'both',
            'colors': None, 'boundaries': None,
            'cmap': cmap,
        }

    # Phase 2: wind overlay, title, extent, map features
    if wind_step > 0 and u_array is not None and v_array is not None:
        s = wind_step
        lons = u_array.longitude.values[::s]
        lats = u_array.latitude.values[::s]
        u    = u_array.values[::s, ::s]
        v    = v_array.values[::s, ::s]
        if wind_type == "barbs":
            ax.barbs(
                lons, lats, u, v,
                transform=ccrs.PlateCarree(),
                length=5, linewidth=0.6, color='black', alpha=0.75,
                barb_increments=dict(half=2.57, full=5.14, flag=25.72),
            )
        else:
            ax.quiver(
                lons, lats, u, v,
                transform=ccrs.PlateCarree(),
                scale=_quiver_scale(level), width=0.001, color='black', alpha=0.75,
            )

    ax.set_title(
        f"PyReWeather | {var_name}\n{date_str}",
        loc='left', fontsize=11, fontweight='bold',
    )

    lon0, lon1, lat0, lat1 = _REGION_EXTENTS.get(
        region,
        (region_bounds["lon"][0], region_bounds["lon"][1],
         region_bounds["lat"][0], region_bounds["lat"][1]),
    )
    ax.set_extent([lon0, lon1, lat0, lat1], crs=ccrs.PlateCarree())
    ax.coastlines(resolution='50m', color='black', linewidth=1.2)
    ax.add_feature(cfeature.STATES, linestyle=':', edgecolor='black', alpha=0.4)
    ax.add_feature(cfeature.BORDERS, linewidth=1.2, edgecolor='black')
    gl = ax.gridlines(
        crs=ccrs.PlateCarree(),
        draw_labels=True,
        linewidth=0.6,
        color='gray',
        alpha=0.35,
        linestyle=':',
    )
    gl.top_labels = False
    gl.right_labels = False
    gl.xlocator = mticker.MultipleLocator(10)
    gl.ylocator = mticker.MultipleLocator(10)
    gl.xlabel_style = {'size': 8, 'color': '#555'}
    gl.ylabel_style = {'size': 8, 'color': '#555'}

    # Phase 3: colorbar + data source — placed after canvas draw so Cartopy's
    # aspect-ratio adjustment is finalised and ax.get_position() is accurate.
    fig.canvas.draw()
    pos = ax.get_position()

    if plot_obj is not None and cbar_cfg is not None:
        # cax touches the map right edge exactly — no gap
        cax = fig.add_axes([pos.x1, pos.y0, 0.018, pos.height])
        # Build a fresh ListedColormap/BoundaryNorm from raw color lists so that
        # any set_over/set_under calls on the plot cmap cannot bleed extra color
        # slots into the colorbar LUT (which was causing uneven band widths).
        cb_colors = cbar_cfg.get('colors')
        cb_boundaries = cbar_cfg.get('boundaries')
        if cb_colors is not None and cb_boundaries is not None:
            cb_axis_boundaries = list(np.arange(len(cb_boundaries), dtype=float))
            cb_axis_values = [i + 0.5 for i in range(len(cb_colors))]
            cb_cmap = mcolors.ListedColormap(cb_colors)
            cb_norm = mcolors.BoundaryNorm(cb_axis_boundaries, ncolors=len(cb_colors), clip=True)
            # ColorbarBase respects our discrete interval boundaries exactly; the
            # generic ScalarMappable path was compressing some fixed scales into
            # the middle of the bar despite linear breakpoints.
            cbar = mcolorbar.ColorbarBase(
                cax,
                cmap=cb_cmap,
                norm=cb_norm,
                boundaries=cb_axis_boundaries,
                values=cb_axis_values,
                spacing='uniform',
                extend='neither',
            )
        else:
            # Fallback: named-string cmap with auto-scaled norm from contourf
            cb_cmap = cbar_cfg.get('cmap', 'viridis')
            cb_norm = plot_obj.norm
            sm = mcm.ScalarMappable(cmap=cb_cmap, norm=cb_norm)
            sm.set_array([])
            cbar = fig.colorbar(sm, cax=cax, extend='neither')
        if cbar_cfg['ticks'] is not None:
            labels = list(cbar_cfg['ticklabels'])
            ext = cbar_cfg.get('extend', 'neither')
            if ext in ('max', 'both'):
                labels[-1] = str(labels[-1]) + '+'
            if ext in ('min', 'both'):
                labels[0] = str(labels[0]) + '−'
            if cb_colors is not None and cb_boundaries is not None:
                tick_positions = _uniform_tick_positions(cb_boundaries, cbar_cfg['ticks'])
                cbar.set_ticks(tick_positions)
            else:
                cbar.set_ticks(cbar_cfg['ticks'])
            cbar.set_ticklabels(labels)
        cbar.ax.set_ylabel(cbar_cfg['ylabel'], fontsize=9)
        cbar.ax.tick_params(labelsize=8)

    # Data source credit below the map
    fig.text(
        pos.x0, pos.y0 - 0.018,
        'Data: CORe Reanalysis  ·  NCEP/CPC',
        fontsize=7, color='#888',
        ha='left', va='top',
        transform=fig.transFigure,
    )

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=200)
    buf.seek(0)
    plt.close(fig)
    return buf
