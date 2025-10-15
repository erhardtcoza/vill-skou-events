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

/* ----------------------- mapping/eval helpers ---------------------- */
function getByPath(obj, path) {
  try {
    return String(path || "")
      .split(".")
      .reduce((o, k) => (o != null ? o[k] : undefined), obj);
  } catch { return undefined; }
}

async function evalValue(env, rule, ctx) {
  const src = String(rule?.source || "");
  const val = rule?.value;

  if (src === "field") {
    const out = getByPath(ctx, String(val || ""));
    return out == null ? "" : String(out);
  }
  if (src === "static") {
    return String(val ?? "");
  }
  if (src === "compute") {
    // Support expressions & template literals used in your mappings
    try {
      // expose ctx (data), PUBLIC_BASE_URL and _BASE_URL
      const BASE = await baseURL(env);
      const sandbox = { ...ctx, PUBLIC_BASE_URL: BASE, _BASE_URL: BASE };
      // eslint-disable-next-line no-new-func
      const fn = new Function("ctx", "with (ctx) { return (" + String(val || "''") + "); }");
      const out = fn(sandbox);
      return out == null ? "" : String(out);
    } catch (e) {
      dbg(env, "compute_error", e?.message || e, rule);
      return String(rule?.fallback ?? "");
    }
  }
  // default
  return String(rule?.fallback ?? "");
}

async function buildParamsFromMapping(env, template_key, context, data) {
  const row = await env.DB.prepare(
    `SELECT mapping_json FROM wa_template_mappings
      WHERE template_key=?1 AND context=?2
      LIMIT 1`
  ).bind(String(template_key || ""), String(context || "")).first();

  if (!row) return [];

  let mapping;
  try { mapping = JSON.parse(row.mapping_json || "{}"); } catch { mapping = {}; }
  const vars = Array.isArray(mapping?.vars) ? mapping.vars : [];

  // ensure ordered by variable index (1..N)
  const ordered = [...vars].sort((a,b) => Number(a.variable||0) - Number(b.variable||0));

  const params = [];
  for (const rule of ordered) {
    const v = await evalValue(env, rule, data || {});
    if (v === "" && rule?.fallback != null) {
      params.push(String(rule.fallback));
    } else {
      params.push(String(v));
    }
  }
  return params;
}

/* ----------------------------- exports ----------------------------- */
/**
 * Mapper-aware sender.
 *  sendTemplateByKey(env, { template_key: "bar_purchase:af", context: "visitor", msisdn, data })
 */
export async function sendTemplateByKey(env, { template_key, context, msisdn, data }) {
  try {
    const ms = normMSISDN(msisdn);
    if (!ms || !template_key) return false;

    const [name, language = "af"] = String(template_key).includes(":")
      ? String(template_key).split(":")
      : [String(template_key), "af"];

    const params = await buildParamsFromMapping(env, template_key, context, data);
    return await sendWhatsAppTemplate(env, ms, "", language, name, params);
  } catch (e) {
    dbg(env, "sendTemplateByKey_error", e?.message || e);
    return false;
  }
}

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
  // mapper-aware
  sendTemplateByKey,
  // plain
  sendWhatsAppTemplate,
  sendWhatsAppTextIfSession,
  sendOrderOnWhatsApp
};
