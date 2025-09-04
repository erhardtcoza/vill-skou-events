// /src/routes/public.js
import { json, bad } from "../utils/http.js";

/** Public-facing endpoints (shop/checkout, event catalog) */
export function mountPublic(router) {

  // ---- List active events (minimal fields used on landing page)
  router.add("GET", "/api/public/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE status = 'active'
        ORDER BY starts_at ASC`
    ).all();

    return json({
      ok: true,
      events: (q.results || []).map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        venue: r.venue,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
        hero_url: r.hero_url,
        poster_url: r.poster_url,
        gallery_urls: r.gallery_urls
      }))
    });
  });

  // ---- Event detail (used by /shop/:slug and /shop/:slug/checkout)
  //      Returns the event + its ticket_types so the UI can price lines.
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const evQ = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE slug = ?1
        LIMIT 1`
    ).bind(slug).all();

    const ev = (evQ.results || [])[0];
    if (!ev) return new Response(JSON.stringify({ ok:false, error:"Not found" }), {
      status: 404, headers: { "content-type": "application/json" }
    });

    // ticket types for this event
    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(ev.id).all();

    const ticket_types = (ttQ.results || []).map(r => ({
      id: Number(r.id),
      name: r.name,
      price_cents: Number(r.price_cents || 0),
      capacity: Number(r.capacity || 0),
      per_order_limit: Number(r.per_order_limit || 0),
      requires_gender: Number(r.requires_gender || 0) ? 1 : 0
    }));

    return json({
      ok: true,
      event: {
        id: ev.id,
        slug: ev.slug,
        name: ev.name,
        venue: ev.venue,
        starts_at: ev.starts_at,
        ends_at: ev.ends_at,
        status: ev.status,
        hero_url: ev.hero_url,
        poster_url: ev.poster_url,
        gallery_urls: ev.gallery_urls
      },
      ticket_types
    });
  });

  // ---- Create order (called by Checkout “Pay now” / “Pay at event”)
  // Body: {
  //   event_id: number,
  //   buyer_name: string, email: string, phone: string,
  //   items: [{ ticket_type_id, qty }],
  //   method: "pay_now" | "pay_at_event"
  // }
  router.add("POST", "/api/public/orders/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const event_id = Number(b?.event_id || 0);
    const items = Array.isArray(b?.items) ? b.items : [];
    const buyer_name = String(b?.buyer_name || "").trim();
    const buyer_email = String(b?.email || "").trim();
    const buyer_phone = String(b?.phone || "").trim();
    const method = b?.method === "pay_now" ? "online_yoco" : "pos_cash"; // “pay at event” placeholder

    if (!event_id) return bad("event_id required");
    if (!items.length) return bad("items required");
    if (!buyer_name) return bad("buyer_name required");

    // Validate ticket types & compute totals
    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, per_order_limit
         FROM ticket_types WHERE event_id = ?1`
    ).bind(event_id).all();

    const ttMap = new Map((ttQ.results || []).map(r => [Number(r.id), r]));

    let total_cents = 0;
    const order_items = [];

    for (const row of items) {
      const tid = Number(row?.ticket_type_id || 0);
      const qty = Math.max(0, Number(row?.qty || 0));
      if (!tid || !qty) continue;

      const tt = ttMap.get(tid);
      if (!tt) return bad(`Unknown ticket_type_id ${tid}`);

      const limit = Number(tt.per_order_limit || 0);
      if (limit && qty > limit) return bad(`Exceeded per-order limit for ${tt.name}`);

      const unit = Number(tt.price_cents || 0);
      const line = qty * unit;
      total_cents += line;

      order_items.push({ ticket_type_id: tid, qty, price_cents: unit });
    }

    if (!order_items.length) return bad("No valid items");

    const now = Math.floor(Date.now() / 1000);
    const short_code = ("T" + Math.random().toString(36).slice(2, 8)).toUpperCase();

    const contact_json = JSON.stringify({
      name: buyer_name,
      email: buyer_email,
      phone: buyer_phone
    });
    const items_json = JSON.stringify(order_items);

    // Insert order
    const r = await env.DB.prepare(
      `INSERT INTO orders
         (short_code, event_id, status, payment_method, total_cents, contact_json,
          created_at, buyer_name, buyer_email, buyer_phone, items_json)
       VALUES (?1, ?2, 'awaiting_payment', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(
      short_code, event_id, method, total_cents, contact_json, now,
      buyer_name, buyer_email, buyer_phone, items_json
    ).run();

    const order_id = r.meta.last_row_id;

    // Insert order_items rows
    for (const it of order_items) {
      await env.DB.prepare(
        `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(order_id, it.ticket_type_id, it.qty, it.price_cents).run();
    }

    // Respond
    return json({
      ok: true,
      order: {
        id: order_id,
        short_code,
        event_id,
        status: "awaiting_payment",
        payment_method: method,
        total_cents,
        buyer_name, buyer_email, buyer_phone,
        items: order_items
      }
    });
  });

}
