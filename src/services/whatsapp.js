// src/services/whatsapp.js
// WhatsApp Cloud API helpers (fail-safe: never throw)
// Used by payments/public routes via dynamic import.

const GRAPH_VER = "v20.0"; // safe default; FB keeps older versions live for a long time

/* ------------------------------ utils ------------------------------ */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

function normMSISDN(msisdn) {
  try {
    const s = String(msisdn || "").replace(/\D+/g, "");
    if (!s) return "";
    if (s.startsWith("27") && s.length >= 11) return s;
    if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
    return s;
  } catch { return ""; }
}

async function baseURL(env) {
  const s = await getSetting(env, "PUBLIC_BASE_URL");
  return s || env.PUBLIC_BASE_URL || "";
}

async function getWAConfig(env) {
  // Prefer Settings table, with env fallbacks
  const token = (await getSetting(env, "WA_TOKEN")) || env.WA_TOKEN || "";
  const phone_id = (await getSetting(env, "WA_PHONE_ID")) || env.WA_PHONE_ID || "";
  const default_lang = (await getSetting(env, "WA_DEFAULT_LANG")) || "en_US";
  return { token, phone_id, default_lang };
}

async function waFetch(env, path, body) {
  const { token } = await getWAConfig(env);
  if (!token) return { ok: false, status: 0, json: { error: "no_token" } };

  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    return { ok: false, status: 0, json: { error: String(e && e.message || e) } };
  }
}

/* ------------------------- public functions ------------------------ */

/**
 * Send a pre-approved TEMPLATE message (outside 24h window).
 * - name: template name (string, required to send template)
 * - lang: BCP47 like 'en_US' or 'af' (defaults from settings)
 * - fallbackText: used as a single body variable if your template has {{1}}
 */
export async function sendWhatsAppTemplate(env, to, fallbackText = "", lang, name) {
  const { phone_id, default_lang } = await getWAConfig(env);
  const msisdn = normMSISDN(to);
  if (!phone_id || !msisdn || !name) return false;

  const body = {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "template",
    template: {
      name,
      language: { code: (lang || default_lang || "en_US") },
      // Minimal component – assume a single body param; if your template
      // has no params this is ignored by WA server.
      components: [{
        type: "body",
        parameters: [{ type: "text", text: String(fallbackText || "") }]
      }]
    }
  };

  const res = await waFetch(env, `${phone_id}/messages`, body);
  if (!res.ok) {
    // Keep the app flow non-blocking; log for diagnostics only
    try { console.log("[wa] template send failed", res.status, res.json); } catch {}
  }
  return !!res.ok;
}

/**
 * Send a plain TEXT message (works only if user has an active session).
 */
export async function sendWhatsAppTextIfSession(env, to, text) {
  const { phone_id } = await getWAConfig(env);
  const msisdn = normMSISDN(to);
  if (!phone_id || !msisdn || !text) return false;

  const body = {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "text",
    text: { preview_url: true, body: String(text || "") }
  };

  const res = await waFetch(env, `${phone_id}/messages`, body);
  if (!res.ok) {
    // Usually 470 if no session (expected); just log
    try { console.log("[wa] text send failed", res.status, res.json); } catch {}
  }
  return !!res.ok;
}

/**
 * Send order/ticket delivery message (simple deep-link to ticket page).
 * - Keeps it universal (no templates hardcoded here) so the routes can
 *   decide whether to use a specific template via sendViaTemplateKey().
 */
export async function sendOrderOnWhatsApp(env, to, order) {
  try {
    const msisdn = normMSISDN(to);
    if (!msisdn) return false;

    const base = await baseURL(env);
    const code = (order && order.short_code) ? String(order.short_code) : "";
    const link = code ? `${base}/t/${encodeURIComponent(code)}` : base;

    const lines = [
      order?.buyer_name ? `Hallo ${order.buyer_name}` : `Hallo!`,
      ``,
      `Jou kaartjies is gereed 🎟️`,
      code ? `Bestelling: ${code}` : ``,
      link ? `Wys/aflaai: ${link}` : ``,
    ].filter(Boolean);

    return await sendWhatsAppTextIfSession(env, msisdn, lines.join("\n"));
  } catch {
    return false;
  }
}

export default {
  sendWhatsAppTemplate,
  sendWhatsAppTextIfSession,
  sendOrderOnWhatsApp
};
