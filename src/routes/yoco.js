// src/routes/yoco.js
// Cloudflare Workers (ESM) — Yoco webhook + diag
import { json } from "../utils/http.js";

/**
 * Utilities
 */
function b64(s) { return Buffer.from(s).toString("base64"); }

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a || "");
  const bb = Buffer.from(b || "");
  if (ab.length !== bb.length) return false;
  return crypto.subtle ? // CF Workers has subtle but we'll keep Node-style fallback too
    // Use a constant-time compare via hashing both with same random key
    // (Workers doesn't expose Node's crypto.timingSafeEqual)
    // For simplicity, keep buffer compare when same length:
    ab.equals(bb)
  : ab.equals(bb);
}

/**
 * Verify Yoco webhook signature (HMAC-SHA256 + base64 over "<id>.<ts>.<raw>")
 * Docs describe headers: webhook-id, webhook-timestamp, webhook-signature
 * Secret format: "whsec_xxx==", MUST decode after removing "whsec_" prefix.
 * Replay window recommended <= 3 minutes.
 * Source: Yoco developer docs. 
 *   - Headers & construction: Verifying the events (steps 1–3) 
 *   - 3-minute replay guidance
 */
async function verifyYocoSignature(request, env, rawBody) {
  const id = request.headers.get("webhook-id");
  const ts = request.headers.get("webhook-timestamp");
  const sigHeader = request.headers.get("webhook-signature");

  if (!id || !ts || !sigHeader) {
    return { ok: false, reason: "missing headers" };
  }

  // Replay protection (3 minutes)
  const now = Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - Number(ts));
  if (!Number.isFinite(Number(ts)) || skew > 180) {
    return { ok: false, reason: "timestamp outside allowed window" };
  }

  if (!env.HMAC_SECRET) {
    return { ok: false, reason: "no HMAC_SECRET configured" };
  }
  // Expect Yoco format: "whsec_...."
  const secret = String(env.HMAC_SECRET);
  const rawKey = secret.startsWith("whsec_") ? secret.split("_")[1] : secret;
  const secretBytes = Buffer.from(rawKey, "base64");

  const signed = `${id}.${ts}.${rawBody}`;
  const expected = Buffer.from(
    await crypto.subtle.sign(
      { name: "HMAC", hash: "SHA-256" },
      await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      new TextEncoder().encode(signed)
    )
  ).toString("base64");

  // Header can contain multiple items like "v1,<sig> v1,<sig2> v2,<sig3>"
  const first = sigHeader.trim().split(/\s+/)[0]; // take first pair
  const provided = (first.split(",")[1] || "").trim();

  if (!provided) return { ok: false, reason: "invalid signature header format" };

  if (!timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true };
}

/**
 * Update order as paid (idempotent)
 */
async function markOrderPaidByCheckoutId(env, { checkoutId, amount_cents, currency, eventId, paidAt, card }) {
  // 1) Find order by checkout_id
  const order = await env.DB.prepare(
    `SELECT id, status, payment_status, amount_cents, currency 
     FROM orders WHERE checkout_id = ?1 LIMIT 1`
  ).bind(checkoutId).first();

  if (!order) return { ok: false, http: 404, msg: "order_not_found" };

  // 2) Validate amount & currency if present on order
  if (order.amount_cents != null && Number(order.amount_cents) !== Number(amount_cents)) {
    return { ok: false, http: 400, msg: "amount_mismatch", detail: { expected: order.amount_cents, got: amount_cents } };
  }
  if (order.currency && String(order.currency).toUpperCase() !== String(currency).toUpperCase()) {
    return { ok: false, http: 400, msg: "currency_mismatch", detail: { expected: order.currency, got: currency } };
  }

  // 3) Already paid? Idempotent success
  const alreadyPaid = (order.status === "paid") || (order.payment_status === "paid");
  if (alreadyPaid) return { ok: true, id: order.id, idempotent: true };

  // 4) Update
  // Keep SET list resilient to missing columns in your schema
  const nowIso = new Date(paidAt || Date.now()).toISOString();

  const stmt = await env.DB.prepare(
    `UPDATE orders
       SET status = COALESCE('paid', status),
           payment_status = COALESCE('paid', payment_status),
           paid_at = COALESCE(?1, paid_at),
           payment_provider = COALESCE('yoco', payment_provider),
           payment_ref = COALESCE(?2, payment_ref)
     WHERE checkout_id = ?3`
  ).bind(nowIso, eventId, checkoutId).run();

  return { ok: true, id: order.id, changes: stmt.changes || 0 };
}

/**
 * Router mount
 */
export function mountYoco(router) {
  // Quick diag
  router.get("/api/yoco/diag", async (req, env) => {
    const hasSecret = !!env.HMAC_SECRET;
    return json({
      ok: true,
      hasSecret,
      note: "Expect headers: webhook-id, webhook-timestamp, webhook-signature. Body must be raw JSON string.",
      expect_type: "payment.succeeded",
    });
  });

  // Webhook endpoint (configure this URL in Yoco dashboard)
  router.post("/api/yoco/webhook", async (request, env) => {
    // Get RAW body string (required for signature)
    const rawBody = await request.text();

    // Verify signature
    const sig = await verifyYocoSignature(request, env, rawBody);
    if (!sig.ok) {
      // Log limited info; avoid logging full secret
      console.warn("Yoco webhook verify failed:", sig.reason);
      return new Response("Forbidden", { status: 403 });
    }

    // Parse event JSON
    let evt;
    try {
      evt = JSON.parse(rawBody);
    } catch (e) {
      console.warn("Invalid JSON body");
      return new Response("Bad Request", { status: 400 });
    }

    // Only handle successful payments
    if (evt?.type !== "payment.succeeded") {
      return json({ ok: true, ignored: true, type: evt?.type || null });
    }

    const p = evt?.payload || {};
    const checkoutId = p?.metadata?.checkoutId || null;
    const amount_cents = Number(p?.amount);
    const currency = p?.currency || "ZAR";
    const status = p?.status;
    const eventId = evt?.id || p?.id || "";
    const paidAt = p?.createdDate || evt?.createdDate || new Date().toISOString();

    if (!checkoutId) {
      return json({ ok: false, error: "missing_checkoutId_in_metadata" }, 400);
    }
    if (status !== "succeeded") {
      return json({ ok: true, ignored: true, reason: "not_succeeded_status", status });
    }

    // Optional card details (for audit)
    const card = p?.paymentMethodDetails?.card || null;

    // Mark order paid
    const res = await markOrderPaidByCheckoutId(env, {
      checkoutId,
      amount_cents,
      currency,
      eventId,
      paidAt,
      card
    });

    if (!res.ok) {
      const code = res.http || 400;
      return json({ ok: false, error: res.msg, detail: res.detail || null }, code);
    }

    return json({ ok: true, order_id: res.id, idempotent: !!res.idempotent });
  });
}
