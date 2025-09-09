// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

const asInt = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const nowSec = () => Math.floor(Date.now() / 1000);

/* Small settings helpers (persisted in D1) */
async function ensureSettingsTable(env) {
  await env.DB.exec?.(`CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
}
async function setSetting(env, key, value) {
  await ensureSettingsTable(env);
  await env.DB.prepare(
    `INSERT INTO site_settings(key,value) VALUES(?1,?2)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).bind(key, value).run();
}
async function getSettings(env) {
  await ensureSettingsTable(env);
  const q = await env.DB.prepare(`SELECT key, value FROM site_settings`).all();
  const m = {};
  for (const r of (q.results || [])) m[r.key] = r.value;
  return m;
}
function pickWA(envSettings, env) {
  // Prefer DB settings, fall back to env
  return {
    PUBLIC_BASE_URL: envSettings.public_base_url || env.PUBLIC_BASE_URL || "",
    WHATSAPP_TOKEN: envSettings.whatsapp_token || env.WHATSAPP_TOKEN || "",
    PHONE_NUMBER_ID: envSettings.whatsapp_phone_number_id || env.PHONE_NUMBER_ID || "",
    WHATSAPP_TEMPLATE_NAME: envSettings.whatsapp_template_name || env.WHATSAPP_TEMPLATE_NAME || "",
    WHATSAPP_TEMPLATE_LANG: envSettings.whatsapp_template_lang || env.WHATSAPP_TEMPLATE_LANG || "",
  };
}

