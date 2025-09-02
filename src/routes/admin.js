// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

export function mountAdmin(router) {
  // List all events
  router.add("GET", "/api/admin/events", async (_req, env) => {
    const rows = await env.DB
      .prepare("SELECT * FROM events ORDER BY starts_at DESC")
      .all();
    return json({ ok: true, events: rows.results || [] });
  });

  // Get single event
  router.add("GET", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    const row = await env.DB
      .prepare("SELECT * FROM events WHERE id=?1")
      .bind(id)
      .first();
    if (!row) return bad("Not found", 404);
    return json({ ok: true, event: row });
  });

  // Create event
  router.add("POST", "/api/admin/events", async (req, env) => {
    const b = await req.json();
    const stmt = env.DB.prepare(
      `INSERT INTO events (slug,name,venue,starts_at,ends_at,status)
       VALUES (?1,?2,?3,?4,?5,?6)`
    ).bind(b.slug, b.name, b.venue, b.starts_at, b.ends_at, b.status || "active");
    const res = await stmt.run();
    return json({ ok: true, id: res.lastInsertRowid });
  });

  // Update event
  router.add("PUT", "/api/admin/events/:id", async (req, env, _ctx, { id }) => {
    const b = await req.json();
    const stmt = env.DB.prepare(
      `UPDATE events SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5,
       hero_url=?6, poster_url=?7, gallery_urls=?8 WHERE id=?9`
    ).bind(
      b.slug, b.name, b.venue,
      b.starts_at, b.ends_at,
      b.hero_url, b.poster_url,
      b.gallery_urls,
      id
    );
    await stmt.run();
    return json({ ok: true });
  });

  // Delete event
  router.add("DELETE", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    await env.DB.prepare("DELETE FROM events WHERE id=?1").bind(id).run();
    return json({ ok: true });
  });

  // Add ticket type
  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, _ctx, { id }) => {
    const b = await req.json();
    const stmt = env.DB.prepare(
      `INSERT INTO ticket_types (event_id, name, price_cents, requires_gender)
       VALUES (?1,?2,?3,?4)`
    ).bind(id, b.name, b.price_cents || 0, b.requires_gender ? 1 : 0);
    const res = await stmt.run();
    return json({ ok: true, id: res.lastInsertRowid });
  });

  // Gates
  router.add("GET", "/api/admin/gates", async (_req, env) => {
    const rows = await env.DB.prepare("SELECT * FROM gates ORDER BY id").all();
    return json({ ok: true, gates: rows.results || [] });
  });
  router.add("POST", "/api/admin/gates", async (req, env) => {
    const b = await req.json();
    const stmt = env.DB.prepare("INSERT INTO gates (name) VALUES (?1)").bind(b.name);
    const res = await stmt.run();
    return json({ ok: true, id: res.lastInsertRowid });
  });

  // POS cashups
  router.add("GET", "/api/admin/pos/cashups", async (_req, env) => {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, cashier_name, gate_name, opened_at, closed_at,
                total_cash, total_card
         FROM pos_cashups
         ORDER BY opened_at DESC`
      ).all();
      return json({ ok: true, cashups: rows.results || [] });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Site settings (get & save)
  router.add("GET", "/api/admin/settings", async (_req, env) => {
    const row = await env.DB.prepare("SELECT * FROM settings LIMIT 1").first();
    return json({ ok: true, settings: row || {} });
  });
  router.add("POST", "/api/admin/settings", async (req, env) => {
    const b = await req.json();
    await env.DB.prepare("DELETE FROM settings").run();
    const stmt = env.DB.prepare(
      `INSERT INTO settings (name, logo_url, banner_url)
       VALUES (?1,?2,?3)`
    ).bind(b.name, b.logo_url, b.banner_url);
    await stmt.run();
    return json({ ok: true });
  });
}
