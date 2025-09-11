// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
// Optional: if you want to use your WhatsApp service helper
import { sendWhatsAppTemplate } from "../services/whatsapp.js";

/** Admin API */
export function mountAdmin(router) {

  /* ---------------------------------------------------------
   * EVENTS
   * ---------------------------------------------------------*/

  // List events (basic fields for admin)
  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC, id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  // Create/Update event
  // Body: { id?, slug, name, venue, starts_at, ends_at, status, hero_url?, poster_url?, gallery_urls? (JSON string or null) }
  router.add("POST", "/api/admin/events/upsert", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    const slug = String(b?.slug || "").trim();
    const name = String(b?.name || "").trim();
    const venue = b?.venue ?? null;
    const starts_at = Number(b?.starts_at || 0);
    const ends_at = Number(b?.ends_at || 0);
    const status = String(b?.status || "active").trim();
    const hero_url = b?.hero_url ?? null;
    const poster_url = b?.poster_url ?? null;
    const gallery_urls = b?.gallery_urls ?? null;

    if (!slug || !name || !starts_at || !ends_at) return bad("Missing fields");

    if (id) {
      await env.DB.prepare(
        `UPDATE events
            SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5, status=?6,
                hero_url=?7, poster_url=?8, gallery_urls=?9, updated_at = unixepoch()
          WHERE id=?10`
      ).bind(slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls, id).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO events (slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      ).bind(slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  /* ---------------------------------------------------------
   * TICKET TYPES (by event) + SUMMARY
   * ---------------------------------------------------------*/

  // List ticket types for event
  router.add("GET", "/api/admin/ticket-types", requireRole("admin", async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(event_id).all();

    return json({ ok: true, ticket_types: q.results || [] });
  }));

  // Upsert ticket type
  // Body: { id?, event_id, name, code?, price_cents, capacity, per_order_limit?, requires_gender? (0/1) }
  router.add("POST", "/api/admin/ticket-types/upsert", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    const name = String(b?.name || "").trim();
    const code = b?.code ?? null;
    const price_cents = Number(b?.price_cents || 0);
    const capacity = Number(b?.capacity || 0);
    const per_order_limit = Number(b?.per_order_limit || 0);
    const requires_gender = Number(b?.requires_gender || 0) ? 1 : 0;

    if (!event_id || !name) return bad("Missing fields");

    if (id) {
      await env.DB.prepare(
        `UPDATE ticket_types
            SET name=?1, code=?2, price_cents=?3, capacity=?4, per_order_limit=?5, requires_gender=?6
          WHERE id=?7 AND event_id=?8`
      ).bind(name, code, price_cents, capacity, per_order_limit, requires_gender, id, event_id).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO ticket_types (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(event_id, name, code, price_cents, capacity, per_order_limit, requires_gender).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  // Ticket summary per type for event (sold/unused/in/out)
  router.add("GET", "/api/admin/tickets/summary", requireRole("admin", async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    // Aggregate tickets by type
    const q = await env.DB.prepare(
      `SELECT tt.id AS ticket_type_id, tt.name,
              SUM(CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END) AS total_issued,
              SUM(CASE WHEN t.state = 'unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN t.state = 'in' THEN 1 ELSE 0 END) AS inside,
              SUM(CASE WHEN t.state = 'out' THEN 1 ELSE 0 END) AS outside
         FROM ticket_types tt
    LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.event_id = tt.event_id
        WHERE tt.event_id = ?1
        GROUP BY tt.id, tt.name
        ORDER BY tt.id ASC`
    ).bind(event_id).all();

    return json({ ok: true, rows: q.results || [] });
  }));

  /* ---------------------------------------------------------
   * ORDERS / TICKETS LOOKUP + WhatsApp send
   * ---------------------------------------------------------*/

  // Lookup order by short_code with items + tickets
  router.add("GET", "/api/admin/orders/lookup", requireRole("admin", async (req, env) => {
    const u = new URL(req.url);
    const code = String(u.searchParams.get("code") || "").trim();
    if (!code) return bad("code required");

    const order = await env.DB.prepare(
      `SELECT * FROM orders WHERE UPPER(short_code) = UPPER(?1) LIMIT 1`
    ).bind(code).first();

    if (!order) return json({ ok: true, order: null, items: [], tickets: [] });

    const items = await env.DB.prepare(
      `SELECT oi.id, oi.ticket_type_id, oi.qty, oi.price_cents, tt.name AS type_name
         FROM order_items oi
    LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        WHERE oi.order_id = ?1
        ORDER BY oi.id ASC`
    ).bind(order.id).all();

    const tickets = await env.DB.prepare(
      `SELECT t.*, tt.name AS type_name
         FROM tickets t
    LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(order.id).all();

    return json({ ok: true, order, items: items.results || [], tickets: tickets.results || [] });
  }));

  // Send order tickets via WhatsApp (template)
  // Body: { to: "2771...", template? (fallback env.WHATSAPP_TEMPLATE_NAME), lang? }
  router.add("POST", "/api/admin/orders/:id/send-wa", requireRole("admin", async (req, env, _ctx, p) => {
    const order_id = Number(p.id || 0);
    if (!order_id) return bad("order_id");

    let b; try { b = await req.json(); } catch { b = {}; }
    const to = String(b?.to || "").trim();
    if (!to) return bad("to msisdn required");

    // Load order + event for deep link
    const o = await env.DB.prepare(
      `SELECT o.id, o.short_code, o.event_id, o.total_cents, o.buyer_name,
              e.slug AS event_slug
         FROM orders o
    LEFT JOIN events e ON e.id = o.event_id
        WHERE o.id = ?1 LIMIT 1`
    ).bind(order_id).first();

    if (!o) return bad("order not found", 404);

    const base = (await env.DB.prepare(`SELECT value FROM site_settings WHERE key='PUBLIC_BASE_URL'`).first())?.value
              || env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za";
    const link = o.short_code ? `${base}/t/${o.short_code}` : base;

    // One-parameter template body: greeting/name + link (simple & robust).
    const templateName = b?.template || (await env.DB.prepare(`SELECT value FROM site_settings WHERE key='WHATSAPP_TEMPLATE_NAME'`).first())?.value || (env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery");
    const lang = b?.lang || (await env.DB.prepare(`SELECT value FROM site_settings WHERE key='WHATSAPP_TEMPLATE_LANG'`).first())?.value || (env.WHATSAPP_TEMPLATE_LANG || "af");

    const bodyText = `Hi ${o.buyer_name || ""} – jou kaartjies: ${link}`;

    try {
      // use service helper; it formats the request to Graph v20.0
      const res = await sendWhatsAppTemplate(env, to, bodyText, lang);
      return json({ ok: true, result: res });
    } catch (e) {
      return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  }));

  /* ---------------------------------------------------------
   * POS ADMIN – sessions + totals
   * ---------------------------------------------------------*/

  // List POS sessions with totals (cash/card) and closing manager
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    // We support both pos_sessions (older) and pos_payments rollups if present
    // Base: sessions
    const sess = await env.DB.prepare(
      `SELECT id, cashier_name, gate_id, opening_float_cents, opened_at, closed_at, closing_manager, event_id, cashier_msisdn
         FROM pos_sessions
        ORDER BY opened_at DESC, id DESC`
    ).all();

    const rows = [];
    for (const s of (sess.results || [])) {
      // Totals by payments table (if it exists)
      let cash = 0, card = 0;
      try {
        const pay = await env.DB.prepare(
          `SELECT
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
             FROM pos_payments WHERE session_id = ?1`
        ).bind(s.id).first();
        cash = Number(pay?.cash_cents || 0);
        card = Number(pay?.card_cents || 0);
      } catch { /* table may not exist */ }

      rows.push({
        ...s,
        total_cash_cents: cash,
        total_card_cents: card
      });
    }
    return json({ ok: true, sessions: rows });
  }));

  /* ---------------------------------------------------------
   * VENDORS + PASSES
   * ---------------------------------------------------------*/

  // List vendors for event
  router.add("GET", "/api/admin/vendors", requireRole("admin", async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const q = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota
         FROM vendors WHERE event_id = ?1 ORDER BY name ASC`
    ).bind(event_id).all();

    return json({ ok: true, vendors: q.results || [] });
  }));

  // Upsert vendor
  // Body: { id?, event_id, name, contact_name?, phone?, email?, stand_number?, staff_quota?, vehicle_quota? }
  router.add("POST", "/api/admin/vendors/upsert", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    const name = String(b?.name || "").trim();
    const contact_name = b?.contact_name ?? null;
    const phone = b?.phone ?? null;
    const email = b?.email ?? null;
    const stand_number = b?.stand_number ?? null;
    const staff_quota = Number(b?.staff_quota || 0);
    const vehicle_quota = Number(b?.vehicle_quota || 0);

    if (!event_id || !name) return bad("Missing fields");

    if (id) {
      await env.DB.prepare(
        `UPDATE vendors
            SET name=?1, contact_name=?2, phone=?3, email=?4, stand_number=?5, staff_quota=?6, vehicle_quota=?7
          WHERE id=?8 AND event_id=?9`
      ).bind(name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota, id, event_id).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  // List passes for vendor
  router.add("GET", "/api/admin/vendor-passes", requireRole("admin", async (req, env) => {
    const u = new URL(req.url);
    const vendor_id = Number(u.searchParams.get("vendor_id") || 0);
    if (!vendor_id) return bad("vendor_id required");

    const q = await env.DB.prepare(
      `SELECT id, vendor_id, type, label, vehicle_reg, qr, state, first_in_at, last_out_at, issued_at
         FROM vendor_passes WHERE vendor_id = ?1
        ORDER BY id ASC`
    ).bind(vendor_id).all();

    return json({ ok: true, passes: q.results || [] });
  }));

  // Add a pass for vendor
  // Body: { vendor_id, type: 'staff'|'vehicle', label?, vehicle_reg? }
  router.add("POST", "/api/admin/vendor-passes/add", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const vendor_id = Number(b?.vendor_id || 0);
    const type = (String(b?.type || "").toLowerCase() === "vehicle") ? "vehicle" : "staff";
    const label = b?.label ?? null;
    const vehicle_reg = type === "vehicle" ? (b?.vehicle_reg ?? null) : null;
    if (!vendor_id) return bad("vendor_id required");

    const qr = "VND-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const r = await env.DB.prepare(
      `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(vendor_id, type, label, vehicle_reg, qr).run();

    return json({ ok: true, id: r.meta.last_row_id, qr });
  }));

  /* ---------------------------------------------------------
   * USERS
   * ---------------------------------------------------------*/

  // List users
  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));

  // Upsert user (note: expects password_hash already hashed if provided)
  // Body: { id?, username, role ('admin'|'pos'|'scan'), password_hash? }
  router.add("POST", "/api/admin/users/upsert", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    const username = String(b?.username || "").trim();
    const role = String(b?.role || "").trim();
    const password_hash = (b?.password_hash != null) ? String(b.password_hash) : null;

    if (!username || !role) return bad("Missing fields");

    if (id) {
      if (password_hash) {
        await env.DB.prepare(
          `UPDATE users SET username=?1, role=?2, password_hash=?3 WHERE id=?4`
        ).bind(username, role, password_hash, id).run();
      } else {
        await env.DB.prepare(
          `UPDATE users SET username=?1, role=?2 WHERE id=?3`
        ).bind(username, role, id).run();
      }
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO users (username, role, password_hash) VALUES (?1, ?2, ?3)`
      ).bind(username, role, password_hash).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  // Optional: delete user
  router.add("POST", "/api/admin/users/delete", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM users WHERE id=?1`).bind(id).run();
    return json({ ok: true });
  }));

  /* ---------------------------------------------------------
   * SITE SETTINGS (WhatsApp + Yoco)
   * ---------------------------------------------------------*/

  // Read settings
  router.add("GET", "/api/admin/settings", requireRole("admin", async (_req, env) => {
    await env.DB.exec?.("CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT)");
    const q = await env.DB.prepare("SELECT key, value FROM site_settings").all();
    const map = {};
    for (const r of (q.results || [])) map[r.key] = r.value;
    return json({ ok: true, settings: map });
  }));

  // Update settings
  // Body: { entries: { KEY: value, ... } }  (keys are allow-listed)
  router.add("POST", "/api/admin/settings/update", requireRole("admin", async (req, env) => {
    await env.DB.exec?.("CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT)");

    let body;
    try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const entries = (body && body.entries) || body || {};

    const ALLOWED = new Set([
      // General
      "PUBLIC_BASE_URL",

      // WhatsApp
      "WHATSAPP_TOKEN",
      "WHATSAPP_TEMPLATE_NAME",
      "WHATSAPP_TEMPLATE_LANG",
      "VERIFY_TOKEN",
      "PHONE_NUMBER_ID",

      // Yoco
      "YOCO_MODE",           // "sandbox" | "live"
      "YOCO_CLIENT_ID",
      "YOCO_SCOPES",
      "YOCO_REDIRECT_URI",
      "YOCO_STATE"
    ]);

    if (typeof entries.YOCO_MODE === "string") {
      const v = entries.YOCO_MODE.toLowerCase();
      entries.YOCO_MODE = (v === "live" ? "live" : "sandbox");
    }
    if (Array.isArray(entries.YOCO_SCOPES)) {
      entries.YOCO_SCOPES = entries.YOCO_SCOPES.join(" ");
    }

    for (const [k, v] of Object.entries(entries)) {
      if (!ALLOWED.has(k)) continue;
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value)
              VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(k, String(v ?? "")).run();
    }

    return json({ ok: true });
  }));

}
