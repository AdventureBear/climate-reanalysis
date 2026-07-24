import io
import json
import os
import threading

import cartopy
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib.cm as mcm
import matplotlib.colorbar as mcolorbar
import matplotlib.colors as mcolors
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.path import Path
import matplotlib.ticker as mticker
import numpy as np

from .config import CACHE_ROOT

# Rendering runs on FastAPI's worker threads (the endpoint is sync so slow
# fetches don't stall the event loop). Matplotlib's OO API is mostly re-entrant
# but cartopy/matplotlib share global state (font cache, Natural Earth
# downloader), so figure assembly itself is serialized behind this lock.
_RENDER_LOCK = threading.Lock()

# Natural Earth shapefiles (coastlines, borders, states) download on first use
# into cartopy's data dir — ~/.local/share/cartopy by default, which is
# ephemeral on Render and re-downloads every deploy. Keep them with the other
# disk caches under PYRE_CACHE_DIR; an explicit CARTOPY_DATA_DIR still wins.
if os.environ.get("PYRE_CACHE_DIR") and not os.environ.get("CARTOPY_DATA_DIR"):
    cartopy.config["data_dir"] = os.path.join(CACHE_ROOT, "cartopy")

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
    "North America": ccrs.AlbersEqualArea(central_longitude=-100, central_latitude=45, standard_parallels=(20, 60)),
    "Northern Hemisphere": ccrs.NorthPolarStereo(central_longitude=-100),
    "Southern Hemisphere": ccrs.SouthPolarStereo(central_longitude=135),
    "North Pacific": ccrs.PlateCarree(central_longitude=180),
    "Northern Africa": ccrs.PlateCarree(),
    "Europe": ccrs.AlbersEqualArea(central_longitude=15, central_latitude=52, standard_parallels=(40, 65)),
    "Asia": ccrs.PlateCarree(),
    "Middle East": ccrs.PlateCarree(),
    "East Asia": ccrs.PlateCarree(),
    "Australia": ccrs.PlateCarree(),
    "New Zealand": ccrs.PlateCarree(central_longitude=180),
    "Southeast Canada": ccrs.AlbersEqualArea(central_longitude=-70, central_latitude=55, standard_parallels=(42, 65)),
    "Western Canada": ccrs.AlbersEqualArea(central_longitude=-115, central_latitude=58, standard_parallels=(45, 70)),
    "Canada": ccrs.AlbersEqualArea(central_longitude=-100, central_latitude=58, standard_parallels=(45, 70)),
    "South America": ccrs.PlateCarree(),
    "World": ccrs.PlateCarree(central_longitude=180),
    "Indian Ocean": ccrs.PlateCarree(),
    "North Atlantic": ccrs.PlateCarree(),
    "Western Atlantic": ccrs.PlateCarree(),
    "Tropical Atlantic": ccrs.PlateCarree(),
    "Western Pacific": ccrs.PlateCarree(central_longitude=180),
    "Central Pacific": ccrs.PlateCarree(),
    "Eastern Pacific": ccrs.PlateCarree(),
    "Southwest Pacific": ccrs.PlateCarree(central_longitude=180),
    "Southeast Pacific": ccrs.PlateCarree(),
    "India": ccrs.PlateCarree(),
    "Southern Africa": ccrs.PlateCarree(),
}

_REGION_EXTENTS: dict[str, tuple[float, float, float, float]] = {
    "CONUS": (-127.5, -63.5, 21.5, 52.5),   # (lon_min, lon_max, lat_min, lat_max)
    "Northwest US": (-128.5, -105.5, 37.5, 52.5),
    "Northern Plains": (-108.5, -87.5, 38.5, 52.5),
    "Central Plains": (-105.5, -86.5, 30.5, 48.5),
    "Northeast": (-81.5, -63.5, 36.5, 50.5),
    "Eastern US": (-92.5, -63.5, 22.5, 49.5),
    "Southwest US": (-126.5, -105.5, 27.5, 42.5),
    "South Central": (-106.5, -86.5, 23.5, 39.5),
    "Southeast US": (-92.5, -71.5, 21.5, 39.5),
    "Western US": (-127.5, -100.5, 28.5, 51.5),
    "Alaska": (-174.5, -126.5, 47.5, 74.5),
    "Hawaii": (-163.5, -151.5, 15.5, 25.5),
    "North America": (-172.5, -27.5, 7.5, 82.5),
    "Northern Hemisphere": (-180, 180, -2.5, 90),
    "Southern Hemisphere": (-180, 180, -90, -17.5),
    "North Pacific": (117.5, -97.5, -2.5, 67.5),
    "Northern Africa": (-27.5, 57.5, -2.5, 37.5),
    "Europe": (-17.5, 42.5, 27.5, 74.5),
    "Asia": (52.5, 157.5, 2.5, 67.5),
    "Middle East": (22.5, 77.5, 2.5, 44.5),
    "East Asia": (92.5, 157.5, 7.5, 57.5),
    "Australia": (107.5, 162.5, -47.5, -5.5),
    "New Zealand": (152.5, 197.5, -54.5, -25.5),
    "Southeast Canada": (-102.5, -37.5, 37.5, 70.5),
    "Western Canada": (-142.5, -82.5, 42.5, 77.5),
    "Canada": (-142.5, -37.5, 39.5, 84.5),
    "South America": (-92.5, -27.5, -60.5, 17.5),
    "World": (-180, 180, -62.5, 87.5),
    "Indian Ocean": (27.5, 112.5, -17.5, 42.5),
    "North Atlantic": (-87.5, -12.5, -2.5, 42.5),
    "Western Atlantic": (-102.5, -42.5, -2.5, 42.5),
    "Tropical Atlantic": (-67.5, 2.5, -7.5, 32.5),
    "Western Pacific": (107.5, 182.5, -7.5, 37.5),
    "Central Pacific": (-180, -117.5, -7.5, 32.5),
    "Eastern Pacific": (-152.5, -77.5, -12.5, 32.5),
    "Southwest Pacific": (137.5, 182.5, -32.5, 7.5),
    "Southeast Pacific": (-142.5, -67.5, -37.5, 7.5),
    "India": (57.5, 102.5, -2.5, 37.5),
    "Southern Africa": (7.5, 47.5, -37.5, 7.5),
}

_POLAR_HEMISPHERE_REGIONS = {"Northern Hemisphere", "Southern Hemisphere"}

# Regions whose extent crosses (or touches) the antimeridian. Their extents are
# expressed above in true longitude, but set_extent on a central_longitude=0 CRS
# wraps values past ±180 into a broken globe-wide strip. For these regions the
# extent is converted to offsets from 180° and applied in a dateline-centred CRS.
_DATELINE_EXTENT_REGIONS = {"North Pacific", "Western Pacific", "Southwest Pacific", "New Zealand"}


def _apply_polar_boundary(ax) -> None:
    theta = np.linspace(0, 2 * np.pi, 120)
    center = np.array([0.5, 0.5])
    radius = 0.5
    verts = np.vstack([np.sin(theta), np.cos(theta)]).T
    circle = Path(center + radius * verts)
    ax.set_boundary(circle, transform=ax.transAxes)

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
_MM_TO_IN = 0.03937007874

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


def _pwat_to_display(values, pwat_unit: str):
    if pwat_unit == "in":
        return values * 0.03937007874
    return values


def _pwat_unit_label(pwat_unit: str) -> str:
    return "in" if pwat_unit == "in" else "mm"


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

# Mid- and upper-level temperature anchors: evenly spaced cold-to-warm palette
# across each level group's climatological range. Practical defaults pending the
# scientific color-scale review tracked in PROJECT.md §8.
_TEMP_UPPER_ANCHOR_HEX = [
    '#3b0f70', '#6247aa', '#2c7bb6', '#63a8d1', '#abd9e9',
    '#e0f3f8', '#f7f7f7', '#fee090', '#fdae61', '#d7301f',
]


def _even_anchors(t_min: float, t_max: float, anchor_hex: list[str]) -> list[float]:
    n = len(anchor_hex)
    return [t_min + i * (t_max - t_min) / (n - 1) for i in range(n)]


def _upper_temp_scale(t_min: int, t_max: int) -> dict:
    return {
        "mapping": "fixed_anchors",
        "unit": "C",
        "anchors": _even_anchors(t_min, t_max, _TEMP_UPPER_ANCHOR_HEX),
        "anchor_hex": _TEMP_UPPER_ANCHOR_HEX,
        "t_min": t_min,
        "t_max": t_max,
        "key_breakpoints": [0] if t_min < 0 < t_max else [],
    }


