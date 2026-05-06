import xarray as xr
import requests
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()



# Add this right after app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For prototype only!
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def hello():
    return {"message": "Hello World"}

@app.get("/get-anomaly")
def get_wind_anomaly():
    # Hardcoded to the exact file seen in your directory listing
    file_url = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/core/prod/core.20260504/18/post/spost/core.t00z.spgb.ensmean.anl.grib2"

    base_dir = os.path.dirname(os.path.abspath(__file__))
    local_filename = os.path.join(base_dir, "hardcoded_core_test.grib2")

    try:
        # 1. Download the specific file
        if not os.path.exists(local_filename):
            print(f"Downloading confirmed file: {file_url}")
            r = requests.get(file_url, timeout=60)
            r.raise_for_status()
            with open(local_filename, 'wb') as f:
                f.write(r.content)

        # 2. Open with xarray
        # Using indexpath='' to avoid the .idx permission/path errors
        ds = xr.open_dataset(
            local_filename,
            engine="cfgrib",
            backend_kwargs={
                'indexpath': '',
                'filter_by_keys': {
                    'typeOfLevel': 'isobaricInhPa',
                    'level': 850 # Hardcoded to your target level
                }
            }
        )

        # 3. Success! Return the variables found at 850mb
        variables = list(ds.data_vars)
        print(f"Found variables: {variables}")
        v = ds.v
        u= ds.u

        # 2. Calculate total wind speed (Result is in m/s)
        # Pythagorean theorem: speed = sqrt(u^2 + v^2)
        wind_speed = (u**2 + v**2)**0.5

        # 3. Quick Check
        max_wind = wind_speed.max().values
        print(f"Max wind speed at 850mb: {max_wind} m/s")

        return {
            "status": "success",
            "file_used": "core.t00z.spgb.ensmean.anl.grib2",
            "variables": variables
        }

        # v = ds.v
        #
        # # 2. Calculate total wind speed (Result is in m/s)
        # # Pythagorean theorem: speed = sqrt(u^2 + v^2)
        # wind_speed = (u**2 + v**2)**0.5
        #
        # # 3. Quick Check
        # max_wind = wind_speed.max().values
        # print(f"Max wind speed at 850mb: {max_wind} m/s")

    except Exception as e:
        # Clean up failed download so we don't try to open a half-finished file next time
        if os.path.exists(local_filename):
            os.remove(local_filename)
        raise HTTPException(status_code=500, detail=str(e))





