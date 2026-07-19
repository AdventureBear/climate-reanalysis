-- Synopsis pipeline (#37): categorize posts. Pipeline-generated drafts get
-- category 'forecast discussion'; hand-written posts keep ''. A category-
-- filtered menu item is a follow-up — post URLs stay at /synopsis/{slug}
-- permanently, so this column only ever drives listing views.
alter table public.posts add column if not exists category text not null default '';
