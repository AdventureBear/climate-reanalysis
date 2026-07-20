-- Backfill event_date for AFD posts created before the column existed (#82),
-- parsed from the deterministic slug us-weather-{weekday}-{month}-{day}-{year}.
update public.posts
set event_date = to_date(
      regexp_replace(slug, '^us-weather-[a-z]+-', ''), 'FMMonth-FMDD-FMYYYY')
where category = 'forecast discussion' and event_date is null;
