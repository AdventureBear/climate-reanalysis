from __future__ import annotations

import calendar as cal
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol

from fastapi import HTTPException

from app.retrieval import SYNOPTIC_HOURS, VALID_HOURS

# Composite-size ceilings. Single source of truth — main.py imports these.
MAX_COMPOSITE_DATES = 93    # one season of daily composites
MAX_COMPOSITE_MONTHS = 60   # five years of monthly means
MAX_DAILY_COMPOSITE_FETCHES = MAX_COMPOSITE_DATES * 4
# One ceiling for every expanded (date, hour) member list, canonical or legacy.
MAX_TIME_MEMBERS = MAX_DAILY_COMPOSITE_FETCHES

VALID_TIME_SCALES = ("3-hourly", "daily", "monthly")
VALID_DATE_MODES = ("single", "range", "list", "slice")


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


def _valid_time(token: str) -> tuple[str, str]:
    """YYYYMMDDHH -> (YYYYMMDD, HH), hour on the 3-hourly grid."""
    if len(token) != 10:
        raise HTTPException(status_code=422, detail=f"invalid time {token!r}: expected YYYYMMDDHH")
    date_part, hour_part = token[:8], token[8:]
    _valid_date(date_part)
    if hour_part not in VALID_HOURS:
        raise HTTPException(
            status_code=422,
            detail=f"invalid time {token!r}: hour must be one of {VALID_HOURS}",
        )
    return date_part, hour_part


# CONTRACT GUARD: any new time param or selection shape added here (or to the
# parser below) must get corpus cases in tests/test_time_selection_corpus.py.
# Changing what an existing shape means requires a deliberate, decision-cited
# edit to that corpus. See docs/TIME_SELECTION_PLAN.md.
class TimeRequest(Protocol):
    date: str
    dates: str
    months: str
    hour: str
    hours: str
    # Canonical v2 params — load-bearing only when time_scale is present.
    time_scale: str
    date_mode: str
    times: str
    start_time: str
    end_time: str
    start_date: str
    end_date: str
    start_month: str
    end_month: str
    month: str


@dataclass
class TimeSelection:
    monthly_mode: bool
    year_months: list[tuple[int, int]]
    date_list: list[str]
    obs_month: int
    obs_day: int
    daily_hours: list[str]
    is_daily_composite: bool
    # The exact expanded members this selection denotes (Phase 1,
    # docs/TIME_SELECTION_PLAN.md): every sub-monthly selection carries its
    # full (YYYYMMDD, HH) list — dates x hours for daily composites, the
    # request hour applied to each date otherwise. Empty for monthly;
    # monthly members are month_members. Authoritative going forward; the
    # legacy fields above remain until fetch paths migrate (Phase 2b).
    date_hour_members: list[tuple[str, str]] = field(default_factory=list)
    # True for canonical 3-hourly range/list selections whose members carry
    # heterogeneous hours — fetched member-by-member via the pairs path.
    pairs_mode: bool = False
    # Canonical date_mode ("single"|"range"|"list"|"slice"); "" for legacy
    # requests. Informational (labels/logging) — never drives fetching.
    selection_mode: str = ""

    @property
    def month_members(self) -> list[tuple[int, int]]:
        return self.year_months

    @property
    def composite(self) -> bool:
        return len(self.date_list) > 1

    @property
    def obs_kind(self) -> str:
        if self.monthly_mode:
            return "monthly"
        if self.pairs_mode:
            return "pairs"
        if self.is_daily_composite:
            return "daily"
        if self.composite:
            return "composite"
        return "single"


def _fold_leap_day(obs_month: int, obs_day: int) -> tuple[int, int]:
    if obs_month == 2 and obs_day == 29:
        return 2, 28
    return obs_month, obs_day


def _obs_month_day(date_token: str) -> tuple[int, int]:
    return _fold_leap_day(int(date_token[4:6]), int(date_token[6:8]))


def _split_csv(raw: str) -> list[str]:
    return [t.strip() for t in raw.split(",") if t.strip()]


def _reject_duplicates(tokens: list[str], param: str) -> None:
    if len(set(tokens)) != len(tokens):
        raise HTTPException(status_code=422, detail=f"{param} contains duplicate entries")


