// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

function asInt(x, d = 0) { return Number.isFinite(+x) ? +x : d; }
function nowSec() { return Math.floor(Date.now() / 1000); }

export function mountAdmin(router) {

  /* -------------------- Events & Ticket Types -------------------- */

  // List all events (used for dropdowns)
  router.add("GET", "/api/admin/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY starts_at DESC, id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  });

  // Ticket types for an event
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

  // Create a ticket type
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

  // Summary per ticket type (totals & states)
  router.add("GET", "/api/admin/tickets/summary", async (req, env) => {
    const u = new URL(req.url);
    const event_id = asInt(u.searchParams.get("event_id"));
    if (!event_id) return bad("event_id required");

    // ticket_types baseline
    const tt = await env.DB.prepare(
      `SELECT id, name, price_cents FROM ticket_types WHERE event_id = ?1 ORDER BY id`
    ).bind(event_id).all();
    const rows = (tt.results || []).map(r => ({
      ticket_type_id: r.id,
      name: r.name,
      price_cents: r.price_cents,
      total: 0, unused: 0, in: 0, out: 0, void: 0
    }));
    const map = new Map(rows.map(r => [r.ticket_type_id, r]));

    // counts by state
    const c = await env.DB.prepare(
      `SELECT ticket_type_id, state, COUNT(*) cnt
         FROM tickets
        WHERE event_id = ?1
        GROUP BY ticket_type_id, state`
    ).bind(event_id).all();

    for (const r of (c.results || [])) {
      const m = map.get(r.ticket_type_id); if (!m) continue;
      const st = String(r.state || "unused");
      const n = asInt(r.cnt);
      if (st === "in") m.in += n;
      else if (st === "out") m.out += n;
      else if (st === "void") m.void += n;
      else m.unused += n;
      m.total += n;
    }

    // grand totals
    const totals = rows.reduce((acc, r) => {
      acc.total += r.total; acc.unused += r.unused; acc.in += r.in; acc.out += r.out; acc.void += r.void;
      return acc;
    }, { total: 0, unused: 0, in: 0, out: 0, void: 0 });

    return json({ ok: true, rows, totals });
  });

  // Lookup order by short code, return tickets & items
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

  // Send tickets via WhatsApp (single button in UI)
  // Body: { to: "2771...", code: "ABC123" }
  router.add("POST", "/api/admin/orders/send-whatsapp", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const to = String(body.to || "").trim();
    const code = String(body.code || "").trim();
    if (!to || !code) return bad("to & code required");

    const BASE = env.PUBLIC_BASE_URL || "";
    const link = `${BASE}/t/${encodeURIComponent(code)}`;

    // If WA not configured, return a clear error for UI
    if (!env.WHATSAPP_TOKEN || !env.PHONE_NUMBER_ID || !env.WHATSAPP_TEMPLATE_NAME || !env.WHATSAPP_TEMPLATE_LANG) {
      return json({ ok: false, error: "WhatsApp not configured" }, { status: 400 });
    }

    // Simple text message fallback using "messages" API if template not desired
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: { code: env.WHATSAPP_TEMPLATE_LANG },
        components: [
          // If your template has a button with a variable {{1}}, this fills it:
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          // If you added a body placeholder for the link, also pass it as text:
          { type: "body", parameters: [{ type: "text", text: link }] }
        ]
      }
    };

    const url = `https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
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
    // sessions + gate + sums from pos_payments
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

  // List vendors for event
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

  // Add vendor
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

  // Update vendor
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

  // Vendor passes (list)
  router.add("GET", "/api/admin/vendor/passes", async (req, env) => {
    const u = new URL(req.url);
    const vendor_id = asInt(u.searchParams.get("vendor_id"));
    if (!vendor_id) return bad("vendor_id required");
    const p = await env.DB.prepare(
      `SELECT id, vendor_id, type, label, vehicle_reg, qr, state, first_in_at, last_out_at, issued_at
         FROM vendor_passes WHERE vendor_id = ?1 ORDER BY id ASC`
    ).bind(vendor_id).all();
    return json({ ok: true, passes: p.results || [] });
  });

  // Add a vendor pass
  router.add("POST", "/api/admin/vendor/passes/add", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const vendor_id = asInt(b.vendor_id);
    const type = String(b.type || "staff");
    if (!vendor_id || (type !== "staff" && type !== "vehicle")) return bad("vendor_id & valid type required");
    const label = String(b.label || "").trim();
    const vehicle_reg = String(b.vehicle_reg || "").trim();
    const qr = ("VP-" + Math.random().toString(36).slice(2, 10)).toUpperCase();
    await env.DB.prepare(
      `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr, state, issued_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'unused', ?6)`
    ).bind(vendor_id, type, label, vehicle_reg, qr, nowSec()).run();
    return json({ ok: true, qr });
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

  router.add("GET", "/api/admin/settings", async (_req, env) => {
    // We surface whether WA is configured; can expand later to editable settings
    const cfg = {
      public_base: env.PUBLIC_BASE_URL || "",
      whatsapp_configured: !!(env.WHATSAPP_TOKEN && env.PHONE_NUMBER_ID),
      whatsapp_template: env.WHATSAPP_TEMPLATE_NAME || "",
      whatsapp_lang: env.WHATSAPP_TEMPLATE_LANG || ""
    };
    return json({ ok: true, settings: cfg });
  });
}
