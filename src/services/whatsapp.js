// src/services/whatsapp.js
const GRAPH_VER = "v20.0";

/* ------------------------------ utils ------------------------------ */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

function dbg(env, ...args) {
  // Turn on with:
  // INSERT OR REPLACE INTO site_settings(key,value) VALUES('WA_DEBUG','1');
  try {
    getSetting(env, "WA_DEBUG")
      .then(v => { if (String(v || "") === "1") console.log("[wa]", ...args); })
      .catch(() => {});
  } catch {}
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
  const token =
    (await getSetting(env, "WA_TOKEN")) ||
    env.WA_TOKEN ||
    "";

  // Accept BOTH keys (DB or env): WA_PHONE_ID or WA_PHONE_NUMBER_ID
  const phone_id =
    (await getSetting(env, "WA_PHONE_ID")) ||
    (await getSetting(env, "WA_PHONE_NUMBER_ID")) ||
    env.WA_PHONE_ID ||
    env.WA_PHONE_NUMBER_ID ||
    "";

  const default_lang =
    (await getSetting(env, "WA_DEFAULT_LANG")) ||
    "en_US";

  return {
    token: String(token).trim(),
    phone_id: String(phone_id).trim(),
    default_lang: String(default_lang).trim() || "en_US"
  };
}

async function waFetch(env, path, body) {
  const { token } = await getWAConfig(env);
  if (!token) {
    dbg(env, "no_token");
    return { ok: false, status: 0, json: { error: "no_token" } };
  }
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
    dbg(env, "fetch", path, r.status, j);
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    dbg(env, "error", String(e?.message || e));
    return { ok: false, status: 0, json: { error: String(e?.message || e) } };
  }
}

/* ----------------------------- exports ----------------------------- */
/**
 * Send a pre-approved TEMPLATE message.
 * Backward-compatible signature:
 *   sendWhatsAppTemplate(env, to, fallbackText, lang, name)
 * Extended (optional) 6th param:
 *   params: string[] -> becomes {{1}}, {{2}}, ... in the template body
 */
export async function sendWhatsAppTemplate(
  env,
  to,
  fallbackText = "",
  lang,
  name,
  params = []
) {
  const { phone_id, default_lang } = await getWAConfig(env);
  const msisdn = normMSISDN(to);
  if (!phone_id || !msisdn || !name) {
    dbg(env, "template precheck failed", { has_phone_id: !!phone_id, msisdn, name });
    return false;
  }

  // Build components: if params[] provided, map to body parameters;
  // otherwise keep a single fallback text parameter (old behavior).
  let components;
  if (Array.isArray(params) && params.length) {
    components = [{
      type: "body",
      parameters: params.map(v => ({ type: "text", text: String(v ?? "") }))
    }];
  } else {
    components = [{
      type: "body",
      parameters: [{ type: "text", text: String(fallbackText || "") }]
    }];
  }

  const body = {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "template",
    template: {
      name,
      language: { code: (lang || default_lang || "en_US") },
      components
    }
  };

  const res = await waFetch(env, `${phone_id}/messages`, body);
  return !!res.ok;
}

/** Send a plain TEXT message (requires an active user session). */
export async function sendWhatsAppTextIfSession(env, to, text) {
  const { phone_id } = await getWAConfig(env);
  const msisdn = normMSISDN(to);
  if (!phone_id || !msisdn || !text) {
    dbg(env, "text precheck failed", { has_phone_id: !!phone_id, msisdn, hasText: !!text });
    return false;
  }
  const body = {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "text",
    text: { preview_url: true, body: String(text || "") }
  };
  const res = await waFetch(env, `${phone_id}/messages`, body);
  return !!res.ok;
}

/**
 * Convenience helper for ticket delivery via text
 * (routes already handle template sends separately).
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
