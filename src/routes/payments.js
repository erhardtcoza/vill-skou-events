// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  /* --------------------------- helpers --------------------------- */

  // Read a single key from site_settings
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  // Decide mode + pick proper secret
  async function getYocoSecret(env) {
    const mode = ((await getSetting(env, "YOCO_MODE")) || "sandbox").toLowerCase();
    const testSecret = await getSetting(env, "YOCO_TEST_SECRET_KEY");
    const liveSecret = await getSetting(env, "YOCO_LIVE_SECRET_KEY");
    const secret = mode === "live" ? (liveSecret || "") : (testSecret || "");
    return { mode, secret };
  }

  // Quick logger (stringifies safely)
  function log(env, msg, obj) {
    try {
      const s = obj ? `${msg} ${JSON.stringify(obj)}` : msg;
      console.log(s);
    } catch {
      console.log(msg);
    }
  }

  /* ---------------------- diagnostics --------------------------- */

  // GET /api/payments/yoco/diag
  // Helps verify config without creating a checkout.
  router.add("GET", "/api/payments/yoco/diag", async (_req, env) => {
    const { mode, secret } = await getYocoSecret(env);
    const publicBase = await getSetting(env, "PUBLIC_BASE_URL");
    return json({
      ok: true,
      mode,
      hasSecret: !!secret,
      publicBaseUrl: publicBase || null,
      redirectExample: publicBase ? `${publicBase}/thanks/EXAMPLE` : null,
      cancelExample: publicBase ? `${publicBase}/shop/{event-slug}` : null
    });
  });

  /* -------------------- create checkout intent ------------------ */

  // POST /api/payments/yoco/intent  { code: "C123ABC" }
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(body?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // Order lookup
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

    // cancel_url back to event shop if we know the slug
    let cancel_url = PUBLIC_BASE_URL + "/";
    try {
      const ev = await env.DB.prepare(
        `SELECT slug FROM events WHERE id=?1 LIMIT 1`
      ).bind(o.event_id).first();
      if (ev?.slug) cancel_url = PUBLIC_BASE_URL + "/shop/" + encodeURIComponent(ev.slug);
    } catch {}

    // Where Yoco should send the buyer after payment
    const redirect_url = PUBLIC_BASE_URL + "/thanks/" + encodeURIComponent(code);

    // Create Yoco checkout
    const payload = {
      amount: Number(o.total_cents || 0),
      currency: "ZAR",
      reference: String(o.short_code),
      description: "Villiersdorp Skou tickets",
      redirect_url,
      cancel_url
    };

    log(env, "[YOCO INTENT] creating checkout", { code, mode, payload: { ...payload, // redact
      redirect_url: payload.redirect_url, cancel_url: payload.cancel_url } });

    let res, y;
    try {
      res = await fetch("https://payments.yoco.com/api/checkouts", {
        method: "POST",
        headers: {
          "authorization": "Bearer " + secret,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      y = await res.json().catch(() => ({}));
    } catch (e) {
      return bad("Network to Yoco failed: " + (e?.message || e), 502);
    }

    if (!res.ok) {
      const msg = y?.message || y?.error || (`Yoco error ${res.status}`);
      // Non-blocking: keep a tiny note on the order
      try {
        await env.DB.prepare(
          `UPDATE orders SET payment_note=?2 WHERE id=?1`
        ).bind(o.id, `yoco_fail:${mode}:${String(msg).slice(0,120)}`).run();
      } catch {}
      return bad(`Yoco rejected request: ${msg}`, res.status);
    }

    // Yoco returns `redirectUrl`; keep a defensive fallback to our `redirect_url`
    const redirectFromYoco = y?.redirectUrl || y?.redirect_url || redirect_url;

    // Update order to awaiting_payment + stash external checkout id
    try {
      await env.DB.prepare(
        `UPDATE orders
            SET status = CASE WHEN status='awaiting_payment' THEN status ELSE 'awaiting_payment' END,
                payment_method = 'online_yoco',
                payment_ext_id = COALESCE(?2, payment_ext_id),
                updated_at = strftime('%s','now')
          WHERE id = ?1`
      ).bind(o.id, (y?.id || null)).run();
    } catch {}

    log(env, "[YOCO INTENT] created", { code, checkout_id: y?.id, redirect: redirectFromYoco });

    return json({ ok: true, redirect_url: redirectFromYoco, yoco: y || null });
  });

  /* ------------------------ webhook ----------------------------- */

  // POST /api/payments/yoco/webhook
  // We see two common shapes:
  //  1) type: 'payment.succeeded' (or failed) with minimal fields (sometimes no reference)
  //  2) Svix payloads under data.object.{ status, reference, metadata.checkoutId }
  //
  // We try to update by short_code (reference) first; if missing, we fall back to
  // matching our stored orders.payment_ext_id against metadata.checkoutId.
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let evt; try { evt = await req.json(); } catch { return bad("Bad JSON"); }

    // Try multiple shapes defensively
    const obj = evt?.data?.object || evt?.object || {};
    const type = String(evt?.type || obj?.type || "").toLowerCase();
    const rawStatus = String(obj?.status || evt?.status || "").toLowerCase();

    // Most reliable reference sequence:
    // - reference (short_code)
    // - data.object.reference
    const reference =
      (evt?.reference || "") ||
      (obj?.reference || "") ||
      "";

    // Fallback for matching when reference is missing:
    const checkoutId =
      (obj?.metadata && (obj.metadata.checkoutId || obj.metadata.checkout_id)) ||
      null;

    const extId = obj?.id || evt?.id || null;

    // Normalize status into paid/failed
    const paidLike =
      rawStatus === "paid" ||
      rawStatus === "succeeded" ||
      type.includes("checkout.completed") ||
      type.includes("payment.succeeded");

    const failedLike =
      rawStatus === "failed" ||
      type.includes("payment.failed");

    log(env, "[YOCO WEBHOOK]", {
      type, status: rawStatus, reference, checkoutId, extId
    });

    try {
      if (reference && (paidLike || failedLike)) {
        // Update by short code
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
      } else if (checkoutId && (paidLike || failedLike)) {
        // Fallback: update by stored checkout id
        if (paidLike) {
          await env.DB.prepare(
            `UPDATE orders
                SET status='paid',
                    paid_at=strftime('%s','now'),
                    payment_method='online_yoco',
                    updated_at=strftime('%s','now')
              WHERE payment_ext_id = ?1`
          ).bind(checkoutId).run();
        } else {
          await env.DB.prepare(
            `UPDATE orders
                SET status='payment_failed',
                    payment_method='online_yoco',
                    updated_at=strftime('%s','now')
              WHERE payment_ext_id = ?1`
          ).bind(checkoutId).run();
        }
      }
    } catch {
      // swallow — webhook must be idempotent & resilient
    }

    return json({ ok: true });
  });
}
