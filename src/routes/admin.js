// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import { badgeHTML } from "../ui/badge.js";

/** Small helpers */
const asInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const now = () => Math.floor(Date.now() / 1000);

/** Normalize SA numbers to E.164 (keeps others if already +) */
function normalizeMsisdn(raw) {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  // SA common forms
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("27") && s.length >= 11) s = "+" + s;
  else if (s.startsWith("0") && s.length >= 10) s = "+27" + s.slice(1);
  else if (/^\d{11,15}$/.test(s)) s = "+" + s; // generic fallback
  return s;
}

export function mountAdmin(router) {
  /* Guard all admin API under /api/admin/* */
  const guard = (h) => requireRole("admin", h);

  /* ---------------- Events + ticket types (list/add) ---------------- */

  router.add("GET", "/api/admin/events", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events ORDER BY starts_at DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  router.add("GET", "/api/admin/ticket-types/:event_id", guard(async (_req, env, _c, p) => {
    const q = await env.DB.prepare(
      `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id = ?1 ORDER BY id ASC`
    ).bind(asInt(p.event_id)).all();
    return json({ ok: true, rows: q.results || [] });
  }));

  router.add("POST", "/api/admin/ticket-types/:event_id", guard(async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const evId = asInt(p.event_id);
    if (!evId) return bad("event_id missing");
    const name = String(b.name || "").trim();
    const price_cents = asInt(b.price_cents);
    const capacity = asInt(b.capacity);
    const per_order_limit = asInt(b.per_order_limit, 10);
    const requires_gender = b.requires_gender ? 1 : 0;
    if (!name) return bad("name required");
    await env.DB.prepare(
      `INSERT INTO ticket_types
        (event_id, name, price_cents, capacity, per_order_limit, requires_gender)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(evId, name, price_cents, capacity, per_order_limit, requires_gender).run();
    return json({ ok: true });
  }));

  /* ---------------- Tickets summary + order lookup ------------------ */

  router.add("GET", "/api/admin/tickets/summary/:event_id", guard(async (_req, env, _c, p) => {
    const evId = asInt(p.event_id);
    const q = await env.DB.prepare(
      `SELECT tt.id AS type_id, tt.name, tt.price_cents,
              SUM(1) AS total,
              SUM(CASE WHEN t.state='unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN t.state='in' THEN 1 ELSE 0 END) AS in_count,
              SUM(CASE WHEN t.state='out' THEN 1 ELSE 0 END) AS out_count,
              SUM(CASE WHEN t.state='void' THEN 1 ELSE 0 END) AS void_count
         FROM ticket_types tt
         LEFT JOIN tickets t ON t.ticket_type_id = tt.id
        WHERE tt.event_id = ?1
        GROUP BY tt.id
        ORDER BY tt.id ASC`
    ).bind(evId).all();

    const rows = (q.results || []).map(r => ({
      type_id: r.type_id,
      name: r.name,
      price_cents: r.price_cents,
      total: r.total || 0,
      unused: r.unused || 0,
      in_count: r.in_count || 0,
      out_count: r.out_count || 0,
      void_count: r.void_count || 0,
    }));

    const totals = rows.reduce((acc, r) => {
      acc.total += r.total; acc.unused += r.unused;
      acc.in += r.in_count; acc.out += r.out_count; acc.void += r.void_count;
      return acc;
    }, { total:0, unused:0, in:0, out:0, void:0 });

    return json({ ok: true, rows, totals });
  }));

  // Lookup tickets by order short code
  router.add("GET", "/api/admin/orders/by-code/:code", guard(async (_req, env, _c, p) => {
    const code = String(p.code || "").trim().toUpperCase();
    const oq = await env.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_email, buyer_phone, event_id
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).all();
    const order = (oq.results || [])[0];
    if (!order) return json({ ok:false, error:"Not found" }, { status:404 });

    const tq = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(order.id).all();

    return json({
      ok: true,
      order,
      tickets: tq.results || []
    });
  }));

  /* ---------------- POS sessions totals (cash/card) ----------------- */

  router.add("GET", "/api/admin/pos/sessions", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT s.id, s.cashier_name, g.name AS gate, s.opened_at, s.closed_at, s.closing_manager
         FROM pos_sessions s
         JOIN gates g ON g.id = s.gate_id
        ORDER BY s.id DESC`
    ).all();

    const rows = [];
    for (const r of (q.results || [])) {
      const p = await env.DB.prepare(
        `SELECT
            SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
            SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments WHERE session_id = ?1`
      ).bind(r.id).all();
      const sums = (p.results || [])[0] || {};
      rows.push({
        id: r.id,
        cashier_name: r.cashier_name,
        gate: r.gate,
        opened_at: r.opened_at,
        closed_at: r.closed_at,
        closing_manager: r.closing_manager || "",
        cash_cents: sums.cash_cents || 0,
        card_cents: sums.card_cents || 0
      });
    }

    return json({ ok: true, rows });
  }));

  /* ---------------- Vendors + passes ------------------------------- */

  router.add("GET", "/api/admin/vendors/:event_id", guard(async (_req, env, _c, p) => {
    const evId = asInt(p.event_id);
    const q = await env.DB.prepare(
      `SELECT id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota
         FROM vendors WHERE event_id = ?1 ORDER BY name ASC`
    ).bind(evId).all();
    return json({ ok: true, rows: q.results || [] });
  }));

  router.add("POST", "/api/admin/vendors/:event_id", guard(async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const evId = asInt(p.event_id);
    const name = String(b.name || "").trim();
    if (!name) return bad("name required");
    await env.DB.prepare(
      `INSERT INTO vendors
        (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(
      evId, name,
      String(b.contact_name || ""), String(b.phone || ""), String(b.email || ""),
      String(b.stand_number || ""),
      asInt(b.staff_quota), asInt(b.vehicle_quota)
    ).run();
    return json({ ok: true });
  }));

  router.add("PUT", "/api/admin/vendors/:id", guard(async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const id = asInt(p.id);
    await env.DB.prepare(
      `UPDATE vendors
          SET name=?1, contact_name=?2, phone=?3, email=?4,
              stand_number=?5, staff_quota=?6, vehicle_quota=?7
        WHERE id=?8`
    ).bind(
      String(b.name || ""), String(b.contact_name || ""), String(b.phone || ""),
      String(b.email || ""), String(b.stand_number || ""),
      asInt(b.staff_quota), asInt(b.vehicle_quota), id
    ).run();
    return json({ ok: true });
  }));

  // List passes for a vendor
  router.add("GET", "/api/admin/vendor-passes/:vendor_id", guard(async (_req, env, _c, p) => {
    const q = await env.DB.prepare(
      `SELECT id, type, label, vehicle_reg, qr, state, first_in_at, last_out_at, issued_at
         FROM vendor_passes
        WHERE vendor_id=?1 ORDER BY id ASC`
    ).bind(asInt(p.vendor_id)).all();
    return json({ ok: true, rows: q.results || [] });
  }));

  // Create a pass (staff or vehicle)
  router.add("POST", "/api/admin/vendor-passes/:vendor_id", guard(async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const vendor_id = asInt(p.vendor_id);
    const type = (String(b.type || "staff").toLowerCase() === "vehicle") ? "vehicle" : "staff";
    const label = String(b.label || "").trim();
    const vehicle_reg = type === "vehicle" ? String(b.vehicle_reg || "").trim() : null;
    const qr = (type === "vehicle" ? "VEH-" : "STA-")
             + Math.random().toString(36).slice(2, 10).toUpperCase();
    await env.DB.prepare(
      `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr, state, issued_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'unused', ?6)`
    ).bind(vendor_id, type, label, vehicle_reg, qr, now()).run();
    return json({ ok: true });
  }));

  // Printable badge page
  router.add("GET", "/admin/vendor-pass/:id", guard(async (_req, env, _c, p) => {
    const iq = await env.DB.prepare(
      `SELECT vp.id, vp.type, vp.label, vp.vehicle_reg, vp.qr,
              v.name AS vendor_name, e.name AS event_name, e.venue, e.starts_at, e.ends_at
         FROM vendor_passes vp
         JOIN vendors v ON v.id = vp.vendor_id
         JOIN events e ON e.id = v.event_id
        WHERE vp.id = ?1`
    ).bind(asInt(p.id)).all();
    const row = (iq.results || [])[0];
    if (!row) return new Response("Not found", { status: 404 });

    const title = row.type === "vehicle" ? "VEHICLE" : "STAFF";
    const html = badgeHTML({
      title,
      name: row.label || "",
      org: row.vendor_name || "",
      plate: row.type === "vehicle" ? (row.vehicle_reg || "") : "",
      code: row.qr,
      event: { name: row.event_name, venue: row.venue, starts_at: row.starts_at, ends_at: row.ends_at }
    });

    return new Response(html, { headers: { "content-type": "text/html" }});
  }));

  /* ---------------- WhatsApp: send tickets link -------------------- */

  router.add("POST", "/api/admin/whatsapp/send-order", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const code = String(b.code || "").trim().toUpperCase();
    let to = normalizeMsisdn(b.to);

    if (!code) return bad("code required");
    if (!to) return bad("valid recipient required");

    // Get order + buyer
    const oq = await env.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).all();
    const order = (oq.results || [])[0];
    if (!order) return bad("order not found", 404);

    const name = order.buyer_name || "Gaste";
    const buttonParam = order.short_code; // because template URL is /t/{{1}}
    const base = env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za";
    const ticketUrl = `${base}/t/${order.short_code}`;

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery",
        language: { code: env.WHATSAPP_TEMPLATE_LANG || "af" },
        components: [
          { type: "body", parameters: [{ type: "text", text: name }] },
          { type: "button", sub_type: "url", index: "0",
            parameters: [{ type: "text", text: buttonParam }] }
        ]
      }
    };

    const phoneId = env.PHONE_NUMBER_ID;
    const token = env.WHATSAPP_BEARER_TOKEN;
    if (!phoneId || !token) return bad("whatsapp not configured", 500);

    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const txt = await r.text();
    if (!r.ok) return bad(`Graph ${r.status}: ${txt}`, 502);

    return json({ ok: true, to, ticketUrl });
  }));
}
