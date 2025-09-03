// /src/routes/whatsapp.js
import { json } from "../utils/http.js";

/** 🔧 Inline config (env can still override) */
const INLINE = {
  VERIFY_TOKEN: "vs-verify-2025",
  PHONE_NUMBER_ID: "780229961841826",
  BUSINESS_ID: "1266679118073583",
  WHATSAPP_TOKEN: "EAFdiPX1jF1cBPfRwH05ag1wB8L4kEFQVNe85KDq0vY7dyhZCd2XZAZCwMffVnjXmJwDtklMHUPEBIM7ZBiupaT9PuORBYv3fBle3omsFKWmtwJuO2AvdsNH8lumV7ZAqW0KlagJl0sPZAthK2KVCR4JogcpTjzBByC3ZAWLK0jPr0awZCgPUU4JYtOA50k8ZC9ZAd7WAZDZD",
  TEMPLATE_NAME: "hello_world",        // or your vinetotp when ready
  TEMPLATE_LANG: "en_US",               // or "af"
  PUBLIC_BASE_URL: "https://tickets.villiersdorpskou.co.za"
};

/** Merge env (if present) over inline values */
function cfg(env) {
  return {
    VERIFY_TOKEN: env.VERIFY_TOKEN || env.WA_VERIFY_TOKEN || INLINE.VERIFY_TOKEN,
    PHONE_NUMBER_ID: env.PHONE_NUMBER_ID || env.WA_PHONE_NUMBER_ID || INLINE.PHONE_NUMBER_ID,
    BUSINESS_ID: env.BUSINESS_ID || env.WA_BUSINESS_ID || INLINE.BUSINESS_ID,
    WHATSAPP_TOKEN: env.WHATSAPP_TOKEN || env.WA_ACCESS_TOKEN || INLINE.WHATSAPP_TOKEN,
    TEMPLATE_NAME: env.WHATSAPP_TEMPLATE_NAME || env.WA_TEMPLATE_NAME || INLINE.TEMPLATE_NAME,
    TEMPLATE_LANG: env.WHATSAPP_TEMPLATE_LANG || env.WA_TEMPLATE_LANG || INLINE.TEMPLATE_LANG,
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL || INLINE.PUBLIC_BASE_URL,
  };
}

export function mountWhatsApp(router) {
  // ---- Debug: confirm what the Worker sees
  router.add("GET", "/api/whatsapp/debug", async (_req, env) => {
    const c = cfg(env);
    return json({
      ok: true,
      VERIFY_TOKEN: c.VERIFY_TOKEN,
      PHONE_NUMBER_ID: c.PHONE_NUMBER_ID,
      BUSINESS_ID: c.BUSINESS_ID,
      WHATSAPP_TEMPLATE_NAME: c.TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANG: c.TEMPLATE_LANG,
      HAS_TOKEN: !!c.WHATSAPP_TOKEN,
      PUBLIC_BASE_URL: c.PUBLIC_BASE_URL
    });
  });

  // ---- Webhook verification (GET)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const c = cfg(env);
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const verify = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");

    if (mode === "subscribe" && challenge) {
      if (verify === c.VERIFY_TOKEN) {
        return new Response(String(challenge), {
          status: 200,
          headers: { "content-type": "text/plain" }
        });
      }
      return new Response(JSON.stringify({ ok:false, error:"Verify token mismatch" }), {
        status: 403, headers: { "content-type": "application/json" }
      });
    }
    return new Response("OK", { status: 200 });
  });

  // ---- Webhook events (POST) — keep simple for now
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    await req.text().catch(()=>null); // drain body
    return json({ ok: true });
  });
}
