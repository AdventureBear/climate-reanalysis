from __future__ import annotations

import calendar as cal
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from fastapi import HTTPException


def _valid_date(token: str) -> str:
    try:
        datetime.strptime(token, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid date {token!r}: expected YYYYMMDD")
    return token


def _valid_month(token: str) -> tuple[int, int]:
    try:
        parsed = datetime.strptime(token, "%Y%m")
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid month {token!r}: expected YYYYMM")
    return parsed.year, parsed.month


class TimeRequest(Protocol):
    date: str
    dates: str
    months: str
    hour: str
    hours: str


@dataclass
class TimeSelection:
    monthly_mode: bool
    year_months: list[tuple[int, int]]
    date_list: list[str]
    obs_month: int
    obs_day: int
    daily_hours: list[str]
    is_daily_composite: bool

    @property
    def composite(self) -> bool:
        return len(self.date_list) > 1

    @property
    def obs_kind(self) -> str:
        if self.monthly_mode:
            return "monthly"
        if self.is_daily_composite:
            return "daily"
        if self.composite:
            return "composite"
        return "single"


def parse_time_selection(req: TimeRequest) -> TimeSelection:
    monthly_mode = bool(req.months)
    if req.months:
        year_months = [_valid_month(s.strip()) for s in req.months.split(",") if s.strip()]
        if not year_months:
            raise HTTPException(status_code=422, detail="'months' contained no valid YYYYMM entries")
        obs_month = year_months[0][1]
        obs_day = 15
        date_list: list[str] = []
    elif req.dates:
        date_list = [_valid_date(d.strip()) for d in req.dates.split(",") if d.strip()]
        if not date_list:
            raise HTTPException(status_code=422, detail="'dates' contained no valid YYYYMMDD entries")
        obs_month = int(date_list[0][4:6])
        obs_day = int(date_list[0][6:8])
        year_months = []
    elif req.date:
        date_list = [_valid_date(req.date.strip())]
        obs_month = int(date_list[0][4:6])
        obs_day = int(date_list[0][6:8])
        year_months = []
    else:
        raise HTTPException(status_code=422, detail="provide 'date', 'dates', or 'months'")

    if obs_month == 2 and obs_day == 29:
        obs_day = 28

    daily_hours = [h.strip() for h in req.hours.split(",") if h.strip()] if req.hours else []
    return TimeSelection(
        monthly_mode=monthly_mode,
        year_months=year_months,
        date_list=date_list,
        obs_month=obs_month,
        obs_day=obs_day,
        daily_hours=daily_hours,
        is_daily_composite=bool(daily_hours and not monthly_mode),
    )


def period_description(selection: TimeSelection, hour: str) -> str:
    if selection.monthly_mode:
        if len(selection.year_months) == 1:
            return f"{cal.month_abbr[selection.year_months[0][1]]} {selection.year_months[0][0]}  (single month)"
        return (
            f"{cal.month_abbr[selection.year_months[0][1]]} {selection.year_months[0][0]} → "
            f"{cal.month_abbr[selection.year_months[-1][1]]} {selection.year_months[-1][0]}"
            f"  ({len(selection.year_months)} months, day-weighted mean)"
        )
    if selection.is_daily_composite:
        fetches = len(selection.date_list) * len(selection.daily_hours)
        if len(selection.date_list) == 1:
            return (
                f"{selection.date_list[0][:4]}-{selection.date_list[0][4:6]}-{selection.date_list[0][6:]}"
                f"  (1 date × {len(selection.daily_hours)} synoptic times = {fetches} fetches)"
            )
        return (
            f"{selection.date_list[0][:4]}-{selection.date_list[0][4:6]}-{selection.date_list[0][6:]} → "
            f"{selection.date_list[-1][:4]}-{selection.date_list[-1][4:6]}-{selection.date_list[-1][6:]}"
            f"  ({len(selection.date_list)} dates × {len(selection.daily_hours)} synoptic times = {fetches} fetches)"
        )
    if selection.composite:
        return (
            f"{selection.date_list[0][:4]}-{selection.date_list[0][4:6]}-{selection.date_list[0][6:]} → "
            f"{selection.date_list[-1][:4]}-{selection.date_list[-1][4:6]}-{selection.date_list[-1][6:]}"
            f"  ({len(selection.date_list)} dates  {hour}z each)"
        )
    return f"{selection.date_list[0][:4]}-{selection.date_list[0][4:6]}-{selection.date_list[0][6:]}  {hour}z  (single snapshot)"
