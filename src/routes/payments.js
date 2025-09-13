// src/router/payments.js
import { json, bad } from "../utils/http.js";

/** ------------------------------------------------------------------------
 * Shared helpers (settings + WhatsApp via Admin template selectors)
 * --------------------------------------------------------------------- */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function parseTpl(env, key /* e.g. 'WA_TMP_PAYMENT_CONFIRM' */) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}

async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;    // (env,to,body,lang,name?)
  const sendTxt = svc.sendWhatsAppTextIfSession || null;

  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) {
      await sendTpl(env, toMsisdn, fallbackText, lang, name);
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch { /* non-blocking */ }
}

async function sendTicketDelivery(env, toMsisdn, code) {
  if (!toMsisdn || !code) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTicketTemplate = svc.sendTicketTemplate || null;
  if (!sendTicketTemplate) return;

  // Use admin-chosen template/language for ticket delivery
  const sel = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
  const [tplName, lang] = String(sel || "").split(":");
  const language = (lang || "en_US").trim();
  const templateName = (tplName || "ticket_delivery").trim();

  const firstName =
    String(await getBuyerNameByCode(env, code)).split(/\s+/)[0] || "Vriend";

  await sendTicketTemplate(env, String(toMsisdn), {
    templateName,
    language,
    bodyParam1: firstName,    // {{1}} in body
    urlSuffixParam1: code,    // {{1}} in URL button → /t/{{1}}
  });
}

async function getBuyerNameByCode(env, code) {
  const row = await env.DB.prepare(
    `SELECT buyer_name FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
  ).bind(code).first();
  return row?.buyer_name || "";
}

/** ------------------------------------------------------------------------
 * Yoco integration helpers
 * --------------------------------------------------------------------- */
async function getYocoMode(env) {
  return (await getSetting(env, "YOCO_MODE")) || "sandbox";
}
async function getYocoCreds(env) {
  const mode = await getYocoMode(env);
  if (mode === "live") {
    return {
      mode,
      publicKey: (await getSetting(env, "YOCO_LIVE_PUBLIC_KEY")) || "",
      secretKey: (await getSetting(env, "YOCO_LIVE_SECRET_KEY")) || "",
    };
  }
  return {
    mode: "sandbox",
    publicKey: (await getSetting(env, "YOCO_TEST_PUBLIC_KEY")) || "",
    secretKey: (await getSetting(env, "YOCO_TEST_SECRET_KEY")) || "",
  };
}

/**
 * Strategy A (recommended zero-code):
 * Build a redirect URL from a template in Site Settings:
 *   YOCO_CHECKOUT_URL_TEMPLATE
 * Placeholders:
 *   {amount}    -> cents
 *   {amount_r}  -> rands, e.g. 123.45
 *   {code}      -> order short code
 *   {reference} -> same as short code
 *   {return}    -> absolute return URL (thanks page with ?next=/t/{code})
 */
function buildRedirectFromTemplate(template, { amountCents, code, returnUrl }) {
  const amountRand = (Number(amountCents || 0) / 100).toFixed(2);
  return template
    .replaceAll("{amount}", String(amountCents))
    .replaceAll("{amount_r}", String(amountRand))
    .replaceAll("{code}", String(code))
    .replaceAll("{reference}", String(code))
    .replaceAll("{return}", encodeURIComponent(returnUrl));
}

/**
 * Strategy B (server-to-server Payment Link):
 * Try creating a payment link via Yoco's API using your secret key.
 * If your account uses a different endpoint/path, set YOCO_PAYMENT_LINKS_URL.
 * Expected response shape: { url: "https://..." }  (accepts a few common keys)
 */
async function createYocoPaymentLink(env, { amountCents, code, returnUrl }) {
  const { secretKey } = await getYocoCreds(env);
  if (!secretKey) throw new Error("YOCO_LIVE_SECRET_KEY missing");

  const endpoint =
    (await getSetting(env, "YOCO_PAYMENT_LINKS_URL")) ||
    // Default guess (adjust in settings if your account differs)
    "https://payments.yoco.com/api/payment_links";

  const payload = {
    amount: Number(amountCents || 0),
    currency: "ZAR",
    reference: String(code),
    success_url: returnUrl,
    cancel_url: returnUrl,
    description: `Order ${code}`,
  };

  let res, data;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${secretKey}`
      },
      body: JSON.stringify(payload)
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    throw new Error("Network error creating Yoco payment link: " + (e?.message || e));
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error("Yoco payment link failed: " + msg);
  }

  const url =
    data?.url ||
    data?.redirect_url ||
    data?.payment_link ||
    data?.link ||
    null;

  if (!url) throw new Error("Yoco payment link response missing URL");
  return url;
}

/** Build absolute thanks return URL with auto-forward param to tickets page */
async function buildReturnUrl(env, code) {
  const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
  const next = `/t/${encodeURIComponent(code)}`;
  return `${base}/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(next)}`;
}

/** ------------------------------------------------------------------------
 * HMAC verification for the live return
 * sig = HMAC_SHA256( code + "." + amount + "." + ts ) using YOCO_RETURN_HMAC_SECRET
 * --------------------------------------------------------------------- */
async function hmacSha256Hex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyReturnSignature(env, code, amount, ts, sig) {
  const trust = (await getSetting(env, "YOCO_TRUST_RETURN")) === "1";
  if (trust) return true;
  const secret = await getSetting(env, "YOCO_RETURN_HMAC_SECRET");
  if (!secret) return false;
  if (!code || !amount || !ts || !sig) return false;

  // Optional freshness check (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - Number(ts || 0));
  if (skew > 300) return false;

  const payload = `${String(code)}.${String(amount)}.${String(ts)}`;
  const expected = await hmacSha256Hex(secret, payload);
  // Constant-time-ish compare
  if (expected.length !== String(sig).length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ String(sig).charCodeAt(i);
  }
  return ok === 0;
}

