-- Weather-date field (#82): the day of weather an AFD post describes, set by
-- the pipeline to the post's target date. Nullable — hand-written posts have
-- none. The Synopsis index and byline order by / display this instead of the
-- publish date, so a backfilled historical event sorts by its own weather day.
alter table public.posts add column event_date date;
