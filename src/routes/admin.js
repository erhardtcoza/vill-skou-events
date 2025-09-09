// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** Admin API */
export function mountAdmin(router) {
  const guard = (h) => requireRole("admin", h);

  /* ---------------- Events: minimal list for dropdowns --------------- */
  router.add("GET", "/api/admin/events/basic", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, starts_at, ends_at, status
         FROM events ORDER BY starts_at DESC`
    ).all();
    return json({ ok:true, events: (q.results||[]).map(r => ({
      id: Number(r.id),
      slug: r.slug,
      name: r.name,
      starts_at: Number(r.starts_at||0),
      ends_at: Number(r.ends_at||0),
      status: r.status
    }))});
  }));

  /* ---------------- Tickets: per-type summary ------------------------ */
  router.add("GET", "/api/admin/tickets/summary", guard(async (req, env) => {
    const url = new URL(req.url);
    const event_id = Number(url.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const typesQ = await env.DB.prepare(
      `SELECT id, name, price_cents FROM ticket_types WHERE event_id=? ORDER BY id`
    ).bind(event_id).all();

    const statsQ = await env.DB.prepare(
      `SELECT ticket_type_id AS tid,
              COUNT(*) AS total,
              SUM(CASE WHEN state='unused' THEN 1 ELSE 0 END) AS unused,
              SUM(CASE WHEN state='in' THEN 1 ELSE 0 END) AS in_cnt,
              SUM(CASE WHEN state='out' THEN 1 ELSE 0 END) AS out_cnt,
              SUM(CASE WHEN state='void' THEN 1 ELSE 0 END) AS void_cnt
         FROM tickets
        WHERE event_id=?
        GROUP BY ticket_type_id`
    ).bind(event_id).all();

    const statMap = new Map((statsQ.results||[]).map(r => [Number(r.tid), r]));
    const rows = (typesQ.results||[]).map(t => {
      const s = statMap.get(Number(t.id)) || {};
      return {
        ticket_type_id: Number(t.id),
        name: t.name,
        price_cents: Number(t.price_cents||0),
        total: Number(s.total||0),
        unused: Number(s.unused||0),
        in: Number(s.in_cnt||0),
        out: Number(s.out_cnt||0),
        void: Number(s.void_cnt||0)
      };
    });

    const totals = rows.reduce((a,r)=>({
      total:a.total+r.total, unused:a.unused+r.unused, in:a.in+r.in,
      out:a.out+r.out, void:a.void+r.void
    }), {total:0,unused:0,in:0,out:0,void:0});

    return json({ ok:true, rows, totals });
  }));

  /* ---------------- Tickets: order lookup by short code -------------- */
  router.add("GET", "/api/admin/order/by-code/:code", guard(async (_req, env, _ctx, p) => {
    const code = String(p.code || "").trim();
    if (!code) return bad("code required");

    const orderQ = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, total_cents, buyer_name, buyer_email, buyer_phone
         FROM orders WHERE UPPER(short_code)=UPPER(?) LIMIT 1`
    ).bind(code).all();
    const order = (orderQ.results||[])[0];
    if (!order) return bad("Not found", 404);

    const itemsQ = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id=? ORDER BY t.id`
    ).bind(order.id).all();

    return json({ ok:true, order: {
      id: Number(order.id),
      short_code: order.short_code,
      event_id: Number(order.event_id),
      status: order.status,
      total_cents: Number(order.total_cents||0),
      buyer_name: order.buyer_name,
      buyer_email: order.buyer_email,
      buyer_phone: order.buyer_phone
    }, tickets: (itemsQ.results||[]).map(r => ({
      id: Number(r.id),
      qr: r.qr,
      state: r.state,
      type_name: r.type_name,
      price_cents: Number(r.price_cents||0)
    }))});
  }));

  /* ---------------- Tickets: WhatsApp send link ---------------------- */
  // Expects JSON: { phone: "27...", code:"ABC123" }
  // Sends template with a single URL button param: https://.../t/{code}
  router.add("POST", "/api/admin/order/send-wa", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const phone = String(b.phone||"").replace(/\D/g,"");
    const code  = String(b.code||"").trim();
    if (!phone || !code) return bad("phone and code required");

    const base = env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za";
    const link = `${base}/t/${code}`;

    const token = env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = env.PHONE_NUMBER_ID;
    const template = env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery";
    const lang = env.WHATSAPP_TEMPLATE_LANG || "af";

    if (!token || !phoneId) return bad("WhatsApp not configured", 501);

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [
          { type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: link }]
          }
        ]
      }
    };

    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const body = await r.text().catch(()=>"?");
      return bad(`WA send failed: ${body}`, 502);
    }
    return json({ ok:true });
  }));

  /* ---------------- Vendors: list / create / update ------------------ */
  router.add("GET", "/api/admin/vendors/list", guard(async (req, env) => {
    const url = new URL(req.url);
    const event_id = Number(url.searchParams.get("event_id")||0);
    if (!event_id) return bad("event_id required");
    const q = await env.DB.prepare(
      `SELECT id, name, contact_name, phone, email, stand_number,
              staff_quota, vehicle_quota
         FROM vendors WHERE event_id=? ORDER BY id`
    ).bind(event_id).all();
    return json({ ok:true, vendors: (q.results||[]).map(v=>({
      id:Number(v.id), name:v.name, contact_name:v.contact_name,
      phone:v.phone, email:v.email, stand_number:v.stand_number,
      staff_quota:Number(v.staff_quota||0), vehicle_quota:Number(v.vehicle_quota||0)
    }))});
  }));

  router.add("POST", "/api/admin/vendors/create", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = Number(b.event_id||0);
    const name = String(b.name||"").trim();
    if (!event_id || !name) return bad("event_id and name required");

    await env.DB.prepare(
      `INSERT INTO vendors (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    ).bind(
      event_id, name, b.contact_name||"", b.phone||"", b.email||"",
      b.stand_number||"", Number(b.staff_quota||0), Number(b.vehicle_quota||0)
    ).run();

    return json({ ok:true });
  }));

  router.add("POST", "/api/admin/vendors/update", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b.id||0);
    if (!id) return bad("id required");

    await env.DB.prepare(
      `UPDATE vendors SET
         name=?2, contact_name=?3, phone=?4, email=?5,
         stand_number=?6, staff_quota=?7, vehicle_quota=?8
       WHERE id=?1`
    ).bind(
      id, b.name||"", b.contact_name||"", b.phone||"", b.email||"",
      b.stand_number||"", Number(b.staff_quota||0), Number(b.vehicle_quota||0)
    ).run();

    return json({ ok:true });
  }));

  /* ---------------- Users: list / create / delete -------------------- */
  router.add("GET", "/api/admin/users/list", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role FROM users ORDER BY id`
    ).all();
    return json({ ok:true, users: (q.results||[]).map(u=>({
      id:Number(u.id), username:u.username, role:u.role
    }))});
  }));

  router.add("POST", "/api/admin/users/create", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const username = String(b.username||"").trim();
    const role = String(b.role||"").trim();
    if (!username || !role) return bad("username and role required");
    await env.DB.prepare(
      `INSERT INTO users (username, role) VALUES (?1, ?2)`
    ).bind(username, role).run();
    return json({ ok:true });
  }));

  router.add("POST", "/api/admin/users/delete", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b.id||0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM users WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));
}