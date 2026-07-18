-- Synopsis blog (#36): posts table + public post-images bucket.
--
-- Posts are authored in an admin-only editor on the site and stored here;
-- the static site bakes published rows into real pages at build time.
-- publish_at supports scheduled publishing (a timed job flips published).
-- Image references inside body_md are stored as bucket paths, never full
-- URLs — the frontend assembles addresses from an env var at build, so a
-- future storage move edits zero rows.

create table if not exists public.posts (
    id           uuid primary key default gen_random_uuid(),
    slug         text not null unique,
    title        text not null,
    description  text not null default '',
    body_md      text not null default '',
    published    boolean not null default false,
    publish_at   timestamptz,
    published_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint posts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger posts_touch before update on public.posts
    for each row execute function public.touch_updated_at();

alter table public.posts enable row level security;

-- Readers: anyone may read published posts (the site build reads as anon).
create policy "posts: public read published"
    on public.posts for select
    to anon, authenticated
    using (published);

-- Authors: admins only, full control (same gate as Admin Stats).
create policy "posts: admin all"
    on public.posts for all
    to authenticated
    using (exists (select 1 from public.profiles where id = auth.uid() and is_admin))
    with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin));

-- Explicit grants (RLS is the row filter, grants are the table gate; MCP-applied
-- migrations skip default grants, which caused 42501s before).
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

-- ── object storage: "post-images" bucket (public read, admin write) ─────────
-- Blog images must be publicly fetchable by any reader and by crawlers.
-- Writes (uploads, the saved-map PNG copies, deletes) are admin-only.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

create policy "post-images: public read"
    on storage.objects for select
    using (bucket_id = 'post-images');

create policy "post-images: admin insert"
    on storage.objects for insert
    with check (
        bucket_id = 'post-images'
        and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
    );

create policy "post-images: admin update"
    on storage.objects for update
    using (
        bucket_id = 'post-images'
        and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
    );

create policy "post-images: admin delete"
    on storage.objects for delete
    using (
        bucket_id = 'post-images'
        and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
    );
