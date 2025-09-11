// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

/**
 * YOCO Checkout integration (hosted checkout flow)
 *
 * Requirements:
 * - Table: site_settings (key TEXT PRIMARY KEY, value TEXT JSON)
 *   The 'site' blob should contain:
 *   {
 *     "yoco": {
 *       "mode": "sandbox" | "live",
 *       "secret_key": "...",   // server key
 *       "public_key": "...",   // publishable key (optional but handy for UI)
 *       "redirect_success_base": "https://tickets.villiersdorpskou.co.za/thanks", // required
 *       "redirect_cancel_url": "https://tickets.villiersdorpskou.co.za/"          // optional
 *     }
 *   }
 *
 * Notes:
 * - This file exposes:
 *   GET  /api/payments/yoco/config       -> returns current Yoco config (safe bits)
 *   POST /api/payments/create-intent     -> creates a Yoco checkout session and returns redirect_url
 *   POST /api/payments/yoco/webhook      -> (optional) webhook receiver to mark orders paid
 *   GET  /api/payments/yoco/callback     -> (optional) OAuth / manual callback placeholder
 *
 * - The actual HTTP call to Yoco’s Checkout API is made server-side with the SECRET key.
 *   If you haven’t got your keys yet, the endpoint returns a clear 400 with what’s missing.
 */

export function mountPayments(router) {
  /* ---------------- Helpers ---------------- */

  async function loadSiteSettings(env) {
    const row = await env.DB
      .prepare(`SELECT value FROM site_settings WHERE key = 'site' LIMIT 1`)
      .first();
    if (!row?.value) return {};
    try { return JSON.parse(row.value); } catch { return {}; }
  }

  function cents(n) {
    const v = Number(n || 0);
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  }

  /* ---------------- Public (safe) config for UI ---------------- */
  router.add("GET", "/api/payments/yoco/config", async (_req, env) => {
    const site = await loadSiteSettings(env);
    const y = site?.yoco || {};
    return json({
      ok: true,
      yoco: {
        mode: (y.mode === "live" ? "live" : "sandbox"),
        public_key: y.public_key || null
      }
    });
  });

  /* ---------------- Create a Yoco Checkout session -------------- */
  // Body: { order_id, amount_cents, currency, code, success_code }
  // Typical usage from checkout:
  //  - Create your order first (status = 'awaiting_payment', method='online_yoco')
  //  - Then call this to get { redirect_url } and send the user to Yoco-hosted checkout.
  router.add("POST", "/api/payments/create-intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const order_id    = Number(b?.order_id || 0);        // optional if you only pass code
    const amount_cents = cents(b?.amount_cents);
    const currency    = (b?.currency || "ZAR").toUpperCase();
    const code        = String(b?.code || "").trim();    // your short_code like "C123ABC"
    const successCode = code || String(b?.success_code || "").trim();

    if (!amount_cents) return bad("amount_cents required");
    if (!successCode)  return bad("order code required (code or success_code)");

    // Load config
    const site = await loadSiteSettings(env);
    const y = site?.yoco || {};
    const mode = (y.mode === "live" ? "live" : "sandbox");
    const secret = String(y.secret_key || "").trim();
    const successBase = String(y.redirect_success_base || "").trim();
    const cancelUrl   = String(y.redirect_cancel_url || "").trim() ||
                        "https://tickets.villiersdorpskou.co.za/";

    if (!secret)      return bad("Yoco secret_key missing in site settings");
    if (!successBase) return bad("Yoco redirect_success_base missing in site settings");

    // Compose redirect URLs. We append the order short code so the thanks page can render it.
    const successUrl = successBase.replace(/\/+$/,"") + "/" + encodeURIComponent(successCode);

    // --- Call Yoco Checkout API (Hosted Checkout) ------------------------
    // NOTE: Replace the URL + payload with the exact Yoco endpoint/shape you use.
    // Many gateways accept a payload similar to this:
    const yocoEndpoint = mode === "live"
      ? "https://payments.yoco.com/api/checkouts"
      : "https://payments-sandbox.yoco.com/api/checkouts";

    const payload = {
      amount: amount_cents,     // cents
      currency,                 // "ZAR"
      successUrl,               // where Yoco redirects the customer if payment is successful
      cancelUrl,                // where Yoco redirects if cancelled/failed
      reference: successCode    // tie the Yoco session back to your order
    };

    let yocoRes;
    try {
      yocoRes = await fetch(yocoEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      return bad("Network error calling Yoco: " + (e?.message || e), 502);
    }

    if (!yocoRes.ok) {
      const text = await yocoRes.text().catch(()=>"(no body)");
      return bad(`Yoco error ${yocoRes.status}: ${text}`, 502);
    }

    let out; try { out = await yocoRes.json(); } catch { out = {}; }

    // Expecting something like { redirectUrl: "https://checkout..." } from Yoco:
    const redirect_url = out.redirectUrl || out.redirect_url || out.url || null;
    if (!redirect_url) {
      return bad("Yoco response missing redirect_url", 502);
    }

    return json({
      ok: true,
      redirect_url,
      mode,
      ref: successCode
    });
  });

  /* ---------------- Webhook (optional) ----------------
     Configure on your Yoco dashboard (or via API).
     Update the order to 'paid' when we receive a successful event. */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let evt; try { evt = await req.json(); } catch { evt = null; }
    if (!evt) return bad("Bad JSON");

    // Verify webhook signature here if Yoco provides one (recommended).
    // Parse event type / status and extract the reference to your order code.
    const ref = evt?.data?.reference || evt?.reference || null;
    const status = evt?.data?.status || evt?.status || null;

    if (ref && status === "paid") {
      const now = Math.floor(Date.now()/1000);
      // Mark order as paid
      await env.DB.prepare(
        `UPDATE orders
            SET status='paid', paid_at=?1
          WHERE UPPER(short_code)=UPPER(?2)`
      ).bind(now, ref).run();
      return json({ ok: true });
    }

    // Ignore other statuses
    return json({ ok: true, ignored: true });
  });

  /* ---------------- OAuth / Redirect callback (optional) ---------------
     If you later add Yoco OAuth (for account linking), you can handle the
     returned code/state here and store tokens under site_settings.yoco.* */
  router.add("GET", "/api/payments/yoco/callback", async (req, env) => {
    const u = new URL(req.url);
    const code = u.searchParams.get("code") || "";
    const state = u.searchParams.get("state") || "";

    // You could exchange `code` for access_token here (if applicable) and
    // then store it in site_settings.yoco.{ access_token, refresh_token }
    // For now just echo the params so you can see it works:
    return json({ ok: true, received: { code, state } });
  });
}