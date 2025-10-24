// src/routes/public.js
import { json, bad } from "../utils/http.js";

/* ------------------ shared helpers (settings + WA) ------------------ */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function parseTpl(env, key /* e.g. 'WA_TMP_ORDER_CONFIRM' */) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}

async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText, params = []) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;
  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) {
      // legacy sig: (env, to, fallbackText, lang, name, params)
      await sendTpl(env, toMsisdn, fallbackText, lang, name, params);
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch {}
}

/* --------------------------- small utils --------------------------- */
function genToken(len = 18) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function normalizeMsisdnZAF(s) {
  const digits = String(s || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("27")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "27" + digits.slice(1);
  return digits;
}

function asInt(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : def;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/* -------- schema helpers: detect columns to stay compatible ---------- */
const __colCache = new Map();
async function tableHasColumn(env, table, col) {
  const key = `${table}::${col}`;
  if (__colCache.has(key)) return __colCache.get(key);
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  const ok = (rows.results || []).some(r => String(r.name).toLowerCase() === String(col).toLowerCase());
  __colCache.set(key, ok);
  return ok;
}

/* ----------------- capacity / usage helper (optional) ---------------- */
async function getTypeUsage(env, eventId) {
  const q = await env.DB.prepare(
    `SELECT ticket_type_id AS tid, COUNT(1) AS cnt
       FROM tickets
      WHERE event_id=?1
      GROUP BY ticket_type_id`
  ).bind(eventId).all();
  const m = new Map();
  for (const r of (q.results || [])) m.set(asInt(r.tid), asInt(r.cnt));
  return m;
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

  /* Event detail (+ ticket types)
     Adds event.sales_closed = 1 if now >= starts_at so UI can disable buying. */
  router.add("GET", "/api/public/events/:slug", async (_req, env, _ctx, { slug }) => {
    const ev = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE slug=?1 LIMIT 1`
    ).bind(slug).first();
    if (!ev) return bad("Not found", 404);

    const closed = nowSec() >= Number(ev.starts_at || 0);

    const hasReqName = await tableHasColumn(env, "ticket_types", "requires_name");
    const selectCols = `
      id, name, price_cents, capacity, per_order_limit,
      requires_gender${hasReqName ? ", requires_name" : ""}
    `;

    const ttQ = await env.DB.prepare(
      `SELECT ${selectCols}
         FROM ticket_types
        WHERE event_id=?1
        ORDER BY id ASC`
    ).bind(ev.id).all();

    const ticket_types = (ttQ.results || []).map(r => ({
      id: asInt(r.id),
      name: r.name,
      price_cents: asInt(r.price_cents),
      capacity: asInt(r.capacity),
      per_order_limit: asInt(r.per_order_limit),
      requires_gender: asInt(r.requires_gender) ? 1 : 0,
      requires_name: hasReqName ? (asInt(r.requires_name) ? 1 : 0) : 0
    }));

    const eventOut = {
      ...ev,
      sales_closed: closed ? 1 : 0
    };

    return json({ ok: true, event: eventOut, ticket_types });
  });

  /* Event ticket availability snapshot (per type) */
  router.add("GET", "/api/public/events/:slug/availability", async (_req, env, _ctx, { slug }) => {
    const ev = await env.DB.prepare(
      `SELECT id FROM events WHERE slug=?1 LIMIT 1`
    ).bind(slug).first();
    if (!ev) return bad("Not found", 404);

    const ttQ = await env.DB.prepare(
      `SELECT id, capacity FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
    ).bind(ev.id).all();

    const usage = await getTypeUsage(env, ev.id);
    const list = (ttQ.results || []).map(r => {
      const id = asInt(r.id);
      const cap = asInt(r.capacity);
      const used = usage.get(id) || 0;
      const remaining = cap ? Math.max(0, cap - used) : null; // null = unlimited
      return { ticket_type_id: id, capacity: cap || null, used, remaining };
    });

    return json({ ok: true, availability: list });
  });

  /* Create order (checkout).
     Refuses if online sales closed (now >= starts_at). */
  router.add("POST", "/api/public/orders/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const event_id    = asInt(b?.event_id);
    const itemsIn     = Array.isArray(b?.items) ? b.items : [];
    const attendeesIn = Array.isArray(b?.attendees) ? b.attendees : [];
    const buyer_name  = String(b?.buyer_name || "").trim();
    const buyer_email = String(b?.email || "").trim();
    const buyer_phone_raw = String(b?.phone || "").trim();
    const buyer_phone = normalizeMsisdnZAF(buyer_phone_raw);
    const method      = b?.method === "pay_now" ? "online_yoco" : "pos_cash";

    if (!event_id)        return bad("event_id required");
    if (!itemsIn.length)  return bad("items required");
    if (!buyer_name)      return bad("buyer_name required");

    // block once event has started
    const evRow = await env.DB.prepare(
      `SELECT starts_at FROM events WHERE id=?1 LIMIT 1`
    ).bind(event_id).first();
    if (!evRow) return bad("event_invalid", 400);

    const closed = nowSec() >= Number(evRow.starts_at || 0);
    if (closed) {
      return bad("online_sales_closed", 403);
    }

    // ticket types
    const ttQ = await env.DB.prepare(
      `SELECT id, name, price_cents, capacity, per_order_limit, requires_gender
         FROM ticket_types WHERE event_id=?1`
    ).bind(event_id).all();
    const types = (ttQ.results || []);
    const ttMap = new Map(types.map(r => [asInt(r.id), r]));

    const usage = await getTypeUsage(env, event_id);

    // validate + total
    let total_cents = 0;
    const order_items = [];
    for (const row of itemsIn) {
      const tid = asInt(row?.ticket_type_id);
      const qty = Math.max(0, asInt(row?.qty));
      if (!tid || !qty) continue;

      const tt = ttMap.get(tid);
      if (!tt) return bad("Unknown ticket_type_id " + tid);

      const limit = asInt(tt.per_order_limit);
      if (limit && qty > limit) return bad(`Exceeded per-order limit for ${tt.name} (limit ${limit})`);

      const cap = asInt(tt.capacity);
      if (cap) {
        const already = usage.get(tid) || 0;
        if (already + qty > cap) return bad(`Not enough availability for ${tt.name}`);
      }

      const unit = asInt(tt.price_cents);
      total_cents += qty * unit;
      order_items.push({ ticket_type_id: tid, qty, price_cents: unit });
    }
    if (!order_items.length) return bad("No valid items");

    // attendees
    const queues = new Map();
    for (const a of attendeesIn) {
      const tid = asInt(a?.ticket_type_id);
      if (!tid) continue;
      const arr = queues.get(tid) || [];
      arr.push({
        first: String(a.attendee_first || "").trim() || null,
        last:  String(a.attendee_last  || "").trim() || null,
        gender:(a.gender || "") ? String(a.gender).toLowerCase() : null,
        phone: normalizeMsisdnZAF(a.phone)
      });
      queues.set(tid, arr);
    }

    // enforce gender-required tickets
    for (const it of order_items) {
      const tt = ttMap.get(it.ticket_type_id);
      const needGender = asInt(tt?.requires_gender) ? 1 : 0;
      if (needGender) {
        const q = queues.get(it.ticket_type_id) || [];
        if (q.length < it.qty) return bad(`Attendee details required for ${tt.name} (${it.qty} needed)`);
        if (q.some(x => !x.gender)) return bad(`Gender required for all ${tt.name} attendees`);
      }
    }

    // detect optional ticket columns
    const hasGender = await tableHasColumn(env, "tickets", "gender");
    const hasToken  = await tableHasColumn(env, "tickets", "token");

    const now = nowSec();
    const short_code = ("C" + Math.random().toString(36).slice(2, 8)).toUpperCase();

    const contact_json = JSON.stringify({
      name: buyer_name, email: buyer_email, phone: buyer_phone || buyer_phone_raw
    });
    const items_json = JSON.stringify(order_items);

    let order_id = 0;

    try {
      // 1) insert order
      const r = await env.DB.prepare(
        `INSERT INTO orders
           (short_code, event_id, status, payment_method, total_cents, contact_json,
            created_at, buyer_name, buyer_email, buyer_phone, items_json)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
      ).bind(
        short_code, event_id,
        (method === "online_yoco" ? "awaiting_payment" : "pending"),
        method, total_cents, contact_json, now,
        buyer_name, buyer_email, buyer_phone || buyer_phone_raw, items_json
      ).run();

      order_id = r.meta.last_row_id;

      // 2) dependent inserts
      const stmts = [];

      // order_items
      for (const it of order_items) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
             VALUES (?1,?2,?3,?4)`
          ).bind(order_id, it.ticket_type_id, it.qty, it.price_cents)
        );

        const q = queues.get(it.ticket_type_id) || [];
        for (let i = 0; i < it.qty; i++) {
          const qr = `${short_code}-${it.ticket_type_id}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          const token = hasToken ? genToken(18) : null;
          let a = q.length ? q.shift() : { first: null, last: null, gender: null, phone: null };

          const cols = ["order_id","event_id","ticket_type_id","attendee_first","attendee_last","phone","qr","issued_at"];
          const vals = [order_id, event_id, it.ticket_type_id, a.first || null, a.last || null, a.phone || null, qr, now];
          if (hasGender) { cols.splice(5, 0, "gender"); vals.splice(5, 0, a.gender || null); }
          if (hasToken)  { cols.push("token"); vals.push(token); }
          const placeholders = cols.map((_, idx) => `?${idx+1}`).join(",");
          const sql = `INSERT INTO tickets (${cols.join(",")}) VALUES (${placeholders})`;
          stmts.push(env.DB.prepare(sql).bind(...vals));
        }
      }

      await env.DB.batch(stmts);

      // 3) WhatsApp notify buyer (best effort)
      try {
        const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
        const link = base ? `${base}/thanks/${encodeURIComponent(short_code)}` : "";
        const msgLines = [
          `Hallo ${buyer_name}`,
          ``,
          `Jou bestel nommer is ${short_code}.`,
          (method === "online_yoco")
            ? `Voltooi jou betaling om jou kaartjies te ontvang.`
            : `Indien jy nie nou aanlyn betaal het nie, kan jy die kode by die hek wys.`,
          link ? `Volg vordering / betaal hier: ${link}` : ``,
          `Ons stuur jou kaartjies sodra betaling klaar is.`
        ].filter(Boolean);
        const msg = msgLines.join("\n");
        if (buyer_phone) {
          const params = [buyer_name, short_code];
          await sendViaTemplateKey(env, "WA_TMP_ORDER_CONFIRM", buyer_phone, msg, params);
        }
      } catch {}

      return json({
        ok: true,
        order: {
          short_code,
          event_id,
          status: (method === "online_yoco" ? "awaiting_payment" : "pending"),
          payment_method: method,
          total_cents,
          buyer_name,
          buyer_email,
          buyer_phone: buyer_phone || buyer_phone_raw,
          items: order_items
        }
      });
    } catch (e) {
      // cleanup on failure
      try {
        if (order_id) {
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM tickets WHERE order_id=?1`).bind(order_id),
            env.DB.prepare(`DELETE FROM order_items WHERE order_id=?1`).bind(order_id),
            env.DB.prepare(`DELETE FROM orders WHERE id=?1`).bind(order_id),
          ]);
        }
      } catch {}
      console.error("orders/create failed:", e && (e.stack || e.message || e));
      return bad("Failed to create order: " + (e?.message || "internal"));
    }
  });

  /* Order status (thank-you polling) */
  router.add("GET", "/api/public/orders/status/:code", async (_req, env, _ctx, { code }) => {
    const c = String(code || "").toUpperCase();
    if (!c) return bad("code required");
    const row = await env.DB.prepare(
      `SELECT status FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(c).first();
    if (!row) return json({ ok: false }, 404);
    return json({ ok: true, status: row.status });
  });

  /* Public ticket lookup (all tickets in that order code)
     NOW returns buyer + phone + ticket.phone for editing in UI. */
  router.add("GET", "/api/public/tickets/by-code/:code", async (_req, env, _ctx, { code }) => {
    const c = String(code || "").trim().toUpperCase();
    if (!c) return bad("code required");

    // fetch order for meta (buyer_name, buyer_phone)
    const ord = await env.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(c).first();

    if (!ord) {
      return json({ ok: true, short_code: c, buyer_name: "", buyer_phone: "", tickets: [] });
    }

    const q = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last, t.phone,
              tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(ord.id).all();

    return json({
      ok: true,
      short_code: ord.short_code || c,
      buyer_name: ord.buyer_name || "",
      buyer_phone: ord.buyer_phone || "",
      tickets: q.results || []
    });
  });

  /* Public single-ticket lookup by token (unchanged) */
  router.add("GET", "/api/public/tickets/by-token/:token", async (_req, env, _ctx, { token }) => {
    const tok = String(token || "").trim();
    if (!tok) return bad("token required");

    const row = await env.DB.prepare(
      `SELECT
          t.id, t.qr, t.state,
          t.attendee_first, t.attendee_last, t.token, t.phone,
          tt.name AS type_name, tt.price_cents,
          o.short_code, o.buyer_name
        FROM tickets t
        JOIN orders o ON o.id = t.order_id
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
       WHERE t.token = ?1
       LIMIT 1`
    ).bind(tok).first();

    if (!row) return json({ ok: false, error: "not_found" }, 404);

    return json({
      ok: true,
      ticket: {
        id: row.id,
        qr: row.qr,
        state: row.state,
        attendee_first: row.attendee_first,
        attendee_last: row.attendee_last,
        token: row.token,
        phone: row.phone,
        type_name: row.type_name,
        price_cents: row.price_cents,
        short_code: row.short_code,
        buyer_name: row.buyer_name
      }
    });
  });

  /* -----------------------------------------------------------
     NEW: Update attendee details for a specific ticket
     Body: { order_code, first, last, phone }
     We "auth" by requiring correct order_code for that ticket.
  ----------------------------------------------------------- */
  router.add("POST", "/api/public/tickets/:id/update-attendee", async (req, env, _ctx, { id }) => {
    const tid = asInt(id, 0);
    if (!tid) return bad("invalid ticket id");

    let body;
    try { body = await req.json(); } catch { return bad("Bad JSON"); }

    const order_code = String(body?.order_code || "").trim().toUpperCase();
    const first = String(body?.first || "").trim();
    const last  = String(body?.last  || "").trim();
    const rawPhone = String(body?.phone || "").trim();
    const phone = normalizeMsisdnZAF(rawPhone);

    if (!order_code) return bad("order_code required");

    // verify this ticket belongs to that order_code
    const row = await env.DB.prepare(
      `SELECT t.id, o.short_code
         FROM tickets t
         JOIN orders o ON o.id = t.order_id
        WHERE t.id=?1
        LIMIT 1`
    ).bind(tid).first();

    if (!row) return bad("not found", 404);
    if (String(row.short_code || "").toUpperCase() !== order_code) {
      return bad("forbidden", 403);
    }

    // do update
    await env.DB.prepare(
      `UPDATE tickets
          SET attendee_first=?1,
              attendee_last=?2,
              phone=?3
        WHERE id=?4`
    ).bind(first || null, last || null, phone || null, tid).run();

    return json({ ok: true, id: tid, first, last, phone });
  });

  /* -----------------------------------------------------------
     NEW: Send a WhatsApp with this specific ticket QR
     Body: { order_code }
     Uses WA_TMP_TICKET_DELIVERY template if configured,
     falls back to plain text.
  ----------------------------------------------------------- */
  router.add("POST", "/api/public/tickets/:id/send-wa", async (req, env, _ctx, { id }) => {
    const tid = asInt(id, 0);
    if (!tid) return bad("invalid ticket id");

    let body;
    try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const order_code = String(body?.order_code || "").trim().toUpperCase();
    if (!order_code) return bad("order_code required");

    // Load ticket + order so we know where it should go
    const row = await env.DB.prepare(
      `SELECT
          t.qr,
          t.attendee_first,
          t.attendee_last,
          t.phone AS attendee_phone,
          tt.name AS type_name,
          o.short_code,
          o.buyer_name,
          o.buyer_phone
        FROM tickets t
        JOIN orders o ON o.id = t.order_id
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
       WHERE t.id=?1
       LIMIT 1`
    ).bind(tid).first();

    if (!row) return bad("not found", 404);
    if (String(row.short_code || "").toUpperCase() !== order_code) {
      return bad("forbidden", 403);
    }

    // choose phone: ticket phone if available, else buyer phone
    const destPhoneRaw = row.attendee_phone || row.buyer_phone || "";
    const destPhone = normalizeMsisdnZAF(destPhoneRaw);
    if (!destPhone) return bad("no_phone", 400);

    const fullName = [row.attendee_first || "", row.attendee_last || ""].filter(Boolean).join(" ").trim() ||
                     (row.buyer_name || "Besoeker");

    // basic fallback text
    // We'll include the QR string and order code.
    // The actual template WA_TMP_TICKET_DELIVERY can format nicely.
    const msgLines = [
      `Hallo ${fullName}`,
      ``,
      `Hier is jou kaartjie vir die Villiersdorp Skou.`,
      `Bestelkode: ${row.short_code || ""}`,
      `QR: ${row.qr || ""}`,
      ``,
      `Wys hierdie QR by die hek sodat dit gescan kan word.`
    ].filter(Boolean);
    const fallbackMsg = msgLines.join("\n");

    // Template vars we’ll pass: name, order_code, qr
    const vars = [ fullName, row.short_code || "", row.qr || "" ];

    let sentOk = false;
    try {
      await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", destPhone, fallbackMsg, vars);
      sentOk = true;
    } catch {
      // we'll still respond ok but sent:false if WA fails hard
    }

    return json({ ok: true, sent: sentOk, to: destPhone });
  });
}