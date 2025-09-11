// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

/**
 * Public payments endpoints (Yoco)
 *
 * ENV/Settings precedence:
 * - settings table (`settings` key/val) overrides env when present
 * - env fallback: YOCO_MODE, YOCO_SECRET_KEY, YOCO_PUBLIC_KEY
 *
 * Endpoints:
 * POST /api/payments/yoco/intent
 *   body: { order_id?: number, amount_cents?: number, currency?: "ZAR" }
 *   If order_id is provided, we fetch total from DB; else we use amount_cents.
 */
export function mountPayments(router) {
  // helper: read settings KV (settings table)
  async function getSetting(env, key) {
    const r = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = ?1 LIMIT 1"
    ).bind(key).first();
    return r?.value ?? null;
  }
  async function getConf(env) {
    // settings first
    const MODE = (await getSetting(env, "YOCO_MODE")) || env.YOCO_MODE || "sandbox"; // "live" | "sandbox"
    const SECRET = (await getSetting(env, "YOCO_SECRET_KEY")) || env.YOCO_SECRET_KEY || "";
    const PUB = (await getSetting(env, "YOCO_PUBLIC_KEY")) || env.YOCO_PUBLIC_KEY || "";
    const CLIENT_ID = (await getSetting(env, "YOCO_CLIENT_ID")) || env.YOCO_CLIENT_ID || "";
    const REDIRECT_URI = (await getSetting(env, "YOCO_REDIRECT_URI")) || env.YOCO_REDIRECT_URI || "";
    const SCOPES = (await getSetting(env, "YOCO_REQUIRED_SCOPES")) || env.YOCO_REQUIRED_SCOPES || "CHECKOUT_PAYMENTS";
    const STATE = (await getSetting(env, "YOCO_STATE")) || env.YOCO_STATE || "skou";
    return { MODE, SECRET, PUB, CLIENT_ID, REDIRECT_URI, SCOPES, STATE };
  }

  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const order_id = Number(b?.order_id || 0);
    const explicit_amount = Number(b?.amount_cents || 0);
    const currency = (b?.currency || "ZAR").toUpperCase();

    if (!order_id && !explicit_amount) return bad("order_id or amount_cents required");

    let amount_cents = explicit_amount;
    let reference = b?.reference || null;

    if (order_id) {
      const o = await env.DB.prepare(
        "SELECT id, total_cents, short_code FROM orders WHERE id = ?1 LIMIT 1"
      ).bind(order_id).first();
      if (!o) return bad("Order not found", 404);
      amount_cents = Number(o.total_cents || 0);
      reference = reference || String(o.short_code || `ORD-${o.id}`);
    }
    if (!amount_cents || amount_cents < 100) { // Yoco min R1.00
      return bad("amount_cents too low");
    }

    const conf = await getConf(env);
    const isLive = (conf.MODE || "sandbox") === "live";
    const secret = conf.SECRET || "";
    const yocoUrl = isLive
      ? "https://payments.yoco.com/api/checkouts"
      : "https://payments.yoco.com/api/checkouts"; // same host, account decides live/sandbox

    // If we have a secret, attempt a real checkout session; else return a fake/sandbox payload
    if (!secret) {
      // Fake intent for local/sandbox testing (front-end can proceed)
      const fakeId = "chk_" + Math.random().toString(36).slice(2, 10);
      return json({
        ok: true,
        sandbox: true,
        intent: {
          id: fakeId,
          amount_cents,
          currency,
          reference: reference || "WEB-CHECKOUT",
          checkout_url: null
        }
      });
    }

    // Build Yoco Checkout payload (hosted checkout)
    // See: https://developer.yoco.com/guides/online-payments/accepting-a-payment
    const payload = {
      amount: amount_cents,
      currency,                                  // "ZAR"
      success_url: (env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za") + "/thanks/" + encodeURIComponent(reference || "ORDER"),
      cancel_url: (env.PUBLIC_BASE_URL || "https://tickets.villiersdorpskou.co.za") + "/shop", // simple fallback
      metadata: { reference: reference || "" }
    };

    const r = await fetch(yocoUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      return bad(`Yoco error ${r.status}: ${t}`, 502);
    }
    const j = await r.json();

    // Expected: { id, status, amount, currency, hosted_url, ... }
    return json({
      ok: true,
      sandbox: false,
      intent: {
        id: j.id || null,
        amount_cents: j.amount || amount_cents,
        currency: j.currency || currency,
        reference,
        checkout_url: j.hosted_url || null,
        raw: j
      }
    });
  });
}
