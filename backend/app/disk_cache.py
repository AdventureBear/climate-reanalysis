import os
import uuid

import xarray as xr


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
        ds.to_netcdf(tmp)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
