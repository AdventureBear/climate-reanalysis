import xarray as xr
import requests
import os
import numpy as np
from .visualizer import create_map_product
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from .config import REGIONS, VARIABLES

app = FastAPI()
base_dir = os.path.dirname(os.path.abspath(__file__))


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

@app.get("/get-map")
def get_map():
    file_url = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.20260504/18/post/spost/core.t00z.spgb.ensmean.anl.grib2"
    # Updated URL for 0.25 Degree GFS (High Res)
    # file_url = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.20260506/00/atmos/gfs.t00z.pgrb2.0p25.f000"
    #base_dir = os.path.dirname(os.path.abspath(__file__))
    # local_filename = os.path.join(base_dir, "temp_data.grib2")
    local_filename = os.path.join(base_dir, "core_20260504_00z_mean.grib2")
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

@app.get("/map-image")
async def get_map_image(date: str = "20260504", hour: str = "18", level: int = 850):
    """
    Restored dynamic routine:
    Takes date (YYYYMMDD), hour (HH), and level (int) from the API.
    """
    # 1. Construct the REAL name (e.g., core.20260504.t00z.pgrb2.0p25.f000.grib2)
    # We use the standard naming convention to maintain provenance.
    true_filename = f"core.{date}.t{hour}z.pgrb2.0p25.f000.grib2"
    local_file = os.path.join(base_dir, true_filename)

    # 2. Check if the specific requested file exists
    if not os.path.exists(local_file):
        # Reconstruct the URL based on the same dynamic inputs
        # Note: Adjust the URL path logic to match the NOAA directory structure
        remote_url = f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.{date}/{hour}/post/spost/core.t00z.spgb.ensmean.anl.grib2"

        try:
            print(f"Fetching requested data: {true_filename}")
            r = requests.get(remote_url, stream=True, timeout=30)
            r.raise_for_status()
            with open(local_file, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch {true_filename}: {e}")

    # 3. Process the file using the dynamic inputs
    try:
        # Load the file we confirmed by name
        ds = xr.open_dataset(local_file, engine="cfgrib")

        # Pull level dynamically (e.g., isobaricInhPa=850)
        subset = ds.sel(isobaricInhPa=level).squeeze()

        # Region Slicing (using our North America config)
        bounds = REGIONS["North America"]
        subset = subset.sel(
            latitude=slice(bounds["lat"][1], bounds["lat"][0]),
            longitude=slice(bounds["lon"][0], bounds["lon"][1])
        )

        # 4. Math & Visualization
        # We calculate wind speed and pass the real metadata to the visualizer
        speed_data = (subset.u**2 + subset.v**2)**0.5
        valid_time = str(subset.valid_time.dt.strftime('%Y-%m-%d %H:%M').values)

        image_buffer = create_map_product(
            data_array=speed_data,
            region_bounds=bounds,
            var_name=f"COre {level}mb Wind Speed",
            date_str=valid_time # The map validates itself from the data
        )

        return StreamingResponse(image_buffer, media_type="image/png")

    except Exception as e:
        # If we hit an error (like the one you saw), we report it clearly
        raise HTTPException(status_code=500, detail=f"Data processing error: {str(e)}")