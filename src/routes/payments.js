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
 * Expected response shape: { url: "https://..." }  (or similar; we accept several keys)
 */
async function createYocoPaymentLink(env, { amountCents, code, returnUrl }) {
  const { secretKey } = await getYocoCreds(env);
  if (!secretKey) throw new Error("YOCO_LIVE_SECRET_KEY missing");

  const endpoint =
    (await getSetting(env, "YOCO_PAYMENT_LINKS_URL")) ||
    // Default guess (adjust in settings if your account differs)
    "https://payments.yoco.com/api/payment_links";

  // Common payload shape used by many payment-link providers
  const payload = {
    amount: Number(amountCents || 0),
    currency: "ZAR",
    reference: String(code),
    success_url: returnUrl,
    cancel_url: returnUrl, // safe fallback
    // You can add line items/description if your account supports it
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

  // Tolerate a few common field names
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

  // 2) Sandbox simulator: mark order PAID, record payment, send WA messages, redirect to thanks
  router.add("GET", "/payments/yoco/simulate", async (req, env) => {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return new Response("code required", { status: 400 });

    const now = Math.floor(Date.now()/1000);
    const row = await env.DB.prepare(
      `SELECT id, short_code, buyer_phone, total_cents
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();

    if (!row) return new Response("order not found", { status: 404 });

    // Mark paid (idempotent-ish)
    await env.DB.prepare(
      `UPDATE orders SET status='paid', paid_at=?1, updated_at=?1 WHERE id=?2`
    ).bind(now, row.id).run();

    // Record payment (approved)
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3)`
    ).bind(row.id, Number(row.total_cents || 0), now).run();

    // WhatsApp: Payment confirmation
    try {
      const msg = `Betaling ontvang vir bestelling ${code}. Dankie! 🎉`;
      if (row.buyer_phone) {
        await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(row.buyer_phone), msg);
      }
    } catch {}

    // WhatsApp: Ticket delivery (template with URL button)
    try {
      if (row.buyer_phone) {
        await sendTicketDelivery(env, String(row.buyer_phone), code);
      }
    } catch {}

    const next = `/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(`/t/${code}`)}`;
    return new Response(null, { status: 302, headers: { Location: next } });
  });
}