// src/services/whatsapp.js
const GRAPH_VER = "v20.0";

/* ------------------------------ utils ------------------------------ */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function baseURL(env) {
  const s = await getSetting(env, "PUBLIC_BASE_URL");
  return s || env.PUBLIC_BASE_URL || "";
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

function deepGet(obj, path) {
  if (!path) return undefined;
  return String(path).split(".").reduce((o, k) => (o && k in o) ? o[k] : undefined, obj);
}

function dbg(env, ...args) {
  try {
    getSetting(env, "WA_DEBUG")
      .then(v => { if (String(v || "") === "1") console.log("[wa]", ...args); })
      .catch(() => {});
  } catch {}
}

async function getWAConfig(env) {
  const token =
    (await getSetting(env, "WA_TOKEN")) ||
    (await getSetting(env, "WHATSAPP_TOKEN")) ||
    env.WA_TOKEN ||
    "";

  const phone_id =
    (await getSetting(env, "WA_PHONE_ID")) ||
    (await getSetting(env, "WA_PHONE_NUMBER_ID")) ||
    (await getSetting(env, "PHONE_NUMBER_ID")) ||
    env.WA_PHONE_ID ||
    env.WA_PHONE_NUMBER_ID ||
    "";

  const default_lang =
    (await getSetting(env, "WA_DEFAULT_LANG")) ||
    "af";

  return {
    token: String(token).trim(),
    phone_id: String(phone_id).trim(),
    default_lang: String(default_lang).trim() || "af"
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

/* ----------------------------- core senders ----------------------------- */
/**
 * Send a TEMPLATE message.
 *
 * Dual signature (both supported):
 *  1) Legacy positional: sendWhatsAppTemplate(env, to, fallbackText, lang, name, params[])
 *  2) Object form:       sendWhatsAppTemplate(env, { to, name, language, variables })
 */
export async function sendWhatsAppTemplate(env, toOrObj, fallbackText, lang, name, params = []) {
  const { phone_id, default_lang } = await getWAConfig(env);

  // Normalize signature
  let msisdn, tplName, tplLang, variables;
  if (typeof toOrObj === "object" && toOrObj !== null) {
    msisdn    = normMSISDN(toOrObj.to);
    tplName   = toOrObj.name;
    tplLang   = toOrObj.language || default_lang || "af";
    variables = Array.isArray(toOrObj.variables) ? toOrObj.variables : [];
  } else {
    msisdn    = normMSISDN(toOrObj);
    tplName   = name;
    tplLang   = lang || default_lang || "af";
    variables = Array.isArray(params) && params.length ? params : (fallbackText ? [String(fallbackText)] : []);
  }

  if (!phone_id || !msisdn || !tplName) {
    dbg(env, "template precheck failed", { has_phone_id: !!phone_id, msisdn, tplName });
    return false;
  }

  const components = variables.length
    ? [{ type: "body", parameters: variables.map(v => ({ type: "text", text: String(v ?? "") })) }]
    : [];

  const body = {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "template",
    template: {
      name: tplName,
      language: { code: tplLang },
      components
    }
  };

  const res = await waFetch(env, `${phone_id}/messages`, body);
  return !!res.ok;
}

/** Plain text (requires an active user session) */
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

// Friendly alias used by other modules
export const sendTextIfSession = sendWhatsAppTextIfSession;

/* -------------- Mapper-driven sender: sendTemplateByKey --------------- */
/**
 * Resolves a mapping from wa_template_mappings and sends the template.
 * @param {object} args
 *  - template_key: "name:lang"
 *  - context: "visitor" | "order" | "ticket" | ...
 *  - msisdn: destination
 *  - data: object merged into compute scope (e.g. { wallets:{...}, wallet_movements:{...} })
 */
export async function sendTemplateByKey(env, { template_key, context, msisdn, data }) {
  const [tplName, tplLang = "af"] = String(template_key || "").split(":");
  const to = normMSISDN(msisdn);
  if (!tplName || !to) return false;

  // Fetch mapping row
  const row = await env.DB.prepare(
    `SELECT mapping_json FROM wa_template_mappings WHERE template_key=?1 AND context=?2 LIMIT 1`
  ).bind(String(template_key), String(context || "")).first();

  // No mapping? send without variables
  if (!row?.mapping_json) {
    return sendWhatsAppTemplate(env, { to, name: tplName, language: tplLang, variables: [] });
  }

  let mapping;
  try { mapping = JSON.parse(row.mapping_json); } catch { mapping = { vars: [] }; }

  // Build compute context
  const base = await baseURL(env);
  const ctx = { ...(data || {}), PUBLIC_BASE_URL: base };

  // Ensure stable order by {{n}}
  const entries = Array.isArray(mapping.vars) ? mapping.vars.slice() : [];
  entries.sort((a, b) => Number(a?.variable || 0) - Number(b?.variable || 0));

  const variables = entries.map(v => {
    const src = String(v?.source || "").trim();
    const val = String(v?.value || "").trim();
    const fb  = v?.fallback ?? "";

    if (src === "field") {
      const got = deepGet(ctx, val);
      return (got == null || got === "") ? String(fb) : String(got);
    }
    if (src === "static") {
      return String(val || fb || "");
    }
    if (src === "compute") {
      try {
        // allow expressions like:  `'R' + (wallet_movements.amount_cents / 100).toFixed(2)`
        // or template string like: `${PUBLIC_BASE_URL}/w/${wallets.id}`
        /* eslint no-new-func: "off" */
        const fn = new Function(...Object.keys(ctx), `return ${val};`);
        const out = fn(...Object.values(ctx));
        return (out == null || out === "") ? String(fb || "") : String(out);
      } catch {
        return String(fb || "");
      }
    }
    return String(fb || "");
  });

  return sendWhatsAppTemplate(env, { to, name: tplName, language: tplLang, variables });
}

/* ---------------- convenience (unchanged) ---------------- */
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
  sendTextIfSession,
  sendTemplateByKey,
  sendOrderOnWhatsApp
};
