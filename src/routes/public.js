// /src/routes/public.js
import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";

export function mountPublic(router) {
  // List active events for landing page (include images for cards)
  router.add("GET", "/api/public/events", async (_req, env) => {
    try {
      const rows = await env.DB
        .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status,
                         hero_url, poster_url, NULLIF(gallery_urls,'') AS gallery_urls
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

  // Ticket lookup by QR payload (your tickets table uses `qr` as the unique code)
  router.add("GET", "/api/public/tickets/:qr", async (_req, env, _ctx, { qr }) => {
    try {
      // Find ticket by QR (case-insensitive just in case)
      const t = await env.DB.prepare(
        `SELECT id, order_id, event_id, ticket_type_id,
                attendee_first, attendee_last, gender, email, phone,
                qr, state, first_in_at, last_out_at, issued_at
         FROM tickets
         WHERE LOWER(qr) = LOWER(?1)`
      ).bind(qr).first();

      if (!t) return bad("Ticket not found", 404);

      // Ticket type (name + price)
      const tt = await env.DB.prepare(
        `SELECT id, name, price_cents FROM ticket_types WHERE id = ?1`
      ).bind(t.ticket_type_id).first();

      // Order (parse contact_json into friendly fields)
      const ordRow = await env.DB.prepare(
        `SELECT id, short_code, contact_json, event_id
           FROM orders WHERE id = ?1`
      ).bind(t.order_id).first();

      let order = null;
      if (ordRow) {
        let contact = {};
        try { contact = JSON.parse(ordRow.contact_json || "{}"); } catch {}
        order = {
          id: ordRow.id,
          short_code: ordRow.short_code,
          event_id: ordRow.event_id,
          buyer_name: contact.first_name && contact.last_name
            ? `${contact.first_name} ${contact.last_name}`.trim()
            : (contact.name || contact.first_name || "") || null,
          buyer_email: contact.email || null,
          buyer_phone: contact.phone || null,
        };
      }

      // Event
      const ev = await env.DB.prepare(
        `SELECT id, slug, name, venue, starts_at, ends_at, hero_url
           FROM events WHERE id = ?1`
      ).bind(t.event_id).first();

      // Shape response to what the UI expects
      const holder_name = [t.attendee_first, t.attendee_last].filter(Boolean).join(" ").trim() || null;

      const ticket = {
        id: t.id,
        qr: t.qr,
        code: t.qr,          // alias for UI
        state: t.state,
        ticket_type_id: t.ticket_type_id,
        order_id: t.order_id,
        attendee_first: t.attendee_first,
        attendee_last: t.attendee_last,
        gender: t.gender,
        email: t.email,
        phone: t.phone,
        first_in_at: t.first_in_at,
        last_out_at: t.last_out_at,
        issued_at: t.issued_at,
        holder_name,        // convenience for UI
        // gate_name / serial / scan_payload not in schema; omit or add later when available
      };

      return json({ ok: true, ticket, ticket_type: tt || null, order, event: ev || null });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
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
