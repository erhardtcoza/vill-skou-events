// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountAdmin(router) {
  //
  // ───────────────────────── Site Settings ─────────────────────────
  //
  router.add("GET", "/api/admin/settings",
    requireRole("admin", async (_req, env) => {
      const rows = await env.DB.prepare("SELECT key, value FROM settings").all();
      const dict = (rows.results || []).reduce((a, r) => (a[r.key] = r.value, a), {});
      return json({ ok: true, settings: dict });
    })
  );

  router.add("POST", "/api/admin/settings",
    requireRole("admin", async (req, env) => {
      const body = await req.json().catch(() => null);
      if (!body) return bad("Bad JSON");
      const kvs = Object.entries(body);
      await env.DB.batch(kvs.map(([k, v]) =>
        env.DB.prepare(
          "INSERT INTO settings(key,value) VALUES(?1,?2) " +
          "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        ).bind(k, String(v ?? ""))));
      return json({ ok: true, updated: kvs.length });
    })
  );

  //
  // ─────────────────────────── Events CRUD ─────────────────────────
  //
  router.add("GET", "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const rows = await env.DB.prepare(
        `SELECT id, slug, name, venue, starts_at, ends_at, status,
                hero_url, poster_url, gallery_urls
         FROM events
         ORDER BY starts_at ASC`
      ).all();
      return json({ ok: true, events: rows.results || [] });
    })
  );

  router.add("POST", "/api/admin/events",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      if (!b?.slug || !b?.name) return bad("slug and name required");
      const starts = Number(b.starts_at || 0) || null;
      const ends   = Number(b.ends_at   || 0) || null;
      const r = await env.DB.prepare(
        `INSERT INTO events (slug, name, venue, starts_at, ends_at, status,
                             hero_url, poster_url, gallery_urls)
         VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,'active'), ?7, ?8, ?9)`
      ).bind(
        b.slug.trim(), b.name.trim(), (b.venue||"").trim(),
        starts, ends, (b.status||"active"),
        b.hero_url||"", b.poster_url||"", b.gallery_urls||""
      ).run();
      return json({ ok:true, id: r.meta.last_row_id });
    })
  );

  router.add("POST", "/api/admin/events/:id/update",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      const b = await req.json().catch(()=>null);
      if (!b) return bad("Bad JSON");
      const starts = Number(b.starts_at || 0) || null;
      const ends   = Number(b.ends_at   || 0) || null;
      await env.DB.prepare(
        `UPDATE events
           SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5, status=?6,
               hero_url=?7, poster_url=?8, gallery_urls=?9
         WHERE id=?10`
      ).bind(
        b.slug?.trim()||"", b.name?.trim()||"", (b.venue||"").trim(),
        starts, ends, (b.status||"active"),
        b.hero_url||"", b.poster_url||"", b.gallery_urls||"",
        Number(id)
      ).run();
      return json({ ok:true });
    })
  );

  router.add("POST", "/api/admin/events/:id/delete",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      await env.DB.prepare("DELETE FROM events WHERE id=?1").bind(Number(id)).run();
      return json({ ok:true });
    })
  );

  //
  // ───────────────────────────── Gates ─────────────────────────────
  //
  router.add("GET", "/api/admin/gates",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const eventId = Number(url.searchParams.get("event_id") || 0);
      if (!eventId) return bad("event_id required");
      const rows = await env.DB.prepare(
        `SELECT id, event_id, name FROM gates WHERE event_id=?1 ORDER BY id ASC`
      ).bind(eventId).all();
      return json({ ok:true, gates: rows.results || [] });
    })
  );

  router.add("POST", "/api/admin/gates",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      const eventId = Number(b?.event_id || 0);
      const name = (b?.name || "").trim();
      if (!eventId || !name) return bad("event_id and name required");
      const r = await env.DB.prepare(
        `INSERT INTO gates (event_id, name) VALUES (?1, ?2)`
      ).bind(eventId, name).run();
      return json({ ok:true, id: r.meta.last_row_id });
    })
  );

  //
  // ────────────────────────── Ticket Types ─────────────────────────
  //
  router.add("GET", "/api/admin/ticket-types",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const eventId = Number(url.searchParams.get("event_id") || 0);
      if (!eventId) return bad("event_id required");
      const rows = await env.DB.prepare(
        `SELECT id, event_id, name, code, price_cents, capacity,
                per_order_limit, requires_gender
         FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
      ).bind(eventId).all();
      return json({ ok:true, types: rows.results || [] });
    })
  );

  router.add("POST", "/api/admin/ticket-types",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      const eventId = Number(b?.event_id || 0);
      const name = (b?.name || "").trim();
      if (!eventId || !name) return bad("event_id and name required");
      const price = Number(b?.price_cents || 0) || 0;
      const cap   = Number(b?.capacity || 0) || 0;
      const pol   = Number(b?.per_order_limit || 10) || 10;
      const reqG  = !!b?.requires_gender;

      const r = await env.DB.prepare(
        `INSERT INTO ticket_types (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)`
      ).bind(eventId, name, price, cap, pol, reqG ? 1 : 0).run();
      return json({ ok:true, id: r.meta.last_row_id });
    })
  );

  //
  // ─────────────────────────── POS Admin ───────────────────────────
  //
  router.add("GET", "/api/admin/pos/summary",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const eventId = Number(url.searchParams.get("event_id") || 0);
      if (!eventId) return bad("event_id required");

      // Sessions
      const sessions = (await env.DB.prepare(
        `SELECT id, cashier_name, gate_name, opened_at, closed_at,
                opening_float_cents, cash_total_cents, card_total_cents, notes
         FROM pos_sessions
         WHERE event_id=?1
         ORDER BY opened_at DESC`
      ).bind(eventId).all()).results || [];

      // Totals by ticket type + method
      const byType = (await env.DB.prepare(
        `SELECT tt.name,
                SUM(CASE WHEN o.payment_method='cash' THEN oi.qty ELSE 0 END) AS qty_cash,
                SUM(CASE WHEN o.payment_method='card' THEN oi.qty ELSE 0 END) AS qty_card,
                SUM(oi.qty) AS qty_total,
                SUM(oi.qty * COALESCE(tt.price_cents,0)) AS cents_total
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN ticket_types tt ON tt.id = oi.ticket_type_id
         WHERE o.event_id = ?1 AND o.status IN ('paid','pending')
         GROUP BY tt.name
         ORDER BY tt.name`
      ).bind(eventId).all()).results || [];

      // Overall totals (paid)
      const totals = (await env.DB.prepare(
        `SELECT
           SUM(CASE WHEN payment_method='cash' THEN total_cents ELSE 0 END) AS cash_cents,
           SUM(CASE WHEN payment_method='card' THEN total_cents ELSE 0 END) AS card_cents,
           SUM(total_cents) AS grand_cents
         FROM orders
         WHERE event_id=?1 AND status='paid'`
      ).bind(eventId).all()).results?.[0] || { cash_cents:0, card_cents:0, grand_cents:0 };

      return json({ ok:true, sessions, byType, totals });
    })
  );

  //
  // ───────────────────────────── Users ─────────────────────────────
  //
  router.add("GET", "/api/admin/users",
    requireRole("admin", async (_req, env) => {
      const rows = await env.DB.prepare(
        `SELECT id, username, role, created_at FROM users ORDER BY created_at DESC`
      ).all();
      return json({ ok:true, users: rows.results || [] });
    })
  );

  router.add("POST", "/api/admin/users",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      if (!b?.username || !b?.password || !b?.role) return bad("username, password, role required");
      const r = await env.DB.prepare(
        `INSERT INTO users(username, password_hash, role, created_at)
         VALUES (?1, ?2, ?3, unixepoch())`
      ).bind(b.username, b.password, b.role).run(); // TODO: replace with real hash
      return json({ ok:true, id: r.meta.last_row_id });
    })
  );

  router.add("POST", "/api/admin/users/delete",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      const id = Number(b?.id || 0);
      if (!id) return bad("id required");
      await env.DB.prepare(`DELETE FROM users WHERE id=?1`).bind(id).run();
      return json({ ok:true });
    })
  );
}
