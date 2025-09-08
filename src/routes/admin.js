// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin API */
export function mountAdmin(router) {
  /* ---------------- Events ---------------- */

  // List events (minimal set for admin table)
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY starts_at ASC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  // Create event (simple helper – slug must be unique)
  router.add("POST", "/api/admin/events", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const slug = String(b?.slug || "").trim();
    const name = String(b?.name || "").trim();
    const venue = String(b?.venue || "").trim();
    const starts_at = Number(b?.starts_at || 0);
    const ends_at   = Number(b?.ends_at || 0);
    const status    = (b?.status === "draft" || b?.status === "archived") ? b.status : "active";
    if (!slug || !name || !starts_at || !ends_at) return bad("Missing fields");

    try {
      const r = await env.DB.prepare(
        `INSERT INTO events (slug, name, venue, starts_at, ends_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(slug, name, venue, starts_at, ends_at, status).run();
      return json({ ok: true, id: r.meta.last_row_id });
    } catch (e) {
      return bad(String(e.message || e), 400);
    }
  }));

  // Ticket types for an event
  router.add("GET", "/api/admin/events/:event_id/ticket_types",
    requireRole("admin", async (_req, env, _ctx, p) => {
      const id = Number(p.event_id || 0);
      const q = await env.DB.prepare(
        `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
           FROM ticket_types WHERE event_id = ?1 ORDER BY id ASC`
      ).bind(id).all();
      return json({ ok: true, ticket_types: q.results || [] });
    })
  );

  // Add ticket type
  router.add("POST", "/api/admin/events/:event_id/ticket_types",
    requireRole("admin", async (req, env, _ctx, p) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(p.event_id || 0);
      const name = String(b?.name || "").trim();
      const price_cents = Number(b?.price_cents || 0);
      const capacity = Number(b?.capacity || 0);
      const per_order_limit = Number(b?.per_order_limit || 10);
      const requires_gender = Number(b?.requires_gender || 0) ? 1 : 0;
      if (!event_id || !name) return bad("Missing fields");
      const r = await env.DB.prepare(
        `INSERT INTO ticket_types (event_id, name, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(event_id, name, price_cents, capacity, per_order_limit, requires_gender).run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  /* ---------------- Tickets dashboard ---------------- */

  // Ticket summary by event (totals per type + grand totals)
  router.add("GET", "/api/admin/tickets/summary",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      // Per-type breakdown
      const perType = await env.DB.prepare(
        `SELECT
           tt.id, tt.name, tt.price_cents,
           COUNT(t.id)                    AS total,
           SUM(CASE WHEN t.state='unused' THEN 1 ELSE 0 END) AS unused,
           SUM(CASE WHEN t.state='in'     THEN 1 ELSE 0 END) AS in_cnt,
           SUM(CASE WHEN t.state='out'    THEN 1 ELSE 0 END) AS out_cnt,
           SUM(CASE WHEN t.state='void'   THEN 1 ELSE 0 END) AS void_cnt
         FROM ticket_types tt
         LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.event_id = tt.event_id
         WHERE tt.event_id = ?1
         GROUP BY tt.id, tt.name, tt.price_cents
         ORDER BY tt.id ASC`
      ).bind(event_id).all();

      const rows = (perType.results || []).map(r => ({
        id: Number(r.id),
        name: r.name,
        price_cents: Number(r.price_cents || 0),
        total: Number(r.total || 0),
        unused: Number(r.unused || 0),
        in_cnt: Number(r.in_cnt || 0),
        out_cnt: Number(r.out_cnt || 0),
        void_cnt: Number(r.void_cnt || 0),
      }));

      // Grand totals
      const totals = rows.reduce((t, r) => {
        t.total += r.total;
        t.unused += r.unused;
        t.in_cnt += r.in_cnt;
        t.out_cnt += r.out_cnt;
        t.void_cnt += r.void_cnt;
        return t;
      }, { total:0, unused:0, in_cnt:0, out_cnt:0, void_cnt:0 });

      return json({ ok: true, rows, totals });
    })
  );

  // Order lookup by short code → return link target existence
  router.add("GET", "/api/admin/orders/lookup",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const code = String(url.searchParams.get("code") || "").trim();
      if (!code) return bad("code required");

      const q = await env.DB.prepare(
        `SELECT id, short_code FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
      ).bind(code).all();
      const row = (q.results || [])[0];
      if (!row) return json({ ok: false, found: false });
      return json({
        ok: true,
        found: true,
        code: row.short_code,
        ticket_url: `/t/${row.short_code}`
      });
    })
  );

  /* ---------------- Vendors (basic) ---------------- */

  // List vendors for event
  router.add("GET", "/api/admin/vendors",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const event_id = Number(url.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");
      const q = await env.DB.prepare(
        `SELECT id, name, contact_name, phone, email, stand_number,
                staff_quota, vehicle_quota
           FROM vendors WHERE event_id = ?1 ORDER BY id ASC`
      ).bind(event_id).all();
      return json({ ok: true, vendors: q.results || [] });
    })
  );

  // Add vendor
  router.add("POST", "/api/admin/vendors",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(b?.event_id || 0);
      const name = String(b?.name || "").trim();
      const contact_name = String(b?.contact_name || "").trim();
      const phone = String(b?.phone || "").trim();
      const email = String(b?.email || "").trim();
      const stand_number = String(b?.stand_number || "").trim();
      const staff_quota = Number(b?.staff_quota || 0);
      const vehicle_quota = Number(b?.vehicle_quota || 0);
      if (!event_id || !name) return bad("Missing fields");
      const r = await env.DB.prepare(
        `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota).run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  /* ---------------- Users (basic) ---------------- */

  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));

  router.add("POST", "/api/admin/users", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const username = String(b?.username || "").trim();
    const role = (["admin","pos","scan"].includes(b?.role)) ? b.role : "pos";
    if (!username) return bad("username required");
    const r = await env.DB.prepare(
      `INSERT INTO users (username, role) VALUES (?1, ?2)`
    ).bind(username, role).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }));

  /* ---------------- POS Admin: cash-up ---------------- */

  // Detailed sessions + totals (used by POS Admin pane)
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (req, env) => {
    const url = new URL(req.url);
    const from = Number(url.searchParams.get("from") || 0);
    const to   = Number(url.searchParams.get("to")   || 0);

    const where = [];
    const bind = [];
    if (from) { where.push("s.opened_at >= ?"); bind.push(from); }
    if (to)   { where.push("s.opened_at <= ?"); bind.push(to); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = await env.DB.prepare(
      `
      SELECT
        s.id,
        s.cashier_name,
        g.name AS gate_name,
        s.opened_at,
        s.closed_at,
        s.closing_manager,
        s.opening_float_cents,
        COALESCE(SUM(CASE WHEN p.method = 'pos_cash' THEN p.amount_cents END), 0) AS cash_cents,
        COALESCE(SUM(CASE WHEN p.method = 'pos_card' THEN p.amount_cents END), 0) AS card_cents,
        COUNT(DISTINCT p.order_id) AS orders_count
      FROM pos_sessions s
      JOIN gates g ON g.id = s.gate_id
      LEFT JOIN pos_payments p ON p.session_id = s.id
      ${whereSql}
      GROUP BY s.id
      ORDER BY s.id DESC
      `
    ).bind(...bind).all();

    const sessions = (q.results || []).map(r => {
      const opening = Number(r.opening_float_cents || 0);
      const cash    = Number(r.cash_cents || 0);
      const card    = Number(r.card_cents || 0);
      return {
        id: Number(r.id),
        cashier_name: r.cashier_name,
        gate_name: r.gate_name,
        opened_at: Number(r.opened_at || 0),
        closed_at: r.closed_at ? Number(r.closed_at) : null,
        closing_manager: r.closing_manager || null,
        opening_float_cents: opening,
        cash_cents: cash,
        card_cents: card,
        expected_cash_cents: opening + cash,
        orders_count: Number(r.orders_count || 0),
      };
    });

    const totals = sessions.reduce((t, s) => {
      t.opening_float_cents += s.opening_float_cents;
      t.cash_cents          += s.cash_cents;
      t.card_cents          += s.card_cents;
      t.expected_cash_cents += s.expected_cash_cents;
      t.orders_count        += s.orders_count;
      return t;
    }, { opening_float_cents:0, cash_cents:0, card_cents:0, expected_cash_cents:0, orders_count:0 });

    return json({ ok: true, sessions, totals });
  }));

  // CSV export
  router.add("GET", "/api/admin/pos/sessions/export.csv", requireRole("admin", async (req, env) => {
    const base = new URL(req.url);
    base.pathname = "/api/admin/pos/sessions";
    const res = await env.fetch(base.toString(), { headers: { cookie: req.headers.get("cookie") || "" }});
    const data = await res.json();

    const rows = [
      ["ID","Cashier","Gate","Opened","Closed","Closed by",
       "Opening float (R)","Cash (R)","Card (R)","Expected cash (R)","Orders"],
      ...(data.sessions || []).map(s => [
        s.id,
        s.cashier_name || "",
        s.gate_name || "",
        s.opened_at ? new Date(s.opened_at*1000).toISOString() : "",
        s.closed_at ? new Date(s.closed_at*1000).toISOString() : "",
        s.closing_manager || "",
        (s.opening_float_cents/100).toFixed(2),
        (s.cash_cents/100).toFixed(2),
        (s.card_cents/100).toFixed(2),
        (s.expected_cash_cents/100).toFixed(2),
        s.orders_count
      ]),
      ["","","","","","TOTALS",
       (data.totals.opening_float_cents/100).toFixed(2),
       (data.totals.cash_cents/100).toFixed(2),
       (data.totals.card_cents/100).toFixed(2),
       (data.totals.expected_cash_cents/100).toFixed(2),
       data.totals.orders_count]
    ];

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pos-cashup.csv"`
      }
    });
  }));
}
