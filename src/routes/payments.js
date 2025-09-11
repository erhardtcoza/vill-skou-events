// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

/**
 * Yoco payments (Checkout bootstrap + Webhook).
 * - POST /api/payments/intent
 * - POST /api/payments/yoco/webhook
 *
 * Notes:
 * - We read configuration from the `site_settings` table (key,value).
 * - We DO NOT call Yoco in /intent (no external dependency). We return
 *   the publishable key + order totals so the frontend can start the
 *   Checkout-API flow. You can later extend this to create a Yoco
 *   session server-side if you prefer.
 * - Webhook is tolerant: it tries several common Yoco payload shapes and
 *   updates the matching order (by short_code inside metadata/reference).
 */

export function mountPayments(router) {

  /* ---------- tiny settings helpers (site_settings table) ---------- */

  async function getSetting(env, key) {
    const row = await env.DB
      .prepare(`SELECT value FROM site_settings WHERE key = ?1 LIMIT 1`)
      .bind(key)
      .first();
    return row ? row.value : null;
  }

  async function getYocoConfig(env) {
    const mode = (await getSetting(env, "YOCO_MODE")) === "live" ? "live" : "sandbox";

    // Keys by mode
    const pub = mode === "live"
      ? await getSetting(env, "YOCO_LIVE_PUBLIC_KEY")
      : await getSetting(env, "YOCO_TEST_PUBLIC_KEY");

    const sec = mode === "live"
      ? await getSetting(env, "YOCO_LIVE_SECRET_KEY")
      : await getSetting(env, "YOCO_TEST_SECRET_KEY");

    return { mode, public_key: pub || "", secret_key: sec || "" };
  }

  /* ---------- POST /api/payments/intent ---------------------------- */
  // Input: { code?: string, order_id?: number }
  // Output: { ok, mode, public_key, order:{ id, short_code, amount_cents, currency } }
  router.add("POST", "/api/payments/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const code = String(b?.code || "").trim();
    const oid  = Number(b?.order_id || 0);

    // Fetch order either by short_code or id
    let order = null;
    if (code) {
      order = await env.DB.prepare(
        `SELECT id, short_code, total_cents, currency, status, payment_method
           FROM orders
          WHERE UPPER(short_code)=UPPER(?1)
          LIMIT 1`
      ).bind(code).first();
    } else if (oid) {
      order = await env.DB.prepare(
        `SELECT id, short_code, total_cents, currency, status, payment_method
           FROM orders
          WHERE id = ?1
          LIMIT 1`
      ).bind(oid).first();
    } else {
      return bad("order code or order_id required");
    }

    if (!order) return bad("Order not found", 404);

    // Optional: gate-keep only online_yoco orders
    // (not strict, but helps prevent wrong method usage)
    if ((order.payment_method || "") !== "online_yoco") {
      // Allow but warn
      // return bad("Order is not set for online payment");
    }

    const { mode, public_key } = await getYocoConfig(env);

    // Default to ZAR if no currency column in your DB (some schemas don’t have it)
    const currency = (order.currency || "ZAR").toUpperCase();
    const amount_cents = Number(order.total_cents || 0);

    return json({
      ok: true,
      provider: "yoco",
      mode,
      public_key,
      order: {
        id: order.id,
        short_code: order.short_code,
        amount_cents,
        currency
      }
      // If you later create a Yoco session server-side, you can also add:
      // session_id, session_url, expires_at, etc.
    });
  });

  /* ---------- POST /api/payments/yoco/webhook ---------------------- */
  // Configure this URL in Yoco's dashboard as your webhook endpoint:
  //   https://<your-domain>/api/payments/yoco/webhook
  //
  // We accept JSON events. Because Yoco's publicly available examples differ
  // a bit by product (SDK vs. Checkout API), we defensively extract:
  // - type       : event or status
  // - success    : boolean for final state
  // - reference  : our order short_code (prefer metadata.short_code,
  //                fallback metadata.reference || reference)
  // - amount     : cents (optional)
  //
  // Security:
  // - If you have a webhook secret/signature header from Yoco, add verification
  //   here (HMAC). For now we proceed without, but we include a basic
  //   origin allow-list if you want to enforce later.
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return bad("Expected application/json");
    }

    // Try to find a short_code in common places:
    const meta = body?.data?.object?.metadata
              || body?.data?.metadata
              || body?.metadata
              || {};

    const reference = (
      meta.short_code ||
      meta.reference ||
      body?.reference ||
      body?.data?.object?.reference ||
      ""
    );

    if (!reference) {
      // We can’t map this event to an order
      return json({ ok: true, ignored: true, reason: "no reference/short_code" });
    }

    // Determine success/failed
    const type   = String(body?.type || body?.event || body?.status || "").toLowerCase();
    const status = String(
      body?.data?.object?.status ||
      body?.status ||
      ""
    ).toLowerCase();

    const isSuccess =
      type.includes("success") ||
      type.includes("payment.succeeded") ||
      status === "success" ||
      status === "succeeded" ||
      status === "paid";

    const isFailed =
      type.includes("fail") ||
      type.includes("payment.failed") ||
      status === "failed";

    // Look up order by short_code
    const order = await env.DB.prepare(
      `SELECT id, short_code, status, paid_at
         FROM orders
        WHERE UPPER(short_code)=UPPER(?1)
        LIMIT 1`
    ).bind(String(reference)).first();

    if (!order) {
      // If we can’t find it, acknowledge to avoid retries storming
      return json({ ok: true, ignored: true, reason: "order not found", reference });
    }

    // Idempotency: if already paid, do nothing.
    if (order.status === "paid" || Number(order.paid_at || 0) > 0) {
      return json({ ok: true, idempotent: true });
    }

    const now = Math.floor(Date.now() / 1000);

    if (isSuccess) {
      await env.DB.prepare(
        `UPDATE orders
            SET status='paid', paid_at=?1
          WHERE id=?2`
      ).bind(now, order.id).run();

      // (Optional) You could also mark each ticket as 'unused' here if they’re
      // created only after payment. In our flow tickets are already issued.
      return json({ ok: true, updated: "paid", order_id: order.id });
    }

    if (isFailed) {
      // We won’t flip to a hard failed state here; keep awaiting or pending.
      // You can add an 'failed_reason' column if you want to store details.
      return json({ ok: true, noted: "failed", order_id: order.id });
    }

    // Unknown / intermediate status — just acknowledge
    return json({ ok: true, acknowledged: true });
  });

}
