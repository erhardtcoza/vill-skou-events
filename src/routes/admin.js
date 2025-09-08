// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import { sendOrderOnWhatsApp } from "../services/whatsapp.js";

/** Admin API */
export function mountAdmin(router) {
  /* ---------------- Events (list + detail + ticket types) --------- */
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC, id DESC`
    ).all();
    return json({ ok:true, events: q.results || [] });
  }));

  router.add("GET", "/api/admin/events/:id", requireRole("admin", async (_req, env, _ctx, p) => {
    const id = Number(p.id || 0);
    if (!id) return bad("invalid id");

    const evQ = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events WHERE id=?1`
    ).bind(id).all();
    const ev = (evQ.results || [])[0];
    if (!ev) return bad("not found", 404);

    const ttQ = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
    ).bind(id).all();

    return json({ ok:true, event: ev, ticket_types: ttQ.results || [] });
  }));

  /* ---------------- Ticket dashboard helpers ---------------------- */
  // Count tickets by state for an event
  router.add("GET", "/api/admin/tickets/summary/:eventId", requireRole("admin", async (_req, env, _ctx, p) => {
    const eventId = Number(p.eventId || 0);
    if (!eventId) return bad("eventId required");

    const statsQ = await env.DB.prepare(
      `SELECT
          SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END) AS unused,
          SUM(CASE WHEN state='in'     THEN 1 ELSE 0 END) AS in,
          SUM(CASE WHEN state='out'    THEN 1 ELSE 0 END) AS out,
          SUM(CASE WHEN state='void'   THEN 1 ELSE 0 END) AS void,
          COUNT(*) AS total
         FROM tickets
        WHERE event_id=?1`
    ).bind(eventId).all();

    const row = (statsQ.results || [])[0] || {};
    return json({ ok:true, summary: {
      total: Number(row.total || 0),
      unused: Number(row.unused || 0),
      in: Number(row.in || 0),
      out: Number(row.out || 0),
      void: Number(row.void || 0),
    }});
  }));

  // Lookup order by short_code (for admin ticket actions)
  router.add("GET", "/api/admin/orders/by-code/:code", requireRole("admin", async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("code required");

    const oQ = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, payment_method, total_cents,
              buyer_name, buyer_email, buyer_phone, created_at, paid_at
         FROM orders
        WHERE UPPER(short_code) = UPPER(?1)
        LIMIT 1`
    ).bind(code).all();

    const order = (oQ.results || [])[0];
    if (!order) return bad("not found", 404);

    const tQ = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(order.id).all();

    return json({ ok:true, order, tickets: tQ.results || [] });
  }));

  // Send order via WhatsApp (uses services/whatsapp.js → sendOrderOnWhatsApp)
  router.add("POST", "/api/admin/orders/send-wa", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const code = String(b?.code || "").trim();
    const to = String(b?.to || "").trim(); // E.164 "2771…"
    if (!code) return bad("code required");

    const oQ = await env.DB.prepare(
      `SELECT id, short_code, event_id, total_cents, buyer_name, buyer_phone
         FROM orders
        WHERE UPPER(short_code) = UPPER(?1)
        LIMIT 1`
    ).bind(code).all();
    const order = (oQ.results || [])[0];
    if (!order) return bad("order not found", 404);

    const msisdn = to || (order.buyer_phone || "").trim();
    if (!msisdn) return bad("phone required");

    // Optionally include slug for deep-link
    const eQ = await env.DB.prepare(`SELECT slug FROM events WHERE id=?1 LIMIT 1`).bind(order.event_id).all();
    const ev = (eQ.results || [])[0];
    const payload = {
      short_code: order.short_code,
      id: order.id,
      event_slug: ev?.slug,
      total_cents: order.total_cents
    };

    try {
      const r = await sendOrderOnWhatsApp(env, msisdn, payload);
      return json({ ok:true, wa: r });
    } catch (e) {
      return bad(String(e), 500);
    }
  }));

  /* ---------------- Vendors: list + save + delete ----------------- */
  router.add("GET", "/api/admin/vendors/:eventId", requireRole("admin", async (_req, env, _ctx, p) => {
    const eventId = Number(p.eventId || 0);
    if (!eventId) return bad("eventId required");

    const vQ = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email,
              stand_number, staff_quota, vehicle_quota
         FROM vendors
        WHERE event_id=?1
        ORDER BY name ASC`
    ).bind(eventId).all();

    return json({ ok:true, vendors: vQ.results || [] });
  }));

  // upsert vendor
  router.add("POST", "/api/admin/vendors/save", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }

    const id = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    const name = String(b?.name || "").trim();
    const contact_name = String(b?.contact_name || "").trim();
    const phone = String(b?.phone || "").trim();
    const email = String(b?.email || "").trim();
    const stand_number = String(b?.stand_number || "").trim();
    const staff_quota = Math.max(0, Number(b?.staff_quota || 0));
    const vehicle_quota = Math.max(0, Number(b?.vehicle_quota || 0));

    if (!event_id) return bad("event_id required");
    if (!name) return bad("name required");

    if (id) {
      await env.DB.prepare(
        `UPDATE vendors
            SET name=?1, contact_name=?2, phone=?3, email=?4,
                stand_number=?5, staff_quota=?6, vehicle_quota=?7
          WHERE id=?8`
      ).bind(name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota, id).run();
      return json({ ok:true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota).run();
      return json({ ok:true, id: r.meta.last_row_id });
    }
  }));

  router.add("POST", "/api/admin/vendors/delete", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const id = Number(b?.id || 0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM vendors WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));

  /* ---------------- POS admin summaries (sessions) ---------------- */
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    // sessions + totals from pos_payments (card/cash)
    const sQ = await env.DB.prepare(
      `SELECT s.id, s.event_id, s.cashier_name, s.gate_id,
              s.opened_at, s.closed_at, s.opening_float_cents,
              s.closing_manager
         FROM pos_sessions s
        ORDER BY s.id DESC
        LIMIT 200`
    ).all();
    const sessions = sQ.results || [];
    if (!sessions.length) return json({ ok:true, sessions: [] });

    const ids = sessions.map(s => s.id).join(",");
    const payQ = await env.DB.prepare(
      `SELECT session_id,
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
         FROM pos_payments
        WHERE session_id IN (${ids})
        GROUP BY session_id`
    ).all();

    const map = new Map((payQ.results || []).map(r => [r.session_id, r]));
    const decorated = sessions.map(s => {
      const m = map.get(s.id) || {};
      return {
        ...s,
        cash_cents: Number(m.cash_cents || 0),
        card_cents: Number(m.card_cents || 0),
      };
    });
    return json({ ok:true, sessions: decorated });
  }));

  /* ---------------- Users (read-only list for now) ---------------- */
  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const uQ = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok:true, users: uQ.results || [] });
  }));
}
