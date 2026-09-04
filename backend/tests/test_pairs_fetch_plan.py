"""Pairs fetch path + hour-matched climatology (Phase 2b,
docs/TIME_SELECTION_PLAN.md)."""

from types import SimpleNamespace

import pytest

from app.map_pipeline import fetch_plan
from app.map_pipeline.climo_policy import HOURLY_CLIMO_SOURCE, resolve_climo_source
from app.map_pipeline.fetch_plan import (
    OBS_FETCHERS,
    PAIR_MEMBER_FETCHERS,
    WIND_COMPONENT_FETCHERS,
    _member_day_hour_counts,
    fetch_daily_climo_for_selection,
)
from app.map_pipeline.request import MapRequest
from app.map_pipeline.time_selection import parse_time_selection


def test_pairs_dispatch_covers_every_single_variable_kind():
    """Every variable kind with a single-member fetcher must have a pairs
    entry (or be deliberately excluded): the generalize-across-siblings rule.
    precip_total is the one documented exclusion (endpoint rejects it)."""
    single_keys = {key for kind, key in OBS_FETCHERS if kind == "single"}
    pairs_keys = {key for kind, key in OBS_FETCHERS if kind == "pairs"}
    assert single_keys - pairs_keys == {"precip_total"}
    assert pairs_keys == set(PAIR_MEMBER_FETCHERS)
    assert "pairs" in WIND_COMPONENT_FETCHERS


def test_member_day_hour_counts_folds_leap_day_and_weights():
    selection = parse_time_selection(MapRequest(
        time_scale="3-hourly", date_mode="list",
        times="2024022821,2024022921,2024030100",
    ))
    assert _member_day_hour_counts(selection) == [
        ((2, 28, 21), 2),   # Feb 29 folds onto Feb 28
        ((3, 1, 0), 1),
    ]


def test_nonsynoptic_slice_anomaly_resolves_hourly_baseline():
    selection = parse_time_selection(MapRequest(
        time_scale="3-hourly", date_mode="slice",
        dates="20260901,20260902", hours="03,18",
    ))
    anomaly_req = SimpleNamespace(variable="wind_speed", mode="anomaly", climo_source="r2-daily")
    assert resolve_climo_source(anomaly_req, selection) == HOURLY_CLIMO_SOURCE
    # Normalized keeps the daily-mean baseline: the hourly source has no sigma.
    normalized_req = SimpleNamespace(variable="wind_speed", mode="normalized", climo_source="r2-daily")
    assert resolve_climo_source(normalized_req, selection) == "r2-daily"


def test_synoptic_daily_composite_keeps_daily_baseline():
    selection = parse_time_selection(MapRequest(date="20260901", hours="00,06,12,18"))
    req = SimpleNamespace(variable="wind_speed", mode="anomaly", climo_source="r2-daily")
    assert resolve_climo_source(req, selection) == "r2-daily"


def test_pairs_range_anomaly_resolves_hourly_baseline():
    selection = parse_time_selection(MapRequest(
        time_scale="3-hourly", date_mode="range",
        start_time="2026090121", end_time="2026090206",
    ))
    req = SimpleNamespace(variable="wind_speed", mode="anomaly", climo_source="r2-daily")
    assert resolve_climo_source(req, selection) == HOURLY_CLIMO_SOURCE


def test_hourly_climo_weighted_per_member_hour(monkeypatch):
    """A midnight-crossing range fetches one baseline per (month, day, hour)
    and weight-averages them — no single borrowed hour."""
    calls: list[tuple[int, int, int]] = []

    def fake_fetch_climo(req, climo_source, month, day, grib_name, *, hour=None):
        calls.append((month, day, hour))
        return float(hour), None

    monkeypatch.setattr(fetch_plan, "fetch_climo", fake_fetch_climo)
    selection = parse_time_selection(MapRequest(
        time_scale="3-hourly", date_mode="range",
        start_time="2026090121", end_time="2026090203",
    ))
    req = SimpleNamespace(variable="wind_speed", hour="", precip_window=3, skip_missing=0, level=500)
    mean, std = fetch_daily_climo_for_selection(req, HOURLY_CLIMO_SOURCE, selection, "UGRD")
    assert sorted(calls) == [(9, 1, 21), (9, 2, 0), (9, 2, 3)]
    assert mean == pytest.approx((21 + 0 + 3) / 3)
    assert std is None
