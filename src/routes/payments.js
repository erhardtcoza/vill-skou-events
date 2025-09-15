// src/router/payments.js
import { json, bad } from "../utils/http.js";

/** ------------------------------------------------------------------------
 * Settings + WhatsApp helpers (same pattern as public.js)
 * --------------------------------------------------------------------- */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}
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
      // In our svc, extra "name" is ignored safely if not supported.
      await sendTpl(env, toMsisdn, fallbackText, lang, name);
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch { /* non-blocking */ }
}
async function sendTickets(env, order) {
  // Uses high-level helper that fills URL button {{1}} with short_code
  try {
    const svc = await import("../services/whatsapp.js");
    if (svc?.sendOrderOnWhatsApp) {
      await svc.sendOrderOnWhatsApp(env, order?.buyer_phone, order);
    }
  } catch { /* non-blocking */ }
}

function nowTs() { return Math.floor(Date.now() / 1000); }

async function currentPublicBase(env) {
  // Try site_settings first; fall back to env var
  const s = await getSetting(env, "PUBLIC_BASE_URL");
  return s || env.PUBLIC_BASE_URL || "";
}

function findShortCodeAnywhere(obj) {
  // Our short codes look like CXXXXXX (7–9 chars). Be permissive.
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

  // Idempotency: if already paid, just return ok
  if (String(o.status || "").toLowerCase() === "paid") {
    return { ok: true, already_paid: true, order: o };
  }

  const ts = nowTs();

  // Update order → paid
  await env.DB.prepare(
    `UPDATE orders
        SET status='paid', paid_at=?1, updated_at=?1
      WHERE id=?2`
  ).bind(ts, o.id).run();

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
      link ? `Volledige besonderhede: ${link}` : ``,
    ].filter(Boolean).join("\n");

    if (o.buyer_phone) {
      await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone), payMsg);
      await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", String(o.buyer_phone),
        `Jou kaartjies is gereed. Bestel kode: ${o.short_code}\n${link}`
      );
      // Also fire the high-level “ticket_delivery” template with URL button if configured
      await sendTickets(env, o);
    }
  } catch { /* non-blocking */ }

  return { ok: true, order: { ...o, status: "paid", paid_at: ts } };
}

/** ------------------------------------------------------------------------
 * Router
 * --------------------------------------------------------------------- */
export function mountPayments(router) {
  /* ---------------------------------------------------------------------
   * Create a payment intent (TEST mode: simulator URL, LIVE: you likely
   * create/redirect from the frontend – we keep this minimal to avoid
   * breaking your current working flow).
   * Body: { code, next? }
   * Returns: { ok:true, url }
   * ------------------------------------------------------------------- */
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    const next = String(b?.next || "").trim();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status FROM orders WHERE UPPER(short_code)=UPPER(?1) LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("order not found", 404);

    const mode = (await getSetting(env, "YOCO_MODE")) || "test";
    const base = await currentPublicBase(env);

    if (mode === "test") {
      const url = `${base}/api/payments/yoco/simulate?code=${encodeURIComponent(code)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
      return json({ ok: true, url, mode: "test" });
    }

    // LIVE: Your frontend is already creating the hosted checkout successfully.
    // We return a gentle error if someone hits this endpoint in live mode
    // without a server-side integration.
    return bad("Yoco live mode: server-side intent creation not configured here.", 400);
  });

  /* ---------------------------------------------------------------------
   * TEST MODE ONLY: simulator that marks the order paid and then redirects
   * back to /thanks/:code?next=...
   * ------------------------------------------------------------------- */
  router.add("GET", "/api/payments/yoco/simulate", async (req, env) => {
    const u = new URL(req.url);
    const code = String(u.searchParams.get("code") || "").toUpperCase();
    const next = String(u.searchParams.get("next") || "");
    if (!code) return new Response("code required", { status: 400 });

    // Mark paid
    const res = await markPaidAndLog(env, code, {
      tx_ref: "SIMULATED",
      amount_cents: null
    });

    const base = await currentPublicBase(env);
    const to = `${base}/thanks/${encodeURIComponent(code)}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    if (!res.ok) {
      return new Response(`Simulated payment failed (${res.reason || "unknown"}). Continue: ${to}`, {
        status: 200,
        headers: { "content-type": "text/plain" }
      });
    }
    return Response.redirect(to, 302);
  });

  /* ---------------------------------------------------------------------
   * YOCO Webhook
   * Configure this URL in Yoco dashboard (test/live respectively).
   *
   * We try multiple places to find the short_code, then mark the order PAID.
   * ------------------------------------------------------------------- */
  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let payload;
    try { payload = await req.json(); }
    catch { return json({ ok: false, error: "bad_json" }, 400); }

    // 1) Try common locations
    const data = payload?.data || payload?.object || {};
    let code =
      data?.metadata?.reference ||
      data?.reference ||
      data?.description ||
      payload?.reference ||
      payload?.description ||
      null;

    // 2) Fallback: scan entire payload for CXXXXXX pattern
    if (code) {
      const m = String(code).toUpperCase().match(/C[A-Z0-9]{6,8}/);
      code = m ? m[0] : null;
    }
    if (!code) code = findShortCodeAnywhere(payload);
    if (!code) {
      // Nothing we can do; ack 200 so Yoco doesn't retry forever, but log not OK
      return json({ ok: false, error: "code_not_found" }, 200);
    }

    // Amount (best-effort)
    const amount_cents =
      Number(data?.amount || data?.amount_cents || data?.amountInCents || 0) || null;

    // Status detection: handle various shapes (e.g. "paid", "successful")
    const statusRaw = String(
      data?.status || payload?.status || payload?.type || ""
    ).toLowerCase();

    const isPaid =
      statusRaw.includes("paid") ||
      statusRaw.includes("success");

    // Always attempt to mark paid when we think it is successful
    if (isPaid) {
      const meta = {
        amount_cents,
        tx_ref: data?.id || payload?.id || payload?.eventId || null,
      };
      const res = await markPaidAndLog(env, code, meta);
      return json({ ok: true, processed: res.ok, already_paid: !!res.already_paid });
    }

    // Not a paid signal – ACK so Yoco stops retrying; do nothing.
    return json({ ok: true, ignored: true });
  });
}
