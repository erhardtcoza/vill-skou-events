// /src/services/orders.js

function nowSec() { return Math.floor(Date.now() / 1000); }
function shortCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

// Resolve ticket_type prices on the server and compute total
async function pricedItems(db, event_id, items) {
  const ids = items.map(i => Number(i.ticket_type_id)).filter(Boolean);
  if (!ids.length) return { lines: [], total: 0 };

  const qMarks = ids.map(() => "?").join(",");
  const list = await db
    .prepare(`SELECT id, price_cents FROM ticket_types WHERE event_id=? AND id IN (${qMarks})`)
    .bind(event_id, ...ids)
    .all();

  const priceMap = new Map();
  for (const r of (list.results || [])) priceMap.set(Number(r.id), Number(r.price_cents) || 0);

  let total = 0;
  const lines = [];
  for (const i of items) {
    const ttId = Number(i.ticket_type_id);
    const qty = Math.max(0, Number(i.qty) || 0);
    if (!ttId || !qty) continue;
    const price = priceMap.get(ttId) ?? 0;
    total += price * qty;
    lines.push({ ticket_type_id: ttId, qty, price_cents: price });
  }
  return { lines, total };
}

// PAY LATER
export async function createOrderPayLater(db, body) {
  const { lines, total } = await pricedItems(db, body.event_id, body.items);
  if (!lines.length) throw new Error("No items");

  const sc = shortCode();

  await db
    .prepare(`INSERT INTO orders (short_code, event_id, status, total_cents, contact_json, created_at)
              VALUES (?, ?, 'awaiting_payment', ?, ?, ?)`)
    .bind(sc, body.event_id, total, JSON.stringify(body.contact || {}), nowSec())
    .run();

  const row = await db.prepare("SELECT last_insert_rowid() AS id").first();
  const order_id = row?.id;

  const ins = await db.prepare(
    "INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents) VALUES (?, ?, ?, ?)"
  );
  for (const li of lines) await ins.bind(order_id, li.ticket_type_id, li.qty, li.price_cents).run();

  return { order_id, short_code: sc };
}

// PAY NOW (pending)
export async function createOrderPayNow(db, body, _env) {
  const { lines, total } = await pricedItems(db, body.event_id, body.items);
  if (!lines.length) throw new Error("No items");

  await db
    .prepare(`INSERT INTO orders (event_id, status, total_cents, contact_json, created_at, payment_method)
              VALUES (?, 'pending', ?, ?, ?, 'online_yoco')`)
    .bind(body.event_id, total, JSON.stringify(body.contact || {}), nowSec())
    .run();

  const row = await db.prepare("SELECT last_insert_rowid() AS id").first();
  const order_id = row?.id;

  const ins = await db.prepare(
    "INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents) VALUES (?, ?, ?, ?)"
  );
  for (const li of lines) await ins.bind(order_id, li.ticket_type_id, li.qty, li.price_cents).run();

  // TODO: Replace with Yoco Hosted Payment URL once available
  const payment_url = `/shop/thank-you?order=${order_id}`;
  return { order_id, payment_url };
}

// === NEW: used by webhook later ===
export async function markOrderPaidAndIssue(db, env, order_id, { method='online_yoco', payment_ref='' } = {}) {
  // set paid if not already, then issue tickets idempotently
  const row = await db.prepare(`SELECT status FROM orders WHERE id=?`).bind(Number(order_id)).first();
  if (!row) throw new Error("Order not found");

  if (row.status !== 'paid') {
    await db
      .prepare(`UPDATE orders SET status='paid', payment_method=?, payment_ref=?, paid_at=? WHERE id=?`)
      .bind(method, payment_ref, nowSec(), Number(order_id))
      .run();
  }

  const { ensureTicketsIssuedForOrder, deliverTickets } = await import("./tickets.js");
  const tix = await ensureTicketsIssuedForOrder(db, Number(order_id));
  try { await deliverTickets(env, Number(order_id), tix); } catch(_){}
  return tix;
}
