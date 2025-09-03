// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";

/**
 * WhatsApp Cloud API Webhook routes
 * Business Manager config:
 *   - Callback URL: https://events.villiersdorpskou.co.za/api/whatsapp/webhook
 *   - Verify Token: (same as env WA_VERIFY_TOKEN)
 *
 * Wrangler:
 *   wrangler secret put WA_VERIFY_TOKEN
 *   wrangler secret put WA_ACCESS_TOKEN
 *
 * Vars in wrangler.toml:
 *   [vars]
 *   WA_PHONE_ID = "1xxxxxxxxxxxxxxx"
 *   WA_SENDER_NAME = "Villiersdorp Skou"
 *   PUBLIC_BASE_URL = "https://events.villiersdorpskou.co.za"
 *   QR_CDN = "https://api.qrserver.com/v1/create-qr-code/?size=512x512&data="
 */

export function mountWhatsApp(router) {
  // GET: verification handshake
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && challenge) {
      if ((env.WA_VERIFY_TOKEN || "") === token) {
        return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" }});
      }
      return bad("Verify token mismatch", 403);
    }
    return bad("Missing params", 400);
  });

  // POST: message/status notifications (we just 200 OK)
  router.add("POST", "/api/whatsapp/webhook", async (req /*, env */) => {
    // If you want to debug, uncomment to read:
    // const body = await req.text().catch(()=> "");
    // Optionally store to KV for 1h:
    // await env.EVENTS_KV.put(`wa:${Date.now()}`, body, { expirationTtl: 3600 });
    return json({ ok: true });
  });

  // Optional tiny test sender (remove for production)
  router.add("POST", "/api/whatsapp/test", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.to || !b?.text) return bad("to and text required");
    if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) return bad("WA config missing", 500);

    const url = `https://graph.facebook.com/v19.0/${env.WA_PHONE_ID}/messages`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: b.to,
        type: "text",
        text: { body: b.text }
      })
    });
    const j = await r.json().catch(()=>({}));
    return json({ ok: r.ok, status: r.status, resp: j });
  });
}
