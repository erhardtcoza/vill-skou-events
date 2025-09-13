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
  } catch {}
}

/** ------------------------------------------------------------------------
 * POS routes used by the mobile sell screen
 * --------------------------------------------------------------------- */
export function mountPOS(router) {
  // Minimal diag
  router.add("GET", "/api/pos/diag", async () => json({ ok:true, pos:"ready" }));

  // Settle an order (mark as paid) and trigger WA delivery
  // Body: { order_id, code, buyer_phone, buyer_name, method: 'cash'|'card' }
  router.add("POST", "/api/pos/settle", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const order_id   = Number(b?.order_id || 0);
    const code       = String(b?.code || "").trim().toUpperCase();
    const buyer_phone= String(b?.buyer_phone || "").trim();
    const buyer_name = String(b?.buyer_name || "").trim();
    const method     = String(b?.method || "cash").toLowerCase(); // 'cash' | 'card'

    if (!order_id || !code) return bad("order_id and code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status
         FROM orders WHERE id=?1 AND UPPER(short_code)=?2 LIMIT 1`
    ).bind(order_id, code).first();
    if (!o) return bad("order not found", 404);

    const now = Math.floor(Date.now()/1000);

    // Mark paid
    await env.DB.prepare(
      `UPDATE orders SET status='paid', paid_at=?1 WHERE id=?2`
    ).bind(now, order_id).run();

    // Record payment (simple)
    const m = (method === "card") ? "pos_card" : "pos_cash";
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'approved', ?4, ?4)`
    ).bind(order_id, o.total_cents || 0, m, now).run();

    // WhatsApp delivery (and optional confirmation)
    try {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
      const link = base ? `${base}/t/${encodeURIComponent(code)}` : "";
      const body = link ? `Jou kaartjies is gereed. ${link}` : `Jou kaartjies is gereed. Kode: ${code}`;
      await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", buyer_phone, body);
    } catch {}

    return json({ ok:true, order_id, status:"paid" });
  });
}