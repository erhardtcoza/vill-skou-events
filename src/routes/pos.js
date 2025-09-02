// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

/**
 * Helper: fetch ticket type rows and compute total cents for items
 * items: [{ ticket_type_id, qty }]
 */
async function computeTotalCents(db, items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let total = 0;
  for (const it of items) {
    const tt = await db
      .prepare("SELECT price_cents FROM ticket_types WHERE id=?1")
      .bind(it.ticket_type_id)
      .first();
    const price = Number(tt?.price_cents || 0);
    const qty = Number(it?.qty || 0);
    total += price * qty;
  }
  return total;
}

/**
 * Helper: upsert order + tickets for POS sale using services/orders.js
 * Returns: { ok, order_id, total_cents, tickets:[...] }
 */
async function createPosSale(db, body) {
  // We’ll reuse your existing order service if available.
  try {
    const { createPOSOrder } = await import("../services/orders.js");
    // Expected body: { event_id, items, buyer_name, buyer_phone, payment_method, cashup_id }
    return await createPOSOrder(db, body);
  } catch {
    // Fallback minimal implementation if createPOSOrder doesn’t exist yet.
    // Create an order, then insert tickets per qty. No capacity checks here.
    const total_cents = await computeTotalCents(db, body.items || []);
    const insOrder = await db
      .prepare(
        `INSERT INTO orders (event_id, source, status, buyer_name, buyer_phone, payment_method, total_cents, created_at)
         VALUES (?1,'pos','paid',?2,?3,?4,?5,unixepoch())`
      )
      .bind(
        body.event_id,
        body.buyer_name || "",
        body.buyer_phone || "",
        body.payment_method || "cash",
        total_cents
      )
      .run();

    const order_id = Number(insOrder.lastInsertRowid);
    const tickets = [];
    for (const it of body.items || []) {
      const qty = Number(it.qty || 0);
      if (!qty) continue;
      for (let i = 0; i < qty; i++) {
        // Build a simple QR payload (can be replaced later)
        const qrPayload = `O${order_id}-TT${it.ticket_type_id}-${i + 1}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const insT = await db
          .prepare(
            `INSERT INTO tickets (order_id, event_id, ticket_type_id, attendee_first, attendee_last, email, phone, qr, state, issued_at)
             VALUES (?1,?2,?3,'','','',?4,?5,'unused',unixepoch())`
          )
          .bind(order_id, body.event_id, it.ticket_type_id, body.buyer_phone || "", qrPayload)
          .run();
        tickets.push({ id: Number(insT.lastInsertRowid), qr: qrPayload });
      }
    }
    return { ok: true, order_id, total_cents, tickets };
  }
}

export function mountPOS(router) {
  /**
   * POS bootstrap: lightweight catalog for the POS screen
   * Returns active events + their ticket types
   */
  router.add("POST", "/api/pos/bootstrap", async (_req, env) => {
    try {
      const events = (
        await env.DB
          .prepare(
            `SELECT id, slug, name, starts_at, ends_at, venue
             FROM events WHERE status='active'
             ORDER BY starts_at ASC`
          )
          .all()
      ).results || [];

      // Ticket types keyed by event_id
      const tts = (
        await env.DB
          .prepare(
            `SELECT id, event_id, name, price_cents, requires_gender
             FROM ticket_types ORDER BY id`
          )
          .all()
      ).results || [];

      const byEvent = {};
      for (const t of tts) {
        (byEvent[t.event_id] ||= []).push(t);
      }

      return json({ ok: true, events, ticket_types_by_event: byEvent });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /**
   * Open a cashup session (idempotent by cashier+gate if still open)
   * Body: { cashier_name, gate_name, opening_float_rands }
   */
  router.add("POST", "/api/pos/cashups/open", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const cashier = (b.cashier_name || "").trim();
    const gate = (b.gate_name || "").trim();
    const openingFloatCents = Math.round(Number(b.opening_float_rands || 0) * 100);

    if (!cashier || !gate) return bad("Missing cashier_name or gate_name");

    try {
      // Check active session for same cashier+gate
      const existing = await env.DB
        .prepare(
          `SELECT id FROM pos_cashups
           WHERE cashier_name=?1 AND gate_name=?2 AND closed_at IS NULL
           ORDER BY opened_at DESC LIMIT 1`
        )
        .bind(cashier, gate)
        .first();
      if (existing) return json({ ok: true, id: existing.id, reused: true });

      const res = await env.DB
        .prepare(
          `INSERT INTO pos_cashups (cashier_name, gate_name, opening_float_cents, opened_at)
           VALUES (?1,?2,?3,unixepoch())`
        )
        .bind(cashier, gate, openingFloatCents)
        .run();

      return json({ ok: true, id: Number(res.lastInsertRowid) });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /**
   * Close a cashup session
   * Body: { cashup_id, manager_name }
   */
  router.add("POST", "/api/pos/cashups/close", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const id = Number(b.cashup_id || 0);
    const manager = (b.manager_name || "").trim();
    if (!id || !manager) return bad("Missing cashup_id or manager_name");

    try {
      await env.DB
        .prepare(
          `UPDATE pos_cashups
           SET closed_at = unixepoch(), manager_name = ?1
           WHERE id = ?2`
        )
        .bind(manager, id)
        .run();
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /**
   * Record a POS sale and update totals on the cashup
   * Body: {
   *   cashup_id, event_id,
   *   items: [{ ticket_type_id, qty }],
   *   payment_method: "cash" | "card",
   *   buyer_name?, buyer_phone?
   * }
   */
  router.add("POST", "/api/pos/sale", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.cashup_id || !b?.event_id || !Array.isArray(b.items) || b.items.length === 0) {
      return bad("Invalid request");
    }
    const method = b.payment_method === "card" ? "card" : "cash";

    try {
      // Create order + tickets via service (or fallback)
      const sale = await createPosSale(env.DB, {
        event_id: b.event_id,
        items: b.items,
        buyer_name: b.buyer_name || "",
        buyer_phone: b.buyer_phone || "",
        payment_method: method,
        cashup_id: b.cashup_id
      });

      if (!sale?.ok && !sale?.order_id) {
        // Fallback path returns ok=true; but keep guard anyway
        return json({ ok: false, error: "Failed to create order" }, 500);
      }
      const totalCents =
        typeof sale.total_cents === "number"
          ? sale.total_cents
          : await computeTotalCents(env.DB, b.items);

      // Update cash/card totals on this cashup
      const field = method === "cash" ? "total_cash_cents" : "total_card_cents";
      await env.DB
        .prepare(
          `UPDATE pos_cashups SET ${field} = COALESCE(${field},0) + ?1
           WHERE id = ?2`
        )
        .bind(totalCents, b.cashup_id)
        .run();

      return json({
        ok: true,
        order_id: sale.order_id,
        total_cents: totalCents,
        tickets: sale.tickets || []
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /**
   * Fetch a specific cashup (for admin or audit)
   */
  router.add("GET", "/api/pos/cashups/:id", async (_req, env, _ctx, { id }) => {
    try {
      const row = await env.DB
        .prepare(
          `SELECT id, cashier_name, gate_name, opened_at, closed_at,
                  opening_float_cents, total_cash_cents, total_card_cents,
                  manager_name, notes
           FROM pos_cashups WHERE id=?1`
        )
        .bind(id)
        .first();
      if (!row) return bad("Not found", 404);
      return json({ ok: true, cashup: row });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}
