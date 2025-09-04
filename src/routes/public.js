// /src/routes/public.js
import { json, bad } from "../utils/http.js";

/**
 * Public API
 *  - GET  /api/public/events                 ← list (used by landing)
 *  - GET  /api/public/events/:slug
 *  - GET  /api/public/events/:slug/ticket-types
 *  - POST /api/public/orders/create          ← safe stub
 */
export function mountPublic(router) {
  // LIST active/upcoming events for landing
  router.add("GET", "/api/public/events", async (_req, env) => {
    const now = Math.floor(Date.now() / 1000);
    const rows = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls
         FROM events
        WHERE status = 'active'
          AND ends_at >= ?1
        ORDER BY starts_at ASC
        LIMIT 50`
    ).bind(now).all();

    return json({ ok: true, events: rows.results || [] });
  });

  // Event by slug (detail + ticket types)
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const ev = await env.DB
      .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls
                  FROM events WHERE slug = ?1`)
      .bind(slug)
      .first();
    if (!ev) return bad("Event not found", 404);

    const tts = await env.DB
      .prepare(`SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
                  FROM ticket_types WHERE event_id = ?1 ORDER BY id ASC`)
      .bind(ev.id)
      .all();

    return json({ ok: true, event: ev, ticket_types: tts.results || [] });
  });

  // Ticket types only
  router.add("GET", "/api/public/events/:slug/ticket-types", async (_req, env, _ctx, { slug }) => {
    const ev = await env.DB.prepare(`SELECT id FROM events WHERE slug=?1`).bind(slug).first();
    if (!ev) return bad("Event not found", 404);
    const tts = await env.DB
      .prepare(`SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
                  FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`)
      .bind(ev.id)
      .all();
    return json({ ok: true, ticket_types: tts.results || [] });
  });

  /**
   * Create public order (stub)
   * Body: {
   *   event_id: number,
   *   buyer_name: string, buyer_surname?: string,
   *   email?: string, phone?: string,
   *   items: [{ ticket_type_id:number, qty:number }...],
   *   method: "pay_event" | "pay_now"
   * }
   *
   * NOTE: This returns a priced dummy order so the UI flow works.
   * Replace with real inserts once orders schema is confirmed.
   */
  router.add("POST", "/api/public/orders/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const event_id = Number(b?.event_id || 0);
    const items = Array.isArray(b?.items) ? b.items : [];
    const method = (b?.method === "pay_now") ? "pay_now" : "pay_event";
    const buyer_name = String(b?.buyer_name || "").trim();
    const buyer_surname = String(b?.buyer_surname || "").trim();
    const email = String(b?.email || "").trim();
    const phone = String(b?.phone || "").trim();

    if (!event_id) return bad("event_id required");
    if (!items.length) return bad("items required");
    if (!buyer_name) return bad("buyer_name required");

    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, per_order_limit
         FROM ticket_types WHERE event_id = ?1`
    ).bind(event_id).all();
    const ttMap = new Map((ttQ.results || []).map(r => [Number(r.id), r]));

    let total_cents = 0;
    const lines = [];
    for (const row of items) {
      const tid = Number(row.ticket_type_id || 0);
      const qty = Math.max(0, Number(row.qty || 0));
      if (!tid || !qty) continue;
      const tt = ttMap.get(tid);
      if (!tt) return bad(`Unknown ticket_type_id ${tid}`);
      if (tt.per_order_limit && qty > Number(tt.per_order_limit)) {
        return bad(`Exceeded per-order limit for ${tt.name}`);
      }
      const line = qty * Number(tt.price_cents || 0);
      total_cents += line;
      lines.push({
        ticket_type_id: tid,
        name: tt.name,
        qty,
        price_cents: Number(tt.price_cents || 0),
        line_cents: line
      });
    }
    if (!lines.length) return bad("No valid items");

    const short_code = ("T" + Math.random().toString(36).slice(2, 8)).toUpperCase();
    return json({
      ok: true,
      order: {
        id: 0,
        event_id,
        short_code,
        total_cents,
        method,
        buyer_name, buyer_surname, email, phone,
        items: lines
      }
    });
  });
}
