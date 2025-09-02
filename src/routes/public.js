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