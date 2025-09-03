// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";

/**
 * WhatsApp Webhook:
 * - GET = verification handshake
 * - POST = incoming messages (future use)
 */
export function mountWhatsApp(router) {
  // Verification handshake
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Verify token mismatch" }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  });

  // Incoming webhook (message events)
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    try {
      const body = await req.json();
      console.log("Incoming WhatsApp message:", body);

      // Just acknowledge for now
      return json({ ok: true });
    } catch (e) {
      return bad("Invalid JSON", 400);
    }
  });
}

/**
 * Debug endpoint: quickly check VERIFY_TOKEN value
 */
export function mountWhatsAppDebug(router) {
  router.add("GET", "/api/whatsapp/debug", async (_req, env) => {
    return json({
      ok: true,
      VERIFY_TOKEN: env.VERIFY_TOKEN || null,
      PHONE_NUMBER_ID: env.PHONE_NUMBER_ID || null,
      BUSINESS_ID: env.BUSINESS_ID || null,
    });
  });
}
