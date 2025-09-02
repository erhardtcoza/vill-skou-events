// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

export function mountPOS(router) {
  // (Keep any of your existing POS routes here)

  // Lookup an awaiting-payment order by its short pickup code
  router.add("GET", "/api/pos/orders/lookup/:code", async (_req, env, _ctx, { code }) => {
    try {
      const o = await env.DB
        .prepare(`SELECT id, short_code, event_id, status, total_cents, contact_json
                  FROM orders WHERE short_code=?`)
        .bind(String(code || "").toUpperCase())
        .first();
      if (!o) return bad("Order not found", 404);

      const items = await env.DB
        .prepare(`SELECT ticket_type_id, qty, price_cents
                  FROM order_items WHERE order_id=? ORDER BY id ASC`)
        .bind(o.id)
        .all();

      return json({ ok: true, order: o, items: items.results || [] });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Settle a pay-later order at the gate (cash or card), then issue tickets
  router.add("POST", "/api/pos/orders/:id/settle", async (req, env, _ctx, { id }) => {
    const body = await req.json().catch(() => ({}));
    const method = body.method === "pos_card" ? "pos_card" : "pos_cash";
    const ref = body.payment_ref || "";
    const gate = body.gate_id || null;

    try {
      const o = await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(Number(id)).first();
      if (!o) return bad("Order not found", 404);

      if (o.status === "paid") return json({ ok: true, already: true });

      await env.DB
        .prepare(`UPDATE orders
                  SET status='paid', payment_method=?, payment_ref=?, paid_at=?
                  WHERE id=?`)
        .bind(method, ref, Math.floor(Date.now() / 1000), Number(id))
        .run();

      // TODO: call your ticket issuance function here:
      // const { issueTicketsForOrder } = await import("../services/tickets.js");
      // await issueTicketsForOrder(env, Number(id), gate);

      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}