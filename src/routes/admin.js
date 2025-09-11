// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin-facing endpoints (dashboard, events, tickets, vendors, users, settings) */
export function mountAdmin(router) {
  const guard = (fn) => requireRole("admin", fn);

  /* ---------------- Dashboard summary ---------------- */
  router.add("GET", "/api/admin/summary", guard(async (_req, env) => {
    const evQ = await env.DB.prepare(
      `SELECT id, slug, name
         FROM events
        WHERE status='active'
        ORDER BY starts_at ASC`
    ).all();

    // Ticket totals per active event
    const sums = {};
    for (const ev of (evQ.results || [])) {
      const tQ = await env.DB.prepare(
        `SELECT
           COUNT(*)                            AS total,
           SUM(state='unused')                 AS unused,
           SUM(state='in')                     AS inside,
           SUM(state='out')                    AS outside,
           SUM(state='void')                   AS voided
         FROM tickets
        WHERE event_id = ?1`
      ).bind(ev.id).first();

      sums[ev.id] = {
        total:   Number(tQ?.total  || 0),
        unused:  Number(tQ?.unused || 0),
        inside:  Number(tQ?.inside || 0),
        outside: Number(tQ?.outside|| 0),
        voided:  Number(tQ?.voided || 0),
      };
    }

    return json({ ok: true, events: evQ.results || [], ticket_totals: sums });
  }));

  /* ---------------- Site settings (stored in site_settings table) -------------- */
  // Schema: CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)
  router.add("GET", "/api/admin/settings", guard(async (_req, env) => {
    const s = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key = 'site' LIMIT 1`
    ).first();
    let settings = {};
    try { settings = s?.value ? JSON.parse(s.value) : {}; } catch {}
    return json({ ok: true, settings });
  }));

  router.add("POST", "/api/admin/settings/update", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const settings = JSON.stringify(b?.settings || {});

    await env.DB.prepare(
      `INSERT INTO site_settings (key, value) VALUES ('site', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(settings).run();

    return json({ ok: true });
  }));

  /* ---------------- Events ---------------- */
  router.add("GET", "/api/admin/events", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  router.add("GET", "/api/admin/events/:id", guard(async (_req, env, _ctx, { id }) => {
    const ev = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE id = ?1
        LIMIT 1`
    ).bind(Number(id)).first();
    if (!ev) return bad("Not found", 404);
    return json({ ok: true, event: ev });
  }));

  router.add("POST", "/api/admin/events/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id  = Number(b?.id || 0);
    const now = Math.floor(Date.now() / 1000);

    const fields = {
      slug: (b.slug || "").trim(),
      name: (b.name || "").trim(),
      venue: (b.venue || "").trim(),
      starts_at: Number(b.starts_at || 0),
      ends_at: Number(b.ends_at || 0),
      status: (b.status || "active").trim(),
      hero_url: b.hero_url || null,
      poster_url: b.poster_url || null,
      gallery_urls: b.gallery_urls || null,
    };

    if (id) {
      await env.DB.prepare(
        `UPDATE events
            SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5, status=?6,
                hero_url=?7, poster_url=?8, gallery_urls=?9, updated_at=?10
          WHERE id=?11`
      ).bind(
        fields.slug, fields.name, fields.venue, fields.starts_at, fields.ends_at, fields.status,
        fields.hero_url, fields.poster_url, fields.gallery_urls, now, id
      ).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO events
           (slug, name, venue, starts_at, ends_at, status,
            hero_url, poster_url, gallery_urls, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`
      ).bind(
        fields.slug, fields.name, fields.venue, fields.starts_at, fields.ends_at, fields.status,
        fields.hero_url, fields.poster_url, fields.gallery_urls, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  /* ---------------- Ticket types for an event ---------------- */
  router.add("GET", "/api/admin/events/:id/ticket-types", guard(async (_req, env, _ctx, { id }) => {
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(Number(id)).all();
    return json({ ok: true, ticket_types: q.results || [] });
  }));

  router.add("POST", "/api/admin/ticket-types/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id       = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    if (!event_id) return bad("event_id required");

    const fields = {
      name: (b.name || "").trim(),
      code: (b.code || null),
      price_cents: Number(b.price_cents || 0),
      capacity: Number(b.capacity || 0),
      per_order_limit: Number(b.per_order_limit || 10),
      requires_gender: Number(b.requires_gender || 0) ? 1 : 0,
    };

    if (id) {
      await env.DB.prepare(
        `UPDATE ticket_types
            SET name=?1, code=?2, price_cents=?3, capacity=?4, per_order_limit=?5, requires_gender=?6
          WHERE id=?7 AND event_id=?8`
      ).bind(
        fields.name, fields.code, fields.price_cents, fields.capacity,
        fields.per_order_limit, fields.requires_gender, id, event_id
      ).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO ticket_types
           (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(
        event_id, fields.name, fields.code, fields.price_cents, fields.capacity,
        fields.per_order_limit, fields.requires_gender
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  router.add("POST", "/api/admin/ticket-types/delete", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM ticket_types WHERE id=?1`).bind(id).run();
    return json({ ok: true });
  }));

  /* ---------------- Tickets: per-event summary + order lookup ------------ */
  router.add("GET", "/api/admin/tickets/summary", guard(async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const rows = await env.DB.prepare(
      `SELECT tt.id AS ticket_type_id, tt.name,
              COUNT(t.id)                         AS total,
              SUM(t.state='unused')               AS unused,
              SUM(t.state='in')                   AS inside,
              SUM(t.state='out')                  AS outside,
              SUM(t.state='void')                 AS voided
         FROM ticket_types tt
    LEFT JOIN tickets t ON t.ticket_type_id = tt.id
        WHERE tt.event_id = ?1
        GROUP BY tt.id
        ORDER BY tt.id`
    ).bind(event_id).all();

    return json({ ok: true, summary: rows.results || [] });
  }));

  // Order lookup by short_code (used in Tickets > Lookup)
  router.add("GET", "/api/admin/orders/by-code/:code", guard(async (_req, env, _ctx, { code }) => {
    const c = String(code || "").trim();
    if (!c) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, payment_method, total_cents,
              buyer_name, buyer_email, buyer_phone, created_at, paid_at
         FROM orders
        WHERE UPPER(short_code) = UPPER(?1)
        LIMIT 1`
    ).bind(c).first();

    if (!o) return json({ ok: false, error: `Kon nie bestelling vind met kode ${c} nie.` }, 404);

    const tickets = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last, t.phone,
              tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, tickets: tickets.results || [] });
  }));

  /* ---------------- POS Admin: sessions with cash/card totals ------------ */
  router.add("GET", "/api/admin/pos/sessions", guard(async (_req, env) => {
    const sQ = await env.DB.prepare(
      `SELECT ps.id, ps.cashier_name, ps.event_id, ps.gate_id, g.name AS gate_name,
              ps.opened_at, ps.closed_at, ps.closing_manager, ps.opening_float_cents
         FROM pos_sessions ps
         LEFT JOIN gates g ON g.id = ps.gate_id
        ORDER BY ps.id DESC`
    ).all();

    const sessions = sQ.results || [];

    // Aggregate totals from pos_payments
    const tQ = await env.DB.prepare(
      `SELECT session_id,
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
         FROM pos_payments
        GROUP BY session_id`
    ).all();

    const totals = {};
    for (const r of (tQ.results || [])) {
      totals[r.session_id] = {
        cash_cents: Number(r.cash_cents || 0),
        card_cents: Number(r.card_cents || 0),
      };
    }

    const out = sessions.map(s => ({
      ...s,
      gate_name: s.gate_name || String(s.gate_id || ""),
      cash_cents: totals[s.id]?.cash_cents || 0,
      card_cents: totals[s.id]?.card_cents || 0,
    }));

    return json({ ok: true, sessions: out });
  }));

  /* ---------------- Vendors + passes ------------------------------------ */
  router.add("GET", "/api/admin/vendors", guard(async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const vQ = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email,
              stand_number, staff_quota, vehicle_quota
         FROM vendors
        WHERE event_id = ?1
        ORDER BY name ASC`
    ).bind(event_id).all();

    return json({ ok: true, vendors: vQ.results || [] });
  }));

  router.add("POST", "/api/admin/vendors/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id       = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    if (!event_id) return bad("event_id required");

    const fields = {
      name: (b.name || "").trim(),
      contact_name: (b.contact_name || null),
      phone: (b.phone || null),
      email: (b.email || null),
      stand_number: (b.stand_number || null),
      staff_quota: Number(b.staff_quota || 0),
      vehicle_quota: Number(b.vehicle_quota || 0),
    };

    if (id) {
      await env.DB.prepare(
        `UPDATE vendors
            SET name=?1, contact_name=?2, phone=?3, email=?4,
                stand_number=?5, staff_quota=?6, vehicle_quota=?7
          WHERE id=?8 AND event_id=?9`
      ).bind(
        fields.name, fields.contact_name, fields.phone, fields.email,
        fields.stand_number, fields.staff_quota, fields.vehicle_quota,
        id, event_id
      ).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO vendors
           (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
      ).bind(
        event_id, fields.name, fields.contact_name, fields.phone, fields.email,
        fields.stand_number, fields.staff_quota, fields.vehicle_quota
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  // Vendor passes: list
  router.add("GET", "/api/admin/vendor/:id/passes", guard(async (_req, env, _ctx, { id }) => {
    const v = await env.DB.prepare(
      `SELECT id, event_id, name
         FROM vendors
        WHERE id = ?1
        LIMIT 1`
    ).bind(Number(id)).first();
    if (!v) return bad("Vendor not found", 404);

    const pQ = await env.DB.prepare(
      `SELECT id, vendor_id, type, label, vehicle_reg, qr, state,
              first_in_at, last_out_at, issued_at
         FROM vendor_passes
        WHERE vendor_id = ?1
        ORDER BY id ASC`
    ).bind(Number(id)).all();

    return json({ ok: true, vendor: v, passes: pQ.results || [] });
  }));

  // Vendor passes: add
  router.add("POST", "/api/admin/vendor/:id/pass/add", guard(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const vendor_id = Number(id || 0);
    if (!vendor_id) return bad("vendor_id required");

    const type = (b.type || "").trim(); // 'staff' | 'vehicle'
    if (!(type === "staff" || type === "vehicle")) return bad("Invalid type");

    const label = (b.label || "").trim();
    const vehicle_reg = type === "vehicle" ? (b.vehicle_reg || "").trim() : null;
    const qr = ("VND-" + Math.random().toString(36).slice(2, 8)).toUpperCase();

    await env.DB.prepare(
      `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(vendor_id, type, label || null, vehicle_reg, qr).run();

    return json({ ok: true, qr });
  }));

  // Vendor passes: delete
  router.add("POST", "/api/admin/vendor/:id/pass/delete", guard(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const pid = Number(b?.pass_id || 0);
    if (!pid) return bad("pass_id required");
    await env.DB.prepare(
      `DELETE FROM vendor_passes
        WHERE id = ?1 AND vendor_id = ?2`
    ).bind(pid, Number(id || 0)).run();
    return json({ ok: true });
  }));

  /* ---------------- Users (read-only list for now) ----------------------- */
  router.add("GET", "/api/admin/users", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role
         FROM users
        ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));

  /* ---------------- WhatsApp helpers (admin-triggered send) -------------- */
  // Sends a template/message to a phone for a given order code.
  // Expects your /src/services/whatsapp.js with sendWhatsAppTemplate(env, to, body, lang)
  router.add("POST", "/api/admin/orders/:code/send-whatsapp", guard(async (req, env, _ctx, { code }) => {
    let b; try { b = await req.json(); } catch { b = {}; }
    const msisdn = String(b?.phone || "").trim();
    if (!msisdn) return bad("phone required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, buyer_name, total_cents
         FROM orders
        WHERE UPPER(short_code) = UPPER(?1)
        LIMIT 1`
    ).bind(String(code || "")).first();
    if (!o) return bad("Order not found", 404);

    // Dynamic import (keeps worker happy if file missing)
    let sendFn = null;
    try {
      const mod = await import("../services/whatsapp.js");
      sendFn = mod.sendWhatsAppTemplate || null;
    } catch {
      return bad("WhatsApp service not available");
    }

    const publicBase = (await currentPublicBase(env)) || (env.PUBLIC_BASE_URL || "");
    const link = o.short_code ? `${publicBase}/t/${o.short_code}` : publicBase;
    const body = `Jou kaartjies is gereed.\nBestel nommer: ${o.short_code}\n${link}`;

    try {
      await sendFn(env, msisdn, body, (env.WHATSAPP_TEMPLATE_LANG || "en_US"));
      return json({ ok: true });
    } catch (e) {
      return bad(String(e?.message || e || "WhatsApp send failed"), 500);
    }
  }));

  /* ---------------- Helper: read PUBLIC_BASE_URL from site_settings ------- */
  async function currentPublicBase(env) {
    const s = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key='site' LIMIT 1`
    ).first();
    try {
      const j = s?.value ? JSON.parse(s.value) : null;
      return j?.whatsapp?.PUBLIC_BASE_URL || j?.site?.PUBLIC_BASE_URL || null;
    } catch {
      return null;
    }
  }
}
