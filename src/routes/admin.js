// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import { sendWhatsAppTextIfSession, sendWhatsAppTemplate } from "../services/whatsapp.js";

export function mountAdmin(router) {

  /* ===================== EVENTS ===================== */

  router.add("GET", "/api/admin/events", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC, id DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  router.add("POST", "/api/admin/events", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls } = b || {};
    if (!slug || !name || !starts_at || !ends_at) return bad("Missing required fields");

    const r = await env.DB.prepare(
      `INSERT INTO events
       (slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,'active'), ?7, ?8, ?9, unixepoch(), unixepoch())`
    ).bind(slug, name, venue || null, Number(starts_at), Number(ends_at), status, hero_url, poster_url, gallery_urls).run();

    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("PUT", "/api/admin/events/:id", requireRole("admin", async (req, env, _ctx, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(p.id || 0);
    if (!id) return bad("Invalid id");

    const { slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls } = b || {};
    if (!slug || !name || !starts_at || !ends_at) return bad("Missing required fields");

    await env.DB.prepare(
      `UPDATE events
          SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5,
              status=COALESCE(?6,'active'), hero_url=?7, poster_url=?8, gallery_urls=?9,
              updated_at=unixepoch()
        WHERE id=?10`
    ).bind(slug, name, venue || null, Number(starts_at), Number(ends_at), status, hero_url, poster_url, gallery_urls, id).run();

    return json({ ok: true });
  }));

  /* ===================== TICKET TYPES ===================== */

  router.add("GET", "/api/admin/events/:id/ticket-types", requireRole("admin", async (_req, env, _c, p) => {
    const eventId = Number(p.id || 0);
    if (!eventId) return bad("Invalid event id");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id=?1
        ORDER BY id ASC`
    ).bind(eventId).all();
    return json({ ok: true, items: q.results || [] });
  }));

  router.add("POST", "/api/admin/events/:id/ticket-types", requireRole("admin", async (req, env, _c, p) => {
    const eventId = Number(p.id || 0);
    if (!eventId) return bad("Invalid event id");
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { name, code, price_cents, capacity, per_order_limit, requires_gender } = b || {};
    if (!name) return bad("name required");

    const r = await env.DB.prepare(
      `INSERT INTO ticket_types
       (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
       VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,10), COALESCE(?7,0))`
    ).bind(
      eventId,
      name,
      code || null,
      Number(price_cents || 0),
      Number(capacity || 0),
      Number(per_order_limit || 10),
      Number(requires_gender || 0)
    ).run();

    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("PUT", "/api/admin/ticket-types/:id", requireRole("admin", async (req, env, _c, p) => {
    const id = Number(p.id || 0);
    if (!id) return bad("Invalid id");
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { name, code, price_cents, capacity, per_order_limit, requires_gender } = b || {};
    if (!name) return bad("name required");

    await env.DB.prepare(
      `UPDATE ticket_types
          SET name=?1, code=?2, price_cents=?3, capacity=?4, per_order_limit=?5, requires_gender=?6
        WHERE id=?7`
    ).bind(
      name,
      code || null,
      Number(price_cents || 0),
      Number(capacity || 0),
      Number(per_order_limit || 10),
      Number(requires_gender || 0),
      id
    ).run();

    return json({ ok: true });
  }));

  /* ===================== TICKETS (REPORT) ===================== */

  router.add("GET", "/api/admin/tickets/summary/:eventId", requireRole("admin", async (_req, env, _c, p) => {
    const eventId = Number(p.eventId || 0);
    if (!eventId) return bad("Invalid event id");

    const totals = await env.DB.prepare(
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END) AS unused,
          SUM(CASE WHEN state='in' THEN 1 ELSE 0 END)     AS in_count,
          SUM(CASE WHEN state='out' THEN 1 ELSE 0 END)    AS out_count,
          SUM(CASE WHEN state='void' THEN 1 ELSE 0 END)   AS void_count
         FROM tickets WHERE event_id=?1`
    ).bind(eventId).first();

    const recent = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, o.short_code
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         LEFT JOIN orders o    ON o.id = t.order_id
        WHERE t.event_id = ?1
        ORDER BY t.id DESC
        LIMIT 50`
    ).bind(eventId).all();

    const byType = await env.DB.prepare(
      `SELECT tt.name AS type_name, COUNT(*) AS cnt
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.event_id = ?1
        GROUP BY tt.name
        ORDER BY cnt DESC`
    ).bind(eventId).all();

    return json({
      ok: true,
      totals: totals || { total:0, unused:0, in_count:0, out_count:0, void_count:0 },
      recent: recent.results || [],
      by_type: byType.results || []
    });
  }));

  router.add("GET", "/api/admin/orders/by-code/:code", requireRole("admin", async (_req, env, _c, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("Missing code");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, total_cents, buyer_name, buyer_email, buyer_phone
         FROM orders WHERE UPPER(short_code)=UPPER(?1)`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    const ev = await env.DB.prepare(`SELECT id, slug, name FROM events WHERE id=?1`).bind(o.event_id).first();
    const t = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, tt.name AS type_name
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id=?1
        ORDER BY t.id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, event: ev, tickets: t.results || [] });
  }));

  /* ===================== POS ADMIN ===================== */

  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    const sess = await env.DB.prepare(
      `SELECT s.id, s.cashier_name, s.event_id, s.gate_id, s.opened_at, s.closed_at, s.opening_float_cents, s.closing_manager
         FROM pos_sessions s
        ORDER BY s.id DESC LIMIT 200`
    ).all();

    const ids = (sess.results || []).map(r => r.id);
    let payMap = new Map();
    if (ids.length) {
      const q = await env.DB.prepare(
        `SELECT session_id,
                SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
           FROM pos_payments
          WHERE session_id IN (${ids.map(()=>'?').join(',')})
          GROUP BY session_id`
      ).bind(...ids).all();
      (q.results || []).forEach(r => payMap.set(r.session_id, r));
    }

    const out = [];
    for (const s of (sess.results || [])) {
      const p = payMap.get(s.id) || { cash_cents:0, card_cents:0 };
      const gate = await env.DB.prepare(`SELECT name FROM gates WHERE id=?1`).bind(s.gate_id).first();
      const ev  = await env.DB.prepare(`SELECT name FROM events WHERE id=?1`).bind(s.event_id).first();
      out.push({
        ...s,
        gate_name: gate?.name || String(s.gate_id),
        event_name: ev?.name || String(s.event_id),
        cash_cents: Number(p.cash_cents||0),
        card_cents: Number(p.card_cents||0)
      });
    }
    return json({ ok:true, sessions: out });
  }));

  /* ===================== VENDORS ===================== */

  router.add("GET", "/api/admin/vendors", requireRole("admin", async (req, env) => {
    const url = new URL(req.url);
    const eventId = Number(url.searchParams.get("event_id") || 0);
    if (!eventId) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota
         FROM vendors WHERE event_id=?1 ORDER BY id ASC`
    ).bind(eventId).all();
    return json({ ok:true, vendors: q.results || [] });
  }));

  router.add("POST", "/api/admin/vendors", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota } = b || {};
    if (!event_id || !name) return bad("event_id and name required");
    const r = await env.DB.prepare(
      `INSERT INTO vendors
       (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7,0), COALESCE(?8,0))`
    ).bind(
      Number(event_id), name, contact_name || null, phone || null, email || null, stand_number || null,
      Number(staff_quota || 0), Number(vehicle_quota || 0)
    ).run();
    return json({ ok:true, id: r.meta.last_row_id });
  }));

  router.add("PUT", "/api/admin/vendors/:id", requireRole("admin", async (req, env, _c, p) => {
    const id = Number(p.id || 0);
    if (!id) return bad("Invalid id");
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const { name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota } = b || {};
    if (!name) return bad("name required");
    await env.DB.prepare(
      `UPDATE vendors
          SET name=?1, contact_name=?2, phone=?3, email=?4, stand_number=?5,
              staff_quota=COALESCE(?6,0), vehicle_quota=COALESCE(?7,0)
        WHERE id=?8`
    ).bind(name, contact_name || null, phone || null, email || null, stand_number || null,
           Number(staff_quota || 0), Number(vehicle_quota || 0), id).run();
    return json({ ok:true });
  }));

  // NEW: Send passes to vendor via WhatsApp
  router.add("POST", "/api/admin/vendors/:id/send-wa", requireRole("admin", async (_req, env, _c, p) => {
    const id = Number(p.id || 0);
    if (!id) return bad("Invalid id");

    const v = await env.DB.prepare(
      `SELECT id, event_id, name, phone FROM vendors WHERE id=?1`
    ).bind(id).first();
    if (!v) return bad("Vendor not found", 404);
    if (!v.phone) return bad("Vendor has no phone");

    const passes = await env.DB.prepare(
      `SELECT id, type, label, vehicle_reg, qr, state
         FROM vendor_passes WHERE vendor_id=?1 ORDER BY id ASC`
    ).bind(id).all();

    const list = (passes.results || []).map(p =>
      `• ${p.type.toUpperCase()}${p.label? ' - '+p.label:''}${p.vehicle_reg? ' ('+p.vehicle_reg+')':''}\n  QR: ${p.qr}`
    ).join('\n');

    const body =
      `Hallo ${v.name || 'verkoper'}!\n` +
      `Jou Skou-passe is gereed:\n\n` +
      (list || 'Geen passe gevind nie.') +
      `\n\nWys QR-kodes by die hek vir toegang.`;

    // Try session text first; fallback to template if needed
    try {
      const j = await sendWhatsAppTextIfSession(env, String(v.phone), body);
      return json({ ok:true, mode:"text", response:j });
    } catch (e) {
      try {
        const j2 = await sendWhatsAppTemplate(env, String(v.phone), body, (env.WHATSAPP_TEMPLATE_LANG || "en_US"));
        return json({ ok:true, mode:"template", response:j2 });
      } catch (e2) {
        return bad(String(e2), 400);
      }
    }
  }));

  /* ===================== USERS ===================== */

  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok:true, users: q.results || [] });
  }));
}
