// /src/services/whatsapp.js

// Minimal WhatsApp Cloud API sender for text + image links
// Docs: POST https://graph.facebook.com/v19.0/{phone_number_id}/messages

export async function sendWhatsAppText(env, toPhone, body) {
  const phone = normalizeMSISDN(toPhone);
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID || !phone) return { ok:false, skipped:true, reason:"missing-config-or-phone" };

  const url = `https://graph.facebook.com/v19.0/${env.WA_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.WA_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const j = await r.json().catch(()=> ({}));
  if (!r.ok) {
    // Don’t throw — log-like signal back to caller
    return { ok:false, status:r.status, error:j.error || j };
  }
  return { ok:true, id:(j.messages && j.messages[0]?.id) || null };
}

export async function sendWhatsAppImage(env, toPhone, imageUrl, caption="") {
  const phone = normalizeMSISDN(toPhone);
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID || !phone) return { ok:false, skipped:true, reason:"missing-config-or-phone" };

  const url = `https://graph.facebook.com/v19.0/${env.WA_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "image",
    image: { link: imageUrl, caption }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.WA_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const j = await r.json().catch(()=> ({}));
  if (!r.ok) return { ok:false, status:r.status, error:j.error || j };
  return { ok:true, id:(j.messages && j.messages[0]?.id) || null };
}

/**
 * High-level helper: send order confirmation + each ticket’s QR as images.
 * Expects: order { short_code, buyer_phone, buyer_name, id, event_id }, tickets: [ { qr, code?, id? } ]
 */
export async function sendOrderOnWhatsApp(env, order, tickets, event) {
  const to = order?.buyer_phone;
  if (!to) return { ok:false, skipped:true, reason:"no-phone" };

  const site = env.WA_SENDER_NAME || "Villiersdorp Skou";
  const base = env.PUBLIC_BASE_URL || "https://events.villiersdorpskou.co.za";
  const header = [
    `${site} — Bestelling bevestig`,
    `Bestel nommer: ${order.short_code}`,
    event?.name ? `Event: ${event.name}` : null
  ].filter(Boolean).join("\n");

  // 1) Send header text once
  await sendWhatsAppText(env, to, header);

  // 2) Send each ticket as QR image with caption
  //    We’ll use the public /t/:code link in the QR, so scanning opens the web ticket (and your scanner can also scan the image)
  for (const t of tickets || []) {
    // Determine ticket link. Prefer t.code if present; else use t.qr (unique string) as code.
    const code = t.code || t.qr;
    const ticketUrl = `${base}/t/${encodeURIComponent(code)}`;
    const qrUrl = `${(env.QR_CDN || "https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=")}${encodeURIComponent(ticketUrl)}`;
    const caption = `Kaartjie #${t.id || ""}\n${ticketUrl}`;
    await sendWhatsAppImage(env, to, qrUrl, caption);
  }

  // Optional footer
  await sendWhatsAppText(env, to, "Dankie! Hou hierdie boodskappe gereed vir skandering by die hek.");
  return { ok:true };
}

function normalizeMSISDN(s) {
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  // If it already starts with country code (e.g. 27 for South Africa), keep it
  if (digits.startsWith("27")) return digits;
  // If it starts with a leading 0 (local SA), convert to 27…
  if (digits.length === 10 && digits.startsWith("0")) return "27" + digits.slice(1);
  // Else return as-is; WhatsApp API will validate
  return digits;
}
