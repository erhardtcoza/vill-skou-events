// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  // ----------------- helpers -----------------

  // Read a single key from site_settings
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  // Yoco mode + secret selection
  async function getYocoSecret(env) {
    const mode = ((await getSetting(env, "YOCO_MODE")) || "sandbox").toLowerCase();
    const testSecret = await getSetting(env, "YOCO_TEST_SECRET_KEY");
    const liveSecret = await getSetting(env, "YOCO_LIVE_SECRET_KEY");
    const secret = mode === "live" ? (liveSecret || "") : (testSecret || "");
    return { mode, secret };
  }

  // ----------------- create checkout intent -----------------

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
      reference: String(o.short_code),               // our order code
      description: "Villiersdorp Skou tickets",
      redirect_url,
      cancel_url
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
      // Non-blocking: keep a tiny note on the order
      try {
        await env.DB.prepare(
          `UPDATE orders SET payment_note=?2 WHERE id=?1`
        ).bind(o.id, `yoco_fail:${mode}:${String(msg).slice(0,120)}`).run();
      } catch {}
      return bad(`Yoco rejected request: ${msg}`, res.status);
    }

    const checkoutId = y?.id || null;                 // usually ch_...
    const redirect = y?.redirectUrl || y?.redirect_url || redirect_url;

    // Update order to awaiting_payment + stash external id
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

    return json({ ok: true, redirect_url: redirect, yoco: y || null });
  });

  // ----------------- webhook (test & live) -----------------

  // POST /api/payments/yoco/webhook
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    // Parse body safely; keep a tiny log line (without secrets)
    let raw = "";
    try { raw = await req.text(); } catch {}
    let evt = {};
    try { evt = JSON.parse(raw || "{}"); } catch {}

    // Try to normalize the event shape
    // Yoco may send: { type, data: { object: {...} } } OR other variants.
    const type = String(evt?.type || "").toLowerCase();

    const obj =
      (evt?.data && typeof evt.data === "object" && (evt.data.object || evt.data.resource || evt.data)) ||
      evt?.object ||
      evt || {};

    // Possible identifiers we can use to find the order
    const reference =
      obj?.reference ||
      obj?.externalReference ||
      evt?.reference ||
      "";

    const checkoutId =
      obj?.checkoutId ||
      (obj?.checkout && obj.checkout.id) ||
      obj?.id ||               // often "ch_..." on checkout events
      null;

    const rawStatus = String(obj?.status || evt?.status || "").toLowerCase();

    const paidLike =
      type.includes("succeeded") ||
      ["paid", "succeeded", "successful", "completed"].includes(rawStatus);

    const failedLike =
      type.includes("failed") ||
      ["failed", "declined", "canceled", "cancelled"].includes(rawStatus);

    // Minimal console for diagnostics (safe)
    try {
      const brief = JSON.stringify({
        type, reference: reference || "", status: rawStatus || "", extId: checkoutId || ""
      });
      console.log("[YOCO WEBHOOK]", brief);
    } catch {}

    // Update the order by reference (preferred) OR by stored checkoutId
    try {
      if (reference) {
        if (paidLike) {
          await env.DB.prepare(
            `UPDATE orders
                SET status='paid',
                    paid_at=strftime('%s','now'),
                    payment_method='online_yoco',
                    updated_at=strftime('%s','now')
              WHERE UPPER(short_code)=UPPER(?1)`
          ).bind(reference).run();
        } else if (failedLike) {
          await env.DB.prepare(
            `UPDATE orders
                SET status='payment_failed',
                    payment_method='online_yoco',
                    updated_at=strftime('%s','now')
              WHERE UPPER(short_code)=UPPER(?1)`
          ).bind(reference).run();
        }
      } else if (checkoutId) {
        if (paidLike) {
          await env.DB.prepare(
            `UPDATE orders
                SET status='paid',
                    paid_at=strftime('%s','now'),
                    payment_method='online_yoco',
                    updated_at=strftime('%s','now')
              WHERE payment_ext_id = ?1`
          ).bind(checkoutId).run();
        } else if (failedLike) {
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
      // swallow — webhook must be idempotent/resilient
    }

    return json({ ok: true });
  });

  // ----------------- tiny diag endpoint (safe) -----------------

  // GET /api/payments/yoco/diag
  router.add("GET", "/api/payments/yoco/diag", async (_req, env) => {
    const { mode, secret } = await getYocoSecret(env);
    const base = await getSetting(env, "PUBLIC_BASE_URL");
    return json({
      ok: true,
      mode,
      hasSecret: Boolean(secret),
      publicBaseUrl: base || null,
      redirectExample: (base ? `${base}/thanks/EXAMPLE` : null),
      cancelExample: (base ? `${base}/shop/{event-slug}` : null),
    });
  });
}
