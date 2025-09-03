// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { sendWhatsAppTemplate, sendWhatsAppTextIfSession } from "../services/whatsapp.js";

/**
 * WhatsApp webhook + tiny test endpoints.
 *
 * REQUIRED env:
 *   VERIFY_TOKEN
 *   PHONE_NUMBER_ID
 *   WHATSAPP_TOKEN
 *
 * OPTIONAL env:
 *   WHATSAPP_TEMPLATE_NAME   (default "vinetotp")
 *   WHATSAPP_TEMPLATE_LANG   (default "en_US" — you set "af")
 *   WHATSAPP_BUTTON_URL      (if your template has a URL button w/ dynamic param)
 *   BUSINESS_ID              (not required to send, useful for debugging)
 */
export function mountWhatsApp(router) {
  // --- GET handshake (Meta verification) ---
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");

    // ✅ must match EXACTLY
    if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }

    // help yourself in logs
    console.log("WA VERIFY mismatch", {
      received: token,
      expected: env.VERIFY_TOKEN ? "[set]" : "[missing]",
    });

    return new Response(JSON.stringify({ ok: false, error: "Verify token mismatch" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  });

  // --- POST events (we just ACK for now) ---
  router.add("POST", "/api/whatsapp/webhook", async (req, _env) => {
    try {
      const body = await req.json();
      console.log("WA inbound:", body);
      // TODO: handle notifications if needed
      return json({ ok: true });
    } catch {
      return bad("Invalid JSON", 400);
    }
  });

  // --- Debug: inspect envs quickly ---
  router.add("GET", "/api/whatsapp/debug", async (_req, env) => {
    return json({
      ok: true,
      VERIFY_TOKEN: env.VERIFY_TOKEN || null,
      PHONE_NUMBER_ID: env.PHONE_NUMBER_ID || null,
      BUSINESS_ID: env.BUSINESS_ID || null,
      WHATSAPP_TEMPLATE_NAME: env.WHATSAPP_TEMPLATE_NAME || "vinetotp",
      WHATSAPP_TEMPLATE_LANG: env.WHATSAPP_TEMPLATE_LANG || "en_US",
      HAS_TOKEN: !!env.WHATSAPP_TOKEN,
    });
  });

  // --- Test send: TEMPLATE ---
  // body: { to: "2771....", text: "Your code ABC123", lang?: "af" }
  router.add("POST", "/api/whatsapp/test/template", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.to || !b?.text) return bad("to and text required");
    try {
      const r = await sendWhatsAppTemplate(env, b.to, b.text, b.lang);
      return json({ ok: true, result: r });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // --- Test send: TEXT (session) ---
  // body: { to: "2771....", text: "Hello" }
  router.add("POST", "/api/whatsapp/test/text", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.to || !b?.text) return bad("to and text required");
    try {
      const r = await sendWhatsAppTextIfSession(env, b.to, b.text);
      return json({ ok: true, result: r });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}
