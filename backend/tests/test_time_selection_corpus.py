"""Golden corpus for the time-selection contract (docs/TIME_SELECTION_PLAN.md).

Every known param shape -> the exact TimeSelection the parser produces today.
This file is the frozen truth for Phases 1-2 of the time-selection redesign:
no case here may change color without a deliberate, decision-cited edit.

Rows marked DECISION-2 will be intentionally updated when "bare date means
daily synoptic composite" lands (hour-param-absence detection). Rows marked
SLICE-CLIMO keep identical members but gain hour-matched anomaly baselines.
"""

import pytest
from fastapi import HTTPException

from app.map_pipeline.request import MapRequest
from app.map_pipeline.time_selection import parse_time_selection

# Each case: (case_id, MapRequest kwargs, expected TimeSelection attributes).
# Expected keys map directly to TimeSelection fields/properties.
CASES = [
    # ── Frontend emissions ────────────────────────────────────────────────
    (
        "frontend-3hourly-single",
        {"date": "20260901", "hour": "09"},
        {"obs_kind": "single", "date_list": ["20260901"], "obs_month": 9,
         "obs_day": 1, "monthly_mode": False, "daily_hours": [], "composite": False},
    ),
    (
        "frontend-3hourly-slice-currently-labeled-range",
        {"dates": "20260901,20260902", "hour": "09"},
        {"obs_kind": "composite", "date_list": ["20260901", "20260902"],
         "obs_month": 9, "obs_day": 1, "daily_hours": []},
    ),
    (
        "frontend-3hourly-list",
        {"dates": "20260901,20260903", "hour": "09"},
        {"obs_kind": "composite", "date_list": ["20260901", "20260903"]},
    ),
    (
        "frontend-daily-single",
        {"date": "20260901", "hours": "00,06,12,18"},
        {"obs_kind": "daily", "date_list": ["20260901"],
         "daily_hours": ["00", "06", "12", "18"], "is_daily_composite": True},
    ),
    (
        "frontend-daily-range",
        {"dates": "20260901,20260902,20260903", "hours": "00,06,12,18"},
        {"obs_kind": "daily",
         "date_list": ["20260901", "20260902", "20260903"],
         "daily_hours": ["00", "06", "12", "18"]},
    ),
    (
        "frontend-monthly-single",
        {"months": "202609"},
        {"obs_kind": "monthly", "monthly_mode": True,
         "year_months": [(2026, 9)], "obs_month": 9, "obs_day": 15,
         "date_list": []},
    ),
    (
        "frontend-monthly-list",
        {"months": "202601,202603"},
        {"obs_kind": "monthly", "year_months": [(2026, 1), (2026, 3)]},
    ),
    (
        # Climatology maps ride the monthly parse (mode=climatology is
        # resolved elsewhere; the year is a frontend throwaway).
        "frontend-climatology",
        {"months": "200007"},
        {"obs_kind": "monthly", "year_months": [(2000, 7)]},
    ),
    # ── Backend generator emissions ───────────────────────────────────────
    (
        # single_date_packages.daily_time_params / birthday_maps: the
        # canonical "whole day" URL shape (date_mode=single is cosmetic).
        "generator-daily-package",
        {"date": "20260830", "hours": "00,06,12,18", "date_mode": "single"},
        {"obs_kind": "daily", "daily_hours": ["00", "06", "12", "18"]},
    ),
    (
        "generator-moment",
        {"date": "20260830", "hour": "21", "date_mode": "single"},
        {"obs_kind": "single", "date_list": ["20260830"]},
    ),
    # ── Legacy hand shapes ────────────────────────────────────────────────
    (
        # DECISION-2: becomes a daily synoptic composite when hour-absence
        # detection lands (the hour="00" default makes this a 00z snapshot
        # today; the sender almost always meant the whole day).
        "legacy-bare-date",
        {"date": "20260901"},
        {"obs_kind": "single", "date_list": ["20260901"], "daily_hours": []},
    ),
    (
        # DECISION-2: becomes per-date daily composites.
        "legacy-bare-dates",
        {"dates": "20260829,20260830"},
        {"obs_kind": "composite", "date_list": ["20260829", "20260830"],
         "daily_hours": []},
    ),
    (
        # SLICE-CLIMO: same cartesian members forever; Phase 2 names this a
        # slice and hour-matches the anomaly baseline.
        "legacy-dates-nonsynoptic-hours",
        {"dates": "20260829,20260830", "hours": "03,18"},
        {"obs_kind": "daily", "daily_hours": ["03", "18"],
         "date_list": ["20260829", "20260830"]},
    ),
    (
        "legacy-date-multi-hours",
        {"date": "20260830", "hours": "00,03,06,09"},
        {"obs_kind": "daily", "daily_hours": ["00", "03", "06", "09"]},
    ),
    # ── Precedence and parsing quirks ─────────────────────────────────────
    (
        "months-wins-over-dates-and-date",
        {"months": "202607", "date": "20260901", "dates": "20260902"},
        {"obs_kind": "monthly", "year_months": [(2026, 7)], "date_list": []},
    ),
    (
        # hours are parsed but inert under monthly_mode.
        "months-with-stale-hours",
        {"months": "202607", "hours": "00,06"},
        {"obs_kind": "monthly", "monthly_mode": True,
         "daily_hours": ["00", "06"], "is_daily_composite": False},
    ),
    (
        # Feb 29 folds the climatology day to Feb 28; the fetch date stays.
        "leap-day-fold",
        {"date": "20240229", "hour": "12"},
        {"obs_kind": "single", "date_list": ["20240229"],
         "obs_month": 2, "obs_day": 28},
    ),
    (
        "whitespace-tolerant-dates",
        {"dates": " 20260901 , 20260902 ", "hour": "00"},
        {"obs_kind": "composite", "date_list": ["20260901", "20260902"]},
    ),
    (
        # Parser keeps duplicates; the endpoint rejects them separately.
        "duplicates-survive-parse",
        {"dates": "20260901,20260901", "hour": "00"},
        {"date_list": ["20260901", "20260901"], "obs_kind": "composite"},
    ),
    (
        # A one-entry dates list is a single, not a composite.
        "single-entry-dates-list",
        {"dates": "20260901,", "hour": "06"},
        {"obs_kind": "single", "date_list": ["20260901"], "composite": False},
    ),
    (
        # strptime("%Y%m") accepts an unpadded month, so the parser reads
        # "20269" as Sep 2026. Unreachable via /api/map (the endpoint's
        # _valid_api_month_token enforces 6 digits first); documented here
        # because in-process callers hit the parser directly.
        "parser-lenient-unpadded-month",
        {"months": "20269"},
        {"obs_kind": "monthly", "year_months": [(2026, 9)]},
    ),
]


