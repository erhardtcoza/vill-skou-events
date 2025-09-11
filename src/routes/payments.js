// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  // ---- helpers ------------------------------------------------------------

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

  // ---- Diagnostics --------------------------------------------------------

  router.add("GET", "/api/payments/yoco/diag", async (_req, env) => {
    const { mode, secret } = await getYocoSecret(env);
    const base = await getSetting(env, "PUBLIC_BASE_URL");
    return json({
      ok: true,
      mode,
      hasSecret: !!secret,
      publicBaseUrl: base || null,
      redirectExample: (base ? base + "/thanks/EXAMPLE" : null),
      cancelExample:   (base ? base + "/shop/{event-slug}" : null),
    });
  });

  // ---- Create hosted checkout intent -------------------------------------

  // Body: { code: "CABC123" }
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(body?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, total_cents, status
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);
    if (!Number(o.total_cents || 0)) return bad("Order total is zero");

    const PUBLIC_BASE_URL = await getSetting(env, "PUBLIC_BASE_URL");
    if (!PUBLIC_BASE_URL || !/^https:\/\//i.test(PUBLIC_BASE_URL)) {
      return bad("PUBLIC_BASE_URL missing or not https");
    }

    const { mode, secret } = await getYocoSecret(env);
    if (!secret) return bad(`Missing Yoco secret key for mode=${mode}`);

    // cancel -> shop slug if available
    let cancelUrl = PUBLIC_BASE_URL + "/";
    try {
      const ev = await env.DB.prepare(
        `SELECT slug FROM events WHERE id=?1 LIMIT 1`
      ).bind(o.event_id).first();
      if (ev?.slug) cancelUrl = PUBLIC_BASE_URL + "/shop/" + encodeURIComponent(ev.slug);
    } catch {}

    // IMPORTANT: Yoco expects successUrl/cancelUrl (NOT redirect_url)
    const successUrl = PUBLIC_BASE_URL + "/thanks/" + encodeURIComponent(code);
    const payload = {
      amount: Number(o.total_cents || 0),
      currency: "ZAR",
      reference: String(o.short_code),
      description: "Villiersdorp Skou tickets",
      successUrl,                 // ✅ correct field
      cancelUrl                   // ✅ correct field
      // failureUrl: successUrl    // (optional) could also route to thanks
    };

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
      // Non-blocking: store note for later diagnostics
      try {
        await env.DB.prepare(
          `UPDATE orders SET payment_note=?2 WHERE id=?1`
        ).bind(o.id, `yoco_fail:${mode}:${String(msg).slice(0,180)}`).run();
      } catch {}
      return bad(`Yoco rejected request: ${msg}`, res.status);
    }

    const hostedUrl = y?.redirectUrl || y?.redirect_url; // prefer Yoco's hosted checkout
    if (!hostedUrl) {
      // Defensive: if Yoco didn't return a hosted URL, fall back to our thanks page
      return json({ ok: true, redirect_url: successUrl, yoco: y || null });
    }

    // Mark order as awaiting payment and stash external id
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

    return json({ ok: true, redirect_url: hostedUrl, yoco: y || null });
  });

  // ---- Webhook: logs + status updates ------------------------------------

  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    // Yoco docs send slightly different shapes for different resources.
    // We'll be defensive and fish out the essentials.
    let evt; try { evt = await req.json(); } catch { return bad("Bad JSON"); }

    const obj       = evt?.data?.object || evt?.object || {};
    const reference = obj?.reference || evt?.reference || "";
    const extId     = obj?.id || evt?.id || null;
    const rawStatus = String(obj?.status || evt?.status || "").toLowerCase();
    const type      = String(evt?.type || "").toLowerCase();

    // Log minimal diagnostics (visible in Worker logs)
    try {
      console.log("[YOCO WEBHOOK]", JSON.stringify({
        type, reference, status: rawStatus, extId
      }));
    } catch {}

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
        } else if (failedLike) {
          await env.DB.prepare(
            `UPDATE orders
                SET status='payment_failed',
                    payment_method='online_yoco',
                    payment_ext_id=COALESCE(?2,payment_ext_id),
                    updated_at=strftime('%s','now')
              WHERE UPPER(short_code)=UPPER(?1)`
          ).bind(reference, extId).run();
        }
      } catch (e) {
        // keep webhook idempotent & resilient
        console.log("[YOCO WEBHOOK UPDATE ERR]", e?.message || String(e));
      }
    }

    return json({ ok: true });
  });
}
