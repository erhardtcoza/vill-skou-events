// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

/** Admin / back-office API */
export function mountAdmin(router) {

  /* ----------------- helpers ----------------- */
  async function ensureSettingsTable(env) {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS site_settings (
         key   TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`
    ).run();
  }
  async function ensureWATemplateTable(env) {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS wa_templates (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         language TEXT NOT NULL,
         status TEXT,
         category TEXT,
         components TEXT
       )`
    ).run();
  }
  async function setSetting(env, key, value) {
    await ensureSettingsTable(env);
    await env.DB.prepare(
      `INSERT INTO site_settings(key, value)
         VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(key, value).run();
  }
  async function getSettingsMap(env) {
    await ensureSettingsTable(env);
    const q = await env.DB.prepare(`SELECT key, value FROM site_settings`).all();
    const m = {};
    for (const r of (q.results || [])) m[r.key] = r.value;
    return m;
  }

  /* ----------------- settings ----------------- */

  // Read all settings (used by Site settings UI)
  router.add("GET", "/api/admin/settings", async (_req, env) => {
    const s = await getSettingsMap(env);
    return json({ ok: true, settings: s });
  });

  // Save settings (expects {settings:{KEY:VALUE}})
  router.add("POST", "/api/admin/settings/update", async (req, env) => {
    try {
      const body = await req.json();
      const obj = body?.settings && typeof body.settings === "object" ? body.settings : null;
      if (!obj) return bad("settings object required");

      for (const [k, v] of Object.entries(obj)) {
        await setSetting(env, String(k), String(v ?? ""));
      }
      const s = await getSettingsMap(env);
      return json({ ok: true, settings: s });
    } catch (e) {
      return bad("Failed to save settings: " + (e?.message || e), 500);
    }
  });

  /* -------- WhatsApp templates management ------ */

  // List templates from local table
  router.add("GET", "/api/admin/wa/templates", async (_req, env) => {
    await ensureWATemplateTable(env);
    const q = await env.DB.prepare(
      `SELECT id, name, language, status, category, components FROM wa_templates ORDER BY name, language`
    ).all();
    const items = (q.results || []).map(r => ({
      id: r.id,
      name: r.name,
      language: r.language,
      status: r.status,
      category: r.category,
      components: r.components ? JSON.parse(r.components) : []
    }));
    return json({ ok: true, templates: items });
  });

  // Sync from Meta Graph using saved settings (WA_BUSINESS_ID + WA_TOKEN)
  router.add("POST", "/api/admin/wa/templates/sync", async (_req, env) => {
    await ensureWATemplateTable(env);
    const s = await getSettingsMap(env);
    const biz = s.WA_BUSINESS_ID || s.BUSINESS_ID;   // allow either key
    const token = s.WA_TOKEN || s.WHATSAPP_TOKEN || s.GRAPH_TOKEN;

    if (!biz || !token) return bad("WA_BUSINESS_ID and WA_TOKEN required");

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(biz)}/message_templates?limit=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    if (!res.ok) {
      const txt = await res.text();
      return bad("Failed to fetch from Meta: " + txt, 502);
    }
    const data = await res.json(); // {data:[{name,language,status,category,components:[...]}], paging?...}

    // store (truncate + upsert)
    await env.DB.prepare(`DELETE FROM wa_templates`).run();
    const items = Array.isArray(data?.data) ? data.data : [];
    for (const t of items) {
      await env.DB.prepare(
        `INSERT INTO wa_templates (name, language, status, category, components)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(t.name, t.language, t.status || "", t.category || "", JSON.stringify(t.components || [])).run();
    }
    return json({ ok: true, count: items.length });
  });

  /* ----------------- events ----------------- */

  router.add("GET", "/api/admin/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status FROM events ORDER BY starts_at ASC`
    ).all();
    return json({ ok: true, events: (q.results || []) });
  });

  router.add("GET", "/api/admin/events/:event_id/ticket-types", async (_req, env, _c, p) => {
    const id = Number(p.event_id || 0);
    if (!id) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(id).all();
    return json({ ok: true, ticket_types: (q.results || []) });
  });

  /* ----------------- vendors ----------------- */

  // list by event
  router.add("GET", "/api/admin/vendors", async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota
         FROM vendors WHERE event_id = ?1
         ORDER BY name ASC`
    ).bind(event_id).all();
    return json({ ok: true, vendors: (q.results || []) });
  });

  router.add("POST", "/api/admin/vendors/add", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const event_id = Number(b?.event_id || 0);
    const name = (b?.name || "").trim();
    if (!event_id || !name) return bad("event_id and name required");
    const { contact_name = "", phone = "", email = "", stand_number = "", staff_quota = 0, vehicle_quota = 0 } = b;
    const r = await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(event_id, name, contact_name, phone, email, stand_number, Number(staff_quota||0), Number(vehicle_quota||0)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  });

  router.add("POST", "/api/admin/vendors/update", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const id = Number(b?.id || 0);
    if (!id) return bad("id required");
    const fields = {
      name: (b?.name ?? null),
      contact_name: (b?.contact_name ?? null),
      phone: (b?.phone ?? null),
      email: (b?.email ?? null),
      stand_number: (b?.stand_number ?? null),
      staff_quota: (b?.staff_quota ?? null),
      vehicle_quota: (b?.vehicle_quota ?? null)
    };
    const sets = [];
    const binds = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined) { sets.push(`${k} = ?`); binds.push(v); }
    }
    if (!sets.length) return json({ ok: true }); // nothing to change
    binds.push(id);
    await env.DB.prepare(
      `UPDATE vendors SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...binds).run();
    return json({ ok: true });
  });

  /* -------- order lookup used in Tickets tab -------- */

  router.add("GET", "/api/admin/orders/by-code/:code", async (_req, env, _c, p) => {
    const code = String(p.code || "").trim();
    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, total_cents, buyer_name, buyer_email, buyer_phone
         FROM orders WHERE UPPER(short_code) = UPPER(?1) LIMIT 1`
    ).bind(code).first();

    if (!o) return bad("Not found", 404);

    const t = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, tt.name AS type_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, tickets: (t.results || []) });
  });

  // WhatsApp send using settings + chosen template
  router.add("POST", "/api/admin/orders/:code/whatsapp", async (req, env, _c, p) => {
    const code = String(p.code || "").trim();
    const b = await req.json().catch(()=> ({}));
    const to = String(b?.to || "").replace(/\s+/g,"");
    const template = String(b?.template || "");
    const lang = String(b?.lang || "");
    const s = await getSettingsMap(env);

    const phoneId = s.WA_PHONE_NUMBER_ID || s.PHONE_NUMBER_ID;
    const token   = s.WA_TOKEN || s.WHATSAPP_TOKEN || s.GRAPH_TOKEN;
    const baseURL = s.PUBLIC_BASE_URL || s.PUBLIC_BASE_URL_LOWER || "";
    if (!phoneId || !token) return bad("WhatsApp not configured", 400);
    if (!to) return bad("Recipient missing");

    // simple link body: https://host/t/:code
    const link = `${baseURL.replace(/\/+$/,"")}/t/${encodeURIComponent(code)}`;

    const payload = template
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: template,
            language: { code: lang || "en_US" },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }, { type: "text", text: link }] },
              { type: "button", sub_type: "url", index: "0",
                parameters: [{ type: "text", text: code }] } // for dynamic URL button if template has it
            ]
          }
        }
      : {
          // fallback free-form text
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: true, body: `Jou kaartjies: ${link} (kode: ${code})` }
        };

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const jr = await res.json().catch(()=> ({}));
    if (!res.ok) return bad("Graph error: " + JSON.stringify(jr), 502);
    return json({ ok: true, result: jr });
  });

}
