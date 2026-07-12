-- Phase 1 tables need DML grants to the API roles; RLS (already enabled) gates
-- rows to auth.uid(). Without these grants Postgres denies at the table level
-- before RLS is consulted, so the authenticated app cannot read/write its library.
--
-- Deviation from the statement originally applied to dev (2026-07-07): profiles
-- UPDATE is excluded from the blanket grant. 20260707000000_profiles_admin_flag.sql
-- narrows profiles updates to update(display_name) so users cannot flip their own
-- is_admin/tier; a blanket UPDATE grant applied after that file would silently
-- undo the narrowing. The grants below match dev's actual end state.
grant select, insert, update, delete
  on public.projects, public.folders, public.saved_maps
  to authenticated, anon;

grant select, insert, delete on public.profiles to authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
