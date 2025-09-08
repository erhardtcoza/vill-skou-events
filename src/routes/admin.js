// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin API */
export function mountAdmin(router) {
  /* ---------------- Events ---------------- */

  // List events (used by Admin UI)
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC, id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  // Ticket types for an event
  router.add("GET", "/api/admin/events/:eventId/ticket-types", requireRole("admin", async (_req, env, _ctx, p) => {
    const id = Number(p.eventId || 0);
    if (!id) return bad("eventId required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(id).all();
    return json({ ok: true, ticket_types: q.results || [] });
  }));

  /* ---------------- Tickets / Reporting ---------------- */

  // Summary per ticket_type + states for an event
  router.add("GET", "/api/admin/tickets/summary", requireRole("admin", async (req, env) => {
    const url = new URL(req.url);
    const eventId = Number(url.searchParams.get("event_id") || 0);
    if (!eventId) return bad("event_id required");

    // Totals sold by ticket_type (count tickets), and states
    const byType = await env.DB.prepare(
      `SELECT tt.id AS ticket_type_id, tt.name,
              COUNT(t.id) AS issued
         FROM ticket_types tt
    LEFT JOIN tickets t ON t.ticket_type_id = tt.id
        WHERE tt.event_id = ?1
     GROUP BY tt.id, tt.name
     ORDER BY tt.id ASC`
    ).bind(eventId).all();

    const byState = await env.DB.prepare(
      `SELECT state, COUNT(*) AS n
         FROM tickets
        WHERE event_id = ?1
     GROUP BY state`
    ).bind(eventId).all();

    // Order counts + revenue (paid only)
    const ordersAgg = await env.DB.prepare(
      `SELECT status,
              SUM(total_cents) AS total_cents,
              COUNT(*) AS n
         FROM orders
        WHERE event_id = ?1
     GROUP BY status`
    ).bind(eventId).all();

    return json({
      ok: true,
      by_type: byType.results || [],
      by_state: byState.results || [],
      orders: ordersAgg.results || []
    });
  }));

  // Quick order lookup by short code (Admin UI button)
  router.add("GET", "/api/admin/order/by-code/:code", requireRole("admin", async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("code required");
    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, payment_method, total_cents,
              buyer_name, buyer_email, buyer_phone, created_at, paid_at
         FROM orders
        WHERE UPPER(short_code) = UPPER(?1)
        LIMIT 1`
    ).bind(code).first();

    if (!o) return bad("Order not found", 404);

    const items = await env.DB.prepare(
      `SELECT oi.id, oi.ticket_type_id, oi.qty, oi.price_cents, tt.name as ticket_type_name
         FROM order_items oi
         JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        WHERE oi.order_id = ?1
        ORDER BY oi.id ASC`
    ).bind(o.id).all();

    // Tickets issued under this order
    const tix = await env.DB.prepare(
      `SELECT id, qr, state, attendee_first, attendee_last, ticket_type_id
         FROM tickets
        WHERE order_id = ?1
        ORDER BY id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, items: items.results || [], tickets: tix.results || [] });
  }));

  /* ---------------- POS Admin ---------------- */

  // POS sessions with totals (cash/card) derived from pos_payments
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    // base sessions
    const s = await env.DB.prepare(
      `SELECT ps.id, ps.event_id, ps.cashier_name, ps.cashier_msisdn, ps.gate_id,
              ps.opening_float_cents, ps.opened_at, ps.closed_at, ps.closing_manager
         FROM pos_sessions ps
        ORDER BY ps.id DESC
        LIMIT 200`
    ).all();
    const sessions = s.results || [];
    if (!sessions.length) return json({ ok: true, sessions: [] });

    // map session_id -> {cash, card}
    const pay = await env.DB.prepare(
      `SELECT session_id,
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
         FROM pos_payments
        WHERE session_id IN (${sessions.map(x => x.id).join(",")})
     GROUP BY session_id`
    ).all();
    const totals = new Map((pay.results || []).map(r => [r.session_id, r]));

    // join gate name for display
    const gates = await env.DB.prepare(`SELECT id, name FROM gates`).all();
    const gateMap = new Map((gates.results || []).map(r => [r.id, r.name]));

    const out = sessions.map(sx => {
      const t = totals.get(sx.id) || { cash_cents: 0, card_cents: 0 };
      return {
        ...sx,
        gate_name: gateMap.get(sx.gate_id) || `#${sx.gate_id}`,
        cash_cents: Number(t.cash_cents || 0),
        card_cents: Number(t.card_cents || 0)
      };
    });

    return json({ ok: true, sessions: out });
  }));

  /* ---------------- Vendors ---------------- */

  // List vendors for an event
  router.add("GET", "/api/admin/vendors", requireRole("admin", async (req, env) => {
    const url = new URL(req.url);
    const eventId = Number(url.searchParams.get("event_id") || 0);
    if (!eventId) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email,
              stand_number, staff_quota, vehicle_quota
         FROM vendors
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(eventId).all();
    return json({ ok: true, vendors: q.results || [] });
  }));

  // (NEW) List vendor passes for a vendor (used to render Badge links)
  router.add("GET", "/api/admin/vendor-passes", requireRole("admin", async (req, env) => {
    const url = new URL(req.url);
    const vendorId = Number(url.searchParams.get("vendor_id") || 0);
    if (!vendorId) return bad("vendor_id required");
    const q = await env.DB.prepare(
      `SELECT id, vendor_id, type, label, vehicle_reg, qr, state, issued_at, first_in_at, last_out_at
         FROM vendor_passes
        WHERE vendor_id = ?1
        ORDER BY id ASC`
    ).bind(vendorId).all();
    return json({ ok: true, passes: q.results || [] });
  }));

  /* ---------------- Users ---------------- */

  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role
         FROM users
        ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));
}
