// src/routes/payments.js
import { json, bad } from "../utils/http.js";

/* ----------------- tiny utils ----------------- */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}
function nowTs() { return Math.floor(Date.now() / 1000); }
function findShortCodeAnywhere(obj) {
  const re = /C[A-Z0-9]{6,8}/g;
  try { const m = JSON.stringify(obj||{}).match(re); return m && m[0] ? m[0] : null; }
  catch { return null; }
}
async function currentPublicBase(env) {
  const s = await getSetting(env, "PUBLIC_BASE_URL");
  return s || env.PUBLIC_BASE_URL || "";
}
async function readYocoMode(env) {
  const raw = String((await getSetting(env, "YOCO_MODE")) || "").trim().toLowerCase();
  if (["sandbox","test","dev"].includes(raw)) return "sandbox";
  if (["live","prod","production"].includes(raw)) return "live";
  return "sandbox";
}
// try multiple possible setting keys (so we don't break existing admin UIs)
async function getAnySetting(env, keys) {
  for (const k of keys) {
    const v = await getSetting(env, k);
    if (v) return v;
  }
  return null;
}
async function getYocoSecrets(env, mode) {
  if (mode === "live") {
    const secret = await getAnySetting(env, [
      "YOCO_LIVE_SECRET", "YOCO_LIVE_SECRET_KEY", "YOCO_LIVE_SK",
      "YOCO_SECRET_LIVE"
    ]);
    const pub = await getAnySetting(env, [
      "YOCO_LIVE_PUBLIC", "YOCO_LIVE_PUBLIC_KEY", "YOCO_LIVE_PK",
      "YOCO_PUBLIC_LIVE"
    ]);
    return { secret, public: pub };
  }
  // sandbox
  const secret = await getAnySetting(env, [
    "YOCO_SANDBOX_SECRET", "YOCO_SANDBOX_SECRET_KEY", "YOCO_SANDBOX_SK",
    "YOCO_SECRET_SANDBOX"
  ]);
  const pub = await getAnySetting(env, [
    "YOCO_SANDBOX_PUBLIC", "YOCO_SANDBOX_PUBLIC_KEY", "YOCO_SANDBOX_PK",
    "YOCO_PUBLIC_SANDBOX"
  ]);
  return { secret, public: pub };
}

