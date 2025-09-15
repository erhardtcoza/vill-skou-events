// src/routes/payments.js
import { json, bad } from "../utils/http.js";

/* -------------------------------------------------------
 * Settings + small helpers
 * ----------------------------------------------------- */
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
const nowTs = () => Math.floor(Date.now() / 1000);

/* WhatsApp helpers (non-blocking) */
async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}
async function sendViaTemplateKey(env, tplKey, toMsisdn, textIfNoTpl) {
  if (!toMsisdn) return;
  let svc = null; try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;
  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) await sendTpl(env, toMsisdn, textIfNoTpl, lang, name);
    else if (sendTxt)   await sendTxt(env, toMsisdn, textIfNoTpl);
  } catch {}
}
async function sendTickets(env, order) {
  try {
    const svc = await import("../services/whatsapp.js");
    if (svc?.sendOrderOnWhatsApp) {
      await svc.sendOrderOnWhatsApp(env, order?.buyer_phone, order);
    }
  } catch {}
}

/* -------------------------------------------------------
 * YOCO config (mode: test|live; match your Admin screen)
 * ----------------------------------------------------- */
async function yocoConfig(env) {
  const modeRaw = (await getSetting(env, "YOCO_MODE")) || "test";
  const mode = String(modeRaw).toLowerCase() === "live" ? "live" : "test";

  const testSecret = await getSetting(env, "YOCO_TEST_SECRET_KEY");
  const liveSecret = await getSetting(env, "YOCO_LIVE_SECRET_KEY");
  const secret = mode === "live" ? (liveSecret || "") : (testSecret || "");

  const testHook = await getSetting(env, "YOCO_TEST_WEBHOOK_SECRET");
  const liveHook = await getSetting(env, "YOCO_LIVE_WEBHOOK_SECRET");

  return {
    mode,
    secret,
    webhookSecret: mode === "live" ? (liveHook || null) : (testHook || null),
  };
}

/* -------------------------------------------------------
 * DB utilities
 * ----------------------------------------------------- */
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
  } catch { return null; }
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

  const ts = nowTs();
  if (String(o.status || "").toLowerCase() === "paid") {
    await activateTickets(env, o.id).catch(()=>{});
    return { ok: true, already_paid: true, order: o };
  }

  await env.DB.prepare(
    `UPDATE orders
        SET status='paid', paid_at=?1, updated_at=?1
      WHERE id=?2`
  ).bind(ts, o.id).run();

  await activateTickets(env, o.id).catch(()=>{});

  const amount = Number(meta.amount_cents || o.total_cents || 0);
  const txref  = String(meta.tx_ref || meta.txid || meta.reference || "") || null;
  await env.DB.prepare(
    `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at, reference)
     VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3, ?4)`
  ).bind(o.id, amount, ts, txref).run().catch(()=>{});

  /* WhatsApp: payment confirmation + ticket delivery (5s later) */
  try {
    const base = await currentPublicBase(env);
    const link = o.short_code ? `${base}/t/${encodeURIComponent(o.short_code)}` : base;

    // Payment confirmation
    const payMsg = [
      `Hi ${o.buyer_name || ""}`,
      ``,
      `Jou betaling was suksesvol.`,
      `Bestelling: ${o.short_code}`,
      link ? `Jou kaartjies: ${link}` : ``
    ].filter(Boolean).join("\n");
    if (o.buyer_phone) {
      await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone), payMsg);
      // Ticket delivery after a tiny delay
      setTimeout(async () => {
        await sendViaTemplateKey(
          env,
          "WA_TMP_TICKET_DELIVERY",
          String(o.buyer_phone),
          `Jou kaartjies is gereed. Bestel: ${o.short_code}${link ? "\n" + link : ""}`
        );
        await sendTickets(env, o);
      }, 5000);
    }
  } catch {}

  return { ok: true, order: { ...o, status: "paid", paid_at: ts } };
}

/* -------------------------------------------------------
 * Yoco API helpers (no KV dependency required)
 * ----------------------------------------------------- */
