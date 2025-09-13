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
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}

async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;

  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) {
      await sendTpl(env, toMsisdn, fallbackText, lang, name);
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch { /* non-blocking */ }
}

/** ------------------------------------------------------------------------
 * Payment webhooks + helpers
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  // Yoco webhook
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    const event = body?.event;
    const data  = body?.data;

    if (!event || !data) return bad("Invalid payload");

    // We only handle successful payments
    if (event !== "payment.succeeded") return json({ ok: true, ignored: true });

    const ref  = data?.metadata?.order_code || null;
    const amt  = Number(data?.amount || 0);
    const now  = Math.floor(Date.now() / 1000);

    if (!ref) return bad("Missing order_code in metadata");

    // Lookup order
    const order = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, buyer_name, status
         FROM orders
        WHERE short_code=?1
        LIMIT 1`
    ).bind(ref).first();
    if (!order) return bad("Order not found", 404);

    // Mark as paid
    await env.DB.prepare(
      `UPDATE orders SET status='paid', paid_at=?1 WHERE id=?2`
    ).bind(now, order.id).run();

    // Record payment
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3)`
    ).bind(order.id, amt, now).run();

    // WhatsApp notification: Payment confirmation + ticket delivery
    try {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
      const link = base ? `${base}/t/${encodeURIComponent(order.short_code)}` : "";
      const payMsg = `Betaling ontvang ✔ vir bestelling ${order.short_code}. Dankie!`;
      const tickMsg = link
        ? `Jou kaartjies is gereed. ${link}`
        : `Jou kaartjies is gereed. Kode: ${order.short_code}`;

      if (order.buyer_phone) {
        await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", order.buyer_phone, payMsg);
        await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", order.buyer_phone, tickMsg);
      }
    } catch { /* ignore WA failure */ }

    return json({ ok: true });
  });
}