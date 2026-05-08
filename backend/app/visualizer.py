import io

import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
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
}

_REGION_EXTENTS: dict[str, tuple[float, float, float, float]] = {
    "CONUS": (-125, -66, 24, 50),   # (lon_min, lon_max, lat_min, lat_max)
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

_LEVEL_KT_RANGES: dict[str, tuple[int, int]] = {
    "surface": (10,  60),   # 1000mb
    "low":     (20,  80),   # 925/850/700/600mb
    "mid":     (20, 140),   # 500/400mb
    "high":    (50, 170),   # 300mb and above
}


def _wind_scale(level: int) -> list[float]:
    """Return 13 evenly-spaced m/s breakpoints for the level's kt range."""
    if level == 1000:
        group = "surface"
    elif level in (925, 850, 700, 600):
        group = "low"
    elif level in (500, 400):
        group = "mid"
    else:
        group = "high"

    min_kt, max_kt = _LEVEL_KT_RANGES[group]
    n = len(_WIND_COLORS)
    step = (max_kt - min_kt) / (n - 1)
    return [round((min_kt + i * step) * _KT_TO_MS, 1) for i in range(n)]


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
        "unit": "F",
        "anchors":    [-60, -40,   0,   1,  15,  31,  32,   50,   70,   80,  81,  100, 120],
        "anchor_hex": [
            '#2a4d73', '#ace3db', '#7a26ab', '#a149b3', '#d8e3eb',
            '#1650b5', '#104354', '#f2f1a7', '#610d0c', '#7d2f43',
            '#7a4036', '#f2e7dc', '#4a4a44',
        ],
        "t_min": -60,
        "t_max": 120,
    },
    925: {"unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  40},
    850: {"unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  40},
    700: {"unit": "C", "anchors": _TEMP_LOW_ANCHORS_C, "anchor_hex": _TEMP_LOW_ANCHOR_HEX, "t_min": -40, "t_max":  30},
}


def _f_to_k(f: float) -> float:
    return (f - 32.0) * 5.0 / 9.0 + 273.15


def _c_to_k(c: float) -> float:
    return c + 273.15


def _make_temp_scale(cfg: dict) -> tuple[list[float], list[tuple], callable]:
    """
    Build a 1-degree discrete temperature scale from a _TEMP_SCALES config entry.
    Returns (breakpoints_K, interval_RGB_colors, to_k_fn).
    """
    to_k = _c_to_k if cfg["unit"] == "C" else _f_to_k
    steps = list(range(cfg["t_min"], cfg["t_max"] + 1))
    anchor_rgb = np.array([mcolors.to_rgb(c) for c in cfg["anchor_hex"]])
    colors = []
    for t in steps[:-1]:
        r = float(np.interp(t, cfg["anchors"], anchor_rgb[:, 0]))
        g = float(np.interp(t, cfg["anchors"], anchor_rgb[:, 1]))
        b = float(np.interp(t, cfg["anchors"], anchor_rgb[:, 2]))
        colors.append((r, g, b))
    breakpoints_k = [round(to_k(t), 4) for t in steps]
    return breakpoints_k, colors, to_k


def temp_display_unit(level: int) -> str:
    """Return the unit string for the map title: matches what the colorbar shows."""
    cfg = _TEMP_SCALES.get(level)
    if cfg is None:
        return "K"
    return f"°{cfg['unit']}"


# ── Relative humidity scale ───────────────────────────────────────────────────────
# 1 % steps, 0–100 %. Breakpoints are plain percentages (data is already in %).
_RH_ANCHORS_PCT = [  0,   9,  39,  40,  89,  90, 100]
_RH_ANCHOR_HEX  = ['#c87800', '#2d0d04', '#f0e8d0', '#c8f0c0', '#0f4c0f', '#0a3d0a', '#0a1860']


def _make_rh_scale() -> tuple[list[int], list[tuple]]:
    """101 breakpoints (0–100 %) and 100 RGB interval colors at 1 % steps."""
    steps = list(range(0, 101))
    anchor_rgb = np.array([mcolors.to_rgb(c) for c in _RH_ANCHOR_HEX])
    colors = []
    for pct in steps[:-1]:
        r = float(np.interp(pct, _RH_ANCHORS_PCT, anchor_rgb[:, 0]))
        g = float(np.interp(pct, _RH_ANCHORS_PCT, anchor_rgb[:, 1]))
        b = float(np.interp(pct, _RH_ANCHORS_PCT, anchor_rgb[:, 2]))
        colors.append((r, g, b))
    return steps, colors


# ── Placeholder scales for other variables ────────────────────────────────────────
_VAR_CMAPS = {
    "humidity": "YlGnBu",
}


# ── Core rendering function ──────────────────────────────────────────────────────

def create_map_product(data_array, region_bounds, var_name, date_str, variable="wind_speed", level=850, region="CONUS", u_array=None, v_array=None, wind_step=0, wind_type="vectors"):
    plt.close('all')
    fig = plt.figure(figsize=(14, 9))
    proj = _REGION_PROJECTIONS.get(region, ccrs.PlateCarree())
    ax = plt.axes(projection=proj)

    if variable == "wind_speed":
        levels_list = _wind_scale(level)
        # ListedColormap gives one discrete color per interval (not a gradient).
        # 13 breakpoints → 12 intervals → 12 colors; last color handles extend='max'.
        cmap = mcolors.ListedColormap(_WIND_COLORS[:-1])
        cmap.set_over(_WIND_COLORS[-1])
        norm = mcolors.BoundaryNorm(levels_list, ncolors=len(_WIND_COLORS) - 1)
        plot = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=levels_list, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='max',
        )
        min_kt, max_kt = _LEVEL_KT_RANGES[
            "surface" if level == 1000 else
            "low"  if level in (925, 850, 700, 600) else
            "mid"  if level in (500, 400) else "high"
        ]
        cbar = plt.colorbar(plot, ax=ax, orientation='horizontal', pad=0.08, aspect=50)
        cbar.set_ticks(levels_list)
        cbar.set_label(f'Wind Speed (m/s)  ·  {min_kt}–{max_kt} kt')

    elif variable == "temp" and level in _TEMP_SCALES:
        cfg = _TEMP_SCALES[level]
        breakpoints_k, interval_colors, to_k = _make_temp_scale(cfg)
        cmap = mcolors.ListedColormap(interval_colors)
        cmap.set_under(interval_colors[0])
        cmap.set_over(mcolors.to_rgb(cfg["anchor_hex"][-1]))
        norm = mcolors.BoundaryNorm(breakpoints_k, ncolors=len(interval_colors))
        plot = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=breakpoints_k, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='both',
        )
        cbar = plt.colorbar(plot, ax=ax, orientation='horizontal', pad=0.08, aspect=50)
        unit_sym = f"°{cfg['unit']}"
        tick_vals = list(range(cfg["t_min"], cfg["t_max"] + 1, 10))
        cbar.set_ticks([to_k(t) for t in tick_vals])
        cbar.set_ticklabels([f'{t}{unit_sym}' for t in tick_vals])
        cbar.set_label(f'Temperature  ·  {level} mb')

    elif variable == "height":
        dam = data_array / 10.0  # gpm → decameters (standard met display)
        cs = ax.contour(
            data_array.longitude, data_array.latitude, dam.values,
            levels=20, colors='black', linewidths=0.8,
            transform=ccrs.PlateCarree(),
        )
        # Label every other contour to avoid crowding; use_clabeltext improves
        # placement stability under non-PlateCarree projections.
        ax.clabel(cs, cs.levels[::2], inline=True, fontsize=7, fmt='%d',
                  use_clabeltext=True)

    elif variable == "rel_humidity":
        steps, interval_colors = _make_rh_scale()
        cmap = mcolors.ListedColormap(interval_colors)
        cmap.set_under(interval_colors[0])
        cmap.set_over(mcolors.to_rgb(_RH_ANCHOR_HEX[-1]))
        norm = mcolors.BoundaryNorm(steps, ncolors=len(interval_colors))
        plot = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=steps, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='both',
        )
        cbar = plt.colorbar(plot, ax=ax, orientation='horizontal', pad=0.08, aspect=50)
        cbar.set_ticks(range(0, 101, 10))
        cbar.set_ticklabels([f'{v}%' for v in range(0, 101, 10)])
        cbar.set_label('Relative Humidity')

    else:
        cmap = _VAR_CMAPS.get(variable, "viridis")
        plot = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=15, cmap=cmap,
            transform=ccrs.PlateCarree(), extend='both',
        )
        units = {"humidity": "kg/kg"}.get(variable, "")
        cbar = plt.colorbar(plot, ax=ax, orientation='horizontal', pad=0.08, aspect=50)
        cbar.set_label(f'{units}  (auto-scaled placeholder)')

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
                length=5, color='black', alpha=0.75,
                barb_increments=dict(half=2.57, full=5.14, flag=25.72),
            )
        else:  # "vectors"
            ax.quiver(
                lons, lats, u, v,
                transform=ccrs.PlateCarree(),
                scale=700, width=0.002, color='black', alpha=0.75,
            )

    plt.title(f"CORe REANALYSIS | {date_str}", loc='left', fontweight='bold', size=14)
    plt.title(var_name, loc='right', size=14)

    lon0, lon1, lat0, lat1 = _REGION_EXTENTS.get(
        region,
        (region_bounds["lon"][0], region_bounds["lon"][1],
         region_bounds["lat"][0], region_bounds["lat"][1]),
    )
    ax.set_extent([lon0, lon1, lat0, lat1], crs=ccrs.PlateCarree())
    ax.coastlines(resolution='50m', color='black', linewidth=1.2)
    ax.add_feature(cfeature.STATES, linestyle=':', edgecolor='black', alpha=0.4)
    ax.add_feature(cfeature.BORDERS, linewidth=1.2, edgecolor='black')

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=200)
    buf.seek(0)
    plt.close(fig)
    return buf
