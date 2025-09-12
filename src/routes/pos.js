// src/routes/pos.js
import { Router } from "../router.js";
import { renderTemplate } from "../ui/templates.js";
import { nowTs } from "../utils/time.js";
import { randomId } from "../utils/id.js";

export function mountPOS(router, env) {
  const r = new Router();

  // --- POS diagnostics ---
  r.get("/diag", async () => {
    return Response.json({
      ok: true,
      base_url: env.BASE_URL,
      payment_template: "betaling_ontvang:af",
      ticket_template: "ticket:af",
    });
  });

  // --- Sell tickets for an event/ticket_type ---
  // Body: { event_id, ticket_type_id, quantity=1, method="cash" }
  r.post("/sell", async (req) => {
    try {
      const data = await req.json();
      const {
        event_id,
        ticket_type_id,
        quantity = 1,
        method = "cash",
      } = data;

      if (!event_id) {
        return Response.json({ ok: false, error: "event_id required" }, { status: 400 });
      }
      if (!ticket_type_id) {
        return Response.json({ ok: false, error: "ticket_type_id required" }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity < 1) {
        return Response.json({ ok: false, error: "quantity must be >= 1 (integer)" }, { status: 400 });
      }

      // Get ticket type (and confirm event linkage)
      const tt = await env.DB.prepare(`
        SELECT id, event_id AS tt_event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
        FROM ticket_types
        WHERE id = ?
      `).bind(ticket_type_id).first();

      if (!tt) {
        return Response.json({ ok: false, error: "ticket_type not found" }, { status: 404 });
      }
      if (tt.tt_event_id !== event_id) {
        return Response.json({ ok: false, error: "ticket_type does not belong to event" }, { status: 400 });
      }

      // Per-order limit
      if (tt.per_order_limit && quantity > tt.per_order_limit) {
        return Response.json({
          ok: false,
          error: `Per-order limit is ${tt.per_order_limit}`,
        }, { status: 400 });
      }

      // Capacity check: count non-void tickets already issued for this type
      const soldRow = await env.DB.prepare(`
        SELECT COUNT(*) AS issued
        FROM tickets
        WHERE ticket_type_id = ?
          AND state != 'void'
      `).bind(ticket_type_id).first();
      const issued = soldRow?.issued ?? 0;
      const remaining = tt.capacity - issued;

      if (remaining < quantity) {
        return Response.json({
          ok: false,
          error: `Not enough capacity. Remaining: ${remaining}`,
          remaining,
        }, { status: 400 });
      }

      const ts = nowTs();
      const total_cents = tt.price_cents * quantity;

      // Create order (mark paid immediately for POS)
      await env.DB.prepare(`
        INSERT INTO orders (event_id, ticket_type_id, quantity, total_cents, method, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'paid', ?, ?)
      `).bind(event_id, ticket_type_id, quantity, total_cents, method, ts, ts).run();

      // Get the auto-incremented order id
      const orderRow = await env.DB.prepare(`SELECT last_insert_rowid() AS id`).first();
      const order_id = orderRow.id;

      // Log payment (optional but useful for audit)
      await env.DB.prepare(`
        INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
        VALUES (?, ?, ?, 'approved', ?, ?)
      `).bind(order_id, total_cents, method, ts, ts).run();

      // Issue tickets
      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        // Ensure UNIQUE qr; retry on the rare chance of collision
        let qr = randomId(16);
        let inserted = false;
        for (let attempts = 0; attempts < 3 && !inserted; attempts++) {
          try {
            await env.DB.prepare(`
              INSERT INTO tickets (order_id, event_id, ticket_type_id, qr, state, issued_at)
              VALUES (?, ?, ?, ?, 'unused', ?)
            `).bind(order_id, event_id, ticket_type_id, qr, ts).run();
            inserted = true;
          } catch (e) {
            if (String(e?.message || "").includes("UNIQUE") && attempts < 2) {
              qr = randomId(16); // try a new code
            } else {
              throw e;
            }
          }
        }

        // Render individual ticket (Afrikaans template)
        tickets.push(
          renderTemplate("ticket:af", {
            order_id,
            event_id,
            ticket_type_id,
            qr,
            ticket_type: tt.name,
            price: (tt.price_cents / 100).toFixed(2),
          })
        );
      }

      // Render receipt
      const receipt = renderTemplate("betaling_ontvang:af", {
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
        receipt,
        tickets,
        remaining_after: remaining - quantity,
      });
    } catch (err) {
      console.error("POS /sell error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Mount under /api/pos
  router.mount("/api/pos", r);
}