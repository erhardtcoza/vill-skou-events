// /src/routes/whatsapp.js
import { json } from "../utils/http.js";

/**
 * WhatsApp webhook + debug routes
 * Required vars (wrangler.toml or Dashboard "Variables and Secrets"):
 *   VERIFY_TOKEN              (plaintext; must match what you enter in Meta UI)
 *   WHATSAPP_TOKEN            (secret; long-lived access token from Meta)
 *   PHONE_NUMBER_ID           (plaintext; WA phone number id)
 *   BUSINESS_ID               (plaintext; business id)
 *   WHATSAPP_TEMPLATE_NAME    (optional; default 'vinetotp' or your own)
 *   WHATSAPP_TEMPLATE_LANG    (optional; default 'en_US' or your locale, e.g. 'af')
 */
export function mountWhatsApp(router) {
  // ---- 1) Webhook verification (Meta calls GET once during setup)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");

    // IMPORTANT: must echo the challenge *exactly* on success
    if (mode === "subscribe" && token === (env.VERIFY_TOKEN || "")) {
      return new Response(challenge || "", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response(
      JSON.stringify({ ok: false, error: "Verify token mismatch" }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  });

  // ---- 2) Webhook receiver (Meta POSTs messages & status updates here)
  router.add("POST", "/api/whatsapp/webhook", async (req, env, ctx) => {
    // Meta requires a 200 within 10s. Do minimal work here.
    let body = null;
    try {
      body = await req.json();
    } catch {
      // If not JSON, still 200 to avoid retries; log it for inspection.
    }

    // Best-effort logging (Cloudflare Workers Logs)
    try {
      // Avoid logging tokens or PII; keep the top-level shape only.
      const summary = body && body.entry ? {
        object: body.object,
        entries: body.entry?.length || 0,
        time: Date.now()
      } : { empty: true, time: Date.now() };
      console.log("WA webhook event:", summary);
    } catch { /* ignore */ }

    // If you later want to process messages:
    // - Iterate body.entry[].changes[].value.messages[] etc.
    // - Hand off to a queue or Durable Object if doing heavier work.
    return new Response("OK", { status: 200 });
  });

  // ---- 3) Debug endpoint to confirm variables are wired
  router.add("GET", "/api/whatsapp/debug", async (_req, env) => {
    const mask = (v) => (v ? String(v) : null);
    return json({
      ok: true,
      // Show plainly so you can match with the Meta UI during setup.
      VERIFY_TOKEN: env.VERIFY_TOKEN ?? null,
      PHONE_NUMBER_ID: env.PHONE_NUMBER_ID ?? null,
      BUSINESS_ID: env.BUSINESS_ID ?? null,
      WHATSAPP_TEMPLATE_NAME: env.WHATSAPP_TEMPLATE_NAME || "vinetotp",
      WHATSAPP_TEMPLATE_LANG: env.WHATSAPP_TEMPLATE_LANG || "en_US",
      HAS_TOKEN: !!env.WHATSAPP_TOKEN, // don't print the secret
      PUBLIC_BASE_URL: mask(env.PUBLIC_BASE_URL),
    });
  });
}
