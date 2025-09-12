// src/routes/pos.js
import { Router } from "../router.js";
import { nowTs } from "../utils/time.js";
import { randomId } from "../utils/id.js";

/** ---- Minimal inline templates (Afrikaans) ---- **/
function renderReceiptAF({ order_id, event_id, ticket_type, amount, method, quantity }) {
  return `
    <div style="font-family:system-ui,sans-serif;padding:12px">
      <h2 style="margin:0 0 8px 0">Betaling Ontvang</h2>
      <div>Bestelling: <strong>${order_id}</strong></div>
      <div>Geleentheid ID: ${event_id}</div>
      <div>Kaartjie: ${ticket_type}</div>
      <div>Hoeveelheid: ${quantity}</div>
      <div>Metode: ${method}</div>
      <div>Bedrag: R ${amount}</div>
      <small style="color:#666">Dankie!</small>
    </div>`;
}

function renderTicketAF({ qr, ticket_type, price }) {
  return `
    <div style="font-family:system-ui,sans-serif;border:1px solid #ddd;border-radius:10px;padding:10px;margin:8px 0">
      <div style="font-weight:600">${ticket_type}</div>
      <div>QR: <code>${qr}</code></div>
      <div>Prijs: R ${price}</div>
    </div>`;
}
/** -------------------------------------------- **/

