import { json } from "../utils/http.js";
export function mountSync(router) {
  router.add("GET", "/api/sync/event/:id/allowlist", async (req, env, ctx, { id }) => {
    // MVP: return minimal set; later implement proper revision/delta.
    const rows = await env.DB.prepare("SELECT id, qr, state FROM tickets WHERE event_id=?").bind(Number(id)).all();
    return json({ ok:true, tickets: rows.results||[] });
  });
}
