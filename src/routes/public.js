// /src/routes/public.js
import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";

export function mountPublic(router) {
  // List active events for landing page (includes poster_url for cards)
  router.add("GET", "/api/public/events", async (req, env) => {
    const rows = await env.DB
      .prepare(`
        SELECT id, slug, name, venue, starts_at, ends_at, status, poster_url
        FROM events
        WHERE status='active'
        ORDER BY starts_at ASC
      `)
      .all();
    return json({ ok: true, events: rows.results || [] });
  });

  // Public event catalog by slug (event + ticket types)
  router.add("GET", "/api/public/events/:slug", async (req, env, ctx, { slug }) => {
    const event = await getEventBySlug(env.DB, slug); // should return full row (incl. hero/poster/gallery if present)
    if (!event) return bad("Event not found", 404);
    const cat = await getCatalog(env.DB, event.id);
    // Ensure our response includes the event row
    return json({ ok: true, ...cat, event });
  });

  // Checkout (server-side guarded)
  router.add("POST", "/api/public/checkout", async (req, env) => {
    const body = await req.json().catch(() => null);
    if (!body?.event_id || !Array.isArray(body.items) || body.items.length === 0) {
      return bad("Invalid request");
    }

    // 1) Event must exist, be active, and not be in the past
    const evt = await env.DB
      .prepare("SELECT id, ends_at, status FROM events WHERE id=?")
      .bind(Number(body.event_id))
      .first();

    if (!evt) return bad("Event not found", 404);

    const now = Math.floor(Date.now() / 1000);
    if (evt.status !== "active" || (evt.ends_at || 0) < now) {
      return bad("Event closed", 400);
    }

    // 2) Sanitize items (qty > 0, numeric IDs)
    let items = body.items
      .filter((it) => Number(it?.ticket_type_id) > 0 && Number(it?.qty) > 0)
      .map((it) => ({
        ticket_type_id: Number(it.ticket_type_id),
        qty: Number(it.qty),
      }));

    if (items.length === 0) return bad("Invalid request: no valid items");

    // 3) Ensure all ticket types belong to this event and fetch server-side prices
    const ids = items.map((i) => i.ticket_type_id);
    const placeholders = ids.map(() => "?").join(",");
    const tt = await env.DB
      .prepare(
        `SELECT id, event_id, price_cents
         FROM ticket_types
         WHERE event_id=? AND id IN (${placeholders})`
      )
      .bind(evt.id, ...ids)
      .all();

    const rows = tt.results || [];
    const validIds = new Set(rows.map((r) => r.id));
    const priceMap = new Map(rows.map((r) => [r.id, r.price_cents || 0]));

    items = items
      .filter((i) => validIds.has(i.ticket_type_id))
      .map((i) => ({
        ticket_type_id: i.ticket_type_id,
        qty: i.qty,
        price_cents: priceMap.get(i.ticket_type_id) || 0, // trust DB price; 0 => FREE
      }));

    if (items.length === 0) return bad("Invalid items for this event");

    // 4) Create order
    const { createOnlineOrder } = await import("../services/orders.js"); // lazy import
    const result = await createOnlineOrder(env.DB, env.HMAC_SECRET, {
      ...body,
      items,
      event_id: evt.id, // force event_id to the validated one
    });

    return json({ ok: true, ...result });
  });
}
