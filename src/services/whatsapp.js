// /src/services/whatsapp.js

const GRAPH_VERSION = "v20.0";

function graphEndpoint(env) {
  if (!env.PHONE_NUMBER_ID) throw new Error("Missing PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${env.PHONE_NUMBER_ID}/messages`;
}

/** Low-level sender for a templated message with body + URL button param. */
export async function sendTicketTemplate(env, toMsisdn, {
  templateName,
  language,
  bodyParam1,        // e.g. buyer first name → maps to Body {{1}}
  urlSuffixParam1,   // e.g. short code → maps to URL button {{1}}
}) {
  const name = templateName || env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery";
  const lang = language || env.WHATSAPP_TEMPLATE_LANG || "af";

  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: String(bodyParam1 || "") }]
        },
        {
          // Button 0 must be configured in the template as "Visit Website" with URL ending /t/{{1}}
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: String(urlSuffixParam1 || "") }]
        }
      ]
    }
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
    throw new Error(`Graph ${r.status}: ${t}`);
  }
  return await r.json();
}

/** Legacy helpers (kept to avoid breaking imports elsewhere). */
export async function sendWhatsAppTemplate(env, toMsisdn, bodyText, lang) {
  const templateName = env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery";
  const language = lang || env.WHATSAPP_TEMPLATE_LANG || "af";
  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        { type: "body", parameters: [{ type: "text", text: String(bodyText ?? "") }] }
      ]
    }
  };
  const r = await fetch(graphEndpoint(env), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`WA template send failed (${r.status}): ${t}`);
  }
  return await r.json();
}

export async function sendWhatsAppTextIfSession(env, toMsisdn, bodyText) {
  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "text",
    text: { body: String(bodyText ?? "") },
  };
  const r = await fetch(graphEndpoint(env), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`WA text send failed (${r.status}): ${t}`);
  }
  return await r.json();
}

/**
 * High-level convenience used by POS/online flows:
 * Sends the `ticket_delivery` template to the buyer (or a fallback phone).
 * Expects order: { short_code, buyer_name?, buyer_phone? }
 */
export async function sendOrderOnWhatsApp(env, phoneFallback, order) {
  const code = String(order?.short_code || "").trim();
  if (!code) throw new Error("sendOrderOnWhatsApp: order.short_code missing");

  // Prefer buyer phone if present; else fallback (e.g. cashier phone or provided msisdn)
  const msisdn = String(order?.buyer_phone || phoneFallback || "").trim();
  if (!msisdn) throw new Error("sendOrderOnWhatsApp: no phone available");

  const firstName = String(order?.buyer_name || "").split(/\s+/)[0] || "Vriend";

  return await sendTicketTemplate(env, msisdn, {
    templateName: env.WHATSAPP_TEMPLATE_NAME || "ticket_delivery",
    language: env.WHATSAPP_TEMPLATE_LANG || "af",
    bodyParam1: firstName,
    urlSuffixParam1: code, // fills {{1}} in URL button → /t/{{1}}
  });
}
