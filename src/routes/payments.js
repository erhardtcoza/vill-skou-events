// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  // --- helpers -------------------------------------------------------------

  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  async function getYocoSecret(env) {
    const mode = ((await getSetting(env, "YOCO_MODE")) || "sandbox").toLowerCase();
    const testSecret = await getSetting(env, "YOCO_TEST_SECRET_KEY");
    const liveSecret = await getSetting(env, "YOCO_LIVE_SECRET_KEY");
    const secret = mode === "live" ? (liveSecret || "") : (testSecret || "");
    return { mode, secret };
  }

  function timeoutSignal(ms) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort("timeout"), ms);
    return { signal: c.signal, cancel: () => clearTimeout(t) };
  }

// POST /api/payments/yoco/intent  { code: "C123ABC" }
router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
  let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
  const code = String(body?.code || "").trim().toUpperCase();
  if (!code) return bad("code required");

  // Lookup order
  const o = await env.DB.prepare(
    `SELECT id, short_code, event_id, total_cents, status
       FROM orders
      WHERE UPPER(short_code)=?1
      LIMIT 1`
  ).bind(code).first();
  if (!o) return bad("Order not found", 404);
  if (!Number(o.total_cents || 0)) return bad("Order total is zero");

  // Required settings
  const PUBLIC_BASE_URL = await getSetting(env, "PUBLIC_BASE_URL");
  if (!PUBLIC_BASE_URL || !/^https:\/\//i.test(PUBLIC_BASE_URL)) {
    return bad("PUBLIC_BASE_URL missing or not https (required to build redirect_url)");
  }

  // Yoco mode + secret
  const { mode, secret } = await getYocoSecret(env);
  if (!secret) return bad(`Missing Yoco secret key for mode=${mode}`);

  // Build cancel/redirect URLs
  let cancel_url = PUBLIC_BASE_URL + "/";
  try {
    const ev = await env.DB.prepare(`SELECT slug FROM events WHERE id=?1 LIMIT 1`)
      .bind(o.event_id).first();
    if (ev?.slug) cancel_url = PUBLIC_BASE_URL + "/shop/" + encodeURIComponent(ev.slug);
  } catch {}
  const redirect_url = PUBLIC_BASE_URL + "/thanks/" + encodeURIComponent(code);

  // Request payload
  const payload = {
    amount: Number(o.total_cents || 0),
    currency: "ZAR",
    reference: String(o.short_code),
    description: "Villiersdorp Skou tickets",
    redirect_url,
    cancel_url
  };

  // Network hardening: timeout + explicit headers
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), 12000);

  let res, y;
  try {
    res = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "authorization": "Bearer " + secret,
        "content-type": "application/json",
        "accept": "application/json",
        // Helps some gateways behind WAFs; harmless otherwise:
        "user-agent": "skou-events/1.0 (+tickets.villiersdorpskou.co.za)"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    y = await res.json().catch(() => ({}));
  } catch (e) {
    clearTimeout(t);
    const note = `yoco_netfail:${mode}:${String(e?.message || e).slice(0,120)}`;
    try {
      await env.DB.prepare(`UPDATE orders SET payment_note=?2 WHERE id=?1`).bind(o.id, note).run();
    } catch {}
    // Return a diagnostic 502 so you can see detail in the browser/network tab
    return json({
      ok: false,
      error: "Network to Yoco failed",
      cause: String(e?.name || "Error"),
      detail: String(e?.message || e),
    }, 502);
  } finally {
    clearTimeout(t);
  }

  // If Yoco rejects, bubble up message & store a short note
  if (!res.ok) {
    const msg = y?.message || y?.error || (`Yoco error ${res.status}`);
    try {
      await env.DB.prepare(`UPDATE orders SET payment_note=?2 WHERE id=?1`)
        .bind(o.id, `yoco_http_${res.status}:${mode}:${String(msg).slice(0,120)}`).run();
    } catch {}
    return json({ ok: false, error: String(msg), status: res.status, body: y || null }, res.status);
  }

  const yCheckoutId = y?.id || null;
  const redirect = y?.redirect_url || redirect_url;

  // Mark order as awaiting_payment; keep external id
  try {
    await env.DB.prepare(
      `UPDATE orders
          SET status = CASE WHEN status='awaiting_payment' THEN status ELSE 'awaiting_payment' END,
              payment_method = 'online_yoco',
              payment_ext_id = COALESCE(?2, payment_ext_id),
              updated_at = strftime('%s','now')
        WHERE id = ?1`
    ).bind(o.id, yCheckoutId).run();
  } catch {}

  return json({ ok: true, redirect_url: redirect, yoco: y || null });
});
  
  // --- Webhook -------------------------------------------------------------

  // POST /api/payments/yoco/webhook
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let evt; try { evt = await req.json(); } catch { return bad("Bad JSON"); }

    const obj = evt?.data?.object || evt?.object || {};
    const reference = obj?.reference || evt?.reference || "";
    const extId = obj?.id || evt?.id || null;
    const rawStatus = String(obj?.status || evt?.status || "").toLowerCase();
    const type = String(evt?.type || "").toLowerCase();

    const paidLike =
      rawStatus === "paid" ||
      rawStatus === "succeeded" ||
      type.includes("checkout.completed") ||
      type.includes("payment.succeeded");

    const failedLike =
      rawStatus === "failed" ||
      type.includes("payment.failed");

    if (reference && (paidLike || failedLike)) {
      try {
        if (paidLike) {
          await env.DB.prepare(
            `UPDATE orders
               SET status='paid',
                   paid_at=strftime('%s','now'),
                   payment_method='online_yoco',
                   payment_ext_id=COALESCE(?2,payment_ext_id),
                   updated_at=strftime('%s','now')
             WHERE UPPER(short_code)=UPPER(?1)`
          ).bind(reference, extId).run();
        } else {
          await env.DB.prepare(
            `UPDATE orders
               SET status='payment_failed',
                   payment_method='online_yoco',
                   payment_ext_id=COALESCE(?2,payment_ext_id),
                   updated_at=strftime('%s','now')
             WHERE UPPER(short_code)=UPPER(?1)`
          ).bind(reference, extId).run();
        }
      } catch { /* idempotent */ }
    }

    return json({ ok: true });
  });

  // --- Diagnostics (no secrets exposed) -----------------------------------

  // GET /api/payments/yoco/diag
  // Returns a quick snapshot to verify configuration.
  router.add("GET", "/api/payments/yoco/diag", async (_req, env) => {
    const { mode, secret } = await getYocoSecret(env);
    const PUBLIC_BASE_URL = await getSetting(env, "PUBLIC_BASE_URL");
    const hasSecret = Boolean(secret);
    const publicBaseUrl = PUBLIC_BASE_URL || "";

    // Build example URLs if we have a base; code is a placeholder
    const code = "EXAMPLE";
    const redirectExample = publicBaseUrl ? `${publicBaseUrl}/thanks/${code}` : "";
    const cancelExample   = publicBaseUrl ? `${publicBaseUrl}/shop/{event-slug}` : "";

    return json({
      ok: true,
      mode,
      hasSecret,
      publicBaseUrl,
      redirectExample,
      cancelExample
    });
  });
}
