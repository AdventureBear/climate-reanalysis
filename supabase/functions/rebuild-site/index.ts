// rebuild-site (#36): the one place the Render deploy-hook URL lives.
//
// Two callers:
//   mode "rebuild" — the Synopsis editor (admin JWT required): tells Render
//                    to rebuild the static site.
//   mode "cron"    — the Supabase scheduler (x-cron-secret header required):
//                    publishes posts whose publish_at has arrived, then
//                    rebuilds once if any were published.
//
// Secrets: RENDER_DEPLOY_HOOK_URL (from Render → static site → Deploy Hook),
//          CRON_SECRET (any random string; the schedule sends it back).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function pokeRender(): Promise<Response> {
  // Operational failures return 200 with ok:false so the editor can show the
  // real reason (the client library hides bodies of non-2xx responses).
  const hook = Deno.env.get("RENDER_DEPLOY_HOOK_URL");
  if (!hook) return json({ ok: false, error: "no deploy hook is configured (expected outside production)" });
  const res = await fetch(hook, { method: "POST" });
  if (!res.ok) return json({ ok: false, error: `Render answered HTTP ${res.status}` });
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode ?? "rebuild";

  if (mode === "cron") {
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }
    const { data, error } = await svc
      .from("posts")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("published", false)
      .not("publish_at", "is", null)
      .lte("publish_at", new Date().toISOString())
      .select("id");
    if (error) return json({ ok: false, error: error.message });
    if ((data?.length ?? 0) === 0) return json({ ok: true, published: 0 });
    const poked = await pokeRender();
    return poked;
  }

  // mode "rebuild": admin JWT required.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await svc.auth.getUser(token);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "sign in required" }, 401);
  const { data: prof } = await svc.from("profiles").select("is_admin").eq("id", uid).single();
  if (!prof?.is_admin) return json({ error: "admin required" }, 403);
  return await pokeRender();
});
