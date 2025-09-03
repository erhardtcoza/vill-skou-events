// /src/services/orders.js
import { sendOrderOnWhatsApp } from "./whatsapp.js";

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function randBase36(len = 8) {
  let s = "";
  while (s.length < len) s += Math.random().toString(36).slice(2);
  return s.slice(0, len).toUpperCase();
}

function shortCode() {
  // 6-char human-friendly code
  return randBase36(6).replace(/O/g, "0").replace(/I/g, "1");
}

/** Parse items_json into array of {ticket_type_id, qty} */
export function parseItems(items_json) {
  try {
    const arr = JSON.parse(items_json || "[]");
    return Array.isArray(arr) ? arr.map(x => ({
      ticket_type_id: Number(x.ticket_type_id),
      qty: Number(x.qty)
    })).filter(x => x.ticket_type_id && x.qty > 0) : [];
  } catch { return []; }
}

/** Hydrate items with names/prices using provided map or DB */
export async function hydrateItemsWithDB(db, items) {
  const ids = [...new Set(items.map(i => i.ticket_type_id))];
  if (!ids.length) return [];
  const ph = ids.map((_,i)=>`?${i+1}`).join(",");
  const rows = (await db.prepare(
    `SELECT id, name, price_cents FROM ticket_types WHERE id IN (${ph})`
  ).bind(...ids).all()).results || [];
  const map = new Map(rows.map(r => [Number(r.id), r]));
  return items.map(i => {
    const tt = map.get(i.ticket_type_id) || {};
    return {
      ticket_type_id: i.ticket_type_id,
      name: tt.name || `Type #${i.ticket_type_id}`,
      price_cents: Number(tt.price_cents || 0),
      qty: Number(i.qty || 0)
    };
  });
}

/** Public helper used by routes: hydrate from items_json string */
export async function hydrateItems(dbOrString, maybeString) {
  // Both shapes supported:
  // hydrateItems(db, items_json) OR hydrateItems(items_json_string)
  if (typeof dbOrString === "string" && maybeString === undefined) {
    // Old signature: hydrateItems(items_json)
    return parseItems(dbOrString); // minimal; caller may not need names
  }
  const db = dbOrString;
  const items_json = maybeString || "[]";
  const core = parseItems(items_json);
  return hydrateItemsWithDB(db, core);
}

/** Compute total cents from hydrated items */
export function computeTotalCents(hydrated) {
  return hydrated.reduce((sum, it) =>
    sum + Number(it.price_cents || 0) * Number(it.qty || 0), 0);
}

/* -------------------------------------------------------------------------- */
/* Core DB helpers                                                             */
/* -------------------------------------------------------------------------- */

async function insertOrder(db, o) {
  // o: { event_id, buyer_name?, buyer_email?, buyer_phone?, items_json, total_cents, status, payment_method? }
  const r = await db.prepare(
    `INSERT INTO orders (event_id, status,
                         buyer_name, buyer_email, buyer_phone,
                         short_code, items_json, total_cents, payment_method, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE(?9,''), unixepoch())`
  ).bind(
    Number(o.event_id),
    (o.status || "pending"),
    o.buyer_name || "",
    o.buyer_email || "",
    o.buyer_phone || "",
    shortCode(),
    o.items_json || "[]",
    Number(o.total_cents || 0),
    o.payment_method || ""
  ).run();
  return r.meta.last_row_id;
}

async function insertOrderItems(db, order_id, hydratedItems) {
  if (!hydratedItems.length) return;
  await db.batch(hydratedItems.map(i =>
    db.prepare(
      `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
       VALUES (?1, ?2, ?3, ?4)`
    ).bind(order_id, i.ticket_type_id, Number(i.qty), Number(i.price_cents || 0))
  ));
}

