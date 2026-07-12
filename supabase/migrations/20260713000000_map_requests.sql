-- Anonymous map-request counter ("map requests" — not named after the renderer
-- or the Render host). One row per /api/map generation, inserted fire-and-forget
-- by the frontend on success. Deliberately anonymous: recipe facts only, no
-- user_id, no IP, no session.
create table if not exists public.map_requests (
    id         uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    variable   text,
    level      text,
    region     text,
    mode       text,
    time_scale text
);

create index if not exists map_requests_created_at_idx on public.map_requests (created_at);

alter table public.map_requests enable row level security;

-- Write-only via the API: anyone may add a row, nobody may read/modify rows
-- through PostgREST. Reads happen only inside admin_dashboard_stats(), which is
-- SECURITY DEFINER (owner bypasses RLS) and gated on profiles.is_admin.
create policy "map_requests: insert only"
    on public.map_requests for insert
    to anon, authenticated
    with check (true);

grant insert on public.map_requests to anon, authenticated;
