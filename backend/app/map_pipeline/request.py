from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MapRequest:
    date: str = ""
    dates: str = ""
    months: str = ""
    hour: str = "00"
    hours: str = ""
    variable: str = "wind_speed"
    level: int = 850
    region: str = "CONUS"
    wind_step: int = 0
    wind_type: str = "vectors"
    color_step: int = 1
    scale_min: float | None = None
    scale_max: float | None = None
    mode: str = "raw"
    climo_source: str = "monthly-pgb"
    wind_anomaly_style: str = "speed_diff"
    wind_unit: str = "kt"
