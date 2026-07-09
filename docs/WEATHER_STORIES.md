# Weather Stories — Map Deep Links

Curated historical events rendered live by PyRe. Every link is a shareable
deep link: open it and the app regenerates the map from the URL recipe.

**Base URL:** links below use `http://localhost:5173`. Find-and-replace with
the deployed domain when presenting from production.

**Tips**
- The first anomaly map for a given variable/level/calendar-day fetches the
  30-year R2 baseline (~10–40 s), then it is disk-cached and instant.
- Dates before ~1979 depend on how deep the CORe archive reaches for each
  stream. Pressure-level fields (MSLP, height, wind, omega) are the safest
  for the 1960s; surface flx fields (2m temp, precip rate) may be missing —
  if a map 404s, drop that panel from the story.
- All times are UTC. Subtract 5 h for EST, 4 h for EDT.

---

## 1. The Pennsylvania "near-derecho" — April 29, 2025

A violent bowing squall line raced across Pennsylvania on the evening of
April 29, 2025, producing widespread 70–90 mph winds, hundreds of thousands
of outages, and fatalities in the Pittsburgh metro. Storms crossed western PA
roughly 21z–00z.

- **MSLP + surface barbs, 21z (setup):**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Northeast&date=20250429&date_mode=single&hour=21&wind_step=8&wind_type=barbs&wind_overlay_mode=actual>
- **2m temperature anomaly, 21z (the primed warm sector):**
  <http://localhost:5173/?variable=temp_2m&level=1000&region=Northeast&date=20250429&date_mode=single&hour=21&mode=anomaly>
- **Precipitation rate, 00z Apr 30 (the line crossing the state):**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Northeast&date=20250430&date_mode=single&hour=00>
- **10m wind speed, 00z Apr 30 (surface wind field):**
  <http://localhost:5173/?variable=wind_10m&level=1000&region=Northeast&date=20250430&date_mode=single&hour=00>

## 2. The June 29, 2012 Mid-Atlantic derecho

The benchmark modern derecho: born over Iowa/Illinois at midday, it crossed
Ohio, West Virginia, Virginia, Maryland, and DC in under 12 hours, killing 22
and cutting power to millions — all embedded in a record June heat wave.

- **2m temperature anomaly, 21z Jun 29 (the fuel — historic heat):**
  <http://localhost:5173/?variable=temp_2m&level=1000&region=Eastern%20US&date=20120629&date_mode=single&hour=21&mode=anomaly>
- **Precipitation rate, 00z Jun 30 (the MCS over WV/VA):**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Eastern%20US&date=20120630&date_mode=single&hour=00>
- **10m wind speed, 03z Jun 30 (arrival at DC/Chesapeake):**
  <http://localhost:5173/?variable=wind_10m&level=1000&region=Eastern%20US&date=20120630&date_mode=single&hour=03>
- **MSLP + barbs, 00z Jun 30:**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Eastern%20US&date=20120630&date_mode=single&hour=00&wind_step=8&wind_type=barbs&wind_overlay_mode=actual>

## 3. Palm Sunday tornado outbreak — April 11, 1965

One of the deadliest outbreaks in US history: 47 tornadoes across Indiana,
Ohio, and Michigan on Palm Sunday afternoon and evening, 271 lives lost.
Peak activity roughly 19z–03z.

- **MSLP anomaly, 21z (how anomalous the parent low was):**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Eastern%20US&date=19650411&date_mode=single&hour=21&mode=anomaly>
- **MSLP + surface barbs, 21z (the deepening Great Lakes low):**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Eastern%20US&date=19650411&date_mode=single&hour=21&wind_step=8&wind_type=barbs&wind_overlay_mode=actual>
- **500mb height, 21z (the digging trough):**
  <http://localhost:5173/?variable=height&level=500&region=Eastern%20US&date=19650411&date_mode=single&hour=21>
- **850mb wind speed, 21z (the low-level jet feeding the storms):**
  <http://localhost:5173/?variable=wind_speed&level=850&region=Eastern%20US&date=19650411&date_mode=single&hour=21>
- **700mb omega anomaly, 21z (anomalous large-scale ascent):**
  <http://localhost:5173/?variable=omega&level=700&region=Eastern%20US&date=19650411&date_mode=single&hour=21&mode=anomaly>

## 4. Greenfield, Iowa EF4 tornado — May 21, 2024

A violent, well-documented tornado (DOW-measured winds near the surface among
the strongest ever sampled) struck Greenfield around 2045z.

- **MSLP + barbs, 21z:**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Central%20Plains&date=20240521&date_mode=single&hour=21&wind_step=6&wind_type=barbs&wind_overlay_mode=actual>
- **850mb wind speed, 21z (low-level jet):**
  <http://localhost:5173/?variable=wind_speed&level=850&region=Central%20Plains&date=20240521&date_mode=single&hour=21>
