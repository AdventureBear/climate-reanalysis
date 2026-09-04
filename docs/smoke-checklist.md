# PyRe Smoke Checklist

This is a small repeatable smoke pass for local development and the deployed
Render services. It is not a scientific review of the maps; it answers one
question: can the app render a representative map from each major request path?

Run these one at a time. The public map endpoint has request guards, and smoke
checks should behave like a careful user, not a load test.

## Origins

Local development:

```bash
BACKEND_ORIGIN=http://127.0.0.1:8000
FRONTEND_ORIGIN=http://localhost:5173
```

Render:

```bash
BACKEND_ORIGIN=https://<render-backend-host>
FRONTEND_ORIGIN=https://www.pyreweather.org
```

## API Check Command

For each recipe below, render the API URL to a PNG and confirm that the response
is an image:

```bash
curl -fSL "$BACKEND_ORIGIN/api/map?<query-string>" -o /tmp/pyre-smoke.png
file /tmp/pyre-smoke.png
```

Expected command result:

- `curl` exits with status `0`.
- `file` reports `PNG image data`.
- The output file is not tiny; a normal map is usually hundreds of KB or more.
- The backend logs show a completed render, not a JSON error response.

## Browser Check Command

Open the same query string in the frontend map builder:

```text
$FRONTEND_ORIGIN/map/?<query-string>
```

Expected browser result:

- The map builder loads with the recipe reflected in the controls.
- Clicking Generate Map displays a rendered PNG.
- There is no red error banner.
- The title, valid time, region, units, colorbar, and attribution are visible.

## Known Recipes

### 3-hourly raw map

Purpose: verifies direct CORe 3-hourly field retrieval, wind magnitude
derivation, wind glyph overlay, and fixed wind scale rendering.

```text
variable=wind_speed&level=850&region=CONUS&mode=raw&date=20250115&date_mode=single&hour=12&wind_step=2&wind_type=barbs&wind_unit=kt
```

Expected map:

- 850mb wind speed shaded in knots.
- 850mb wind barbs over the shading.
- Title includes `850mb` and `2025-01-15 12:00`.

### Daily composite map

Purpose: verifies daily composite selection, multi-hour averaging, height
shaded fill, and raw contour overlay.

```text
variable=height&level=500&region=Eastern%20US&mode=raw&date_mode=list&dates=19930312,19930313,19930314&hours=00,06,12,18&fill_mode=shaded&contours=height
```

Expected map:

- 500mb geopotential height shaded fill over the eastern United States.
- Height contours are visible and labeled.
- Title describes a daily/list composite rather than one synoptic hour.

### Monthly composite map

Purpose: verifies monthly CORe observation retrieval and monthly compositing.

```text
variable=temp&level=850&region=CONUS&mode=raw&months=202001,202002&temp_unit=F
```

Expected map:

- 850mb temperature shaded in degrees F.
- Title describes a January-February 2020 monthly composite.
- No daily/hour controls are required by the API query.

### Anomaly map

Purpose: verifies climatology source resolution, anomaly math, and anomaly
color scale rendering.

```text
variable=temp_2m&level=1000&region=CONUS&mode=anomaly&date=19681126&date_mode=single&hour=12&temp_unit=F&climo_source=r2-daily
```

Expected map:

- 2m temperature anomaly shaded in degrees F.
- Diverging cold/warm anomaly colors are visible.
- Title identifies an anomaly map and the valid time `1968-11-26 12:00`.

## Extended Sibling Recipes

Run these when a change touches climatology, normalized anomalies, surface or
named-level variables, regions/projections, or URL/API recipe serialization.

### Normalized anomaly map

Purpose: verifies standard-deviation climatology retrieval, normalized anomaly
math, and normalized anomaly masking/rendering.

```text
variable=temp&level=500&region=CONUS&mode=normalized&date=20210710&date_mode=single&hour=12&climo_source=r2-daily
```

Expected map:

- 500mb temperature normalized anomaly shading is visible.
- Colorbar is centered on neutral/zero and labeled as a normalized anomaly.
- Title identifies a normalized anomaly map and the valid time `2021-07-10 12:00`.

### Surface/named-level raw map

Purpose: verifies the surface/named-level observation path, shaded MSLP
rendering, pressure contours, and a wind overlay on a non-wind base variable.

```text
variable=surface_pressure&level=1000&region=Eastern%20US&mode=raw&date=19930313&date_mode=single&hour=12&fill_mode=shaded&contours=pressure&wind_step=8&wind_type=barbs
```

Expected map:

- Mean sea-level pressure shaded fill and pressure contours are visible.
- Surface wind barbs render over the pressure field.
- Title includes the valid time `1993-03-13 12:00`.

### Monthly anomaly map

Purpose: verifies monthly observation retrieval plus monthly climatology on a
pressure-level variable.

```text
variable=height&level=500&region=North%20America&mode=anomaly&months=199303&climo_source=monthly-pgb&fill_mode=shaded&contours=height
```

Expected map:

- 500mb height anomaly shading is visible.
- Raw height contours are visible over the anomaly field.
- Title identifies March 1993 and the monthly climatology source.

### Climatology-only map

Purpose: verifies the no-observation climatology render path, where the map is
drawn directly from the selected baseline.

```text
variable=wind_speed&level=700&region=India&mode=climatology&months=200007&climo_source=r2-monthly&wind_unit=kt
```

Expected map:

- 700mb wind speed climatology renders over India.
- Title identifies a July climatology rather than an observed date.
- No observation fetch is required.

### Wrapped-longitude regional map

Purpose: verifies region slicing and rendering for a domain that crosses the
0/360 longitude seam.

```text
variable=precipitable_water&level=1000&region=Tropical%20Atlantic&mode=raw&date=20240906&date_mode=single&hour=12&pwat_unit=in
```

Expected map:

- The Tropical Atlantic domain renders without a blank split or missing side.
- Precipitable water is shaded in inches.
- Title includes the valid time `2024-09-06 12:00`.

## Canonical Time-Selection Recipes (v2 contract)

One render each through the backend URL and the frontend `/map/` URL:

- 3-hourly range crossing midnight (the pairs fetch path + hour-matched baseline):
  `time_scale=3-hourly&date_mode=range&start_time=<D1>21&end_time=<D2>06&variable=height&level=500&region=CONUS&mode=anomaly`
- 3-hourly slice, multi-hour:
  `time_scale=3-hourly&date_mode=slice&dates=<D1>,<D2>&hours=03,18&variable=temp&level=850&region=CONUS&mode=anomaly`
- 3-hourly list:
  `time_scale=3-hourly&date_mode=list&times=<D1>09,<D2>18&variable=height&level=500&region=CONUS`
- Legacy bare date (Decision 2 — must render the daily composite, and the
  frontend shows the changed-meaning notice):
  `date=<D1>&variable=height&level=500&region=CONUS`
- Legacy explicit `hour=00` (must stay a 00z snapshot, NOT a daily composite).

## Pass/Fail Notes

Pass the core smoke check when all four known recipes render through both:

- direct backend API URL
- frontend `/map/` URL on the same environment

Pass the extended sibling smoke check when every extended recipe relevant to
the change renders through the same two paths.

Fail the smoke check if any recipe returns:

- HTTP `4xx` or `5xx`
- JSON error instead of PNG
- a blank or corrupt image
- a frontend error banner
- a map whose visible title/level/mode does not match the requested recipe

First-run latency is not, by itself, a failure. A cold Render disk or missing
climatology cache can make anomaly maps slower on the first render.
