// src/routes/public.js
import { json, bad } from "../utils/http.js";

/* ---------------- small helpers ---------------- */
async function getSetting(env, key) {
  const row = await env.DB
    .prepare("SELECT value FROM site_settings WHERE key=?1 LIMIT 1")
    .bind(key)
    .first();
  return row ? row.value : null;
}
async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}
async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;
  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) await sendTpl(env, toMsisdn, fallbackText, lang, name);
    else if (sendTxt)   await sendTxt(env, toMsisdn, fallbackText);
  } catch {}
}
function nowTs() { return Math.floor(Date.now()/1000); }
async function hasColumn(env, tbl, col) {
  const r = await env.DB.prepare(`PRAGMA table_info(${tbl})`).all();
  return !!(r?.results || []).find(c => String(c.name) === col);
}
function makeShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "C";
  const buf = new Uint8Array(7);
  crypto.getRandomValues(buf);
  for (let i=0; i<buf.length; i++) s += chars[buf[i] % chars.length];
  return s;
}

/* ---------------- public endpoints ---------------- */
export function mountPublic(router) {
  // List active events
  router.add("GET", "/api/public/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE status='active'
        ORDER BY starts_at ASC`
    ).all();
    return json({ ok:true, events: q.results || [] });
  });

  // Event detail + ticket types
  router.add("GET", "/api/public/events/:slug", async (_req, env, _c, { slug }) => {
    const ev = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events WHERE slug=?1 LIMIT 1`
    ).bind(slug).first();
    if (!ev) return bad("Not found", 404);

    const tt = await env.DB.prepare(
      `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id=?1
        ORDER BY id ASC`
    ).bind(ev.id).all();

    const ticket_types = (tt.results || []).map(r => ({
      id: Number(r.id),
      name: r.name,
      price_cents: Number(r.price_cents || 0),
      capacity: Number(r.capacity || 0),
      per_order_limit: Number(r.per_order_limit || 0),
      requires_gender: Number(r.requires_gender || 0) ? 1 : 0
    }));

    return json({ ok:true, event: ev, ticket_types });
  });

  // Create order (compatible with old & new UI payloads)
  router.add("POST", "/api/public/orders/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    // Accept both shapes:
    // New UI: { event_id, items:[{ticket_type_id,qty}], attendees:[...],
    //           buyer_name, email, phone, method:"pay_now"|"pos" }
    // Old UI: { event_id, line_items:[{ticket_type_id,qty,price_cents?}],
    //           contact:{name,email,phone}, pay_method:"online_yoco"|"pos_cash" }
    const event_id = Number(b?.event_id || 0);
    const rawItems = Array.isArray(b?.items) ? b.items
                    : Array.isArray(b?.line_items) ? b.line_items
                    : [];
    const attendees = Array.isArray(b?.attendees) ? b.attendees : [];
    const buyer_name  = String(b?.buyer_name || b?.contact?.name || "").trim();
    const buyer_email = String(b?.email || b?.contact?.email || "").trim();
    const buyer_phone = String(b?.phone || b?.contact?.phone || "").trim();

    const m = (b?.method || b?.pay_method || "").toLowerCase();
    const method = m === "pay_now" || m === "online_yoco" ? "online_yoco" : "pos_cash";

    if (!event_id) return bad("event_id required");
    if (!rawItems.length) return bad("items required");
    if (!buyer_name) return bad("buyer_name required");

    // Ticket type validation (no capacity check here)
    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, per_order_limit
         FROM ticket_types WHERE event_id=?1`
    ).bind(event_id).all();
    const ttMap = new Map((ttQ.results || []).map(r => [Number(r.id), r]));

    let total_cents = 0;
    const order_items = [];
    for (const row of rawItems) {
      const tid = Number(row?.ticket_type_id || row?.id || 0);
      const qty = Math.max(0, Number(row?.qty || row?.quantity || 0));
      if (!tid || !qty) continue;
      const tt = ttMap.get(tid);
      if (!tt) return bad("Unknown ticket_type_id " + tid);

      const limit = Number(tt.per_order_limit || 0);
      if (limit && qty > limit) return bad("Exceeded per-order limit for " + tt.name);

      const unit = Number(row?.price_cents ?? tt.price_cents ?? 0);
      total_cents += qty * unit;
      order_items.push({ ticket_type_id: tid, qty, price_cents: unit });
    }
    if (!order_items.length) return bad("No valid items");

    const short_code = makeShortCode();
    const ts = nowTs();

    // INSERT orders – detect contact_json column
    const contact_json = JSON.stringify({
      name: buyer_name, email: buyer_email, phone: buyer_phone
    });

    const items_json = JSON.stringify(order_items);
    const hasContactJson = await hasColumn(env, "orders", "contact_json");

    if (hasContactJson) {
      await env.DB.prepare(
        `INSERT INTO orders
           (short_code, event_id, status, payment_method, total_cents, contact_json,
            created_at, updated_at, buyer_name, buyer_email, buyer_phone, items_json)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?8,?9,?10,?11)`
      ).bind(
        short_code, event_id,
        method === "online_yoco" ? "awaiting_payment" : "pending",
        method, total_cents, contact_json,
        ts, buyer_name, buyer_email, buyer_phone, items_json
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO orders
           (short_code, event_id, status, payment_method, total_cents,
            created_at, updated_at, buyer_name, buyer_email, buyer_phone, items_json)
         VALUES (?1,?2,?3,?4,?5,?6,?6,?7,?8,?9,?10)`
      ).bind(
        short_code, event_id,
        method === "online_yoco" ? "awaiting_payment" : "pending",
        method, total_cents,
        ts, buyer_name, buyer_email, buyer_phone, items_json
      ).run();
    }

    // Get new order id
    const ord = await env.DB.prepare(
      "SELECT id FROM orders WHERE short_code=?1 LIMIT 1"
    ).bind(short_code).first();
    const order_id = ord?.id;

    // order_items + tickets (FIFO attendees per ticket_type)
    const queues = new Map();
    for (const a of attendees) {
      const tid = Number(a?.ticket_type_id || 0);
      if (!tid) continue;
      const arr = queues.get(tid) || [];
      arr.push({
        first: String(a.attendee_first || a.first || a.name || "").trim(),
        last:  String(a.attendee_last  || a.last  || "").trim(),
        gender:(a.gender||"")?.toLowerCase() || null,
        phone: String(a.phone||"").trim() || null
      });
      queues.set(tid, arr);
    }

    for (const it of order_items) {
      await env.DB.prepare(
        `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
         VALUES (?1,?2,?3,?4)`
      ).bind(order_id, it.ticket_type_id, it.qty, it.price_cents).run();

      const queue = queues.get(it.ticket_type_id) || [];
      for (let i=0; i<it.qty; i++) {
        const qr = short_code + "-" + it.ticket_type_id + "-" +
          Math.random().toString(36).slice(2,8).toUpperCase();
        const a = queue.length ? queue.shift() : {first:null,last:null,gender:null,phone:null};
        await env.DB.prepare(
          `INSERT INTO tickets
             (order_id, event_id, ticket_type_id, attendee_first, attendee_last,
              gender, phone, qr, state, issued_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'sold',?9)`
        ).bind(order_id, event_id, it.ticket_type_id,
               a.first, a.last, a.gender, a.phone, qr, ts).run();
      }
    }

    // WhatsApp confirmation (non-blocking)
    try {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
      const link = base ? `${base}/thanks/${encodeURIComponent(short_code)}` : "";
      const msg  = [
        `Bestelling ontvang 👍`,
        `Verwysingskode: ${short_code}`,
        link ? `Volg vordering of betaal hier: ${link}` : ``,
        `Ons stuur jou kaartjies sodra betaling klaar is.`
      ].filter(Boolean).join("\n");
      if (buyer_phone) await sendViaTemplateKey(env, "WA_TMP_ORDER_CONFIRM", buyer_phone, msg);
    } catch {}

    return json({
      ok: true,
      // Keep both shapes for old/new UIs
      order: {
        id: order_id,
        short_code,
        code: short_code,            // <- helps older UI that expects "code"
        event_id,
        status: method === "online_yoco" ? "awaiting_payment" : "pending",
        payment_method: method,
        total_cents,
        buyer_name, buyer_email, buyer_phone,
        items: order_items
      }
    });
  });

  // Minimal status (thank-you poll)
  router.add("GET", "/api/public/orders/status/:code", async (_req, env, _c, { code }) => {
    const c = String(code||"").toUpperCase();
    if (!c) return bad("code required");
    const row = await env.DB.prepare(
      "SELECT status FROM orders WHERE UPPER(short_code)=?1 LIMIT 1"
    ).bind(c).first();
    if (!row) return json({ ok:false }, 404);
    return json({ ok:true, status: row.status });
  });

  // Public ticket lookup by code (used on /t/:code)
  router.add("GET", "/api/public/tickets/by-code/:code", async (_req, env, _c, { code }) => {
    const c = String(code||"").trim().toUpperCase();
    if (!c) return bad("code required");
    const q = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
              tt.name AS type_name, tt.price_cents,
              o.short_code
         FROM tickets t
         JOIN orders o ON o.id=t.order_id
         JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE UPPER(o.short_code)=?1
        ORDER BY t.id ASC`
    ).bind(c).all();
    return json({ ok:true, tickets: q.results || [] });
  });
}
