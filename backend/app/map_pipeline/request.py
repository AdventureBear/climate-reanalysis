from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MapRequest:
    date: str = ""
    dates: str = ""
    date_mode: str = ""
    months: str = ""
    hour: str = "00"
    hours: str = ""
    variable: str = "wind_speed"
    level: int = 850
    region: str = "CONUS"
    wind_step: int = 0
    wind_type: str = "vectors"
    wind_overlay_mode: str = "actual"
    color_step: int = 1
    scale_min: float | None = None
    scale_max: float | None = None
    scale_spec: str = ""
    mode: str = "raw"
    climo_source: str = "monthly-pgb"
    wind_unit: str = "kt"
    pwat_unit: str = "in"
    # "contours" (default) or "shaded" — how contour-first variables
    # (MSLP, geopotential height) render their raw field.
    fill_mode: str = "contours"
    # "" (auto: each level's native scale unit), "F", or "C".
    temp_unit: str = ""
    # Draw labeled isotach contours from the overlay wind components.
    # Independent of wind_step/wind_type glyphs — styles combine.
    isotachs: int = 0
    # Stamp H/L MSLP center glyphs (detected from MSLET) on the map.
    centers: int = 0
    # Comma-separated contour overlays: any of "pressure", "height", "temp".
    contours: str = ""