async function issueTickets(db, order_id, event_id, hydratedItems, buyer) {
  const tickets = [];
  for (const it of hydratedItems) {
    for (let k = 0; k < Number(it.qty || 0); k++) {
      const qr = `T-${order_id}-${it.ticket_type_id}-${k+1}-${randBase36(5)}`;
      const r = await db.prepare(
        `INSERT INTO tickets
           (order_id, event_id, ticket_type_id, attendee_first, attendee_last,
            gender, email, phone, qr, state, issued_at)
         VALUES (?1, ?2, ?3, '', '', NULL, ?4, ?5, ?6, 'unused', unixepoch())`
      ).bind(order_id, Number(event_id), it.ticket_type_id,
             buyer?.buyer_email || "", buyer?.buyer_phone || "", qr).run();
      tickets.push({ id: r.meta.last_row_id, qr });
    }
  }
  return tickets;
}

async function markOrderPaid(db, order_id, method) {
  await db.prepare(
    `UPDATE orders
        SET status='paid', payment_method = COALESCE(NULLIF(?1,''), payment_method)
      WHERE id=?2`
  ).bind(method || "", order_id).run();
}

/* -------------------------------------------------------------------------- */
/* Public API used by routes                                                   */
/* -------------------------------------------------------------------------- */

/** Pay later (online) – creates a pending order, no tickets yet */
export async function createOrderPayLater(db, body) {
  // body: { event_id, items:[{ticket_type_id,qty}], buyer_name?, buyer_email?, buyer_phone? }
  const event_id = Number(body.event_id || 0);
  if (!event_id) throw new Error("event_id required");
  const items = (Array.isArray(body.items) ? body.items : [])
    .map(x => ({ ticket_type_id: Number(x.ticket_type_id), qty: Number(x.qty) }))
    .filter(x => x.ticket_type_id && x.qty > 0);
  if (!items.length) throw new Error("items required");

  const hydrated = await hydrateItemsWithDB(db, items);
  const total_cents = computeTotalCents(hydrated);

  const items_json = JSON.stringify(items);
  const order_id = await insertOrder(db, {
    event_id,
    buyer_name: body.buyer_name || "",
    buyer_email: body.buyer_email || "",
    buyer_phone: body.buyer_phone || "",
    items_json,
    total_cents,
    status: "pending",        // pay at gate, will be recalled by code
    payment_method: ""        // unknown yet
  });

  const row = await db.prepare(`SELECT short_code FROM orders WHERE id=?1`).bind(order_id).first();
  return { order_id, short_code: row?.short_code || "" };
}

/** Pay now (online) – stub: returns a payment URL, completes later by webhook */
export async function createOrderPayNow(db, body, env) {
  // Same as pay-later insert, but with intent to go pay
  const res = await createOrderPayLater(db, body);
  // Generate a stub payment URL; integrate Yoco Hosted Payments later
  const base = (env && env.PUBLIC_BASE_URL) || "https://events.villiersdorpskou.co.za";
  const payment_url = `${base}/pay/${encodeURIComponent(res.short_code)}`;
  return { ...res, payment_url };
}

