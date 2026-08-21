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
import socket
import tempfile
import threading

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
    _precip_rate_source_time,
    fetch_field,
    fetch_index,
    fetch_precip_rate,
    fetch_precip_total,
    fetch_precip_total_composite,
    fetch_relative_humidity_2m,
    precip_accumulation_pairs,
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


class TestPrecipAccumulation:
    def test_precip_rate_source_time_crosses_utc_day(self):
        assert _precip_rate_source_time("20260811", "00") == ("20260810", "21")

    def test_fetch_precip_rate_uses_period_ending_hour(self, monkeypatch):
        calls = []

        def fake_fetch(date, hour, variable, level_name):
            calls.append((date, hour, variable, level_name))
            return _tiny_da(2.0)

        monkeypatch.setattr(retrieval, "fetch_flx_field", fake_fetch)

        rate = fetch_precip_rate("20260811", "00")

        assert calls == [("20260810", "21", "PRATE", "surface")]
        assert rate.values.tolist() == [[2.0]]

    def test_accumulation_pairs_cross_utc_day(self):
        assert precip_accumulation_pairs("20260811", "00", 6) == [
            ("20260810", "21"),
            ("20260811", "00"),
        ]

    def test_24h_accumulation_uses_eight_3h_slices(self):
        pairs = precip_accumulation_pairs("20260811", "12", 24)
        assert len(pairs) == 8
        assert pairs[0] == ("20260810", "15")
        assert pairs[-1] == ("20260811", "12")

    def test_36h_accumulation_uses_twelve_3h_slices(self):
        pairs = precip_accumulation_pairs("20260812", "12", 36)
        assert len(pairs) == 12
        assert pairs[0] == ("20260811", "03")
        assert pairs[-1] == ("20260812", "12")

    def test_fetch_precip_total_sums_prate_as_3h_amounts(self, monkeypatch):
        calls = []

        def fake_fetch(date, hour):
            calls.append((date, hour))
            return _tiny_da(2.0)

        monkeypatch.setattr(retrieval, "fetch_precip_rate", fake_fetch)

        total = fetch_precip_total("20260811", "00", 6)

        assert calls == [
            ("20260810", "21"),
            ("20260811", "00"),
        ]
        assert total.attrs["_pyre_precip_window_hours"] == 6
        assert total.attrs["_pyre_units"] == "mm"
        assert total.values.tolist() == [[2.0 * 3 * 3600 * 2]]

    def test_precip_total_date_range_sums_members(self, monkeypatch):
        def fake_total(date, _hour, _window_hours):
            return _tiny_da(1.0 if date == "20260810" else 2.0)

        monkeypatch.setattr(retrieval, "fetch_precip_total", fake_total)

        total = fetch_precip_total_composite(["20260810", "20260811"], "00", 24)

        assert total.values.tolist() == [[3.0]]


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


class TestMonthlyFallback:
    @pytest.fixture(autouse=True)
    def no_monthly_cache(self, monkeypatch):
        monkeypatch.setattr(retrieval, "_load_obs_monthly", lambda _path: None)
        monkeypatch.setattr(retrieval, "_save_obs_monthly", lambda _da, _path: None)
        retrieval._pgb_known_missing.clear()

    def test_missing_monthly_index_falls_back_to_synoptic_field(self, monkeypatch):
        response = requests.Response()
        response.status_code = 404

        def missing_index(_year, _month):
            raise requests.HTTPError(response=response)

        monkeypatch.setattr(retrieval, "_fetch_monthly_index", missing_index)
        monkeypatch.setattr(
            retrieval,
            "_compute_monthly_from_synoptic",
            lambda *_args: _tiny_da(2.0),
        )

        da = retrieval.fetch_monthly_field(2026, 1, "TMP", 850)

        assert float(da.item()) == 2.0
        assert da.attrs["_pyre_obs_source"] == "CORe-synoptic"
        assert (2026, 1) in retrieval._pgb_known_missing

    def test_existing_monthly_index_missing_field_falls_back_to_synoptic(self, monkeypatch):
        monkeypatch.setattr(
            retrieval,
            "_fetch_monthly_index",
            lambda _year, _month: [IndexRecord(1, 0, "TMP", "500 mb")],
        )
        monkeypatch.setattr(
            retrieval,
            "_compute_monthly_from_synoptic",
            lambda *_args: _tiny_da(3.0),
        )

        da = retrieval.fetch_monthly_field(2026, 1, "TMP", 850)

        assert float(da.item()) == 3.0
        assert da.attrs["_pyre_obs_source"] == "CORe-synoptic"

    def test_missing_monthly_index_falls_back_for_wind_components(self, monkeypatch):
        response = requests.Response()
        response.status_code = 404

        def missing_index(_year, _month):
            raise requests.HTTPError(response=response)

        calls = iter([_tiny_da(4.0), _tiny_da(5.0)])
        monkeypatch.setattr(retrieval, "_fetch_monthly_index", missing_index)
        monkeypatch.setattr(retrieval, "_compute_monthly_from_synoptic", lambda *_args: next(calls))

        u, v = retrieval.fetch_monthly_wind_components(2026, 1, 850)

        assert float(u.item()) == 4.0
        assert float(v.item()) == 5.0
        assert u.attrs["_pyre_obs_source"] == "CORe-synoptic"
        assert v.attrs["_pyre_obs_source"] == "CORe-synoptic"


