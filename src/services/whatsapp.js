// /src/services/whatsapp.js

const GRAPH_VERSION = "v20.0";

/**
 * Build the WhatsApp Graph endpoint for this phone number id.
 */
function graphEndpoint(env) {
  if (!env.PHONE_NUMBER_ID) throw new Error("Missing PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${env.PHONE_NUMBER_ID}/messages`;
}

/**
 * Send a TEMPLATE message.
 * - Uses the template name from env.WHATSAPP_TEMPLATE_NAME (falls back to "vinetotp")
 * - Language code from env.WHATSAPP_TEMPLATE_LANG (falls back to "en_US")
 * - Optionally adds a URL button with dynamic suffix if env.WHATSAPP_BUTTON_URL is set.
 *
 * @param {any} env            worker env (for tokens/ids)
 * @param {string} toMsisdn    E.164 number (e.g., "27718878933")
 * @param {string} bodyText    text param injected into template body
 * @param {string} [lang]      override language (eg "af" or "en_US")
 * @param {string} [urlSuffix] optional dynamic part for a URL button
 */
export async function sendWhatsAppTemplate(env, toMsisdn, bodyText, lang) {
  const templateName = env.WHATSAPP_TEMPLATE_NAME || "vinetotp";
  const language = (lang || env.WHATSAPP_TEMPLATE_LANG || "en_US");

  const components = [
    {
      type: "body",
      parameters: [{ type: "text", text: String(bodyText ?? "") }],
    },
  ];

  // If you configured a URL button on the template and want a dynamic suffix,
  // provide WHATSAPP_BUTTON_URL in env. Meta expects only a *suffix* param for URL buttons.
  // Example template button: URL with {{1}} — we pass that single parameter below.
  if (env.WHATSAPP_BUTTON_URL) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(bodyText ?? "").slice(-6) }],
      // ^ If your template expects a specific code (eg order code), pass that in bodyText
      //   or adapt this to a second arg and inject it here.
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };

  const r = await fetch(graphEndpoint(env), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`WA template send failed (${r.status}): ${t}`);
  }
  return await r.json();
}

/**
 * Send a *session* TEXT message (only works if user has a recent WA session).
 *
 * @param {any} env          worker env (for tokens/ids)
 * @param {string} toMsisdn  E.164 number (e.g., "27718878933")
 * @param {string} bodyText  text to send
 */
export async function sendWhatsAppTextIfSession(env, toMsisdn, bodyText) {
  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "text",
    text: { body: String(bodyText ?? "") },
  };

  const r = await fetch(graphEndpoint(env), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`WA text send failed (${r.status}): ${t}`);
  }
  return await r.json();
}
