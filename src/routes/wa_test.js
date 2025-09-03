// /src/routes/wa_test.js
// TEMPORARY WhatsApp test routes with inline credentials.
// ⚠️ Do not ship to production with these values hard-coded.

import { json } from "../utils/http.js";

// ---------- CHANGE THESE FOR YOUR TEST ----------
const TEST_VERIFY_TOKEN     = "vs-verify-2025";            // must exactly match what you enter in Meta UI
const TEST_PHONE_NUMBER_ID  = "780229961841826";            // your WA phone number id
const TEST_ACCESS_TOKEN     = "PASTE_YOUR_LONG_LIVED_TOKEN"; // Bearer token from Meta (temporary ok)
const TEST_TEMPLATE_NAME    = "hello_world";                // or your approved template
const TEST_TEMPLATE_LANG    = "en_US";                      // e.g. "af" or "en_US"
// ------------------------------------------------

export function mountWATest(router) {
  const base = "/wa-test";

  // 1) Health + config sanity
  router.add("GET", `${base}/debug`, async (_req) => {
    return json({
      ok: true,
      VERIFY_TOKEN: TEST_VERIFY_TOKEN,
      PHONE_NUMBER_ID: TEST_PHONE_NUMBER_ID,
      TEMPLATE: TEST_TEMPLATE_NAME,
      LANG: TEST_TEMPLATE_LANG,
      HAS_TOKEN: !!TEST_ACCESS_TOKEN,
    });
  });

  // 2) Webhook verification (Meta setup step)
  //    Point your app's callback to: https://<your-domain>/wa-test/webhook
  router.add("GET", `${base}/webhook`, async (req) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === TEST_VERIFY_TOKEN) {
      return new Response(challenge || "", { status: 200, headers: { "content-type": "text/plain" }});
    }
    return new Response(
      JSON.stringify({ ok: false, error: "Verify token mismatch" }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  });

  // 3) Webhook receiver (ACK quickly)
  router.add("POST", `${base}/webhook`, async (req) => {
    let body = null;
    try { body = await req.json(); } catch {}
    try {
      console.log("WA TEST webhook:", body ? {
        object: body.object,
        entries: body.entry?.length || 0,
        time: Date.now()
      } : { empty: true });
    } catch {}
    return new Response("OK", { status: 200 });
  });

  // 4) Quick-send helper to test outbound messages (no template variables)
  //    POST /wa-test/send { to: "27xxxxxxxxx", template?: "hello_world", lang?: "en_US", text?: "optional text" }
  //    If "text" is provided, we send a plain text message; else a template.
  router.add("POST", `${base}/send`, async (req) => {
    const b = await req.json().catch(() => null);
    if (!b?.to) return json({ ok:false, error:"Missing 'to' (MSISDN with country code)" }, 400);

    const endpoint = `https://graph.facebook.com/v22.0/${TEST_PHONE_NUMBER_ID}/messages`;
    const headers = {
      "Authorization": `Bearer ${TEST_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };

    let payload;
    if (b.text) {
      payload = {
        messaging_product: "whatsapp",
        to: String(b.to),
        type: "text",
        text: { body: String(b.text) }
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        to: String(b.to),
        type: "template",
        template: {
          name: b.template || TEST_TEMPLATE_NAME,
          language: { code: b.lang || TEST_TEMPLATE_LANG }
        }
      };
    }

    const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    const bodyText = await r.text();
    if (!r.ok) {
      return json({ ok:false, status:r.status, error: bodyText }, 500);
    }
    return json({ ok:true, status:r.status, response: safeJSON(bodyText) });
  });
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return s; } }