class TestDerivedSurfaceRelativeHumidity:
    def test_fetch_2m_relative_humidity_uses_tmp_and_dpt(self, monkeypatch):
        valid_time = np.datetime64("2026-07-30T00:00")
        calls: list[tuple[str, str]] = []

        def fake_flx_field(_date, _hour, variable, level_name):
            calls.append((variable, level_name))
            return xr.DataArray(
                np.array([293.15]),
                dims=("x",),
                coords={"valid_time": valid_time},
            )

        def fake_named_level(_date, _hour, variable, level_name):
            calls.append((variable, level_name))
            return xr.DataArray(
                np.array([283.15]),
                dims=("x",),
                coords={"valid_time": valid_time},
            )

        monkeypatch.setattr(retrieval, "fetch_flx_field", fake_flx_field)
        monkeypatch.setattr(retrieval, "fetch_field_by_level_name", fake_named_level)

        rh = fetch_relative_humidity_2m("20260730", "00")

        assert calls == [("TMP", "2 m above ground"), ("DPT", "2 m above ground")]
        assert float(rh[0]) == pytest.approx(52.511655)
        assert rh.attrs["units"] == "%"
        assert rh.attrs["long_name"] == "2m Relative Humidity"
        assert rh.coords["valid_time"].item() == valid_time


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


# ── Unit: transient-failure retries ──────────────────────────────────────────────
# A long composite makes 1000+ archive requests; one flaky connection must not
# kill it. These tests run a tiny local HTTP server on 127.0.0.1 (no external
# network) and point GCS_BASE at it.


def _drop(conn):
    """Close the connection without responding — looks like a network blip."""


def _respond(body: str, status: str = "200 OK"):
    def handler(conn):
        payload = body.encode()
        head = (
            f"HTTP/1.1 {status}\r\n"
            f"Content-Length: {len(payload)}\r\n"
            "Connection: close\r\n\r\n"
        )
        conn.sendall(head.encode() + payload)
    return handler


def _run_script_server(behaviors):
    """Serve exactly len(behaviors) connections, one behavior each, then stop.

    Returns (port, hits, thread); hits grows by 1 per accepted connection.
    """
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 0))
    srv.listen(5)
    port = srv.getsockname()[1]
    hits = []

    def loop():
        for behavior in behaviors:
            conn, _ = srv.accept()
            hits.append(1)
            try:
                conn.recv(65536)
                behavior(conn)
            finally:
                conn.close()
        srv.close()

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return port, hits, thread


class TestTransientRetry:
    def test_dropped_connection_is_retried(self, monkeypatch):
        port, hits, thread = _run_script_server([_drop, _respond(GCS_INDEX_SAMPLE)])
        monkeypatch.setattr(retrieval, "GCS_BASE", f"http://127.0.0.1:{port}")

        records = fetch_index(KNOWN_DATE, KNOWN_HOUR)

        thread.join(timeout=10)
        assert len(hits) == 2  # first attempt dropped, retry succeeded
        assert records[0].variable == "PRES"

    def test_404_is_not_retried(self, monkeypatch):
        port, hits, thread = _run_script_server([_respond("", status="404 Not Found")])
        monkeypatch.setattr(retrieval, "GCS_BASE", f"http://127.0.0.1:{port}")

        with pytest.raises(retrieval.DataUnavailableError):
            fetch_index(KNOWN_DATE, KNOWN_HOUR)

        thread.join(timeout=10)
        assert len(hits) == 1  # missing data fails immediately, no retry


