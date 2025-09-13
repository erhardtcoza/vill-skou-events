// src/router/payments.js
import { json, bad } from "../utils/http.js";

/** ------------------------------------------------------------------------
 * Shared helpers (settings + WhatsApp via Admin template selectors)
 * --------------------------------------------------------------------- */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n||"").trim() || null, lang: (l||"").trim() || "en_US" };
}

async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;   // (env,to,body,lang,templateName?)
  const sendTxt = svc.sendWhatsAppTextIfSession || null;

  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) {
      await sendTpl(env, toMsisdn, fallbackText, lang, name);
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch { /* swallow */ }
}

/** ------------------------------------------------------------------------
 * Yoco Hosted Checkout (Payment Links) + Webhook
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  // 1) Create a Yoco Payment Link (hosted checkout) and return redirect URL.
  // Requires:
  //   YOCO_MODE: "sandbox" | "live"
  //   YOCO_TEST_SECRET_KEY / YOCO_LIVE_SECRET_KEY
  //   PUBLIC_BASE_URL (to compose success/cancel URLs)
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, buyer_phone, buyer_name, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    // If already paid/not awaiting → go to thanks (UI polls)
    if (String(o.status || "").toLowerCase() !== "awaiting_payment") {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
      return json({ ok:true, redirect_url: base ? `${base}/thanks/${encodeURIComponent(code)}` : `/thanks/${encodeURIComponent(code)}` });
    }

    // If a redirect template is set in settings, use it directly.
    const tmpl = await getSetting(env, "YOCO_REDIRECT_TEMPLATE");
    if (tmpl) {
      const url = tmpl
        .replace(/\{\{code\}\}/g, encodeURIComponent(code))
        .replace(/\{\{amount_cents\}\}/g, String(o.total_cents || 0))
        .replace(/\{\{amount\}\}/g, String((o.total_cents||0)/100));
      return json({ ok:true, redirect_url: url });
    }

    // Try to create a Payment Link with Yoco
    const mode = (await getSetting(env, "YOCO_MODE")) || "sandbox";
    const secret =
      (mode === "live")
        ? (await getSetting(env, "YOCO_LIVE_SECRET_KEY") || env.YOCO_LIVE_SECRET_KEY || "")
        : (await getSetting(env, "YOCO_TEST_SECRET_KEY") || env.YOCO_TEST_SECRET_KEY || "");
    if (!secret) {
      // Not configured → graceful fallback
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
      return json({ ok:false, error:"Payments not configured", redirect_url: base ? `${base}/thanks/${encodeURIComponent(code)}` : `/thanks/${encodeURIComponent(code)}` });
    }

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const successUrl = base ? `${base}/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(base + "/t/" + code)}` : `/thanks/${encodeURIComponent(code)}`;
    const cancelUrl  = base ? `${base}/thanks/${encodeURIComponent(code)}?pay=cancel` : `/thanks/${encodeURIComponent(code)}?pay=cancel`;

    // Yoco Payment Links endpoint (amount in cents, ZAR)
    // If Yoco changes, this will just fail gracefully and the UI will fall back to /thanks.
    let res, y;
    try {
      res = await fetch("https://payments.yoco.com/api/payment_links", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          amount: Number(o.total_cents || 0),
          currency: "ZAR",
          description: `Order ${o.short_code}`,
          metadata: { code: o.short_code },
          successUrl,
          cancelUrl
        })
      });
      y = await res.json().catch(()=> ({}));
    } catch (e) {
      // Network fail → fallback
      const fb = base ? `${base}/thanks/${encodeURIComponent(code)}` : `/thanks/${encodeURIComponent(code)}`;
      return json({ ok:false, error: String(e?.message||e), redirect_url: fb });
    }

    // If Yoco returns a link, prefer it; else fallback to /thanks
    const hosted = y?.link || y?.url || y?.redirect_url || y?.redirectUrl || null;
    if (res.ok && hosted) {
      return json({ ok:true, redirect_url: hosted, yoco: y });
    }

    const fb = base ? `${base}/thanks/${encodeURIComponent(code)}` : `/thanks/${encodeURIComponent(code)}`;
    return json({ ok:false, error: y?.error || "Could not create payment link", redirect_url: fb, yoco: y });
  });

  // 2) Webhook: mark order paid and send WhatsApp confirms
  // Accepts:
  //  - Simple: { code: "CXYZ123", status: "paid" | "payment_failed" }
  //  - Yoco event-ish payloads, where code can be found at:
  //      body.metadata.code
  //      body.data.metadata.code
  //      body.object.metadata.code
  // and success states like: "succeeded", "paid", "payment.succeeded"
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    function extractCodeAndStatus(b) {
      // try multiple shapes
      const meta = b?.metadata || b?.data?.metadata || b?.object?.metadata || {};
      const code = String(meta?.code || b?.code || "").trim().toUpperCase();
      const statusRaw = String(b?.status || b?.type || b?.event || "").toLowerCase();

      // explicit override
      let paid = String(b?.status || "").toLowerCase() === "paid";
      // common success markers
      if (!paid) {
        paid =
          statusRaw.includes("succeeded") ||
          statusRaw === "payment.succeeded" ||
          statusRaw === "payment_success" ||
          statusRaw === "success";
      }
      // explicit failure markers
      const failed =
        String(b?.status || "").toLowerCase() === "payment_failed" ||
        statusRaw.includes("failed") ||
        statusRaw === "payment.failed";

      return { code, paid, failed };
    }

    const { code, paid, failed } = extractCodeAndStatus(body);
    if (!code) return bad("code missing in webhook payload");

    const o = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, buyer_name, total_cents, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    if (paid) {
      const now = Math.floor(Date.now()/1000);
      await env.DB.prepare(
        `UPDATE orders SET status='paid', paid_at=?1 WHERE id=?2`
      ).bind(now, o.id).run();

      // Send payment confirmation
      try {
        const msg = `Betaling ontvang vir bestelling ${o.short_code}. Dankie! 🎉`;
        await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", o.buyer_phone, msg);
      } catch {}

      // Send ticket delivery
      try {
        const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
        const link = base ? `${base}/t/${encodeURIComponent(o.short_code)}` : "";
        const msg = link ? `Jou kaartjies is gereed. ${link}` : `Jou kaartjies is gereed. Kode: ${o.short_code}`;
        await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", o.buyer_phone, msg);
      } catch {}

      return json({ ok:true });
    }

    if (failed) {
      await env.DB.prepare(
        `UPDATE orders SET status='payment_failed' WHERE id=?1`
      ).bind(o.id).run();
      return json({ ok:true });
    }

    // Unknown status → accept but do nothing
    return json({ ok:true, ignored:true });
  });
}