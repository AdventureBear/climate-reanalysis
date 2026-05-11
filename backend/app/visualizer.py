import io

import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib.cm as mcm
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
    "Indian Ocean": ccrs.PlateCarree(),   # equidistant cylindrical suits tropical/subtropical
}

_REGION_EXTENTS: dict[str, tuple[float, float, float, float]] = {
    "CONUS": (-125, -66, 24, 50),   # (lon_min, lon_max, lat_min, lat_max)
    "Indian Ocean": (30, 110, 0, 40),
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


_QUIVER_BASE_SCALE = 520  # calibrated at 925/850mb (80kt max); ~10% longer than prior value

def _quiver_scale(level: int) -> int:
    """
    Scale quiver arrows so visual length stays roughly constant across levels despite
    increasing wind speeds aloft. 1000mb is treated the same as the low group.
    Formula: base_scale * (this_group_max_kt / low_group_max_kt)
    """
    if level in (500, 400):
        max_kt = _LEVEL_KT_RANGES["mid"][1]
    elif level not in (925, 850, 700, 600, 1000):
        max_kt = _LEVEL_KT_RANGES["high"][1]
    else:
        max_kt = _LEVEL_KT_RANGES["low"][1]
    return round(_QUIVER_BASE_SCALE * max_kt / _LEVEL_KT_RANGES["low"][1])


def _make_wind_scale(level: int, step_kt: int = 1) -> tuple[list[float], list[tuple], int, int]:
    """
    Interpolate wind colors at step_kt resolution across the level's kt range.
    The 13 _WIND_COLORS are evenly-spaced anchors; RGB is interpolated between
    them at every step_kt interval. Returns (breakpoints_ms, interval_colors,
    min_kt, max_kt).
    """
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
    anchor_kt  = [min_kt + i * (max_kt - min_kt) / (n - 1) for i in range(n)]
    anchor_rgb = np.array([mcolors.to_rgb(c) for c in _WIND_COLORS])

    steps_kt = list(range(min_kt, max_kt, step_kt)) + [max_kt]
    colors = []
    for kt in steps_kt[:-1]:
        r = float(np.interp(kt, anchor_kt, anchor_rgb[:, 0]))
        g = float(np.interp(kt, anchor_kt, anchor_rgb[:, 1]))
        b = float(np.interp(kt, anchor_kt, anchor_rgb[:, 2]))
        colors.append((r, g, b))

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


def _make_temp_scale(cfg: dict, step: int = 1) -> tuple[list[float], list[tuple], callable]:
    """
    Build a discrete temperature scale from a _TEMP_SCALES config entry.
    step controls bucket size in display units (1 = fine, 5 = coarse zones, etc.).
    Returns (breakpoints_K, interval_RGB_colors, to_k_fn).
    """
    to_k = _c_to_k if cfg["unit"] == "C" else _f_to_k
    steps = list(range(cfg["t_min"], cfg["t_max"], step)) + [cfg["t_max"]]
    anchor_rgb = np.array([mcolors.to_rgb(c) for c in cfg["anchor_hex"]])
    colors = []
    for t in steps[:-1]:
        r = float(np.interp(t, cfg["anchors"], anchor_rgb[:, 0]))
        g = float(np.interp(t, cfg["anchors"], anchor_rgb[:, 1]))
        b = float(np.interp(t, cfg["anchors"], anchor_rgb[:, 2]))
        colors.append((r, g, b))
    breakpoints_k = [round(to_k(t), 4) for t in steps]
    return breakpoints_k, colors, to_k


def display_unit(variable: str, level: int) -> str:
    """
    Single source of truth for the unit string shown on map titles and colorbars.
    Always matches what the colorbar actually displays.
    """
    if variable == "wind_speed":
        return "kt"
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


def _make_rh_scale(step: int = 1) -> tuple[list[int], list[tuple]]:
    """Breakpoints (0–100 %) and RGB interval colors at the given % step size."""
    steps = list(range(0, 100, step)) + [100]
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


def _anomaly_to_display(values: np.ndarray, variable: str, level: int) -> np.ndarray:
    """Convert anomaly array from native GRIB units to the variable's display units."""
    if variable == "wind_speed":
        return values / _KT_TO_MS          # m/s → kt
    if variable == "temp":
        cfg = _TEMP_SCALES.get(level)
        if cfg and cfg["unit"] == "F":
            return values * 9 / 5          # ΔK = Δ°C → Δ°F
        return values                       # ΔK = Δ°C — no offset needed for differences
    if variable == "height":
        return values / 10                  # gpm → dam
    return values


# ── Core rendering function ──────────────────────────────────────────────────────

def create_map_product(data_array, region_bounds, var_name, date_str, variable="wind_speed", level=850, region="CONUS", u_array=None, v_array=None, wind_step=0, wind_type="vectors", color_step=1, mode="raw"):
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
            unit_label = display_unit(variable, level)
            plot_vals  = _anomaly_to_display(data_array.values, variable, level)

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
            'ticklabels': [f"{v:+g}" if v != 0 else "0" for v in tick_vals],
            'ylabel':     f"{mode_label}  ({unit_label})",
            'extend':     'both',
            'colors': colors, 'boundaries': breakpoints,
        }

    elif variable == "wind_speed":
        breakpoints_ms, interval_colors, min_kt, max_kt = _make_wind_scale(level, step_kt=color_step)
        cmap = mcolors.ListedColormap(interval_colors)
        cmap.set_over(mcolors.to_rgb(_WIND_COLORS[-1]))
        norm = mcolors.BoundaryNorm(breakpoints_ms, ncolors=len(interval_colors))
        plot_obj = ax.contourf(
            data_array.longitude, data_array.latitude, data_array.values,
            levels=breakpoints_ms, cmap=cmap, norm=norm,
            transform=ccrs.PlateCarree(), extend='max',
        )
        tick_step = max(color_step, 5)
        tick_kt = list(range(min_kt, max_kt + 1, tick_step))
        cbar_cfg = {
            'ticks':      [kt * _KT_TO_MS for kt in tick_kt],
            'ticklabels': [str(kt) for kt in tick_kt],
            'ylabel':     f'Wind Speed  ·  {min_kt}–{max_kt} kt',
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
            cb_cmap = mcolors.ListedColormap(cb_colors)
            cb_norm = mcolors.BoundaryNorm(cb_boundaries, ncolors=len(cb_colors))
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
