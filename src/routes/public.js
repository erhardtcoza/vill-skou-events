// src/routes/public.js
import { json, bad } from "../utils/http.js";

/* ------------------ shared helpers (settings + WA) ------------------ */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}
async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}
async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText, params = []) {
  if (!toMsisdn) return;
  let svc = null; try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;
  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) {
      await sendTpl(env, toMsisdn, fallbackText, lang, name, params); // pass vars
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch {}
}

/* ------------------------------ utils ------------------------------- */

// tiny base62
function base62(n) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let out = "";
  do { out = alphabet[n % 62] + out; n = Math.floor(n / 62); } while (n > 0);
  return out;
}
function randToken8() {
  // timestamp-ish + random, then base62 → 8 chars
  const x = (Date.now() >>> 8) ^ Math.floor(Math.random() * 1e9);
  const s = base62(x).padStart(8, "0").slice(-8);
  return s;
}
async function newUniqueTicketToken(env) {
  // loop until not found (cheap check even if DB doesn't enforce UNIQUE)
  for (let i = 0; i < 10; i++) {
    const tok = randToken8();
    const ex = await env.DB.prepare(`SELECT id FROM tickets WHERE token=?1 LIMIT 1`).bind(tok).first();
    if (!ex) return tok;
  }
  // last-resort long token
  return randToken8() + randToken8();
}

