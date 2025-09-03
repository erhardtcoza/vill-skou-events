// /src/services/whatsapp.js

// You were on v20.0 originally. v22.0 also works; keep v20.0 if you prefer.
const GRAPH_VERSION = "v20.0";

function graphEndpoint(env) {
  if (!env.PHONE_NUMBER_ID) throw new Error("Missing PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${env.PHONE_NUMBER_ID}/messages`;
}

/**
 * Low-level POST helper
 */
async function postToWA(env, payload) {
  const r = await fetch(graphEndpoint(env), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text().catch(() => "");
  let data = null;
  try { data = JSON.parse(text); } catch { /* text stays raw */ }

  if (!r.ok) throw new Error(`WA send failed (${r.status}): ${text}`);
  return data ?? text;
}

/**
 * Send a TEMPLATE message.
 * - Template name: env.WHATSAPP_TEMPLATE_NAME (default: "vinetotp")
 * - Language: env.WHATSAPP_TEMPLATE_LANG (default: "en_US" — set to "af" in wrangler)
 * - Pass the string you want in the *body* as bodyText.
 * - If env.WHATSAPP_BUTTON_URL exists AND your template has a URL button {{1}},
 *   we’ll populate {{1}} with either:
 *     • options.urlParam (if provided), or
 *     • last 6 chars of bodyText (legacy behavior)
 *
 * Extra: you may pass `options.components` if you need full control.
 */
export async function sendWhatsAppTemplate(env, toMsisdn, bodyText, lang, options = {}) {
  const templateName = env.WHATSAPP_TEMPLATE_NAME || "vinetotp";
  const language = lang || env.WHATSAPP_TEMPLATE_LANG || "en_US";

  let components = options.components;
  if (!components) {
    components = [
      { type: "body", parameters: [{ type: "text", text: String(bodyText ?? "") }] },
    ];
    if (env.WHATSAPP_BUTTON_URL) {
      const urlParam = options.urlParam ?? String(bodyText ?? "").slice(-6);
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: String(urlParam) }],
      });
    }
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "template",
    template: { name: templateName, language: { code: language }, components },
  };

  return postToWA(env, payload);
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
  return postToWA(env, payload);
}

/**
 * Send a single IMAGE (publicly reachable URL).
 * Usage: await sendWhatsAppImage(env, "2771...", "https://.../ticket.png", "Your ticket");
 */
export async function sendWhatsAppImage(env, toMsisdn, imageUrl, caption = "") {
  const payload = {
    messaging_product: "whatsapp",
    to: toMsisdn,
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  };
  return postToWA(env, payload);
}

/**
 * Convenience helper used by orders service.
 * Formats a short Afrikaans message and sends it via your template.
 *
 * @param {any} env         worker env
 * @param {string} msisdn   E.164 (e.g. "27718878933")
 * @param {object} order    { short_code, id, event_slug?, buyer_name?, total_cents? }
 * @param {object} options  Optional:
 *   - link: override deep-link used in the template button
 *   - templateName / lang: override template & language
 *   - imageUrls: array of PNG/JPG URLs to also send (one by one)
 */
export async function sendOrderOnWhatsApp(env, msisdn, order, options = {}) {
  if (!msisdn) throw new Error("Missing msisdn");
  if (!order?.short_code) throw new Error("Missing order.short_code");

  const code = order.short_code;
  const totalR = typeof order.total_cents === "number"
    ? (order.total_cents / 100).toFixed(2)
    : undefined;

  const publicBase = env.PUBLIC_BASE_URL || "https://events.villiersdorpskou.co.za";
  const defaultLink = order.event_slug
    ? `${publicBase}/t/${code}`
    : `${publicBase}`;

  const link = options.link || defaultLink;

  const lineTotal = totalR ? `\nTotaal: R${totalR}` : "";
  const body =
    `Bestelling geskep. Jou bestel nommer: ${code}.${lineTotal}\n` +
    `Wys dit by die hek om te betaal en jou kaartjies te ontvang.\n` +
    `${link}`;

  const lang = options.lang || env.WHATSAPP_TEMPLATE_LANG || "en_US";
  const templateName = options.templateName || (env.WHATSAPP_TEMPLATE_NAME || "vinetotp");

  // Populate the template and set the URL button param to the *full link*
  const res = await sendWhatsAppTemplate(env, msisdn, body, lang, {
    urlParam: link,
    // If your template uses a different structure, you can pass components here instead.
  });

  // Optionally send images (if you have per-ticket PNG/JPG links)
  const sentImages = [];
  if (Array.isArray(options.imageUrls) && options.imageUrls.length) {
    for (const u of options.imageUrls.slice(0, 10)) {
      // Be conservative with count; WA rate-limits media.
      try {
        sentImages.push(await sendWhatsAppImage(env, msisdn, u, "Jou kaartjie"));
      } catch (e) {
        // Don’t break the flow if one image fails
        console.log("WA image send failed:", e.message || e);
      }
    }
  }

  return { ok: true, template: res, images: sentImages };
}
