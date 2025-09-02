// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { createEvent, listEvents, addTicketType, getCatalog } from "../services/events.js";
import { q, qi } from "../env.js";

export function mountAdmin(router) {
  // ----- Events -----

  // List events
  router.add("GET", "/api/admin/events", async (_req, env) => {
    const events = await listEvents(env.DB);
    return json({ ok: true, events });
  });

  // Create event
  router.add("POST", "/api/admin/events", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.slug || !b?.name || !b?.starts_at || !b?.ends_at) {
      return bad("Missing fields");
    }
    const id = await createEvent(env.DB, b);
    return json({ ok: true, id });
  });

  // Read one event (for edit panel)
  router.add("GET", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    const rows = await q(env.DB, "SELECT * FROM events WHERE id=?", Number(id));
    if (!rows[0]) return bad("Not found", 404);
    return json({ ok: true, event: rows[0] });
  });

  // Update event (supports hero/poster/gallery)
  router.add("PUT", "/api/admin/events/:id", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(() => null);
    if (!b) return bad("Invalid body");

    const fields = [
      "slug",
      "name",
      "venue",
      "starts_at",
      "ends_at",
      "status",
      "hero_url",
      "poster_url",
      "gallery_urls",
    ];
    const set = [];
    const args = [];
    for (const f of fields) {
      if (b[f] !== undefined) {
        set.push(`${f}=?`);
        args.push(b[f]);
      }
    }
    if (!set.length) return bad("No changes");

    args.push(Number(id));
    await env.DB.prepare(`UPDATE events SET ${set.join(", ")}, updated_at=unixepoch() WHERE id=?`)
      .bind(...args)
      .run();

    const rows = await q(env.DB, "SELECT * FROM events WHERE id=?", Number(id));
    return json({ ok: true, event: rows[0] });
  });

  // Delete event
  router.add("DELETE", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    await env.DB.prepare("DELETE FROM events WHERE id=?").bind(Number(id)).run();
    return json({ ok: true });
  });

  // Catalog (event + ticket types) by event id
  router.add("GET", "/api/admin/events/:id/catalog", async (_req, env, _ctx, { id }) => {
    const cat = await getCatalog(env.DB, Number(id));
    return json({ ok: true, ...cat });
  });

  // ----- Ticket Types -----

  // Create ticket type (supports FREE price, optional gender, optional capacity)
  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(() => null);
    if (!b || !b.name) return bad("name required");

    // price_cents: allow FREE (0); default to 0 on blank/NaN
    const centsNum = Number(b.price_cents);
    const price_cents =
      Number.isFinite(centsNum) && centsNum >= 0 ? Math.round(centsNum) : 0;

    // capacity is optional/nullable (we're not using it in UI, but keep compatibility)
    const capRaw = b.capacity;
    const capNum =
      capRaw === undefined || capRaw === null || capRaw === "" ? null : Number(capRaw);
    const capacity = Number.isFinite(capNum) && capNum >= 0 ? capNum : null;

    const requires_gender = !!b.requires_gender; // checkbox to boolean

    const payload = {
      event_id: Number(id),
      name: String(b.name).trim(),
      price_cents,
      requires_gender,
      capacity, // may be null
    };

    const ttId = await addTicketType(env.DB, payload);
    return json({ ok: true, id: ttId });
  });

  // ----- Gates -----

  // List gates
  router.add("GET", "/api/admin/gates", async (_req, env) => {
    const gates = await q(env.DB, "SELECT * FROM gates ORDER BY id");
    return json({ ok: true, gates });
  });

  // Create gate
  router.add("POST", "/api/admin/gates", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.name) return bad("name required");
    const gid = await qi(env.DB, "INSERT INTO gates (name) VALUES (?)", b.name);
    return json({ ok: true, id: gid });
  });
}