# ── Unit: streaming composite mean ───────────────────────────────────────────────
# Composites consume members into a running sum instead of holding every grid
# (a 91-day request OOM-killed the Render instance). These tests prove the
# streaming mean is arithmetically identical to the old concat-then-mean and
# that the #95 missing-member policy is unchanged in consume mode.

def _member(values, date="20260101"):
    da = xr.DataArray(
        np.asarray(values, dtype=np.float32),
        dims=("latitude", "longitude"),
        coords={"latitude": [10.0, 20.0], "longitude": [30.0, 40.0]},
        attrs={"_pyre_grib_variable": "TMP", "_pyre_obs_date": date},
    )
    return da.assign_coords(valid_time=np.datetime64(f"{date[:4]}-{date[4:6]}-{date[6:]}"))


class TestRunningMean:
    def test_matches_concat_mean(self):
        members = [_member([[1, 2], [3, 4]]), _member([[5, 6], [7, 8]]), _member([[0, 0], [1, 1]])]
        acc = retrieval._RunningMean()
        for m in members:
            acc.add(m)
        expected = xr.concat(
            [m.drop_vars("valid_time") for m in members], dim="s"
        ).mean(dim="s")
        assert np.allclose(acc.mean().values, expected.values)

    def test_attrs_come_from_first_member(self):
        acc = retrieval._RunningMean()
        acc.add(_member([[1, 1], [1, 1]], date="20260101"))
        acc.add(_member([[3, 3], [3, 3]], date="20260110"))
        mean = acc.mean()
        assert mean.attrs["_pyre_obs_date"] == "20260101"
        assert "valid_time" not in mean.coords  # per-member coord dropped

    def test_shape_mismatch_raises(self):
        acc = retrieval._RunningMean()
        acc.add(_member([[1, 2], [3, 4]]))
        bad = xr.DataArray(np.zeros((3, 3), dtype=np.float32), dims=("latitude", "longitude"))
        with pytest.raises(ValueError, match="shape"):
            acc.add(bad)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="no composite members"):
            retrieval._RunningMean().mean()


class TestGatherConsumeMode:
    """gather_composite_members(consume=...) keeps the exact #95 policy."""

    def _futures(self, pool, dates, fail):
        def fetch(d):
            if d in fail:
                raise ValueError(f"TMP at 500 mb not found in index ({d})")
            return _member([[1, 1], [1, 1]], date=d)
        return {pool.submit(fetch, d): f"{d} 00z" for d in dates}

    def test_missing_member_still_fails_with_names(self):
        from concurrent.futures import ThreadPoolExecutor
        acc = retrieval._RunningMean()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = self._futures(pool, ["20260101", "20260102"], fail={"20260102"})
            with pytest.raises(retrieval.DataUnavailableError) as exc_info:
                retrieval.gather_composite_members(futures, consume=acc.add)
        assert exc_info.value.missing == ["20260102 00z"]
        assert exc_info.value.total == 2

    def test_skip_missing_within_5_percent_returns_missing_list(self):
        from concurrent.futures import ThreadPoolExecutor
        dates = [f"202601{d:02d}" for d in range(1, 22)]  # 21 members, 1 missing = 4.8%
        acc = retrieval._RunningMean()
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = self._futures(pool, dates, fail={"20260121"})
            results, missing = retrieval.gather_composite_members(
                futures, skip_missing=True, consume=acc.add)
        assert results == []          # consume mode never accumulates a list
        assert missing == ["20260121 00z"]
        assert acc.mean().values[0][0] == 1.0  # 20 good members averaged

    def test_mean_of_stamps_skipped_members(self, monkeypatch):
        dates = [f"202601{d:02d}" for d in range(1, 22)]

        def fake_fetch(d, hour):
            if d == "20260105":
                raise ValueError("TMP at 500 mb not found in index")
            return _member([[2, 2], [2, 2]], date=d)

        mean = retrieval._mean_of(fake_fetch, dates, "00", skip_missing=True)
        assert mean.attrs["_pyre_skipped_members"] == "20260105 00z"
        assert np.allclose(mean.values, 2.0)
