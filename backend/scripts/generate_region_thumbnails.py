from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
FRONTEND_ROOT = REPO_ROOT / "frontend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.map_pipeline.request import MapRequest  # noqa: E402
from app.map_service import create_map_buffer  # noqa: E402
from app.visualizer import _REGION_EXTENTS, _REGION_PROJECTIONS  # noqa: E402


DEFAULT_REGIONS = list(_REGION_EXTENTS.keys())

US_DETAIL_REGIONS = {
    "CONUS",
    "Northwest US",
    "Northern Plains",
    "Central Plains",
    "Northeast",
    "Eastern US",
    "Southwest US",
    "South Central",
    "Southeast US",
    "Western US",
    "Alaska",
    "Hawaii",
}

def slugify(region: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", region.lower()).strip("-")


def lon_samples(lon_min: float, lon_max: float, count: int) -> np.ndarray:
    if lon_min <= lon_max:
        return np.linspace(lon_min, lon_max, count)
    return np.linspace(lon_min, lon_max + 360, count)


def projected_bounds(
    projection: ccrs.Projection,
    extent: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    lon_min, lon_max, lat_min, lat_max = extent
    edge_count = 80
    bottom_lons = lon_samples(lon_min, lon_max, edge_count)
    top_lons = lon_samples(lon_min, lon_max, edge_count)
    left_lats = np.linspace(lat_min, lat_max, edge_count)
    right_lats = np.linspace(lat_min, lat_max, edge_count)

    lons = np.concatenate([
        bottom_lons,
        top_lons,
        np.full(edge_count, lon_min),
        np.full(edge_count, lon_max if lon_min <= lon_max else lon_max + 360),
    ])
    lats = np.concatenate([
        np.full(edge_count, lat_min),
        np.full(edge_count, lat_max),
        left_lats,
        right_lats,
    ])
    lons = ((lons + 180) % 360) - 180

    points = projection.transform_points(ccrs.PlateCarree(), lons, lats)
    xs = points[:, 0]
    ys = points[:, 1]
    finite = np.isfinite(xs) & np.isfinite(ys)
    if not np.any(finite):
        raise ValueError(f"Could not project extent {extent}")

    x_min, x_max = float(xs[finite].min()), float(xs[finite].max())
    y_min, y_max = float(ys[finite].min()), float(ys[finite].max())
    x_pad = (x_max - x_min) * 0.015
    y_pad = (y_max - y_min) * 0.015
    return x_min - x_pad, x_max + x_pad, y_min - y_pad, y_max + y_pad


def add_region_features(ax, region: str) -> None:
    ax.add_feature(cfeature.OCEAN.with_scale("50m"), facecolor="#0b1624", edgecolor="none", zorder=0)
    ax.add_feature(cfeature.LAND.with_scale("50m"), facecolor="#d8dde2", edgecolor="none", zorder=1)
    ax.add_feature(cfeature.LAKES.with_scale("50m"), facecolor="#0b1624", edgecolor="none", zorder=2)
    ax.add_feature(cfeature.COASTLINE.with_scale("50m"), edgecolor="#2f3a46", linewidth=0.42, zorder=3)
    ax.add_feature(cfeature.BORDERS.with_scale("50m"), edgecolor="#5f6874", linewidth=0.28, zorder=4)

    if region in US_DETAIL_REGIONS:
        ax.add_feature(cfeature.STATES.with_scale("50m"), edgecolor="#7a828c", linewidth=0.22, zorder=5)


def draw_thumbnail(region: str, out_path: Path, size_px: int) -> None:
    if region not in _REGION_EXTENTS:
        raise ValueError(f"Unknown region: {region}")

    projection = _REGION_PROJECTIONS.get(region, ccrs.PlateCarree())
    extent = _REGION_EXTENTS[region]
    x_min, x_max, y_min, y_max = projected_bounds(projection, extent)
    projected_width = x_max - x_min
    projected_height = y_max - y_min
    aspect = projected_width / projected_height
    render_short_side = size_px * 2
    if aspect >= 1:
        render_width = max(size_px, round(render_short_side * aspect))
        render_height = render_short_side
    else:
        render_width = render_short_side
        render_height = max(size_px, round(render_short_side / aspect))

    fig = plt.figure(figsize=(render_width / size_px, render_height / size_px), dpi=size_px)
    ax = fig.add_axes([0, 0, 1, 1], projection=projection)
    ax.set_facecolor("#0b1624")
    fig.patch.set_facecolor("#0b1624")

    ax.set_xlim(x_min, x_max)
    ax.set_ylim(y_min, y_max)
    add_region_features(ax, region)

    ax.set_axis_off()
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=size_px, transparent=False, facecolor=fig.get_facecolor())
    plt.close(fig)
    buffer.seek(0)

    image = Image.open(buffer).convert("RGB")
    crop_side = min(image.size)
    left = (image.width - crop_side) // 2
    top = (image.height - crop_side) // 2
    image = image.crop((left, top, left + crop_side, top + crop_side)).resize(
        (size_px, size_px),
        Image.Resampling.LANCZOS,
    )
    image.save(out_path)


def draw_preview(region: str, out_path: Path, width_px: int) -> None:
    if region not in _REGION_EXTENTS:
        raise ValueError(f"Unknown region: {region}")

    # Keep detail pages visually identical to the former API-backed preview:
    # render the backend's blank-map product first, then only reduce its size.
    rendered = create_map_buffer(MapRequest(variable="blank_map", level=None, region=region))
    image = Image.open(rendered).convert("RGB")
    height_px = round(image.height * width_px / image.width)
    image = image.resize((width_px, height_px), Image.Resampling.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path, format="PNG", optimize=True)


def write_manifest(region_to_file: dict[str, str], manifest_path: Path) -> None:
    lines = [
        "export const REGION_THUMBNAILS: Record<string, string> = {",
        *[f"  {region!r}: '/region-thumbnails/{filename}'," for region, filename in region_to_file.items()],
        "}",
        "",
    ]
    manifest_path.write_text("\n".join(lines), encoding="utf-8")


def write_preview_manifest(region_to_file: dict[str, str], manifest_path: Path) -> None:
    lines = [
        "export const REGION_PREVIEWS: Record<string, string> = {",
        *[f"  {region!r}: '/region-previews/{filename}'," for region, filename in region_to_file.items()],
        "}",
        "",
    ]
    manifest_path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate static region map assets.")
    parser.add_argument(
        "regions",
        nargs="*",
        help="Region names to render. Defaults to every configured region.",
    )
    parser.add_argument("--size", type=int, default=192, help="Square output size in pixels.")
    parser.add_argument(
        "--asset",
        choices=("thumbnails", "previews"),
        default="thumbnails",
        help="Which region asset set to generate.",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=800,
        help="Preview output width in pixels. Only used with --asset previews.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=FRONTEND_ROOT / "public" / "region-thumbnails",
        help="Directory for generated PNG thumbnails.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Frontend TypeScript manifest to write.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    regions = args.regions or DEFAULT_REGIONS
    if args.asset == "previews":
        if args.out_dir == FRONTEND_ROOT / "public" / "region-thumbnails":
            args.out_dir = FRONTEND_ROOT / "public" / "region-previews"
        if args.manifest is None:
            args.manifest = FRONTEND_ROOT / "lib" / "regionPreviews.ts"
    elif args.manifest is None:
        args.manifest = FRONTEND_ROOT / "lib" / "regionThumbnails.ts"

    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)

    region_to_file: dict[str, str] = {}
    for region in regions:
        filename = f"{slugify(region)}.png"
        if args.asset == "previews":
            draw_preview(region, args.out_dir / filename, args.width)
        else:
            draw_thumbnail(region, args.out_dir / filename, args.size)
        region_to_file[region] = filename

    if args.asset == "previews":
        write_preview_manifest(region_to_file, args.manifest)
    else:
        write_manifest(region_to_file, args.manifest)
    print(f"Generated {len(region_to_file)} {args.asset} in {args.out_dir}")
    print(f"Wrote manifest to {args.manifest}")


if __name__ == "__main__":
    main()
