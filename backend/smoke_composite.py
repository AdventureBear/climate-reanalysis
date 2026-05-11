"""
Quick command-line smoke test for the composite pipeline.
Runs the same three-layer checks as test_composite.py without pytest overhead.

Usage:
    uv run python smoke_composite.py

Exits 0 if all checks pass, 1 if any fail.
"""

import sys
import numpy as np

from app.retrieval import (
    fetch_field, fetch_field_composite,
    fetch_wind_speed, fetch_wind_speed_composite,
    fetch_relative_humidity, fetch_relative_humidity_composite,
)

DATE_A = "20260101"
DATE_B = "20260110"
HOUR   = "12"
ATOL   = 1e-4

passed = 0
failed = 0


def ok(label: str):
    global passed
    passed += 1
    print(f"  [PASS] {label}")


def fail(label: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  [FAIL] {label}" + (f": {detail}" if detail else ""))


def check_mean(label: str, a, b, comp):
    expected = (a.values + b.values) / 2
    diff = np.abs(comp.values - expected)
    if diff.max() < ATOL:
        ok(f"{label}  max_diff={diff.max():.2e}")
    else:
        fail(label, f"max_diff={diff.max():.6f}, mean_diff={diff.mean():.6f}")


print(f"\nComposite smoke test — {DATE_A} + {DATE_B} at {HOUR}z")
print("=" * 56)

# ── Fetch shared data ────────────────────────────────────────────────────────
print("\nFetching data (this takes ~30–60 s) …")

hgt_a     = fetch_field(DATE_A, HOUR, "HGT", 500)
hgt_b     = fetch_field(DATE_B, HOUR, "HGT", 500)
hgt_comp1 = fetch_field_composite([DATE_A],         HOUR, "HGT", 500)
hgt_comp2 = fetch_field_composite([DATE_A, DATE_B], HOUR, "HGT", 500)

ws_a     = fetch_wind_speed(DATE_A, HOUR, 850)
ws_b     = fetch_wind_speed(DATE_B, HOUR, 850)
ws_comp2 = fetch_wind_speed_composite([DATE_A, DATE_B], HOUR, 850)

rh_a     = fetch_relative_humidity(DATE_A, HOUR, 850)
rh_b     = fetch_relative_humidity(DATE_B, HOUR, 850)
rh_comp2 = fetch_relative_humidity_composite([DATE_A, DATE_B], HOUR, 850)

# ── Layer 1: Identity ────────────────────────────────────────────────────────
print("\nLayer 1 — Identity (1-date composite == direct fetch)")

diff1 = np.abs(hgt_comp1.values - hgt_a.values)
if diff1.max() < ATOL:
    ok(f"HGT/500 1-date identity  max_diff={diff1.max():.2e}")
else:
    fail("HGT/500 1-date identity", f"max_diff={diff1.max():.6f}")

# ── Layer 2: Both inputs contribute ─────────────────────────────────────────
print("\nLayer 2 — Both inputs contribute")

for label, c, ref, which in [
    ("HGT/500 vs date A", hgt_comp2, hgt_a, "A"),
    ("HGT/500 vs date B", hgt_comp2, hgt_b, "B"),
    ("Wind/850 vs date A", ws_comp2,  ws_a,  "A"),
    ("RH/850   vs date A", rh_comp2,  rh_a,  "A"),
]:
    diff = np.abs(c.values - ref.values)
    if diff.max() > ATOL:
        ok(f"{label}  (max_diff={diff.max():.4f} — dates differ)")
    else:
        fail(label, f"composite identical to date {which} — that date not contributing")

lo = np.minimum(hgt_a.values, hgt_b.values) - ATOL
hi = np.maximum(hgt_a.values, hgt_b.values) + ATOL
violations = int(np.sum((hgt_comp2.values < lo) | (hgt_comp2.values > hi)))
if violations == 0:
    ok("HGT/500 composite bounded by inputs")
else:
    fail("HGT/500 composite bounded by inputs",
         f"{violations} grid points outside [min(A,B), max(A,B)]")

# ── Layer 3: Arithmetic mean ─────────────────────────────────────────────────
print("\nLayer 3 — Arithmetic mean correctness")

check_mean("HGT/500  composite == (A+B)/2", hgt_a, hgt_b, hgt_comp2)
check_mean("Wind/850 composite == (A+B)/2", ws_a,  ws_b,  ws_comp2)
check_mean("RH/850   composite == (A+B)/2", rh_a,  rh_b,  rh_comp2)

# ── Summary ──────────────────────────────────────────────────────────────────
total = passed + failed
print(f"\n{'=' * 56}")
if failed == 0:
    print(f"ALL PASS  {passed}/{total}")
else:
    print(f"FAILURES: {failed}/{total} checks failed")

sys.exit(0 if failed == 0 else 1)
