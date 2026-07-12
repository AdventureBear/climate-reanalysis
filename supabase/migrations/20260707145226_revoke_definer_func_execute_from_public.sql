-- Postgres grants EXECUTE to PUBLIC by default, so revoking only from anon/
-- authenticated left the privilege in place (inherited via PUBLIC). Revoke from
-- PUBLIC to actually remove RPC access. Both functions run only as triggers, which
-- do not require the caller to hold EXECUTE.
revoke execute on function public.handle_new_user() from public;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public;
  end if;
end $$;
