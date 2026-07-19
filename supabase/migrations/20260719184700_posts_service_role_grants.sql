-- Synopsis pipeline (#37): the backend saves drafts with the service-role
-- key. MCP-applied migrations skip default grants, so service_role never
-- got read/write on posts (it had only REFERENCES/TRIGGER/TRUNCATE) and
-- REST calls returned 403. service_role bypasses RLS, so these grants are
-- the only gate.
grant select, insert, update, delete on table public.posts to service_role;
