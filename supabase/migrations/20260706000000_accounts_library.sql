-- Phase 1: user accounts + saved library (projects -> folders -> maps).
-- Rendered map images live in object storage (bucket "maps"); only the
-- MapRecipe JSON lives in Postgres. RLS scopes every row/object to its owner.
--
-- Apply with:  supabase db push   (or paste into the dashboard SQL editor).

-- ── profiles ──────────────────────────────────────────────────────────────
-- One row per auth user. tier / stripe_customer_id are unused in Phase 1 and
-- seed the Phase 2 monetization work.
create table if not exists public.profiles (
    id                 uuid primary key references auth.users (id) on delete cascade,
    display_name       text,
    tier               text not null default 'free',
    stripe_customer_id text,
    created_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can update" on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ── projects ──────────────────────────────────────────────────────────────
create table if not exists public.projects (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users (id) on delete cascade,
    name       text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

create policy "projects: owner all" on public.projects
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── folders (nestable via parent_folder_id) ───────────────────────────────
create table if not exists public.folders (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    project_id       uuid not null references public.projects (id) on delete cascade,
    parent_folder_id uuid references public.folders (id) on delete cascade,
    name             text not null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists folders_user_id_idx    on public.folders (user_id);
create index if not exists folders_project_id_idx on public.folders (project_id);
create index if not exists folders_parent_idx     on public.folders (parent_folder_id);

alter table public.folders enable row level security;

create policy "folders: owner all" on public.folders
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── saved_maps (recipe in DB, image bytes in object storage) ──────────────
create table if not exists public.saved_maps (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    project_id     uuid not null references public.projects (id) on delete cascade,
    folder_id      uuid references public.folders (id) on delete set null,
    name           text not null,
    recipe         jsonb not null,
    image_path     text,
    thumbnail_path text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists saved_maps_user_id_idx    on public.saved_maps (user_id);
create index if not exists saved_maps_project_id_idx on public.saved_maps (project_id);
create index if not exists saved_maps_folder_id_idx  on public.saved_maps (folder_id);

alter table public.saved_maps enable row level security;

create policy "saved_maps: owner all" on public.saved_maps
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── updated_at maintenance ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists projects_touch   on public.projects;
drop trigger if exists folders_touch     on public.folders;
drop trigger if exists saved_maps_touch  on public.saved_maps;
create trigger projects_touch  before update on public.projects  for each row execute function public.touch_updated_at();
create trigger folders_touch    before update on public.folders    for each row execute function public.touch_updated_at();
create trigger saved_maps_touch before update on public.saved_maps for each row execute function public.touch_updated_at();

-- ── object storage: "maps" bucket (public read, owner-only write) ─────────
-- Objects are keyed {user_id}/{map_id}/full.png and .../thumb.png, so the
-- first path segment is the owner's uid — that's what the write policies check.
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do nothing;

create policy "maps: public read"
    on storage.objects for select
    using (bucket_id = 'maps');

create policy "maps: owner insert"
    on storage.objects for insert
    with check (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "maps: owner update"
    on storage.objects for update
    using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "maps: owner delete"
    on storage.objects for delete
    using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);
