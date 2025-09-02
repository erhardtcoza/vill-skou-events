// /src/services/orders.js
// Core order helpers used by public checkout and POS flows

function randCode(len = 6) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export async function computeTotalCents(db, items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let total = 0;
  for (const it of items) {
    const row = await db
      .prepare("SELECT price_cents FROM ticket_types WHERE id=?1")
      .bind(it.ticket_type_id)
      .first();
    const price = Number(row?.price_cents || 0);
    total += price * Number(it.qty || 0);
  }
  return total;
}

export async function hydrateItems(db, items) {
  const out = [];
  for (const it of items || []) {
    const tt = await db
      .prepare("SELECT id,name,price_cents FROM ticket_types WHERE id=?1")
      .bind(it.ticket_type_id)
      .first();
    if (!tt) continue;
    out.push({
      ticket_type_id: tt.id,
      name: tt.name,
      price_cents: Number(tt.price_cents || 0),
      qty: Number(it.qty || 0),
    });
  }
  return out;
}

async function issueTicketsForOrder(db, order_id, event_id, items, buyer_phone) {
  const tickets = [];
  for (const it of items || []) {
    const qty = Number(it.qty || 0);
    const ttId = Number(it.ticket_type_id);
    if (!qty || !ttId) continue;
    for (let i = 0; i < qty; i++) {
      const qr = `O${order_id}-TT${ttId}-${i + 1}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const ins = await db
        .prepare(
          `INSERT INTO tickets (order_id, event_id, ticket_type_id, attendee_first, attendee_last, email, phone, qr, state, issued_at)
           VALUES (?1, ?2, ?3, '', '', '', ?4, ?5, 'unused', unixepoch())`
        )
        .bind(order_id, event_id, ttId, buyer_phone || "", qr)
        .run();
      tickets.push({ id: Number(ins.lastInsertRowid), qr });
    }
  }
  return tickets;
}

/* =========================
 * PUBLIC CHECKOUT HELPERS
 * ========================= */

// Pay later (reserve + pickup at event)
export async function createOrderPayLater(db, body) {
  // body: { event_id, items:[{ticket_type_id, qty}], buyer_name?, buyer_email?, buyer_phone? }
  const items = Array.isArray(body.items) ? body.items : [];
  const code = randCode();
  const ins = await db
    .prepare(
      `INSERT INTO orders (event_id, source, status, buyer_name, buyer_email, buyer_phone, short_code, items_json, created_at)
       VALUES (?1,'online','pending',?2,?3,?4,?5,?6,unixepoch())`
    )
    .bind(
      body.event_id,
      body.buyer_name || "",
      body.buyer_email || "",
      body.buyer_phone || "",
      code,
      JSON.stringify(items)
    )
    .run();

  return { ok: true, order_id: Number(ins.lastInsertRowid), short_code: code };
}

// Pay now (stub payment URL; real Yoco hookup later)
export async function createOrderPayNow(db, body, env) {
  const items = Array.isArray(body.items) ? body.items : [];
  const total_cents = await computeTotalCents(db, items);
  const ins = await db
    .prepare(
      `INSERT INTO orders (event_id, source, status, buyer_name, buyer_email, buyer_phone, items_json, total_cents, created_at)
       VALUES (?1,'online','awaiting_payment',?2,?3,?4,?5,?6,unixepoch())`
    )
    .bind(
      body.event_id,
      body.buyer_name || "",
      body.buyer_email || "",
      body.buyer_phone || "",
      JSON.stringify(items),
      total_cents
    )
    .run();

  const order_id = Number(ins.lastInsertRowid);
  // Placeholder hosted payment URL; replace with Yoco Hosted Payment once ready
  const origin = env?.PUBLIC_ORIGIN || "";
  const payment_url =
    origin ? `${origin}/shop/${encodeURIComponent(body.slug || "")}/checkout?order=${order_id}` : `/shop/${encodeURIComponent(body.slug || "")}/checkout?order=${order_id}`;

  return { ok: true, order_id, payment_url };
}

/* =========================
 * POS HELPERS
 * ========================= */

// POS immediate-paid order (cash/card)
export async function createPOSOrder(db, body) {
  // body: { event_id, items, buyer_name?, buyer_phone?, payment_method: 'cash'|'card' }
  const items = Array.isArray(body.items) ? body.items : [];
  const total_cents = await computeTotalCents(db, items);
  const ins = await db
    .prepare(
      `INSERT INTO orders (event_id, source, status, buyer_name, buyer_phone, payment_method, items_json, total_cents, created_at, paid_at)
       VALUES (?1,'pos','paid',?2,?3,?4,?5,?6,unixepoch(),unixepoch())`
    )
    .bind(
      body.event_id,
      body.buyer_name || "",
      body.buyer_phone || "",
      body.payment_method || "cash",
      JSON.stringify(items),
      total_cents
    )
    .run();

  const order_id = Number(ins.lastInsertRowid);
  const tickets = await issueTicketsForOrder(
    db,
    order_id,
    body.event_id,
    items,
    body.buyer_phone
  );

  return { ok: true, order_id, total_cents, tickets };
}

/* =========================
 * NOTIFY HOOK
 * ========================= */

export async function markOrderPaidAndNotify(env, order_id) {
  const { notifyTicketsPaid } = await import("./notify.js");
  try {
    return await notifyTicketsPaid(env, order_id);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* =========================
 * RECALL HELPERS
 * ========================= */

export async function loadPendingOrderByCode(db, code) {
  const ord = await db
    .prepare(
      `SELECT id, event_id, short_code, status, items_json, buyer_name, buyer_phone, buyer_email
       FROM orders WHERE short_code=?1 LIMIT 1`
    )
    .bind(code)
    .first();
  if (!ord || ord.status !== "pending") return null;

  let items = [];
  try {
    items = JSON.parse(ord.items_json || "[]");
  } catch {}
  return { order: ord, items };
}