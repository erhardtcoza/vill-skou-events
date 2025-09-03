// /src/routes/whatsapp.js
import { json } from "../utils/http.js";

/**
 * Env names supported (both styles):
 *  - VERIFY TOKEN:   WA_VERIFY_TOKEN     | VERIFY_TOKEN
 *  - ACCESS TOKEN:   WA_ACCESS_TOKEN     | WHATSAPP_TOKEN
 *  - PHONE NUMBERID: WA_PHONE_ID         | PHONE_NUMBER_ID
 */

function resolveWAEnv(env) {
  return {
    VERIFY: (env.WA_VERIFY_TOKEN || env.VERIFY_TOKEN || "").trim(),
    ACCESS: (env.WA_ACCESS_TOKEN || env.WHATSAPP_TOKEN || "").trim(),
    PHONE_ID: (env.WA_PHONE_ID || env.PHONE_NUMBER_ID || "").trim(),
  };
}

export function mountWhatsApp(router) {
  // Meta verification (GET)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const { VERIFY } = resolveWAEnv(env);
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token") || "";
    const challenge = u.searchParams.get("hub.challenge") || "";

    if (mode === "subscribe" && token && token === VERIFY) {
      // Must echo the challenge string verbatim
      return new Response(challenge, { status: 200 });
    }
    return json({ ok: false, error: "Verify token mismatch" }, 403);
  });

  // Incoming webhook events (POST)
  router.add("POST", "/api/whatsapp/webhook", async (req, env, ctx) => {
    // We just acknowledge quickly; you can add processing later
    let body;
    try {
      body = await req.json();
    } catch {
      // Some providers ping with no JSON; just 200 OK
      return json({ ok: true });
    }

    // Optional: lightweight logging
    try {
      console.log("WA webhook:", JSON.stringify(body));
    } catch {}

    return json({ ok: true });
  });

  // Simple send-text endpoint you can call from the app to test delivery
  // POST /api/whatsapp/send  { to: "+27718878933", text: "hello" }
  router.add("POST", "/api/whatsapp/send", async (req, env) => {
    const { ACCESS, PHONE_ID } = resolveWAEnv(env);
    if (!ACCESS || !PHONE_ID) {
      return json({ ok: false, error: "WhatsApp credentials missing" }, 400);
    }
    const b = await req.json().catch(() => null);
    const to = (b?.to || "").trim();
    const text = (b?.text || "").trim();
    if (!to || !text) return json({ ok: false, error: "to and text required" }, 400);

    const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ ok: false, error: data?.error || data || res.statusText }, 502);
    }
    return json({ ok: true, data });
  });
}

/* Optional debug route (shows which env vars were picked up)
   GET /api/whatsapp/debug?hub.verify_token=VALUE
*/
export function mountWhatsAppDebug(router) {
  router.add("GET", "/api/whatsapp/debug", async (req, env) => {
    const { VERIFY, ACCESS, PHONE_ID } = resolveWAEnv(env);
    const u = new URL(req.url);
    const sent = (u.searchParams.get("hub.verify_token") || "").trim();
    const ok = sent && VERIFY && sent === VERIFY;
    return json({
      ok,
      note: "This endpoint is just for sanity-checking env resolution.",
      resolved: {
        VERIFY_present: Boolean(VERIFY),
        ACCESS_present: Boolean(ACCESS),
        PHONE_ID_present: Boolean(PHONE_ID),
      },
      sent_token_matches: ok,
    });
  });
}