/** POS sale – immediate paid order + tickets; optionally sends WhatsApp */
export async function createPOSOrder(db, body, env) {
  // body: { session_id?, event_id, items:[{ticket_type_id,qty}],
  //         payment_method:'cash'|'card', buyer_name?, buyer_email?, buyer_phone? }
  const event_id = Number(body.event_id || 0);
  if (!event_id) throw new Error("event_id required");

  const payment = (body.payment_method || "").toLowerCase();
  if (!["cash","card"].includes(payment)) throw new Error("payment_method must be cash or card");

  const items = (Array.isArray(body.items) ? body.items : [])
    .map(x => ({ ticket_type_id: Number(x.ticket_type_id), qty: Number(x.qty) }))
    .filter(x => x.ticket_type_id && x.qty > 0);
  if (!items.length) throw new Error("items required");

  const hydrated = await hydrateItemsWithDB(db, items);
  const total_cents = computeTotalCents(hydrated);
  const items_json = JSON.stringify(items);

  // Insert order as paid
  const order_id = await insertOrder(db, {
    event_id,
    buyer_name: body.buyer_name || "",
    buyer_email: body.buyer_email || "",
    buyer_phone: body.buyer_phone || "",
    items_json,
    total_cents,
    status: "paid",
    payment_method: payment
  });

  // Persist order_items and tickets
  await insertOrderItems(db, order_id, hydrated);
  const tickets = await issueTickets(db, order_id, event_id, hydrated, {
    buyer_email: body.buyer_email || "",
    buyer_phone: body.buyer_phone || ""
  });

  // Load order + event for downstream (WhatsApp, etc.)
  const orderRow = await db.prepare(
    `SELECT id, short_code, buyer_name, buyer_email, buyer_phone, event_id
       FROM orders WHERE id=?1`
  ).bind(order_id).first();

  const eventRow = await db.prepare(
    `SELECT id, name, slug FROM events WHERE id=?1`
  ).bind(event_id).first();

  // Try WhatsApp (skip silently if no env or no phone/secrets)
  try {
    if (env && orderRow?.buyer_phone) {
      await sendOrderOnWhatsApp(env, orderRow, tickets, eventRow || null);
    }
  } catch (_e) {
    // non-fatal; you can log to a KV or console if needed
  }

  return {
    order_id,
    short_code: orderRow?.short_code || "",
    total_cents,
    tickets_issued: tickets.length,
    payment_method: payment
  };
}

/** Lookup a pending (pay at event) order by short_code */
export async function loadPendingOrderByCode(db, code) {
  const o = await db.prepare(
    `SELECT id, event_id, status, buyer_name, buyer_email, buyer_phone,
            short_code, items_json, total_cents, payment_method
       FROM orders
      WHERE short_code = ?1`
  ).bind((code || "").trim().toUpperCase()).first();
  if (!o) return null;

  // Hydrate items for UI convenience
  const hydrated = await hydrateItems(db, o.items_json);
  return {
    ...o,
    items: hydrated
  };
}

/* -------------------------------------------------------------------------- */
/* Optional: convert a pending "pay later" into PAID at gate                   */
/* (You can call this in your POS settle path if you keep a separate endpoint) */
/* -------------------------------------------------------------------------- */

export async function settlePendingOrder(db, short_code, payment_method, buyer) {
  const o = await db.prepare(
    `SELECT id, event_id, items_json FROM orders
      WHERE short_code=?1 AND status='pending'`
  ).bind(short_code.toUpperCase()).first();
  if (!o) throw new Error("Order not found or already settled");

  const itemsCore = parseItems(o.items_json);
  const hydrated = await hydrateItemsWithDB(db, itemsCore);

  await db.prepare(
    `UPDATE orders
        SET status='paid',
            payment_method=?1,
            buyer_name=COALESCE(NULLIF(?2,''), buyer_name),
            buyer_email=COALESCE(NULLIF(?3,''), buyer_email),
            buyer_phone=COALESCE(NULLIF(?4,''), buyer_phone)
      WHERE id=?5`
  ).bind(
    (payment_method || "").toLowerCase(),
    buyer?.buyer_name || "",
    buyer?.buyer_email || "",
    buyer?.buyer_phone || "",
    o.id
  ).run();

  // Ensure order_items exist (in case you want to track per type)
  await insertOrderItems(db, o.id, hydrated);

  // Issue tickets now
  const tickets = await issueTickets(db, o.id, o.event_id, hydrated, {
    buyer_email: buyer?.buyer_email || "",
    buyer_phone: buyer?.buyer_phone || ""
  });

  // WhatsApp out
  try {
    if (buyer?.buyer_phone && buyer?.env) {
      await sendOrderOnWhatsApp(buyer.env, {
        id: o.id, event_id: o.event_id,
        short_code, buyer_name: buyer?.buyer_name || "",
        buyer_email: buyer?.buyer_email || "",
        buyer_phone: buyer?.buyer_phone || ""
      }, tickets, null);
    }
  } catch {}

  return { ok:true, order_id: o.id, tickets_issued: tickets.length };
}
