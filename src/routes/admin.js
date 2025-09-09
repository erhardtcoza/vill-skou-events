// /src/routes/admin.js
import { json, bad, withCORS } from "../utils/http.js";

/** Ensure a tiny key/value settings table exists */
async function ensureSettingsTable(db) {
  await db.exec?.(`CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
}

async function getSetting(db, key) {
  await ensureSettingsTable(db);
  const r = await db.prepare(`SELECT value FROM site_settings WHERE key = ?1`).bind(key).all();
  return (r.results?.[0]?.value) ?? null;
}

async function setSettings(db, obj) {
  await ensureSettingsTable(db);
  const tx = await db.batch?.(
    Object.entries(obj).map(([k, v]) =>
      db.prepare(`INSERT INTO site_settings(key,value) VALUES(?1,?2)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(k, String(v ?? "")))
  );
  return tx;
}

function pickEnvOr(dbVal, envVal) {
  return (envVal && String(envVal).trim()) ? envVal : dbVal;
}

/** WhatsApp Graph sender (template with a single URL button param) */
async function sendWhatsAppTemplate({ token, phoneNumberId, to, template, lang, urlParam }) {
  const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      components: urlParam ? [{
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: urlParam }]
      }] : undefined
    }
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${res.status}: ${text}`);
  return text;
}

export function mountAdmin(router) {
  // ---------------- Events (for dropdowns) ----------------
  router.add("GET", "/api/admin/events", withCORS(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, starts_at, ends_at, status FROM events ORDER BY starts_at ASC`
    ).all();
    return json({ ok: true, events: q.results ?? [] });
  }));

  // ---------------- Ticket summary by event ----------------
  router.add("GET", "/api/admin/tickets/summary", withCORS(async (req, env) => {
    const { searchParams } = new URL(req.url);
    const event_id = Number(searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    // per type
    const perType = await env.DB.prepare(
      `SELECT tt.id AS type_id, tt.name, tt.price_cents,
              COUNT(t.id) AS total,
              SUM(CASE WHEN t.state='unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN t.state='in' THEN 1 ELSE 0 END) AS in_count,
              SUM(CASE WHEN t.state='out' THEN 1 ELSE 0 END) AS out_count,
              SUM(CASE WHEN t.state='void' THEN 1 ELSE 0 END) AS void_count
         FROM ticket_types tt
         LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.event_id = ?1
        WHERE tt.event_id = ?1
        GROUP BY tt.id
        ORDER BY tt.id ASC`
    ).bind(event_id).all();

    // totals
    const totals = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN state='in' THEN 1 ELSE 0 END) AS in_count,
              SUM(CASE WHEN state='out' THEN 1 ELSE 0 END) AS out_count,
              SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN state='void' THEN 1 ELSE 0 END) AS void_count
         FROM tickets WHERE event_id = ?1`
    ).bind(event_id).all();

    return json({
      ok: true,
      per_type: perType.results ?? [],
      totals: (totals.results?.[0]) ?? { total: 0, in_count: 0, out_count: 0, unused: 0, void_count: 0 }
    });
  }));

  // ---------------- Order lookup (by short_code) ----------------
  router.add("GET", "/api/admin/order/by-code/:code", withCORS(async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("code required");

    const oQ = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, buyer_name, buyer_email, buyer_phone, total_cents
         FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
    ).bind(code).all();
    const order = oQ.results?.[0];
    if (!order) return json({ ok: false, error: "not_found" }, { status: 404 });

    const tQ = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, tt.name AS type_name, tt.price_cents
         FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1 ORDER BY t.id ASC`
    ).bind(order.id).all();

    return json({ ok: true, order, tickets: tQ.results ?? [] });
  }));

  // ---------------- Vendors CRUD ----------------
  router.add("GET", "/api/admin/vendors", withCORS(async (req, env) => {
    const { searchParams } = new URL(req.url);
    const event_id = Number(searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota
         FROM vendors WHERE event_id = ?1 ORDER BY name ASC`
    ).bind(event_id).all();
    return json({ ok: true, vendors: q.results ?? [] });
  }));

  router.add("POST", "/api/admin/vendors", withCORS(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const {
      event_id, name, contact_name, phone, email,
      stand_number, staff_quota = 0, vehicle_quota = 0
    } = b || {};
    if (!event_id || !name) return bad("event_id and name required");
    const r = await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    ).bind(event_id, name, contact_name, phone, email, stand_number, Number(staff_quota||0), Number(vehicle_quota||0)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("POST", "/api/admin/vendor/update", withCORS(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { id, ...patch } = b || {};
    if (!id) return bad("id required");
    const fields = [];
    const binds = [];
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k} = ?${fields.length + 1}`);
      binds.push(v);
    }
    if (!fields.length) return bad("No fields");
    binds.push(id);
    await env.DB.prepare(`UPDATE vendors SET ${fields.join(", ")} WHERE id = ?${binds.length}`).bind(...binds).run();
    return json({ ok: true });
  }));

  // ---------------- Users (simple) ----------------
  router.add("GET", "/api/admin/users", withCORS(async (_req, env) => {
    const q = await env.DB.prepare(`SELECT id, username, role FROM users ORDER BY id ASC`).all();
    return json({ ok: true, users: q.results ?? [] });
  }));
  router.add("POST", "/api/admin/users", withCORS(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { username, role } = b || {};
    if (!username || !role) return bad("username and role required");
    const r = await env.DB.prepare(`INSERT INTO users (username, role) VALUES (?1,?2)`).bind(username, role).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }));
  router.add("DELETE", "/api/admin/users/:id", withCORS(async (_req, env, _ctx, p) => {
    await env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(Number(p.id)).run();
    return json({ ok: true });
  }));

  // ---------------- Site settings (WhatsApp) ----------------
  router.add("GET", "/api/admin/site-settings", withCORS(async (_req, env) => {
    const keys = ["whatsapp_phone_number_id","whatsapp_business_id","whatsapp_access_token","whatsapp_template_name","whatsapp_template_lang","public_base_url"];
    const got = {};
    for (const k of keys) got[k] = await getSetting(env.DB, k);
    // env overrides if present
    got.public_base_url = pickEnvOr(got.public_base_url, env.PUBLIC_BASE_URL);
    got.whatsapp_phone_number_id = pickEnvOr(got.whatsapp_phone_number_id, env.PHONE_NUMBER_ID);
    got.whatsapp_business_id = pickEnvOr(got.whatsapp_business_id, env.BUSINESS_ID);
    got.whatsapp_access_token = pickEnvOr(got.whatsapp_access_token, env.WHATSAPP_ACCESS_TOKEN);
    got.whatsapp_template_name = pickEnvOr(got.whatsapp_template_name, env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery");
    got.whatsapp_template_lang = pickEnvOr(got.whatsapp_template_lang, env.WHATSAPP_TEMPLATE_LANG || "en_US");
    return json({ ok: true, settings: got });
  }));

  router.add("POST", "/api/admin/site-settings", withCORS(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    await setSettings(env.DB, {
      whatsapp_phone_number_id: b.whatsapp_phone_number_id ?? "",
      whatsapp_business_id: b.whatsapp_business_id ?? "",
      whatsapp_access_token: b.whatsapp_access_token ?? "",
      whatsapp_template_name: b.whatsapp_template_name ?? "ticket_delivery",
      whatsapp_template_lang: b.whatsapp_template_lang ?? "en_US",
      public_base_url: b.public_base_url ?? ""
    });
    return json({ ok: true });
  }));

  // ---------------- WhatsApp: send order’s ticket link ----------------
  router.add("POST", "/api/admin/whatsapp/send-order", withCORS(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const to = String(b.to || "").trim();          // e.g. 2771...
    const code = String(b.code || "").trim();      // order short_code (or /t/:code link code)
    if (!to || !code) return bad("to and code required");

    // Resolve settings (env wins, else DB)
    const phoneNumberId = pickEnvOr(await getSetting(env.DB,"whatsapp_phone_number_id"), env.PHONE_NUMBER_ID);
    const token = pickEnvOr(await getSetting(env.DB,"whatsapp_access_token"), env.WHATSAPP_ACCESS_TOKEN);
    const template = pickEnvOr(await getSetting(env.DB,"whatsapp_template_name"), env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery");
    const lang = pickEnvOr(await getSetting(env.DB,"whatsapp_template_lang"), env.WHATSAPP_TEMPLATE_LANG || "en_US");
    const baseUrl = pickEnvOr(await getSetting(env.DB,"public_base_url"), env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za");

    if (!phoneNumberId || !token) return bad("whatsapp_not_configured", 412);

    // Build ticket link (we use /t/:code which renders all tickets for that order)
    const link = `${baseUrl.replace(/\/$/,"")}/t/${encodeURIComponent(code)}`;

    try {
      const resp = await sendWhatsAppTemplate({
        token, phoneNumberId, to, template, lang, urlParam: link
      });
      return json({ ok: true, sent: true, resp });
    } catch (e) {
      return bad(`send_failed: ${e.message}`, 500);
    }
  }));
}