def _cap_members(count: int) -> None:
    if count > MAX_TIME_MEMBERS:
        raise HTTPException(
            status_code=422,
            detail=f"too many time members ({count}); maps are limited to {MAX_TIME_MEMBERS} fetches",
        )


def parse_time_selection(req: TimeRequest) -> TimeSelection:
    # time_scale is the v2 gate (docs/TIME_SELECTION_PLAN.md, Decision 1):
    # without it, full legacy inference applies and date_mode stays cosmetic.
    if getattr(req, "time_scale", ""):
        return _parse_canonical(req)
    return _parse_legacy(req)


def _parse_legacy(req: TimeRequest) -> TimeSelection:
    monthly_mode = bool(req.months)
    if req.months:
        year_months = [_valid_month(s) for s in _split_csv(req.months)]
        if not year_months:
            raise HTTPException(status_code=422, detail="'months' contained no valid YYYYMM entries")
        obs_month = year_months[0][1]
        obs_day = 15
        date_list: list[str] = []
    elif req.dates:
        date_list = [_valid_date(d) for d in _split_csv(req.dates)]
        if not date_list:
            raise HTTPException(status_code=422, detail="'dates' contained no valid YYYYMMDD entries")
        obs_month, obs_day = _obs_month_day(date_list[0])
        year_months = []
    elif req.date:
        date_list = [_valid_date(req.date.strip())]
        obs_month, obs_day = _obs_month_day(date_list[0])
        year_months = []
    else:
        raise HTTPException(status_code=422, detail="provide 'date', 'dates', or 'months'")

    daily_hours = _split_csv(req.hours) if req.hours else []

    # Decision 2 (docs/TIME_SELECTION_PLAN.md): a legacy URL that sends dates
    # with no hour param at all means the whole day — expand to the synoptic
    # composite. An explicit hour (even "00") stays a snapshot/slice.
    hour_absent = not str(getattr(req, "hour", "")).strip()
    if not monthly_mode and not daily_hours and hour_absent:
        daily_hours = list(SYNOPTIC_HOURS)

    # Expansion order matches the existing fetchers: dates outer, hours inner.
    if monthly_mode:
        date_hour_members: list[tuple[str, str]] = []
    elif daily_hours:
        date_hour_members = [(d, h) for d in date_list for h in daily_hours]
    else:
        date_hour_members = [(d, req.hour) for d in date_list]

    return TimeSelection(
        monthly_mode=monthly_mode,
        year_months=year_months,
        date_list=date_list,
        obs_month=obs_month,
        obs_day=obs_day,
        daily_hours=daily_hours,
        is_daily_composite=bool(daily_hours and not monthly_mode),
        date_hour_members=date_hour_members,
    )


def _parse_canonical(req: TimeRequest) -> TimeSelection:
    scale = req.time_scale
    if scale == "climatology":
        raise HTTPException(
            status_code=422,
            detail=(
                "time_scale=climatology is not a request type; request a "
                "climatology map with mode=climatology and months=YYYYMM"
            ),
        )
    if scale not in VALID_TIME_SCALES:
        raise HTTPException(
            status_code=422,
            detail=f"time_scale must be one of {list(VALID_TIME_SCALES)}",
        )
    date_mode = req.date_mode or "single"
    if date_mode not in VALID_DATE_MODES:
        raise HTTPException(
            status_code=422,
            detail=f"date_mode must be one of {list(VALID_DATE_MODES)}",
        )
    if scale == "monthly":
        return _canonical_monthly(req, date_mode)
    if scale == "daily":
        return _canonical_daily(req, date_mode)
    return _canonical_three_hourly(req, date_mode)


def _sub_monthly_selection(
    date_hour_members: list[tuple[str, str]],
    *,
    daily_hours: list[str],
    is_daily_composite: bool,
    pairs_mode: bool,
    selection_mode: str,
) -> TimeSelection:
    _cap_members(len(date_hour_members))
    date_list = list(dict.fromkeys(d for d, _ in date_hour_members))
    obs_month, obs_day = _obs_month_day(date_list[0])
    return TimeSelection(
        monthly_mode=False,
        year_months=[],
        date_list=date_list,
        obs_month=obs_month,
        obs_day=obs_day,
        daily_hours=daily_hours,
        is_daily_composite=is_daily_composite,
        date_hour_members=date_hour_members,
        pairs_mode=pairs_mode,
        selection_mode=selection_mode,
    )