- **PWAT anomaly, 18z (moisture surge ahead of the dryline):**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=Central%20Plains&date=20240521&date_mode=single&hour=18&mode=anomaly>
- **Precipitation rate, 21z (convective initiation):**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Central%20Plains&date=20240521&date_mode=single&hour=21>

## 5. The Superstorm — Blizzard of March 13, 1993

The "Storm of the Century": a bomb cyclone that bottomed out near 960 mb,
buried the Appalachians (including PA) in snow, and set station-pressure
records from Florida to New England.

- **MSLP + barbs, 12z Mar 13 (the monster low):**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Eastern%20US&date=19930313&date_mode=single&hour=12&wind_step=8&wind_type=barbs&wind_overlay_mode=actual>
- **MSLP anomaly, 12z (how far off climatology it was):**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Eastern%20US&date=19930313&date_mode=single&hour=12&mode=anomaly>
- **500mb height, 12z (the deep trough):**
  <http://localhost:5173/?variable=height&level=500&region=Eastern%20US&date=19930313&date_mode=single&hour=12>
- **Precipitation rate, 12z:**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Eastern%20US&date=19930313&date_mode=single&hour=12>
- **2m temperature anomaly, 12z Mar 14 (the arctic blast behind it):**
  <http://localhost:5173/?variable=temp_2m&level=1000&region=Eastern%20US&date=19930314&date_mode=single&hour=12&mode=anomaly>

## 6. Atmospheric river into California — February 13–14, 2025

A strong AR slammed Southern California a month after the Palisades and Eaton
fires, triggering destructive debris flows on the fresh burn scars.

- **PWAT (the moisture plume from the subtropics), 18z Feb 13:**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=Eastern%20Pacific&date=20250213&date_mode=single&hour=18>
- **PWAT anomaly, 18z (how loaded the atmosphere was):**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=Eastern%20Pacific&date=20250213&date_mode=single&hour=18&mode=anomaly>
- **850mb wind speed, 18z (the jet driving moisture onshore):**
  <http://localhost:5173/?variable=wind_speed&level=850&region=Eastern%20Pacific&date=20250213&date_mode=single&hour=18>
- **Precipitation rate over SoCal, 00z Feb 14:**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Southwest%20US&date=20250214&date_mode=single&hour=00>

## 7. Santa Ana windstorm — January 7–8, 2025 (Palisades / Eaton fires)

The catastrophic wind event that drove the Los Angeles fires: an intense
Great Basin high squeezing against a coastal trough, with hurricane-force
downslope gusts overnight January 7–8.

- **MSLP + barbs, 06z Jan 8 (the pressure gradient):**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Southwest%20US&date=20250108&date_mode=single&hour=06&wind_step=6&wind_type=barbs&wind_overlay_mode=actual>
- **10m wind speed, 06z:**
  <http://localhost:5173/?variable=wind_10m&level=1000&region=Southwest%20US&date=20250108&date_mode=single&hour=06>
- **850mb relative humidity, 18z Jan 8 (bone-dry downslope air):**
  <http://localhost:5173/?variable=rel_humidity&level=850&region=Southwest%20US&date=20250108&date_mode=single&hour=18>

## 8. Hurricane Helene meets the midlatitudes — September 26–27, 2024

Helene made Cat-4 landfall in Florida's Big Bend (~0330z Sep 27), then an
upstream cutoff low captured the storm and stalled its remnants over the
Tennessee Valley — aiming a moisture firehose at the North Carolina mountains.

- **MSLP + barbs at landfall, 03z Sep 27:**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Southeast%20US&date=20240927&date_mode=single&hour=03&wind_step=6&wind_type=barbs&wind_overlay_mode=actual>
- **500mb height, 12z Sep 27 (the cutoff low + block that stopped it):**
  <http://localhost:5173/?variable=height&level=500&region=Eastern%20US&date=20240927&date_mode=single&hour=12>
- **PWAT anomaly, 12z Sep 27 (record moisture into the Carolinas):**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=Southeast%20US&date=20240927&date_mode=single&hour=12&mode=anomaly>
- **Daily-mean precipitation anomaly, Sep 27 (the flood day in one map):**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Southeast%20US&date=20240927&date_mode=single&hours=00,06,12,18&mode=anomaly>

## 9. Hurricane Melissa — October 28, 2025

Category 5 landfall in Jamaica — the strongest landfall on record for the
island. (An ensemble-mean reanalysis smooths the inner core, so present these
as "the storm's envelope," not literal peak winds.)

