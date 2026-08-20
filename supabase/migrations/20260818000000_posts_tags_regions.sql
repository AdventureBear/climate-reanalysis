-- Controlled taxonomy for generated WPC discussion posts (#37 follow-up).
-- Tags describe meteorological features, processes, hazards, and weather
-- types. Regions are stored separately so browsing/filtering can distinguish
-- "what happened" from "where it was discussed."

alter table public.posts add column if not exists tags text[] not null default '{}';
alter table public.posts add column if not exists regions text[] not null default '{}';

update public.posts
set category = 'wpc discussion'
where category = 'forecast discussion';

update public.projects
set name = 'WPC Discussions'
where name = 'Forecast Discussions';
