// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

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

  // Pull WhatsApp template selections from site settings
  async function getWhatsAppTemplateConfig(env) {
    // In Admin > Site Settings > WhatsApp > Templates, store these keys:
    //  - TPL_ORDER_CONFIRM
    //  - TPL_PAYMENT_CONFIRM
    //  - TPL_TICKET_DELIVERY
    //  - TPL_SKOUSALES  (for campaigns / reminders)
    const [order, pay, ticket, sales, lang] = await Promise.all([
      getSetting(env, "TPL_ORDER_CONFIRM"),
      getSetting(env, "TPL_PAYMENT_CONFIRM"),
      getSetting(env, "TPL_TICKET_DELIVERY"),
      getSetting(env, "TPL_SKOUSALES"),
      getSetting(env, "WHATSAPP_TEMPLATE_LANG"),
    ]);
    return {
      order_confirm: order || null,
      payment_confirm: pay || null,
      ticket_delivery: ticket || null,
      skousales: sales || null,
      lang: lang || "en_US",
    };
  }

  // Send a WhatsApp message (template if available; else plain text)
  async function sendWhatsApp(env, toMsisdn, textBody, preferredTemplateName, lang) {
    // Lazy import so the worker doesn’t crash if WA service is not bundled in dev
    let svc = null;
    try {
      svc = await import("../services/whatsapp.js");
    } catch {
      console.log("[WA] service not available");
      return;
    }

    const sendTemplate = svc.sendWhatsAppTemplate || null;
    const sendText     = svc.sendWhatsAppText || svc.sendWhatsApp || null;

    try {
      if (preferredTemplateName && sendTemplate) {
        // We keep it simple and use the full text as the single variable
        // If your approved templates have multiple variables, adjust here.
        await sendTemplate(env, toMsisdn, textBody, lang, preferredTemplateName);
      } else if (sendText) {
        await sendText(env, toMsisdn, textBody, lang);
      }
    } catch (e) {
      console.log("[WA SEND FAIL]", String(e?.message || e));
    }
  }

  /* ------------------------------------------------------------------ *
   * Create YOCO checkout (intent)
   * POST /api/payments/yoco/intent  { code: "C123ABC" }
   * ------------------------------------------------------------------ */
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

    const redirect = y?.redirectUrl || y?.redirect_url || redirect_url;

    // Update order to awaiting_payment + stash external checkout id
    try {
      await env.DB.prepare(
        `UPDATE orders
            SET status = CASE WHEN status='awaiting_payment' THEN status ELSE 'awaiting_payment' END,
                payment_method = 'online_yoco',
                payment_ext_id = COALESCE(?2, payment_ext_id),
                updated_at = strftime('%s','now')
          WHERE id = ?1`
      ).bind(o.id, (y?.id || y?.metadata?.checkoutId || null)).run();
    } catch {}

    return json({ ok: true, redirect_url: redirect, yoco: y || null });
  });

  /* ------------------------------------------------------------------ *
   * YOCO Webhook (test/live share the same URL)
   * POST /api/payments/yoco/webhook
   * ------------------------------------------------------------------ */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let evt; try { evt = await req.json(); } catch { return bad("Bad JSON"); }

    // Yoco webhooks vary by event type; be defensive:
    const type = String(evt?.type || "").toLowerCase();
    const obj  = evt?.data?.object || evt?.object || {};

    // Try to extract identifiers we can use to link back to our order.
    // Prefer our short_code ("reference"); fall back to checkoutId / paymentId
    // which we stash into orders.payment_ext_id when creating the checkout.
    const reference   = (obj?.reference || evt?.reference || "").toString();
    const checkoutId  = (obj?.checkoutId || obj?.id || obj?.payment?.checkoutId || "").toString(); // e.g. ch_...
    const paymentId   = (obj?.paymentId || obj?.payment?.id || "").toString();                     // e.g. pay_...
    const rawStatus   = String(obj?.status || evt?.status || "").toLowerCase();

    const paidLike =
      rawStatus === "paid" ||
      rawStatus === "succeeded" ||
      type.includes("checkout.completed") ||
      type.includes("payment.succeeded");

    const failedLike =
      rawStatus === "failed" ||
      type.includes("payment.failed");

    // Try to locate the order, in priority order:
    let targetShortCode = reference;

    if (!targetShortCode && (checkoutId || paymentId)) {
      const found = await env.DB.prepare(
        `SELECT short_code FROM orders
          WHERE payment_ext_id = ?1 OR payment_ext_id = ?2
          ORDER BY id DESC LIMIT 1`
      ).bind(checkoutId || "", paymentId || "").first();
      if (found?.short_code) targetShortCode = found.short_code;
    }

    console.log("[YOCO WEBHOOK]", JSON.stringify({
      type, reference: targetShortCode || reference || "",
      status: rawStatus, extId: evt?.id || obj?.id || ""
    }));

    if (!targetShortCode) return json({ ok: true, note: "unmatched event" });

    // Pull template config (once)
    const tpl = await getWhatsAppTemplateConfig(env);

    if (paidLike) {
      // Set to paid idempotently; only first transition triggers WhatsApp
      const r = await env.DB.prepare(
        `UPDATE orders
            SET status='paid',
                paid_at = COALESCE(paid_at, strftime('%s','now')),
                payment_method='online_yoco',
                updated_at = strftime('%s','now')
          WHERE UPPER(short_code)=UPPER(?1) AND status!='paid'`
      ).bind(targetShortCode).run();

      if ((r.meta?.changes || 0) > 0) {
        // Send WhatsApp ticket delivery / payment confirm
        const baseRow = await env.DB.prepare(
          `SELECT value FROM site_settings WHERE key='PUBLIC_BASE_URL' LIMIT 1`
        ).first();
        const base = (baseRow?.value || "").toString() || (env.PUBLIC_BASE_URL || "");
        const link = `${base}/t/${encodeURIComponent(targetShortCode)}`;
        const body = `Jou kaartjies is gereed. Bestel nommer: ${targetShortCode}\n${link}`;

        // Lookup recipient
        const ord = await env.DB.prepare(
          `SELECT buyer_phone FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
        ).bind(targetShortCode).first();
        if (ord?.buyer_phone) {
          // Prefer specific template, fallback to generic text
          await sendWhatsApp(env, ord.buyer_phone, body, (tpl.ticket_delivery || tpl.payment_confirm || null), tpl.lang);
        }
      }
    } else if (failedLike) {
      await env.DB.prepare(
        `UPDATE orders
            SET status='payment_failed',
                payment_method='online_yoco',
                updated_at=strftime('%s','now')
          WHERE UPPER(short_code)=UPPER(?1)`
      ).bind(targetShortCode).run();
    }

    return json({ ok: true });
  });

  /* ------------------------------------------------------------------ *
   * Diagnostics (helps verify settings quickly)
   * GET /api/payments/yoco/diag
   * ------------------------------------------------------------------ */
  router.add("GET", "/api/payments/yoco/diag", async (_req, env) => {
    const { mode, secret } = await getYocoSecret(env);
    const publicBaseUrl = await getSetting(env, "PUBLIC_BASE_URL");
    return json({
      ok: true,
      mode,
      hasSecret: !!secret,
      publicBaseUrl,
      redirectExample: (publicBaseUrl || "") + "/thanks/EXAMPLE",
      cancelExample:   (publicBaseUrl || "") + "/shop/{event-slug}"
    });
  });
}