- **10m wind speed, 15z Oct 28 (approaching landfall):**
  <http://localhost:5173/?variable=wind_10m&level=1000&region=Western%20Atlantic&date=20251028&date_mode=single&hour=15>
- **MSLP + barbs, 15z:**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Western%20Atlantic&date=20251028&date_mode=single&hour=15&wind_step=8&wind_type=barbs&wind_overlay_mode=actual>
- **PWAT, 15z (the tropical moisture envelope):**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=Western%20Atlantic&date=20251028&date_mode=single&hour=15>

## 10. Humberto & Imelda — the Fujiwhara pair, late September 2025

It was H & I: Category-5 Humberto and Imelda circled each other over the
western Atlantic, and the binary interaction yanked Imelda northeast, sparing
the Southeast US coast a direct hit.

- **10m wind speed, 12z Sep 29 (two circulations on one map):**
  <http://localhost:5173/?variable=wind_10m&level=1000&region=Western%20Atlantic&date=20250929&date_mode=single&hour=12>
- **Same view 24 h later, 12z Sep 30 (watch them pivot):**
  <http://localhost:5173/?variable=wind_10m&level=1000&region=Western%20Atlantic&date=20250930&date_mode=single&hour=12>
- **MSLP + barbs, 12z Sep 29:**
  <http://localhost:5173/?variable=surface_pressure&level=1000&region=Western%20Atlantic&date=20250929&date_mode=single&hour=12&wind_step=10&wind_type=barbs&wind_overlay_mode=actual>
- **500mb height, 12z Sep 29 (the steering pattern):**
  <http://localhost:5173/?variable=height&level=500&region=Western%20Atlantic&date=20250929&date_mode=single&hour=12>

## 11. The African easterly jet and African easterly waves

Hurricane season's assembly line: the September-mean African easterly jet,
and a live wave rolling off the coast (early September 2024, during a very
active Cape Verde period).

- **700mb wind speed climatology, September (the AEJ ribbon):**
  <http://localhost:5173/?variable=wind_speed&level=700&region=Northern%20Africa&months=200009&mode=climatology>
- **700mb wind speed, 12z Sep 6 2024 (a wave disturbing the jet):**
  <http://localhost:5173/?variable=wind_speed&level=700&region=Northern%20Africa&date=20240906&date_mode=single&hour=12>
- **Precipitation rate, 12z Sep 6 2024 (wave convection + ITCZ):**
  <http://localhost:5173/?variable=precip_rate&level=1000&region=Northern%20Africa&date=20240906&date_mode=single&hour=12>
- **OLR, 12z Sep 6 2024 (cold cloud tops marching west):**
  <http://localhost:5173/?variable=olr&level=1000&region=Northern%20Africa&date=20240906&date_mode=single&hour=12>

## 12. The Indian monsoon

The planet's biggest seasonal switch, told in climatology pairs — then the
record-early 2025 onset (Kerala, May 24, 2025).

- **PWAT climatology, January (the dry season):**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=India&months=200001&mode=climatology>
- **PWAT climatology, July (the switch thrown):**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=India&months=200007&mode=climatology>
- **850mb wind speed climatology, July (Somali jet + monsoon westerlies):**
  <http://localhost:5173/?variable=wind_speed&level=850&region=India&months=200007&mode=climatology>
- **200mb wind speed climatology, July (the Tropical Easterly Jet):**
  <http://localhost:5173/?variable=wind_speed&level=200&region=India&months=200007&mode=climatology>
- **PWAT anomaly at the 2025 onset surge, 12z May 26 2025:**
  <http://localhost:5173/?variable=precipitable_water&level=1000&region=India&date=20250526&date_mode=single&hour=12&mode=anomaly>
- **850mb wind monthly anomaly, June 2025 (the onset month's circulation):**
  <http://localhost:5173/?variable=wind_speed&level=850&region=India&months=202506&mode=anomaly>

---

## Date confidence notes

High confidence: 2012 derecho (Jun 29–30), Palm Sunday (Apr 11 1965),
Blizzard of '93 (Mar 13), Greenfield (May 21 2024, ~2045z), Helene landfall
(~0330z Sep 27 2024), Santa Ana/LA fires (Jan 7–8 2025), Melissa Jamaica
landfall (Oct 28 2025).

Verify before presenting: exact timing of the Apr 29 2025 PA squall line
(links use 21z/00z), the strongest AR day in Feb 2025 (links use Feb 13–14
SoCal; the Feb 4 NorCal AR is an alternative), the best Fujiwhara snapshot
times for Humberto–Imelda (links use Sep 29–30 12z), and the 2025 Kerala
onset surge date (links use May 26). Nudging `date`/`hour` in the URL is all
it takes to re-center a map on the action.
