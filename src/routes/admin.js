// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { createEvent, listEvents, addTicketType, getCatalog } from "../services/events.js";
import { q, qi } from "../env.js";

export function mountAdmin(router) {
  // List events
  router.add("GET", "/api/admin/events", async (req, env) =>
    json({ ok: true, events: await listEvents(env.DB) })
  );

  // Create event
  router.add("POST", "/api/admin/events", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.slug || !b?.name || !b?.starts_at || !b?.ends_at) return bad("Missing fields");
    const id = await createEvent(env.DB, b);
    return json({ ok: true, id });
  });

  // Read one (for editing)
  router.add("GET", "/api/admin/events/:id", async (req, env, ctx, { id }) => {
    const rows = await q(env.DB, "SELECT * FROM events WHERE id=?", Number(id));
    if (!rows[0]) return bad("Not found", 404);
    return json({ ok: true, event: rows[0] });
  });

  // Update event (name/slug/venue/dates/status + images)
  router.add("PUT", "/api/admin/events/:id", async (req, env, ctx, { id }) => {
    const b = await req.json().catch(() => null);
    if (!b) return bad("Invalid body");
    const fields = [
      "slug","name","venue","starts_at","ends_at","status",
      "hero_url","poster_url","gallery_urls"
    ];
    const set = [];
    const args = [];
    for (const f of fields) {
      if (b[f] !== undefined) { set.push(`${f}=?`); args.push(b[f]); }
    }
    if (!set.length) return bad("No changes");
    args.push(Number(id));
    await env.DB.prepare(`UPDATE events SET ${set.join(", ")}, updated_at=unixepoch() WHERE id=?`).bind(...args).run();
    const rows = await q(env.DB, "SELECT * FROM events WHERE id=?", Number(id));
    return json({ ok: true, event: rows[0] });
  });

  // Delete event
  router.add("DELETE", "/api/admin/events/:id", async (req, env, ctx, { id }) => {
    await env.DB.prepare("DELETE FROM events WHERE id=?").bind(Number(id)).run();
    return json({ ok: true });
  });

  // Add ticket type (we’ll switch UI to rands later; backend still expects cents)
  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, ctx, { id }) => {
    const b = await req.json().catch(() => null);
    if (!b?.name || !b?.price_cents /* capacity optional now */) return bad("Missing fields");
    const ttId = await addTicketType(env.DB, { ...b, event_id: Number(id) });
    return json({ ok: true, id: ttId });
  });

  // Catalog
  router.add("GET", "/api/admin/events/:id/catalog", async (req, env, ctx, { id }) =>
    json({ ok: true, ...(await getCatalog(env.DB, Number(id))) })
  );

  // Gates
  router.add("GET", "/api/admin/gates", async (req, env) =>
    json({ ok: true, gates: await q(env.DB,"SELECT * FROM gates ORDER BY id") })
  );
  router.add("POST", "/api/admin/gates", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.name) return bad("name required");
    const gid = await qi(env.DB, "INSERT INTO gates (name) VALUES (?)", b.name);
    return json({ ok: true, id: gid });
  });
}