export function mountAdmin(router) {
  /* -------------------- Events & Ticket Types -------------------- */

  router.add("GET", "/api/admin/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY starts_at DESC, id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  });

  router.add("GET", "/api/admin/ticket-types", async (req, env) => {
    const u = new URL(req.url);
    const event_id = asInt(u.searchParams.get("event_id"));
    if (!event_id) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id = ?1 ORDER BY id ASC`
    ).bind(event_id).all();
    return json({ ok: true, ticket_types: q.results || [] });
  });

  router.add("POST", "/api/admin/ticket-types/add", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = asInt(b.event_id);
    const name = String(b.name || "").trim();
    const price_cents = asInt(b.price_cents);
    const capacity = asInt(b.capacity);
    const per_order_limit = asInt(b.per_order_limit, 10);
    const requires_gender = b.requires_gender ? 1 : 0;
    if (!event_id || !name) return bad("event_id & name required");
    await env.DB.prepare(
      `INSERT INTO ticket_types
       (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
       VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)`
    ).bind(event_id, name, price_cents, capacity, per_order_limit, requires_gender).run();
    return json({ ok: true });
  });

  /* ------------------------- Tickets ----------------------------- */

  router.add("GET", "/api/admin/tickets/summary", async (req, env) => {
    const u = new URL(req.url);
    const event_id = asInt(u.searchParams.get("event_id"));
    if (!event_id) return bad("event_id required");

    const tt = await env.DB.prepare(
      `SELECT id, name, price_cents FROM ticket_types WHERE event_id = ?1 ORDER BY id`
    ).bind(event_id).all();

    const rows = (tt.results || []).map(r => ({
      ticket_type_id: r.id, name: r.name, price_cents: r.price_cents,
      total: 0, unused: 0, in: 0, out: 0, void: 0
    }));
    const map = new Map(rows.map(r => [r.ticket_type_id, r]));

    const c = await env.DB.prepare(
      `SELECT ticket_type_id, state, COUNT(*) cnt
         FROM tickets
        WHERE event_id = ?1
        GROUP BY ticket_type_id, state`
    ).bind(event_id).all();

    for (const r of (c.results || [])) {
      const m = map.get(r.ticket_type_id); if (!m) continue;
      const st = String(r.state || "unused"); const n = asInt(r.cnt);
      if (st === "in") m.in += n;
      else if (st === "out") m.out += n;
      else if (st === "void") m.void += n;
      else m.unused += n;
      m.total += n;
    }

    const totals = rows.reduce((a, r) => {
      a.total += r.total; a.unused += r.unused; a.in += r.in; a.out += r.out; a.void += r.void; return a;
    }, { total: 0, unused: 0, in: 0, out: 0, void: 0 });

    return json({ ok: true, rows, totals });
  });

  router.add("GET", "/api/admin/orders/:code", async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("code required");
    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, total_cents,
              buyer_name, buyer_email, buyer_phone, created_at, paid_at
         FROM orders WHERE UPPER(short_code) = UPPER(?1) LIMIT 1`
    ).bind(code).first();
    if (!o) return json({ ok: false, error: "Not found" }, { status: 404 });

    const items = await env.DB.prepare(
      `SELECT oi.ticket_type_id, oi.qty, oi.price_cents, tt.name
         FROM order_items oi
         JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        WHERE oi.order_id = ?1`
    ).bind(o.id).all();

    const tickets = await env.DB.prepare(
      `SELECT id, ticket_type_id, qr, state
         FROM tickets WHERE order_id = ?1 ORDER BY id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, items: items.results || [], tickets: tickets.results || [] });
  });

  // WhatsApp send (reads config from site_settings first)
  router.add("POST", "/api/admin/orders/send-whatsapp", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const to = String(body.to || "").trim();
    const code = String(body.code || "").trim();
    if (!to || !code) return bad("to & code required");

    const s = await getSettings(env);
    const cfg = pickWA(s, env);

    const BASE = cfg.PUBLIC_BASE_URL || "";
    const link = `${BASE}/t/${encodeURIComponent(code)}`;

    if (!cfg.WHATSAPP_TOKEN || !cfg.PHONE_NUMBER_ID || !cfg.WHATSAPP_TEMPLATE_NAME || !cfg.WHATSAPP_TEMPLATE_LANG) {
      return json({ ok: false, error: "WhatsApp not configured" }, { status: 400 });
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: cfg.WHATSAPP_TEMPLATE_NAME,
        language: { code: cfg.WHATSAPP_TEMPLATE_LANG },
        components: [
          { type: "body", parameters: [{ type: "text", text: link }] },
          // If your template has a URL button with {{1}} variable, this sets it:
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }
        ]
      }
    };

    const url = `https://graph.facebook.com/v20.0/${cfg.PHONE_NUMBER_ID}/messages`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return json({ ok: false, error: `WhatsApp error: ${t || r.status}` }, { status: 400 });
    }
    return json({ ok: true });
  });

  /* ------------------------- POS admin --------------------------- */

  router.add("GET", "/api/admin/pos/sessions", async (_req, env) => {
    const s = await env.DB.prepare(
      `SELECT s.id, s.cashier_name, s.gate_id, s.opened_at, s.closed_at, s.closing_manager,
              g.name AS gate_name
         FROM pos_sessions s
         LEFT JOIN gates g ON g.id = s.gate_id
        ORDER BY s.id DESC LIMIT 200`
    ).all();

    const ids = (s.results || []).map(r => r.id);
    let sums = new Map();
    if (ids.length) {
      const q = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method = 'pos_cash' THEN amount_cents ELSE 0 END) cash_cents,
                SUM(CASE WHEN method = 'pos_card' THEN amount_cents ELSE 0 END) card_cents
           FROM pos_payments
          WHERE session_id IN (${ids.map(() => "?").join(",")})
          GROUP BY session_id`
      ).bind(...ids).all();
      for (const r of (q.results || [])) sums.set(r.session_id, r);
    }

    const rows = (s.results || []).map(r => {
      const m = sums.get(r.id) || { cash_cents: 0, card_cents: 0 };
      return {
        id: r.id,
        cashier: r.cashier_name,
        gate: r.gate_name || r.gate_id,
        opened_at: r.opened_at,
        closed_at: r.closed_at,
        manager: r.closing_manager || "",
        cash_cents: +m.cash_cents || 0,
        card_cents: +m.card_cents || 0
      };
    });

    return json({ ok: true, sessions: rows });
  });

  /* --------------------------- Vendors --------------------------- */

  router.add("GET", "/api/admin/vendors", async (req, env) => {
    const u = new URL(req.url);
    const event_id = asInt(u.searchParams.get("event_id"));
    if (!event_id) return bad("event_id required");
    const v = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email, stand_number,
              staff_quota, vehicle_quota
         FROM vendors WHERE event_id = ?1 ORDER BY name ASC`
    ).bind(event_id).all();
    return json({ ok: true, vendors: v.results || [] });
  });

  router.add("POST", "/api/admin/vendors/add", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = asInt(b.event_id);
    const name = String(b.name || "").trim();
    if (!event_id || !name) return bad("event_id & name required");
    await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(
      event_id, name,
      String(b.contact_name || "").trim(),
      String(b.phone || "").trim(),
      String(b.email || "").trim(),
      String(b.stand_number || "").trim(),
      asInt(b.staff_quota), asInt(b.vehicle_quota)
    ).run();
    return json({ ok: true });
  });

  router.add("POST", "/api/admin/vendors/update", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = asInt(b.id);
    if (!id) return bad("id required");
    await env.DB.prepare(
      `UPDATE vendors
          SET name=?2, contact_name=?3, phone=?4, email=?5, stand_number=?6,
              staff_quota=?7, vehicle_quota=?8
        WHERE id=?1`
    ).bind(
      id,
      String(b.name || "").trim(),
      String(b.contact_name || "").trim(),
      String(b.phone || "").trim(),
      String(b.email || "").trim(),
      String(b.stand_number || "").trim(),
      asInt(b.staff_quota), asInt(b.vehicle_quota)
    ).run();
    return json({ ok: true });
  });

  /* ---------------------------- Users ---------------------------- */

  router.add("GET", "/api/admin/users", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  });

  router.add("POST", "/api/admin/users/add", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const username = String(b.username || "").trim();
    const role = String(b.role || "pos").trim();
    if (!username || !/^(admin|pos|scan)$/.test(role)) return bad("username & role(admin|pos|scan) required");
    await env.DB.prepare(
      `INSERT INTO users (username, role) VALUES (?1, ?2)`
    ).bind(username, role).run();
    return json({ ok: true });
  });

  router.add("POST", "/api/admin/users/delete", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = asInt(b.id);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM users WHERE id=?1`).bind(id).run();
    return json({ ok: true });
  });

  /* ------------------------- Site settings ----------------------- */

  // Read settings (merged view + flag)
  router.add("GET", "/api/admin/settings", async (_req, env) => {
    const s = await getSettings(env);
    const cfg = pickWA(s, env);
    const configured = !!(cfg.WHATSAPP_TOKEN && cfg.PHONE_NUMBER_ID && cfg.WHATSAPP_TEMPLATE_NAME && cfg.WHATSAPP_TEMPLATE_LANG);
    return json({
      ok: true,
      settings: {
        public_base_url: cfg.PUBLIC_BASE_URL,
        whatsapp_token: cfg.WHATSAPP_TOKEN ? "••••" : "",
        whatsapp_phone_number_id: cfg.PHONE_NUMBER_ID,
        whatsapp_template_name: cfg.WHATSAPP_TEMPLATE_NAME,
        whatsapp_template_lang: cfg.WHATSAPP_TEMPLATE_LANG,
        configured
      }
    });
  });

  // Update settings (stores into site_settings)
  router.add("POST", "/api/admin/settings/update", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const keys = [
      "public_base_url",
      "whatsapp_token",
      "whatsapp_phone_number_id",
      "whatsapp_template_name",
      "whatsapp_template_lang",
    ];
    for (const k of keys) {
      if (b[k] !== undefined) await setSetting(env, k, String(b[k] || ""));
    }
    return json({ ok: true });
  });
}