_TEMP_SCALES: dict[int, dict] = {
    1000: {
        # Color Lab export 2026-07-11: freezing line at 31/32 (blue→green),
        # zero line at 0/1, and a hard red→maroon step at 100/101.
        "mapping": "fixed_anchors",
        "unit": "F",
        "anchors":    [-60, -40,   0,   1,  15,  31,  32,   54,   70,   85,  100, 101, 130],
        "anchor_hex": [
            '#2a4d73', '#ace3db', '#7a26ab', '#a149b3', '#d8e3eb',
            '#1650b5', '#0e533c', '#39b030', '#e5d000', '#f48a10',
            '#e00038', '#b1022e', '#fa00e5',
        ],
        "t_min": -60,
        "t_max": 130,
        "key_breakpoints": [32],
    },
    925: {"mapping": "fixed_anchors", "unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  40, "key_breakpoints": [0]},
    850: {"mapping": "fixed_anchors", "unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  40, "key_breakpoints": [0]},
    700: {"mapping": "fixed_anchors", "unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  30, "key_breakpoints": [0]},
    600: _upper_temp_scale(-50, 15),
    500: _upper_temp_scale(-55, 10),
    400: _upper_temp_scale(-65,  0),
    300: _upper_temp_scale(-75, -10),
    250: _upper_temp_scale(-80, -20),
    200: _upper_temp_scale(-80, -30),
    150: _upper_temp_scale(-85, -35),
    100: _upper_temp_scale(-90, -35),
    70:  _upper_temp_scale(-90, -35),
    50:  _upper_temp_scale(-90, -30),
    20:  _upper_temp_scale(-85, -25),
    10:  _upper_temp_scale(-80, -20),
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


def _render_level(variable: str, level: int) -> int:
    if variable in {"temp_2m", "wind_10m"}:
        return 1000
    return level


def _temp_display_unit(variable: str, level: int, temp_unit: str = "") -> str:
    """'F' or 'C': the explicit override, else the level's native scale unit."""
    if temp_unit in ("F", "C"):
        return temp_unit
    cfg = _TEMP_SCALES.get(_render_level(variable, level))
    return cfg["unit"] if cfg else "C"


def display_unit(variable: str, level: int, wind_unit: str = "kt", pwat_unit: str = "mm", temp_unit: str = "") -> str:
    """
    Single source of truth for the unit string shown on map titles and colorbars.
    Always matches what the colorbar actually displays.
    """
    if variable in {"wind_speed", "wind_10m"}:
        return _wind_unit_label(wind_unit)
    if variable in {"temp", "temp_2m"}:
        return f"°{_temp_display_unit(variable, level, temp_unit)}"
    if variable == "rel_humidity":
        return "%"
    if variable == "height":
        return "dam"
    if variable == "humidity":
        return "kg/kg"
    if variable == "surface_pressure":
        return "mb"
    if variable == "precipitable_water":
        return _pwat_unit_label(pwat_unit)
    if variable == "omega":
        return "Pa/s"
    if variable == "precip_rate":
        return "mm/day"
    if variable == "olr":
        return "W/m²"
    if variable in {"cape", "cape_ml", "cape_mu", "cin", "cin_ml", "cin_mu"}:
        return "J/kg"
    if variable == "dewpoint_2m":
        return "°F"
    if variable == "absv":
        return "10⁻⁵/s"
    if variable == "snow_depth":
        return "in"
    return ""


# ── Relative humidity scale ───────────────────────────────────────────────────────
# 1 % steps, 0–100 %. Breakpoints are plain percentages (data is already in %).
_RH_ANCHORS_PCT = [  0,   9,  49,  50,  89,  90, 100]
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


# ── Fixed scales for scalar variables not covered above ───────────────────────────
_HEIGHT_CONTOUR_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0,
    "domain_max": 600,
    "anchor_values": [0, 120, 240, 360, 480, 600],
    "anchor_colors": ["#5e4fa2", "#3288bd", "#66c2a5", "#e6f598", "#fdae61", "#d53e4f"],
    "key_breakpoints": [],
    "step": 4,
}

# Shaded-height ramps (#49). Three named ramps; each level picks one in
# _HEIGHT_FILL_SPECS. Every ramp is (hex colors, window fractions) with the
# same mid-dense spacing so common departures get most of the hue variation.
#
# warm      — purple = far below normal, green = normal, red = far above.
#             Same 13-hue ladder as the MSLP spectrum. Levels 600-1000mb.
# warm_pink — the warm ladder plus magenta -> pink headroom above red, for
#             500mb only: its window top moves 587 -> 604 dam so a summer
#             subtropical ridge (588-600) grades red into pink instead of
#             saturating flat red. The first 13 fractions keep the original
#             anchors at their original dam positions in the wider window.
# cool      — 400mb and up: no warm hues at all. Below-normal side keeps the
#             familiar purple/blue/cyan; above normal runs mint -> periwinkle
#             -> lilac -> orchid -> pink, so jet-level maps read cool even in
#             summer when heights sit high in the window.
_HEIGHT_RAMPS: dict[str, tuple[list[str], list[float]]] = {
    "warm": (
        ["#f2ecf9", "#b366ff", "#6600cc", "#0d33cc", "#0066ff", "#00aaff",
         "#00e0e0", "#33cc66", "#99e600", "#ffee00", "#ffaa00", "#ff6600",
         "#e60000"],
        [0.0, 0.1786, 0.3214, 0.4286, 0.5143, 0.5714,
         0.6286, 0.6643, 0.7, 0.7429, 0.8, 0.8714, 1.0],
    ),
    "warm_pink": (
        ["#f2ecf9", "#b366ff", "#6600cc", "#0d33cc", "#0066ff", "#00aaff",
         "#00e0e0", "#33cc66", "#99e600", "#ffee00", "#ffaa00", "#ff6600",
         "#e60000", "#ff33cc", "#ffb3e6"],
        [0.0, 0.1456, 0.2620, 0.3494, 0.4193, 0.4658,
         0.5124, 0.5415, 0.5707, 0.6056, 0.6522, 0.7104,
         0.8152, 0.9130, 1.0],
    ),
    "cool": (
        ["#f2ecf9", "#b366ff", "#6600cc", "#0d33cc", "#0066ff", "#00aaff",
         "#00e0e0", "#66e0c2", "#b3c6f7", "#c9a6f7", "#e08ae0", "#f75fc0",
         "#e61f8e"],
        [0.0, 0.1786, 0.3214, 0.4286, 0.5143, 0.5714,
         0.6286, 0.6643, 0.7, 0.7429, 0.8, 0.8714, 1.0],
    ),
}

# Per-level fill spec: (window_min_dam, window_max_dam, ramp_name). Windows
# are compressed to the TYPICAL synoptic band (standard-atmosphere height
# sits ~2/3 up the window, since below-normal departures run larger than
# above). Excursions beyond the window render in the extend colors — the
# same add-on-band approach as the temperature and wind scales. Values are
# working estimates pending domain review.
_HEIGHT_FILL_SPECS: dict[int, tuple[float, float, str]] = {
    1000: (-13, 27, "warm"),
    925:  (52, 92, "warm"),
    850:  (122, 162, "warm"),
    700:  (277, 317, "warm"),
    600:  (391, 446, "warm"),
    500:  (512, 604, "warm_pink"),
    # Cool-level window tops reach the summer subtropical ridge (verified
    # against 2026-07-21: 980 dam at 300mb, 1256 at 200mb) so July maps
    # grade instead of saturating at the domain edge (#49).
    400:  (674, 770, "cool"),
    300:  (866, 985, "cool"),
    250:  (994, 1120, "cool"),
    200:  (1123, 1262, "cool"),
    150:  (1306, 1440, "cool"),
    100:  (1563, 1690, "cool"),
    70:   (1789, 1899, "cool"),
    50:   (2003, 2113, "cool"),
    20:   (2578, 2718, "cool"),
    10:   (3006, 3206, "cool"),
}


def _height_fill_cfg(level: int) -> dict | None:
    spec = _HEIGHT_FILL_SPECS.get(level)
    if spec is None:
        return None
    w0, w1, ramp_name = spec
    colors, fractions = _HEIGHT_RAMPS[ramp_name]
    return {
        "mapping": "fixed_anchors",
        "domain_min": w0,
        "domain_max": w1,
        "anchor_values": [w0 + f * (w1 - w0) for f in fractions],
        "anchor_colors": colors,
        "key_breakpoints": [],
        "step": 4,
    }

# Full synoptic MSLP spectrum with fixed physical anchors:
# hurricane-depth lows purple, strong lows medium blue, typical lows light
# blue, average pressure (~1013) green, moderate highs yellow-orange,
# record-setting highs red.
# Anchors are densest through the everyday synoptic band (~992-1032) so a
# typical H/L spread shows real hue variation; the spectrum's extremes are
# reserved for genuinely extreme pressure.
_MSLP_CONTOUR_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 920,
    "domain_max": 1060,
    "anchor_values": [920, 945, 965, 980, 992, 1000, 1008, 1013, 1018, 1024, 1032, 1042, 1060],
    "anchor_colors": [
        # Meteocentre/CMC-style saturated rainbow: a distinct hue per band
        # scans fast, and saturated fills survive washed-out projectors.
        "#f2ecf9",  # 920  near-white lavender — major hurricane core
        "#b366ff",  # 945  purple — intense low
        "#6600cc",  # 965  deep purple
        "#0d33cc",  # 980  indigo — strong low
        "#0066ff",  # 992  blue — lowish low
        "#00aaff",  # 1000 light blue — typical low
        "#00e0e0",  # 1008 cyan — weak low
        "#33cc66",  # 1013 green — average sea-level pressure
        "#99e600",  # 1018 yellow-green — weak high
        "#ffee00",  # 1024 yellow — moderate high
        "#ffaa00",  # 1032 orange-yellow — strong high
        "#ff6600",  # 1042 orange — intense high
        "#e60000",  # 1060 red — record-setting high
    ],
    "key_breakpoints": [1000, 1013, 1024],
    "step": 4,
}

_PWAT_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0,
    "domain_max": 80,
    "anchor_values": [0, 10, 20, 30, 40, 50, 60, 70, 80],
    "anchor_colors": [
        "#f7fbff", "#deebf7", "#9ecae1", "#41ab5d", "#fdd049",
        "#fd8d3c", "#e31a1c", "#800026", "#4d004b",
    ],
    "key_breakpoints": [25, 50],
}

_SPECIFIC_HUMIDITY_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0.0,
    "domain_max": 0.024,
    "anchor_values": [0.0, 0.002, 0.006, 0.010, 0.014, 0.018, 0.024],
    "anchor_colors": ["#f7fcf0", "#e0f3db", "#a8ddb5", "#7bccc4", "#43a2ca", "#0868ac", "#084081"],
    "key_breakpoints": [0.010, 0.018],
}

