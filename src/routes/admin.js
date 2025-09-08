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


// 🔁 Replace your existing /api/admin/pos/sessions handler with this:
router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (req, env) => {
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from") || 0); // unix seconds (optional)
  const to   = Number(url.searchParams.get("to")   || 0); // unix seconds (optional)

  // Build a WHERE clause only if filters present
  const where = [];
  const bind = [];
  if (from) { where.push("s.opened_at >= ?"); bind.push(from); }
  if (to)   { where.push("s.opened_at <= ?"); bind.push(to); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Sum pos_payments for each session (cash & card)
  const q = await env.DB.prepare(
    `
    SELECT
      s.id,
      s.cashier_name,
      g.name AS gate_name,
      s.opened_at,
      s.closed_at,
      s.closing_manager,
      COALESCE(SUM(CASE WHEN p.method = 'pos_cash' THEN p.amount_cents END), 0) AS cash_cents,
      COALESCE(SUM(CASE WHEN p.method = 'pos_card' THEN p.amount_cents END), 0) AS card_cents
    FROM pos_sessions s
    JOIN gates g ON g.id = s.gate_id
    LEFT JOIN pos_payments p ON p.session_id = s.id
    ${whereSql}
    GROUP BY s.id
    ORDER BY s.id DESC
    `
  ).bind(...bind).all();

  const sessions = (q.results || []).map(r => ({
    id: Number(r.id),
    cashier_name: r.cashier_name,
    gate_name: r.gate_name,
    opened_at: Number(r.opened_at || 0),
    closed_at: r.closed_at ? Number(r.closed_at) : null,
    closing_manager: r.closing_manager || null,
    cash_cents: Number(r.cash_cents || 0),
    card_cents: Number(r.card_cents || 0),
  }));

  return json({ ok: true, sessions });
}));

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
