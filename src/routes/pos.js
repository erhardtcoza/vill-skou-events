// src/router/pos.js
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

async function parseTpl(env, key /* e.g. 'WA_TMP_TICKET_DELIVERY' */) {
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

async function sendTicketDelivery(env, toMsisdn, code, buyerName) {
  if (!toMsisdn || !code) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTicketTemplate = svc.sendTicketTemplate || null;
  if (!sendTicketTemplate) return;

  const sel = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
  const [tplName, lang] = String(sel || "").split(":");
  const language = (lang || "en_US").trim();
  const templateName = (tplName || "ticket_delivery").trim();

  const firstName = String(buyerName||"").split(/\s+/)[0] || "Vriend";

  await sendTicketTemplate(env, String(toMsisdn), {
    templateName,
    language,
    bodyParam1: firstName,  // {{1}}
    urlSuffixParam1: code,  // {{1}} in URL button → /t/{{1}}
  });
}

/** ------------------------------------------------------------------------
 * POS routes
 *  - /api/pos/diag
 *  - /api/pos/settle   (mark order paid and send WhatsApp)
 * --------------------------------------------------------------------- */
export function mountPOS(router) {
  // lightweight diag
  router.add("GET", "/api/pos/diag", async () => {
    return json({ ok: true, pos: "ready" });
  });

  // Mark an existing order as paid (POS cash/card) and trigger WA sends
  // Body: { order_id?, code?, buyer_phone?, buyer_name?, method?: 'cash'|'card' }
  router.add("POST", "/api/pos/settle", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const code = String(b?.code || "").trim().toUpperCase();
    const methodRaw = String(b?.method || "cash").toLowerCase();
    const method = methodRaw === "card" ? "pos_card" : "pos_cash";

    if (!code) return bad("code required");

    const row = await env.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone, total_cents, status
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();

    if (!row) return bad("Order not found", 404);

    const now = Math.floor(Date.now()/1000);

    // Mark paid (idempotent)
    await env.DB.prepare(
      `UPDATE orders SET status='paid', payment_method=?1, paid_at=?2, updated_at=?2 WHERE id=?3`
    ).bind(method, now, row.id).run();

    // Record payment
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'approved', ?4, ?4)`
    ).bind(row.id, Number(row.total_cents || 0), method, now).run();

    // WhatsApp: quick confirmation
    try {
      const msg = `Betaling ontvang vir bestelling ${code}. Dankie! 🎉`;
      const to = String(row.buyer_phone || b?.buyer_phone || "").trim();
      if (to) {
        await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", to, msg);
      }
    } catch {}

    // WhatsApp: deliver tickets (with URL button)
    try {
      const to = String(row.buyer_phone || b?.buyer_phone || "").trim();
      if (to) {
        await sendTicketDelivery(env, to, code, (row.buyer_name || b?.buyer_name || ""));
      }
    } catch {}

    return json({ ok: true, order_id: row.id, code, method });
  });
}