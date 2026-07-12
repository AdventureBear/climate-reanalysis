-- Pin search_path so the trigger function can't be hijacked via a shadowed
-- object name (advisor 0011). It references no schema objects, so '' suffices.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