/** ------------------------------------------------------------------------
 * Mark order PAID + record payment + send WhatsApps
 * --------------------------------------------------------------------- */
async function markPaidAndNotify(env, { orderId, code, buyerPhone, totalCents, method = "online_yoco" }) {
  const now = Math.floor(Date.now() / 1000);

  // Update order (idempotent-ish)
  await env.DB.prepare(
    `UPDATE orders SET status='paid', paid_at=?1, updated_at=?1 WHERE id=?2`
  ).bind(now, orderId).run();

  // Insert payment row (approved)
  await env.DB.prepare(
    `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'approved', ?4, ?4)`
  ).bind(orderId, Number(totalCents || 0), method, now).run();

  // WhatsApp: Payment confirmation
  try {
    const msg = `Betaling ontvang vir bestelling ${code}. Dankie! 🎉`;
    if (buyerPhone) {
      await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(buyerPhone), msg);
    }
  } catch {}

  // WhatsApp: Ticket delivery (template with URL button)
  try {
    if (buyerPhone) {
      await sendTicketDelivery(env, String(buyerPhone), code);
    }
  } catch {}
}

/** ------------------------------------------------------------------------
 * Payments routes
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  // 1) Create payment intent → return redirect URL based on YOCO_MODE + settings
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // Load order
    const o = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, total_cents, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    const mode = await getYocoMode(env);
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
    const returnUrl = await buildReturnUrl(env, code);

    if (mode !== "live") {
      // --- SANDBOX: use internal simulator ---
      const redirect = `${base || ""}/payments/yoco/simulate?code=${encodeURIComponent(code)}`;
      return json({ ok: true, redirect_url: redirect, yoco: { redirectUrl: redirect } });
    }

    // --- LIVE: Strategy A → URL template if present
    const template = await getSetting(env, "YOCO_CHECKOUT_URL_TEMPLATE");
    if (template) {
      try {
        const redirect = buildRedirectFromTemplate(template, {
          amountCents: Number(o.total_cents || 0),
          code,
          returnUrl
        });
        return json({ ok: true, redirect_url: redirect, yoco: { redirectUrl: redirect } });
      } catch (e) {
        return bad("Failed to build checkout URL from template: " + (e?.message || e), 500);
      }
    }

    // --- LIVE: Strategy B → Create payment link via API
    try {
      const payUrl = await createYocoPaymentLink(env, {
        amountCents: Number(o.total_cents || 0),
        code,
        returnUrl
      });
      return json({ ok: true, redirect_url: payUrl, yoco: { redirectUrl: payUrl } });
    } catch (e) {
      return bad(String(e?.message || e), 502);
    }
  });

  // 2) Sandbox simulator: mark order PAID, record payment, send WA, redirect to thanks
  router.add("GET", "/payments/yoco/simulate", async (req, env) => {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return new Response("code required", { status: 400 });

    const row = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, total_cents
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();

    if (!row) return new Response("order not found", { status: 404 });

    await markPaidAndNotify(env, {
      orderId: row.id,
      code,
      buyerPhone: row.buyer_phone,
      totalCents: row.total_cents,
      method: "online_yoco",
    });

    const next = `/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(`/t/${code}`)}`;
    return new Response(null, { status: 302, headers: { Location: next } });
  });

  // 3) LIVE return endpoint with signature verification
  // Example return: /payments/yoco/return?code=CAXHIEG&amount=12345&status=success&ts=1736358892&sig=abcdef...
  router.add("GET", "/payments/yoco/return", async (req, env) => {
    const url = new URL(req.url);
    const code   = String(url.searchParams.get("code") || "").trim().toUpperCase();
    const amount = String(url.searchParams.get("amount") || "").trim(); // cents
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const ts     = String(url.searchParams.get("ts") || "").trim();
    const sig    = String(url.searchParams.get("sig") || "").trim();

    if (!code) return new Response("code required", { status: 400 });

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
    const thanksUrl = `${base}/thanks/${encodeURIComponent(code)}`;
    const forwardTo = `${thanksUrl}?next=${encodeURIComponent(`/t/${code}`)}`;

    // Load order
    const o = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, total_cents, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return new Response("order not found", { status: 404 });

    // Only proceed if status indicates success
    if (status === "success") {
      const ok = await verifyReturnSignature(env, code, amount || String(o.total_cents || 0), ts, sig);
      if (ok) {
        // Optional: ensure amount matches order total (defensive)
        const cents = Number(amount || 0);
        if (!Number.isFinite(cents) || cents <= 0 || cents !== Number(o.total_cents || 0)) {
          // Amount mismatch → do not mark paid, just send to thanks (it will poll)
          return new Response(null, { status: 302, headers: { Location: thanksUrl } });
        }

        // Idempotent mark-paid + notify
        await markPaidAndNotify(env, {
          orderId: o.id,
          code,
          buyerPhone: o.buyer_phone,
          totalCents: o.total_cents,
          method: "online_yoco",
        });

        return new Response(null, { status: 302, headers: { Location: forwardTo } });
      }
      // Signature invalid → fall through to thanks (polling)
    }

    // For failed/invalid signatures: no state change; thanks page will poll
    return new Response(null, { status: 302, headers: { Location: thanksUrl } });
  });
}