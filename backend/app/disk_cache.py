import ctypes
import ctypes.util
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

# ── HDF5 stderr noise ────────────────────────────────────────────────────────
# Opening an OPeNDAP URL makes netCDF probe it with the HDF5 driver first;
# the probe fails (a URL is not a local file), HDF5 prints its full internal
# error stack to stderr ("HDF5-DIAG: ... H5Fis_accessible ..."), and netCDF
# then falls back to DAP and succeeds. Dozens of scary but harmless blocks
# per climatology fetch. Real failures still surface as Python exceptions.
#
# Auto-printing is PER-THREAD state in the bundled thread-safe HDF5 build
# (the blocks say "thread 1..8"), so it must be disabled in every thread that
# enters the library — a one-time call at import only silences that thread.

_hdf5_lib: ctypes.CDLL | None | bool = None
_hdf5_thread_quiet = threading.local()


def _resolve_hdf5_lib():
    # Load netCDF4 first so its bundled libhdf5 is in the process, then reach
    # that exact instance through the global symbol table (CDLL(None)) —
    # silencing a second, separately-loaded copy would do nothing.
    import netCDF4  # noqa: F401

    candidates: list[str | None] = [None]
    for name in ("hdf5", "hdf5_serial"):
        path = ctypes.util.find_library(name)
        if path:
            candidates.append(path)
    candidates.extend(("libhdf5.dylib", "libhdf5.so"))
    for cand in candidates:
        try:
            lib = ctypes.CDLL(cand)
            lib.H5Eset_auto2.argtypes = [ctypes.c_int64, ctypes.c_void_p, ctypes.c_void_p]
            return lib
        except (OSError, AttributeError):
            continue
    return False


def _silence_hdf5_errors_in_this_thread() -> None:
    global _hdf5_lib
    if getattr(_hdf5_thread_quiet, "done", False):
        return
    _hdf5_thread_quiet.done = True
    if _hdf5_lib is None:
        _hdf5_lib = _resolve_hdf5_lib()
    if _hdf5_lib:
        try:
            _hdf5_lib.H5Eset_auto2(0, None, None)
        except Exception:
            pass


@contextmanager
def open_netcdf(*args, **kwargs):
    """Open a netCDF file or OPeNDAP URL with the HDF5 lock held.

    The lock is held for the whole with-block, so callers must finish every
    read (`.load()`) inside it — a lazy read escaping the block would touch
    HDF5 unlocked.
    """
    with HDF5_LOCK:
        _silence_hdf5_errors_in_this_thread()
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
            _silence_hdf5_errors_in_this_thread()
            ds.to_netcdf(tmp)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
