"""
Retrieval test suite — three tiers:

  Unit        No network. Runs on every commit. Tests URL construction,
              index parsing, and byte-range math.

  Network     Fetches .idx files only (~20KB each). Validates live index
  (fast)      structure and variable availability.
              Run: uv run pytest -m network

  Validation  Downloads one full GRIB file (~38MB). Performs a byte-level
  (slow)      comparison between a surgical Range request and the same slice
              of the full file, then checks physical reasonableness of parsed
              values. Run only when changing retrieval logic.
              Run: uv run pytest -m validation
"""

import os
import tempfile

import numpy as np
import pytest
import requests
import xarray as xr

import app.retrieval as retrieval
from app.retrieval import (
    VALID_HOURS,
    IndexRecord,
    _gcs_flx_index_url,
    _gcs_flx_url,
    _gcs_index_url,
    _gcs_url,
    _nomads_flx_url,
    _nomads_url,
    fetch_field,
    fetch_index,
    parse_index_text,
)

# ── Fixtures ────────────────────────────────────────────────────────────────────

# Known-good historical date confirmed present in GCS archive (from bucket listing).
KNOWN_DATE = "20260101"
KNOWN_HOUR = "00"
VALIDATION_LEVEL = 850  # hPa — standard mid-tropospheric level, always present in pgb files

# Representative index lines captured from live fetches during development.
# Used for offline unit tests so parsing logic can be tested without network.
GCS_INDEX_SAMPLE = """\
1:0:d=2026010100:PRES:mean sea level:anl:
2:141658:d=2026010100:VIS:surface:anl:
3:204000:d=2026010100:UGRD:planetary boundary layer:anl:
4:279335:d=2026010100:VGRD:planetary boundary layer:anl:
7:509951:d=2026010100:HGT:1 mb:anl:
8:585329:d=2026010100:TMP:1 mb:anl:
11:688235:d=2026010100:UGRD:1 mb:anl:
12:735978:d=2026010100:VGRD:1 mb:anl:"""

# From SampleGRB2 Index file.txt (.claude/) — NOMADS spgb.ensmean format.
NOMADS_INDEX_SAMPLE = """\
1:0:d=2026050500:PRES:surface:anl:ens mean
2:75165:d=2026050500:TMP:1000 mb:anl:ens mean
3:125763:d=2026050500:TMP:925 mb:anl:ens mean
4:201324:d=2026050500:TMP:850 mb:anl:ens mean
22:1625816:d=2026050500:UGRD:850 mb:anl:ens mean
23:1715188:d=2026050500:VGRD:850 mb:anl:ens mean
81:7145878:d=2026050500:HGT:10 mb:anl:ens mean"""

FLX_INDEX_SAMPLE = """\
1:0:d=2026051303:DLWRF:surface:anl:ens mean
5:523571:d=2026051303:UGRD:10 m above ground:anl:ens mean
7:871095:d=2026051303:WIND:10 m above ground:anl:ens mean
8:1065263:d=2026051303:PRES:surface:anl:ens mean
10:1381001:d=2026051303:PWAT:atmos col:anl:ens mean
21:3125677:d=2026051303:TMP:2 m above ground:anl:ens mean"""


# ── Unit: URL construction ───────────────────────────────────────────────────────

class TestGcsUrl:
    def test_encodes_year_month_subpath(self):
        url = _gcs_url("20260115", "12")
        assert "grib/3hour/pgb/2026/01/pgb.2026011512.grb" in url

    def test_zero_hour(self):
        assert "pgb.2026050500.grb" in _gcs_url("20260505", "00")

    def test_single_digit_month_zero_padded(self):
        url = _gcs_url("20260305", "06")
        assert "/2026/03/" in url

    @pytest.mark.parametrize("hour", VALID_HOURS)
    def test_all_valid_hours_produce_url(self, hour):
        url = _gcs_url("20260101", hour)
        assert url.startswith("https://")
        assert url.endswith(".grb")


class TestGcsIndexUrl:
    def test_index_url_does_not_end_with_grb_idx(self):
        # GCS index is pgb.YYYYMMDDHH.idx, NOT pgb.YYYYMMDDHH.grb.idx
        url = _gcs_index_url("20260101", "00")
        assert not url.endswith(".grb.idx"), "GCS index URL must not append .idx to .grb"
        assert url.endswith(".idx")

    def test_index_url_and_grib_url_share_same_base(self):
        idx_url = _gcs_index_url("20260315", "12")
        grb_url = _gcs_url("20260315", "12")
        assert idx_url.replace(".idx", "") == grb_url.replace(".grb", "")


class TestGcsFlxUrl:
    def test_historical_flx_url_uses_simplified_cloud_names(self):
        url = _gcs_flx_url("19500101", "00")
        assert "grib/3hour/flx/1950/01/flx.1950010100.grb" in url

    def test_historical_flx_index_url(self):
        url = _gcs_flx_index_url("19500101", "00")
        assert url.endswith("grib/3hour/flx/1950/01/flx.1950010100.idx")


