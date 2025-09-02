// /src/routes/public.js
import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";

export function mountPublic(router) {
  // List active events for landing page (poster_url included)
  router.add("GET", "/api/public/events", async (_req, env) => {
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

  // Public site settings (read-only)
  router.add("GET", "/api/public/settings", async (_req, env) => {
    const allowed = ["site_title", "logo_url", "favicon_url"];
    const rows = await env.DB
      .prepare(
        `SELECT key, value FROM settings WHERE key IN (${allowed
          .map(() => "?")
          .join(",")})`
      )
      .bind(...allowed)
      .all();

    const s = {};
    for (const r of rows.results || []) s[r.key] = r.value;
    if (!s.site_title) s.site_title = "Villiersdorp Skou — Tickets";
    return json({ ok: true, settings: s });
  });

  // Event catalog by slug
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const event = await getEventBySlug(env.DB, slug);
    if (!event) return bad("Event not found", 404);
    const cat = await getCatalog(env.DB, event.id);
    return json({ ok: true, ...cat, event });
  });

  // Checkout (server-side guard for closed/inactive; enforce DB prices)
  router.add("POST", "/api/public/checkout", async (req, env) => {
    const body = await req.json().catch(() => null);
    if (!body?.event_id || !Array.isArray(body.items) || body.items.length === 0) {
      return bad("Invalid request");
    }

    // 1) Validate event
    const evt = await env.DB
      .prepare("SELECT id, ends_at, status FROM events WHERE id=?")
      .bind(Number(body.event_id))
      .first();
    if (!evt) return bad("Event not found", 404);

    const now = Math.floor(Date.now() / 1000);
    if (evt.status !== "active" || (evt.ends_at || 0) < now) {
      return bad("Event closed", 400);
    }

    // 2) Sanitize items
    let items = body.items
      .filter((it) => Number(it?.ticket_type_id) > 0 && Number(it?.qty) > 0)
      .map((it) => ({
        ticket_type_id: Number(it.ticket_type_id),
        qty: Number(it.qty),
      }));
    if (items.length === 0) return bad("Invalid request: no valid items");

    // 3) Enforce ticket type ownership + server-side price
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
        price_cents: priceMap.get(i.ticket_type_id) || 0,
      }));
    if (items.length === 0) return bad("Invalid items for this event");

    // 4) Create order
    const { createOnlineOrder } = await import("../services/orders.js");
    const result = await createOnlineOrder(env.DB, env.HMAC_SECRET, {
      ...body,
      items,
      event_id: evt.id,
    });

    return json({ ok: true, ...result });
  });
}
