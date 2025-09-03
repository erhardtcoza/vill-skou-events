// /src/services/orders.js
//
// Creates public web orders for:
//  - Pay later (collect & pay at gate)
//  - Pay now   (stub: returns a hosted-payment URL placeholder)
//
// Assumes D1 schema (columns confirmed in your screenshots):
// orders(id, short_code, event_id, status, payment_method, payment_ref,
//        total_cents, contact_json, created_at, paid_at, source,
//        buyer_name, buyer_email, buyer_phone, items_json)
// order_items(id, order_id, ticket_type_id, qty, price_cents)
// ticket_types(id, event_id, name, price_cents)
//
// Tickets are NOT issued here; they’ll be generated after payment/collection.
//

function nowSec() { return Math.floor(Date.now() / 1000); }

// 6-char A–Z/0–9 short code
function makeShortCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 1/0/O/I
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

function computeTotals(items, ttById) {
  // items: [{ ticket_type_id, qty }]
  let total = 0;
  const norm = [];
  for (const it of (items || [])) {
    const id = Number(it.ticket_type_id);
    const qty = Math.max(0, Number(it.qty || 0));
    if (!id || !qty) continue;
    const tt = ttById.get(id);
    if (!tt) throw new Error(`Unknown ticket_type_id: ${id}`);
    const line = { ticket_type_id: id, qty, price_cents: Number(tt.price_cents || 0) };
    total += line.price_cents * qty;
    norm.push(line);
  }
  if (!norm.length) throw new Error("No valid items");
  return { total_cents: total, lines: norm };
}

async function insertOrder(db, data) {
  // data: { event_id, status, payment_method, total_cents, source,
  //         buyer_name, buyer_email, buyer_phone, items_json, contact_json, short_code }
  const r = await db.prepare(
    `INSERT INTO orders
       (short_code, event_id, status, payment_method, payment_ref,
        total_cents, contact_json, created_at, paid_at, source,
        buyer_name, buyer_email, buyer_phone, items_json)
     VALUES (?1, ?2, ?3, ?4, NULL,
             ?5, ?6, ?7, NULL, ?8,
             ?9, ?10, ?11, ?12)`
  )
  .bind(
    data.short_code,
    Number(data.event_id),
    data.status,
    data.payment_method,
    Number(data.total_cents),
    data.contact_json || null,
    nowSec(),
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

export async function createOrderPayLater(db, body) {
  // body: { event_id, items:[{ticket_type_id, qty}], buyer:{first,last,email,phone} }
  const eventId = Number(body.event_id);
  if (!eventId) throw new Error("Missing event_id");

  const { byId } = await loadTicketTypes(db, eventId);
  const { total_cents, lines } = computeTotals(body.items, byId);

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
  // Same as pay_later but status indicates awaiting online payment
  const eventId = Number(body.event_id);
  if (!eventId) throw new Error("Missing event_id");

  const { byId } = await loadTicketTypes(db, eventId);
  const { total_cents, lines } = computeTotals(body.items, byId);

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

  // Placeholder: once Yoco Hosted Payments is integrated, return their redirect URL here.
  // For now, link to a simple preview page or echo order code.
  const payment_url = `/admin?pay=${encodeURIComponent(short_code)}`;

  return { order_id: orderId, short_code, total_cents, payment_url };
}
