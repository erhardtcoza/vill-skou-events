// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

/* ---------- Helpers ---------- */

// Compute total from items [{ticket_type_id, qty}]
async function computeTotalCents(db, items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let total = 0;
  for (const it of items) {
    const tt = await db.prepare("SELECT price_cents FROM ticket_types WHERE id=?1")
      .bind(it.ticket_type_id).first();
    const price = Number(tt?.price_cents || 0);
    const qty = Number(it?.qty || 0);
    total += price * qty;
  }
  return total;
}

// Expand items with name/price
async function hydrateItems(db, items) {
  const out = [];
  for (const it of (items || [])) {
    const tt = await db.prepare("SELECT id, name, price_cents FROM ticket_types WHERE id=?1")
      .bind(it.ticket_type_id).first();
    if (!tt) continue;
    out.push({
      ticket_type_id: tt.id,
      name: tt.name,
      price_cents: Number(tt.price_cents || 0),
      qty: Number(it.qty || 0)
    });
  }
  return out;
}

// Load pending order by short code
async function loadPendingOrderByCode(db, code) {
  const ord = await db.prepare(
    `SELECT id, event_id, short_code, status, items_json, buyer_name, buyer_phone
     FROM orders WHERE short_code=?1 LIMIT 1`
  ).bind(code).first();
  if (!ord || ord.status !== 'pending') return null;
  let items = [];
  try { items = JSON.parse(ord.items_json || "[]"); } catch {}
  return { order: ord, items };
}

// Minimal ticket issuing (fallback if service not available)
async function issueTicketsForOrder(db, order_id, event_id, items, buyer_phone) {
  const tickets = [];
  for (const it of (items || [])) {
    const qty = Number(it.qty || 0);
    const ttId = Number(it.ticket_type_id);
    if (!qty || !ttId) continue;
    for (let i = 0; i < qty; i++) {
      const qr = `O${order_id}-TT${ttId}-${i+1}-${Math.random().toString(36).slice(2,8)}`;
      const ins = await db.prepare(
        `INSERT INTO tickets (order_id, event_id, ticket_type_id, attendee_first, attendee_last, email, phone, qr, state, issued_at)
         VALUES (?1, ?2, ?3, '', '', '', ?4, ?5, 'unused', unixepoch())`
      ).bind(order_id, event_id, ttId, buyer_phone || '', qr).run();
      tickets.push({ id: Number(ins.lastInsertRowid), qr });
    }
  }
  return tickets;
}

// Create POS sale (existing behavior)
async function createPosSale(db, body) {
  try {
    const { createPOSOrder } = await import("../services/orders.js");
    return await createPOSOrder(db, body);
  } catch {
    const total_cents = await computeTotalCents(db, body.items || []);
    const insOrder = await db.prepare(
      `INSERT INTO orders (event_id, source, status, buyer_name, buyer_phone, payment_method, total_cents, created_at, paid_at)
       VALUES (?1,'pos','paid',?2,?3,?4,?5,unixepoch(),unixepoch())`
    ).bind(body.event_id, body.buyer_name || "", body.buyer_phone || "", body.payment_method || "cash", total_cents).run();
    const order_id = Number(insOrder.lastInsertRowid);
    const tickets = await issueTicketsForOrder(db, order_id, body.event_id, body.items, body.buyer_phone);
    return { ok: true, order_id, total_cents, tickets };
  }
}

/* ---------- Routes ---------- */

