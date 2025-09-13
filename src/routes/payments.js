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

async function parseTpl(env, key /* e.g. 'WA_TMP_PAYMENT_CONFIRM' */) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}

async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;    // (env,to,body,lang,name?)
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

async function sendTicketDelivery(env, toMsisdn, code) {
  if (!toMsisdn || !code) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTicketTemplate = svc.sendTicketTemplate || null;
  if (!sendTicketTemplate) return;

  // Use admin-chosen template/language for ticket delivery
  const sel = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
  const [tplName, lang] = String(sel || "").split(":");
  const language = (lang || "en_US").trim();
  const templateName = (tplName || "ticket_delivery").trim();

  const firstName =
    String(await getBuyerNameByCode(env, code)).split(/\s+/)[0] || "Vriend";

  await sendTicketTemplate(env, String(toMsisdn), {
    templateName,
    language,
    bodyParam1: firstName,    // {{1}} in body
    urlSuffixParam1: code,    // {{1}} in URL button → /t/{{1}}
  });
}

async function getBuyerNameByCode(env, code) {
  const row = await env.DB.prepare(
    `SELECT buyer_name FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
  ).bind(code).first();
  return row?.buyer_name || "";
}

/** ------------------------------------------------------------------------
 * Payments routes
 *  - Yoco "intent" (sandbox simulator)
 *  - Sandbox redirect that marks order as paid and sends WA messages
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  // Create "intent" and return a redirect URL (sandbox = internal simulator)
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // Ensure order exists
    const o = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    const mode = (await getSetting(env, "YOCO_MODE")) || "sandbox";
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");

    if (mode !== "live") {
      // SANDBOX: hand off to our local simulator which marks the order paid
      const redirect = `${base || ""}/payments/yoco/simulate?code=${encodeURIComponent(code)}`;
      return json({ ok: true, redirect_url: redirect, yoco: { redirectUrl: redirect } });
    }

    // LIVE (placeholder): you’d create a hosted checkout/payment link with Yoco here
    // and return its redirect URL. For now, fail clearly so QA can spot missing config.
    return bad("Yoco live mode not wired yet. Please configure live integration.", 501);
  });

  // Sandbox simulator: mark order PAID, record payment, send WA messages, then redirect
  router.add("GET", "/payments/yoco/simulate", async (req, env) => {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return new Response("code required", { status: 400 });

    const now = Math.floor(Date.now()/1000);
    const row = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, total_cents
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();

    if (!row) return new Response("order not found", { status: 404 });

    // Mark paid (idempotent-ish)
    await env.DB.prepare(
      `UPDATE orders SET status='paid', paid_at=?1, updated_at=?1 WHERE id=?2`
    ).bind(now, row.id).run();

    // Record payment (approved)
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3)`
    ).bind(row.id, Number(row.total_cents || 0), now).run();

    // WhatsApp: Payment confirmation
    try {
      const msg = `Betaling ontvang vir bestelling ${code}. Dankie! 🎉`;
      if (row.buyer_phone) {
        await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(row.buyer_phone), msg);
      }
    } catch {}

    // WhatsApp: Ticket delivery (template with URL button)
    try {
      if (row.buyer_phone) {
        await sendTicketDelivery(env, String(row.buyer_phone), code);
      }
    } catch {}

    const next = `/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(`/t/${code}`)}`;
    return new Response(null, { status: 302, headers: { Location: next } });
  });
}