# Omega in Pa/s. Meteorological convention: negative = ascent (storminess,
# blues), positive = descent/subsidence (warm browns). Zero-centered white.
_OMEGA_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": -2.0,
    "domain_max": 2.0,
    "anchor_values": [-2.0, -1.0, -0.3, 0.0, 0.3, 1.0, 2.0],
    "anchor_colors": ["#08306b", "#4292c6", "#c6dbef", "#f7f7f7", "#fdd0a2", "#e6550d", "#7f2704"],
    "key_breakpoints": [-0.3, 0.3],
    "step": 0.1,
}

# Precipitation rate in display units (mm/day; native kg/m²/s × 86400).
_PRECIP_RATE_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0.0,
    "domain_max": 60.0,
    "anchor_values": [0.0, 1.0, 5.0, 10.0, 20.0, 30.0, 45.0, 60.0],
    "anchor_colors": [
        "#ffffff", "#c7e9c0", "#74c476", "#238b45",
        "#2b8cbe", "#08519c", "#54278f", "#7a0177",
    ],
    "key_breakpoints": [5.0, 20.0],
    "step": 1.0,
    # First division above zero stays pure white — trace rates are not "rain".
    "white_below": 1.0,
}

# OLR in W/m². Low OLR = cold cloud tops / deep convection (cool purples and
# blues); high OLR = warm clear-sky surfaces (oranges).
_OLR_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 100.0,
    "domain_max": 320.0,
    "anchor_values": [100.0, 140.0, 180.0, 220.0, 260.0, 300.0, 320.0],
    "anchor_colors": ["#54278f", "#2b8cbe", "#7bccc4", "#e5f5e0", "#fee391", "#fe9929", "#cc4c02"],
    "key_breakpoints": [180.0, 240.0],
    "step": 5.0,
}

_PRATE_TO_MM_DAY = 86400.0   # kg/m²/s → mm/day (1 kg/m² = 1 mm of water)
_M_TO_IN = 39.3701

# CAPE in J/kg. White below convective relevance, then the familiar
# yellow → orange → red → magenta severity ramp.
_CAPE_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0.0,
    "domain_max": 5000.0,
    "anchor_values": [0.0, 250.0, 500.0, 1000.0, 2000.0, 3000.0, 4000.0, 5000.0],
    "anchor_colors": [
        "#ffffff", "#fff7bc", "#fee391", "#fe9929",
        "#ec7014", "#d7301f", "#b30000", "#7a0177",
    ],
    "key_breakpoints": [1000.0, 2500.0],
    "step": 100.0,
}

# CIN in J/kg (negative = inhibition). White near zero, deepening blues/purples
# as the cap strengthens.
_CIN_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": -500.0,
    "domain_max": 0.0,
    "anchor_values": [-500.0, -300.0, -200.0, -100.0, -50.0, -25.0, 0.0],
    "anchor_colors": ["#3f007d", "#54278f", "#6a51a3", "#9e9ac8", "#cbc9e2", "#f2f0f7", "#ffffff"],
    "key_breakpoints": [-100.0, -25.0],
    "step": 10.0,
}

# 2m dewpoint in °F (native K). Browns dry → cream → greens moist → blue-green
# tropical; the 55–65 °F band is the severe-weather moisture benchmark.
_DEWPOINT_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": -20.0,
    "domain_max": 85.0,
    "anchor_values": [-20.0, 0.0, 20.0, 40.0, 55.0, 65.0, 75.0, 85.0],
    "anchor_colors": [
        "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3",
        "#a1d99b", "#41ab5d", "#006d2c", "#00441b",
    ],
    "key_breakpoints": [55.0, 65.0],
    "step": 1.0,
}

# Absolute vorticity in 10⁻⁵ s⁻¹ (native 1/s). Diverging so Southern-Hemisphere
# (negative) values render sensibly; NH cyclonic maxima in oranges/reds.
_ABSV_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": -30.0,
    "domain_max": 30.0,
    "anchor_values": [-30.0, -16.0, -8.0, 0.0, 8.0, 16.0, 30.0],
    "anchor_colors": ["#08306b", "#4292c6", "#c6dbef", "#f7f7f7", "#fdae6b", "#e6550d", "#7f2704"],
    "key_breakpoints": [-8.0, 8.0],
    "step": 1.0,
}

# Snow depth in inches (native m). White → blues → purples.
_SNOW_DEPTH_SCALE_CONFIG = {
    "mapping": "fixed_anchors",
    "domain_min": 0.0,
    "domain_max": 60.0,
    "anchor_values": [0.0, 1.0, 4.0, 8.0, 12.0, 24.0, 36.0, 60.0],
    "anchor_colors": [
        "#ffffff", "#deebf7", "#9ecae1", "#4292c6",
        "#08519c", "#54278f", "#7a0177", "#49006a",
    ],
    "key_breakpoints": [4.0, 12.0],
    "step": 1.0,
}


def _k_to_f(values):
    return values * 9.0 / 5.0 - 459.67


# Variables rendered as generic filled contours from a fixed-anchor config.
# to_display converts native GRIB units → the config's display units;
# colorbar ticks land on every "tick_every" display units.
_FIXED_SCALE_CONFIGS: dict[str, dict] = {
    "omega":       {**_OMEGA_SCALE_CONFIG,       "tick_every": 0.5,   "label": "Omega",              "extend": "both"},
    "precip_rate": {**_PRECIP_RATE_SCALE_CONFIG, "tick_every": 10.0,  "label": "Precipitation Rate", "extend": "max",
                    "to_display": lambda v: v * _PRATE_TO_MM_DAY},
    "olr":         {**_OLR_SCALE_CONFIG,         "tick_every": 20.0,  "label": "OLR",                "extend": "both"},
    "cape":        {**_CAPE_SCALE_CONFIG,        "tick_every": 500.0, "label": "CAPE",               "extend": "max"},
    "cape_ml":     {**_CAPE_SCALE_CONFIG,        "tick_every": 500.0, "label": "CAPE",               "extend": "max"},
    "cape_mu":     {**_CAPE_SCALE_CONFIG,        "tick_every": 500.0, "label": "CAPE",               "extend": "max"},
    "cin":         {**_CIN_SCALE_CONFIG,         "tick_every": 50.0,  "label": "CIN",                "extend": "min"},
    "cin_ml":      {**_CIN_SCALE_CONFIG,         "tick_every": 50.0,  "label": "CIN",                "extend": "min"},
    "cin_mu":      {**_CIN_SCALE_CONFIG,         "tick_every": 50.0,  "label": "CIN",                "extend": "min"},
    "dewpoint_2m": {**_DEWPOINT_SCALE_CONFIG,    "tick_every": 10.0,  "label": "2m Dewpoint",        "extend": "both",
                    "to_display": _k_to_f},
    "absv":        {**_ABSV_SCALE_CONFIG,        "tick_every": 10.0,  "label": "Absolute Vorticity", "extend": "both",
                    "to_display": lambda v: v * 1e5},
    "snow_depth":  {**_SNOW_DEPTH_SCALE_CONFIG,  "tick_every": 6.0,   "label": "Snow Depth",         "extend": "max",
                    "to_display": lambda v: v * _M_TO_IN},
}


