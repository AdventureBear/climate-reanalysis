"""
Composite (multi-date averaging) test suite.

Three tiers matching the validation philosophy in test_retrieval.py:

  Layer 1 — Identity   A 1-date composite must equal a direct single fetch.
  Layer 2 — Coverage   Both input dates must visibly contribute to the composite.
  Layer 3 — Arithmetic The 2-date composite must equal (A + B) / 2 at every grid point.

Covers all three distinct fetch paths:
  - Direct field (HGT)
  - Derived wind speed (UGRD² + VGRD²)^0.5
  - Derived relative humidity (Bolton 1980 from SPFH + TMP)

Run:
    uv run pytest -m composite -v
    uv run pytest -m composite -v -s    # prints diff diagnostics
"""

import numpy as np
import pytest

from app.retrieval import (
    fetch_field,
    fetch_field_composite,
    fetch_relative_humidity,
    fetch_relative_humidity_composite,
    fetch_wind_speed,
    fetch_wind_speed_composite,
)

# Two dates chosen to have meaningfully different synoptic patterns at 500mb,
# far enough apart that the composite is clearly not identical to either input.
DATE_A = "20260101"
DATE_B = "20260110"
HOUR   = "12"
ATOL   = 1e-4   # tolerance for floating-point mean comparisons


# ── Fixtures — fetch once per session, reused by all tests ──────────────────

@pytest.fixture(scope="module")
def hgt_data():
    """HGT/500 for both dates, a 1-date composite, and a 2-date composite."""
    a     = fetch_field(DATE_A, HOUR, "HGT", 500)
    b     = fetch_field(DATE_B, HOUR, "HGT", 500)
    comp1 = fetch_field_composite([DATE_A],         HOUR, "HGT", 500)
    comp2 = fetch_field_composite([DATE_A, DATE_B], HOUR, "HGT", 500)
    return dict(a=a, b=b, comp1=comp1, comp2=comp2)


@pytest.fixture(scope="module")
def wind_data():
    """Wind speed/850 for both dates and a 2-date composite."""
    a     = fetch_wind_speed(DATE_A, HOUR, 850)
    b     = fetch_wind_speed(DATE_B, HOUR, 850)
    comp2 = fetch_wind_speed_composite([DATE_A, DATE_B], HOUR, 850)
    return dict(a=a, b=b, comp2=comp2)


@pytest.fixture(scope="module")
def rh_data():
    """Relative humidity/850 for both dates and a 2-date composite."""
    a     = fetch_relative_humidity(DATE_A, HOUR, 850)
    b     = fetch_relative_humidity(DATE_B, HOUR, 850)
    comp2 = fetch_relative_humidity_composite([DATE_A, DATE_B], HOUR, 850)
    return dict(a=a, b=b, comp2=comp2)


# ── Layer 1: Identity ────────────────────────────────────────────────────────

@pytest.mark.composite
class TestIdentity:
    """A 1-date composite must be numerically identical to a direct single fetch."""

    def test_hgt_1date_equals_direct_fetch(self, hgt_data):
        diff = np.abs(hgt_data["comp1"].values - hgt_data["a"].values)
        assert diff.max() < ATOL, (
            f"1-date HGT composite differs from direct fetch: max_diff={diff.max():.6f}"
        )

    def test_1date_composite_shape_matches(self, hgt_data):
        assert hgt_data["comp1"].shape == hgt_data["a"].shape


# ── Layer 2: Both inputs contribute ─────────────────────────────────────────

@pytest.mark.composite
class TestBothInputsContribute:
    """The 2-date composite must differ from both individual dates."""

    def test_hgt_composite_differs_from_date_a(self, hgt_data):
        diff = np.abs(hgt_data["comp2"].values - hgt_data["a"].values)
        assert diff.max() > ATOL, (
            "HGT composite is identical to date A — date B is not contributing"
        )

    def test_hgt_composite_differs_from_date_b(self, hgt_data):
        diff = np.abs(hgt_data["comp2"].values - hgt_data["b"].values)
        assert diff.max() > ATOL, (
            "HGT composite is identical to date B — date A is not contributing"
        )

    def test_wind_composite_differs_from_date_a(self, wind_data):
        diff = np.abs(wind_data["comp2"].values - wind_data["a"].values)
        assert diff.max() > ATOL, (
            "Wind composite is identical to date A — date B is not contributing"
        )

    def test_rh_composite_differs_from_date_a(self, rh_data):
        diff = np.abs(rh_data["comp2"].values - rh_data["a"].values)
        assert diff.max() > ATOL, (
            "RH composite is identical to date A — date B is not contributing"
        )

    def test_hgt_composite_bounded_by_inputs(self, hgt_data):
        """Every grid point in the composite must lie between the two input values."""
        a  = hgt_data["a"].values
        b  = hgt_data["b"].values
        c  = hgt_data["comp2"].values
        lo = np.minimum(a, b) - ATOL
        hi = np.maximum(a, b) + ATOL
        violations = np.sum((c < lo) | (c > hi))
        assert violations == 0, (
            f"{violations} grid points outside [min(A,B), max(A,B)] — "
            "composite is not a proper mean of the two inputs"
        )


# ── Layer 3: Arithmetic correctness ─────────────────────────────────────────

@pytest.mark.composite
class TestArithmeticMean:
    """(A + B) / 2 must equal the composite value at every grid point."""

    def test_hgt_arithmetic_mean(self, hgt_data):
        expected = (hgt_data["a"].values + hgt_data["b"].values) / 2
        diff = np.abs(hgt_data["comp2"].values - expected)
        assert diff.max() < ATOL, (
            f"HGT composite deviates from arithmetic mean: "
            f"max={diff.max():.6f}, mean={diff.mean():.6f}"
        )

    def test_wind_speed_arithmetic_mean(self, wind_data):
        expected = (wind_data["a"].values + wind_data["b"].values) / 2
        diff = np.abs(wind_data["comp2"].values - expected)
        assert diff.max() < ATOL, (
            f"Wind speed composite deviates from arithmetic mean: "
            f"max={diff.max():.6f}, mean={diff.mean():.6f}"
        )

    def test_rh_arithmetic_mean(self, rh_data):
        expected = (rh_data["a"].values + rh_data["b"].values) / 2
        diff = np.abs(rh_data["comp2"].values - expected)
        assert diff.max() < ATOL, (
            f"RH composite deviates from arithmetic mean: "
            f"max={diff.max():.6f}, mean={diff.mean():.6f}"
        )

    def test_grid_shape_preserved(self, hgt_data):
        assert hgt_data["comp2"].shape == hgt_data["a"].shape
