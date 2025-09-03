// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountAdmin(router) {
  // ---- Events (list/create/update/delete) ----
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const rows = await env.DB.prepare(
        `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events
         ORDER BY starts_at ASC`
      ).all();
      return json({ ok: true, events: rows.results || [] });
    })
  );

  router.add(
    "POST",
    "/api/admin/events",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      if (!b?.slug || !b?.name || !b?.starts_at || !b?.ends_at) {
        return bad("Missing fields");
      }
      const r = await env.DB.prepare(
        `INSERT INTO events (slug, name, venue, starts_at, ends_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,'active'))`
      ).bind(b.slug, b.name, b.venue || "", b.starts_at, b.ends_at, b.status || "active").run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  router.add(
    "GET",
    "/api/admin/events/:id",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      const ev = await env.DB.prepare(
        `SELECT id, slug, name, venue, starts_at, ends_at, status,
                hero_url, poster_url, gallery_urls
         FROM events WHERE id = ?1`
      ).bind(Number(id)).first();
      if (!ev) return bad("Not found", 404);
      return json({ ok: true, event: ev });
    })
  );

  router.add(
    "POST",
    "/api/admin/events/:id",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      const b = await req.json().catch(()=>null);
      if (!b) return bad("Invalid body");
      await env.DB.prepare(
        `UPDATE events SET slug = COALESCE(?1, slug),
                           name = COALESCE(?2, name),
                           venue = COALESCE(?3, venue),
                           starts_at = COALESCE(?4, starts_at),
                           ends_at   = COALESCE(?5, ends_at),
                           status    = COALESCE(?6, status),
                           hero_url  = COALESCE(?7, hero_url),
                           poster_url= COALESCE(?8, poster_url),
                           gallery_urls = COALESCE(?9, gallery_urls)
         WHERE id = ?10`
      ).bind(
        b.slug ?? null,
        b.name ?? null,
        b.venue ?? null,
        b.starts_at ?? null,
        b.ends_at ?? null,
        b.status ?? null,
        b.hero_url ?? null,
        b.poster_url ?? null,
        b.gallery_urls ?? null,
        Number(id)
      ).run();
      return json({ ok: true });
    })
  );

  router.add(
    "DELETE",
    "/api/admin/events/:id",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      await env.DB.prepare(`DELETE FROM events WHERE id=?1`).bind(Number(id)).run();
      return json({ ok: true });
    })
  );

  // ---- Gates (minimal) ----
  router.add(
    "GET",
    "/api/admin/gates",
    requireRole("admin", async (_req, env) => {
      const rows = await env.DB.prepare(`SELECT id, name FROM gates ORDER BY id ASC`).all();
      return json({ ok: true, gates: rows.results || [] });
    })
  );
  router.add(
    "POST",
    "/api/admin/gates",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      if (!b?.name) return bad("name required");
      const r = await env.DB.prepare(`INSERT INTO gates (name) VALUES (?1)`).bind(b.name).run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  // ---- Ticket types (list/add simple) ----
  router.add(
    "GET",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      const rows = await env.DB.prepare(
        `SELECT id, event_id, name, price_cents, requires_gender
         FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
      ).bind(Number(id)).all();
      return json({ ok: true, ticket_types: rows.results || [] });
    })
  );
  router.add(
    "POST",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      const b = await req.json().catch(()=>null);
      if (!b?.name) return bad("name required");
      const price = Math.max(0, Math.round((Number(b.price_rand ?? 0) || 0) * 100));
      const r = await env.DB.prepare(
        `INSERT INTO ticket_types (event_id, name, price_cents, requires_gender)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(Number(id), b.name, price, !!b.requires_gender ? 1 : 0).run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );
}