export function mountPOS(router) {
  // POS bootstrap (catalog)
  router.add("POST", "/api/pos/bootstrap", async (_req, env) => {
    try {
      const events = (await env.DB.prepare(
        `SELECT id, slug, name, starts_at, ends_at, venue
         FROM events WHERE status='active' ORDER BY starts_at ASC`
      ).all()).results || [];
      const tts = (await env.DB.prepare(
        `SELECT id, event_id, name, price_cents, requires_gender
         FROM ticket_types ORDER BY id`
      ).all()).results || [];
      const byEvent = {};
      for (const t of tts) (byEvent[t.event_id] ||= []).push(t);
      return json({ ok: true, events, ticket_types_by_event: byEvent });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Open cashup
  router.add("POST", "/api/pos/cashups/open", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const cashier = (b.cashier_name || "").trim();
    const gate = (b.gate_name || "").trim();
    const openingFloatCents = Math.round(Number(b.opening_float_rands || 0) * 100);
    if (!cashier || !gate) return bad("Missing cashier_name or gate_name");
    try {
      const existing = await env.DB.prepare(
        `SELECT id FROM pos_cashups WHERE cashier_name=?1 AND gate_name=?2 AND closed_at IS NULL
         ORDER BY opened_at DESC LIMIT 1`
      ).bind(cashier, gate).first();
      if (existing) return json({ ok: true, id: existing.id, reused: true });
      const res = await env.DB.prepare(
        `INSERT INTO pos_cashups (cashier_name, gate_name, opening_float_cents, opened_at)
         VALUES (?1,?2,?3,unixepoch())`
      ).bind(cashier, gate, openingFloatCents).run();
      return json({ ok: true, id: Number(res.lastInsertRowid) });
    } catch (e) { return json({ ok: false, error: String(e) }, 500); }
  });

  // Close cashup
  router.add("POST", "/api/pos/cashups/close", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const id = Number(b.cashup_id || 0);
    const manager = (b.manager_name || "").trim();
    if (!id || !manager) return bad("Missing cashup_id or manager_name");
    try {
      await env.DB.prepare(
        `UPDATE pos_cashups SET closed_at=unixepoch(), manager_name=?1 WHERE id=?2`
      ).bind(manager, id).run();
      return json({ ok: true });
    } catch (e) { return json({ ok: false, error: String(e) }, 500); }
  });

  // Record POS sale (immediate payment)
  router.add("POST", "/api/pos/sale", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.cashup_id || !b?.event_id || !Array.isArray(b.items) || b.items.length === 0)
      return bad("Invalid request");
    const method = b.payment_method === "card" ? "card" : "cash";
    try {
      const sale = await createPosSale(env.DB, {
        event_id: b.event_id,
        items: b.items,
        buyer_name: b.buyer_name || "",
        buyer_phone: b.buyer_phone || "",
        payment_method: method,
        cashup_id: b.cashup_id
      });

      if (!sale?.order_id) return json({ ok: false, error: "Failed to create order" }, 500);

      const totalCents = typeof sale.total_cents === "number"
        ? sale.total_cents
        : await computeTotalCents(env.DB, b.items);

      const field = method === "cash" ? "total_cash_cents" : "total_card_cents";
      await env.DB.prepare(`UPDATE pos_cashups SET ${field}=COALESCE(${field},0)+?1 WHERE id=?2`)
        .bind(totalCents, b.cashup_id).run();

      return json({ ok: true, order_id: sale.order_id, total_cents: totalCents, tickets: sale.tickets || [] });
    } catch (e) { return json({ ok: false, error: String(e) }, 500); }
  });

  // ---- Recall: fetch pending order by short code
  router.add("GET", "/api/pos/recall/:code", async (_req, env, _ctx, { code }) => {
    try {
      const data = await loadPendingOrderByCode(env.DB, code);
      if (!data) return bad("Order not found or not pending", 404);
      const items = await hydrateItems(env.DB, data.items);
      const total_cents = await computeTotalCents(env.DB, items);
      return json({ ok: true,
        order_id: data.order.id,
        event_id: data.order.event_id,
        buyer_name: data.order.buyer_name || "",
        buyer_phone: data.order.buyer_phone || "",
        items,
        total_cents
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // ---- Recall confirm: take payment, mark paid, issue tickets, update cashup totals
  // Body: { code, cashup_id, payment_method: 'cash'|'card', buyer_name?, buyer_phone?, items? }
  router.add("POST", "/api/pos/recall/confirm", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.code || !b?.cashup_id) return bad("Missing code or cashup_id");

    try {
      const found = await loadPendingOrderByCode(env.DB, b.code);
      if (!found) return bad("Order not found or not pending", 404);

      // Use adjusted items if provided; otherwise items from order
      let items = Array.isArray(b.items) && b.items.length ? b.items : found.items;
      items = await hydrateItems(env.DB, items);
      const total_cents = await computeTotalCents(env.DB, items);
      const method = b.payment_method === 'card' ? 'card' : 'cash';

      // Mark order paid and store details
      await env.DB.prepare(
        `UPDATE orders
         SET status='paid', source='pos', payment_method=?1, total_cents=?2,
             buyer_name=COALESCE(?3, buyer_name), buyer_phone=COALESCE(?4, buyer_phone),
             paid_at=unixepoch()
         WHERE id=?5`
      ).bind(method, total_cents, b.buyer_name || null, b.buyer_phone || null, found.order.id).run();

      // Issue tickets
      const tickets = await issueTicketsForOrder(env.DB, found.order.id, found.order.event_id, items, b.buyer_phone || found.order.buyer_phone);

      // Update cashup totals
      const field = method === "cash" ? "total_cash_cents" : "total_card_cents";
      await env.DB.prepare(`UPDATE pos_cashups SET ${field}=COALESCE(${field},0)+?1 WHERE id=?2`)
        .bind(total_cents, b.cashup_id).run();

      return json({ ok: true, order_id: found.order.id, total_cents, tickets });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}