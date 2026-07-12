-- Admin usage dashboard: single RPC returning totals, 30-day signup/map
-- counts, and per-user rows (email, tier, maps, storage bytes, last map).
--
-- SECURITY DEFINER so it can read auth.users and storage.objects, but it
-- raises unless the caller's profile has is_admin. The explicit REVOKE/GRANT
-- block at the bottom is required: functions default to EXECUTE for public,
-- and conversely, migrations applied outside the dashboard don't add grants.

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin
  ) then
    raise exception 'admin_dashboard_stats: admin access required';
  end if;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'maps', (select count(*) from public.saved_maps),
      'projects', (select count(*) from public.projects),
      'storage_bytes', coalesce((
        select sum((o.metadata->>'size')::bigint)
        from storage.objects o where o.bucket_id = 'maps'
      ), 0)
    ),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as n
        from auth.users
        where created_at >= now() - interval '30 days'
        group by 1
      ) d
    ),
    'maps_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as n
        from public.saved_maps
        where created_at >= now() - interval '30 days'
        group by 1
      ) d
    ),
    'users', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select
          u.id,
          u.email,
          p.display_name,
          p.tier,
          coalesce(p.is_admin, false) as is_admin,
          u.created_at,
          (select count(*) from public.saved_maps m where m.user_id = u.id) as maps_count,
          (select max(m.created_at) from public.saved_maps m where m.user_id = u.id) as last_map_at,
          coalesce((
            select sum((o.metadata->>'size')::bigint)
            from storage.objects o
            where o.bucket_id = 'maps'
              and (o.owner = u.id or o.name like u.id || '/%')
          ), 0) as storage_bytes
        from auth.users u
        left join public.profiles p on p.id = u.id
      ) t
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public.admin_dashboard_stats() from public;
revoke all on function public.admin_dashboard_stats() from anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
