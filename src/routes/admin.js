// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

export function mountAdmin(router) {
  /* -------------------- Events (minimal list for selects) -------------------- */
  router.add("GET", "/api/admin/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status
         FROM events
        ORDER BY starts_at DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  });

  /* ----------------------- Ticket summaries per event ----------------------- */
  // GET /api/admin/tickets/summary?event_id=1
  router.add("GET", "/api/admin/tickets/summary", async (req, env) => {
    const url = new URL(req.url);
    const event_id = Number(url.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const rows = await env.DB.prepare(
      `SELECT
         tt.id      AS ticket_type_id,
         tt.name    AS type_name,
         tt.price_cents,
         COALESCE(SUM(1), 0)                            AS total,
         COALESCE(SUM(CASE WHEN t.state='unused' THEN 1 END), 0) AS unused,
         COALESCE(SUM(CASE WHEN t.state='in'     THEN 1 END), 0) AS in_count,
         COALESCE(SUM(CASE WHEN t.state='out'    THEN 1 END), 0) AS out_count,
         COALESCE(SUM(CASE WHEN t.state='void'   THEN 1 END), 0) AS void_count
       FROM ticket_types tt
       LEFT JOIN tickets t
              ON t.ticket_type_id = tt.id AND t.event_id = tt.event_id
      WHERE tt.event_id = ?1
      GROUP BY tt.id, tt.name, tt.price_cents
      ORDER BY tt.id ASC`
    ).bind(event_id).all();

    const list = (rows.results || []).map(r => ({
      ticket_type_id: Number(r.ticket_type_id),
      type_name: r.type_name,
      price_cents: Number(r.price_cents || 0),
      total: Number(r.total || 0),
      unused: Number(r.unused || 0),
      in: Number(r.in_count || 0),
      out: Number(r.out_count || 0),
      void: Number(r.void_count || 0),
    }));

    // overall line
    const sum = list.reduce((a, r) => {
      a.total += r.total; a.unused += r.unused; a.in += r.in; a.out += r.out; a.void += r.void;
      a.value_cents += r.total * r.price_cents; return a;
    }, { total: 0, unused: 0, in: 0, out: 0, void: 0, value_cents: 0 });

    return json({ ok: true, event_id, list, totals: sum });
  });

  /* -------------------------- Order lookup by code -------------------------- */
  // GET /api/admin/orders/by-code/:code
  router.add("GET", "/api/admin/orders/by-code/:code", async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // Order (by short_code)
    const oQ = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, buyer_name, buyer_email, buyer_phone, total_cents
         FROM orders WHERE UPPER(short_code) = ?1 LIMIT 1`
    ).bind(code).all();
    const order = (oQ.results || [])[0];
    if (!order) return bad("Not found", 404);

    // Tickets for the order
    const tQ = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(order.id).all();

    return json({
      ok: true,
      order,
      tickets: tQ.results || [],
      ticket_link: `${(env.PUBLIC_BASE_URL || "").replace(/\/$/, "")}/t/${order.short_code}`
    });
  });

  /* --------------------- Send tickets via WhatsApp (admin) ------------------ */
  // POST /api/admin/orders/:code/send-wa  { to?: "2771...", template?, lang? }
  router.add("POST", "/api/admin/orders/:code/send-wa", async (req, env, _ctx, p) => {
    let b = {}; try { b = await req.json(); } catch {}
    const code = String(p.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // lookup order for default phone and name
    const oQ = await env.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).all();
    const order = (oQ.results || [])[0];
    if (!order) return bad("Order not found", 404);

    const to = String(b.to || order.buyer_phone || "").trim();
    if (!to) return bad("No WhatsApp number");

    const link = `${(env.PUBLIC_BASE_URL || "").replace(/\/$/, "")}/t/${order.short_code}`;
    const template = b.template || env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery";
    const lang = b.lang || env.WHATSAPP_TEMPLATE_LANG || "af";

    // Reuse existing WhatsApp endpoint mounted elsewhere
    const payload = {
      to,
      kind: "template",
      template,
      lang,
      // common simple structure your /api/whatsapp/send supports:
      // body (optional greeting name) and url button param
      body: order.buyer_name || "",
      button_url: link
    };

    const resp = await fetch(new URL("/api/whatsapp/send", req.url).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const j = await resp.json().catch(() => ({}));

    if (!j.ok) return bad(j.error || "Failed to send", 502);
    return json({ ok: true, sent_to: to, code, link });
  });

  /* ------------------------------ Vendors CRUD ------------------------------ */
  // List vendors by event
  router.add("GET", "/api/admin/vendors", async (req, env) => {
    const url = new URL(req.url);
    const event_id = Number(url.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, name, contact_name, phone, email, stand_number,
              staff_quota, vehicle_quota
         FROM vendors
        WHERE event_id = ?1
        ORDER BY name ASC`
    ).bind(event_id).all();
    return json({ ok: true, vendors: q.results || [] });
  });

  // Create vendor
  router.add("POST", "/api/admin/vendors/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = Number(b?.event_id || 0);
    const name = String(b?.name || "").trim();
    if (!event_id || !name) return bad("event_id & name required");

    const r = await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(
      event_id, name,
      String(b.contact_name || ""),
      String(b.phone || ""),
      String(b.email || ""),
      String(b.stand_number || ""),
      Number(b.staff_quota || 0),
      Number(b.vehicle_quota || 0)
    ).run();
    return json({ ok: true, id: r.meta.last_row_id });
  });

  // Update vendor
  router.add("POST", "/api/admin/vendors/:id/update", async (req, env, _ctx, p) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(p.id || 0);
    if (!id) return bad("id required");

    await env.DB.prepare(
      `UPDATE vendors SET
         name=?1, contact_name=?2, phone=?3, email=?4,
         stand_number=?5, staff_quota=?6, vehicle_quota=?7
       WHERE id=?8`
    ).bind(
      String(b.name || ""),
      String(b.contact_name || ""),
      String(b.phone || ""),
      String(b.email || ""),
      String(b.stand_number || ""),
      Number(b.staff_quota || 0),
      Number(b.vehicle_quota || 0),
      id
    ).run();

    return json({ ok: true, id });
  });

  // Delete vendor
  router.add("POST", "/api/admin/vendors/:id/delete", async (_req, env, _ctx, p) => {
    const id = Number(p.id || 0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM vendors WHERE id=?1`).bind(id).run();
    return json({ ok: true, id });
  });
}
