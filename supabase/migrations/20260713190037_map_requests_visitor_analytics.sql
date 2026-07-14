-- Visitor analytics for the anonymous map_requests counter (#14).
--
-- Adds two columns filled entirely by a before-insert trigger (the frontend
-- insert payload is unchanged):
--   signed_in : derived server-side from auth.uid() — present JWT means a
--               signed-in render; cannot be spoofed by the client.
--   visitor   : sha256(x-forwarded-for | user-agent | current_date | salt),
--               hex-encoded. Same person = same token within a day; rotates
--               daily by construction; the raw IP is never stored. The salt
--               lives in a locked table and never leaves the database.

alter table public.map_requests
    add column if not exists signed_in boolean not null default false,
    add column if not exists visitor text;

-- Hash salt: one row, generated once at migration time. RLS on with no
-- policies and no grants — only definer functions (owner) can read it.
create table if not exists public.analytics_salt (
    id   boolean primary key default true check (id),
    salt uuid not null default gen_random_uuid()
);

alter table public.analytics_salt enable row level security;

insert into public.analytics_salt (id) values (true)
on conflict (id) do nothing;

create or replace function public.set_map_request_visitor()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  headers jsonb;
  xff text;
  ua text;
  the_salt uuid;
begin
  headers := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  xff := coalesce(headers->>'x-forwarded-for', '');
  ua  := coalesce(headers->>'user-agent', '');
  select salt into the_salt from public.analytics_salt where id;

  new.signed_in := auth.uid() is not null;
  new.visitor := encode(
    extensions.digest(
      convert_to(xff || '|' || ua || '|' || current_date::text || '|' || the_salt::text, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

revoke execute on function public.set_map_request_visitor() from public, anon, authenticated;

drop trigger if exists map_requests_set_visitor on public.map_requests;
create trigger map_requests_set_visitor
    before insert on public.map_requests
    for each row execute function public.set_map_request_visitor();

-- Extend admin_dashboard_stats() with visitor analytics and usage patterns.
-- Full body replacement (same pattern as 20260713000100); grants re-asserted.
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
    'visitors_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', v.day,
        'visitors', v.visitors,
        'anon_visitors', v.anon_visitors,
        'signed_in_visitors', v.signed_in_visitors,
        'median_renders', v.median_renders,
        'max_renders', v.max_renders
      ) order by v.day), '[]'::jsonb)
      from (
        select
          day,
          count(*) as visitors,
          count(*) filter (where not any_signed_in) as anon_visitors,
          count(*) filter (where any_signed_in) as signed_in_visitors,
          percentile_cont(0.5) within group (order by renders) as median_renders,
          max(renders) as max_renders
        from (
          select
            date_trunc('day', created_at)::date as day,
            coalesce(visitor, 'unknown') as visitor,
            bool_or(signed_in) as any_signed_in,
            count(*) as renders
          from public.map_requests
          where created_at >= now() - interval '30 days'
          group by 1, 2
        ) per_visitor
        group by day
      ) v
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
