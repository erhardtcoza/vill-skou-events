// /src/routes/public.js
import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";

export function mountPublic(router) {
  // List active events for landing page (include images for cards)
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
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Event + ticket catalog (no capacity filter)
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const event = await getEventBySlug(env.DB, slug);
    if (!event) return bad("Event not found", 404);
    const cat = await getCatalog(env.DB, event.id);
    return json({ ok: true, ...cat });
  });

// Ticket lookup (by code)
router.add("GET", "/api/public/tickets/:code", async (req, env, ctx, { code }) => {
  // Expect your DB has tickets with a unique code or serial and a relation to orders/events
  const t = await env.DB.prepare(
    `SELECT t.id, t.code, t.serial, t.holder_name, t.state, t.gate_name, t.scan_payload,
            t.ticket_type_id, t.order_id
     FROM tickets t WHERE t.code = ?1`
  ).bind(code).first();

  if (!t) return bad("Ticket not found", 404);

  const tt = await env.DB.prepare(
    `SELECT id, name, price_cents FROM ticket_types WHERE id = ?1`
  ).bind(t.ticket_type_id).first();

  const order = await env.DB.prepare(
    `SELECT id, short_code, buyer_name, buyer_email, buyer_phone, event_id
     FROM orders WHERE id = ?1`
  ).bind(t.order_id).first();

  const ev = order ? await env.DB.prepare(
    `SELECT id, slug, name, venue, starts_at, ends_at, hero_url FROM events WHERE id = ?1`
  ).bind(order.event_id).first() : null;

  return json({ ok:true, ticket:t, ticket_type:tt||null, order:order||null, event:ev||null });
});
  
  // Checkout: create order either pay-now (Yoco) or pay-later (pickup code)
  router.add("POST", "/api/public/checkout", async (req, env) => {
    const body = await req.json().catch(() => null);
    if (!body?.event_id || !Array.isArray(body.items)) return bad("Invalid request");

    const mode = body.mode === "pay_later" ? "pay_later" : "pay_now";
    const { createOrderPayNow, createOrderPayLater } = await import("../services/orders.js");

    try {
      if (mode === "pay_later") {
        const res = await createOrderPayLater(env.DB, body);
        return json({ ok: true, order_id: res.order_id, pickup_code: res.short_code });
      } else {
        const res = await createOrderPayNow(env.DB, body, env);
        // payment_url is a stub until Yoco Hosted Payments is plugged in
        return json({ ok: true, order_id: res.order_id, payment_url: res.payment_url });
      }
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}