def _canonical_three_hourly(req: TimeRequest, date_mode: str) -> TimeSelection:
    if date_mode == "single":
        if not req.date.strip():
            raise HTTPException(status_code=422, detail="time_scale=3-hourly&date_mode=single requires 'date'")
        date = _valid_date(req.date.strip())
        hour = req.hour.strip()
        if hour not in VALID_HOURS:
            raise HTTPException(
                status_code=422,
                detail=f"time_scale=3-hourly&date_mode=single requires 'hour' (one of {VALID_HOURS})",
            )
        return _sub_monthly_selection(
            [(date, hour)], daily_hours=[], is_daily_composite=False,
            pairs_mode=False, selection_mode="single",
        )

    if date_mode == "range":
        if not (req.start_time.strip() and req.end_time.strip()):
            raise HTTPException(
                status_code=422,
                detail="time_scale=3-hourly&date_mode=range requires 'start_time' and 'end_time' (YYYYMMDDHH)",
            )
        start = _valid_time(req.start_time.strip())
        end = _valid_time(req.end_time.strip())
        start_dt = datetime.strptime(start[0] + start[1], "%Y%m%d%H")
        end_dt = datetime.strptime(end[0] + end[1], "%Y%m%d%H")
        if end_dt < start_dt:
            raise HTTPException(status_code=422, detail="end_time is before start_time")
        span_members = int((end_dt - start_dt) / timedelta(hours=3)) + 1
        _cap_members(span_members)
        members = [
            ((start_dt + timedelta(hours=3 * i)).strftime("%Y%m%d"),
             (start_dt + timedelta(hours=3 * i)).strftime("%H"))
            for i in range(span_members)
        ]
        return _sub_monthly_selection(
            members, daily_hours=[], is_daily_composite=False,
            pairs_mode=True, selection_mode="range",
        )

    if date_mode == "list":
        tokens = _split_csv(req.times)
        if not tokens:
            raise HTTPException(
                status_code=422,
                detail="time_scale=3-hourly&date_mode=list requires 'times' (comma-separated YYYYMMDDHH)",
            )
        _reject_duplicates(tokens, "times")
        members = [_valid_time(t) for t in tokens]
        return _sub_monthly_selection(
            members, daily_hours=[], is_daily_composite=False,
            pairs_mode=True, selection_mode="list",
        )

    # slice: chosen hour(s) x chosen dates — the one deliberate cartesian.
    dates = [_valid_date(d) for d in _split_csv(req.dates)]
    if not dates:
        raise HTTPException(
            status_code=422,
            detail="time_scale=3-hourly&date_mode=slice requires 'dates'",
        )
    _reject_duplicates(dates, "dates")
    hour_tokens = _split_csv(req.hours) if req.hours else ([req.hour.strip()] if req.hour.strip() else [])
    if not hour_tokens:
        raise HTTPException(
            status_code=422,
            detail="time_scale=3-hourly&date_mode=slice requires 'hours' (or a single 'hour')",
        )
    _reject_duplicates(hour_tokens, "hours")
    bad = [h for h in hour_tokens if h not in VALID_HOURS]
    if bad:
        raise HTTPException(
            status_code=422,
            detail=f"hours contains invalid values: {bad}; valid hours are {VALID_HOURS}",
        )
    members = [(d, h) for d in dates for h in hour_tokens]
    return _sub_monthly_selection(
        members, daily_hours=hour_tokens, is_daily_composite=True,
        pairs_mode=False, selection_mode="slice",
    )