export function mountPOS(router, env) {
  const r = new Router();

  // --- POS diagnostics ---
  r.get("/diag", async () => {
    return Response.json({
      ok: true,
      base_url: env.BASE_URL ?? null,
      message: "POS OK (inline templates in use)",
    });
  });

  // --- Sell tickets for an event/ticket_type ---
  // Body: { event_id, ticket_type_id, quantity=1, method="cash" }
  r.post("/sell", async (req) => {
    try {
      const data = await req.json();
      const { event_id, ticket_type_id, quantity = 1, method = "cash" } = data;

      if (!event_id) return Response.json({ ok: false, error: "event_id required" }, { status: 400 });
      if (!ticket_type_id) return Response.json({ ok: false, error: "ticket_type_id required" }, { status: 400 });
      if (!Number.isInteger(quantity) || quantity < 1)
        return Response.json({ ok: false, error: "quantity must be >= 1 (integer)" }, { status: 400 });

      // Get ticket type and confirm event linkage
      const tt = await env.DB.prepare(`
        SELECT id, event_id AS tt_event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
        FROM ticket_types
        WHERE id = ?
      `).bind(ticket_type_id).first();

      if (!tt) return Response.json({ ok: false, error: "ticket_type not found" }, { status: 404 });
      if (tt.tt_event_id !== event_id)
        return Response.json({ ok: false, error: "ticket_type does not belong to event" }, { status: 400 });

      // Per-order limit
      if (tt.per_order_limit && quantity > tt.per_order_limit) {
        return Response.json({ ok: false, error: `Per-order limit is ${tt.per_order_limit}` }, { status: 400 });
      }

      // Capacity check (exclude 'void')
      const soldRow = await env.DB.prepare(`
        SELECT COUNT(*) AS issued
        FROM tickets
        WHERE ticket_type_id = ? AND state != 'void'
      `).bind(ticket_type_id).first();
      const issued = soldRow?.issued ?? 0;
      const remaining = tt.capacity - issued;
      if (remaining < quantity) {
        return Response.json({ ok: false, error: `Not enough capacity. Remaining: ${remaining}`, remaining }, { status: 400 });
      }

      const ts = nowTs();
      const total_cents = tt.price_cents * quantity;

      // Create order (mark paid for POS)
      await env.DB.prepare(`
        INSERT INTO orders (event_id, ticket_type_id, quantity, total_cents, method, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'paid', ?, ?)
      `).bind(event_id, ticket_type_id, quantity, total_cents, method, ts, ts).run();

      const orderRow = await env.DB.prepare(`SELECT last_insert_rowid() AS id`).first();
      const order_id = orderRow.id;

      // Log payment
      await env.DB.prepare(`
        INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
        VALUES (?, ?, ?, 'approved', ?, ?)
      `).bind(order_id, total_cents, method, ts, ts).run();

      // Issue tickets
      const ticketCards = [];
      const ticketsRaw = [];
      for (let i = 0; i < quantity; i++) {
        let qr = randomId(16);
        let inserted = false;
        for (let tries = 0; tries < 3 && !inserted; tries++) {
          try {
            await env.DB.prepare(`
              INSERT INTO tickets (order_id, event_id, ticket_type_id, qr, state, issued_at)
              VALUES (?, ?, ?, ?, 'unused', ?)
            `).bind(order_id, event_id, ticket_type_id, qr, ts).run();
            inserted = true;
          } catch (e) {
            if (String(e?.message || "").includes("UNIQUE") && tries < 2) qr = randomId(16);
            else throw e;
          }
        }
        ticketsRaw.push({ order_id, event_id, ticket_type_id, qr, state: "unused", issued_at: ts });
        ticketCards.push(
          renderTicketAF({
            qr,
            ticket_type: tt.name,
            price: (tt.price_cents / 100).toFixed(2),
          })
        );
      }

      // Receipt
      const receiptHTML = renderReceiptAF({
        order_id,
        event_id,
        ticket_type: tt.name,
        amount: (total_cents / 100).toFixed(2),
        method,
        quantity,
      });

      return Response.json({
        ok: true,
        order_id,
        receipt_html: receiptHTML,   // simple render inlined
        tickets_html: ticketCards,   // array of small HTML snippets
        tickets: ticketsRaw,         // raw data if your UI prefers to render itself
        remaining_after: remaining - quantity,
      });
    } catch (err) {
      console.error("POS /sell error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // --- Get order summary ---
  r.get("/order/:id", async (_req, params) => {
    try {
      const { id } = params;
      const order = await env.DB.prepare(`
        SELECT o.id, o.event_id, o.ticket_type_id, o.quantity, o.total_cents, o.method, o.status, o.created_at, o.updated_at,
               tt.name as ticket_type_name, tt.code as ticket_type_code, tt.price_cents
        FROM orders o
        JOIN ticket_types tt ON tt.id = o.ticket_type_id
        WHERE o.id = ?
      `).bind(id).first();

      if (!order) return Response.json({ ok: false, error: "order not found" }, { status: 404 });

      const tickets = await env.DB.prepare(`
        SELECT id, qr, state, issued_at, first_in_at, last_out_at
        FROM tickets WHERE order_id = ?
      `).bind(id).all();

      const payments = await env.DB.prepare(`
        SELECT id, amount_cents, method, status, created_at
        FROM payments WHERE order_id = ?
        ORDER BY created_at ASC
      `).bind(id).all();

      return Response.json({ ok: true, order, tickets: tickets.results ?? [], payments: payments.results ?? [] });
    } catch (err) {
      console.error("POS /order error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // --- Void a single ticket by QR ---
  // Body: { qr, reason? }
  r.post("/void-ticket", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`SELECT id, order_id, state FROM tickets WHERE qr = ?`).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: true, already_void: true });

      await env.DB.prepare(`UPDATE tickets SET state='void' WHERE id=?`).bind(t.id).run();

      // If every ticket on the order is void -> mark order refunded (soft)
      const counts = await env.DB.prepare(`
        SELECT SUM(CASE WHEN state='void' THEN 1 ELSE 0 END) AS voids,
               COUNT(*) AS total
        FROM tickets WHERE order_id = ?
      `).bind(t.order_id).first();

      if (counts && counts.voids === counts.total) {
        await env.DB.prepare(`UPDATE orders SET status='refunded', updated_at=? WHERE id=?`)
          .bind(nowTs(), t.order_id).run();
      }

      return Response.json({ ok: true, order_id: t.order_id });
    } catch (err) {
      console.error("POS /void-ticket error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // --- Refund an entire order ---
  // Body: { order_id, method="cash", reason? }
  // - Voids all tickets
  // - Inserts a negative payment
  // - Sets order.status='refunded'
  r.post("/refund", async (req) => {
    try {
      const { order_id, method = "cash" } = await req.json();
      if (!order_id) return Response.json({ ok: false, error: "order_id required" }, { status: 400 });

      const o = await env.DB.prepare(`SELECT id, total_cents FROM orders WHERE id = ?`).bind(order_id).first();
      if (!o) return Response.json({ ok: false, error: "order not found" }, { status: 404 });

      await env.DB.prepare(`UPDATE tickets SET state='void' WHERE order_id=?`).bind(order_id).run();

      const ts = nowTs();
      await env.DB.prepare(`
        INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
        VALUES (?, ?, ?, 'approved', ?, ?)
      `).bind(order_id, -Math.abs(o.total_cents), method, ts, ts).run();

      await env.DB.prepare(`UPDATE orders SET status='refunded', updated_at=? WHERE id=?`)
        .bind(ts, order_id).run();

      return Response.json({ ok: true, order_id, refunded_cents: -Math.abs(o.total_cents) });
    } catch (err) {
      console.error("POS /refund error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  router.mount("/api/pos", r);
}