/* --------------------------- public routes --------------------------- */
export function mountPublic(router) {
  /* Events list (active) */
  router.add("GET", "/api/public/events", async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE status='active'
        ORDER BY starts_at ASC`
    ).all();

    return json({
      ok: true,
      events: (q.results || []).map(r => ({
        id: r.id, slug: r.slug, name: r.name, venue: r.venue,
        starts_at: r.starts_at, ends_at: r.ends_at, status: r.status,
        hero_url: r.hero_url, poster_url: r.poster_url, gallery_urls: r.gallery_urls
      }))
    });
  });

  /* Event detail (+ ticket types) */
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const ev = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE slug=?1 LIMIT 1`
    ).bind(slug).first();
    if (!ev) return bad("Not found", 404);

    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types
        WHERE event_id=?1
        ORDER BY id ASC`
    ).bind(ev.id).all();

    const ticket_types = (ttQ.results || []).map(r => ({
      id: Number(r.id),
      name: r.name,
      price_cents: Number(r.price_cents || 0),
      capacity: Number(r.capacity || 0),
      per_order_limit: Number(r.per_order_limit || 0),
      requires_gender: Number(r.requires_gender || 0) ? 1 : 0
    }));

    return json({ ok: true, event: ev, ticket_types });
  });

  /* Create order (and send WA order confirmation) */
  router.add("POST", "/api/public/orders/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const event_id   = Number(b?.event_id || 0);
    const items      = Array.isArray(b?.items) ? b.items : [];
    const attendees  = Array.isArray(b?.attendees) ? b.attendees : [];
    const buyer_name = String(b?.buyer_name || "").trim();
    const buyer_email= String(b?.email || "").trim();
    const buyer_phone= String(b?.phone || "").trim();
    const method     = b?.method === "pay_now" ? "online_yoco" : "pos_cash";

    if (!event_id)     return bad("event_id required");
    if (!items.length) return bad("items required");
    if (!buyer_name)   return bad("buyer_name required");

    // Validate ticket types (simple; no capacity here)
    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, per_order_limit
         FROM ticket_types WHERE event_id=?1`
    ).bind(event_id).all();
    const ttMap = new Map((ttQ.results || []).map(r => [Number(r.id), r]));

    let total_cents = 0;
    const order_items = [];
    for (const row of items) {
      const tid = Number(row?.ticket_type_id || 0);
      const qty = Math.max(0, Number(row?.qty || 0));
      if (!tid || !qty) continue;

      const tt = ttMap.get(tid);
      if (!tt) return bad("Unknown ticket_type_id " + tid);

      const limit = Number(tt.per_order_limit || 0);
      if (limit && qty > limit) return bad("Exceeded per-order limit for " + tt.name);

      const unit = Number(tt.price_cents || 0);
      total_cents += qty * unit;
      order_items.push({ ticket_type_id: tid, qty, price_cents: unit });
    }
    if (!order_items.length) return bad("No valid items");

    const now = Math.floor(Date.now()/1000);
    const short_code = ("C" + Math.random().toString(36).slice(2,8)).toUpperCase();

    // Insert order
    const contact_json = JSON.stringify({ name: buyer_name, email: buyer_email, phone: buyer_phone });
    const items_json   = JSON.stringify(order_items);

    const r = await env.DB.prepare(
      `INSERT INTO orders
         (short_code, event_id, status, payment_method, total_cents, contact_json,
          created_at, buyer_name, buyer_email, buyer_phone, items_json)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
    ).bind(
      short_code, event_id,
      method === "online_yoco" ? "awaiting_payment" : "pending",
      method, total_cents, contact_json, now,
      buyer_name, buyer_email, buyer_phone, items_json
    ).run();

    const order_id = r.meta.last_row_id;

    // Attach attendees (FIFO per ticket_type) + generate per-ticket tokens
    const queues = new Map();
    for (const a of attendees) {
      const tid = Number(a?.ticket_type_id || 0);
      if (!tid) continue;
      const arr = queues.get(tid) || [];
      arr.push({
        first: String(a.attendee_first||"").trim(),
        last:  String(a.attendee_last||"").trim(),
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

      const q = queues.get(it.ticket_type_id) || [];
      for (let i=0;i<it.qty;i++){
        const qr = short_code + "-" + it.ticket_type_id + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
        const a = q.length ? q.shift() : {first:null,last:null,gender:null,phone:null};

        // NEW: per-ticket token (8 chars, tries to be unique)
        const token = await newUniqueTicketToken(env);

        await env.DB.prepare(
          `INSERT INTO tickets
             (order_id, event_id, ticket_type_id, attendee_first, attendee_last, gender, phone, qr, token, issued_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
        ).bind(order_id, event_id, it.ticket_type_id,
               a.first, a.last, a.gender, a.phone,
               qr, token, now).run();
      }
    }

    // WhatsApp: Order confirmation (2 vars: name, order)
    try {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
      const link = base ? `${base}/thanks/${encodeURIComponent(short_code)}` : "";
      const msg  = [
        `Hallo ${buyer_name}`,
        ``,
        `Jou bestel nommer is ${short_code}.`,
        `Indien jy nie nou aanlyn betaal het nie, kan jy die kode by die hek wys.`,
        link ? `Volg vordering / betaal hier: ${link}` : ``,
        `Ons stuur jou kaartjies sodra betaling klaar is.`
      ].filter(Boolean).join("\n");
      if (buyer_phone) {
        const params = [buyer_name, short_code]; // EXACTLY 2 vars
        await sendViaTemplateKey(env, "WA_TMP_ORDER_CONFIRM", String(buyer_phone), msg, params);
      }
    } catch {}

    return json({
      ok: true,
      order: {
        id: order_id, short_code, event_id,
        status: (method === "online_yoco" ? "awaiting_payment" : "pending"),
        payment_method: method, total_cents,
        buyer_name, buyer_email, buyer_phone,
        items: order_items
      }
    });
  });

  /* Order status (thank-you polling) */
  router.add("GET", "/api/public/orders/status/:code", async (_req, env, _ctx, { code }) => {
    const c = String(code||"").toUpperCase();
    if (!c) return bad("code required");
    const row = await env.DB.prepare(
      `SELECT status FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(c).first();
    if (!row) return json({ ok:false }, 404);
    return json({ ok:true, status: row.status });
  });

  /* Public ticket lookup by code (batch view still works) */
  router.add("GET", "/api/public/tickets/by-code/:code", async (_req, env, _ctx, { code }) => {
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

  /* NEW: Public ticket lookup by single token */
  router.add("GET", "/api/public/tickets/by-token/:token", async (_req, env, _ctx, { token }) => {
    const tok = String(token||"").trim();
    if (!tok) return bad("token required");
    const row = await env.DB.prepare(
      `SELECT t.id, t.token, t.qr, t.state,
              t.attendee_first, t.attendee_last, t.phone,
              tt.name AS type_name, tt.price_cents,
              o.short_code, o.buyer_name,
              e.name AS event_name, e.venue AS event_venue
         FROM tickets t
         JOIN ticket_types tt ON tt.id=t.ticket_type_id
         LEFT JOIN orders o    ON o.id=t.order_id
         JOIN events e         ON e.id=t.event_id
        WHERE t.token=?1
        LIMIT 1`
    ).bind(tok).first();

    if (!row) return json({ ok:false, error:"not_found" }, 404);
    return json({ ok:true, ticket: row });
  });
}
