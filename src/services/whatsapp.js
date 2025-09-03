// /src/services/whatsapp.js

const GRAPH_VERSION = "v20.0";

function graphEndpoint(env) {
  if (!env.PHONE_NUMBER_ID) throw new Error("Missing PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${env.PHONE_NUMBER_ID}/messages`;
}

/**
 * Send a TEMPLATE message.
 * - Template name: env.WHATSAPP_TEMPLATE_NAME (default: "vinetotp")
 * - Language: env.WHATSAPP_TEMPLATE_LANG (default: "en_US" — set to "af" in wrangler)
 * - If your template has a URL button, configure it in WhatsApp Manager; we pass a single
 *   parameter (usually the order code’s last 6 chars) to the URL button.
 */
export async function sendWhatsAppTemplate(env, toMsisdn, bodyText, lang) {
  const templateName = env.WHATSAPP_TEMPLATE_NAME || "vinetotp";
  const language = lang || env.WHATSAPP_TEMPLATE_LANG || "en_US";

  const components = [
    { type: "body", parameters: [{ type: "text", text: String(bodyText ?? "") }] },
  ];

  // If your template includes a URL button with {{1}}, pass a short token (code tail).
  if (env.WHATSAPP_BUTTON_URL) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(bodyText ?? "").slice(-6) }],
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "template",
    template: { name: templateName, language: { code: language }, components },
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
 * Send a session TEXT (only if a recent WA session exists).
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

/**
 * Convenience helper used by orders service.
 * Formats a short Afrikaans message and sends it via your template.
 *
 * @param {any} env         worker env
 * @param {string} msisdn   E.164 (e.g. "27718878933")
 * @param {object} order    { short_code, id, event_slug?, buyer_name?, total_cents? }
 */
export async function sendOrderOnWhatsApp(env, msisdn, order) {
  if (!msisdn) throw new Error("Missing msisdn");
  if (!order?.short_code) throw new Error("Missing order.short_code");

  // Render a compact message – the template’s {{1}} will receive the code (or tail).
  const code = order.short_code;
  const totalR = typeof order.total_cents === "number"
    ? (order.total_cents / 100).toFixed(2)
    : undefined;

  // Optional deep link for tickets (only relevant after payment/issue).
  const publicBase = env.PUBLIC_BASE_URL || "https://events.villiersdorpskou.co.za";
  const maybeTicketsLink = order.event_slug
    ? `${publicBase}/t/${code}`
    : `${publicBase}`;

  const lineTotal = totalR ? `\nTotaal: R${totalR}` : "";
  const body =
    `Bestelling geskep. Jou bestel nommer: ${code}.${lineTotal}\n` +
    `Wys dit by die hek om te betaal en jou kaartjies te ontvang.\n` +
    `${maybeTicketsLink}`;

  // Use template language from env (you set "af"); fallback to en_US
  const lang = env.WHATSAPP_TEMPLATE_LANG || "en_US";
  return await sendWhatsAppTemplate(env, msisdn, body, lang);
}
