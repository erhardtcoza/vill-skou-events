// src/routes/payments.js
import { json, bad } from "../utils/http.js";

/* --------------------------- small helpers --------------------------- */
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

function findShortCodeAnywhere(obj) {
  const re = /C[A-Z0-9]{6,8}/g;
  try {
    const m = JSON.stringify(obj || {}).match(re);
    return m && m[0] ? m[0] : null;
  } catch { return null; }
}

// Normalise YOCO_MODE coming from admin UI (“Sandbox”, “Live”, etc.)
async function readYocoMode(env) {
  const raw = String((await getSetting(env, "YOCO_MODE")) || "").trim().toLowerCase();
  if (["sandbox", "test", "dev"].includes(raw)) return "test";
  if (["live", "prod", "production"].includes(raw)) return "live";
  // default safe mode
  return "test";
}

/* ------------------------ WhatsApp (best-effort) --------------------- */
async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "en_US" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "en_US" };
}
async function sendViaTemplateKey(env, tplKey, toMsisdn, fallbackText) {
  if (!toMsisdn) return;
  try {
    const svc = await import("../services/whatsapp.js");
    const sendTpl = svc.sendWhatsAppTemplate || null;
    const sendTxt = svc.sendWhatsAppTextIfSession || null;
    const { name, lang } = await parseTpl(env, tplKey);
    if (name && sendTpl) await sendTpl(env, toMsisdn, fallbackText, lang, name);
    else if (sendTxt)   await sendTxt(env, toMsisdn, fallbackText);
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

/* ----------------------- order state & logging ----------------------- */
async function activateTickets(env, orderId) {
  const ts = nowTs();
  await env.DB.prepare(
    `UPDATE tickets
        SET state='active', activated_at=?1
      WHERE order_id=?2 AND state!='active'`
  ).bind(ts, orderId).run();
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

  // If already paid, just ensure tickets active and return ok
  if (String(o.status || "").toLowerCase() === "paid") {
    await activateTickets(env, o.id).catch(()=>{});
    return { ok: true, already_paid: true, order: o };
  }

  // Mark paid
  await env.DB.prepare(
    `UPDATE orders
        SET status='paid', paid_at=?1, updated_at=?1
      WHERE id=?2`
  ).bind(ts, o.id).run();

  // Activate tickets (if they were reserved)
  await activateTickets(env, o.id).catch(()=>{});

  // Log payment record (best-effort)
  const amount = Number(meta.amount_cents || o.total_cents || 0);
  const txref  = String(meta.tx_ref || meta.txid || meta.reference || "") || null;
  await env.DB.prepare(
    `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at, reference)
     VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3, ?4)`
  ).bind(o.id, amount, ts, txref).run().catch(()=>{});

  // WhatsApp notifications (best-effort)
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
      await sendTickets(env, o);
    }
  } catch {}

  return { ok: true, order: { ...o, status: "paid", paid_at: ts } };
}

/* =============================== ROUTER ============================== */
export function mountPayments(router) {

  // Create a payment intent
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    const next = String(b?.next || "").trim();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status
         FROM orders
        WHERE UPPER(short_code)=UPPER(?1)
        LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    const mode = await readYocoMode(env);
    const base = await currentPublicBase(env);

    if (mode === "test") {
      // Simulator URL that marks the order paid and returns to thanks
      const thanksUrl = `${base}/thanks/${encodeURIComponent(code)}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      const url = `${base}/api/payments/yoco/simulate?code=${encodeURIComponent(code)}&next=${encodeURIComponent(thanksUrl)}`;
      // Return both keys for backward compatibility with older UIs
      return json({ ok: true, url, redirect_url: url, mode: "test" });
    }

    // In LIVE we expect the client to create the hosted checkout with the
    // Yoco secret directly (or via a separate server function, not here).
    return bad("Yoco live mode: server-side intent creation not configured here.", 400);
  });

  // TEST simulator: marks order paid, then redirects to thanks
  router.add("GET", "/api/payments/yoco/simulate", async (req, env) => {
    const u = new URL(req.url);
    const code = String(u.searchParams.get("code") || "").toUpperCase();
    const next = String(u.searchParams.get("next") || "");
    if (!code) return new Response("code required", { status: 400 });

    const res = await markPaidAndLog(env, code, { tx_ref: "SIMULATED", amount_cents: null });

    // If we couldn’t process, still land user on thanks so they’re not stuck
    const to = next || `${await currentPublicBase(env)}/thanks/${encodeURIComponent(code)}`;
    if (!res.ok) return Response.redirect(to, 302);
    return Response.redirect(to, 302);
  });

  // YOCO webhook (test + live)
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let payload;
    try { payload = await req.json(); }
    catch { return json({ ok: false, error: "bad_json" }, 400); }

    const data = payload?.data || payload?.object || {};

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

    const amount_cents = Number(data?.amount || data?.amount_cents || data?.amountInCents || 0) || null;
    const statusRaw = String(data?.status || payload?.status || payload?.type || "").toLowerCase();
    const isPaid = statusRaw.includes("paid") || statusRaw.includes("success");

    if (isPaid) {
      const meta = { amount_cents, tx_ref: data?.id || payload?.id || payload?.eventId || null };
      const res = await markPaidAndLog(env, code, meta);
      return json({ ok: true, processed: res.ok, already_paid: !!res.already_paid });
    }

    return json({ ok: true, ignored: true });
  });
}
