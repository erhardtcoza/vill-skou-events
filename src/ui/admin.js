// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/**
 * ADMIN API ROUTES
 *
 * Keeps existing Admin endpoints and adds:
 *  - GET /api/admin/pos/sessions
 *  - GET /api/admin/pos/cashups  (alias)
 *  - GET /api/admin/tickets/summary?event_id=#
 */
export function mountAdmin(router) {
  /* ------------------------------------------------------------------------
   * EVENTS (simple list used by UI dropdowns)
   * ------------------------------------------------------------------------ */
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      try {
        const q = await env.DB.prepare(
          `SELECT id, slug, name, starts_at, ends_at, venue, status
             FROM events
             ORDER BY starts_at DESC, id DESC`
        ).all();
        return json({ ok: true, events: q.results || [] });
      } catch (e) {
        return bad(e.message || "DB error");
      }
    })
  );

  /* ------------------------------------------------------------------------
   * POS ADMIN – sessions list
   * ------------------------------------------------------------------------ */
  router.add(
    "GET",
    "/api/admin/pos/sessions",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const fromStr = u.searchParams.get("from");
      const toStr   = u.searchParams.get("to");
      const eventId = Number(u.searchParams.get("event_id") || 0);
      const gateId  = Number(u.searchParams.get("gate_id")  || 0);

      const where = [];
      const bind = [];

      if (fromStr) { where.push(`s.opened_at >= unixepoch(date(?))`); bind.push(fromStr); }
      if (toStr)   { where.push(`s.opened_at <  unixepoch(date(?,'+1 day'))`); bind.push(toStr); }
      if (eventId) { where.push(`s.event_id = ?`); bind.push(eventId); }
      if (gateId)  { where.push(`s.gate_id  = ?`); bind.push(gateId);  }

      const whereSQL = where.length ? ("WHERE " + where.join(" AND ")) : "";

      const sql = `
        SELECT
          s.id                           AS session_id,
          s.event_id,
          e.name                         AS event_name,
          s.gate_id,
          g.name                         AS gate_name,
          s.cashier_name,
          COALESCE(s.cashier_msisdn,'')  AS cashier_msisdn,
          COALESCE(s.opening_float_cents,0) AS opening_float_cents,
          COALESCE(s.cash_total_cents,0) AS cash_total_cents,
          COALESCE(s.card_total_cents,0) AS card_total_cents,
          (COALESCE(s.cash_total_cents,0) + COALESCE(s.card_total_cents,0)) AS takings_cents,
          s.opened_at,
          s.closed_at,
          COALESCE(s.closing_manager,'') AS closing_manager,
          COALESCE(s.notes,'')           AS notes
        FROM pos_sessions s
        JOIN events e ON e.id = s.event_id
        JOIN gates  g ON g.id = s.gate_id
        ${whereSQL}
        ORDER BY s.id DESC
      `;
      try {
        const stmt = env.DB.prepare(sql);
        const res = bind.length ? await stmt.bind(...bind).all() : await stmt.all();
        return json({ ok: true, sessions: res.results || [] });
      } catch (e) {
        return bad(e.message || "DB error");
      }
    })
  );

  router.add(
    "GET",
    "/api/admin/pos/cashups",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      url.pathname = "/api/admin/pos/sessions";
      const proxied = new Request(url.toString(), req);
      return router.handle(proxied, env);
    })
  );

  /* ------------------------------------------------------------------------
   * NEW: TICKETS SUMMARY – by ticket type for a given event
   * ------------------------------------------------------------------------
   * Returns:
   * {
   *   ok: true,
   *   event: { id, name, slug },
   *   totals: { sold, in, not_in },
   *   types: [
   *     { id, name, sold, in, not_in }
   *   ]
   * }
   */
  router.add(
    "GET",
    "/api/admin/tickets/summary",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const eventId = Number(u.searchParams.get("event_id") || 0);
      if (!eventId) return bad("event_id required");

      try {
        // Get event header
        const ev = await env.DB.prepare(
          `SELECT id, name, slug FROM events WHERE id = ?1 LIMIT 1`
        ).bind(eventId).first();

        // NOTE: Adjust column names below if your schema differs.
        // We count "sold" = all non-cancelled tickets for the event.
        // "in" = tickets with checked_in_at not null (and not cancelled).
        // "not_in" computed in JS for clarity.
        const sql = `
          SELECT
            tt.id   AS ticket_type_id,
            tt.name AS ticket_type_name,
            SUM(CASE WHEN t.id IS NOT NULL AND t.cancelled_at IS NULL THEN 1 ELSE 0 END) AS sold,
            SUM(CASE WHEN t.checked_in_at IS NOT NULL AND t.cancelled_at IS NULL THEN 1 ELSE 0 END) AS checked_in
          FROM ticket_types tt
          LEFT JOIN tickets t
            ON t.ticket_type_id = tt.id
           AND t.event_id = tt.event_id
          WHERE tt.event_id = ?1
          GROUP BY tt.id, tt.name
          ORDER BY tt.id ASC
        `;
        const rows = await env.DB.prepare(sql).bind(eventId).all();
        const list = (rows.results || []).map(r => ({
          id: r.ticket_type_id,
          name: r.ticket_type_name,
          sold: Number(r.sold || 0),
          in:   Number(r.checked_in || 0),
          not_in: Math.max(0, Number(r.sold || 0) - Number(r.checked_in || 0)),
        }));

        const totals = list.reduce((acc, x) => {
          acc.sold += x.sold; acc.in += x.in; acc.not_in += x.not_in;
          return acc;
        }, { sold:0, in:0, not_in:0 });

        return json({ ok:true, event: ev || { id:eventId }, totals, types: list });
      } catch (e) {
        return bad(e.message || "DB error");
      }
    })
  );
}