async function createYocoCheckout(env, order) {
  const yc = await yocoConfig(env);
  if (!yc.secret) return { ok: false, error: "Missing Yoco secret key" };

  const base = await currentPublicBase(env);
  const code = order.short_code;
  const successUrl = `${base}/thanks/${encodeURIComponent(code)}`;
  const cancelUrl  = `${base}/thanks/${encodeURIComponent(code)}?pay=err`;
  const failureUrl = cancelUrl;

  const body = {
    amount: Number(order.total_cents || 0) | 0,
    currency: "ZAR",
    metadata: { reference: code },
    description: code,               // fallback for webhook mapping
    successUrl, cancelUrl, failureUrl
  };

  const r = await fetch("https://payments.yoco.com/api/checkouts", {
    method: "POST",
    headers: { "Authorization": `Bearer ${yc.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const J = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: J?.message || "yoco_error", meta: J };

  const redirectUrl = J?.redirectUrl || null;
  if (!redirectUrl) return { ok: false, error: "no_redirect_url", meta: J };

  // Optional: memo checkout id in KV (best-effort only)
  try {
    if (env.EVENTS_KV && J?.id) {
      await env.EVENTS_KV.put(`yoco:cx:${code}`, JSON.stringify({ id: J.id, at: Date.now() }), { expirationTtl: 86400 });
    } else if (!env.EVENTS_KV) {
      console.log("[yoco] KV not bound; skipping save");
    }
  } catch (e) {
    console.log("[yoco] KV save failed:", e?.message || e);
  }

  console.log("[yoco] created checkout intent", J?.id, "for", code, "mode:", yc.mode);
  return { ok: true, redirect_url: redirectUrl };
}

async function fetchCheckoutStatus(env, checkoutId) {
  const yc = await yocoConfig(env);
  if (!yc.secret) return { ok: false, error: "Missing Yoco secret key" };
  const r = await fetch(`https://payments.yoco.com/api/checkouts/${encodeURIComponent(checkoutId)}`, {
    headers: { "Authorization": `Bearer ${yc.secret}` }
  });
  const J = await r.json().catch(()=>({}));
  if (!r.ok) return { ok: false, error: J?.message || "yoco_error", meta: J };
  return { ok: true, data: J };
}
async function reconcileCheckout(env, code) {
  if (!env.EVENTS_KV) return { ok: false, error: "kv_unavailable" };
  const rec = await env.EVENTS_KV.get(`yoco:cx:${code}`, "json");
  if (!rec?.id) return { ok: false, error: "no_checkout_id" };
  const chk = await fetchCheckoutStatus(env, rec.id);
  if (!chk.ok) return { ok: false, error: chk.error, meta: chk.meta };
  const d = chk.data || {};
  const paidLike =
    String(d?.status || "").toLowerCase().includes("paid") ||
    !!d?.paymentId ||
    String(d?.status || "").toLowerCase().includes("success");
  if (paidLike) {
    const amount_cents = Number(d?.amount || 0) || null;
    const meta = { amount_cents, tx_ref: d?.paymentId || d?.id || null };
    const m = await markPaidAndLog(env, code, meta);
    return { ok: true, reconciled: m.ok, state: "paid" };
  }
  return { ok: true, reconciled: false, state: String(d?.status || "unknown") };
}

/* -------------------------------------------------------
 * Router
 * ----------------------------------------------------- */
export function mountPayments(router) {
  /* Create a real Yoco checkout */
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

    if (String(o.status || "").toLowerCase() === "paid") {
      return json({ ok: true, redirect_url: (await currentPublicBase(env)) + `/thanks/${encodeURIComponent(code)}` });
    }

    const res = await createYocoCheckout(env, o);
    if (!res.ok) return json({ ok: false, error: res.error, meta: res.meta }, 502);
    return json({ ok: true, redirect_url: res.redirect_url });
  });

  /* Webhook from Yoco (primary source of truth) */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let payload;
    try { payload = await req.json(); }
    catch { return json({ ok: false, error: "bad_json" }, 400); }

    try { console.log("[yoco:webhook] in", JSON.stringify(payload).slice(0, 1000)); } catch {}

    const data = payload?.data || payload?.object || payload || {};

    // Try to recover short_code from multiple places
    let code =
      data?.metadata?.reference ||
      data?.description ||
      payload?.description ||
      payload?.reference ||
      null;

    if (code) {
      const m = String(code).toUpperCase().match(/C[A-Z0-9]{6,8}/);
      code = m ? m[0] : null;
    }
    if (!code) code = findShortCodeAnywhere(payload);
    if (!code) {
      console.log("[yoco:webhook] no code found, ignoring");
      return json({ ok: true, ignored: true });
    }

    const amount_cents = Number(data?.amount || data?.amount_cents || data?.amountInCents || 0) || null;
    const statusRaw = String(data?.status || payload?.status || payload?.type || "").toLowerCase();
    const isPaid = statusRaw.includes("paid") || statusRaw.includes("success");

    console.log("[yoco:webhook] code:", code, "status:", statusRaw, "amount:", amount_cents);

    if (isPaid) {
      const meta = { amount_cents, tx_ref: data?.paymentId || data?.id || payload?.id || null };
      const res = await markPaidAndLog(env, code, meta);
      return json({ ok: true, processed: res.ok, already_paid: !!res.already_paid });
    }
    return json({ ok: true, ignored: true });
  });

  /* Optional ops: manual reconcile via stored checkoutId (KV) */
  router.add("POST", "/api/payments/yoco/reconcile", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");
    const r = await reconcileCheckout(env, code);
    return json(r, r.ok ? 200 : 502);
  });
}
