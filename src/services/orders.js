// /src/services/orders.js
//
// Shared order helpers for Public checkout + POS
// Exports:
//  - computeTotalCents(items, ttById)
//  - hydrateItems(db, eventId, items)
//  - createOrderPayLater(db, body, env?)         (public web)
//  - createOrderPayNow(db, body, env?)           (public web)
//  - createPOSOrder(db, body)                    (POS sale, cash/card)
//  - loadPendingOrderByCode(db, short_code)      (recall 'pay at event')
// 
// Assumes D1 schema with:
//   orders(id, short_code, event_id, status, payment_method, payment_ref,
//          total_cents, contact_json, created_at, paid_at, source,
//          buyer_name, buyer_email, buyer_phone, items_json)
//   order_items(id, order_id, ticket_type_id, qty, price_cents)
//   ticket_types(id, event_id, name, price_cents)
//
import { sendOrderOnWhatsApp } from "./whatsapp.js";
function nowSec() { return Math.floor(Date.now() / 1000); }

// 6-char A–Z/0–9 short code (no ambiguous chars)
function makeShortCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

async function loadTicketTypes(db, eventId) {
  const rows = (await db
    .prepare(`SELECT id, event_id, name, price_cents FROM ticket_types WHERE event_id=?1`)
    .bind(eventId)
    .all()).results || [];
  const byId = new Map(rows.map(r => [r.id, r]));
  return { rows, byId };
}

/** Normalise & total line items
 * items: [{ ticket_type_id, qty }]
 * ttById: Map(ticket_type_id -> ticket_type row)
 * returns { total_cents, lines:[{ticket_type_id, qty, price_cents}] }
 */
export function computeTotalCents(items, ttById) {
  let total = 0;
  const lines = [];
  for (const it of (items || [])) {
    const id = Number(it.ticket_type_id);
    const qty = Math.max(0, Number(it.qty || 0));
    if (!id || !qty) continue;
    const tt = ttById.get(id);
    if (!tt) throw new Error(`Unknown ticket_type_id: ${id}`);
    const price = Number(tt.price_cents || 0);
    total += price * qty;
    lines.push({ ticket_type_id: id, qty, price_cents: price });
  }
  if (!lines.length) throw new Error("No valid items");
  return { total_cents: total, lines };
}

/** Convenience: loads ticket types for event and computes totals */
export async function hydrateItems(db, eventId, items) {
  const { byId } = await loadTicketTypes(db, eventId);
  return computeTotalCents(items, byId);
}

async function insertOrder(db, data) {
  // data requires:
  //  short_code, event_id, status, payment_method, total_cents, contact_json,
  //  source, buyer_name, buyer_email, buyer_phone, items_json
  const r = await db.prepare(
    `INSERT INTO orders
       (short_code, event_id, status, payment_method, payment_ref,
        total_cents, contact_json, created_at, paid_at, source,
        buyer_name, buyer_email, buyer_phone, items_json)
     VALUES (?1, ?2, ?3, ?4, NULL,
             ?5, ?6, ?7, ?8, ?9,
             ?10, ?11, ?12, ?13)`
  )
  .bind(
    data.short_code,
    Number(data.event_id),
    data.status,
    data.payment_method,
    Number(data.total_cents),
    data.contact_json || null,
    nowSec(),                               // created_at
    data.paid_at || null,                   // paid_at
    data.source || 'web',
    data.buyer_name || '',
    data.buyer_email || '',
    data.buyer_phone || '',
    data.items_json || null
  )
  .run();
  return r.meta.last_row_id;
}

async function insertOrderItems(db, orderId, lines) {
  if (!lines?.length) return;
  const stmt = await db.prepare(
    `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
     VALUES (?1, ?2, ?3, ?4)`
  );
  for (const L of lines) {
    await stmt.bind(orderId, L.ticket_type_id, L.qty, L.price_cents).run();
  }
}

/* ---------- Public checkout flows ---------- */

export async function createOrderPayLater(db, body) {
  // body: { event_id, items:[{ticket_type_id, qty}], buyer:{first,last,email,phone} }
  const eventId = Number(body.event_id);
  if (!eventId) throw new Error("Missing event_id");

  const { lines, total_cents } = await hydrateItems(db, eventId, body.items);

  const short_code = makeShortCode();
  const buyer = body.buyer || {};
  const contact = {
    first: buyer.first || "",
    last: buyer.last || "",
    email: buyer.email || "",
    phone: buyer.phone || ""
  };

  const orderId = await insertOrder(db, {
    short_code,
    event_id: eventId,
    status: "pending",               // unpaid, to be paid at gate
    payment_method: "unpaid",
    total_cents,
    contact_json: JSON.stringify(contact),
    source: "web",
    buyer_name: [contact.first, contact.last].filter(Boolean).join(" "),
    buyer_email: contact.email || "",
    buyer_phone: contact.phone || "",
    items_json: JSON.stringify(lines)
  });

  await insertOrderItems(db, orderId, lines);

  return { order_id: orderId, short_code, total_cents };
}