class TestNomadsUrl:
    @pytest.mark.parametrize("hour,expected_batch", [
        ("03", "00"), ("06", "00"),
        ("09", "06"), ("12", "06"),
        ("15", "12"), ("18", "12"),
        ("21", "18"),
    ])
    def test_batch_routing(self, hour, expected_batch):
        url = _nomads_url("20260505", hour)
        assert f"/core.20260505/{expected_batch}/" in url
        assert f"core.t{hour}z" in url

    def test_00z_rolls_back_to_previous_day(self):
        url = _nomads_url("20260505", "00")
        assert "core.20260504/18" in url
        assert "core.t00z" in url

    def test_00z_on_first_of_month(self):
        # Rollback must cross month boundary correctly
        url = _nomads_url("20260601", "00")
        assert "core.20260531/18" in url


class TestNomadsFlxUrl:
    def test_flx_url_uses_flx_post_directory(self):
        url = _nomads_flx_url("20260513", "03")
        assert "/core.20260513/00/post/flx/" in url
        assert url.endswith("core.t03z.flx.ensmean.grib2")

    def test_flx_00z_rolls_back_to_previous_day(self):
        url = _nomads_flx_url("20260601", "00")
        assert "core.20260531/18" in url
        assert "core.t00z.flx" in url


class TestValidHours:
    def test_eight_hours_per_day(self):
        assert len(VALID_HOURS) == 8

    def test_covers_all_3_hour_increments(self):
        expected = {"00", "03", "06", "09", "12", "15", "18", "21"}
        assert set(VALID_HOURS) == expected


# ── Unit: index parsing ──────────────────────────────────────────────────────────

class TestParseIndexText:
    def test_gcs_format_record_count(self):
        records = parse_index_text(GCS_INDEX_SAMPLE)
        assert len(records) == 8

    def test_gcs_format_first_record(self):
        rec = parse_index_text(GCS_INDEX_SAMPLE)[0]
        assert rec.record_num == 1
        assert rec.byte_start == 0
        assert rec.variable == "PRES"
        assert rec.level == "mean sea level"

    def test_nomads_format_parses(self):
        records = parse_index_text(NOMADS_INDEX_SAMPLE)
        variables = {r.variable for r in records}
        assert {"TMP", "UGRD", "VGRD", "HGT"}.issubset(variables)

    def test_flx_format_parses_starter_fields(self):
        records = parse_index_text(FLX_INDEX_SAMPLE)
        fields = {(r.variable, r.level) for r in records}
        assert ("TMP", "2 m above ground") in fields
        assert ("WIND", "10 m above ground") in fields
        assert ("PRES", "surface") in fields
        assert ("PWAT", "atmos col") in fields

    def test_850mb_level_string(self):
        records = parse_index_text(NOMADS_INDEX_SAMPLE)
        match = next((r for r in records if r.variable == "TMP" and r.level == "850 mb"), None)
        assert match is not None
        assert match.byte_start == 201324

    def test_byte_range_for_mid_record(self):
        records = parse_index_text(NOMADS_INDEX_SAMPLE)
        idx = next(i for i, r in enumerate(records) if r.variable == "TMP" and r.level == "850 mb")
        rec = records[idx]
        next_start = records[idx + 1].byte_start
        expected_range = f"bytes={rec.byte_start}-{next_start - 1}"
        assert expected_range == "bytes=201324-1625815"

    def test_skips_malformed_lines(self):
        text = "not-a-valid-line\n" + GCS_INDEX_SAMPLE
        records = parse_index_text(text)
        assert len(records) == 8  # malformed line ignored, rest parsed


# ── Unit: monthly archive fallback ───────────────────────────────────────────────

def _tiny_da(value: float = 1.0) -> xr.DataArray:
    return xr.DataArray(
        np.array([[value]], dtype=float),
        coords={"latitude": [0.0], "longitude": [40.0]},
        dims=("latitude", "longitude"),
    )


class TestMonthlyArchivePolicy:
    @pytest.fixture(autouse=True)
    def no_monthly_cache(self, monkeypatch):
        monkeypatch.setattr(retrieval, "_load_obs_monthly", lambda _path: None)
        monkeypatch.setattr(retrieval, "_save_obs_monthly", lambda _da, _path: None)
        retrieval._pgb_known_missing.clear()

    def test_missing_monthly_index_raises_for_field_outside_r2_range(self, monkeypatch):
        response = requests.Response()
        response.status_code = 404

        def missing_index(_year, _month):
            raise requests.HTTPError(response=response)

        monkeypatch.setattr(retrieval, "_fetch_monthly_index", missing_index)

        with pytest.raises(retrieval.DataUnavailableError, match="Monthly TMP@850mb data are not available"):
            retrieval.fetch_monthly_field(2026, 1, "TMP", 850)
        assert (2026, 1) in retrieval._pgb_known_missing

    def test_existing_monthly_index_missing_field_raises_outside_r2_range(self, monkeypatch):
        monkeypatch.setattr(
            retrieval,
            "_fetch_monthly_index",
            lambda _year, _month: [IndexRecord(1, 0, "TMP", "500 mb")],
        )

        with pytest.raises(retrieval.DataUnavailableError, match="Monthly TMP@850mb data are not available"):
            retrieval.fetch_monthly_field(2026, 1, "TMP", 850)

    def test_missing_monthly_index_raises_for_wind_components_outside_r2_range(self, monkeypatch):
        response = requests.Response()
        response.status_code = 404

        def missing_index(_year, _month):
            raise requests.HTTPError(response=response)

        monkeypatch.setattr(retrieval, "_fetch_monthly_index", missing_index)

        with pytest.raises(retrieval.DataUnavailableError, match="Monthly wind components@850mb data are not available"):
            retrieval.fetch_monthly_wind_components(2026, 1, 850)


