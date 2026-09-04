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
         "obs_day": 1, "monthly_mode": False, "daily_hours": [], "composite": False,
         "date_hour_members": [("20260901", "09")]},
    ),
    (
        "frontend-3hourly-slice-currently-labeled-range",
        {"dates": "20260901,20260902", "hour": "09"},
        {"obs_kind": "composite", "date_list": ["20260901", "20260902"],
         "obs_month": 9, "obs_day": 1, "daily_hours": [],
         "date_hour_members": [("20260901", "09"), ("20260902", "09")]},
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
         "daily_hours": ["00", "06", "12", "18"], "is_daily_composite": True,
         "date_hour_members": [("20260901", "00"), ("20260901", "06"),
                               ("20260901", "12"), ("20260901", "18")]},
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
         "date_list": [], "date_hour_members": [],
         "month_members": [(2026, 9)]},
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
        # DECISION-2, executed Phase 2a (2026-09-03): a bare date with no
        # hour param at all now means the whole day — the sender's
        # near-universal intent. An explicit hour=00 stays a 00z snapshot.
        "legacy-bare-date",
        {"date": "20260901"},
        {"obs_kind": "daily", "date_list": ["20260901"],
         "daily_hours": ["00", "06", "12", "18"], "is_daily_composite": True,
         "date_hour_members": [("20260901", "00"), ("20260901", "06"),
                               ("20260901", "12"), ("20260901", "18")]},
    ),
    (
        # DECISION-2, executed Phase 2a: bare dates expand per-date.
        "legacy-bare-dates",
        {"dates": "20260829,20260830"},
        {"obs_kind": "daily", "date_list": ["20260829", "20260830"],
         "daily_hours": ["00", "06", "12", "18"],
         "date_hour_members": [("20260829", "00"), ("20260829", "06"),
                               ("20260829", "12"), ("20260829", "18"),
                               ("20260830", "00"), ("20260830", "06"),
                               ("20260830", "12"), ("20260830", "18")]},
    ),
    (
        # SLICE-CLIMO: same cartesian members forever; Phase 2 names this a
        # slice and hour-matches the anomaly baseline.
        "legacy-dates-nonsynoptic-hours",
        {"dates": "20260829,20260830", "hours": "03,18"},
        {"obs_kind": "daily", "daily_hours": ["03", "18"],
         "date_list": ["20260829", "20260830"],
         # Dates outer, hours inner — the fetchers' cartesian order.
         "date_hour_members": [("20260829", "03"), ("20260829", "18"),
                               ("20260830", "03"), ("20260830", "18")]},
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
    # ── Canonical v2 contract (time_scale gate) ───────────────────────────
    (
        "canonical-3hourly-single",
        {"time_scale": "3-hourly", "date_mode": "single",
         "date": "20260901", "hour": "09"},
        {"obs_kind": "single", "selection_mode": "single",
         "date_hour_members": [("20260901", "09")], "pairs_mode": False},
    ),
    (
        # Continuous range crossing midnight: 21z Sep 1 through 06z Sep 2.
        "canonical-3hourly-range-midnight",
        {"time_scale": "3-hourly", "date_mode": "range",
         "start_time": "2026090121", "end_time": "2026090206"},
        {"obs_kind": "pairs", "selection_mode": "range", "pairs_mode": True,
         "date_list": ["20260901", "20260902"],
         "date_hour_members": [("20260901", "21"), ("20260902", "00"),
                               ("20260902", "03"), ("20260902", "06")]},
    ),
    (
        "canonical-3hourly-list",
        {"time_scale": "3-hourly", "date_mode": "list",
         "times": "2026090109,2026090218"},
        {"obs_kind": "pairs", "selection_mode": "list",
         "date_hour_members": [("20260901", "09"), ("20260902", "18")]},
    ),
    (
        # Slice: hours x dates, the one deliberate cartesian product.
        "canonical-3hourly-slice-multi-hour",
        {"time_scale": "3-hourly", "date_mode": "slice",
         "dates": "20260901,20260902", "hours": "03,18"},
        {"obs_kind": "daily", "selection_mode": "slice",
         "daily_hours": ["03", "18"],
         "date_hour_members": [("20260901", "03"), ("20260901", "18"),
                               ("20260902", "03"), ("20260902", "18")]},
    ),
    (
        "canonical-3hourly-slice-single-hour",
        {"time_scale": "3-hourly", "date_mode": "slice",
         "dates": "20260901,20260903", "hour": "21"},
        {"obs_kind": "daily", "selection_mode": "slice",
         "daily_hours": ["21"],
         "date_hour_members": [("20260901", "21"), ("20260903", "21")]},
    ),
    (
        # Stale hour is ignored when time_scale makes intent clear.
        "canonical-daily-single-ignores-stale-hour",
        {"time_scale": "daily", "date_mode": "single",
         "date": "20260901", "hour": "09"},
        {"obs_kind": "daily", "selection_mode": "single",
         "daily_hours": ["00", "06", "12", "18"],
         "date_hour_members": [("20260901", "00"), ("20260901", "06"),
                               ("20260901", "12"), ("20260901", "18")]},
    ),
    (
        "canonical-daily-range",
        {"time_scale": "daily", "date_mode": "range",
         "start_date": "20260901", "end_date": "20260903"},
        {"obs_kind": "daily", "selection_mode": "range",
         "date_list": ["20260901", "20260902", "20260903"]},
    ),
    (
        "canonical-daily-list",
        {"time_scale": "daily", "date_mode": "list",
         "dates": "20260901,20260905"},
        {"obs_kind": "daily", "selection_mode": "list",
         "date_list": ["20260901", "20260905"]},
    ),
    (
        "canonical-monthly-single",
        {"time_scale": "monthly", "date_mode": "single", "month": "202609"},
        {"obs_kind": "monthly", "selection_mode": "single",
         "year_months": [(2026, 9)], "month_members": [(2026, 9)]},
    ),
    (
        # Month range crossing a year boundary.
        "canonical-monthly-range-year-crossing",
        {"time_scale": "monthly", "date_mode": "range",
         "start_month": "202611", "end_month": "202702"},
        {"obs_kind": "monthly", "selection_mode": "range",
         "year_months": [(2026, 11), (2026, 12), (2027, 1), (2027, 2)]},
    ),
    (
        "canonical-monthly-list",
        {"time_scale": "monthly", "date_mode": "list",
         "months": "202601,202603"},
        {"obs_kind": "monthly", "selection_mode": "list",
         "year_months": [(2026, 1), (2026, 3)]},
    ),
    (
        # date_mode defaults to single under the gate.
        "canonical-default-date-mode",
        {"time_scale": "3-hourly", "date": "20260901", "hour": "12"},
        {"obs_kind": "single", "selection_mode": "single"},
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
    # ── Canonical v2 rejections ───────────────────────────────────────────
    ("canonical-bad-scale", {"time_scale": "hourly", "date": "20260901"},
     "time_scale must be one of"),
    ("canonical-climatology-scale",
     {"time_scale": "climatology", "months": "200007"},
     "mode=climatology"),
    ("canonical-bad-date-mode",
     {"time_scale": "daily", "date_mode": "window", "date": "20260901"},
     "date_mode must be one of"),
    ("canonical-single-needs-hour",
     {"time_scale": "3-hourly", "date_mode": "single", "date": "20260901"},
     "requires 'hour'"),
    ("canonical-range-needs-times",
     {"time_scale": "3-hourly", "date_mode": "range"},
     "requires 'start_time' and 'end_time'"),
    ("canonical-range-backwards",
     {"time_scale": "3-hourly", "date_mode": "range",
      "start_time": "2026090212", "end_time": "2026090109"},
     "end_time is before start_time"),
    ("canonical-range-off-grid-hour",
     {"time_scale": "3-hourly", "date_mode": "range",
      "start_time": "2026090101", "end_time": "2026090212"},
     "hour must be one of"),
    # 47 days x 8 hours = 376 members > 372 cap.
    ("canonical-range-over-cap",
     {"time_scale": "3-hourly", "date_mode": "range",
      "start_time": "2026010100", "end_time": "2026021621"},
     "too many time members"),
    ("canonical-list-duplicate-times",
     {"time_scale": "3-hourly", "date_mode": "list",
      "times": "2026090109,2026090109"},
     "duplicate"),
    ("canonical-slice-needs-hours",
     {"time_scale": "3-hourly", "date_mode": "slice", "dates": "20260901"},
     "requires 'hours'"),
    ("canonical-daily-slice-invalid",
     {"time_scale": "daily", "date_mode": "slice", "dates": "20260901"},
     "slice applies to time_scale=3-hourly"),
    ("canonical-daily-range-backwards",
     {"time_scale": "daily", "date_mode": "range",
      "start_date": "20260905", "end_date": "20260901"},
     "end_date is before start_date"),
    ("canonical-monthly-needs-month",
     {"time_scale": "monthly", "date_mode": "single"},
     "requires 'month'"),
    ("canonical-monthly-range-backwards",
     {"time_scale": "monthly", "date_mode": "range",
      "start_month": "202609", "end_month": "202601"},
     "end_month is before start_month"),
]


@pytest.mark.parametrize("case_id,kwargs,detail_fragment", REJECTIONS, ids=[c[0] for c in REJECTIONS])
def test_rejections(case_id, kwargs, detail_fragment):
    with pytest.raises(HTTPException) as exc_info:
        parse_time_selection(MapRequest(**kwargs))
    assert exc_info.value.status_code == 422
    assert detail_fragment in str(exc_info.value.detail), (
        f"{case_id}: detail was {exc_info.value.detail!r}"
    )