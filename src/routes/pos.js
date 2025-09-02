// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import {
  computeTotalCents,
  hydrateItems,
  createPOSOrder,
  loadPendingOrderByCode,
} from "../services/orders.js";

function moneyR(c){ return "R "+(Number(c||0)/100).toFixed(2); }

// Local fallback issuer (normally createPOSOrder issues tickets already)
async function issueTicketsForOrder(db, order_id, event_id, items, buyer_phone) {
  const tickets = [];
  for (const it of items || []) {
    const qty = Number(it.qty || 0);
    const ttId = Number(it.ticket_type_id);
    if (!qty || !ttId) continue;
    for (let i=0;i<qty;i++){
      const qr = `O${order_id}-TT${ttId}-${i+1}-${Math.random().toString(36).slice(2,8)}`;
      const ins = await db.prepare(
        `INSERT INTO tickets (order_id, event_id, ticket_type_id, attendee_first, attendee_last, email, phone, qr, state, issued_at)
         VALUES (?1, ?2, ?3, '', '', '', ?4, ?5, 'unused', unixepoch())`
      ).bind(order_id, event_id, ttId, buyer_phone||'', qr).run();
      tickets.push({ id: Number(ins.lastInsertRowid), qr });
    }
  }
  return tickets;
}

export function mountPOS(router, opts = {}) {
  const guard = opts.protectWith || ((h)=>h);

  // POS bootstrap (events + ticket types)
  router.add("POST", "/api/pos/bootstrap", guard(async (_req, env) => {
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
      return json({ ok:true, events, ticket_types_by_event: byEvent });
    } catch(e){ return json({ ok:false, error:String(e) }, 500); }
  }));

  // Open cashup
  router.add("POST", "/api/pos/cashups/open", guard(async (req, env) => {
    const b = await req.json().catch(()=>({}));
    const cashier = (b.cashier_name||"").trim();
    const gate = (b.gate_name||"").trim();
    const openingFloatCents = Math.round(Number(b.opening_float_rands||0)*100);
    if (!cashier || !gate) return bad("Missing cashier_name or gate_name");
    try {
      const existing = await env.DB.prepare(
        `SELECT id FROM pos_cashups WHERE cashier_name=?1 AND gate_name=?2 AND closed_at IS NULL
         ORDER BY opened_at DESC LIMIT 1`
      ).bind(cashier, gate).first();
      if (existing) return json({ ok:true, id: existing.id, reused:true });
      const res = await env.DB.prepare(
        `INSERT INTO pos_cashups (cashier_name, gate_name, opening_float_cents, opened_at)
         VALUES (?1,?2,?3,unixepoch())`
      ).bind(cashier, gate, openingFloatCents).run();
      return json({ ok:true, id: Number(res.lastInsertRowid) });
    } catch(e){ return json({ ok:false, error:String(e) }, 500); }
  }));

  // Close cashup
  router.add("POST", "/api/pos/cashups/close", guard(async (req, env) => {
    const b = await req.json().catch(()=>({}));
    const id = Number(b.cashup_id||0);
    const manager = (b.manager_name||"").trim();
    if (!id || !manager) return bad("Missing cashup_id or manager_name");
    try {
      await env.DB.prepare(
        `UPDATE pos_cashups SET closed_at=unixepoch(), manager_name=?1 WHERE id=?2`
      ).bind(manager, id).run();
      return json({ ok:true });
    } catch(e){ return json({ ok:false, error:String(e) }, 500); }
  }));

  // POS immediate sale
  router.add("POST", "/api/pos/sale", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.cashup_id || !b?.event_id || !Array.isArray(b.items) || b.items.length===0) return bad("Invalid request");
    const method = b.payment_method === "card" ? "card" : "cash";
    try {
      const sale = await createPOSOrder(env.DB, {
        event_id: b.event_id,
        items: b.items,
        buyer_name: b.buyer_name||'',
        buyer_phone: b.buyer_phone||'',
        payment_method: method,
        cashup_id: b.cashup_id
      });
      if (!sale?.order_id) return json({ ok:false, error:"Failed to create order" }, 500);

      const totalCents = typeof sale.total_cents==='number' ? sale.total_cents : await computeTotalCents(env.DB, b.items);
      const field = method==='cash' ? "total_cash_cents" : "total_card_cents";
      await env.DB.prepare(`UPDATE pos_cashups SET ${field}=COALESCE(${field},0)+?1 WHERE id=?2`)
        .bind(totalCents, b.cashup_id).run();

      // Notify best-effort
      try { const { notifyTicketsPaid } = await import("../services/notify.js"); await notifyTicketsPaid(env, sale.order_id); } catch {}

      return json({ ok:true, order_id: sale.order_id, total_cents: totalCents, tickets: sale.tickets||[] });
    } catch(e){ return json({ ok:false, error:String(e) }, 500); }
  }));

  // Recall fetch
  router.add("GET", "/api/pos/recall/:code", guard(async (_req, env, _ctx, { code }) => {
    try {
      const found = await loadPendingOrderByCode(env.DB, code);
      if (!found) return bad("Order not found or not pending", 404);
      const items = await hydrateItems(env.DB, found.items);
      const total_cents = await computeTotalCents(env.DB, items);
      return json({
        ok:true,
        order_id: found.order.id,
        event_id: found.order.event_id,
        buyer_name: found.order.buyer_name||'',
        buyer_phone: found.order.buyer_phone||'',
        items, total_cents
      });
    } catch(e){ return json({ ok:false, error:String(e) }, 500); }
  }));

  // Recall confirm
  router.add("POST", "/api/pos/recall/confirm", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.code || !b?.cashup_id) return bad("Missing code or cashup_id");
    try {
      const found = await loadPendingOrderByCode(env.DB, b.code);
      if (!found) return bad("Order not found or not pending", 404);

      let items = Array.isArray(b.items) && b.items.length ? b.items : found.items;
      items = await hydrateItems(env.DB, items);
      const total_cents = await computeTotalCents(env.DB, items);
      const method = b.payment_method === "card" ? "card" : "cash";

      await env.DB.prepare(
        `UPDATE orders
         SET status='paid', source='pos', payment_method=?1, total_cents=?2,
             buyer_name=COALESCE(?3, buyer_name), buyer_phone=COALESCE(?4, buyer_phone),
             paid_at=unixepoch(), items_json=?5
         WHERE id=?6`
      ).bind(method, total_cents, b.buyer_name||null, b.buyer_phone||null,
             JSON.stringify(items.map(({ticket_type_id,qty})=>({ticket_type_id,qty}))),
             found.order.id).run();

      const tickets = await issueTicketsForOrder(env.DB, found.order.id, found.order.event_id, items, b.buyer_phone || found.order.buyer_phone);

      const field = method==='cash' ? "total_cash_cents" : "total_card_cents";
      await env.DB.prepare(`UPDATE pos_cashups SET ${field}=COALESCE(${field},0)+?1 WHERE id=?2`)
        .bind(total_cents, b.cashup_id).run();

      try { const { notifyTicketsPaid } = await import("../services/notify.js"); await notifyTicketsPaid(env, found.order.id); } catch {}

      return json({ ok:true, order_id: found.order.id, total_cents, tickets });
    } catch(e){ return json({ ok:false, error:String(e) }, 500); }
  }));
}