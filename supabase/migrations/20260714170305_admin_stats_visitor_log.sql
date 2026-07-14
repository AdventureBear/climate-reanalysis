-- Per-visitor activity log for Admin Stats (#14 follow-up).
--
-- The aggregate charts answered nothing at this scale; the useful question is
-- "who came in and what did they do". Adds to admin_dashboard_stats():
--   visitor_log      : last 14 days, one entry per (day, visitor hash) with
--                      render count, active time span, most-rendered variable
--                      and region, and whether they were signed in.
--   untracked_by_day : renders from before visitor tracking (visitor is null),
--                      so pre-migration days are labeled honestly instead of
--                      masquerading as one anonymous visitor.
-- Full body replacement (same pattern as 20260713190037); grants re-asserted.
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
    'visitor_log', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', t.day,
        'visitor', t.visitor,
        'signed_in', t.signed_in,
        'renders', t.renders,
        'first_seen', t.first_seen,
        'last_seen', t.last_seen,
        'top_variable', t.top_variable,
        'top_region', t.top_region,
        'top_mode', t.top_mode
      ) order by t.day desc, t.renders desc), '[]'::jsonb)
      from (
        select
          date_trunc('day', created_at)::date as day,
          visitor,
          bool_or(signed_in) as signed_in,
          count(*) as renders,
          min(created_at) as first_seen,
          max(created_at) as last_seen,
          mode() within group (order by variable) as top_variable,
          mode() within group (order by region) as top_region,
          mode() within group (order by mode) as top_mode
        from public.map_requests
        where created_at >= now() - interval '14 days' and visitor is not null
        group by 1, 2
      ) t
    ),
    'untracked_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day desc), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, count(*) as n
        from public.map_requests
        where created_at >= now() - interval '14 days' and visitor is null
        group by 1
      ) d
    ),
    'top_variables', (
      select coalesce(jsonb_agg(jsonb_build_object('value', t.v, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (
        select coalesce(variable, '(none)') as v, count(*) as n
        from public.map_requests
        where created_at >= now() - interval '30 days'
        group by 1 order by 2 desc limit 10
      ) t
    ),
    'top_regions', (
      select coalesce(jsonb_agg(jsonb_build_object('value', t.v, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (
        select coalesce(region, '(none)') as v, count(*) as n
        from public.map_requests
        where created_at >= now() - interval '30 days'
        group by 1 order by 2 desc limit 10
      ) t
    ),
    'top_modes', (
      select coalesce(jsonb_agg(jsonb_build_object('value', t.v, 'count', t.n) order by t.n desc), '[]'::jsonb)
      from (
        select coalesce(mode, '(none)') as v, count(*) as n
        from public.map_requests
        where created_at >= now() - interval '30 days'
        group by 1 order by 2 desc limit 10
      ) t
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