def _canonical_daily(req: TimeRequest, date_mode: str) -> TimeSelection:
    if date_mode == "slice":
        raise HTTPException(status_code=422, detail="date_mode=slice applies to time_scale=3-hourly only")

    if date_mode == "single":
        if not req.date.strip():
            raise HTTPException(status_code=422, detail="time_scale=daily&date_mode=single requires 'date'")
        dates = [_valid_date(req.date.strip())]
    elif date_mode == "range":
        if not (req.start_date.strip() and req.end_date.strip()):
            raise HTTPException(
                status_code=422,
                detail="time_scale=daily&date_mode=range requires 'start_date' and 'end_date' (YYYYMMDD)",
            )
        start = datetime.strptime(_valid_date(req.start_date.strip()), "%Y%m%d")
        end = datetime.strptime(_valid_date(req.end_date.strip()), "%Y%m%d")
        if end < start:
            raise HTTPException(status_code=422, detail="end_date is before start_date")
        n_days = (end - start).days + 1
        if n_days > MAX_COMPOSITE_DATES:
            raise HTTPException(
                status_code=422,
                detail=f"too many dates ({n_days}); composites are limited to {MAX_COMPOSITE_DATES} dates per map",
            )
        dates = [(start + timedelta(days=i)).strftime("%Y%m%d") for i in range(n_days)]
    else:  # list
        dates = [_valid_date(d) for d in _split_csv(req.dates)]
        if not dates:
            raise HTTPException(status_code=422, detail="time_scale=daily&date_mode=list requires 'dates'")
        _reject_duplicates(dates, "dates")
        if len(dates) > MAX_COMPOSITE_DATES:
            raise HTTPException(
                status_code=422,
                detail=f"too many dates ({len(dates)}); composites are limited to {MAX_COMPOSITE_DATES} dates per map",
            )

    hours = list(SYNOPTIC_HOURS)
    members = [(d, h) for d in dates for h in hours]
    return _sub_monthly_selection(
        members, daily_hours=hours, is_daily_composite=True,
        pairs_mode=False, selection_mode=date_mode,
    )


def _canonical_monthly(req: TimeRequest, date_mode: str) -> TimeSelection:
    if date_mode == "slice":
        raise HTTPException(status_code=422, detail="date_mode=slice applies to time_scale=3-hourly only")

    if date_mode == "single":
        if not req.month.strip():
            raise HTTPException(status_code=422, detail="time_scale=monthly&date_mode=single requires 'month' (YYYYMM)")
        year_months = [_valid_month(req.month.strip())]
    elif date_mode == "range":
        if not (req.start_month.strip() and req.end_month.strip()):
            raise HTTPException(
                status_code=422,
                detail="time_scale=monthly&date_mode=range requires 'start_month' and 'end_month' (YYYYMM)",
            )
        start_y, start_m = _valid_month(req.start_month.strip())
        end_y, end_m = _valid_month(req.end_month.strip())
        if (end_y, end_m) < (start_y, start_m):
            raise HTTPException(status_code=422, detail="end_month is before start_month")
        year_months = []
        y, m = start_y, start_m
        while (y, m) <= (end_y, end_m):
            year_months.append((y, m))
            m += 1
            if m == 13:
                y, m = y + 1, 1
    else:  # list
        tokens = _split_csv(req.months)
        if not tokens:
            raise HTTPException(status_code=422, detail="time_scale=monthly&date_mode=list requires 'months'")
        _reject_duplicates(tokens, "months")
        year_months = [_valid_month(t) for t in tokens]

    if len(year_months) > MAX_COMPOSITE_MONTHS:
        raise HTTPException(
            status_code=422,
            detail=f"too many months ({len(year_months)}); composites are limited to {MAX_COMPOSITE_MONTHS} months per map",
        )
    return TimeSelection(
        monthly_mode=True,
        year_months=year_months,
        date_list=[],
        obs_month=year_months[0][1],
        obs_day=15,
        daily_hours=[],
        is_daily_composite=False,
        date_hour_members=[],
        selection_mode=date_mode,
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
    if selection.pairs_mode:
        first_d, first_h = selection.date_hour_members[0]
        last_d, last_h = selection.date_hour_members[-1]
        if len(selection.date_hour_members) == 1:
            return f"{first_d[:4]}-{first_d[4:6]}-{first_d[6:]}  {first_h}z  (single snapshot)"
        return (
            f"{first_d[:4]}-{first_d[4:6]}-{first_d[6:]} {first_h}z → "
            f"{last_d[:4]}-{last_d[4:6]}-{last_d[6:]} {last_h}z"
            f"  ({len(selection.date_hour_members)} 3-hourly members)"
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
