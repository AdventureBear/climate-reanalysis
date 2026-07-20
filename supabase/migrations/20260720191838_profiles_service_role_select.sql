-- Backend admin check (#76): synopsis.is_admin_token reads profiles with the
-- service-role key to authorize admin-triggered API calls. MCP-applied
-- migrations skip default grants, so service_role had only
-- REFERENCES/TRIGGER/TRUNCATE on profiles (no SELECT) and every admin-authed
-- call to /api/synopsis/generate returned 401. service_role bypasses RLS, so
-- this grant is the only gate.
grant select on table public.profiles to service_role;
