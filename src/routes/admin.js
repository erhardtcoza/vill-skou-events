// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin endpoints */
export function mountAdmin(router) {
  /* ---------------- Events (unchanged minimal list) ---------------- */
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  /* ---------------- Ticket types (list/create) -------------------- */
  router.add("GET", "/api/admin/events/:id/ticket-types", requireRole("admin", async (_req, env, _c, p) => {
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id = ? ORDER BY id ASC`
    ).bind(Number(p.id)).all();
    return json({ ok: true, types: q.results || [] });
  }));

  router.add("POST", "/api/admin/events/:id/ticket-types", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const name = String(b?.name || "").trim();
    const price_cents = Math.max(0, Number(b?.price_cents || 0));
    const capacity = Math.max(0, Number(b?.capacity || 0));
    const per_order_limit = Math.max(1, Number(b?.per_order_limit || 10));
    const requires_gender = Number(b?.requires_gender ? 1 : 0);
    if (!name) return bad("name required");
    await env.DB.prepare(
      `INSERT INTO ticket_types (event_id, name, price_cents, capacity, per_order_limit, requires_gender)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(Number(p.id), name, price_cents, capacity, per_order_limit, requires_gender).run();
    return json({ ok: true });
  }));

  /* ---------------- POS Admin: sessions with totals --------------- */
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    // Sessions base
    const sess = await env.DB.prepare(
      `SELECT s.id, s.cashier_name, s.gate_id, g.name AS gate_name,
              s.opened_at, s.closed_at, s.closing_manager, s.opening_float_cents
         FROM pos_sessions s
         LEFT JOIN gates g ON g.id = s.gate_id
         ORDER BY s.id DESC`
    ).all();
    const rows = (sess.results || []);

    // Totals per session
    const pay = await env.DB.prepare(
      `SELECT session_id,
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
         FROM pos_payments
         GROUP BY session_id`
    ).all();
    const bySess = new Map((pay.results || []).map(r => [r.session_id, r]));

    const out = rows.map(r => {
      const t = bySess.get(r.id) || { cash_cents: 0, card_cents: 0 };
      return {
        id: r.id,
        cashier_name: r.cashier_name,
        gate_name: r.gate_name || String(r.gate_id),
        opened_at: r.opened_at,
        closed_at: r.closed_at,
        closing_manager: r.closing_manager || null,
        opening_float_cents: r.opening_float_cents || 0,
        cash_cents: t.cash_cents || 0,
        card_cents: t.card_cents || 0,
      };
    });

    return json({ ok: true, sessions: out });
  }));

  /* ---------------- Tickets: summary per type + state ------------- */
  router.add("GET", "/api/admin/tickets/summary/:event_id", requireRole("admin", async (_req, env, _c, p) => {
    const eventId = Number(p.event_id);

    // ticket types (name & price)
    const ttypesQ = await env.DB.prepare(
      `SELECT id, name, price_cents FROM ticket_types WHERE event_id = ? ORDER BY id ASC`
    ).bind(eventId).all();
    const ttypes = ttypesQ.results || [];
    const map = new Map(ttypes.map(t => [t.id, { name: t.name, price_cents: t.price_cents, total:0, unused:0, in:0, out:0, void:0 }]));

    // aggregate tickets
    const agg = await env.DB.prepare(
      `SELECT ticket_type_id AS tid,
              COUNT(*) AS total,
              SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN state='in'     THEN 1 ELSE 0 END) AS in_cnt,
              SUM(CASE WHEN state='out'    THEN 1 ELSE 0 END) AS out_cnt,
              SUM(CASE WHEN state='void'   THEN 1 ELSE 0 END) AS void_cnt
         FROM tickets
         WHERE event_id = ?
         GROUP BY ticket_type_id`
    ).bind(eventId).all();

    let grand = { total:0, in:0, out:0, unused:0, void:0 };
    for (const r of (agg.results || [])) {
      const it = map.get(r.tid);
      if (!it) continue;
      it.total  = r.total  || 0;
      it.unused = r.unused || 0;
      it.in     = r.in_cnt || 0;
      it.out    = r.out_cnt|| 0;
      it.void   = r.void_cnt||0;
      grand.total  += it.total;
      grand.unused += it.unused;
      grand.in     += it.in;
      grand.out    += it.out;
      grand.void   += it.void;
    }

    const rows = ttypes.map(t => ({ id:t.id, name:t.name, price_cents:t.price_cents, ...(map.get(t.id) || {}) }));
    return json({ ok:true, event_id:eventId, rows, grand });
  }));

  /* ---------------- Order lookup by short code -------------------- */
  router.add("GET", "/api/admin/order/lookup/:code", requireRole("admin", async (_req, env, _c, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("code required");

    const q = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, total_cents
         FROM orders
         WHERE UPPER(short_code) = UPPER(?)
         LIMIT 1`
    ).bind(code).all();
    const row = (q.results || [])[0];
    if (!row) return json({ ok:false, error:"not_found" });

    // public ticket link (your UI route is /t/:code)
    const publicBase = env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za";
    const link = `${publicBase}/t/${row.short_code}`;

    return json({ ok:true, order: row, link });
  }));

  /* ---------------- Users: list/create/delete --------------------- */
  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok:true, users: q.results || [] });
  }));

  router.add("POST", "/api/admin/users", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const username = String(b?.username || "").trim();
    const role = String(b?.role || "").trim();
    const password_hash = String(b?.password_hash || "").trim() || null; // you may hash elsewhere
    if (!username) return bad("username required");
    if (!["admin","pos","scan"].includes(role)) return bad("invalid role");
    await env.DB.prepare(
      `INSERT INTO users (username, role, password_hash) VALUES (?1, ?2, ?3)`
    ).bind(username, role, password_hash).run();
    return json({ ok:true });
  }));

  router.add("POST", "/api/admin/users/delete", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
    return json({ ok:true });
  }));

  /* ---------------- Vendors + passes (basic) ---------------------- */
  router.add("GET", "/api/admin/vendors/:event_id", requireRole("admin", async (_req, env, _c, p) => {
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email, stand_number,
              staff_quota, vehicle_quota
         FROM vendors
         WHERE event_id = ?
         ORDER BY id ASC`
    ).bind(Number(p.event_id)).all();
    return json({ ok:true, vendors: q.results || [] });
  }));

  router.add("POST", "/api/admin/vendors/:event_id", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const name = String(b?.name || "").trim();
    if (!name) return bad("name required");
    const contact_name = String(b?.contact_name || "").trim() || null;
    const phone  = String(b?.phone || "").trim() || null;
    const email  = String(b?.email || "").trim() || null;
    const stand_number = String(b?.stand_number || "").trim() || null;
    const staff_quota = Math.max(0, Number(b?.staff_quota || 0));
    const vehicle_quota = Math.max(0, Number(b?.vehicle_quota || 0));
    await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(Number(p.event_id), name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota).run();
    return json({ ok:true });
  }));

  router.add("GET", "/api/admin/vendor-passes/:vendor_id", requireRole("admin", async (_req, env, _c, p) => {
    const q = await env.DB.prepare(
      `SELECT id, vendor_id, type, label, vehicle_reg, qr, state, issued_at, first_in_at, last_out_at
         FROM vendor_passes WHERE vendor_id = ? ORDER BY id ASC`
    ).bind(Number(p.vendor_id)).all();
    return json({ ok:true, passes: q.results || [] });
  }));

  router.add("POST", "/api/admin/vendor-passes/:vendor_id", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const type = (b?.type === "vehicle") ? "vehicle" : "staff";
    const label = String(b?.label || "").trim() || null;
    const vehicle_reg = String(b?.vehicle_reg || "").trim() || null;
    const qr = String(b?.qr || "").trim();
    if (!qr) return bad("qr required");
    await env.DB.prepare(
      `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(Number(p.vendor_id), type, label, vehicle_reg, qr).run();
    return json({ ok:true });
  }));

/* ---------------- Public ticket page helper --------------------- */
router.add("GET", "/api/public/tickets/by-code/:code", 
  async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    const q = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, tt.price_cents,
              o.short_code
         FROM tickets t
         JOIN orders o ON o.id = t.order_id
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE UPPER(o.short_code) = UPPER(?)
        ORDER BY t.id ASC`
    ).bind(code).all();

    return new Response(JSON.stringify({ ok: true, tickets: q.results }), {
      headers: { "content-type": "application/json" }
    });
  }
);
