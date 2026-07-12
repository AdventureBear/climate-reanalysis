-- Extend admin_dashboard_stats() with the anonymous map-request counter:
-- totals.requests and a 30-day requests_by_day series, alongside the existing
-- signup/save charts. Full replacement of the function body; grants re-asserted
-- at the bottom (create or replace preserves ACLs, but be explicit anyway).
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      'requests', (select count(*) from public.map_requests),
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
    'requests_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as n
        from public.map_requests
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
$$;

revoke all on function public.admin_dashboard_stats() from public;
revoke all on function public.admin_dashboard_stats() from anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
