// /src/routes/whatsapp.js
import { json } from "../utils/http.js";

/** Normalize env so we support both the new names and the older WA_* names. */
function whatsappCfg(env) {
  return {
    VERIFY_TOKEN: env.VERIFY_TOKEN || env.WA_VERIFY_TOKEN || null,
    PHONE_NUMBER_ID: env.PHONE_NUMBER_ID || env.WA_PHONE_NUMBER_ID || null,
    BUSINESS_ID: env.BUSINESS_ID || env.WA_BUSINESS_ID || null,
    WHATSAPP_TOKEN: env.WHATSAPP_TOKEN || env.WA_ACCESS_TOKEN || null,
    TEMPLATE_NAME:
      env.WHATSAPP_TEMPLATE_NAME || env.WA_TEMPLATE_NAME || "hello_world",
    TEMPLATE_LANG:
      env.WHATSAPP_TEMPLATE_LANG || env.WA_TEMPLATE_LANG || "en_US",
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL || null,
  };
}

export function mountWhatsApp(router) {
  // ---- Debug: show which vars the worker actually sees
  router.add("GET", "/api/whatsapp/debug", async (_req, env) => {
    const cfg = whatsappCfg(env);
    return json({
      ok: true,
      VERIFY_TOKEN: cfg.VERIFY_TOKEN,
      PHONE_NUMBER_ID: cfg.PHONE_NUMBER_ID,
      BUSINESS_ID: cfg.BUSINESS_ID,
      WHATSAPP_TEMPLATE_NAME: cfg.TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANG: cfg.TEMPLATE_LANG,
      HAS_TOKEN: !!cfg.WHATSAPP_TOKEN,
      PUBLIC_BASE_URL: cfg.PUBLIC_BASE_URL,
    });
  });

  // ---- Webhook verification (GET)
  // Meta/Facebook will send:
  //   ?hub.mode=subscribe&hub.challenge=...&hub.verify_token=YOUR_TOKEN
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const verify = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const { VERIFY_TOKEN } = whatsappCfg(env);

    if (mode === "subscribe" && challenge) {
      if (verify && VERIFY_TOKEN && verify === VERIFY_TOKEN) {
        return new Response(String(challenge), {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response(
        JSON.stringify({ ok: false, error: "Verify token mismatch" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("OK", { status: 200 });
  });

  // ---- Webhook events (POST)
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    const body = await req.json().catch(() => null);
    // Keep this lightweight; you can expand to handle messages/status later.
    // For now we just 200 so Meta considers the delivery successful.
    // Optional: log a tiny breadcrumb
    try {
      env?.LOG?.info?.("wa_event", { sample: body?.entry?.[0]?.changes?.[0]?.field || "messages" });
    } catch {}
    return json({ ok: true });
  });
}
