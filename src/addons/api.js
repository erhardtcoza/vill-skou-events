// src/addons/api.js
// Drop-in addon routes. Assumes env.DB (D1), env.WHATSAPP_TOKEN, env.PHONE_NUMBER_ID.
// Works with your existing tables: templates OR wa_templates, events, ticket_types, tickets, orders, vendor_passes.

import { nanoid } from "./util.js";

// --- helpers ----------------------------------------------------
async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
async function row(db, sql, ...bind) {
  return await db.prepare(sql).bind(...bind).first();
}
async function all(db, sql, ...bind) {
  const r = await db.prepare(sql).bind(...bind).all();
  return r?.results || [];
}
async function run(db, sql, ...bind) {
  return db.prepare(sql).bind(...bind).run();
}
async function upsertTemplateRows(env, items) {
  // Prefer wa_templates if present, else templates
  const hasWa = await row(env.DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='wa_templates'");
  const table = hasWa ? "wa_templates" : "templates";
  const bats = [];
  for (const t of items) {
    bats.push(env.DB.prepare(
      `INSERT INTO ${table}(name, lang, status, category, is_default, updated_at)
       VALUES(?1,?2,?3,?4, COALESCE((SELECT is_default FROM ${table} WHERE name=?1),0), strftime('%s','now'))
       ON CONFLICT(name) DO UPDATE SET lang=?2, status=?3, category=?4, updated_at=strftime('%s','now')`
    ).bind(t.name, t.language || t.lang, t.status, t.category || null));
  }
  if (bats.length) await env.DB.batch(bats);
  return table;
}
async function getDefaultTemplate(env) {
  const hasWa = await row(env.DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='wa_templates'");
  const table = hasWa ? "wa_templates" : "templates";
  const t = await row(env.DB, `SELECT name, lang FROM ${table} WHERE is_default=1 LIMIT 1`);
  return t || { name: "ticket_delivery", lang: "af" };
}
function requireWhatsAppEnv(env) {
  const miss = [];
  if (!env.WHATSAPP_TOKEN) miss.push("WHATSAPP_TOKEN");
  if (!env.PHONE_NUMBER_ID) miss.push("PHONE_NUMBER_ID");
  if (miss.length) throw new Error("Missing env: " + miss.join(", "));
}

// --- main router ------------------------------------------------
// call: registerAddonRoutes(app, env)
export function registerAddonRoutes(app, env) {
  // 1) Templates
  app.get("/api/templates", async () => {
    const hasWa = await row(env.DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='wa_templates'");
    const table = hasWa ? "wa_templates" : "templates";
    const list = await all(env.DB, `SELECT * FROM ${table} ORDER BY is_default DESC, name`);
    return json(list);
  });

  app.post("/api/templates/sync", async () => {
    requireWhatsAppEnv(env);
    const r = await fetch(`https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/message_templates?limit=200`, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
    });
    const J = await r.json();
    const table = await upsertTemplateRows(env, J.data || []);
    return json({ ok: true, table, count: (J.data || []).length });
  });

  app.put("/api/templates/:name", async (c) => {
    const name = c.req.param("name");
    const body = await readJson(c.req);
    if (!body) return json({ error: "Bad JSON" }, 400);
    const hasWa = await row(env.DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='wa_templates'");
    const table = hasWa ? "wa_templates" : "templates";
    if (body.is_default === 1) await run(env.DB, `UPDATE ${table} SET is_default=0`);
    await run(env.DB,
      `UPDATE ${table} SET 
        is_default=COALESCE(?1,is_default),
        lang=COALESCE(?2,lang),
        category=COALESCE(?3,category),
        updated_at=strftime('%s','now')
       WHERE name=?4`,
      body.is_default, body.lang, body.category, name
    );
    return json({ ok: true });
  });

  // 2) Generic WhatsApp send (uses default template if none provided)
  app.post("/api/whatsapp/send", async (c) => {
    try {
      requireWhatsAppEnv(env);
      const b = await readJson(c.req);
      if (!b?.to) return json({ error: "Missing 'to' (E.164 without +)" }, 400);
      const t = (b.template && b.lang) ? { name: b.template, lang: b.lang } : await getDefaultTemplate(env);
      const payload = {
        messaging_product: "whatsapp",
        to: String(b.to),
        type: "template",
        template: {
          name: t.name,
          language: { code: t.lang },
          ...(b.components ? { components: b.components } : {})
        }
      };
      const r = await fetch(`https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const J = await r.json();
      if (!r.ok) return json({ error: "meta_error", meta: J }, 502);
      return json({ ok: true, meta: J });
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  });

  // 3) Order → WhatsApp (one-click)  POST /api/admin/orders/:code/whatsapp { to }
  app.post("/api/admin/orders/:code/whatsapp", async (c) => {
    const code = c.req.param("code");
    const b = await readJson(c.req);
    const to = b?.to || b?.phone;
    if (!to) return json({ error: "Missing 'to' (E.164 without +)" }, 400);

    // Ensure order exists
    const order = await row(env.DB, "SELECT id, code, event_id FROM orders WHERE code=? LIMIT 1", code);
    if (!order) return json({ error: "Order not found" }, 404);

    // Forward to generic sender (default template = ticket_delivery/af if not set)
    const r = await fetch(new URL("/api/whatsapp/send", c.req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to })
    });
    const J = await r.json();
    return new Response(JSON.stringify(J), { status: r.status, headers: { "Content-Type": "application/json" } });
  });

  // 4) Event stats for Tickets page  GET /api/events/:id/stats
  app.get("/api/events/:id/stats", async (c) => {
    const id = c.req.param("id");
    // Adjust state names if your values differ
    const q = `
      SELECT tt.id as ticket_type_id, tt.name,
        SUM(CASE WHEN t.state='sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN t.state='checked_in' THEN 1 ELSE 0 END) as checked_in,
        SUM(CASE WHEN t.state='void' THEN 1 ELSE 0 END) as void,
        COUNT(t.id) as total,
        tt.capacity as capacity
      FROM ticket_types tt
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id
      WHERE tt.event_id = ?
      GROUP BY tt.id, tt.name, tt.capacity
      ORDER BY tt.id;
    `;
    const rows = await all(env.DB, q, id);
    return json(rows);
  });

  // 5) Vendors: generate passes  POST /api/vendors/:id/passes { event_id, count }
  app.post("/api/vendors/:id/passes", async (c) => {
    const vendorId = +c.req.param("id");
    const b = await readJson(c.req);
    const count = Math.max(1, Math.min(1000, b?.count | 0));
    const eventId = +b?.event_id;
    if (!eventId) return json({ error: "event_id required" }, 400);

    const batch = [];
    for (let i = 0; i < count; i++) {
      const code = nanoid(8).toUpperCase();
      batch.push(
        env.DB.prepare(
          "INSERT INTO vendor_passes(vendor_id, event_id, pass_code, qr, state) VALUES(?,?,?,?, 'unused')"
        ).bind(vendorId, eventId, code, code)
      );
    }
    await env.DB.batch(batch);
    return json({ ok: true, generated: count });
  });
}
