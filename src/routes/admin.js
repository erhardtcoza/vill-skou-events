// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin API */
export function mountAdmin(router) {
  /* ----------------------- EVENTS ----------------------- */

  // List events (most recent first)
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const sql = `
        SELECT id, slug, name, venue, starts_at, ends_at, status
        FROM events
        ORDER BY id DESC
      `;
      try {
        const r = await env.DB.prepare(sql).all();
        return json({ ok: true, events: r.results || [] });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  // Create event
  router.add(
    "POST",
    "/api/admin/events",
    requireRole("admin", async (req, env) => {
      let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
      const slug = (body?.slug || "").trim();
      const name = (body?.name || "").trim();
      const venue = (body?.venue || "").trim();
      const starts_at = Number(body?.starts_at || 0);
      const ends_at = Number(body?.ends_at || 0);
      const status = (body?.status || "draft").trim();

      if (!slug || !name) return bad("slug and name required");
      if (!starts_at || !ends_at) return bad("starts_at and ends_at required");

      const sql = `
        INSERT INTO events (slug, name, venue, starts_at, ends_at, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `;
      try {
        const r = await env.DB.prepare(sql)
          .bind(slug, name, venue, starts_at, ends_at, status)
          .run();
        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  /* -------------------- TICKET TYPES -------------------- */

  // List ticket types for an event (resilient to missing gender_required)
  router.add(
    "GET",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      const sql = `
        SELECT id, name, price_cents,
               COALESCE(gender_required, 0) AS gender_required
        FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC
      `;
      try {
        const r = await env.DB.prepare(sql).bind(Number(id || 0)).all();
        return json({ ok: true, types: r.results || [] });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  // Create ticket type
  router.add(
    "POST",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const name = String(b?.name || "").trim();
      const price_cents = Math.max(0, Number(b?.price_cents || 0));
      const gender_required = b?.gender_required ? 1 : 0;
      if (!name) return bad("name required");

      // If column doesn't exist, ignore it by using a dynamic statement
      // Try with gender_required; on failure, retry without it.
      const withGender = `
        INSERT INTO ticket_types (event_id, name, price_cents, gender_required)
        VALUES (?1, ?2, ?3, ?4)
      `;
      const withoutGender = `
        INSERT INTO ticket_types (event_id, name, price_cents)
        VALUES (?1, ?2, ?3)
      `;
      try {
        let r;
        try {
          r = await env.DB.prepare(withGender)
            .bind(Number(id || 0), name, price_cents, gender_required)
            .run();
        } catch {
          r = await env.DB.prepare(withoutGender)
            .bind(Number(id || 0), name, price_cents)
            .run();
        }
        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  /* --------------------- POS ADMIN ---------------------- */

  // Sessions summary with cash / card totals
  router.add(
    "GET",
    "/api/admin/pos/sessions",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const from = Number(u.searchParams.get("from") || 0);
      const to = Number(u.searchParams.get("to") || 0);

      const where = [];
      const binds = [];
      if (from) { where.push("s.opened_at >= ?"); binds.push(from); }
      if (to)   { where.push("s.opened_at <= ?"); binds.push(to); }

      const sql = `
        SELECT
          s.id,
          s.cashier_name,
          s.opening_float_cents,
          s.opened_at,
          s.closed_at,
          s.closing_manager,
          s.event_id,
          COALESCE(g.name, 'Gate #' || s.gate_id) AS gate_name,
          COALESCE(SUM(CASE WHEN p.method='pos_cash' THEN p.amount_cents END), 0) AS cash_cents,
          COALESCE(SUM(CASE WHEN p.method='pos_card' THEN p.amount_cents END), 0) AS card_cents
        FROM pos_sessions s
        LEFT JOIN gates g ON g.id = s.gate_id
        LEFT JOIN pos_payments p ON p.session_id = s.id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        GROUP BY s.id
        ORDER BY s.id DESC
      `;
      try {
        const r = await env.DB.prepare(sql).bind(...binds).all();
        return json({ ok: true, sessions: r.results || [] });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );
}
