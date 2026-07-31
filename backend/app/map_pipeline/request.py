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
    # R2 monthly, matching every existing map, share link, and saved recipe.
    # The frontend used to send r2-monthly on every request and override a
    # monthly-pgb default here, so the two halves disagreed and nobody ever
    # received the CORe baseline (#127). Whether CORe should become the
    # default is #66.
    climo_source: str = "r2-monthly"
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
    # 0 = derive from the level's wind scale group; else 5, 10 or 20 kt (#45).
    isotach_interval: int = 0
    # Stamp H/L MSLP center glyphs (detected from MSLET) on the map.
    centers: int = 0
    # Comma-separated contour overlays: any of "pressure", "height", "temp".
    contours: str = ""
    # 1 = user-confirmed retry: skip missing composite members (max 5%),
    # disclosed on the map's bottom margin (#95). Never the default.
    skip_missing: int = 0
    # In-process extras (scripts/birthday-maps) — not exposed on /api/map:
    # "lat,lon" draws a red star at that point; title_note prints on the
    # title bar's right side.
    marker: str = ""
    title_note: str = ""
