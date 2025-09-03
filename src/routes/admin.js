// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Mount all admin endpoints */
export function mountAdmin(router) {
  /* =========================
   * EVENTS (existing)
   * ========================= */
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events
        ORDER BY id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  router.add("POST", "/api/admin/event", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const slug = String(b?.slug || "").trim();
    const name = String(b?.name || "").trim();
    const venue = (b?.venue ?? null) ? String(b.venue).trim() : null;
    const starts_at = Number(b?.starts_at || 0);
    const ends_at = Number(b?.ends_at || 0);
    const status = (b?.status || "draft");

    if (!slug || !name || !starts_at || !ends_at) return bad("Missing fields");

    const r = await env.DB.prepare(
      `INSERT INTO events (slug, name, venue, starts_at, ends_at, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch(), unixepoch())`
    ).bind(slug, name, venue, starts_at, ends_at, status).run();

    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("GET", "/api/admin/event/:id/ticket-types",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      const q = await env.DB.prepare(
        `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(Number(id)).all();
      return json({ ok: true, ticket_types: q.results || [] });
    })
  );

  router.add("POST", "/api/admin/event/:id/ticket-type",
    requireRole("admin", async (req, env, _ctx, p) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(p.id);
      const name = String(b?.name || "").trim();
      const price_cents = Number(b?.price_cents || 0);
      const capacity = Number(b?.capacity || 0);
      const per_order_limit = Number(b?.per_order_limit || 10);
      const code = (b?.code ?? null) ? String(b.code).trim() : null;
      const requires_gender = b?.requires_gender ? 1 : 0;

      if (!event_id || !name) return bad("Missing fields");

      const r = await env.DB.prepare(
        `INSERT INTO ticket_types (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(event_id, name, code, price_cents, capacity, per_order_limit, requires_gender).run();

      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  /* =========================
   * POS ADMIN (existing summary)
   * ========================= */
  router.add("GET", "/api/admin/pos/sessions",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const from = Number(u.searchParams.get("from") || 0);
      const to   = Number(u.searchParams.get("to")   || 0);

      const rows = await env.DB.prepare(
        `SELECT s.id, s.cashier_name, s.gate_id, s.opened_at, s.closed_at,
                g.name AS gate_name
           FROM pos_sessions s
           LEFT JOIN gates g ON g.id = s.gate_id
          WHERE (?1=0 OR s.opened_at >= ?1)
            AND (?2=0 OR s.opened_at <= ?2)
          ORDER BY s.id DESC`
      ).bind(from, to).all();

      // cash/card totals by session
      const totals = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments
          GROUP BY session_id`
      ).all();

      const tmap = new Map((totals.results||[]).map(r => [r.session_id, r]));
      const out = (rows.results||[]).map(r => {
        const t = tmap.get(r.id) || { cash_cents:0, card_cents:0 };
        return { ...r, cash_cents: t.cash_cents||0, card_cents: t.card_cents||0 };
      });

      return json({ ok: true, sessions: out });
    })
  );

  /* =========================
   * USERS (NEW)
   * ========================= */
  router.add("GET", "/api/admin/users",
    requireRole("admin", async (_req, env) => {
      const q = await env.DB.prepare(
        `SELECT id, username, role FROM users ORDER BY id ASC`
      ).all();
      return json({ ok: true, users: q.results || [] });
    })
  );

  router.add("POST", "/api/admin/users",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const username = String(b?.username || "").trim();
      const role = String(b?.role || "").trim(); // 'admin' | 'pos' | 'scan'
      const password_hash = (b?.password_hash ?? null) ? String(b.password_hash) : null;

      if (!username || !role) return bad("Missing username/role");

      const r = await env.DB.prepare(
        `INSERT INTO users (username, role, password_hash)
         VALUES (?1, ?2, ?3)`
      ).bind(username, role, password_hash).run();

      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  router.add("DELETE", "/api/admin/users/:id",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      await env.DB.prepare(`DELETE FROM users WHERE id=?1`).bind(Number(id)).run();
      return json({ ok: true });
    })
  );

  /* =========================
   * VENDORS (NEW)
   * ========================= */

  // list vendors per event
  router.add("GET", "/api/admin/vendors",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const event_id = Number(u.searchParams.get("event_id") || 0);
      if (!event_id) return bad("event_id required");

      const q = await env.DB.prepare(
        `SELECT id, event_id, name, contact_name, phone, email,
                stand_number, staff_quota, vehicle_quota
           FROM vendors
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(event_id).all();

      return json({ ok: true, vendors: q.results || [] });
    })
  );

  // create vendor
  router.add("POST", "/api/admin/vendors",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const event_id = Number(b?.event_id || 0);
      const name = String(b?.name || "").trim();
      const contact_name = (b?.contact_name ?? null) ? String(b.contact_name).trim() : null;
      const phone = (b?.phone ?? null) ? String(b.phone).trim() : null;
      const email = (b?.email ?? null) ? String(b.email).trim() : null;
      const stand_number = (b?.stand_number ?? null) ? String(b.stand_number).trim() : null;
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

  router.add("DELETE", "/api/admin/vendors/:id",
    requireRole("admin", async (_req, env, _ctx, p) => {
      await env.DB.prepare(`DELETE FROM vendors WHERE id=?1`).bind(Number(p.id)).run();
      return json({ ok: true });
    })
  );

  // vendor passes
  router.add("GET", "/api/admin/vendor-passes",
    requireRole("admin", async (req, env) => {
      const u = new URL(req.url);
      const vendor_id = Number(u.searchParams.get("vendor_id") || 0);
      if (!vendor_id) return bad("vendor_id required");

      const q = await env.DB.prepare(
        `SELECT id, vendor_id, type, label, vehicle_reg, qr, state, first_in_at, last_out_at, issued_at
           FROM vendor_passes
          WHERE vendor_id = ?1
          ORDER BY id ASC`
      ).bind(vendor_id).all();

      return json({ ok: true, passes: q.results || [] });
    })
  );

  router.add("POST", "/api/admin/vendor-passes",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const vendor_id = Number(b?.vendor_id || 0);
      const type = String(b?.type || "staff"); // 'staff' | 'vehicle'
      const label = (b?.label ?? null) ? String(b.label).trim() : null;
      const vehicle_reg = (b?.vehicle_reg ?? null) ? String(b.vehicle_reg).trim() : null;
      const qr = String(b?.qr || "").trim();

      if (!vendor_id || !type || !qr) return bad("Missing fields");

      const r = await env.DB.prepare(
        `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr, state, issued_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'unused', unixepoch())`
      ).bind(vendor_id, type, label, vehicle_reg, qr).run();

      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  router.add("DELETE", "/api/admin/vendor-passes/:id",
    requireRole("admin", async (_req, env, _ctx, p) => {
      await env.DB.prepare(`DELETE FROM vendor_passes WHERE id=?1`).bind(Number(p.id)).run();
      return json({ ok: true });
    })
  );
}