/* ---------------- WhatsApp helpers (best-effort) ---------------- */
async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n||"").trim()||null, lang: (l||"").trim()||"en_US" };
}
async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  try {
    const svc = await import("../services/whatsapp.js");
    const sendTpl = svc.sendWhatsAppTemplate || null;
    const sendTxt = svc.sendWhatsAppTextIfSession || null;
    const { name, lang } = await parseTpl(env, tplKey);
    if (name && sendTpl) await sendTpl(env, toMsisdn, fallbackText, lang, name);
    else if (sendTxt)     await sendTxt(env, toMsisdn, fallbackText);
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

/* ---------------- order state & logging ---------------- */
async function activateTickets(env, orderId) {
  const ts = nowTs();
  await env.DB.prepare(
    `UPDATE tickets SET state='active', activated_at=?1 WHERE order_id=?2 AND state!='active'`
  ).bind(ts, orderId).run();
}
async function markPaidAndLog(env, code, meta = {}) {
  const o = await env.DB.prepare(
    `SELECT id, short_code, total_cents, buyer_name, buyer_phone, buyer_email, event_id, status
       FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
  ).bind(code).first();
  if (!o) return { ok:false, reason:"order_not_found" };

  const ts = nowTs();
  if (String(o.status||"").toLowerCase()==="paid") {
    await activateTickets(env, o.id).catch(()=>{});
    return { ok:true, already_paid:true, order:o };
  }

  await env.DB.prepare(
    `UPDATE orders SET status='paid', paid_at=?1, updated_at=?1 WHERE id=?2`
  ).bind(ts, o.id).run();

  await activateTickets(env, o.id).catch(()=>{});

  const amount = Number(meta.amount_cents || o.total_cents || 0);
  const txref  = String(meta.tx_ref || meta.txid || meta.reference || "") || null;
  await env.DB.prepare(
    `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at, reference)
     VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3, ?4)`
  ).bind(o.id, amount, ts, txref).run().catch(()=>{});

  try {
    const base = await currentPublicBase(env);
    const link = o.short_code ? `${base}/t/${encodeURIComponent(o.short_code)}` : base;
    const payMsg = [`Betaling ontvang ✅`, `Bestelling: ${o.short_code}`, link ? `Jou kaartjies: ${link}` : ``]
      .filter(Boolean).join("\n");
    if (o.buyer_phone) {
      await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone), payMsg);
      await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", String(o.buyer_phone),
        `Jou kaartjies is gereed. Bestel kode: ${o.short_code}\n${link}`
      );
      await sendTickets(env, o);
    }
  } catch {}

  return { ok:true, order:{ ...o, status:"paid", paid_at:ts } };
}

/* =============================== ROUTER ============================== */
export function mountPayments(router) {

  // Create a Yoco Hosted Checkout (Sandbox or Live depending on settings)
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    const next = String(b?.next || "").trim(); // optional (thanks url)
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status FROM orders
        WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    const mode = await readYocoMode(env);
    const { secret } = await getYocoSecrets(env, mode);
    const base = await currentPublicBase(env);
    const thanksUrl = next || `${base}/thanks/${encodeURIComponent(code)}`;

    // If we don't have a secret key configured, fall back to the simulator
    if (!secret) {
      const sim = `${base}/api/payments/yoco/simulate?code=${encodeURIComponent(code)}&next=${encodeURIComponent(thanksUrl)}`;
      return json({ ok:true, url:sim, redirect_url:sim, mode:"simulator_no_key" });
    }

    // Build Yoco checkout
    const payload = {
      amount: Number(o.total_cents || 0),
      currency: "ZAR",
      // Send them back to thanks either way
      successUrl: thanksUrl,
      cancelUrl:  thanksUrl + "?pay=cancel",
      failureUrl: thanksUrl + "?pay=fail",
      metadata: { reference: code } // so we can match in webhook
    };

    try {
      const r = await fetch("https://payments.yoco.com/api/checkouts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const J = await r.json().catch(()=>null);
      // Yoco responds { id, redirectUrl, status, ... }
      if (!r.ok || !J?.redirectUrl) {
        return json({ ok:false, error:"yoco_error", yoco:J }, 502);
      }

      return json({
        ok: true,
        url: J.redirectUrl,
        redirect_url: J.redirectUrl,
        mode
      });
    } catch (e) {
      return json({ ok:false, error:String(e?.message||e) }, 500);
    }
  });

  // TEST/diagnostic simulator (only used when no secret is set)
  router.add("GET", "/api/payments/yoco/simulate", async (req, env) => {
    const u = new URL(req.url);
    const code = String(u.searchParams.get("code") || "").toUpperCase();
    const next = String(u.searchParams.get("next") || "");
    if (!code) return new Response("code required", { status: 400 });

    const res = await markPaidAndLog(env, code, { tx_ref: "SIMULATED", amount_cents: null });
    const to = next || `${await currentPublicBase(env)}/thanks/${encodeURIComponent(code)}`;
    return Response.redirect(to, 302);
  });

  // YOCO webhook (both modes)
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let payload;
    try { payload = await req.json(); }
    catch { return json({ ok:false, error:"bad_json" }, 400); }

    const data = payload?.data || payload?.object || {};
    let code =
      data?.metadata?.reference ||
      data?.reference ||
      data?.description ||
      payload?.reference ||
      payload?.description || null;

    if (code) {
      const m = String(code).toUpperCase().match(/C[A-Z0-9]{6,8}/);
      code = m ? m[0] : null;
    }
    if (!code) code = findShortCodeAnywhere(payload);
    if (!code) return json({ ok:false, error:"code_not_found" }, 200);

    const amount_cents = Number(data?.amount || data?.amount_cents || data?.amountInCents || 0) || null;
    const statusRaw = String(data?.status || payload?.status || payload?.type || "").toLowerCase();
    const isPaid = statusRaw.includes("paid") || statusRaw.includes("success");

    if (isPaid) {
      const meta = { amount_cents, tx_ref: data?.id || payload?.id || payload?.eventId || null };
      const res = await markPaidAndLog(env, code, meta);
      return json({ ok:true, processed: res.ok, already_paid: !!res.already_paid });
    }
    return json({ ok:true, ignored:true });
  });
}