@pytest.mark.parametrize("case_id,kwargs,expected", CASES, ids=[c[0] for c in CASES])
def test_corpus(case_id, kwargs, expected):
    selection = parse_time_selection(MapRequest(**kwargs))
    for attr, want in expected.items():
        got = getattr(selection, attr)
        assert got == want, f"{case_id}: {attr} = {got!r}, expected {want!r}"


REJECTIONS = [
    ("no-time-params", {}, "provide 'date', 'dates', or 'months'"),
    ("malformed-date", {"date": "2026090"}, "invalid date"),
    ("malformed-date-in-dates", {"dates": "20260901,2026-09-02"}, "invalid date"),
    ("malformed-month", {"months": "202613"}, "invalid month"),
    ("dates-only-commas", {"dates": ",,,"}, "no valid YYYYMMDD"),
    ("months-only-commas", {"months": ","}, "no valid YYYYMM"),
]


@pytest.mark.parametrize("case_id,kwargs,detail_fragment", REJECTIONS, ids=[c[0] for c in REJECTIONS])
def test_rejections(case_id, kwargs, detail_fragment):
    with pytest.raises(HTTPException) as exc_info:
        parse_time_selection(MapRequest(**kwargs))
    assert exc_info.value.status_code == 422
    assert detail_fragment in str(exc_info.value.detail), (
        f"{case_id}: detail was {exc_info.value.detail!r}"
    )