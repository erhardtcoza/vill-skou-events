// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  const log = (...a) => { try { console.log(...a); } catch {} };

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

  // --- Create checkout intent ---------------------------------------------
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(body?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, total_cents, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);
    if (!Number(o.total_cents || 0)) return bad("Order total is zero");

    const PUBLIC_BASE_URL = await getSetting(env, "PUBLIC_BASE_URL");
    if (!PUBLIC_BASE_URL || !/^https:\/\//i.test(PUBLIC_BASE_URL)) {
      return bad("PUBLIC_BASE_URL missing or not https");
    }

    const { mode, secret } = await getYocoSecret(env);
    if (!secret) return bad(`Missing Yoco secret key for mode=${mode}`);

    // Cancel back to event shop (if we know the slug)
    let cancel_url = PUBLIC_BASE_URL + "/";
    try {
      const ev = await env.DB.prepare(
        `SELECT slug FROM events WHERE id=?1 LIMIT 1`
      ).bind(o.event_id).first();
      if (ev?.slug) cancel_url = PUBLIC_BASE_URL + "/shop/" + encodeURIComponent(ev.slug);
    } catch {}

    const redirect_url = PUBLIC_BASE_URL + "/thanks/" + encodeURIComponent(code);

    const payload = {
      amount: Number(o.total_cents || 0),
      currency: "ZAR",
      reference: String(o.short_code),         // some webhooks send this, some don’t
      description: "Villiersdorp Skou tickets",
      redirect_url,
      cancel_url,
      // Belt-and-braces so the webhook can recover the order even if reference is blank:
      metadata: { reference: String(o.short_code), order_id: String(o.id) }
    };

    log("[YOCO INTENT] creating checkout", JSON.stringify({ code, mode, payload }));
    let res, y;
    try {
      res = await fetch("https://payments.yoco.com/api/checkouts", {
        method: "POST",
        headers: { "authorization": "Bearer " + secret, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      y = await res.json().catch(() => ({}));
    } catch (e) {
      return bad("Network to Yoco failed: " + (e?.message || e), 502);
    }

    if (!res.ok) {
      const msg = y?.message || y?.error || (`Yoco error ${res.status}`);
      try {
        await env.DB.prepare(`UPDATE orders SET payment_note=?2 WHERE id=?1`)
          .bind(o.id, `yoco_fail:${mode}:${String(msg).slice(0,160)}`).run();
      } catch {}
      return bad(`Yoco rejected request: ${msg}`, res.status);
    }

    // Yoco returns both id and redirectUrl
    const checkoutId = y?.id || y?.metadata?.checkoutId || null;
    const yocoRedirect = y?.redirectUrl || y?.redirect_url || null;

    log("[YOCO INTENT] created", JSON.stringify({ code, checkout_id: checkoutId, redirect: yocoRedirect }));

    // Stash checkoutId; ensure awaiting_payment
    try {
      await env.DB.prepare(
        `UPDATE orders
            SET status = CASE WHEN status='awaiting_payment' THEN status ELSE 'awaiting_payment' END,
                payment_method = 'online_yoco',
                payment_ext_id = COALESCE(?2, payment_ext_id),
                updated_at = strftime('%s','now')
          WHERE id = ?1`
      ).bind(o.id, checkoutId).run();
    } catch {}

    return json({
      ok: true,
      // we’ll also include canonical key the UI already reads:
      redirect_url: yocoRedirect || redirect_url,
      yoco: y || null
    });
  });

  // --- Webhook -------------------------------------------------------------
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let evt; try { evt = await req.json(); } catch { return bad("Bad JSON"); }

    const obj = evt?.data?.object || evt?.object || {};
    const type = String(evt?.type || "").toLowerCase();
    const rawStatus = String(obj?.status || evt?.status || "").toLowerCase();

    // Try every place Yoco might put identifiers:
    const reference =
      obj?.reference ||
      obj?.metadata?.reference ||
      evt?.reference ||
      "";

    const checkoutId = obj?.checkoutId || obj?.metadata?.checkoutId || obj?.id || null;
    const paymentId  = obj?.paymentId  || obj?.metadata?.paymentId  || null;

    const idForLookup = checkoutId || paymentId || null;

    const paidLike   = rawStatus === "paid" || rawStatus === "succeeded" ||
                       type.includes("checkout.completed") || type.includes("payment.succeeded");
    const failedLike = rawStatus === "failed" || type.includes("payment.failed");

    const safe = (v)=> v==null ? "" : String(v);
    try { console.log("[YOCO WEBHOOK]", JSON.stringify({ type, reference: safe(reference), status: safe(rawStatus), extId: safe(idForLookup) })); } catch {}

    // Build WHERE and params depending on what we have
    let where = "", bindA = [], bindB = [];
    if (reference) {
      where = "UPPER(short_code)=UPPER(?1)";
      bindA = [reference];
      bindB = [reference];
    } else if (idForLookup) {
      where = "payment_ext_id=?1";
      bindA = [idForLookup];
      bindB = [idForLookup];
    } else {
      return json({ ok: true, note: "no reference or external id in payload" });
    }

    try {
      if (paidLike) {
        await env.DB.prepare(
          `UPDATE orders
              SET status='paid',
                  paid_at=strftime('%s','now'),
                  payment_method='online_yoco',
                  updated_at=strftime('%s','now')
            WHERE ${where}`
        ).bind(...bindA).run();
      } else if (failedLike) {
        await env.DB.prepare(
          `UPDATE orders
              SET status='payment_failed',
                  payment_method='online_yoco',
                  updated_at=strftime('%s','now')
            WHERE ${where}`
        ).bind(...bindA).run();
      } else {
        // store last status string for debugging
        await env.DB.prepare(
          `UPDATE orders SET payment_note=?2 WHERE ${where}`
        ).bind(...bindB, `yoco_status:${safe(rawStatus)}`).run();
      }
    } catch { /* keep webhook idempotent */ }

    return json({ ok: true });
  });

  // --- tiny diag -----------------------------------------------------------
  router.add("GET", "/api/payments/yoco/diag", async (_req, env) => {
    const { mode, secret } = await getYocoSecret(env);
    const base = await getSetting(env, "PUBLIC_BASE_URL");
    return json({
      ok: true,
      mode, hasSecret: !!secret,
      publicBaseUrl: base || null,
      redirectExample: (base ? base + "/thanks/EXAMPLE" : null),
      cancelExample: (base ? base + "/shop/{event-slug}" : null)
    });
  });
}
