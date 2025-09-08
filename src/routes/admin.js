// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/**
 * Admin API
 *
 * Endpoints:
 *   GET  /api/admin/events
 *   POST /api/admin/events                      (create)
 *   GET  /api/admin/events/:id/ticket-types
 *   POST /api/admin/events/:id/ticket-types     (create)
 *
 *   GET  /api/admin/pos/sessions                (with cash/card totals)
 *
 *   GET  /api/admin/users
 *
 *   GET  /api/admin/vendors
 *   GET  /api/admin/vendors/:id/passes
 */
export function mountAdmin(router) {
  /* --------------------------- EVENTS --------------------------- */

  // List events (newest first)
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const r = await env.DB.prepare(`
        SELECT id, slug, name, venue, starts_at, ends_at, status,
               gallery_urls, hero_url, poster_url
        FROM events
        ORDER BY id DESC
      `).all();

      return json({
        ok: true,
        events: (r.results || []).map(e => ({
          id: e.id,
          slug: e.slug,
          name: e.name,
          venue: e.venue,
          starts_at: Number(e.starts_at),
          ends_at: Number(e.ends_at),
          status: e.status,
          gallery_urls: e.gallery_urls,
          hero_url: e.hero_url,
          poster_url: e.poster_url,
        })),
      });
    })
  );

  // Create event (minimal)
  router.add(
    "POST",
    "/api/admin/events",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const slug = String(b.slug || "").trim();
      const name = String(b.name || "").trim();
      const venue = (b.venue ?? null) ? String(b.venue) : null;
      const starts_at = Number(b.starts_at || 0);
      const ends_at = Number(b.ends_at || 0);
      const status = (b.status || "draft");

      if (!slug) return bad("slug required");
      if (!name) return bad("name required");
      if (!starts_at || !ends_at) return bad("starts_at/ends_at required");

      try {
        const r = await env.DB.prepare(`
          INSERT INTO events (slug, name, venue, starts_at, ends_at, status, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch(), unixepoch())
        `).bind(slug, name, venue, starts_at, ends_at, status).run();

        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return bad(String(e.message || e));
      }
    })
  );

  /* ------------------------ TICKET TYPES ------------------------ */

  // List ticket types for an event
  router.add(
    "GET",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (_req, env, _ctx, params) => {
      const eventId = Number(params.id || 0);
      if (!eventId) return bad("event id required");

      const r = await env.DB.prepare(`
        SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
        FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC
      `).bind(eventId).all();

      return json({
        ok: true,
        ticket_types: (r.results || []).map(t => ({
          id: t.id,
          event_id: t.event_id,
          name: t.name,
          code: t.code,
          price_cents: Number(t.price_cents) || 0,
          capacity: Number(t.capacity) || 0,
          per_order_limit: Number(t.per_order_limit) || 10,
          requires_gender: Number(t.requires_gender) ? 1 : 0,
        })),
      });
    })
  );

  // Create ticket type for an event
  router.add(
    "POST",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (req, env, _ctx, params) => {
      const eventId = Number(params.id || 0);
      if (!eventId) return bad("event id required");

      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const name = String(b.name || "").trim();
      const code = (b.code ?? null) ? String(b.code) : null;
      const price_cents = Math.max(0, Number(b.price_cents || 0));
      const capacity = Math.max(0, Number(b.capacity || 0));
      const per_order_limit = Math.max(1, Number(b.per_order_limit || 10));
      const requires_gender = (b.requires_gender ? 1 : 0);

      if (!name) return bad("name required");

      try {
        const r = await env.DB.prepare(`
          INSERT INTO ticket_types
            (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `).bind(eventId, name, code, price_cents, capacity, per_order_limit, requires_gender).run();

        return json({ ok: true, id: r.meta.last_row_id });
      } catch (e) {
        return bad(String(e.message || e));
      }
    })
  );

  /* ------------------------ POS SESSIONS ------------------------ */

  // Sessions with cash / card totals aggregated from pos_payments
  router.add(
    "GET",
    "/api/admin/pos/sessions",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const from = Number(url.searchParams.get("from") || 0);
      const to   = Number(url.searchParams.get("to")   || 0);

      const where = [];
      const bind = [];
      if (from) { where.push("s.opened_at >= ?"); bind.push(from); }
      if (to)   { where.push("s.opened_at <= ?"); bind.push(to); }
      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

      const r = await env.DB.prepare(`
        SELECT
          s.id,
          s.event_id,
          s.cashier_name,
          s.gate_id,
          g.name AS gate_name,
          s.opened_at,
          s.closed_at,
          s.opening_float_cents,
          s.closing_manager,
          COALESCE(SUM(CASE WHEN p.method='pos_cash' THEN p.amount_cents END), 0) AS cash_cents,
          COALESCE(SUM(CASE WHEN p.method='pos_card' THEN p.amount_cents END), 0) AS card_cents
        FROM pos_sessions s
        LEFT JOIN gates g ON g.id = s.gate_id
        LEFT JOIN pos_payments p ON p.session_id = s.id
        ${whereSql}
        GROUP BY s.id
        ORDER BY s.id DESC
      `).bind(...bind).all();

      const sessions = (r.results || []).map(x => ({
        id: x.id,
        event_id: x.event_id,
        cashier_name: x.cashier_name || "",
        gate_id: x.gate_id || null,
        gate_name: x.gate_name || "",
        opened_at: Number(x.opened_at) || null,
        closed_at: Number(x.closed_at) || null,
        opening_float_cents: Number(x.opening_float_cents) || 0,
        closing_manager: x.closing_manager || null,
        cash_cents: Number(x.cash_cents) || 0,
        card_cents: Number(x.card_cents) || 0,
      }));

      return json({ ok: true, sessions });
    })
  );

  /* --------------------------- USERS --------------------------- */

  router.add(
    "GET",
    "/api/admin/users",
    requireRole("admin", async (_req, env) => {
      const r = await env.DB.prepare(`
        SELECT id, username, role
        FROM users
        ORDER BY id ASC
      `).all();
      return json({ ok: true, users: r.results || [] });
    })
  );

  /* -------------------------- VENDORS -------------------------- */

  router.add(
    "GET",
    "/api/admin/vendors",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const eventId = Number(url.searchParams.get("event_id") || 0);

      const r = await env.DB.prepare(`
        SELECT id, event_id, name, contact_name, phone, email,
               stand_number, staff_quota, vehicle_quota
        FROM vendors
        ${eventId ? "WHERE event_id = ?1" : ""}
        ORDER BY name ASC
      `).bind(eventId || undefined).all();

      return json({ ok: true, vendors: r.results || [] });
    })
  );

  router.add(
    "GET",
    "/api/admin/vendors/:id/passes",
    requireRole("admin", async (_req, env, _ctx, params) => {
      const vendorId = Number(params.id || 0);
      if (!vendorId) return bad("vendor id required");

      const r = await env.DB.prepare(`
        SELECT id, vendor_id, type, label, vehicle_reg, qr, state,
               first_in_at, last_out_at, issued_at
        FROM vendor_passes
        WHERE vendor_id = ?1
        ORDER BY id ASC
      `).bind(vendorId).all();

      return json({ ok: true, passes: r.results || [] });
    })
  );
}
