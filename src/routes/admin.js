// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Mount all admin endpoints */
export function mountAdmin(router) {
  /* ----------------------------- EVENTS ----------------------------- */

  // List events
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const r = await env.DB.prepare(
        `SELECT id, slug, name, venue, starts_at, ends_at, status,
                gallery_urls, hero_url, poster_url
           FROM events
          ORDER BY id DESC`
      ).all();
      return json({ ok: true, events: r.results || [] });
    })
  );

  // Create event
  router.add(
    "POST",
    "/api/admin/events",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const slug = String(b?.slug || "").trim();
      const name = String(b?.name || "").trim();
      const venue = String(b?.venue || "").trim() || null;
      const starts_at = Number(b?.starts_at || 0);
      const ends_at = Number(b?.ends_at || 0);
      const status = (b?.status || "active");
      const gallery_urls = b?.gallery_urls ?? null;
      const hero_url = b?.hero_url ?? null;
      const poster_url = b?.poster_url ?? null;

      if (!slug || !name || !starts_at || !ends_at) return bad("Missing fields");

      const ins = await env.DB.prepare(
        `INSERT INTO events
         (slug, name, venue, starts_at, ends_at, status, gallery_urls, hero_url, poster_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, unixepoch(), unixepoch())`
      ).bind(slug, name, venue, starts_at, ends_at, status, gallery_urls, hero_url, poster_url).run();

      return json({ ok: true, id: ins.meta.last_row_id });
    })
  );

  /* -------------------------- TICKET TYPES -------------------------- */

  // List ticket types for event
  router.add(
    "GET",
    "/api/admin/events/:event_id/ticket-types",
    requireRole("admin", async (_req, env, _ctx, params) => {
      const event_id = Number(params.event_id || 0);
      if (!event_id) return bad("event_id required");

      const r = await env.DB.prepare(
        `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(event_id).all();

      return json({ ok: true, ticket_types: r.results || [] });
    })
  );

  // Create ticket type
  router.add(
    "POST",
    "/api/admin/events/:event_id/ticket-types",
    requireRole("admin", async (req, env, _ctx, params) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(params.event_id || 0);
      const name = String(b?.name || "").trim();
      const code = (b?.code ?? null) ? String(b.code).trim() : null;
      const price_cents = Number(b?.price_cents || 0);
      const capacity = Number(b?.capacity || 0);
      const per_order_limit = Number(b?.per_order_limit || 10);
      const requires_gender = Number(b?.requires_gender ? 1 : 0);

      if (!event_id || !name) return bad("Missing fields");

      const ins = await env.DB.prepare(
        `INSERT INTO ticket_types
         (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(event_id, name, code, price_cents, capacity, per_order_limit, requires_gender).run();

      return json({ ok: true, id: ins.meta.last_row_id });
    })
  );

  /* --------------------------- POS SESSIONS -------------------------- */

  // POS sessions with cash/card totals
  router.add(
    "GET",
    "/api/admin/pos/sessions",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const from = Number(u.searchParams.get("from") || 0); // unix seconds
      const to   = Number(u.searchParams.get("to") || 0);

      // Base list
      const list = await env.DB.prepare(
        `SELECT s.id, s.event_id, s.cashier_name, s.gate_id, s.opening_float_cents,
                s.opened_at, s.closed_at, s.closing_manager,
                g.name AS gate_name,
                e.slug AS event_slug, e.name AS event_name
           FROM pos_sessions s
           LEFT JOIN gates g ON g.id = s.gate_id
           LEFT JOIN events e ON e.id = s.event_id
          WHERE (?1 = 0 OR s.opened_at >= ?1)
            AND (?2 = 0 OR s.opened_at <= ?2)
          ORDER BY s.id DESC`
      ).bind(from, to).all();

      const sessions = list.results || [];

      // Totals by method
      const pay = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method = 'pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN method = 'pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments
          GROUP BY session_id`
      ).all();
      const bySess = new Map((pay.results || []).map(r => [r.session_id, r]));

      const rows = sessions.map(s => {
        const p = bySess.get(s.id) || { cash_cents: 0, card_cents: 0 };
        return {
          id: s.id,
          event_id: s.event_id,
          event_slug: s.event_slug,
          event_name: s.event_name,
          cashier_name: s.cashier_name,
          gate_id: s.gate_id,
          gate_name: s.gate_name,
          opening_float_cents: s.opening_float_cents || 0,
          opened_at: s.opened_at,
          closed_at: s.closed_at,
          closing_manager: s.closing_manager || null,
          cash_cents: p.cash_cents || 0,
          card_cents: p.card_cents || 0,
        };
      });

      return json({ ok: true, sessions: rows });
    })
  );

  /* ----------------------------- TICKETS ----------------------------- */

  // Summary by ticket type for an event
  // GET /api/admin/tickets?event_id=1
  router.add(
    "GET",
    "/api/admin/tickets",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const event_id = Number(u.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      // All types for event
      const types = await env.DB.prepare(
        `SELECT id, name, price_cents
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(event_id).all();

      const trows = types.results || [];
      if (!trows.length) return json({ ok: true, event_id, types: [], summary: { total: 0 } });

      // Count tickets per state per type
      const counts = await env.DB.prepare(
        `SELECT ticket_type_id,
                SUM(CASE WHEN state = 'unused' THEN 1 ELSE 0 END) AS unused,
                SUM(CASE WHEN state = 'in'     THEN 1 ELSE 0 END) AS in_count,
                SUM(CASE WHEN state = 'out'    THEN 1 ELSE 0 END) AS out_count,
                SUM(CASE WHEN state = 'void'   THEN 1 ELSE 0 END) AS void_count,
                COUNT(*) AS total
           FROM tickets
          WHERE event_id = ?1
          GROUP BY ticket_type_id`
      ).bind(event_id).all();
      const byType = new Map((counts.results || []).map(r => [r.ticket_type_id, r]));

      const rows = trows.map(tt => {
        const c = byType.get(tt.id) || {};
        const total = c.total || 0;
        return {
          ticket_type_id: tt.id,
          name: tt.name,
          price_cents: tt.price_cents || 0,
          total,
          unused: c.unused || 0,
          in: c.in_count || 0,
          out: c.out_count || 0,
          void: c.void_count || 0,
        };
      });

      const grand = rows.reduce((a, r) => {
        a.total += r.total; a.unused += r.unused; a.in += r.in; a.out += r.out; a.void += r.void;
        return a;
      }, { total:0, unused:0, in:0, out:0, void:0 });

      return json({ ok: true, event_id, types: rows, summary: grand });
    })
  );

  /* --------------------------- ORDER LOOKUP -------------------------- */

  // GET /api/admin/orders/lookup?code=AB12CD  -> { ok, short_code, event_slug }
  router.add(
    "GET",
    "/api/admin/orders/lookup",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const code = String(url.searchParams.get("code") || "").trim();
      if (!code) return bad("code required");

      const o = await env.DB.prepare(
        `SELECT short_code, event_id FROM orders WHERE short_code = ?1`
      ).bind(code).first();

      if (!o) return json({ ok: false, error: "not found" });

      const ev = await env.DB.prepare(
        `SELECT slug FROM events WHERE id = ?1`
      ).bind(o.event_id).first();

      return json({
        ok: true,
        short_code: o.short_code,
        event_slug: ev?.slug || null,
      });
    })
  );
}
