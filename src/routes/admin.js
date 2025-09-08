// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin endpoints used by /admin UI */
export function mountAdmin(router) {
  /* ---------------- Events ---------------- */

  // List events (newest first)
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const q = await env.DB.prepare(
        `SELECT id, slug, name, venue, starts_at, ends_at, status
           FROM events
          ORDER BY id DESC`
      ).all();
      return json({ ok: true, events: q.results || [] });
    })
  );

  // Create event (minimal)
  router.add(
    "POST",
    "/api/admin/events",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const slug = String(b?.slug || "").trim();
      const name = String(b?.name || "").trim();
      const venue = String(b?.venue || "").trim();
      const starts_at = Number(b?.starts_at || 0);
      const ends_at = Number(b?.ends_at || 0);
      const status = String(b?.status || "draft").trim();

      if (!slug || !name || !starts_at || !ends_at) {
        return bad("slug, name, starts_at, ends_at required");
      }

      try {
        const r = await env.DB.prepare(
          `INSERT INTO events (slug, name, venue, starts_at, ends_at, status)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        ).bind(slug, name, venue, starts_at, ends_at, status).run();

        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return bad(String(e?.message || e || "insert failed"));
      }
    })
  );

  /* ---------------- Ticket types ---------------- */

  // List ticket types for an event
  router.add(
    "GET",
    "/api/admin/ticket-types",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      const q = await env.DB.prepare(
        `SELECT id, event_id, name, code, price_cents, capacity,
                per_order_limit, requires_gender
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(event_id).all();

      return json({ ok: true, ticket_types: q.results || [] });
    })
  );

  // Create a ticket type
  router.add(
    "POST",
    "/api/admin/ticket-types",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const event_id = Number(b?.event_id || 0);
      const name = String(b?.name || "").trim();
      const code = (b?.code == null ? null : String(b.code).trim());
      const price_cents = Number(b?.price_cents || 0);
      const capacity = Number(b?.capacity || 0);
      const per_order_limit = Number(b?.per_order_limit ?? 10);
      const requires_gender = Number(b?.requires_gender ? 1 : 0);

      if (!event_id || !name) return bad("event_id and name required");

      try {
        const r = await env.DB.prepare(
          `INSERT INTO ticket_types
             (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        ).bind(
          event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
        ).run();

        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return bad(String(e?.message || e || "insert failed"));
      }
    })
  );

  /* ---------------- POS admin ---------------- */

  // POS sessions with cash/card totals
  router.add(
    "GET",
    "/api/admin/pos/sessions",
    requireRole("admin", async (_req, env) => {
      // Base sessions
      const sessQ = await env.DB.prepare(
        `SELECT s.id, s.cashier_name, s.gate_id, s.opened_at, s.closed_at,
                s.opening_float_cents, s.closing_manager,
                g.name AS gate_name
           FROM pos_sessions s
      LEFT JOIN gates g ON g.id = s.gate_id
          ORDER BY s.id DESC`
      ).all();
      const sessions = sessQ.results || [];

      if (!sessions.length) return json({ ok: true, sessions: [] });

      // Totals by session
      const payQ = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments
          GROUP BY session_id`
      ).all();
      const totalsBySession = new Map((payQ.results || []).map(r => [r.session_id, r]));

      const withTotals = sessions.map(s => {
        const t = totalsBySession.get(s.id) || { cash_cents: 0, card_cents: 0 };
        return {
          ...s,
          cash_cents: Number(t.cash_cents || 0),
          card_cents: Number(t.card_cents || 0),
        };
      });

      return json({ ok: true, sessions: withTotals });
    })
  );

  /* ---------------- Tickets dashboard ---------------- */

  // Summary per ticket type for an event
  router.add(
    "GET",
    "/api/admin/tickets/summary",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      // Per type
      const perTypeQ = await env.DB.prepare(
        `SELECT tt.id AS ticket_type_id, tt.name AS type_name, tt.price_cents,
                SUM(1) AS total,
                SUM(CASE WHEN t.state='unused' THEN 1 ELSE 0 END) AS unused,
                SUM(CASE WHEN t.state='in' THEN 1 ELSE 0 END)     AS in_count,
                SUM(CASE WHEN t.state='out' THEN 1 ELSE 0 END)    AS out_count,
                SUM(CASE WHEN t.state='void' THEN 1 ELSE 0 END)   AS void_count
           FROM ticket_types tt
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id
                          AND t.event_id = tt.event_id
          WHERE tt.event_id = ?1
          GROUP BY tt.id
          ORDER BY tt.id ASC`
      ).bind(event_id).all();

      const per_type = perTypeQ.results || [];

      // Overall totals
      const totalQ = await env.DB.prepare(
        `SELECT
            COUNT(*)                                                   AS total,
            SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END)            AS unused,
            SUM(CASE WHEN state='in' THEN 1 ELSE 0 END)                AS in_count,
            SUM(CASE WHEN state='out' THEN 1 ELSE 0 END)               AS out_count,
            SUM(CASE WHEN state='void' THEN 1 ELSE 0 END)              AS void_count
           FROM tickets
          WHERE event_id = ?1`
      ).bind(event_id).all();

      const overall = (totalQ.results && totalQ.results[0]) || {
        total: 0, unused: 0, in_count: 0, out_count: 0, void_count: 0
      };

      return json({ ok: true, per_type, totals: overall });
    })
  );

  // Quick order lookup by short code (case-insensitive)
  router.add(
    "GET",
    "/api/admin/order/lookup/:code",
    requireRole("admin", async (_req, env, _ctx, p) => {
      const code = String(p.code || "").trim();
      if (!code) return bad("code required");

      const oQ = await env.DB.prepare(
        `SELECT id, short_code, event_id, status, total_cents
           FROM orders
          WHERE UPPER(short_code) = UPPER(?1)
          LIMIT 1`
      ).bind(code).all();

      if (!oQ.results || !oQ.results.length) {
        return json({ ok: false, found: false });
      }

      const order = oQ.results[0];
      const urlBase = (env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za").replace(/\/+$/, "");
      const ticket_url = `${urlBase}/t/${order.short_code}`;

      return json({ ok: true, found: true, order, ticket_url });
    })
  );

  /* ---------------- Vendors (read-only for now) ---------------- */

  // Vendors for an event
  router.add(
    "GET",
    "/api/admin/vendors",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      const q = await env.DB.prepare(
        `SELECT id, event_id, name, contact_name, phone, email,
                stand_number, staff_quota, vehicle_quota
           FROM vendors
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(event_id).all();

      return json({ ok: true, vendors: q.results || [] });
    })
  );

  // Passes for a vendor
  router.add(
    "GET",
    "/api/admin/vendor-passes",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const vendor_id = Number(url.searchParams.get("vendor_id") || 0);
      if (!vendor_id) return bad("vendor_id required");

      const q = await env.DB.prepare(
        `SELECT id, vendor_id, type, label, vehicle_reg, qr, state,
                first_in_at, last_out_at, issued_at
           FROM vendor_passes
          WHERE vendor_id = ?1
          ORDER BY id ASC`
      ).bind(vendor_id).all();

      return json({ ok: true, passes: q.results || [] });
    })
  );
}
