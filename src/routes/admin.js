// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountAdmin(router) {
  /* -------- Events: list -------- */
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const r = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY id DESC`
    ).all();
    return json({ ok: true, events: r.results || [] });
  }));

  /* -------- Events: create -------- */
  router.add("POST", "/api/admin/events", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { slug, name, venue, starts_at, ends_at, status = "active" } = b || {};
    if (!slug || !name || !starts_at || !ends_at) return bad("Missing fields");
    try {
      const r = await env.DB.prepare(
        `INSERT INTO events (slug, name, venue, starts_at, ends_at, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch(), unixepoch())`
      ).bind(slug, name, venue || null, starts_at, ends_at, status).run();
      return json({ ok: true, id: r.meta.last_row_id });
    } catch (e) {
      return bad(e.message || "insert failed");
    }
  }));

  /* -------- Ticket types: list (per event) -------- */
  router.add("GET", "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      const r = await env.DB.prepare(
        `SELECT id, name, code, price_cents, capacity, per_order_limit, requires_gender
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(Number(id)).all();
      return json({ ok: true, types: r.results || [] });
    })
  );

  /* -------- Ticket types: create (per event) -------- */
  router.add("POST", "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(id);
      const name = String(b?.name || "").trim();
      const price_cents = Number(b?.price_cents || 0);
      const capacity = Number(b?.capacity || 0);
      const per_order_limit = Number(b?.per_order_limit ?? 10);
      const code = b?.code ? String(b.code).trim() : null;
      const requires_gender = (b?.requires_gender ? 1 : 0);

      if (!event_id || !name || !capacity) return bad("name and capacity required");

      try {
        const r = await env.DB.prepare(
          `INSERT INTO ticket_types
             (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        ).bind(event_id, name, code, price_cents, capacity, per_order_limit, requires_gender).run();
        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return bad(e.message || "insert failed");
      }
    })
  );

  /* -------- POS sessions (admin view) -------- */
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (req, env) => {
    const u = new URL(req.url);
    const from = Number(u.searchParams.get("from") || 0);
    const to = Number(u.searchParams.get("to") || 0);

    let sql = `
      SELECT s.id, s.cashier_name, g.name AS gate_name,
             s.opened_at, s.closed_at,
             COALESCE(SUM(CASE p.method WHEN 'pos_cash' THEN p.amount_cents ELSE 0 END),0) AS cash_cents,
             COALESCE(SUM(CASE p.method WHEN 'pos_card' THEN p.amount_cents ELSE 0 END),0) AS card_cents
        FROM pos_sessions s
        LEFT JOIN gates g ON g.id = s.gate_id
        LEFT JOIN pos_payments p ON p.session_id = s.id
       WHERE 1=1`;
    const params = [];
    if (from) { sql += ` AND s.opened_at >= ?`; params.push(from); }
    if (to)   { sql += ` AND s.opened_at <= ?`; params.push(to); }
    sql += ` GROUP BY s.id ORDER BY s.id DESC`;

    const st = env.DB.prepare(sql);
    params.forEach((v, i) => st.bind?.(v, i + 1));
    const r = await st.all();
    return json({ ok: true, sessions: r.results || [] });
  }));
}
