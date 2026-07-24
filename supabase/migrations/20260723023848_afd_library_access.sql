-- AFD maps in the shared library (#91).
--
-- 1) The synopsis pipeline (backend, service_role key) saves each generated
--    AFD map as a real saved_maps row under a "Forecast Discussions" project,
--    so "Open in builder" works on them exactly like user-saved maps.
--    Grants are explicit because applied migrations here skip default grants
--    (see 20260719184700 / 20260720191838 for the same fix on posts/profiles).
--    select+insert to find-or-create the project and per-post folders;
--    delete on saved_maps so regenerating a draft replaces its old map rows.

grant select, insert on table public.projects to service_role;
grant select, insert on table public.folders to service_role;
grant select, insert, delete on table public.saved_maps to service_role;

-- 2) Admin-shared library: every admin can see and edit admin-owned library
--    rows (the pipeline writes its rows under one admin account; all admins
--    should be able to work with them). Non-admin users are untouched —
--    their rows stay owner-only under the existing "owner all" policies.
--
--    profiles is owner-read-only under RLS, so policies can't check another
--    user's is_admin flag with a plain subquery; this SECURITY DEFINER
--    helper does the lookup instead (same gate the admin RPCs use).

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

grant execute on function public.is_admin(uuid) to authenticated;

create policy "projects: admins share admin-owned" on public.projects
  for all to authenticated
  using (public.is_admin(auth.uid()) and public.is_admin(user_id))
  with check (public.is_admin(auth.uid()) and public.is_admin(user_id));

create policy "folders: admins share admin-owned" on public.folders
  for all to authenticated
  using (public.is_admin(auth.uid()) and public.is_admin(user_id))
  with check (public.is_admin(auth.uid()) and public.is_admin(user_id));

create policy "saved_maps: admins share admin-owned" on public.saved_maps
  for all to authenticated
  using (public.is_admin(auth.uid()) and public.is_admin(user_id))
  with check (public.is_admin(auth.uid()) and public.is_admin(user_id));

-- Storage: admins can read (signed URLs, thumbnails, downloads) and delete
-- admin-owned objects in the private maps bucket. Object keys start with the
-- owner's user id, matching the existing owner policies.

create policy "maps: admins read admin-owned" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'maps'
    and public.is_admin(auth.uid())
    and public.is_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "maps: admins delete admin-owned" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'maps'
    and public.is_admin(auth.uid())
    and public.is_admin(((storage.foldername(name))[1])::uuid)
  );