export async function createOrderPayNow(db, body, _env) {
  const eventId = Number(body.event_id);
  if (!eventId) throw new Error("Missing event_id");

  const { lines, total_cents } = await hydrateItems(db, eventId, body.items);

  const short_code = makeShortCode();
  const buyer = body.buyer || {};
  const contact = {
    first: buyer.first || "",
    last: buyer.last || "",
    email: buyer.email || "",
    phone: buyer.phone || ""
  };

  const orderId = await insertOrder(db, {
    short_code,
    event_id: eventId,
    status: "awaiting_payment",
    payment_method: "card_online",
    total_cents,
    contact_json: JSON.stringify(contact),
    source: "web",
    buyer_name: [contact.first, contact.last].filter(Boolean).join(" "),
    buyer_email: contact.email || "",
    buyer_phone: contact.phone || "",
    items_json: JSON.stringify(lines)
  });

  await insertOrderItems(db, orderId, lines);

  const payment_url = `/admin?pay=${encodeURIComponent(short_code)}`;
  return { order_id: orderId, short_code, total_cents, payment_url };
}

/* ---------- POS flows ---------- */

/** Recall 'pay at event' order by code (short_code) */
export async function loadPendingOrderByCode(db, short_code) {
  const o = await db.prepare(
    `SELECT id, short_code, event_id, status, payment_method, total_cents,
            contact_json, buyer_name, buyer_email, buyer_phone, items_json
     FROM orders
     WHERE short_code=?1`
  ).bind(short_code).first();

  if (!o) return null;

  // Allow recall for any unpaid/pending; cashier may convert to paid
  const items = [];
  try { if (o.items_json) items.push(...JSON.parse(o.items_json)); } catch {}

  return {
    ...o,
    items
  };
}

/** Create a POS order (cash/card) or settle a pending order */
export async function createPOSOrder(db, body) {
  // body:
  //  - event_id
  //  - items: [{ticket_type_id, qty}]     // if creating new sale
  //  - short_code?: string                // if settling recalled pending order
  //  - buyer: { name, phone }
  //  - payment_method: 'cash' | 'card'
  //  - source: 'pos'
  //  - session_id?: number (optional, for reporting)

  const method = (body.payment_method || '').toLowerCase();
  if (!['cash','card'].includes(method)) throw new Error("payment_method must be 'cash' or 'card'");

  const buyer = body.buyer || {};
  const contact = { first: '', last: '', email: '', phone: buyer.phone || '' };

  if (body.short_code) {
    // Settle existing pending order
    const o = await loadPendingOrderByCode(db, body.short_code);
    if (!o) throw new Error("Order not found");
    if (o.status === 'paid') return { order_id: o.id, short_code: o.short_code, total_cents: o.total_cents, already_paid: true };

    // mark paid
    await db.prepare(
      `UPDATE orders
         SET status='paid', payment_method=?1, paid_at=?2,
             buyer_name=COALESCE(NULLIF(?3,''), buyer_name),
             buyer_phone=COALESCE(NULLIF(?4,''), buyer_phone)
       WHERE id=?5`
    ).bind(
      method === 'cash' ? 'cash_at_gate' : 'card_pos',
      nowSec(),
      buyer.name || '',
      buyer.phone || '',
      o.id
    ).run();

    return { order_id: o.id, short_code: o.short_code, total_cents: o.total_cents };
  }

  // Create a brand new POS order
  const eventId = Number(body.event_id);
  if (!eventId) throw new Error("Missing event_id");

  const { lines, total_cents } = await hydrateItems(db, eventId, body.items);

  const short_code = makeShortCode();
  const orderId = await insertOrder(db, {
    short_code,
    event_id: eventId,
    status: "paid",
    payment_method: method === 'cash' ? 'cash_at_gate' : 'card_pos',
    total_cents,
    contact_json: JSON.stringify(contact),
    paid_at: nowSec(),
    source: "pos",
    buyer_name: buyer.name || '',
    buyer_email: '',
    buyer_phone: buyer.phone || '',
    items_json: JSON.stringify(lines)
  });

  await insertOrderItems(db, orderId, lines);

  return { order_id: orderId, short_code, total_cents };
}