def _pwat_display_scale_config(pwat_unit: str) -> dict:
    if pwat_unit != "in":
        return _PWAT_SCALE_CONFIG
    return {
        **_PWAT_SCALE_CONFIG,
        "domain_min": _PWAT_SCALE_CONFIG["domain_min"] * 0.03937007874,
        "domain_max": _PWAT_SCALE_CONFIG["domain_max"] * 0.03937007874,
        "anchor_values": [round(v * 0.03937007874, 3) for v in _PWAT_SCALE_CONFIG["anchor_values"]],
        "key_breakpoints": [round(v * 0.03937007874, 3) for v in _PWAT_SCALE_CONFIG["key_breakpoints"]],
    }


def _make_pwat_scale(step_mm: int = 1, pwat_unit: str = "mm") -> tuple[list[float], list[tuple], dict]:
    """PWAT breakpoints and colors in the selected display unit."""
    step_mm = max(int(step_mm), 1)
    native_steps = list(range(_PWAT_SCALE_CONFIG["domain_min"], _PWAT_SCALE_CONFIG["domain_max"], step_mm))
    native_steps.append(_PWAT_SCALE_CONFIG["domain_max"])
    steps = [round(_pwat_to_display(v, pwat_unit), 4) for v in native_steps]
    cfg = _pwat_display_scale_config(pwat_unit)
    colors = _interpolate_interval_colors(steps, _resolve_anchor_values(cfg), cfg["anchor_colors"])
    return steps, colors, cfg


def _make_specific_humidity_scale(step_multiplier: int = 1) -> tuple[list[float], list[tuple], dict]:
    """Specific humidity breakpoints in kg/kg."""
    step = max(int(step_multiplier), 1) * 0.001
    max_value = _SPECIFIC_HUMIDITY_SCALE_CONFIG["domain_max"]
    steps = [round(v, 6) for v in np.arange(0.0, max_value, step).tolist()]
    if not steps or steps[0] != 0.0:
        steps.insert(0, 0.0)
    if abs(steps[-1] - max_value) > 1e-9:
        steps.append(max_value)
    colors = _interpolate_interval_colors(
        steps,
        _resolve_anchor_values(_SPECIFIC_HUMIDITY_SCALE_CONFIG),
        _SPECIFIC_HUMIDITY_SCALE_CONFIG["anchor_colors"],
    )
    return steps, colors, _SPECIFIC_HUMIDITY_SCALE_CONFIG


def _draw_anchored_fill(ax, display_values, data_array, levels, cfg: dict, ylabel: str):
    """
    Filled contours between the map's own contour levels, colored by the
    fixed-anchor mapping in cfg — the same physical value gets the same color
    on every map, while the colorbar spans only the plotted range.
    Returns (plot_obj, cbar_cfg); (None, None) if too few levels to fill.
    """
    boundaries = [float(v) for v in levels]
    if len(boundaries) < 2:
        return None, None
    colors = _interpolate_interval_colors(boundaries, _resolve_anchor_values(cfg), cfg["anchor_colors"])
    cmap = mcolors.ListedColormap(colors)
    cmap.set_under(colors[0])
    cmap.set_over(colors[-1])
    norm = mcolors.BoundaryNorm(boundaries, ncolors=len(colors))
    plot_obj = ax.contourf(
        data_array.longitude, data_array.latitude, display_values,
        levels=boundaries, cmap=cmap, norm=norm,
        transform=ccrs.PlateCarree(), extend='both',
    )
    stride = max(1, round((len(boundaries) - 1) / 8))
    ticks = boundaries[::stride]
    cbar_cfg = {
        'ticks': ticks,
        'ticklabels': [_format_scale_value(v) for v in ticks],
        'ylabel': ylabel,
        'extend': 'both',
        'colors': colors, 'boundaries': boundaries,
    }
    return plot_obj, cbar_cfg


def _make_fixed_display_scale(cfg: dict, step: float | None = None) -> tuple[list[float], list[tuple], dict]:
    scale_step = float(step if step is not None else cfg["step"])
    domain_min = float(cfg["domain_min"])
    domain_max = float(cfg["domain_max"])
    steps = [round(v, 6) for v in np.arange(domain_min, domain_max, scale_step).tolist()]
    if not steps or abs(steps[0] - domain_min) > 1e-9:
        steps.insert(0, domain_min)
    if abs(steps[-1] - domain_max) > 1e-9:
        steps.append(domain_max)
    colors = _interpolate_interval_colors(steps, _resolve_anchor_values(cfg), cfg["anchor_colors"])
    # Optional pure-white floor: intervals at/below this display value render
    # white instead of interpolated tints (e.g. trace precipitation).
    white_below = cfg.get("white_below")
    if white_below is not None:
        mids = _interval_midpoints(steps)
        colors = [
            (1.0, 1.0, 1.0) if mid <= white_below + 1e-9 else color
            for mid, color in zip(mids, colors)
        ]
    return steps, colors, cfg


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
    "wind_speed":       (20.0, 2.0),    # kt
    "wind_10m":         (20.0, 2.0),    # kt
    "height":           (39.0, 3.0),    # dam
    "rel_humidity":     (30.0, 3.0),    # %
    "humidity":         (0.003, 0.0003),
    "surface_pressure": (20.0, 2.0),    # mb (hPa)
    "precipitable_water": (20.0, 2.0),  # mm
    "omega":            (1.0, 0.1),     # Pa/s
    "precip_rate":      (20.0, 2.0),    # mm/day
    "olr":              (60.0, 5.0),    # W/m²
}

# Temperature anomaly scale (Pivotal Weather-style), in display units.
# ±40 °F (±20 °C): ±1 white; warm side ramps to red by +20, deep burgundy to
# +30, rolling over to light gray at +40; cold side through royal blue (−15)
# and deep purple (−20) to burgundy (−30), rolling over to light blue at −40.
# Compresses the view for ordinary days while keeping extremes readable.
_TEMP_ANOMALY_ANCHORS_F = [-40, -30, -20, -15, -10, -5, -1, 1, 5, 10, 15, 20, 30, 40]
_TEMP_ANOMALY_HEX = [
    "#a6cee3",  # -40  light blue (rollover)
    "#67001f",  # -30  deep burgundy
    "#3f007d",  # -20  deep purple
    "#4169e1",  # -15  royal blue
    "#74a9cf",  # -10  medium blue
    "#cfe8f3",  # -5   pale blue
    "#ffffff",  # -1
    "#ffffff",  # +1
    "#fee391",  # +5   pale orange
    "#fe9929",  # +10  orange
    "#f03b20",  # +15  orange-red
    "#cb181d",  # +20  red
    "#67001f",  # +30  deep burgundy
    "#d9d9d9",  # +40  light gray (rollover)
]


def _temp_anomaly_scale(unit_letter: str, color_step: int, monthly: bool = False):
    """(max_val, step, breakpoints, colors) for temp anomalies in °F or °C."""
    scale = 1.0 if unit_letter == "F" else 0.5   # °C axis is half the °F axis
    if monthly:
        scale *= 0.5   # monthly-mean departures run about half the daily range
    max_val = 40.0 * scale
    step = (2.0 if unit_letter == "F" else 1.0) * (0.5 if monthly else 1.0) * max(color_step, 1)
    breakpoints = [round(v, 6) for v in np.arange(-max_val, max_val + step / 2, step)]
    anchors = [a * scale for a in _TEMP_ANOMALY_ANCHORS_F]
    colors = _interpolate_interval_colors(breakpoints, anchors, _TEMP_ANOMALY_HEX)
    return max_val, step, breakpoints, colors


def _anomaly_scale_in_display_units(
    variable: str, wind_unit: str, pwat_unit: str, monthly: bool = False
) -> tuple[float, float]:
    """(max, step) for the diverging anomaly scale, in the requested display units."""
    max_val, step = _ANOMALY_SCALES.get(variable, (10.0, 1.0))
    if monthly:
        # Monthly/seasonal mean anomalies are ~half the daily amplitude —
        # the daily ladder washes a ±3 mb seasonal signal to near-white.
        max_val, step = max_val * 0.5, step * 0.5
    if variable in {"wind_speed", "wind_10m"} and wind_unit == "m/s":
        return max_val * _KT_TO_MS, step * _KT_TO_MS
    if variable == "precipitable_water" and pwat_unit == "in":
        return max_val * _MM_TO_IN, step * _MM_TO_IN
    return max_val, step


