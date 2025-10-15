// src/services/whatsapp.js
const GRAPH_VER = "v20.0";

/* ------------------------------ tiny utils ------------------------------ */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? String(row.value) : null;
}
function normMSISDN(msisdn) {
  const s = String(msisdn || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("27") && s.length >= 11) return s;
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
async function getWAConfig(env) {
  const token =
    (await getSetting(env, "WA_TOKEN")) ||
    (await getSetting(env, "WHATSAPP_TOKEN")) ||
    "";
  const phone_id =
    (await getSetting(env, "WA_PHONE_ID")) ||
    (await getSetting(env, "WA_PHONE_NUMBER_ID")) ||
    "";
  const default_lang = (await getSetting(env, "WA_DEFAULT_LANG")) || "af";
  return { token: token.trim(), phone_id: phone_id.trim(), default_lang };
}
async function waFetch(env, path, body) {
  const { token } = await getWAConfig(env);
  if (!token) throw new Error("WA_TOKEN not configured");
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${path}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Meta ${r.status}`);
  return j?.messages?.[0]?.id || null;
}

/* -------------------------- mapping helpers ----------------------------- */
// read the mapping row for `template_key` + `context`
async function readMapping(env, template_key, context) {
  const row = await env.DB.prepare(
    `SELECT mapping_json FROM wa_template_mappings
      WHERE template_key=?1 AND context=?2 LIMIT 1`
  ).bind(template_key, context).first();
  if (!row?.mapping_json) return { vars: [] };
  try { return JSON.parse(row.mapping_json); } catch { return { vars: [] }; }
}

// very small evaluator: supports `field`, `static`, and `compute` with
// template literals like  `${PUBLIC_BASE_URL}/w/${wallets.id}`
function getDeep(obj, path) {
  return String(path || "").split(".").reduce((a,k)=> (a && a[k] != null ? a[k] : undefined), obj);
}
function evalCompute(expr, data, envVars = {}) {
  // allow `${...}` template literal or raw JS expression returning a string/number
  const src = String(expr || "");
  try {
    // expose data keys (wallets, wallet_movements, PUBLIC_BASE_URL, etc.)
    // eslint-disable-next-line no-new-func
    const fn = new Function("data", "env", `with(data){ with(env){ return ${src.startsWith("`") ? src : "`"+src+"`"} } }`);
    return fn(data, envVars);
  } catch { return ""; }
}
async function resolveVariables(env, mapping, data) {
  const out = [];
  const envVars = { PUBLIC_BASE_URL: (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "" };
  for (const v of (mapping?.vars || [])) {
    const src = (v?.source || "field").toLowerCase();
    const val = v?.value ?? "";
    let resolved = "";
    if (src === "field")   resolved = getDeep(data, String(val));
    else if (src === "static") resolved = val;
    else if (src === "compute") resolved = evalCompute(val, data, envVars);
    else resolved = "";
    if (resolved == null || resolved === "") resolved = v?.fallback ?? "";
    out.push(String(resolved ?? ""));
  }
  return out;
}

/* ------------------------------ public API ------------------------------ */
/** Generic text (session) */
export async function sendWhatsAppTextIfSession(env, to, text) {
  const { phone_id } = await getWAConfig(env);
  const msisdn = normMSISDN(to);
  if (!phone_id || !msisdn || !text) return false;
  await waFetch(env, `${phone_id}/messages`, {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "text",
    text: { preview_url: true, body: String(text || "") }
  });
  return true;
}
// alias some callers look for
export const sendWhatsAppText = sendWhatsAppTextIfSession;

/**
 * Low-level template sender (kept backward compatible).
 * Supports both:
 *   sendWhatsAppTemplate(env, to, fallbackText, lang, name, paramsArray)
 * and:
 *   sendWhatsAppTemplate(env, {to, name, language, variables})
 */
export async function sendWhatsAppTemplate(env, a, b, c, d, e) {
  let to, name, language, variables = [];
  // object form
  if (typeof a === "object" && a && a.to) {
    to        = a.to;
    name      = a.name;
    language  = a.language || "af";
    variables = Array.isArray(a.variables) ? a.variables : [];
  } else {
    // legacy positional form
    to        = a;
    name      = d;
    language  = c || "af";
    variables = Array.isArray(e) ? e : (Array.isArray(b) ? b : (b ? [b] : []));
  }

  const { phone_id, default_lang } = await getWAConfig(env);
  const msisdn = normMSISDN(to);
  if (!phone_id || !msisdn || !name) return false;

  const comps = variables.length
    ? [{ type: "body", parameters: variables.map(t => ({ type: "text", text: String(t ?? "") })) }]
    : [];

  await waFetch(env, `${phone_id}/messages`, {
    messaging_product: "whatsapp",
    to: msisdn,
    type: "template",
    template: {
      name,
      language: { code: language || default_lang || "af" },
      components: comps
    }
  });
  return true;
}

/** Mapping-aware sender used by cashbar etc. */
export async function sendTemplateByKey(env, { template_key, context, msisdn, data }) {
  const [name, language = "af"] = String(template_key).includes(":")
    ? String(template_key).split(":")
    : [String(template_key), "af"];

  const mapping = await readMapping(env, template_key, context);
  const variables = await resolveVariables(env, mapping, (data || {}));
  return await sendWhatsAppTemplate(env, { to: msisdn, name, language, variables });
}

// keep a named export some places referenced earlier
export const sendTemplateWithMapping = sendTemplateByKey;

/* ------------------------------ default ------------------------------ */
export default {
  sendWhatsAppTextIfSession,
  sendWhatsAppText,
  sendWhatsAppTemplate,
  sendTemplateByKey,
  sendTemplateWithMapping,
};
