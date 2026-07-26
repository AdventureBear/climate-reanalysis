"""Unit tests for the shared OPeNDAP retry helper (no network).

Every OPeNDAP fetch — daily and monthly, in climo_r2.py and retrieval.py —
goes through dap_fetch_with_retries. These tests fake open_netcdf so retry
behavior is provable without touching PSL THREDDS.
"""

import numpy as np
import pytest

import app.climo_r2 as climo_r2
from app.climo_r2 import dap_fetch_with_retries


class FakeDataset:
    """Stands in for an open xarray dataset: context manager + ds["time"].dtype."""

    def __init__(self, time_dtype=np.dtype("datetime64[ns]")):
        self._time_dtype = time_dtype

    def __contains__(self, key):
        return key == "time"

    def __getitem__(self, key):
        assert key == "time"

        class _Var:
            dtype = self._time_dtype
        return _Var()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def no_sleep(monkeypatch):
    waits = []
    monkeypatch.setattr(climo_r2.time, "sleep", waits.append)
    return waits


class TestDapFetchWithRetries:
    def test_transient_error_then_success(self, monkeypatch, no_sleep):
        calls = []

        def fake_open(url, engine):
            calls.append(url)
            if len(calls) == 1:
                raise OSError("NetCDF: I/O failure")
            return FakeDataset()

        monkeypatch.setattr(climo_r2, "open_netcdf", fake_open)

        result = dap_fetch_with_retries("dap://x", lambda ds: "payload", describe="test")

        assert result == "payload"
        assert len(calls) == 2  # first attempt failed, retry succeeded
        assert len(no_sleep) == 1

    def test_429_gets_harder_backoff(self, monkeypatch, no_sleep):
        calls = []

        def fake_open(url, engine):
            calls.append(url)
            if len(calls) == 1:
                raise OSError("HTTP 429 Too Many Requests")
            return FakeDataset()

        monkeypatch.setattr(climo_r2, "open_netcdf", fake_open)

        dap_fetch_with_retries("dap://x", lambda ds: "ok", describe="test")

        assert no_sleep == [15]  # 429 backoff floor beats the 5s default

    def test_undecoded_time_axis_is_retried(self, monkeypatch, no_sleep):
        datasets = [FakeDataset(time_dtype=np.dtype("float64")), FakeDataset()]
        monkeypatch.setattr(climo_r2, "open_netcdf", lambda url, engine: datasets.pop(0))

        result = dap_fetch_with_retries("dap://x", lambda ds: "decoded", describe="test")

        assert result == "decoded"
        assert not datasets  # both datasets consumed: bad one retried, good one used

    def test_exhausted_retries_raise_runtime_error(self, monkeypatch, no_sleep):
        def fake_open(url, engine):
            raise OSError("NetCDF: I/O failure")

        monkeypatch.setattr(climo_r2, "open_netcdf", fake_open)

        with pytest.raises(RuntimeError, match="after 4 attempts"):
            dap_fetch_with_retries("dap://x", lambda ds: "never", describe="test")

        assert len(no_sleep) == 3  # sleeps between the 4 attempts, none after the last
