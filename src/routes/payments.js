// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

// Tiny helpers for site_settings KV (D1 table)
async function getSetting(env, key) {
  const row = await env.DB
    .prepare(`SELECT value FROM site_settings WHERE key = ?1 LIMIT 1`)
    .bind(key)
    .first();
  return row ? row.value : null;
}

async function getYocoConfig(env) {
  const mode = (await getSetting(env, "YOCO_MODE")) === "live" ? "live" : "sandbox";

  const public_key = mode === "live"
    ? await getSetting(env, "YOCO_LIVE_PUBLIC_KEY")
    : await getSetting(env, "YOCO_TEST_PUBLIC_KEY");

  const secret_key = mode === "live"
    ? await getSetting(env, "YOCO_LIVE_SECRET_KEY")
    : await getSetting(env, "YOCO_TEST_SECRET_KEY");

  return { mode, public_key: public_key || "", secret_key: secret_key || "" };
}

export function mountPayments(router) {

  /* ------------------------------------------------------------------ *
   * 1) Bootstrap intent for frontend (no external call, safe to cache)
   * ------------------------------------------------------------------ */
  router.add("POST", "/api/payments/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const code = String(b?.code || "").trim();
    const oid  = Number(b?.order_id || 0);

    // Load order by code or id
    let order = null;
    if (code) {
      order = await env.DB.prepare(
        `SELECT id, short_code, total_cents, status, payment_method, COALESCE(currency, 'ZAR') AS currency
           FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
      ).bind(code).first();
    } else if (oid) {
      order = await env.DB.prepare(
        `SELECT id, short_code, total_cents, status, payment_method, COALESCE(currency, 'ZAR') AS currency
           FROM orders WHERE id=?1 LIMIT 1`
      ).bind(oid).first();
    } else {
      return bad("order code or order_id required");
    }
    if (!order) return bad("Order not found", 404);

    const { mode, public_key } = await getYocoConfig(env);

    return json({
      ok: true,
      provider: "yoco",
      mode,
      public_key,
      order: {
        id: order.id,
        short_code: order.short_code,
        amount_cents: Number(order.total_cents || 0),
        currency: String(order.currency || "ZAR").toUpperCase()
      }
    });
  });

  /* ------------------------------------------------------------------ *
   * 2) Create a Yoco Checkout (server → Yoco) and return redirect info
   *    POST /api/payments/yoco/create-checkout
   *    Body: { code?: string, order_id?: number }
   * ------------------------------------------------------------------ */
  router.add("POST", "/api/payments/yoco/create-checkout", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const code = String(b?.code || "").trim();
    const oid  = Number(b?.order_id || 0);

    // Fetch order
    let order = null;
    if (code) {
      order = await env.DB.prepare(
        `SELECT id, short_code, total_cents, COALESCE(currency,'ZAR') AS currency
           FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
      ).bind(code).first();
    } else if (oid) {
      order = await env.DB.prepare(
        `SELECT id, short_code, total_cents, COALESCE(currency,'ZAR') AS currency
           FROM orders WHERE id=?1 LIMIT 1`
      ).bind(oid).first();
    } else {
      return bad("order code or order_id required");
    }
    if (!order) return bad("Order not found", 404);

    const { secret_key } = await getYocoConfig(env);
    if (!secret_key) return bad("Yoco secret key not configured", 500);

    const amount = Number(order.total_cents || 0);
    const currency = String(order.currency || "ZAR").toUpperCase();

    // Minimal body per the API reference (you tested with curl)
    const body = {
      amount,
      currency,
      // Make it easy to reconcile in the webhook:
      metadata: {
        short_code: order.short_code
      },
      // Optional (uncomment when you’ve decided your UX flow):
      // success_url: `${await publicBase(env)}/thanks/${order.short_code}`,
      // cancel_url:  `${await publicBase(env)}/shop/current`, // or your event URL
      // description: `Order ${order.short_code}`
    };

    let yocoRes, yocoJson;
    try {
      yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${secret_key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
      yocoJson = await yocoRes.json().catch(() => ({}));
    } catch (e) {
      return bad("Failed to reach Yoco: " + (e?.message || e), 502);
    }

    if (!yocoRes.ok) {
      // Return the upstream error cleanly for debugging
      return json({ ok: false, error: "yoco_error", detail: yocoJson }, { status: 502 });
    }

    // Try to normalize the redirect / hosted page URL the UI should open:
    const checkout_url =
      yocoJson.checkout_url ||
      yocoJson.redirect_url ||
      yocoJson.hosted_url ||
      yocoJson.url ||
      null;

    return json({
      ok: true,
      provider: "yoco",
      order: { id: order.id, short_code: order.short_code, amount_cents: amount, currency },
      checkout: yocoJson,
      checkout_url // convenience alias for the frontend to redirect to
    });
  });

  /* ------------------------------------------------------------------ *
   * 3) Webhook: mark order paid when Yoco notifies success
   *    POST /api/payments/yoco/webhook
   * ------------------------------------------------------------------ */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Expected JSON"); }

    // Common places to find our reference:
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
      return json({ ok: true, ignored: true, reason: "no reference/short_code" });
    }

    // Determine outcome
    const type   = String(body?.type || body?.event || body?.status || "").toLowerCase();
    const status = String(body?.data?.object?.status || body?.status || "").toLowerCase();
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

    // Find order
    const order = await env.DB.prepare(
      `SELECT id, short_code, status, paid_at
         FROM orders
        WHERE UPPER(short_code)=UPPER(?1)
        LIMIT 1`
    ).bind(String(reference)).first();

    if (!order) {
      return json({ ok: true, ignored: true, reason: "order not found", reference });
    }

    // Idempotency
    if (order.status === "paid" || Number(order.paid_at || 0) > 0) {
      return json({ ok: true, idempotent: true });
    }

    const now = Math.floor(Date.now() / 1000);

    if (isSuccess) {
      await env.DB.prepare(
        `UPDATE orders SET status='paid', paid_at=?1 WHERE id=?2`
      ).bind(now, order.id).run();
      return json({ ok: true, updated: "paid", order_id: order.id });
    }

    if (isFailed) {
      // No hard failure flip by default; acknowledge
      return json({ ok: true, noted: "failed", order_id: order.id });
    }

    return json({ ok: true, acknowledged: true });
  });

}

/* ----------------- optional helper if you uncomment success_url ---------- */
// async function publicBase(env) {
//   const row = await env.DB
//     .prepare(`SELECT value FROM site_settings WHERE key='PUBLIC_BASE_URL' LIMIT 1`)
//     .bind()
//     .first();
//   return (row?.value || "").trim();
// }