def _base_contour_plan(variable, level, values, wind_unit="kt", pwat_unit="mm", temp_unit=""):
    """
    (display_values, contour_interval) for drawing the raw field as labeled
    line contours on top of anomaly/normalized shading — so the reader sees
    the actual pattern the departures refer to. None → variable not covered.
    """
    if variable == "height":
        return values / 10.0, 6.0                       # dam
    if variable == "surface_pressure":
        return values / 100.0, 4.0                      # mb
    # Temperature deliberately excluded: isotherms over temp-anomaly shading
    # read as clutter rather than context.
    if variable in {"wind_speed", "wind_10m"}:
        return values * _wind_unit_factor(wind_unit), 20.0 if wind_unit == "kt" else 10.0
    if variable == "rel_humidity":
        return values, 20.0                             # %
    if variable == "precipitable_water":
        disp = _pwat_to_display(values, pwat_unit)
        return disp, 0.5 if pwat_unit == "in" else 10.0
    if variable == "olr":
        return values, 30.0                             # W/m²
    if variable == "omega":
        return values, 0.5                              # Pa/s
    return None


def has_anomaly_base_contours(variable: str) -> bool:
    """Whether anomaly maps for this variable draw raw-field contours."""
    return _base_contour_plan(variable, 850, np.zeros((2, 2))) is not None


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


def _anomaly_to_display_with_unit(
    values: np.ndarray, variable: str, level: int, wind_unit: str = "kt", pwat_unit: str = "mm", temp_unit: str = ""
) -> np.ndarray:
    """Convert anomaly array from native units to the requested display units."""
    if variable in {"wind_speed", "wind_10m"}:
        return values * _wind_unit_factor(wind_unit)
    if variable in {"temp", "temp_2m"}:
        if _temp_display_unit(variable, level, temp_unit) == "F":
            return values * 9 / 5          # ΔK = Δ°C → Δ°F
        return values                       # ΔK = Δ°C — no offset needed for differences
    if variable == "height":
        return values / 10                  # gpm → dam
    if variable == "surface_pressure":
        return values / 100                 # Pa → mb (hPa)
    if variable == "precipitable_water":
        return _pwat_to_display(values, pwat_unit)
    if variable == "precip_rate":
        return values * _PRATE_TO_MM_DAY
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


def _custom_scale_from_spec(
    scale_spec: str | None,
    *,
    variable: str,
    level: int,
    mode: str,
    wind_unit: str,
    pwat_unit: str,
    temp_unit: str = "",
) -> dict[str, object] | None:
    if not scale_spec:
        return None
    try:
        spec = json.loads(scale_spec)
    except (TypeError, json.JSONDecodeError):
        return None
    if spec.get("variable") != variable or spec.get("mode") != mode:
        return None
    if int(spec.get("level", level)) != int(level):
        return None

    try:
        boundaries = [float(v) for v in spec.get("boundaries", [])]
        colors = [mcolors.to_rgb(str(v)) for v in spec.get("interval_hex", [])]
    except (TypeError, ValueError):
        # Malformed numbers or color strings → ignore the custom scale rather
        # than failing the whole render.
        return None
    if len(boundaries) < 2 or len(colors) != len(boundaries) - 1:
        return None

    def to_native(value: float) -> float:
        if variable in {"wind_speed", "wind_10m"}:
            return value * _KT_TO_MS if wind_unit == "kt" else value
        if variable in {"temp", "temp_2m"}:
            if _temp_display_unit(variable, level, temp_unit) == "F":
                return (value - 32.0) * 5.0 / 9.0 + 273.15
            return value + 273.15
        return value

    def label_value(value: float) -> str:
        return _format_scale_value(value)

    native_boundaries = [to_native(v) for v in boundaries]
    tick_count = min(9, len(boundaries))
    tick_idx = np.linspace(0, len(boundaries) - 1, tick_count).round().astype(int).tolist()
    tick_idx = sorted(set(tick_idx))
    return {
        "boundaries": native_boundaries,
        "colors": colors,
        "ticks": [native_boundaries[idx] for idx in tick_idx],
        "ticklabels": [label_value(boundaries[idx]) for idx in tick_idx],
        "unit": spec.get("unit") or display_unit(variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit, temp_unit=temp_unit),
    }


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
    wind_unit: str = "kt",
    pwat_unit: str = "mm",
    temp_unit: str = "",
    monthly_anomaly: bool = False,
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
            max_val, step = _anomaly_scale_in_display_units(variable, wind_unit, pwat_unit, monthly=monthly_anomaly)
            unit = display_unit(variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit, temp_unit=temp_unit)
            plot_values = (
                np.asarray(
                    _anomaly_to_display_with_unit(data_array.values, variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit, temp_unit=temp_unit),
                    dtype=float,
                )
                if data_array is not None else None
            )
            if variable == "wind_speed":
                native_cfg = _wind_vector_anomaly_native_config(wind_unit, color_step, plot_values)
                breakpoints = native_cfg["breakpoints"]
                interval_colors = native_cfg["colors"]
                anchor_values = breakpoints[:-1]
                anchor_hex = [_rgb_to_hex(c) for c in interval_colors]
                scale_kind = "vector-anomaly-magnitude"
            elif variable in {"temp", "temp_2m"}:
                unit_letter = _temp_display_unit(variable, level, temp_unit)
                max_val, step, breakpoints, interval_colors = _temp_anomaly_scale(unit_letter, color_step, monthly=monthly_anomaly)
                unit_scale = (1.0 if unit_letter == "F" else 0.5) * (0.5 if monthly_anomaly else 1.0)
                anchor_values = [a * unit_scale for a in _TEMP_ANOMALY_ANCHORS_F]
                anchor_hex = _TEMP_ANOMALY_HEX
                scale_kind = mode
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

    if variable in {"wind_speed", "wind_10m"}:
        scale_level = _render_level(variable, level)
        group, scale_cfg = _resolved_wind_scale_config(scale_level, scale_overrides)
        min_kt = scale_cfg["domain_min"]
        max_kt = scale_cfg["domain_max"]
        anchor_kt = _resolve_anchor_values(scale_cfg)
        boundaries_ms, interval_colors, _, _ = _make_wind_scale(scale_level, step_kt=color_step, scale_overrides=scale_overrides)
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

    if variable in {"temp", "temp_2m"} and _render_level(variable, level) in _TEMP_SCALES:
        cfg = _TEMP_SCALES[_render_level(variable, level)]
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

    if variable == "height":
        step = max(color_step, 1) * _HEIGHT_CONTOUR_SCALE_CONFIG["step"]
        boundaries, interval_colors, cfg = _make_fixed_display_scale(_HEIGHT_CONTOUR_SCALE_CONFIG, step=step)
        data_vals = (
            np.asarray((data_array.values / 10.0), dtype=float)
            if data_array is not None else None
        )
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": "fixed-height-contours",
            "unit": "dam",
            "step": step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": cfg["anchor_values"],
            "anchor_hex": cfg["anchor_colors"],
            "key_breakpoints": cfg["key_breakpoints"],
            "domain_min": cfg["domain_min"],
            "domain_max": cfg["domain_max"],
            **stats,
        }

    if variable == "surface_pressure":
        step = max(color_step, 1) * _MSLP_CONTOUR_SCALE_CONFIG["step"]
        boundaries, interval_colors, cfg = _make_fixed_display_scale(_MSLP_CONTOUR_SCALE_CONFIG, step=step)
        data_vals = (
            np.asarray((data_array.values / 100.0), dtype=float)
            if data_array is not None else None
        )
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": "fixed-mslp-contours",
            "unit": "mb",
            "step": step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": cfg["anchor_values"],
            "anchor_hex": cfg["anchor_colors"],
            "key_breakpoints": cfg["key_breakpoints"],
            "domain_min": cfg["domain_min"],
            "domain_max": cfg["domain_max"],
            **stats,
        }

    if variable == "precipitable_water":
        boundaries, interval_colors, cfg = _make_pwat_scale(step_mm=color_step, pwat_unit=pwat_unit)
        data_vals = (
            np.asarray(_pwat_to_display(data_array.values, pwat_unit), dtype=float)
            if data_array is not None else None
        )
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": "fixed-pwat",
            "unit": _pwat_unit_label(pwat_unit),
            "step": color_step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": cfg["anchor_values"],
            "anchor_hex": cfg["anchor_colors"],
            "key_breakpoints": cfg["key_breakpoints"],
            "domain_min": cfg["domain_min"],
            "domain_max": cfg["domain_max"],
            **stats,
        }

    if variable == "humidity":
        boundaries, interval_colors, cfg = _make_specific_humidity_scale(step_multiplier=color_step)
        data_vals = np.asarray(data_array.values, dtype=float) if data_array is not None else None
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": "fixed-specific-humidity",
            "unit": "kg/kg",
            "step": color_step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": cfg["anchor_values"],
            "anchor_hex": cfg["anchor_colors"],
            "key_breakpoints": cfg["key_breakpoints"],
            "domain_min": cfg["domain_min"],
            "domain_max": cfg["domain_max"],
            **stats,
        }

    if variable in _FIXED_SCALE_CONFIGS:
        cfg_base = _FIXED_SCALE_CONFIGS[variable]
        step = max(color_step, 1) * cfg_base["step"]
        boundaries, interval_colors, cfg = _make_fixed_display_scale(cfg_base, step=step)
        to_display = cfg_base.get("to_display", lambda v: v)
        data_vals = (
            np.asarray(to_display(data_array.values), dtype=float)
            if data_array is not None else None
        )
        stats = _scale_data_stats(data_vals, boundaries) if data_vals is not None else {}
        return {
            "scale_kind": f"fixed-{variable.replace('_', '-')}",
            "unit": display_unit(variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit),
            "step": step,
            "boundaries": boundaries,
            "interval_mids": _interval_midpoints(boundaries),
            "interval_hex": [_rgb_to_hex(c) for c in interval_colors],
            "anchor_values": cfg["anchor_values"],
            "anchor_hex": cfg["anchor_colors"],
            "key_breakpoints": cfg["key_breakpoints"],
            "domain_min": cfg["domain_min"],
            "domain_max": cfg["domain_max"],
            **stats,
        }

    return {
        "scale_kind": "fixed-scale-missing",
        "unit": display_unit(variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit),
        "step": color_step,
    }


