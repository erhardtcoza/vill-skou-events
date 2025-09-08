// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin API */
export function mountAdmin(router) {
  const guard = (fn) => requireRole("admin", fn);

  /* -------------------- Events -------------------- */
  router.add("GET", "/api/admin/events", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  /* Ticket types for an event */
  router.add("GET", "/api/admin/events/:event_id/ticket-types",
    guard(async (_req, env, _ctx, p) => {
      const event_id = Number(p.event_id || 0);
      if (!event_id) return bad("event_id required");
      const q = await env.DB.prepare(
        `SELECT id, event_id, name, code, price_cents, capacity,
                per_order_limit, requires_gender
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(event_id).all();
      return json({ ok: true, types: q.results || [] });
    })
  );

  /* Create ticket type */
  router.add("POST", "/api/admin/ticket-types",
    guard(async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(b?.event_id || 0);
      const name = String(b?.name || "").trim();
      const price_cents = Math.max(0, Number(b?.price_cents || 0));
      const capacity = Math.max(0, Number(b?.capacity || 0));
      const code = (b?.code ?? null);
      const per_order_limit = Math.max(1, Number(b?.per_order_limit || 10));
      const requires_gender = Number(b?.requires_gender ? 1 : 0);
      if (!event_id) return bad("event_id required");
      if (!name) return bad("name required");

      const r = await env.DB.prepare(
        `INSERT INTO ticket_types
           (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(event_id, name, code, price_cents, capacity, per_order_limit, requires_gender).run();

      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  /* -------------------- Tickets summary & order lookup -------------------- */

  // per-type counts + grand totals (unused/in/out/void)
  router.add("GET", "/api/admin/tickets/summary",
    guard(async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      const typesQ = await env.DB.prepare(
        `SELECT id, name, price_cents FROM ticket_types WHERE event_id = ?1 ORDER BY id ASC`
      ).bind(event_id).all();
      const types = typesQ.results || [];

      const countsQ = await env.DB.prepare(
        `SELECT ticket_type_id,
                SUM(1) AS total,
                SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END) AS unused,
                SUM(CASE WHEN state='in' THEN 1 ELSE 0 END) AS in_count,
                SUM(CASE WHEN state='out' THEN 1 ELSE 0 END) AS out_count,
                SUM(CASE WHEN state='void' THEN 1 ELSE 0 END) AS void_count
           FROM tickets
          WHERE event_id = ?1
          GROUP BY ticket_type_id`
      ).bind(event_id).all();

      const byType = new Map();
      (countsQ.results || []).forEach(r => byType.set(r.ticket_type_id, r));

      const rows = types.map(t => {
        const c = byType.get(t.id) || {};
        return {
          id: t.id,
          name: t.name,
          price_cents: t.price_cents,
          total: Number(c.total || 0),
          unused: Number(c.unused || 0),
          in: Number(c.in_count || 0),
          out: Number(c.out_count || 0),
          void: Number(c.void_count || 0),
        };
      });

      const totals = rows.reduce((acc, r) => {
        acc.total += r.total; acc.unused += r.unused; acc.in += r.in; acc.out += r.out; acc.void += r.void;
        return acc;
      }, { total:0, unused:0, in:0, out:0, void:0 });

      return json({ ok: true, rows, totals });
    })
  );

  // order lookup by short_code (for the admin “Order lookup” box)
  router.add("GET", "/api/admin/order/by-code/:code",
    guard(async (_req, env, _ctx, p) => {
      const code = String(p.code || "").trim();
      if (!code) return bad("code required");

      const oQ = await env.DB.prepare(
        `SELECT id, short_code, event_id, status, total_cents
           FROM orders
          WHERE UPPER(short_code)=UPPER(?1)
          LIMIT 1`
      ).bind(code).all();
      const order = (oQ.results || [])[0];
      if (!order) return json({ ok: false, error: "Not Found" }, 404);

      // build the public ticket link (already wired in your index as /t/:code)
      const publicBase = (env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za").replace(/\/+$/,"");
      const link = `${publicBase}/t/${order.short_code}`;

      return json({ ok: true, order, link });
    })
  );

  /* -------------------- POS Admin: sessions list -------------------- */
  router.add("GET", "/api/admin/pos/sessions",
    guard(async (_req, env) => {
      // sessions
      const sQ = await env.DB.prepare(
        `SELECT s.id, s.cashier_name, s.gate_id, s.opened_at, s.closed_at, s.closing_manager,
                g.name AS gate_name
           FROM pos_sessions s
           LEFT JOIN gates g ON g.id = s.gate_id
          ORDER BY s.id DESC
          LIMIT 500`
      ).all();
      const sessions = sQ.results || [];

      // cash / card sums from pos_payments
      const sumsQ = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments
          GROUP BY session_id`
      ).all();
      const sums = new Map((sumsQ.results || []).map(r => [r.session_id, r]));

      const rows = sessions.map(s => {
        const sum = sums.get(s.id) || { cash_cents:0, card_cents:0 };
        return {
          id: s.id,
          cashier_name: s.cashier_name,
          gate_name: s.gate_name || (`#${s.gate_id}`),
          opened_at: s.opened_at,
          closed_at: s.closed_at,
          closing_manager: s.closing_manager || "",
          cash_cents: Number(sum.cash_cents || 0),
          card_cents: Number(sum.card_cents || 0),
        };
      });

      return json({ ok: true, rows });
    })
  );

  /* -------------------- Vendors -------------------- */
  // list vendors for an event
  router.add("GET", "/api/admin/vendors",
    guard(async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");
      const q = await env.DB.prepare(
        `SELECT id, event_id, name, contact_name, phone, email,
                stand_number, staff_quota, vehicle_quota
           FROM vendors
          WHERE event_id = ?1
          ORDER BY id DESC`
      ).bind(event_id).all();
      return json({ ok: true, vendors: q.results || [] });
    })
  );

  // create vendor
  router.add("POST", "/api/admin/vendors",
    guard(async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(b?.event_id || 0);
      const name = String(b?.name || "").trim();
      const contact_name = (b?.contact_name ?? null);
      const phone = (b?.phone ?? null);
      const email = (b?.email ?? null);
      const stand_number = (b?.stand_number ?? null);
      const staff_quota = Math.max(0, Number(b?.staff_quota || 0));
      const vehicle_quota = Math.max(0, Number(b?.vehicle_quota || 0));
      if (!event_id) return bad("event_id required");
      if (!name) return bad("name required");

      const r = await env.DB.prepare(
        `INSERT INTO vendors
          (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota).run();

      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  // list passes for a vendor
  router.add("GET", "/api/admin/vendor/:vendor_id/passes",
    guard(async (_req, env, _ctx, p) => {
      const vendor_id = Number(p.vendor_id || 0);
      if (!vendor_id) return bad("vendor_id required");
      const q = await env.DB.prepare(
        `SELECT id, type, label, vehicle_reg, qr, state, issued_at, first_in_at, last_out_at
           FROM vendor_passes
          WHERE vendor_id = ?1
          ORDER BY id DESC`
      ).bind(vendor_id).all();
      return json({ ok: true, passes: q.results || [] });
    })
  );

  // create vendor pass
  router.add("POST", "/api/admin/vendor/:vendor_id/passes",
    guard(async (req, env, _ctx, p) => {
      const vendor_id = Number(p.vendor_id || 0);
      if (!vendor_id) return bad("vendor_id required");
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const type = (b?.type === "vehicle") ? "vehicle" : "staff";
      const label = String(b?.label || "").trim() || null;
      const vehicle_reg = type === "vehicle" ? (String(b?.vehicle_reg || "").trim() || null) : null;
      const qr = String(b?.qr || "").trim() || crypto.randomUUID();

      const r = await env.DB.prepare(
        `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(vendor_id, type, label, vehicle_reg, qr).run();

      return json({ ok: true, id: r.meta.last_row_id, qr });
    })
  );

  /* -------------------- Users -------------------- */
  router.add("GET", "/api/admin/users",
    guard(async (_req, env) => {
      const q = await env.DB.prepare(
        `SELECT id, username, role FROM users ORDER BY id ASC`
      ).all();
      return json({ ok: true, users: q.results || [] });
    })
  );

  router.add("POST", "/api/admin/users",
    guard(async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const username = String(b?.username || "").trim();
      const role = String(b?.role || "").trim();
      if (!username) return bad("username required");
      if (!["admin","pos","scan"].includes(role)) return bad("invalid role");

      const r = await env.DB.prepare(
        `INSERT INTO users (username, role) VALUES (?1, ?2)`
      ).bind(username, role).run();

      return json({ ok: true, id: r.meta.last_row_id });
    })
  );
}
