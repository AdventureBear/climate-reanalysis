-- Saved-map images are private user assets, not public content. Sharing is done
-- by re-sharing the recipe (a text URL) or downloading the PNG — never by a public
-- object URL. Make the bucket private and restrict reads to the owner.
-- (The app already fetches owner images via short-lived signed URLs.)
update storage.buckets set public = false where id = 'maps';

drop policy if exists "maps: public read" on storage.objects;
drop policy if exists "maps: owner read" on storage.objects;
create policy "maps: owner read"
    on storage.objects for select
    using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);

-- SECURITY DEFINER functions bypass RLS; they should not be callable via PostgREST
-- RPC. handle_new_user only runs as the auth.users trigger; rls_auto_enable only
-- runs as its event trigger. Revoking EXECUTE leaves both triggers working.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- rls_auto_enable is a dev-only event-trigger guardrail (auto-enables RLS on new
-- public tables) created ad hoc; it may not exist in every environment.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;
