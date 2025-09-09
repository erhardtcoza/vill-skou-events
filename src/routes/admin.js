// src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import { sendWhatsAppTemplate } from "../services/whatsapp.js";

export function mountAdmin(router) {
  /* ---------------- Admin shell (HTML is served in /admin via index.js) ---- */
  // (All page HTML comes from ui/admin.js in /admin route; only APIs below.)

  /* ---------------- Events ---------------- */
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
    const { slug, name, venue, starts_at, ends_at, status } = b || {};
    if (!slug || !name || !starts_at || !ends_at) return bad("Missing required fields");
    const r = await env.DB.prepare(
      `INSERT INTO events (slug, name, venue, starts_at, ends_at, status)
       VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,'active'))`
    ).bind(slug, name, venue || null, Number(starts_at), Number(ends_at), status || "active").run();
    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("PUT", "/api/admin/events/:id", requireRole("admin", async (req, env, _ctx, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(p.id || 0);
    if (!id) return bad("Invalid id");
    const cols = ["slug","name","venue","starts_at","ends_at","status","hero_url","poster_url","gallery_urls"];
    const sets = [];
    const vals = [];
    for (const c of cols) if (c in b) { sets.push(`${c}=?`); vals.push(b[c]); }
    if (!sets.length) return bad("No changes");
    const sql = `UPDATE events SET ${sets.join(", ")}, updated_at = unixepoch() WHERE id = ?`;
    vals.push(id);
    await env.DB.prepare(sql).bind(...vals).run();
    return json({ ok: true });
  }));

  /* ---------------- Ticket types & ticket summary ---------------- */
  router.add("GET", "/api/admin/ticket-types/:eventId", requireRole("admin", async (_req, env, _c, p) => {
    const event_id = Number(p.eventId || 0);
    if (!event_id) return bad("eventId required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
    ).bind(event_id).all();
    return json({ ok: true, ticket_types: q.results || [] });
  }));

  router.add("POST", "/api/admin/ticket-types/:eventId", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = Number(p.eventId || 0);
    if (!event_id) return bad("eventId required");
    const { name, code, price_cents, capacity, per_order_limit, requires_gender } = b || {};
    if (!name) return bad("name required");
    const r = await env.DB.prepare(
      `INSERT INTO ticket_types (event_id, name, code, price_cents, capacity, per_order_limit, requires_gender)
       VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,10), COALESCE(?7,0))`
    ).bind(event_id, name, code || null, Number(price_cents || 0), Number(capacity || 0),
           Number(per_order_limit || 10), Number(requires_gender ? 1 : 0)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("PUT", "/api/admin/ticket-types/:id", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(p.id || 0);
    if (!id) return bad("id required");
    const up = ["name","code","price_cents","capacity","per_order_limit","requires_gender"];
    const sets = [], vals = [];
    for (const c of up) if (c in b) { sets.push(`${c}=?`); vals.push(b[c]); }
    if (!sets.length) return bad("No changes");
    vals.push(id);
    await env.DB.prepare(`UPDATE ticket_types SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
    return json({ ok: true });
  }));

  router.add("GET", "/api/admin/tickets/summary/:eventId", requireRole("admin", async (_req, env, _c, p) => {
    const event_id = Number(p.eventId || 0);
    if (!event_id) return bad("eventId required");
    const totals = await env.DB.prepare(
      `SELECT state, COUNT(*) AS n FROM tickets WHERE event_id=?1 GROUP BY state`
    ).bind(event_id).all();

    const byType = await env.DB.prepare(
      `SELECT tt.id AS ticket_type_id, tt.name, COUNT(t.id) AS sold
         FROM ticket_types tt
         LEFT JOIN tickets t ON t.ticket_type_id = tt.id
        WHERE tt.event_id=?1
        GROUP BY tt.id, tt.name
        ORDER BY tt.id`
    ).bind(event_id).all();

    return json({ ok: true, totals: totals.results || [], by_type: byType.results || [] });
  }));

  /* ---------------- POS Admin: sessions & cashups ---------------- */
  router.add("GET", "/api/admin/pos/sessions", requireRole("admin", async (_req, env) => {
    // sessions basic
    const s = await env.DB.prepare(
      `SELECT ps.id, ps.event_id, ps.cashier_name, ps.cashier_msisdn, ps.gate_id,
              ps.opened_at, ps.closed_at, ps.opening_float_cents, ps.closing_manager
         FROM pos_sessions ps
        ORDER BY ps.id DESC
        LIMIT 200`
    ).all();
    const sessions = s.results || [];

    // totals from pos_payments
    const totals = await env.DB.prepare(
      `SELECT session_id,
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
         FROM pos_payments
        GROUP BY session_id`
    ).all();
    const map = new Map((totals.results || []).map(r => [r.session_id, r]));

    const enriched = sessions.map(x => {
      const t = map.get(x.id) || {};
      return {
        ...x,
        cash_cents: Number(t.cash_cents || 0),
        card_cents: Number(t.card_cents || 0),
      };
    });
    return json({ ok: true, sessions: enriched });
  }));

  /* ---------------- Vendors ---------------- */
  router.add("GET", "/api/admin/vendors/:eventId", requireRole("admin", async (_req, env, _c, p) => {
    const event_id = Number(p.eventId || 0);
    if (!event_id) return bad("eventId required");
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email,
              stand_number, staff_quota, vehicle_quota
         FROM vendors WHERE event_id=?1 ORDER BY id DESC`
    ).bind(event_id).all();
    return json({ ok: true, vendors: q.results || [] });
  }));

  router.add("POST", "/api/admin/vendors/:eventId", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = Number(p.eventId || 0);
    if (!event_id) return bad("eventId required");
    const { name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota } = b || {};
    if (!name) return bad("name required");
    const r = await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7,0), COALESCE(?8,0))`
    ).bind(event_id, name, contact_name || null, phone || null, email || null,
           stand_number || null, Number(staff_quota || 0), Number(vehicle_quota || 0)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }));

  router.add("PUT", "/api/admin/vendors/:id", requireRole("admin", async (req, env, _c, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(p.id || 0);
    if (!id) return bad("id required");
    const cols = ["name","contact_name","phone","email","stand_number","staff_quota","vehicle_quota"];
    const sets = [], vals = [];
    for (const c of cols) if (c in b) { sets.push(`${c}=?`); vals.push(b[c]); }
    if (!sets.length) return bad("No changes");
    vals.push(id);
    await env.DB.prepare(`UPDATE vendors SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
    return json({ ok: true });
  }));

  /* ---------------- Users (read-only list for now) ---------------- */
  router.add("GET", "/api/admin/users", requireRole("admin", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));

  /* ---------------- WhatsApp: send by order code ---------------- */
  router.add("POST", "/api/admin/whatsapp/send", requireRole("admin", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const msisdn = String(b?.to || "").trim();
    const code = String(b?.code || "").trim();
    if (!msisdn || !code) return bad("to and code required");

    const o = await env.DB.prepare(
      `SELECT o.id, o.short_code, o.total_cents, o.buyer_name,
              e.slug AS event_slug
         FROM orders o
         JOIN events e ON e.id = o.event_id
        WHERE UPPER(o.short_code)=UPPER(?)
        LIMIT 1`
    ).bind(code).first();

    if (!o) return bad("Order not found", 404);

    // Body is just the buyer name or code — template determines layout
    const body = o.buyer_name ? o.buyer_name : o.short_code;
    const res = await sendWhatsAppTemplate(env, msisdn, body, env.WHATSAPP_TEMPLATE_LANG || "en_US");
    return json({ ok: true, response: res });
  }));

  /* ---------------- Site settings (placeholder) ------------------ */
  router.add("GET", "/api/admin/site-settings", requireRole("admin", async () => {
    return json({ ok: true, settings: { whatsapp: "managed via worker env", version: 1 } });
  }));
}