// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/**
 * ADMIN API ROUTES
 *
 * This file keeps your existing Admin endpoints (events, tickets, users, etc.)
 * and ADDS a small POS Admin section to list sessions/cash-ups.
 *
 * If you already have event/user endpoints elsewhere, keep them; the new POS
 * routes do not conflict with anything.
 */
export function mountAdmin(router) {
  /* ------------------------------------------------------------------------
   * KEEP / EXISTING ADMIN ROUTES
   * ------------------------------------------------------------------------
   * If your repository already has handlers here (events CRUD, ticket type
   * CRUD, site settings, users, etc.), they can all stay as-is.
   * (It’s OK if this section is empty in your repo.)
   */

  // Example: a very small, non-invasive “events list” that many UIs expect.
  // If you already have a richer implementation, remove this example.
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
   * NEW: POS ADMIN – sessions list (cash-ups)
   * ------------------------------------------------------------------------ */

  // Main endpoint used by the Admin → “POS Admin” tab.
  router.add(
    "GET",
    "/api/admin/pos/sessions",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const fromStr = u.searchParams.get("from"); // YYYY-MM-DD (optional)
      const toStr   = u.searchParams.get("to");   // YYYY-MM-DD (optional)
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

  // Back-compat alias if the UI calls /api/admin/pos/cashups
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
}
