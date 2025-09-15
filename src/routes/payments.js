// src/routes/payments.js
import { json, bad } from "../utils/http.js";

/** ------------------------------------------------------------------------
 * Small helpers
 * --------------------------------------------------------------------- */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function currentPublicBase(env) {
  const s = await getSetting(env, "PUBLIC_BASE_URL");
  return s || env.PUBLIC_BASE_URL || "";
}

function nowTs() { return Math.floor(Date.now() / 1000); }

/** WhatsApp helpers (align with your /src/services/whatsapp.js contract) */
async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}

async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;   // (env,to,body,lang,name?)
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

async function sendTickets(env, order) {
  try {
    const svc = await import("../services/whatsapp.js");
    if (svc?.sendOrderOnWhatsApp) {
      await svc.sendOrderOnWhatsApp(env, order?.buyer_phone, order);
    }
  } catch { /* non-blocking */ }
}

/** ------------------------------------------------------------------------
 * YOCO config (exactly as per your DB keys)
 * - YOCO_MODE: "test" or "live"
 * - Secrets:
 *     YOCO_TEST_SECRET_KEY / YOCO_LIVE_SECRET_KEY
 *     YOCO_TEST_WEBHOOK_SECRET / YOCO_LIVE_WEBHOOK_SECRET (optional)
 * --------------------------------------------------------------------- */
async function yocoConfig(env) {
  const modeRaw = (await getSetting(env, "YOCO_MODE")) || "test";
  const mode = String(modeRaw).toLowerCase() === "live" ? "live" : "test";

  const testSecret = await getSetting(env, "YOCO_TEST_SECRET_KEY");
  const liveSecret = await getSetting(env, "YOCO_LIVE_SECRET_KEY");

  const secret =
    mode === "live" ? (liveSecret || "") : (testSecret || "");

  const testHook = await getSetting(env, "YOCO_TEST_WEBHOOK_SECRET");
  const liveHook = await getSetting(env, "YOCO_LIVE_WEBHOOK_SECRET");

  return {
    mode,                  // "test" | "live"
    secret,                // Bearer for /api/checkouts
    webhookSecret: mode === "live" ? (liveHook || null) : (testHook || null),
  };
}

/** Create a Yoco hosted checkout and return redirect URL */
async function createYocoCheckout(env, order, nextUrl) {
  const yc = await yocoConfig(env);
  if (!yc.secret) return { ok: false, error: "Missing Yoco secret key" };

  const base = await currentPublicBase(env);
  const code = order.short_code;

  // Where to return if user cancels/fails; success uses webhook for state,
  // but we’ll still send them to thanks page to poll status.
  const successUrl = `${base}/thanks/${encodeURIComponent(code)}`;
  const cancelUrl  = `${base}/thanks/${encodeURIComponent(code)}?pay=err`;
  const failureUrl = `${base}/thanks/${encodeURIComponent(code)}?pay=err`;

  // Always integer cents
  const amount = Number(order.total_cents || 0) | 0;

  const body = {
    amount,
    currency: "ZAR",
    // Yoco will echo this back; our webhook scans for short_code
    metadata: { reference: code },
    // Optional URLs – Yoco shows its own “continue” too; we provide ours
    successUrl,
    cancelUrl,
    failureUrl
  };

  const r = await fetch("https://payments.yoco.com/api/checkouts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${yc.secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const J = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Surface Yoco error cleanly to the client
    return { ok: false, error: J?.message || "yoco_error", meta: J };
  }
  const redirectUrl = J?.redirectUrl || null;
  if (!redirectUrl) {
    return { ok: false, error: "no_redirect_url", meta: J };
  }
  return { ok: true, redirect_url: redirectUrl, meta: J };
}

/** ------------------------------------------------------------------------
 * Payment state changes
 * --------------------------------------------------------------------- */
async function activateTickets(env, orderId) {
  const ts = nowTs();
  await env.DB.prepare(
    `UPDATE tickets
        SET state='active', activated_at=?1
      WHERE order_id=?2 AND state!='active'`
  ).bind(ts, orderId).run();
}

function findShortCodeAnywhere(obj) {
  const re = /C[A-Z0-9]{6,8}/g;
  try {
    const asText = JSON.stringify(obj || {});
    const m = asText.match(re);
    return m && m[0] ? m[0] : null;
  } catch {
    return null;
  }
}

