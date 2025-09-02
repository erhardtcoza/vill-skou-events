// /src/routes/public.js
import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";

export function mountPublic(router) {
  // NEW: list active events for landing page
  router.add("GET", "/api/public/events", async (req, env) => {
    const rows = await env.DB
      .prepare("SELECT id, slug, name, venue, starts_at, ends_at, status FROM events WHERE status='active' ORDER BY starts_at ASC")
      .all();
    return json({ ok: true, events: rows.results || [] });
  });

  // Existing endpoints …
  router.add("GET", "/api/public/events/:slug", async (req, env, ctx, { slug }) => {
    const event = await getEventBySlug(env.DB, slug);
    if (!event) return bad("Event not found", 404);
    const cat = await getCatalog(env.DB, event.id);
    return json({ ok: true, ...cat });
  });

  router.add("POST", "/api/public/checkout", async (req, env) => {
    const body = await req.json().catch(() => null);
    if (!body?.event_id || !Array.isArray(body.items)) return bad("Invalid request");
    const { createOnlineOrder } = await import("../services/orders.js"); // lazy import
    const result = await createOnlineOrder(env.DB, env.HMAC_SECRET, body);
    return json({ ok: true, ...result });
  });
}
