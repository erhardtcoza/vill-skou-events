// /src/routes/whatsapp.js
import { json } from "../utils/http.js";

/**
 * WhatsApp Cloud API webhook + helpers
 *
 * Required env:
 *   WA_VERIFY_TOKEN   - your verify token (set in Meta + as a Worker secret)
 *   WA_ACCESS_TOKEN   - permanent access token or app token with required perms
 *   WA_PHONE_ID       - WhatsApp Business Phone Number ID
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/* ------------------------------ Helpers ---------------------------------- */

function ok(text = "OK", status = 200, headers = {}) {
  return new Response(text, { status, headers });
}

// Be defensive on JSON parsing
async function safeJSON(req) {
  try { return await req.json(); } catch { return null; }
}

function first(arr) { return Array.isArray(arr) && arr.length ? arr[0] : undefined; }

function extractIncomingMessage(body) {
  // Shape: { entry:[{ changes:[{ value:{ messages:[{...}], contacts:[{...}] } }] }] }
  const entry = first(body?.entry);
  const change = first(entry?.changes);
  const value = change?.value || {};
  const msg = first(value.messages) || null;
  const contact = first(value.contacts) || null;

  if (!msg) return null;

  return {
    from: msg.from,                         // phone in international format
    name: contact?.profile?.name || "",
    type: msg.type,
    text: msg.text?.body || "",
    id: msg.id,
    timestamp: msg.timestamp,
    raw: msg,
    metadata: value.metadata || {}
  };
}

function bearer(env) {
  const t = (env.WA_ACCESS_TOKEN || "").trim();
  if (!t) throw new Error("WA_ACCESS_TOKEN missing");
  return `Bearer ${t}`;
}

async function waSendJSON(env, payload) {
  const phoneId = (env.WA_PHONE_ID || "").trim();
  if (!phoneId) throw new Error("WA_PHONE_ID missing");
  const url = `${GRAPH_BASE}/${encodeURIComponent(phoneId)}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": bearer(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WA send failed ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function sendWhatsAppText(env, toPhone, text) {
  const payload = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "text",
    text: { preview_url: true, body: text }
  };
  return waSendJSON(env, payload);
}

export async function sendWhatsAppImage(env, toPhone, imageUrl, caption = "") {
  const payload = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "image",
    image: { link: imageUrl, caption }
  };
  return waSendJSON(env, payload);
}

/* ------------------------------- Router ---------------------------------- */

export function mountWhatsApp(router) {
  // Verification handshake (GET)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = (u.searchParams.get("hub.mode") || "").trim();
    const token = (u.searchParams.get("hub.verify_token") || "").trim();
    const challenge = (u.searchParams.get("hub.challenge") || "").trim();
    const expected = (env.WA_VERIFY_TOKEN || "").trim();

    if (mode === "subscribe" && token && expected && token === expected) {
      // Respond with the challenge as plain text
      return ok(challenge || "OK", 200, { "content-type": "text/plain" });
    }
    // Explicit 403 so Meta shows “verify token mismatch”
    return json({ ok: false, error: "Verify token mismatch" }, 403);
  });

  // Webhook receiver (POST)
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    const body = await safeJSON(req);
    if (!body) return ok(); // 200 empty to satisfy webhook even if body was empty

    // Handle statuses (delivery/read) quietly
    // You can extend here if you want to record delivery confirmations
    // const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses;

    // Handle incoming user messages
    const incoming = extractIncomingMessage(body);
    if (incoming) {
      // Simple auto-responder example:
      // If they send "help" or "hi", reply with a canned message
      const txt = (incoming.text || "").trim().toLowerCase();
      try {
        if (txt === "hi" || txt === "help") {
          await sendWhatsAppText(
            env,
            incoming.from,
            "Hallo! Stuur jou bestel-nommer (bv. ABC123) of tik 'tickets' vir hulp."
          );
        } else if (/^[a-z0-9]{5,8}$/i.test(txt)) {
          // Looks like an order code – ack it (your POS/fulfillment can hook in later)
          await sendWhatsAppText(
            env,
            incoming.from,
            `Dankie! Ons het jou kode *${incoming.text}* ontvang. Ons verwerk dit nou.`
          );
        }
      } catch (e) {
        // Swallow errors – webhook MUST return 200
        // console.error("WA auto-reply error", e);
      }
    }

    // Always 200 quickly; Meta expects fast ACK
    return ok();
  });

  // Debug endpoint: compare query token vs worker secret (don’t expose in prod)
  router.add("GET", "/api/whatsapp/debug", async (req, env) => {
    const u = new URL(req.url);
    const q = (u.searchParams.get("hub.verify_token") || "").trim();
    const s = (env.WA_VERIFY_TOKEN || "").trim();
    return json({
      seen_query_token: q ? `${q[0]}***${q[q.length - 1]} (${q.length})` : "(empty)",
      worker_secret_token: s ? `${s[0]}***${s[s.length - 1]} (${s.length})` : "(empty)",
      equal: q && s ? q === s : false
    });
  });

  // Test sender: ?to=27718878933&text=Hello  (guard this if needed)
  router.add("GET", "/api/whatsapp/test-send", async (req, env) => {
    const u = new URL(req.url);
    const to = (u.searchParams.get("to") || "").trim();
    const text = (u.searchParams.get("text") || "Test from Worker").slice(0, 1000);
    if (!to) return json({ ok: false, error: "Missing ?to=MSISDN" }, 400);

    try {
      const res = await sendWhatsAppText(env, to, text);
      return json({ ok: true, res });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });
}
