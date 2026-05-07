import matplotlib.colors as mcolors
import numpy as np
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import io

def create_map_product(data_array, region_bounds, var_name="WIND SPEED", date_str="MAY 06 2026"):
    # Clear the deck
    plt.close('all')
    fig = plt.figure(figsize=(14, 9))
    ax = plt.axes(projection=ccrs.PlateCarree())

    # --- HARDCODED PROFESSIONAL SCALE ---
    # 20 kts (10.3 m/s) to 100 kts (51.4 m/s) with 0.5 m/s steps
    levels = [10.3,12.8, 15.4,18, 20.5, 23.1, 25.7,28.2, 30.8, 31.0, 36, 39, 41.1]

    anchor_colors = [
        '#f2f9ff', '#87cefa', '#6b5acc', '#e695db', '#c95bbe',
        '#a11397', '#c90028', '#de2a3c', '#f04f4f',
        '#faf061', '#faf061', '#8b5a2b', '#a15d0a'
    ]



    custom_cmap = mcolors.LinearSegmentedColormap.from_list("met_scale", anchor_colors)
    norm = mcolors.BoundaryNorm(levels, ncolors=custom_cmap.N)

    # --- THE PLOT ---
    plot = ax.contourf(
        data_array.longitude,
        data_array.latitude,
        data_array.values,
        levels=levels,
        cmap=custom_cmap,
        norm=norm,
        transform=ccrs.PlateCarree(),
        extend='max'
    )

    # --- METADATA HEADERS ---
    plt.title(f"CORe 850mb REANALYSIS | {date_str}", loc='left', fontweight='bold', size=14)
    plt.title(f"{var_name} (m/s)", loc='right', size=14)

    # --- THE COLORBAR ---
    cbar = plt.colorbar(plot, ax=ax, orientation='horizontal', pad=0.08, aspect=50)
    # Ticks every 5 m/s for readability, but the scale is 0.5
    cbar.set_ticks([10.3,12.8, 15.4,18, 20.5, 23.1, 25.7,28.2, 30.8, 31.0, 36, 39, 41.1])
    cbar.set_label('m/s (0.5 m/s intervals)')


    # --- GEOGRAPHY ---
    ax.set_extent([
        region_bounds["lon"][0], region_bounds["lon"][1],
        region_bounds["lat"][0], region_bounds["lat"][1]
    ], crs=ccrs.PlateCarree())

    ax.coastlines(resolution='50m', color='black', linewidth=1.2)
    ax.add_feature(cfeature.STATES, linestyle=':', edgecolor='black', alpha=0.4)
    ax.add_feature(cfeature.BORDERS, linewidth=1.2, edgecolor='black')

    # Save
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=200)
    buf.seek(0)
    plt.close(fig)
    return buf