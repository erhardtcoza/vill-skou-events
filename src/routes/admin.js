// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import { sendOrderOnWhatsApp } from "../services/whatsapp.js"; 

export function mountAdmin(router) {
  /* ---------------- Events ---------------- */
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  router.add("GET", "/api/admin/events/:id/ticket-types", requireRole("admin", async (_req, env, _ctx, p) => {
    const q = await env.DB.prepare(
      `SELECT id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
    ).bind(Number(p.id)).all();
    return json({ ok: true, ticket_types: q.results || [] });
  }));

  /* ---------------- Users ---------------- */
  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));

  /* ---------------- Vendors ---------------- */
  router.add("GET", "/api/admin/vendors/:eventId", requireRole("admin", async (_req, env, _ctx, p) => {
    const evId = Number(p.eventId || 0);
    const v = await env.DB.prepare(
      `SELECT id, name, contact_name, phone, email, stand_number,
              staff_quota, vehicle_quota
         FROM vendors WHERE event_id=?1 ORDER BY name ASC`
    ).bind(evId).all();
    return json({ ok: true, vendors: v.results || [] });
  }));

  router.add("POST", "/api/admin/vendors/upsert", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    const name = String(b?.name || "").trim();
    const contact_name = String(b?.contact_name || "").trim();
    const phone = String(b?.phone || "").trim();
    const email = String(b?.email || "").trim();
    const stand_number = String(b?.stand_number || "").trim();
    const staff_quota = Math.max(0, Number(b?.staff_quota || 0));
    const vehicle_quota = Math.max(0, Number(b?.vehicle_quota || 0));
    if (!event_id || !name) return bad("event_id and name required");

    if (id) {
      await env.DB.prepare(
        `UPDATE vendors
            SET name=?1, contact_name=?2, phone=?3, email=?4, stand_number=?5,
                staff_quota=?6, vehicle_quota=?7
          WHERE id=?8`
      ).bind(name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota, id).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  /* ---------------- Tickets lookup by order code ---------------- */
  router.add("GET", "/api/admin/orders/lookup/:code", requireRole("admin", async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    const ordQ = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, payment_method, total_cents,
              buyer_name, buyer_email, buyer_phone, created_at, paid_at
         FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
    ).bind(code).all();
    const o = (ordQ.results || [])[0];
    if (!o) return bad("Order not found", 404);

    const tQ = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE t.order_id=?1 ORDER BY t.id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, tickets: tQ.results || [] });
  }));

  /* ---------------- POS Admin: sessions & cashups ---------------- */

  // Sessions list with computed totals from pos_payments
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    const sQ = await env.DB.prepare(
      `SELECT id, event_id, cashier_name, cashier_msisdn, gate_id,
              opening_float_cents, opened_at, closed_at, closing_manager
         FROM pos_sessions
        ORDER BY id DESC LIMIT 200`
    ).all();
    const sessions = sQ.results || [];

    // Map totals
    const ids = sessions.map(s => s.id);
    let totals = new Map();
    if (ids.length) {
      const inClause = ids.map(()=>"?").join(",");
      const pQ = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments
          WHERE session_id IN (${inClause})
          GROUP BY session_id`
      ).bind(...ids).all();
      (pQ.results || []).forEach(r => {
        totals.set(r.session_id, {
          cash_cents: Number(r.cash_cents || 0),
          card_cents: Number(r.card_cents || 0),
        });
      });
    }

    // attach totals
    const out = sessions.map(s => ({
      ...s,
      cash_cents: totals.get(s.id)?.cash_cents || 0,
      card_cents: totals.get(s.id)?.card_cents || 0
    }));
    return json({ ok: true, sessions: out });
  }));

  // Materialize a cashup when closing a session
  router.add("POST", "/api/admin/pos/cashup/create", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const session_id = Number(b?.session_id || 0);
    const manager_id = Number(b?.manager_id || 0);
    const notes = String(b?.notes || "").trim();
    if (!session_id || !manager_id) return bad("session_id and manager_id required");

    // read session
    const sQ = await env.DB.prepare(
      `SELECT id, gate_id, opening_float_cents
         FROM pos_sessions WHERE id=?1 LIMIT 1`
    ).bind(session_id).all();
    const s = (sQ.results || [])[0];
    if (!s) return bad("Session not found", 404);

    // totals
    const tQ = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
         SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
       FROM pos_payments WHERE session_id=?1`
    ).bind(session_id).all();
    const t = (tQ.results || [])[0] || {};
    const cashTaken = Number(t.cash_cents || 0);
    const cardTaken = Number(t.card_cents || 0);

    // Create cashup row
    const ins = await env.DB.prepare(
      `INSERT INTO cashups
         (gate_id, manager_id, opened_at, closed_at,
          opening_float_cents, cash_taken_cents, card_taken_cents,
          expected_cash_cents, notes)
       VALUES (?1, ?2, unixepoch(), unixepoch(),
               ?3, ?4, ?5, ?6, ?7)`
    ).bind(
      s.gate_id, manager_id, s.opening_float_cents,
      cashTaken, cardTaken, cashTaken + s.opening_float_cents, notes
    ).run();
    const cashup_id = ins.meta.last_row_id;

    // Link orders included in pos session (derive from pos_payments)
    const ords = await env.DB.prepare(
      `SELECT DISTINCT order_id FROM pos_payments WHERE session_id=?1`
    ).bind(session_id).all();
    for (const row of (ords.results || [])) {
      await env.DB.prepare(
        `INSERT INTO cashup_orders (cashup_id, order_id) VALUES (?1, ?2)`
      ).bind(cashup_id, row.order_id).run();
    }

    return json({ ok: true, cashup_id, totals: { cashTaken, cardTaken } });
  }));
}