# ── MSLP H/L center detection ─────────────────────────────────────────────────────

_CENTER_WINDOW_DEG = 7.5            # neighborhood a center must dominate
_CENTER_PROMINENCE_WINDOW_DEG = 15.0  # neighborhood prominence is measured over
_CENTER_PROMINENCE_HPA = 2.5        # min depth/height vs that wider neighborhood


def _detect_pressure_centers(mslp_da):
    """
    Locate synoptic H/L centers on an MSLP field (Pa).
    Returns (lows, highs): lists of (lon, lat, value_hpa). A grid point
    qualifies when it is the extremum of its ~7.5° neighborhood, exceeds a
    prominence threshold there, and is not within the window of the map edge
    or of a stronger accepted center.
    """
    from scipy.ndimage import maximum_filter, minimum_filter

    hpa = mslp_da.values / 100.0
    lons = mslp_da.longitude.values
    lats = mslp_da.latitude.values
    if len(lons) < 5 or len(lats) < 5:
        return [], []
    grid_deg = abs(float(lons[1] - lons[0]))
    size = max(3, int(round(_CENTER_WINDOW_DEG / grid_deg)) | 1)
    # Prominence over a wider window than the extremum test: seasonal-mean
    # centers are broad, so their local relief is tiny even when they stand
    # several mb above/below their surroundings.
    prom_size = max(size, int(round(_CENTER_PROMINENCE_WINDOW_DEG / grid_deg)) | 1)
    margin = size // 2

    def pick(mask, prominence_ok, ascending):
        ys, xs = np.nonzero(mask & prominence_ok)
        candidates = sorted(
            ((hpa[y, x], y, x) for y, x in zip(ys, xs)),
            key=lambda t: t[0], reverse=not ascending,
        )
        accepted = []
        for value, y, x in candidates:
            if y < margin or x < margin or y >= hpa.shape[0] - margin or x >= hpa.shape[1] - margin:
                continue
            if any(abs(y - ay) < size and abs(x - ax) < size for _, ay, ax in accepted):
                continue
            accepted.append((value, y, x))
        return [(float(lons[x]), float(lats[y]), value) for value, y, x in accepted]

    mn = minimum_filter(hpa, size=size, mode="nearest")
    mx = maximum_filter(hpa, size=size, mode="nearest")
    mn_wide = minimum_filter(hpa, size=prom_size, mode="nearest")
    mx_wide = maximum_filter(hpa, size=prom_size, mode="nearest")
    lows  = pick(hpa == mn, (mx_wide - hpa) >= _CENTER_PROMINENCE_HPA, ascending=True)
    highs = pick(hpa == mx, (hpa - mn_wide) >= _CENTER_PROMINENCE_HPA, ascending=False)
    return lows, highs


def _draw_contour_overlay(ax, overlay: dict, temp_unit: str = "") -> None:
    """
    Labeled line contours over the shaded field. Styling per kind:
    isobars solid dark gray at 4 mb, heights solid black at 6 dam,
    isotherms dashed red at 10°F / 5°C.
    """
    import matplotlib.patheffects as pe

    kind = overlay["kind"]
    da = overlay["data"]
    if kind == "pressure":
        disp, interval, color, ls, lw = da.values / 100.0, 4.0, "#2b2b2b", "solid", 1.0
    elif kind == "height":
        disp, interval, color, ls, lw = da.values / 10.0, 6.0, "black", "solid", 1.0
    else:
        variable = "temp_2m" if overlay.get("is_2m") else "temp"
        unit = _temp_display_unit(variable, overlay["level"], temp_unit)
        disp = _k_to_f(da.values) if unit == "F" else da.values - 273.15
        interval, color, ls, lw = (10.0 if unit == "F" else 5.0), "#e8112d", "dashed", 1.2
    v0 = float(np.floor(np.nanmin(disp) / interval) * interval)
    v1 = float(np.ceil(np.nanmax(disp) / interval) * interval)
    levels = np.arange(v0, v1 + interval / 2, interval)
    if len(levels) < 2:
        return
    cs = ax.contour(
        da.longitude, da.latitude, disp,
        levels=levels, colors=color, linewidths=lw, linestyles=ls,
        transform=ccrs.PlateCarree(), zorder=10,
    )
    # White halo under lines and labels so overlays stay legible over
    # saturated shading.
    halo_lines = [pe.withStroke(linewidth=lw + 1.6, foreground="white", alpha=0.85)]
    cs.set_path_effects(halo_lines)
    labels = ax.clabel(cs, cs.levels, inline=True, fontsize=8, fmt='%g')
    for label in labels or []:
        label.set_path_effects([pe.withStroke(linewidth=2.2, foreground="white")])


def _draw_pressure_centers(ax, centers_da) -> None:
    """Stamp red L / blue H glyphs with values at detected MSLP centers."""
    import matplotlib.patheffects as pe

    lows, highs = _detect_pressure_centers(centers_da)
    halo = [pe.withStroke(linewidth=2.5, foreground="white")]
    for glyph, color, points in (("L", "#d7191c", lows), ("H", "#2166ac", highs)):
        for lon, lat, value in points:
            ax.text(
                lon, lat, glyph,
                transform=ccrs.PlateCarree(), ha="center", va="center",
                fontsize=16, fontweight="bold", color=color,
                path_effects=halo, clip_on=True, zorder=12,
            )
            ax.annotate(
                f"{value:.0f}",
                xy=(lon, lat), xycoords=ccrs.PlateCarree()._as_mpl_transform(ax),
                xytext=(0, -12), textcoords="offset points",
                ha="center", va="top", fontsize=7.5, fontweight="bold",
                color=color, path_effects=halo, clip_on=True, zorder=12,
            )


# ── Core rendering function ──────────────────────────────────────────────────────

def create_map_product(data_array, region_bounds, var_name, date_str, variable="wind_speed", level=850, region="CONUS", u_array=None, v_array=None, wind_step=0, wind_type="vectors", color_step=1, mode="raw", scale_spec: str | None = None, scale_overrides: dict[str, float] | None = None, wind_unit: str = "kt", pwat_unit: str = "mm", fill_mode: str = "contours", temp_unit: str = "", base_array=None, isotachs: bool = False, centers_array=None, contour_overlays=None, monthly_anomaly: bool = False):
    with _RENDER_LOCK:
        return _create_map_product(
            data_array, region_bounds, var_name, date_str, variable=variable, level=level,
            region=region, u_array=u_array, v_array=v_array, wind_step=wind_step,
            wind_type=wind_type, color_step=color_step, mode=mode, scale_spec=scale_spec,
            scale_overrides=scale_overrides, wind_unit=wind_unit, pwat_unit=pwat_unit,
            fill_mode=fill_mode, temp_unit=temp_unit, base_array=base_array, isotachs=isotachs,
            centers_array=centers_array, contour_overlays=contour_overlays,
            monthly_anomaly=monthly_anomaly,
        )


