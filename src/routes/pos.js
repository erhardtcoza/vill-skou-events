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

  // --- Sell ticket ---
  r.post("/sell", async req => {
    try {
      const data = await req.json();
      const { product_id, quantity = 1, method = "cash" } = data;

      if (!product_id) {
        return Response.json({ ok: false, error: "product_id required" }, { status: 400 });
      }

      // Lookup product
      const product = await env.DB.prepare(
        "SELECT id, name, price_cents FROM products WHERE id = ?"
      ).bind(product_id).first();

      if (!product) {
        return Response.json({ ok: false, error: "Product not found" }, { status: 404 });
      }

      const order_id = randomId();
      const total_cents = product.price_cents * quantity;
      const ts = nowTs();

      // Insert order
      await env.DB.prepare(`
        INSERT INTO orders (id, product_id, quantity, total_cents, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).bind(order_id, product_id, quantity, total_cents, ts, ts).run();

      // Simulate payment success
      await env.DB.prepare(
        "UPDATE orders SET status='paid', updated_at=? WHERE id=?"
      ).bind(ts, order_id).run();

      // Render payment receipt
      const receipt = renderTemplate("betaling_ontvang:af", {
        order_id,
        product: product.name,
        amount: (total_cents / 100).toFixed(2),
        method,
        quantity,
      });

      // Render tickets
      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        const ticket_id = randomId();
        await env.DB.prepare(`
          INSERT INTO tickets (id, order_id, product_id, issued_at)
          VALUES (?, ?, ?, ?)
        `).bind(ticket_id, order_id, product_id, ts).run();

        tickets.push(
          renderTemplate("ticket:af", {
            ticket_id,
            product: product.name,
            order_id,
          })
        );
      }

      return Response.json({
        ok: true,
        order_id,
        receipt,
        tickets,
      });
    } catch (err) {
      console.error("POS /sell error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Mount under /api/pos
  router.mount("/api/pos", r);
}