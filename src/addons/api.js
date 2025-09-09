// src/addons/api.js
// Works with your custom Router: router.add(method, path, handler)
// Tables: prefers wa_templates (else templates). Uses events, ticket_types, tickets, orders, vendor_passes.
// Env: WHATSAPP_TOKEN, PHONE_NUMBER_ID

// ---------- helpers ----------
async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
async function row(db, sql, ...bind) {
  return db.prepare(sql).bind(...bind).first();
}
async function all(db, sql, ...bind) {
  const r = await db.prepare(sql).bind(...bind).all();
  return r?.results || [];
}
async function run(db, sql, ...bind) {
  return db.prepare(sql).bind(...bind).run();
}
async function tableExists(env, name) {
  const r = await row(env.DB,
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?1", name);
  return !!r;
}
async function upsertTemplateRows(env, items) {
  const useWa = await tableExists(env, "wa_templates");
  const tbl = useWa ? "wa_templates" : "templates";
  const batch = [];
  for (const t of (items || [])) {
    const lang = t.language || t.lang || "en_US";
    batch.push(env.DB.prepare(
      `INSERT INTO ${tbl}(name, lang, status, category, is_default, updated_at)
       VALUES(?1, ?2, ?3, ?4, COALESCE((SELECT is_default FROM ${tbl} WHERE name=?1),0), strftime('%s','now'))
       ON CONFLICT(name) DO UPDATE SET lang=?2, status=?3, category=?4, updated_at=strftime('%s','now')`
    ).bind(t.name, lang, t.status || "PENDING", t.category || null));
  }
  if (batch.length) await env.DB.batch(batch);
  return tbl;
}
async function getDefaultTemplate(env) {
  const useWa = await tableExists(env, "wa_templates");
  const tbl = useWa ? "wa_templates" : "templates";
  const t = await row(env.DB, `SELECT name, lang FROM ${tbl} WHERE is_default=1 LIMIT 1`);
  // Fallback to your expected default
  return t || { name: "ticket_delivery", lang: "af" };
}
function ensureWhatsAppEnv(env) {
  const miss = [];
  if (!env.WHATSAPP_TOKEN) miss.push("WHATSAPP_TOKEN");
  if (!env.PHONE_NUMBER_ID) miss.push("PHONE_NUMBER_ID");
  if (miss.length) throw new Error("Missing env: " + miss.join(", "));
}
function nanoid(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

// ---------- register ----------
export function registerAddonRoutes(router) {
  // List templates
  router.add("GET", "/api/templates", async (_req, env) => {
    const useWa = await tableExists(env, "wa_templates");
    const tbl = useWa ? "wa_templates" : "templates";
    const list = await all(env.DB, `SELECT * FROM ${tbl} ORDER BY is_default DESC, name`);
    return json(list);
  });

  // Sync templates from Meta
  router.add("POST", "/api/templates/sync", async (_req, env) => {
    try {
      ensureWhatsAppEnv(env);
      const r = await fetch(
        `https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/message_templates?limit=200`,
        { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } }
      );
      const J = await r.json();
      const tbl = await upsertTemplateRows(env, J.data || []);
      return json({ ok: true, table: tbl, count: (J.data || []).length });
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  });

  // Edit template (set default / change lang)
  router.add("PUT", "/api/templates/:name", async (req, env, _ctx, params) => {
    const body = await readJson(req);
    if (!body) return json({ error: "Bad JSON" }, 400);
    const useWa = await tableExists(env, "wa_templates");
    const tbl = useWa ? "wa_templates" : "templates";
    if (body.is_default === 1) await run(env.DB, `UPDATE ${tbl} SET is_default=0`);
    await run(
      env.DB,
      `UPDATE ${tbl} SET
         is_default = COALESCE(?1, is_default),
         lang       = COALESCE(?2, lang),
         category   = COALESCE(?3, category),
         updated_at = strftime('%s','now')
       WHERE name=?4`,
      body.is_default, body.lang, body.category, params.name
    );
    return json({ ok: true });
  });

  // Generic WA send (uses default template if none provided)
  router.add("POST", "/api/whatsapp/send", async (req, env) => {
    try {
      ensureWhatsAppEnv(env);
      const b = await readJson(req);
      const to = b?.to;
      if (!to) return json({ error: "Missing 'to' (E.164 without +)" }, 400);

      const t = (b.template && b.lang)
        ? { name: b.template, lang: b.lang }
        : await getDefaultTemplate(env);

      const payload = {
        messaging_product: "whatsapp",
        to: String(to),
        type: "template",
        template: {
          name: t.name,
          language: { code: t.lang },
          ...(b.components ? { components: b.components } : {})
        }
      };

      const r = await fetch(
        `https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const J = await r.json();
      if (!r.ok) return json({ error: "meta_error", meta: J }, 502);
      return json({ ok: true, meta: J });
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  });

  // One-click: Order -> WhatsApp
  router.add("POST", "/api/admin/orders/:code/whatsapp", async (req, env, _ctx, params) => {
    const b = await readJson(req);
    const to = b?.to || b?.phone;
    if (!to) return json({ error: "Missing 'to' (E.164 without +)" }, 400);

    // Verify order exists
    const order = await row(env.DB,
      "SELECT id, code, event_id FROM orders WHERE code=?1 LIMIT 1", params.code);
    if (!order) return json({ error: "Order not found" }, 404);

    // Forward to /api/whatsapp/send (defaults apply)
    const resp = await fetch(new URL("/api/whatsapp/send", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    const J = await resp.json();
    return new Response(JSON.stringify(J), {
      status: resp.status,
      headers: { "content-type": "application/json" },
    });
  });

  // Event stats used by Tickets page (per ticket type)
  router.add("GET", "/api/events/:id/stats", async (_req, env, _ctx, params) => {
    const q = `
      SELECT tt.id AS ticket_type_id, tt.name,
             SUM(CASE WHEN t.state='sold'        THEN 1 ELSE 0 END) AS sold,
             SUM(CASE WHEN t.state='checked_in'  THEN 1 ELSE 0 END) AS checked_in,
             SUM(CASE WHEN t.state='void'        THEN 1 ELSE 0 END) AS void,
             COUNT(t.id) AS total,
             tt.capacity AS capacity
        FROM ticket_types tt
   LEFT JOIN tickets t ON t.ticket_type_id = tt.id
       WHERE tt.event_id = ?1
    GROUP BY tt.id, tt.name, tt.capacity
    ORDER BY tt.id`;
    const rows = await all(env.DB, q, params.id);
    return json(rows);
  });

  // Vendors: generate passes/badges
  router.add("POST", "/api/vendors/:id/passes", async (req, env, _ctx, params) => {
    const b = await readJson(req);
    const eventId = Number(b?.event_id || 0);
    const count = Math.max(1, Math.min(1000, Number(b?.count || 0)));
    if (!eventId) return json({ error: "event_id required" }, 400);
    if (!count) return json({ error: "count required" }, 400);

    const batch = [];
    for (let i = 0; i < count; i++) {
      const code = nanoid(8).toUpperCase();
      batch.push(
        env.DB.prepare(
          "INSERT INTO vendor_passes(vendor_id, event_id, pass_code, qr, state) VALUES(?1,?2,?3,?4,'unused')"
        ).bind(Number(params.id), eventId, code, code)
      );
    }
    if (batch.length) await env.DB.batch(batch);
    return json({ ok: true, generated: count });
  });
}