def _create_map_product(data_array, region_bounds, var_name, date_str, variable="wind_speed", level=850, region="CONUS", u_array=None, v_array=None, wind_step=0, wind_type="vectors", color_step=1, mode="raw", scale_spec: str | None = None, scale_overrides: dict[str, float] | None = None, wind_unit: str = "kt", pwat_unit: str = "mm", fill_mode: str = "contours", temp_unit: str = "", base_array=None, isotachs: bool = False, centers_array=None, contour_overlays=None, monthly_anomaly: bool = False):
    # OO API (no pyplot): keeps figures off pyplot's global registry so worker
    # threads cannot close each other's in-flight renders.
    fig = Figure(figsize=(14, 9))
    FigureCanvasAgg(fig)
    proj = _REGION_PROJECTIONS.get(region, ccrs.PlateCarree())
    ax = fig.add_subplot(1, 1, 1, projection=proj)

    # Phase 1: create the filled plot; collect colorbar config separately.
    # The colorbar is added AFTER fig.canvas.draw() so we can read the final
    # Cartopy-adjusted axes position and place cax to exactly match it.
    plot_obj   = None
    cbar_cfg   = None   # {ticks, ticklabels, ylabel} — None means no colorbar
    custom_scale = _custom_scale_from_spec(
        scale_spec,
        variable=variable,
        level=level,
        mode=mode,
        wind_unit=wind_unit,
        pwat_unit=pwat_unit,
        temp_unit=temp_unit,
    )

    def draw_custom_filled(plot_values, *, ylabel: str, extend: str = "both"):
        nonlocal plot_obj, cbar_cfg
        if not custom_scale:
            return False
        boundaries = custom_scale["boundaries"]
        colors = custom_scale["colors"]
        cmap = mcolors.ListedColormap(colors)
        cmap.set_under(colors[0])
        cmap.set_over(colors[-1])
        norm = mcolors.BoundaryNorm(boundaries, ncolors=len(colors))
        plot_obj = ax.contourf(
            data_array.longitude, data_array.latitude, plot_values,
            levels=boundaries, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend=extend,
        )
        cbar_cfg = {
            'ticks': custom_scale["ticks"],
            'ticklabels': custom_scale["ticklabels"],
            'ylabel': ylabel,
            'extend': extend,
            'colors': colors,
            'boundaries': boundaries,
        }
        return True

    if mode in ("anomaly", "normalized"):
        if mode == "normalized":
            max_val    = _NORMALIZED_MAX
            step       = max(color_step * 0.5, 0.5)
            unit_label = "σ"
            plot_vals  = data_array.values
        else:
            max_val, step = _anomaly_scale_in_display_units(variable, wind_unit, pwat_unit, monthly=monthly_anomaly)
            unit_label = display_unit(variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit, temp_unit=temp_unit)
            plot_vals  = _anomaly_to_display_with_unit(data_array.values, variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit, temp_unit=temp_unit)
        if mode == "anomaly" and variable == "wind_speed":
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
            if mode == "anomaly" and variable in {"temp", "temp_2m"}:
                unit_letter = _temp_display_unit(variable, level, temp_unit)
                max_val, step, breakpoints, colors = _temp_anomaly_scale(unit_letter, color_step, monthly=monthly_anomaly)
                tick_every = 10.0 if unit_letter == "F" else 5.0
            else:
                breakpoints, colors = _make_diverging_scale(max_val, step, white_steps=1)
                tick_every = None
            cmap = mcolors.ListedColormap(colors)
            cmap.set_under(colors[0])
            cmap.set_over(colors[-1])
            norm = mcolors.BoundaryNorm(breakpoints, ncolors=len(colors))
            plot_obj = ax.contourf(
                data_array.longitude, data_array.latitude, plot_vals,
                levels=breakpoints, cmap=cmap, norm=norm,
                transform=ccrs.PlateCarree(), extend='both',
            )
            if tick_every is not None:
                tick_vals = [round(v, 9) for v in np.arange(-max_val, max_val + tick_every / 2, tick_every)]
            else:
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

    elif variable in {"wind_speed", "wind_10m"}:
        scale_level = _render_level(variable, level)
        # fill_mode="none": isotachs/barbs-only wind map — skip the shaded
        # field and its colorbar; the overlay phase draws the layers.
        if fill_mode == "none":
            pass
        elif not draw_custom_filled(data_array.values, ylabel=f'Wind Speed ({_wind_unit_label(wind_unit)})', extend='both'):
            breakpoints_ms, interval_colors, min_kt, max_kt = _make_wind_scale(
                scale_level,
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

    elif variable in {"temp", "temp_2m"} and _render_level(variable, level) in _TEMP_SCALES:
        cfg = _TEMP_SCALES[_render_level(variable, level)]
        shown_unit = _temp_display_unit(variable, level, temp_unit)
        name = "2m Temperature" if variable == "temp_2m" else "Temperature"
        temp_label = f"{name} (°{shown_unit})"
        if not draw_custom_filled(data_array.values, ylabel=temp_label, extend='both'):
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
            if shown_unit == cfg["unit"]:
                # Native unit: round ticks straight from the scale config.
                tick_step = color_step if color_step >= 10 else max(color_step * round(10 / color_step), color_step)
                tick_vals = list(range(cfg["t_min"], cfg["t_max"] + 1, tick_step))
                tick_positions_k = [to_k(t) for t in tick_vals]
            else:
                # Unit override: boundaries stay physically anchored; ticks land
                # on round values of the chosen unit within the same K range.
                from_k = _k_to_f if shown_unit == "F" else (lambda v: v - 273.15)
                back_to_k = _f_to_k if shown_unit == "F" else _c_to_k
                tick_step = 10 if shown_unit == "F" else 5
                u_min = int(np.ceil(from_k(breakpoints_k[0]) / tick_step) * tick_step)
                u_max = int(np.floor(from_k(breakpoints_k[-1]) / tick_step) * tick_step)
                tick_vals = list(range(u_min, u_max + 1, tick_step))
                tick_positions_k = [back_to_k(t) for t in tick_vals]
            cbar_cfg = {
                'ticks':      tick_positions_k,
                'ticklabels': [str(t) for t in tick_vals],
                'ylabel':     temp_label,
                'extend':     'both',
                'colors': interval_colors, 'boundaries': breakpoints_k,
            }

    elif variable == "height":
        dam = data_array / 10.0
        interval = color_step * 4
        v0 = float(np.floor(dam.values.min() / interval) * interval)
        v1 = float(np.ceil( dam.values.max() / interval) * interval)
        levels = np.arange(v0, v1 + interval / 2, interval)
        if fill_mode == "shaded":
            fill_cfg = _height_fill_cfg(level) or _HEIGHT_CONTOUR_SCALE_CONFIG
            plot_obj, cbar_cfg = _draw_anchored_fill(
                ax, dam.values, data_array, levels,
                fill_cfg, 'Geopotential Height (dam)',
            )
        cs = ax.contour(
            data_array.longitude, data_array.latitude, dam.values,
            levels=levels, colors='black', linewidths=0.8,
            transform=ccrs.PlateCarree(),
        )
        ax.clabel(cs, cs.levels, inline=True, fontsize=9, fmt='%d')
        # contours-only mode has no colorbar

    elif variable == "surface_pressure":
        hpa = data_array / 100.0
        interval = 4
        v0 = float(np.floor(hpa.values.min() / interval) * interval)
        v1 = float(np.ceil( hpa.values.max() / interval) * interval)
        levels = np.arange(v0, v1 + interval / 2, interval)
        if fill_mode == "shaded":
            plot_obj, cbar_cfg = _draw_anchored_fill(
                ax, hpa.values, data_array, levels,
                _MSLP_CONTOUR_SCALE_CONFIG, 'Mean Sea Level Pressure (mb)',
            )
        cs = ax.contour(
            data_array.longitude, data_array.latitude, hpa.values,
            levels=levels, colors='black', linewidths=0.8,
            transform=ccrs.PlateCarree(),
        )
        ax.clabel(cs, cs.levels, inline=True, fontsize=9, fmt='%d')
        # standard 4 mb isobars; contours-only mode has no colorbar

    elif variable == "rel_humidity":
        if not draw_custom_filled(data_array.values, ylabel='Relative Humidity (%)', extend='both'):
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

    elif variable == "precipitable_water":
        plot_values = _pwat_to_display(data_array.values, pwat_unit)
        if not draw_custom_filled(plot_values, ylabel=f'Precipitable Water ({_pwat_unit_label(pwat_unit)})', extend='both'):
            steps, interval_colors, _ = _make_pwat_scale(step_mm=color_step, pwat_unit=pwat_unit)
            cmap = mcolors.ListedColormap(interval_colors)
            cmap.set_under(interval_colors[0])
            cmap.set_over(interval_colors[-1])
            norm = mcolors.BoundaryNorm(steps, ncolors=len(interval_colors))
            plot_obj = ax.contourf(
                data_array.longitude, data_array.latitude, plot_values,
                levels=steps, cmap=cmap, norm=norm,
                transform=ccrs.PlateCarree(), extend='both',
            )
            tick_step = 10 if pwat_unit != "in" else 0.5
            ticks = np.arange(steps[0], steps[-1] + tick_step / 2, tick_step)
            cbar_cfg = {
                'ticks':      ticks.tolist(),
                'ticklabels': [f"{v:g}" for v in ticks],
                'ylabel':     f'Precipitable Water ({_pwat_unit_label(pwat_unit)})',
                'extend':     'both',
                'colors': interval_colors, 'boundaries': steps,
            }

    elif variable == "humidity":
        if not draw_custom_filled(data_array.values, ylabel='Specific Humidity (kg/kg)', extend='both'):
            steps, interval_colors, _ = _make_specific_humidity_scale(step_multiplier=color_step)
            cmap = mcolors.ListedColormap(interval_colors)
            cmap.set_under(interval_colors[0])
            cmap.set_over(interval_colors[-1])
            norm = mcolors.BoundaryNorm(steps, ncolors=len(interval_colors))
            plot_obj = ax.contourf(
                data_array.longitude, data_array.latitude, data_array.values,
                levels=steps, cmap=cmap, norm=norm,
                transform=ccrs.PlateCarree(), extend='both',
            )
            ticks = np.arange(0.0, steps[-1] + 0.004 / 2, 0.004)
            cbar_cfg = {
                'ticks':      ticks.tolist(),
                'ticklabels': [f"{v:.3f}".rstrip("0").rstrip(".") for v in ticks],
                'ylabel':     'Specific Humidity (kg/kg)',
                'extend':     'both',
                'colors': interval_colors, 'boundaries': steps,
            }

    elif variable in _FIXED_SCALE_CONFIGS:
        cfg_base = _FIXED_SCALE_CONFIGS[variable]
        plot_values = cfg_base.get("to_display", lambda v: v)(data_array.values)
        unit = display_unit(variable, level, wind_unit=wind_unit, pwat_unit=pwat_unit)
        ylabel = f"{cfg_base['label']} ({unit})"
        if not draw_custom_filled(plot_values, ylabel=ylabel, extend=cfg_base["extend"]):
            step = max(color_step, 1) * cfg_base["step"]
            steps, interval_colors, _ = _make_fixed_display_scale(cfg_base, step=step)
            cmap = mcolors.ListedColormap(interval_colors)
            cmap.set_under(interval_colors[0])
            cmap.set_over(interval_colors[-1])
            norm = mcolors.BoundaryNorm(steps, ncolors=len(interval_colors))
            plot_obj = ax.contourf(
                data_array.longitude, data_array.latitude, plot_values,
                levels=steps, cmap=cmap, norm=norm,
                transform=ccrs.PlateCarree(), extend=cfg_base["extend"],
            )
            tick_every = cfg_base["tick_every"]
            ticks = np.arange(steps[0], steps[-1] + tick_every / 2, tick_every)
            cbar_cfg = {
                'ticks':      ticks.tolist(),
                'ticklabels': [f"{v:g}" for v in ticks],
                'ylabel':     ylabel,
                'extend':     cfg_base["extend"],
                'colors': interval_colors, 'boundaries': steps,
            }

    else:
        raise ValueError(f"No fixed rendering scale configured for variable: {variable}")

    # Raw-field context contours on anomaly/normalized maps: departures only
    # make sense against the actual pattern they depart from.
    if mode in ("anomaly", "normalized") and base_array is not None:
        plan = _base_contour_plan(variable, level, base_array.values, wind_unit=wind_unit, pwat_unit=pwat_unit, temp_unit=temp_unit)
        if plan is not None:
            base_disp, base_interval = plan
            b0 = float(np.floor(np.nanmin(base_disp) / base_interval) * base_interval)
            b1 = float(np.ceil(np.nanmax(base_disp) / base_interval) * base_interval)
            base_levels = np.arange(b0, b1 + base_interval / 2, base_interval)
            if len(base_levels) >= 2:
                cs = ax.contour(
                    base_array.longitude, base_array.latitude, base_disp,
                    levels=base_levels, colors='black', linewidths=0.7, alpha=0.85,
                    transform=ccrs.PlateCarree(),
                )
                ax.clabel(cs, cs.levels, inline=True, fontsize=8, fmt='%g')

    # Phase 2: wind overlay, title, extent, map features.
    # Isotachs and glyphs are independent layers over the same components.
    if u_array is not None and v_array is not None:
        if isotachs:
            # Labeled speed contours on the full grid (density stride does not
            # apply). Interval/threshold in display units: below the threshold
            # is background flow that would only clutter the map.
            speed = np.sqrt(u_array.values ** 2 + v_array.values ** 2) * _wind_unit_factor(wind_unit)
            interval = 20.0 if wind_unit == "kt" else 10.0
            first = 30.0 if wind_unit == "kt" else 15.0
            speed_max = float(np.nanmax(speed))
            if speed_max >= first:
                iso_levels = np.arange(first, speed_max + interval, interval)
                cs = ax.contour(
                    u_array.longitude, u_array.latitude, speed,
                    levels=iso_levels, colors='#4a1486', linewidths=1.0,
                    transform=ccrs.PlateCarree(),
                )
                ax.clabel(cs, cs.levels, inline=True, fontsize=8, fmt='%d')
        if wind_step > 0:
            # Density N = stride N on the native CORe obs grid (T170 gaussian,
            # ~0.70°), the resolution users calibrated against. Coarser sources
            # (2.5° R2 climatology) scale the stride to keep the same on-map
            # spacing for the same setting.
            CORE_GRID_DEG = 0.703125
            lon_vals = u_array.longitude.values
            grid_deg = abs(float(lon_vals[1] - lon_vals[0])) if len(lon_vals) > 1 else CORE_GRID_DEG
            s = max(1, round(wind_step * CORE_GRID_DEG / grid_deg))
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

    if contour_overlays and plot_obj is not None:
        # Overlay-contrast rule: wash the fill slightly so line overlays read
        # on top of saturated shading.
        try:
            plot_obj.set_alpha(0.85)
        except (AttributeError, TypeError):
            pass

    for overlay in (contour_overlays or []):
        _draw_contour_overlay(ax, overlay, temp_unit)

    if centers_array is not None:
        _draw_pressure_centers(ax, centers_array)

    lon0, lon1, lat0, lat1 = _REGION_EXTENTS.get(
        region,
        (region_bounds["lon"][0], region_bounds["lon"][1],
         region_bounds["lat"][0], region_bounds["lat"][1]),
    )
    if region in _DATELINE_EXTENT_REGIONS:
        # Offsets from 180° stay continuous across the antimeridian.
        x0 = (lon0 % 360) - 180
        x1 = (lon1 % 360) - 180
        ax.set_extent([x0, x1, lat0, lat1], crs=ccrs.PlateCarree(central_longitude=180))
    else:
        ax.set_extent([lon0, lon1, lat0, lat1], crs=ccrs.PlateCarree())
    if region in _POLAR_HEMISPHERE_REGIONS:
        _apply_polar_boundary(ax)
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

    title_lines = [line for line in str(date_str).splitlines() if line.strip()]
    fig.text(
        pos.x0, pos.y1 + 0.045,
        var_name,
        fontsize=11, color='black', fontweight='bold',
        ha='left', va='bottom',
        transform=fig.transFigure,
    )
    if title_lines:
        fig.text(
            pos.x0, pos.y1 + 0.026,
            title_lines[0],
            fontsize=9, color='black', fontweight='semibold',
            ha='left', va='bottom',
            transform=fig.transFigure,
        )
    if len(title_lines) > 1:
        fig.text(
            pos.x0, pos.y1 + 0.010,
            "  ".join(title_lines[1:]),
            fontsize=8, color='#555',
            ha='left', va='bottom',
            transform=fig.transFigure,
        )

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
    fig.text(
        pos.x1, pos.y0 - 0.018,
        'PyReWeather.org',
        fontsize=11, color='#555', fontweight='bold',
        ha='right', va='top',
        transform=fig.transFigure,
    )

    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=200)
    buf.seek(0)
    return buf
