from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import PRESSURE_LEVELS, REGIONS, VARIABLES
from .retrieval import VALID_HOURS, fetch_field, fetch_relative_humidity, fetch_wind_components, fetch_wind_speed
from .visualizer import create_map_product, temp_display_unit

app = FastAPI(title="PyRe Climate Reanalysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "variables": list(VARIABLES.keys()),
        "levels": PRESSURE_LEVELS,
        "regions": list(REGIONS.keys()),
        "valid_hours": VALID_HOURS,
    }


@app.get("/api/map")
async def get_map(
    date: str,
    hour: str,
    variable: str = "wind_speed",
    level: int = 850,
    region: str = "CONUS",
    wind_step: int = 0,
    wind_type: str = "vectors",
):
    # Validate inputs at the boundary
    if hour not in VALID_HOURS:
        raise HTTPException(status_code=422, detail=f"hour must be one of {VALID_HOURS}")
    if variable not in VARIABLES:
        raise HTTPException(status_code=422, detail=f"variable must be one of {list(VARIABLES.keys())}")
    if level not in PRESSURE_LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {PRESSURE_LEVELS}")
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"region must be one of {list(REGIONS.keys())}")

    try:
        if variable == "wind_speed":
            data = fetch_wind_speed(date, hour, level)
        elif variable == "rel_humidity":
            data = fetch_relative_humidity(date, hour, level)
        else:
            grib_name = VARIABLES[variable]["grib_name"]
            data = fetch_field(date, hour, grib_name, level)

        bounds = REGIONS[region]
        subset = data.sel(
            latitude=slice(bounds["lat"][1], bounds["lat"][0]),
            longitude=slice(bounds["lon"][0], bounds["lon"][1]),
        )

        try:
            valid_time = str(data.coords["valid_time"].dt.strftime("%Y-%m-%d %H:%M").values)
        except (KeyError, AttributeError):
            valid_time = f"{date[:4]}-{date[4:6]}-{date[6:]} {hour}z"

        var_cfg = VARIABLES[variable]
        units = temp_display_unit(level) if variable == "temp" else var_cfg["units"]
        var_label = f"{var_cfg['name']} ({units})  {level}mb"

        u_subset = v_subset = None
        if wind_step > 0:
            u_raw, v_raw = fetch_wind_components(date, hour, level)
            u_subset = u_raw.sel(
                latitude=slice(bounds["lat"][1], bounds["lat"][0]),
                longitude=slice(bounds["lon"][0], bounds["lon"][1]),
            )
            v_subset = v_raw.sel(
                latitude=slice(bounds["lat"][1], bounds["lat"][0]),
                longitude=slice(bounds["lon"][0], bounds["lon"][1]),
            )

        buf = create_map_product(
            data_array=subset,
            region_bounds=bounds,
            var_name=var_label,
            date_str=valid_time,
            variable=variable,
            level=level,
            region=region,
            u_array=u_subset,
            v_array=v_subset,
            wind_step=wind_step,
            wind_type=wind_type,
        )

        return StreamingResponse(buf, media_type="image/png")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