async function markPaidAndLog(env, code, meta = {}) {
  if (!code) return { ok: false, reason: "no_code" };

  const o = await env.DB.prepare(
    `SELECT id, short_code, total_cents, buyer_name, buyer_phone, buyer_email, event_id, status
       FROM orders
      WHERE UPPER(short_code)=UPPER(?1)
      LIMIT 1`
  ).bind(code).first();
  if (!o) return { ok: false, reason: "order_not_found" };

  // Idempotency: if already paid, just ensure tickets active
  const ts = nowTs();
  if (String(o.status || "").toLowerCase() === "paid") {
    await activateTickets(env, o.id).catch(()=>{});
    return { ok: true, already_paid: true, order: o };
  }

  // Update order → paid
  await env.DB.prepare(
    `UPDATE orders
        SET status='paid', paid_at=?1, updated_at=?1
      WHERE id=?2`
  ).bind(ts, o.id).run();

  // Activate tickets
  await activateTickets(env, o.id).catch(()=>{});

  // Log a payment record (best-effort)
  const amount = Number(meta.amount_cents || o.total_cents || 0);
  const txref  = String(meta.tx_ref || meta.txid || meta.reference || "") || null;
  await env.DB.prepare(
    `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at, reference)
     VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3, ?4)`
  ).bind(o.id, amount, ts, txref).run().catch(()=>{});

  // WhatsApp: payment confirm, then ticket delivery
  try {
    const base = await currentPublicBase(env);
    const link = o.short_code ? `${base}/t/${encodeURIComponent(o.short_code)}` : base;

    const payMsg = [
      `Betaling ontvang ✅`,
      `Bestelling: ${o.short_code}`,
      link ? `Jou kaartjies: ${link}` : ``,
    ].filter(Boolean).join("\n");

    if (o.buyer_phone) {
      await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone), payMsg);
      await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", String(o.buyer_phone),
        `Jou kaartjies is gereed. Bestel kode: ${o.short_code}\n${link}`
      );
      await sendTickets(env, o); // high-level template with URL button
    }
  } catch { /* non-blocking */ }

  return { ok: true, order: { ...o, status: "paid", paid_at: ts } };
}

/** ------------------------------------------------------------------------
 * Router
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  /* Create a Yoco checkout (always real API; no simulator) */
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status
         FROM orders
        WHERE UPPER(short_code)=UPPER(?1)
        LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    // Do not create new checkout for already-paid order
    if (String(o.status || "").toLowerCase() === "paid") {
      return json({ ok: true, redirect_url: (await currentPublicBase(env)) + `/thanks/${encodeURIComponent(code)}` });
    }

    const res = await createYocoCheckout(env, o);
    if (!res.ok) return json({ ok: false, error: res.error, meta: res.meta }, 502);
    return json({ ok: true, redirect_url: res.redirect_url });
  });

  /* YOCO Webhook (test + live)
     We accept many payload shapes; we don’t enforce signature yet. */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let payload;
    try { payload = await req.json(); }
    catch { return json({ ok: false, error: "bad_json" }, 400); }

    // Yoco event formats vary; try common shapes
    const data = payload?.data || payload?.object || payload || {};

    // Find code in typical fields or anywhere in payload
    let code =
      data?.metadata?.reference ||
      data?.reference ||
      data?.description ||
      payload?.reference ||
      payload?.description ||
      null;

    if (code) {
      const m = String(code).toUpperCase().match(/C[A-Z0-9]{6,8}/);
      code = m ? m[0] : null;
    }
    if (!code) code = findShortCodeAnywhere(payload);
    if (!code) return json({ ok: false, error: "code_not_found" }, 200);

    // Best-effort amount
    const amount_cents =
      Number(data?.amount || data?.amount_cents || data?.amountInCents || 0) || null;

    // Paid/success detection
    const statusRaw = String(
      data?.status || payload?.status || payload?.type || ""
    ).toLowerCase();

    const isPaid =
      statusRaw.includes("paid") ||
      statusRaw.includes("success");

    if (isPaid) {
      const meta = {
        amount_cents,
        tx_ref: data?.id || payload?.id || payload?.eventId || null,
      };
      const res = await markPaidAndLog(env, code, meta);
      return json({ ok: true, processed: res.ok, already_paid: !!res.already_paid });
    }

    return json({ ok: true, ignored: true });
  });
}
