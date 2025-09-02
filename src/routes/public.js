// /src/routes/public.js
import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";

export function mountPublic(router) {
  // List active events for landing page (include images so cards can show them)
  router.add("GET", "/api/public/events", async (_req, env) => {
    try {
      const rows = await env.DB
        .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status,
                         hero_url, poster_url, gallery_urls
                  FROM events
                  WHERE status='active'
                  ORDER BY starts_at ASC`)
        .all();
      return json({ ok: true, events: rows.results || [] });
    } catch (e) {
      return json({ ok:false, error:String(e) }, 500);
    }
  });

  // Event + ticket catalog for the shop
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const event = await getEventBySlug(env.DB, slug);
    if (!event) return bad("Event not found", 404);
    const cat = await getCatalog(env.DB, event.id);
    return json({ ok: true, ...cat });
  });

  // Create an online order (unchanged here)
  router.add("POST", "/api/public/checkout", async (req, env) => {
    const body = await req.json().catch(() => null);
    if (!body?.event_id || !Array.isArray(body.items)) return bad("Invalid request");
    const { createOnlineOrder } = await import("../services/orders.js");
    const result = await createOnlineOrder(env.DB, env.HMAC_SECRET, body);
    return json({ ok: true, ...result });
  });
}
