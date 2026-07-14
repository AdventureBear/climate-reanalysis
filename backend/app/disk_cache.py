import os
import threading
import uuid
from contextlib import contextmanager

import xarray as xr

# HDF5 — and the netCDF C library layered on it — is not thread-safe in the
# builds bundled with the netCDF4 wheels: two threads inside the library at
# the same time can segfault the whole process (#51: Render "exited with
# status 139" during concurrent 30-year climatology fetches). Every netCDF
# open/read/write in this codebase must hold this lock. The GRIB path
# (cfgrib/eccodes) is a different C stack and intentionally stays concurrent.
HDF5_LOCK = threading.RLock()


@contextmanager
def open_netcdf(*args, **kwargs):
    """Open a netCDF file or OPeNDAP URL with the HDF5 lock held.

    The lock is held for the whole with-block, so callers must finish every
    read (`.load()`) inside it — a lazy read escaping the block would touch
    HDF5 unlocked.
    """
    with HDF5_LOCK:
        ds = xr.open_dataset(*args, **kwargs)
        try:
            yield ds
        finally:
            ds.close()


def discard_corrupt(path: str) -> None:
    """Best-effort delete of a cache file that failed to read.

    Leaving a corrupt file in place makes every future request pay the
    re-fetch; deleting it turns the next successful fetch back into a cache
    hit (#51 incidents 2 and 3).
    """
    try:
        os.remove(path)
    except OSError:
        pass


def atomic_write_netcdf(ds: xr.Dataset, path: str) -> None:
    """Write a NetCDF cache file so readers never see a partial file and
    concurrent writers never share a temp file.

    Each writer gets a unique temp name, then installs it with os.replace
    (atomic on POSIX) — the last completed writer wins with a complete file.
    A fixed temp name (``path + ".tmp"``) lets two concurrent writers of the
    same key interleave bytes into one temp file and then rename the garbage
    into place; writing the final path directly lets readers (or a killed
    process) see a truncated file. Both produce the "NetCDF: HDF error"
    corrupt-cache warnings seen in production.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{uuid.uuid4().hex}.tmp"
    try:
        with HDF5_LOCK:
            ds.to_netcdf(tmp)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
