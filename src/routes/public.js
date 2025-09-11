// /src/routes/public.js
import { json, bad } from "../utils/http.js";

/** Public-facing endpoints (shop/checkout, event catalog) */
export function mountPublic(router) {

  // ---- List active events (landing page)
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
        id: r.id, slug: r.slug, name: r.name, venue: r.venue,
        starts_at: r.starts_at, ends_at: r.ends_at, status: r.status,
        hero_url: r.hero_url, poster_url: r.poster_url, gallery_urls: r.gallery_urls
      }))
    });
  });

  // ---- Event detail (with ticket types)
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const evQ = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE slug = ?1
        LIMIT 1`
    ).bind(slug).all();

    const ev = (evQ.results || [])[0];
    if (!ev) return bad("Not found", 404);

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

    return json({ ok:true, event: ev, ticket_types });
  });

  // ---- Create order (checkout)
  router.add("POST", "/api/public/orders/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const event_id = Number(b?.event_id || 0);
    const items = Array.isArray(b?.items) ? b.items : [];
    const attendees = Array.isArray(b?.attendees) ? b.attendees : [];
    const buyer_name = String(b?.buyer_name || "").trim();
    const buyer_email = String(b?.email || "").trim();
    const buyer_phone = String(b?.phone || "").trim();
    const method = b?.method === "pay_now" ? "online_yoco" : "pos_cash";

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
      if (!tt) return bad("Unknown ticket_type_id " + tid);

      const limit = Number(tt.per_order_limit || 0);
      if (limit && qty > limit) return bad("Exceeded per-order limit for " + tt.name);

      const unit = Number(tt.price_cents || 0);
      total_cents += qty * unit;
      order_items.push({ ticket_type_id: tid, qty, price_cents: unit });
    }
    if (!order_items.length) return bad("No valid items");

    const now = Math.floor(Date.now()/1000);
    const short_code = ("C" + Math.random().toString(36).slice(2,8)).toUpperCase();

    const contact_json = JSON.stringify({ name: buyer_name, email: buyer_email, phone: buyer_phone });
    const items_json = JSON.stringify(order_items);

    // Insert order
    const r = await env.DB.prepare(
      `INSERT INTO orders
         (short_code, event_id, status, payment_method, total_cents, contact_json,
          created_at, buyer_name, buyer_email, buyer_phone, items_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(
      short_code, event_id,
      method === "online_yoco" ? "awaiting_payment" : "pending",
      method, total_cents, contact_json, now,
      buyer_name, buyer_email, buyer_phone, items_json
    ).run();

    const order_id = r.meta.last_row_id;

    // Build queues of attendee info by ticket_type_id (FIFO)
    const attQueues = new Map();
    for (const a of attendees){
      const tid = Number(a?.ticket_type_id||0);
      if (!tid) continue;
      const arr = attQueues.get(tid) || [];
      arr.push({
        first: String(a.attendee_first||"").trim(),
        last:  String(a.attendee_last||"").trim(),
        gender: (a.gender||"").toLowerCase(),
        phone: String(a.phone||"").trim()
      });
      attQueues.set(tid, arr);
    }

    // Insert order_items and tickets with optional attendee fields
    for (const it of order_items) {
      await env.DB.prepare(
        `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(order_id, it.ticket_type_id, it.qty, it.price_cents).run();

      const queue = attQueues.get(it.ticket_type_id) || [];
      for (let i = 0; i < it.qty; i++) {
        const qr = short_code + "-" + it.ticket_type_id + "-" + (Math.random().toString(36).slice(2,8)).toUpperCase();
        const a = queue.length ? queue.shift() : {first:"", last:"", gender:null, phone:null};

        await env.DB.prepare(
          `INSERT INTO tickets
             (order_id, event_id, ticket_type_id, attendee_first, attendee_last, gender, phone, qr, issued_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
        ).bind(
          order_id, event_id, it.ticket_type_id,
          a.first || null, a.last || null, (a.gender||null), (a.phone||null),
          qr, now
        ).run();
      }
    }

    return json({
      ok: true,
      order: {
        id: order_id, short_code, event_id,
        status: (method === "online_yoco" ? "awaiting_payment" : "pending"),
        payment_method: method, total_cents,
        buyer_name, buyer_email, buyer_phone,
        items: order_items
      }
    });
  });

  // ---- Public ticket lookup by order code
  router.add("GET", "/api/public/tickets/by-code/:code", async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const q = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, tt.price_cents,
              o.short_code
         FROM tickets t
         JOIN orders o ON o.id = t.order_id
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE UPPER(o.short_code) = ?1
        ORDER BY t.id ASC`
    ).bind(code).all();

    return json({ ok:true, tickets:q.results||[] });
  });
}
