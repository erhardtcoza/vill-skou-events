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
 * Payments routes (Yoco intent + webhook)
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  // Create a payment intent / hosted checkout URL for an order short code.
  // UI will redirect if we return { ok:true, redirect_url: "https://..." }.
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, buyer_phone, buyer_name, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);
    if (String(o.status || "").toLowerCase() !== "awaiting_payment") {
      // Already paid or not awaiting — just send them to tickets page flow.
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
      return json({ ok:true, redirect_url: base ? `${base}/thanks/${encodeURIComponent(code)}` : `/thanks/${encodeURIComponent(code)}` });
    }

    // Optional: support a pre-configured redirect template in settings, e.g.
    // YOCO_REDIRECT_TEMPLATE = "https://pay.example.com/checkout?code={{code}}&amount={{amount_cents}}"
    const tmpl = await getSetting(env, "YOCO_REDIRECT_TEMPLATE");
    if (tmpl) {
      const url = tmpl
        .replace(/\{\{code\}\}/g, encodeURIComponent(code))
        .replace(/\{\{amount_cents\}\}/g, String(o.total_cents || 0))
        .replace(/\{\{amount\}\}/g, String((o.total_cents||0)/100));
      return json({ ok:true, redirect_url: url });
    }

    // If not configured, reply gracefully so UI falls back to thank-you (it will poll).
    return json({ ok:false, error:"Payments not configured" });
  });

  // Webhook receiver for Yoco (or any PSP) to mark an order as paid.
  // Expect JSON containing at least: { code: "SHORTCODE", status: "paid" | "failed" }
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    const code = String(body?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const paid = String(body?.status || "").toLowerCase() === "paid";
    const o = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, buyer_name, total_cents, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    if (paid) {
      // Mark paid
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
    } else {
      await env.DB.prepare(
        `UPDATE orders SET status='payment_failed' WHERE id=?1`
      ).bind(o.id).run();
      return json({ ok:true });
    }
  });
}