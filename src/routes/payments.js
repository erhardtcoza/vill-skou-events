// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

/* ----------------------------- helpers ----------------------------- */

async function getSetting(env, key) {
  const row = await env.DB
    .prepare(`SELECT value FROM site_settings WHERE key = ?1 LIMIT 1`)
    .bind(key)
    .first();
  return row ? row.value : null;
}

async function getPublicBase(env) {
  // Prefer DB setting; fall back to env var if present
  return (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
}

async function getYocoMode(env) {
  return (await getSetting(env, "YOCO_MODE")) === "live" ? "live" : "sandbox";
}

async function getYocoKeys(env) {
  // Prefer split keys (TEST_/LIVE_). If you only filled generic keys, still read them.
  const mode = await getYocoMode(env);
  const testPub  = await getSetting(env, "YOCO_TEST_PUBLIC_KEY");
  const testSec  = await getSetting(env, "YOCO_TEST_SECRET_KEY");
  const livePub  = await getSetting(env, "YOCO_LIVE_PUBLIC_KEY");
  const liveSec  = await getSetting(env, "YOCO_LIVE_SECRET_KEY");
  const genericPub = await getSetting(env, "YOCO_PUBLIC_KEY");
  const genericSec = await getSetting(env, "YOCO_SECRET_KEY");

  const public_key = mode === "live" ? (livePub || genericPub || "") : (testPub || genericPub || "");
  const secret_key = mode === "live" ? (liveSec || genericSec || "") : (testSec || genericSec || "");

  return { mode, public_key, secret_key };
}

function timingSafeEq(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return res === 0;
}

/* ----------------------------- router ------------------------------ */

export function mountPayments(router) {
  /**
   * Create a Yoco Checkout session for an order.
   * Body: { code?: string, order_id?: number }
   * Returns: { ok, checkout_url }
   */
  router.add("POST", "/api/payments/yoco/create-checkout", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const codeIn = (b?.code || "").trim();
    const idIn   = Number(b?.order_id || 0);

    if (!codeIn && !idIn) return bad("code or order_id required");

    // Lookup order
    const ord = codeIn
      ? await env.DB.prepare(
          `SELECT o.id, o.short_code, o.total_cents, o.event_id, e.slug
             FROM orders o
        LEFT JOIN events e ON e.id = o.event_id
            WHERE UPPER(o.short_code)=UPPER(?1)
            LIMIT 1`
        ).bind(codeIn).first()
      : await env.DB.prepare(
          `SELECT o.id, o.short_code, o.total_cents, o.event_id, e.slug
             FROM orders o
        LEFT JOIN events e ON e.id = o.event_id
            WHERE o.id=?1
            LIMIT 1`
        ).bind(idIn).first();

    if (!ord) return bad("Order not found", 404);
    const amount = Number(ord.total_cents || 0);
    if (amount <= 0) return bad("Order amount invalid");

    const { secret_key } = await getYocoKeys(env);
    if (!secret_key) return bad("Yoco secret key not configured", 500);

    const base = await getPublicBase(env);
    const success_url = `${base}/thanks/${encodeURIComponent(ord.short_code)}`;
    // If you have a cancel route, adjust here:
    const cancel_url  = `${base}/shop/${encodeURIComponent(ord.slug || "")}/checkout`;

    // Create checkout on Yoco
    const yoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${secret_key}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency: "ZAR",
        success_url,
        cancel_url,
        // Use the order short_code for traceability
        reference: ord.short_code,
        metadata: { short_code: ord.short_code }
      })
    });

    if (!yoRes.ok) {
      const txt = await yoRes.text().catch(()=> "");
      return bad(`Yoco error: ${yoRes.status} ${txt || yoRes.statusText}`, 502);
    }

    const j = await yoRes.json().catch(()=>null);
    const checkout_url = j?.redirect_url || j?.checkout_url || j?.url || null;
    if (!checkout_url) return bad("Yoco response missing redirect_url", 502);

    return json({ ok: true, checkout_url });
  });

  /**
   * Webhook receiver: Yoco -> our worker
   * Optionally verifies signature if a webhook secret is stored.
   */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    // Read raw for HMAC verification, then parse
    const raw = await req.text();
    let body; try { body = JSON.parse(raw); } catch { return bad("Expected JSON"); }

    const mode = await getYocoMode(env);
    const secret = mode === "live"
      ? await getSetting(env, "YOCO_LIVE_WEBHOOK_SECRET")
      : await getSetting(env, "YOCO_TEST_WEBHOOK_SECRET");

    const sigHeader =
      req.headers.get("yoco-signature") ||
      req.headers.get("x-yoco-signature") ||
      req.headers.get("Yoco-Signature") ||
      "";

    if (secret && sigHeader) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
      const macB64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
      if (!timingSafeEq(macB64, sigHeader.trim())) {
        return bad("Invalid webhook signature", 401);
      }
    }

    // Pull a reference/short_code
    const meta = body?.data?.object?.metadata
              || body?.data?.metadata
              || body?.metadata
              || {};
    const reference =
      meta.short_code ||
      meta.reference ||
      body?.reference ||
      body?.data?.object?.reference ||
      "";

    if (!reference) {
      return json({ ok: true, ignored: true, reason: "no reference" });
    }

    // Outcome detection
    const type   = String(body?.type || body?.event || body?.status || "").toLowerCase();
    const status = String(body?.data?.object?.status || body?.status || "").toLowerCase();
    const isSuccess = type.includes("success") || type.includes("succeeded")
                   || ["success","succeeded","paid"].includes(status);
    const isFailed  = type.includes("fail") || ["failed"].includes(status);

    const order = await env.DB.prepare(
      `SELECT id, short_code, status, paid_at
         FROM orders
        WHERE UPPER(short_code)=UPPER(?1)
        LIMIT 1`
    ).bind(String(reference)).first();

    if (!order) return json({ ok: true, ignored: true, reason: "order not found", reference });

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
      // We could mark as failed/cancelled if you want:
      // await env.DB.prepare(`UPDATE orders SET status='failed' WHERE id=?1`).bind(order.id).run();
      return json({ ok: true, noted: "failed", order_id: order.id });
    }
    return json({ ok: true, acknowledged: true });
  });

  /**
   * (Optional) OAuth callback placeholder if you later use Yoco OAuth flows.
   * Currently we’re using Checkout API with keys. This endpoint simply echoes.
   */
  router.add("GET", "/api/payments/yoco/oauth/callback", async (req, _env) => {
    const u = new URL(req.url);
    const code  = u.searchParams.get("code")  || "";
    const state = u.searchParams.get("state") || "";
    return json({ ok: true, received: { code, state } });
  });
}
