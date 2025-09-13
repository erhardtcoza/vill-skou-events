// src/routes/payments.js
import { json, bad } from "../utils/http.js";

/* ------------------------------------------------------------------------
   Shared helpers (settings + WhatsApp via Admin template selectors)
------------------------------------------------------------------------- */
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
  const sendTpl = svc.sendWhatsAppTemplate || null;   // (env,to,body,lang, name?)
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

/* ------------------------------------------------------------------------
   Yoco wiring
------------------------------------------------------------------------- */
async function readYocoSettings(env) {
  const keys = [
    "YOCO_MODE",
    "YOCO_TEST_PUBLIC_KEY", "YOCO_TEST_SECRET_KEY",
    "YOCO_LIVE_PUBLIC_KEY", "YOCO_LIVE_SECRET_KEY",
    "PUBLIC_BASE_URL"
  ];
  const out = {};
  for (const k of keys) out[k] = await getSetting(env, k);
  return out;
}

function yocoSecretsFromSettings(s) {
  const mode = String(s.YOCO_MODE || "sandbox").toLowerCase();
  const isLive = mode === "live";
  const secret = isLive
    ? (s.YOCO_LIVE_SECRET_KEY || s.YOCO_SECRET_KEY || "")
    : (s.YOCO_TEST_SECRET_KEY || s.YOCO_SECRET_KEY || "");
  return { isLive, secret };
}

function yocoCheckoutEndpoint() {
  return "https://payments.yoco.com/api/checkouts";
}

async function recordInitiated(env, order_id, amount_cents) {
  const ts = Math.floor(Date.now()/1000);
  try {
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, 'online_yoco', 'initiated', ?3, ?3)`
    ).bind(order_id, amount_cents, ts).run();
  } catch {}
}

async function settlePaid(env, order, yocoMeta /* object */) {
  const ts = Math.floor(Date.now()/1000);

  // idempotent
  const cur = await env.DB.prepare(
    `SELECT status FROM orders WHERE id=?1 LIMIT 1`
  ).bind(order.id).first();
  if (!cur) return;
  if ((cur.status || "").toLowerCase() === "paid") return;

  await env.DB.prepare(
    `UPDATE orders SET status='paid', paid_at=?1, updated_at=?1 WHERE id=?2`
  ).bind(ts, order.id).run();

  try {
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at, reference)
       VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3, ?4)`
    ).bind(order.id, order.total_cents || 0, ts, String(yocoMeta?.id || yocoMeta?.reference || "")).run();
  } catch {}
}

/* ------------------------------------------------------------------------
   Router
------------------------------------------------------------------------- */
export function mountPayments(router) {
  /* Create Yoco hosted-checkout session */
  // Body: { code: "CAXXXX" }
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, total_cents, buyer_name, buyer_phone
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    const st = (o.status || "").toLowerCase();
    if (!(st === "awaiting_payment" || st === "pending")) {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
      return json({ ok:true, redirect_url: `${base}/t/${encodeURIComponent(o.short_code)}` });
    }

    const settings = await readYocoSettings(env);
    const { secret } = yocoSecretsFromSettings(settings);
    if (!secret) return bad("Yoco secret key not configured", 400);

    const base = settings.PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || "";
    const successUrl = base
      ? `${base}/thanks/${encodeURIComponent(o.short_code)}?next=${encodeURIComponent(`/t/${o.short_code}`)}`
      : `/thanks/${encodeURIComponent(o.short_code)}?next=${encodeURIComponent(`/t/${o.short_code}`)}`;
    const cancelUrl  = base ? `${base}/thanks/${encodeURIComponent(o.short_code)}?pay=cancel` : `/thanks/${encodeURIComponent(o.short_code)}?pay=cancel`;
    const failureUrl = base ? `${base}/thanks/${encodeURIComponent(o.short_code)}?pay=err`    : `/thanks/${encodeURIComponent(o.short_code)}?pay=err`;

    const payload = {
      amount: Number(o.total_cents || 0),
      currency: "ZAR",
      successUrl,
      cancelUrl,
      failureUrl,
      reference: o.short_code,
      metadata: { short_code: o.short_code, event_id: o.event_id }
    };

    let res, body;
    try {
      res = await fetch(yocoCheckoutEndpoint(), {
        method: "POST",
        headers: {
          "authorization": `Bearer ${secret}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      body = await res.json().catch(()=> ({}));
    } catch (e) {
      return bad("Network to Yoco failed: " + (e?.message || e), 502);
    }
    if (!res.ok) {
      const err = body?.error || body?.message || `Yoco error ${res.status}`;
      return bad(err, res.status);
    }

    const redirect = body.redirectUrl || body.redirect_url || body.hostedUrl || body.url || null;
    if (!redirect) return bad("Yoco did not return a redirect url", 502);

    await recordInitiated(env, o.id, o.total_cents || 0);
    return json({ ok: true, redirect_url: redirect, yoco: body });
  });

  /* Webhook from Yoco (production) */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    const ref =
      body?.reference ||
      body?.metadata?.short_code ||
      body?.data?.reference ||
      body?.data?.metadata?.short_code || "";

    const code = String(ref || "").trim().toUpperCase();
    if (!code) return json({ ok:true, ignored:true, reason: "no reference" });

    const status = (body?.status || body?.data?.status || body?.event || "").toLowerCase();
    const isPaid =
      status.includes("success") ||
      status === "paid" ||
      status === "approved" ||
      status === "completed";

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, total_cents, buyer_name, buyer_phone
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return json({ ok:true, ignored:true, reason: "order not found" });

    if (!isPaid) return json({ ok:true, received:true, paid:false });

    await settlePaid(env, o, body);

    try {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
      const link = base ? `${base}/t/${encodeURIComponent(o.short_code)}` : `/t/${encodeURIComponent(o.short_code)}`;
      if (o.buyer_phone) {
        await sendViaTemplateKey(
          env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone),
          `Betaling ontvang ✅\nBestel: ${o.short_code}\nJou kaartjies: ${link}`
        );
        await sendViaTemplateKey(
          env, "WA_TMP_TICKET_DELIVERY", String(o.buyer_phone),
          `Jou kaartjies is gereed 🎟️\nBestel: ${o.short_code}\nOpen hier: ${link}`
        );
      }
    } catch {}

    return json({ ok: true, received: true, paid: true });
  });

  /* Sandbox tester: mark order paid manually (GET /api/payments/yoco/simulate?code=XXXX) */
  router.add("GET", "/api/payments/yoco/simulate", async (req, env) => {
    const u = new URL(req.url);
    const code = String(u.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, total_cents, buyer_name, buyer_phone
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    await settlePaid(env, o, { reference: `SIM-${Date.now()}` });

    // Fire WA like the webhook would
    try {
      const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
      const link = base ? `${base}/t/${encodeURIComponent(o.short_code)}` : `/t/${encodeURIComponent(o.short_code)}`;
      if (o.buyer_phone) {
        await sendViaTemplateKey(
          env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone),
          `Betaling ontvang ✅\nBestel: ${o.short_code}\nJou kaartjies: ${link}`
        );
        await sendViaTemplateKey(
          env, "WA_TMP_TICKET_DELIVERY", String(o.buyer_phone),
          `Jou kaartjies is gereed 🎟️\nBestel: ${o.short_code}\nOpen hier: ${link}`
        );
      }
    } catch {}

    return json({ ok:true, simulated:true, short_code: o.short_code });
  });
}