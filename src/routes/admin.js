// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

/**
 * Admin API:
 * - Events CRUD (slug/name/venue/start/end/status + hero_url/poster_url/gallery_urls)
 * - Gates (list/add)
 * - Ticket Types (robust insert; no NULL explosions)
 * - Site Settings (get/put; key/value table)
 */
export function mountAdmin(router) {
  /* ----------------------- SETTINGS ----------------------- */

  // GET all settings as an object
  router.add("GET", "/api/admin/settings", async (_req, env) => {
    try {
      const res = await env.DB.prepare("SELECT key, value FROM settings").all();
      const settings = {};
      for (const r of res.results || []) settings[r.key] = r.value;
      return json({ ok: true, settings });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // PUT selected settings (site_title, logo_url, favicon_url)
  router.add("PUT", "/api/admin/settings", async (req, env) => {
    let body;
    try { body = await req.json(); } catch { return bad("Invalid JSON"); }
    const pairs = [
      ["site_title", body?.site_title ?? ""],
      ["logo_url", body?.logo_url ?? ""],
      ["favicon_url", body?.favicon_url ?? ""],
    ];
    try {
      const stmt = await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      for (const [k, v] of pairs) await stmt.bind(k, String(v)).run();
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /* ----------------------- EVENTS ------------------------- */

  // List all events (admin view)
  router.add("GET", "/api/admin/events", async (_req, env) => {
    try {
      const res = await env.DB
        .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls
                  FROM events ORDER BY starts_at ASC`)
        .all();
      return json({ ok: true, events: res.results || [] });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Create event
  router.add("POST", "/api/admin/events", async (req, env) => {
    let b;
    try { b = await req.json(); } catch { return bad("Invalid JSON"); }

    if (!b?.slug || !b?.name) return bad("slug and name required");
    if (!Number.isFinite(b?.starts_at) || !Number.isFinite(b?.ends_at)) return bad("starts_at/ends_at invalid");

    const status = b.status || "active";
    try {
      await env.DB
        .prepare(`INSERT INTO events (slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          String(b.slug).trim(),
          String(b.name).trim(),
          (b.venue ?? null),
          Math.floor(b.starts_at),
          Math.floor(b.ends_at),
          status,
          b.hero_url ?? null,
          b.poster_url ?? null,
          b.gallery_urls ?? null
        )
        .run();

      const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
      return json({ ok: true, id: row?.id ?? null });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Read single event
  router.add("GET", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    try {
      const ev = await env.DB
        .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls
                  FROM events WHERE id=?`)
        .bind(Number(id))
        .first();
      if (!ev) return bad("Event not found", 404);
      return json({ ok: true, event: ev });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Update event
  router.add("PUT", "/api/admin/events/:id", async (req, env, _ctx, { id }) => {
    let b;
    try { b = await req.json(); } catch { return bad("Invalid JSON"); }

    // Validate (dates required by UI; keep robust)
    if (!b?.slug || !b?.name) return bad("slug and name required");
    if (!Number.isFinite(b?.starts_at) || !Number.isFinite(b?.ends_at)) return bad("starts_at/ends_at invalid");

    try {
      await env.DB
        .prepare(`UPDATE events
                  SET slug=?, name=?, venue=?, starts_at=?, ends_at=?, status=?,
                      hero_url=?, poster_url=?, gallery_urls=?
                  WHERE id=?`)
        .bind(
          String(b.slug).trim(),
          String(b.name).trim(),
          (b.venue ?? null),
          Math.floor(b.starts_at),
          Math.floor(b.ends_at),
          (b.status || "active"),
          b.hero_url ?? null,
          b.poster_url ?? null,
          b.gallery_urls ?? null,
          Number(id)
        )
        .run();
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Delete event (and its ticket types)
  router.add("DELETE", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    try {
      const eid = Number(id);
      await env.DB.prepare("DELETE FROM ticket_types WHERE event_id=?").bind(eid).run();
      await env.DB.prepare("DELETE FROM events WHERE id=?").bind(eid).run();
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /* ----------------------- GATES -------------------------- */

  // List gates
  router.add("GET", "/api/admin/gates", async (_req, env) => {
    try {
      const res = await env.DB.prepare("SELECT id, name FROM gates ORDER BY id ASC").all();
      return json({ ok: true, gates: res.results || [] });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Add gate
  router.add("POST", "/api/admin/gates", async (req, env) => {
    let b;
    try { b = await req.json(); } catch { return bad("Invalid JSON"); }
    const name = (b?.name || "").trim();
    if (!name) return bad("name required");
    try {
      await env.DB.prepare("INSERT INTO gates (name) VALUES (?)").bind(name).run();
      const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
      return json({ ok: true, id: row?.id ?? null });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /* -------------------- TICKET TYPES ---------------------- */

  // Create ticket type (robust: defaults, no NULLs)
  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, _ctx, { id }) => {
    let b;
    try { b = await req.json(); } catch { return bad("Invalid JSON"); }
    if (!b || !b.name) return bad("name required");

    const pcRaw = Number(b.price_cents);
    const price_cents = Number.isFinite(pcRaw) && pcRaw >= 0 ? Math.round(pcRaw) : 0;

    const capRaw = b.capacity;
    const capNum = (capRaw === undefined || capRaw === null || capRaw === "") ? 0 : Number(capRaw);
    const capacity = Number.isFinite(capNum) && capNum >= 0 ? capNum : 0;

    const requires_gender = b.requires_gender ? 1 : 0;

    try {
      // Ensure event exists
      const ev = await env.DB.prepare("SELECT id FROM events WHERE id=?").bind(Number(id)).first();
      if (!ev) return bad("Event not found", 404);

      // Insert
      await env.DB
        .prepare("INSERT INTO ticket_types (event_id, name, price_cents, requires_gender, capacity) VALUES (?, ?, ?, ?, ?)")
        .bind(ev.id, String(b.name).trim(), price_cents, requires_gender, capacity)
        .run();

      const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
      return json({ ok: true, id: row?.id ?? null });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // (Optional) list ticket types per event for admin inspection
  router.add("GET", "/api/admin/events/:id/ticket-types", async (_req, env, _ctx, { id }) => {
    try {
      const res = await env.DB
        .prepare("SELECT id, name, price_cents, requires_gender, capacity FROM ticket_types WHERE event_id=? ORDER BY id ASC")
        .bind(Number(id))
        .all();
      return json({ ok: true, ticket_types: res.results || [] });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}