# ── Network: live index fetch (~20KB) ────────────────────────────────────────────

@pytest.mark.network
class TestLiveIndex:
    """Fetches .idx only. Confirms GCS structure matches what our parser expects."""

    def test_fetch_returns_records(self):
        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)
        assert len(records) > 50

    def test_required_variables_present(self):
        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)
        found = {r.variable for r in records}
        for var in ("TMP", "UGRD", "VGRD", "HGT", "SPFH"):
            assert var in found, f"{var} missing from live index"

    def test_850mb_level_present_for_tmp(self):
        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)
        levels = {r.level for r in records if r.variable == "TMP"}
        assert "850 mb" in levels

    def test_standard_pressure_levels_present(self):
        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)
        tmp_levels = {r.level for r in records if r.variable == "TMP"}
        for level in ("500 mb", "850 mb", "250 mb"):
            assert level in tmp_levels, f"TMP at {level} missing"

    def test_byte_offsets_are_monotonically_increasing(self):
        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)
        offsets = [r.byte_start for r in records]
        assert offsets == sorted(offsets), "Byte offsets not monotonically increasing"


# ── Validation: surgical vs full file (~38MB download) ───────────────────────────

@pytest.mark.validation
class TestSurgicalVsFullFile:
    """
    Downloads the complete GRIB file for KNOWN_DATE/KNOWN_HOUR and verifies that
    a surgical Range request returns byte-for-byte identical content. Also checks
    that cfgrib parses the chunk into physically reasonable values.

    Run with: uv run pytest -m validation -s
    The -s flag prints the size and value-range diagnostics.
    """

    def test_byte_range_matches_full_file_slice(self):
        grib_url = _gcs_url(KNOWN_DATE, KNOWN_HOUR)

        # 1. Full file download
        full_response = requests.get(grib_url, timeout=180)
        full_response.raise_for_status()
        full_bytes = full_response.content
        print(f"\nFull file: {len(full_bytes) / 1_000_000:.1f} MB")

        # 2. Find the TMP 850mb record via index
        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)
        target = f"{VALIDATION_LEVEL} mb"
        match_idx = next(
            (i for i, r in enumerate(records) if r.variable == "TMP" and r.level == target),
            None,
        )
        assert match_idx is not None, f"TMP at {VALIDATION_LEVEL} mb not found in index"

        rec = records[match_idx]
        byte_end = records[match_idx + 1].byte_start - 1
        print(f"TMP {VALIDATION_LEVEL}mb record: bytes {rec.byte_start}–{byte_end} "
              f"({(byte_end - rec.byte_start + 1) / 1000:.1f} KB)")

        # 3. Surgical Range request
        surgical_response = requests.get(
            grib_url,
            headers={"Range": f"bytes={rec.byte_start}-{byte_end}"},
            timeout=30,
        )
        assert surgical_response.status_code in (200, 206)
        surgical_bytes = surgical_response.content

        # 4. Byte-level equality — proves the Range math is correct
        expected_slice = full_bytes[rec.byte_start: byte_end + 1]
        assert surgical_bytes == expected_slice, (
            f"Surgical bytes ({len(surgical_bytes)}) != full-file slice "
            f"({len(expected_slice)})"
        )
        print("Byte-level match: ✓")

        # 5. Physical reasonableness — cfgrib parses to valid temperature values
        with tempfile.NamedTemporaryFile(suffix=".grb", delete=False) as tmp:
            tmp.write(surgical_bytes)
            tmp_path = tmp.name
        try:
            ds = xr.open_dataset(tmp_path, engine="cfgrib", backend_kwargs={"indexpath": ""})
            values = ds[list(ds.data_vars)[0]].values
            ds.close()
        finally:
            os.unlink(tmp_path)

        t_min, t_max = float(np.nanmin(values)), float(np.nanmax(values))
        print(f"TMP at {VALIDATION_LEVEL}mb: {t_min:.1f}–{t_max:.1f} K")
        # 850mb temperature globally: ~220K (Antarctica) to ~310K (tropics)
        assert t_min > 210, f"Temperature suspiciously cold: {t_min:.1f} K"
        assert t_max < 320, f"Temperature suspiciously warm: {t_max:.1f} K"
        print("Physical range check: ✓")
