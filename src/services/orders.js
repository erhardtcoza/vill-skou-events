import { q, qi } from "../env.js";
import { issueTickets } from "./tickets.js";

export async function createOnlineOrder(db, secret, payload) {
  // Payment is assumed successful (Yoco hosted/app — we just trust webhook/ref later if needed)
  const { event_id, items, buyer, attendees } = payload;
  const total = await priceOfItems(db, items);
  const order_id = await qi(db, `
    INSERT INTO orders (event_id,channel,payment_method,payment_ref,amount_cents,status,buyer_name,buyer_email,buyer_phone)
    VALUES (?,?,?,?,?,'paid',?,?,?)`,
    event_id, "online", "yoco", payload.payment_ref||null, total, buyer?.name||null, buyer?.email||null, buyer?.phone||null);
  const tickets = await issueTickets(db, payload.secret || secret, order_id, event_id, items, attendees||[]);
  return { order_id, total, tickets };
}

export async function createPOSOrder(db, secret, payload) {
  const { event_id, items, cashier_id, gate_id, payment_method, payment_ref, buyer, attendees } = payload;
  const total = await priceOfItems(db, items);
  const order_id = await qi(db, `
    INSERT INTO orders (event_id,channel,payment_method,payment_ref,amount_cents,status,buyer_name,buyer_email,buyer_phone,gate_id,cashier_id)
    VALUES (?,?,?,?,?,'paid',?,?,?,?,?)`,
    event_id, "pos", payment_method, payment_ref||null, total, buyer?.name||null, buyer?.email||null, buyer?.phone||null, gate_id||null, cashier_id||null);
  const tickets = await issueTickets(db, secret, order_id, event_id, items, attendees||[]);
  return { order_id, total, tickets };
}

async function priceOfItems(db, items) {
  let total = 0;
  for (const it of items) {
    const row = (await q(db, "SELECT price_cents FROM ticket_types WHERE id=?", it.ticket_type_id))[0];
    if (!row) throw new Error("Unknown ticket type");
    total += row.price_cents * (it.qty||1);
  }
  return total;
}
