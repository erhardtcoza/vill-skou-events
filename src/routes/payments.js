// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {

  // Helper: read a key from site_settings
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key = ?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  // POST /api/payments/yoco/intent  { code: "C123ABC" }
  // Creates a Yoco hosted checkout and returns { ok, redirect_url }
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // Lookup order
    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, total_cents, status
         FROM orders
        WHERE UPPER(short_code) = ?1
        LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    // Resolve base URL + (optional) event slug for cancel_url
    const PUBLIC_BASE_URL = (await getSetting(env, "PUBLIC_BASE_URL")) || "";
    let cancelUrl = PUBLIC_BASE_URL || "";
    try {
      const ev = await env.DB.prepare(
        `SELECT slug FROM events WHERE id = ?1 LIMIT 1`
      ).bind(o.event_id).first();
      if (ev?.slug) cancelUrl = (PUBLIC_BASE_URL || "") + "/shop/" + encodeURIComponent(ev.slug);
    } catch {}

    // Determine keys/mode
    const mode = ((await getSetting(env, "YOCO_MODE")) || "sandbox").toLowerCase();
    const TEST_SECRET = await getSetting(env, "YOCO_TEST_SECRET_KEY");
    const LIVE_SECRET = await getSetting(env, "YOCO_LIVE_SECRET_KEY");
    const secret = mode === "live" ? (LIVE_SECRET || "") : (TEST_SECRET || "");
    if (!secret) return bad("Yoco secret key not configured for current mode");

    // Build redirect URL (required by Yoco)
    const redirect_url = (PUBLIC_BASE_URL || "") + "/thanks/" + encodeURIComponent(code);
    const cancel_url   = cancelUrl || (PUBLIC_BASE_URL || "/");

    // Create Yoco checkout
    const payload = {
      amount: Number(o.total_cents || 0),
      currency: "ZAR",
      reference: String(o.short_code),
      description: "Villiersdorp Skou tickets",
      redirect_url,                 // ✅ required
      cancel_url                    // optional but helpful
      // You can also add: "metadata": { order_id: o.id }
    };

    let yocoRes;
    try {
      const res = await fetch("https://payments.yoco.com/api/checkouts", {
        method: "POST",
        headers: {
          "authorization": "Bearer " + secret,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      yocoRes = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = yocoRes?.message || yocoRes?.error || ("Yoco error " + res.status);
        return bad(String(msg), res.status);
      }
    } catch (e) {
      return bad("Failed to contact Yoco: " + (e?.message || e), 502);
    }

    // Yoco should echo a redirect_url in the response;
    // fall back to our constructed one if missing (defensive)
    const outUrl = yocoRes?.redirect_url || redirect_url;

    // Optionally store last checkout id/url on the order (non-blocking)
    try {
      await env.DB.prepare(
        `UPDATE orders
            SET status = CASE WHEN status='awaiting_payment' THEN status ELSE 'awaiting_payment' END,
                payment_ext_id = COALESCE(?2, payment_ext_id),
                updated_at = strftime('%s','now')
          WHERE id = ?1`
      ).bind(o.id, (yocoRes?.id || null)).run();
    } catch { /* ignore */ }

    return json({ ok: true, redirect_url: outUrl, yoco: yocoRes || null });
  });


  // Webhook endpoint (already created earlier). Kept here for completeness.
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    // (If you’ve already implemented webhook logic, keep that; this is just a placeholder)
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    // Expect events like: { type, data: { object: { reference, status, amount } } }
    // Update order status to 'paid' when appropriate.
    try {
      const ref = body?.data?.object?.reference || body?.reference || "";
      const status = String(body?.data?.object?.status || body?.status || "").toLowerCase();

      if (ref && status === "paid") {
        await env.DB.prepare(
          `UPDATE orders
              SET status='paid', paid_at=strftime('%s','now')
            WHERE UPPER(short_code)=UPPER(?1)`
        ).bind(ref).run();
      }
    } catch {
      // swallow — webhook must be idempotent
    }

    return json({ ok: true });
  });

}
