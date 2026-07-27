# Birthday maps

A novelty packet of weather maps for a friend's birth date. Local-only: renders
in-process (no server, no Supabase), writes PNGs + links + a stats sheet to
`out/<name-date>/`. Purely algorithmic — no AI calls anywhere; the same date
and place always produce the same packet.

## Usage

```bash
cd backend
uv run python scripts/birthday-maps/birthday_maps.py 19750727 "Pittsburgh, PA" --name steve
```

Options:

- `--time 07:14` — birth time in the **birthplace's local clock**. Converted to
  UTC with the DST rules in force on that date (zoneinfo/IANA — 1970s Indiana
  and wartime rules come out right). With a time, **every map is the 3-hourly
  analysis nearest the birth moment**; without one, every map is the day's
  mean. Diagnostics always scan the whole local day either way.
- `--animate` — also render a 9-frame GIF (shaded 2m temperature + wind barbs
  + H/L centers + isobars): 24 hours before → 24 hours after the birthday (or
  the birth moment) at 6-hour steps — the storm arriving and leaving. Frames
  outside the archive are skipped.
- Dates from 1950-01-01 (CORe archive start).

## What every packet gets

- Base maps, all CONUS, all stamped with a red star on the birthplace and
  "<Name>'s Birthday - <local date & time>" on the title bar: 500mb height
  (shaded, contours, barbs), surface pressure (shaded, H/L centers), 2m
  temperature, 2m temperature anomaly, 300mb wind (barbs), 850mb temperature
  with barbs. Height and wind-speed maps always carry wind barbs.
- `links.md` — a shareable deep link per map (regenerates live on the site;
  the star/title extras are local-render-only and stripped from links).
- `summary.txt` — "your birthday in numbers": temperature and anomaly (σ),
  day's high/low, sky cover, dewpoint, 10m wind, 500mb height anomaly (σ),
  500mb vorticity max, MSLP (mean and lowest analysis nearby), precipitation,
  snow depth, peak CAPE, PWAT (σ), 300mb jet max.

## How the extra maps are chosen

The birthplace is a **probe point**, not a map region. Diagnostics sample the
birthplace's **local calendar day**: slow fields (temperature, moisture, sky
cover) as the local-day mean; episodic fields (MSLP, CAPE, day's high/low) as
the extreme across the day's analyses — a daily mean smears a passing low or
an evening storm into invisibility (the Palm Sunday 1965 test case).

Trigger table (thresholds are the `TRIG_*` constants at the top of the script):

| Trigger | Condition at/near the birthplace | Adds |
|---|---|---|
| Exceptional warm/cold | 2m temp anomaly ≥ ±2σ | normalized temp map |
| Deep low | window MSLP min ≤ 990 hPa | storm close-up (shaded, barbs) |
| Wet / snowy day | ≥ 10 mm/day (snowy if also freezing) | precip (+ snow depth) map |
| Standing snowpack | ≥ 6 in on the ground | snow depth map |
| Severe weather | peak CAPE ≥ 1000 J/kg | CAPE map |
| Moisture plume | PWAT ≥ +2σ | PWAT map |
| Monster ridge / deep trough | 500mb heights ≥ ±2σ | 500mb anomaly map (barbs) |
| Shortwave overhead | 500mb vorticity ≥ 20×10⁻⁵/s | vorticity map |
| Sultry | 2m dewpoint ≥ 70 °F | dewpoint map |
| Windy | 10m wind day-mean ≥ 25 kt | 10m wind map (barbs) |
| Jet overhead | 300mb window max ≥ 120 kt | flag (map in base) |
| Bluebird / socked in | cloud cover ≤ 20% / ≥ 90% | flag |
| Scorcher / deep freeze | hit 95 °F / fell to 0 °F | flag |
| Capped storm | ≥ 500 J/kg fuel under ≥ 100 J/kg cap | flag |

Fields that don't exist in an archive era (e.g. dewpoint on very old dates)
show "n/a" in the summary and their triggers stay quiet instead of failing
the run.

The first run for a place does one Nominatim geocode lookup (cached in
`out/geocode_cache.json`).
