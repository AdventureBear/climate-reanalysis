-- Admin flag: gates admin-only tooling (Color Lab) in the UI. There is no
-- self-service path to admin; grant it manually per account:
--   update public.profiles set is_admin = true where id = '<user uuid>';
--
-- Apply with:  supabase db push   (or paste into the dashboard SQL editor).

alter table public.profiles
    add column if not exists is_admin boolean not null default false;

-- The "owner can update" RLS policy covers whole rows, so with a blanket
-- UPDATE grant any signed-in user could flip their own is_admin (or edit
-- tier / billing columns). Narrow the grant to the columns owners may edit.
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
