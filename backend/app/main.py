import xarray as xr
import requests
import os
import numpy as np

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()



# Add this right after app = FastAPI()
# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], # Your React dev URL
    allow_credentials=True,
    allow_methods=["*"], # Allows GET, POST, etc.
    allow_headers=["*"], # Allows all headers
)

@app.get("/")
def hello():
    return {"message": "Hello World"}

@app.get("/get-anomaly")
def get_wind_anomaly():
    # file_url = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.20260504/18/post/spost/core.t00z.spgb.ensmean.anl.grib2"
    # Updated URL for 0.25 Degree GFS (High Res)
    file_url = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20260506/00/atmos/gfs.t00z.pgrb2.0p25.f000"
    base_dir = os.path.dirname(os.path.abspath(__file__))
    local_filename = os.path.join(base_dir, "temp_data.grib2")

    try:
        # --- Download Logic (Same as before) ---
        if not os.path.exists(local_filename):
            r = requests.get(file_url, timeout=60)
            r.raise_for_status()
            with open(local_filename, 'wb') as f:
                f.write(r.content)

        # --- Processing Logic ---
        ds = xr.open_dataset(
            local_filename,
            engine="cfgrib",
            backend_kwargs={'indexpath': '', 'filter_by_keys': {'typeOfLevel': 'isobaricInhPa', 'level': 850}}
        )

        # 1. Slice to North America to keep JSON small
        # Lat: 20N to 60N, Lon: 230E to 300E (NOMADS uses 0-360 longitude)
        subset = ds.sel(latitude=slice(60, 20), longitude=slice(235, 290))

        # 2. Calculate Wind Speed Magnitude
        u = subset.u.values
        v = subset.v.values
        speed = np.sqrt(u**2 + v**2)

        #clean up NAN values
        speed_cleaned = np.nan_to_num(speed, nan=0.0)

        # 3. Create the JSON-friendly grid
        # We use .tolist() because NumPy arrays aren't JSON serializable
        grid_data = {
            "lat": subset.latitude.values.tolist(),
            "lon": (subset.longitude.values - 360).tolist(),
            "values": speed_cleaned.tolist() # Use the cleaned version
        }

        # --- Cleanup ---
        # Close the dataset so we can delete the file
        ds.close()
        if os.path.exists(local_filename):
            os.remove(local_filename)

        return {"status": "success", "grid": grid_data}

    except Exception as e:
        if os.path.exists(local_filename): os.remove(local_filename)
        raise HTTPException(status_code=500, detail=str(e))




