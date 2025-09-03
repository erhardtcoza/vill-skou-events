// /src/routes/whatsapp.js
import { json } from "../utils/http.js";

/**
 * ENV expected (names are flexible; this module tolerates common variants):
 * - VERIFY_TOKEN                (or WA_VERIFY_TOKEN / WHATSAPP_VERIFY_TOKEN)
 * - WHATSAPP_TOKEN             (long-lived EA... token, store as secret)
 * - PHONE_NUMBER_ID            (from your WA Business)
 * - PUBLIC_BASE_URL            (e.g. https://tickets.villiersdorpskou.co.za)
 * - QR_CDN                     (e.g. https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=)
 * - APP_NAME (optional)
 */

function getVerifyToken(env) {
  return (
    env.VERIFY_TOKEN ||
    env.WA_VERIFY_TOKEN ||
    env.WHATSAPP_VERIFY_TOKEN ||
    ""
  );
}

function ticketLink(env, code) {
  const base = env.PUBLIC_BASE_URL || "https://events.villiersdorpskou.co.za";
  return `${base}/t/${encodeURIComponent(code)}`;
}

function qrUrl(env, code) {
  const cdn =
    env.QR_CDN ||
    "https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=";
  return cdn + encodeURIComponent(ticketLink(env, code));
}

async function waFetch(env, path, body) {
  const token = env.WHATSAPP_TOKEN || env.WA_ACCESS_TOKEN || "";
  if (!token) throw new Error("Missing WHATSAPP_TOKEN secret");
  const url = `https://graph.facebook.com/v20.0${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export function mountWhatsApp(router) {
  // --- 1) Verification handshake (GET) ---
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode") || u.searchParams.get("mode");
    const token =
      u.searchParams.get("hub.verify_token") ||
      u.searchParams.get("verify_token") ||
      "";
    const challenge =
      u.searchParams.get("hub.challenge") || u.searchParams.get("challenge");
    const expected = getVerifyToken(env);

    // Only the subscribe handshake should reach here
    if (mode === "subscribe" && challenge) {
      if (expected && token === expected) {
        // success: echo the challenge as plain text
        return new Response(challenge, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      // Helpful log (visible in Workers logs)
      console.log(
        "[WA] verify mismatch",
        JSON.stringify({ expected_set: !!expected, got: token }, null, 2)
      );
      return new Response(
        JSON.stringify({ ok: false, error: "Verify token mismatch" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    // Non-subscribe GETs: just 200 OK to be tidy
    return new Response("ok", { status: 200 });
  });

  // --- 2) Webhook events (POST) ---
  router.add("POST", "/api/whatsapp/webhook", async (req, _env) => {
    // NOTE: signature validation optional; for now we just ack and optionally log
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response("bad request", { status: 400 });
    }

    // Minimal processing: ack to Meta fast
    // (You can add message routing later; body.entry[0].changes[0].value.messages[…])
    // console.log("[WA] inbound", JSON.stringify(body));

    return new Response("EVENT_RECEIVED", { status: 200 });
  });

  // --- 3) Test send (simple text) ---
  // curl -X POST https://events.villiersdorpskou.co.za/api/whatsapp/send \
  //   -H 'content-type: application/json' \
  //   -d '{"to":"+27XXXXXXXXX","text":"Test from VS Tickets"}'
  router.add("POST", "/api/whatsapp/send", async (req, env) => {
    const b = await req.json().catch(() => null);
    const to = b?.to;
    const text = b?.text || `Hello from ${env.APP_NAME || "VS Tickets"} 👋`;
    const phoneId = env.PHONE_NUMBER_ID;
    if (!to || !phoneId) {
      return json({ ok: false, error: "to and PHONE_NUMBER_ID required" }, 400);
    }
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };
    const out = await waFetch(env, `/${phoneId}/messages`, payload);
    return json({ ok: true, result: out });
  });

  // --- 4) (Optional) Build & send ticket message with QR preview ---
  // curl -X POST https://events.villiersdorpskou.co.za/api/whatsapp/send-ticket \
  //   -H 'content-type: application/json' \
