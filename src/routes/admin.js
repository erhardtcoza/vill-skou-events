import { json, bad } from "../utils/http.js";
import { createEvent, listEvents, addTicketType, getCatalog } from "../services/events.js";
import { q, qi } from "../env.js";

export function mountAdmin(router) {
  router.add("GET", "/api/admin/events", async (req, env) => json({ ok:true, events: await listEvents(env.DB) }));

  router.add("POST", "/api/admin/events", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.slug || !b?.name || !b?.starts_at || !b?.ends_at) return bad("Missing fields");
    const id = await createEvent(env.DB, b);
    return json({ ok:true, id });
  });

  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b?.name || !b?.price_cents || !b?.capacity) return bad("Missing fields");
    const ttId = await addTicketType(env.DB, { ...b, event_id: Number(id) });
    return json({ ok:true, id: ttId });
  });

  router.add("GET", "/api/admin/events/:id/catalog", async (req, env, ctx, { id }) => {
    return json({ ok:true, ...(await getCatalog(env.DB, Number(id))) });
  });

  // Gates CRUD (simple)
  router.add("GET", "/api/admin/gates", async (req, env) => json({ ok:true, gates: await q(env.DB,"SELECT * FROM gates ORDER BY id") }));
  router.add("POST", "/api/admin/gates", async (req, env) => {
    const b = await req.json().catch(()=>null); if (!b?.name) return bad("name required");
    const id = await qi(env.DB, "INSERT INTO gates (name) VALUES (?)", b.name);
    return json({ ok:true, id });
  });
}
