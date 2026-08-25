from app.map_pipeline.climo_policy import resolve_climo_source
from app.map_pipeline.request import MapRequest
from app.map_pipeline.time_selection import parse_time_selection


def test_single_hour_normalized_pwat_uses_r2_daily_15day_baseline():
    req = MapRequest(
        date="20260101",
        hour="12",
        variable="precipitable_water",
        level=1000,
        mode="normalized",
    )

    assert resolve_climo_source(req, parse_time_selection(req)) == "r2-daily-15day"


def test_single_hour_pwat_anomaly_uses_r2_daily_15day_baseline():
    req = MapRequest(
        date="20260101",
        hour="12",
        variable="precipitable_water",
        level=1000,
        mode="anomaly",
    )

    assert resolve_climo_source(req, parse_time_selection(req)) == "r2-daily-15day"


def test_daily_normalized_pwat_stays_on_daily_baseline():
    req = MapRequest(
        date="20260101",
        hours="00,06,12,18",
        variable="precipitable_water",
        level=1000,
        mode="normalized",
    )

    assert resolve_climo_source(req, parse_time_selection(req)) == "r2-daily"
