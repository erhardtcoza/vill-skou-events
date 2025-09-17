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
async function sendViaTemplateKey(env, tplKey, toMsisdn, textIfNoTpl, vars = []) {
  if (!toMsisdn) return;
  let svc = null; try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;
  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) await sendTpl(env, toMsisdn, textIfNoTpl, lang, name, vars);
    else if (sendTxt)   await sendTxt(env, toMsisdn, textIfNoTpl);
  } catch {}
}

function normPhone(raw){
  const s = String(raw||"").replace(/\D+/g,"");
  if (s.length===10 && s.startsWith("0")) return "27"+s.slice(1);
  return s;
}

/* -------------------------------------------------------
 * YOCO config
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
  // If you use 'active' as a ticket state, ensure column exists; otherwise skip.
  try {
    await env.DB.prepare(
      `UPDATE tickets
          SET state='active', activated_at=?1
        WHERE order_id=?2 AND state!='active'`
    ).bind(ts, orderId).run();
  } catch {}
}

function findShortCodeAnywhere(obj) {
  const re = /C[A-Z0-9]{6,8}/g;
  try {
    const asText = JSON.stringify(obj || {});
    const m = asText.match(re);
    return m && m[0] ? m[0] : null;
  } catch { return null; }
}

/* Core: mark paid once + send WA with idempotency guards */
async function markPaidAndLog(env, code, meta = {}) {
  if (!code) return { ok: false, reason: "no_code" };

  const o = await env.DB.prepare(
    `SELECT id, short_code, total_cents, buyer_name, buyer_phone, buyer_email, event_id, status,
            wa_payment_notified_at, wa_tickets_notified_at
       FROM orders
      WHERE UPPER(short_code)=UPPER(?1)
      LIMIT 1`
  ).bind(code).first();
  if (!o) return { ok: false, reason: "order_not_found" };

  const ts = nowTs();
  const alreadyPaid = String(o.status || "").toLowerCase() === "paid";

  if (!alreadyPaid) {
    await env.DB.prepare(
      `UPDATE orders
          SET status='paid', paid_at=?1, updated_at=?1
        WHERE id=?2`
    ).bind(ts, o.id).run();
  }

  await activateTickets(env, o.id).catch(()=>{});

  if (!alreadyPaid) {
    const amount = Number(meta.amount_cents || o.total_cents || 0);
    const txref  = String(meta.tx_ref || meta.txid || meta.reference || "") || null;
    await env.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at, reference)
       VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3, ?4)`
    ).bind(o.id, amount, ts, txref).run().catch(()=>{});
  }

  /* WhatsApp: guarded by idempotency flags */
  try {
    const base = await currentPublicBase(env);
    const batchLink = o.short_code ? `${base}/t/${encodeURIComponent(o.short_code)}` : "";

    // 1) Payment confirmation (send ONCE)
    const rowPay = o.wa_payment_notified_at ? { wa_payment_notified_at: o.wa_payment_notified_at } :
      await env.DB.prepare(`SELECT wa_payment_notified_at FROM orders WHERE id=?1`).bind(o.id).first();

    if (!rowPay?.wa_payment_notified_at && o.buyer_phone) {
      const payVars = [o.buyer_name || "", o.short_code || ""];
      const payMsg = [
        `Hi ${o.buyer_name || ""}`,
        ``,
        `Jou betaling was suksesvol.`,
        `Bestelling: ${o.short_code}`,
        batchLink ? `Jou kaartjies: ${batchLink}` : ``
      ].filter(Boolean).join("\n");

      await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", String(o.buyer_phone), payMsg, payVars);

      await env.DB.prepare(
        `UPDATE orders SET wa_payment_notified_at=?1 WHERE id=?2`
      ).bind(ts, o.id).run();
    }

    // 2) Ticket delivery (send ONCE to buyer, and per-attendee if different phone)
    const rowTix = o.wa_tickets_notified_at ? { wa_tickets_notified_at: o.wa_tickets_notified_at } :
      await env.DB.prepare(`SELECT wa_tickets_notified_at FROM orders WHERE id=?1`).bind(o.id).first();

    if (!rowTix?.wa_tickets_notified_at) {
      // Always send batch link to buyer (template)
      if (o.buyer_phone) {
        const ticketVarsBuyer = [o.buyer_name || "", o.short_code || "", batchLink || ""];
        const ticketMsgBuyer = `Jou kaartjies is gereed. Bestel: ${o.short_code}${batchLink ? "\n" + batchLink : ""}`;
        await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", String(o.buyer_phone), ticketMsgBuyer, ticketVarsBuyer);
      }

      // Per-attendee single links only if number differs from buyer
      const buyerMSISDN = normPhone(o.buyer_phone || "");
      const tQ = await env.DB.prepare(
        `SELECT t.id, t.token, t.attendee_first, t.attendee_last, t.phone
           FROM tickets t
          WHERE t.order_id = ?1`
      ).bind(o.id).all();

      for (const t of (tQ.results || [])) {
        const attPhone = normPhone(t.phone || "");
        if (!attPhone || (buyerMSISDN && attPhone === buyerMSISDN)) continue;
        if (!t.token) continue;

        const attName = [t.attendee_first, t.attendee_last].filter(Boolean).join(" ") || (o.buyer_name || "");
        const singleLink = `${base}/tt/${encodeURIComponent(t.token)}`;

        // Reuse the same ticket template (vars: name, order_no, ticket_url)
        const vars = [attName, o.short_code || "", singleLink];
        const msg = `Jou kaartjie is gereed. Bestel: ${o.short_code}\n${singleLink}`;
        await sendViaTemplateKey(env, "WA_TMP_TICKET_DELIVERY", String(attPhone), msg, vars);
      }

      await env.DB.prepare(
        `UPDATE orders SET wa_tickets_notified_at=?1 WHERE id=?2`
      ).bind(ts, o.id).run();
    }
  } catch {}

  return { ok: true, order: { ...o, status: "paid", paid_at: o.paid_at || ts } };
}

/* Map checkoutId → order.short_code, then reuse markPaidAndLog */
async function markPaidByCheckoutId(env, checkoutId, meta = {}) {
  if (!checkoutId) return { ok: false, reason: "no_checkout_id" };

  // Prefer a proper column if present
  let row = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, short_code FROM orders WHERE checkout_id = ?1 LIMIT 1`
    ).bind(checkoutId).first();
  } catch (_e) {
    row = null;
  }

  // Fallback: KV record (yoco:cx:{short_code} -> {id})
  if (!row && env.EVENTS_KV) {
    const all = await env.EVENTS_KV.list({ prefix: "yoco:cx:" });
    if (all && Array.isArray(all.keys)) {
      const hit = all.keys.find(k => k.name && k.name.endsWith(checkoutId));
      if (hit) {
        const code = hit.name.split(":").pop();
        if (code) {
          return markPaidAndLog(env, code.replace(checkoutId, "")); // best-effort
        }
      }
    }
  }

  if (!row) {
    if (env.EVENTS_KV) {
      const list = await env.EVENTS_KV.list({ prefix: "yoco:cx:" });
      for (const k of (list.keys || [])) {
        const rec = await env.EVENTS_KV.get(k.name, "json");
        if (rec?.id === checkoutId) {
          const code = k.name.replace("yoco:cx:", "");
          if (code) return markPaidAndLog(env, code, meta);
        }
      }
    }
    return { ok: false, reason: "order_not_found_for_checkoutId" };
  }

  return markPaidAndLog(env, row.short_code, meta);
}

/* -------------------------------------------------------
 * Yoco API helpers
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
    description: code,
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
  const checkoutId  = J?.id || null;
  if (!redirectUrl || !checkoutId) return { ok: false, error: "no_redirect_or_id", meta: J };

  try {
    if (typeof order.id !== "undefined") {
      try {
        await env.DB.prepare(`UPDATE orders SET checkout_id=?1 WHERE id=?2`).bind(checkoutId, order.id).run();
      } catch (_e) {}
    }
    if (env.EVENTS_KV) {
      await env.EVENTS_KV.put(`yoco:cx:${code}`, JSON.stringify({ id: checkoutId, at: Date.now() }), { expirationTtl: 86400 });
    }
  } catch (e) {
    console.log("[yoco] could not persist checkout id:", e?.message || e);
  }

  console.log("[yoco] created checkout intent", checkoutId, "for", code, "mode:", yc.mode);
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
    return { ok: true, reconciled: m.ok, state: "paid", already_paid: !!m.already_paid };
  }
  return { ok: true, reconciled: false, state: String(d?.status || "unknown") };
}

/* -------------------------------------------------------
 * Webhook
 * ----------------------------------------------------- */
function extractWebhookBasics(payload) {
  const type = String(payload?.type || "").toLowerCase();
  const data = payload?.payload || payload?.data || payload?.object || {};
  const amount_cents = Number(data?.amount || data?.amount_cents || data?.amountInCents || 0) || null;
  const status = String(data?.status || payload?.status || "").toLowerCase();
  const checkoutId = data?.metadata?.checkoutId || data?.checkoutId || null;

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

  return { type, amount_cents, status, checkoutId, code, raw: data };
}

export function mountPayments(router) {
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

  router.add("POST", "/api/payments/yoco/webhook", async (req, env) => {
    let payload;
    try { payload = await req.json(); }
    catch { return json({ ok: false, error: "bad_json" }, 400); }

    try { console.log("[yoco:webhook] in", JSON.stringify(payload).slice(0, 1000)); } catch {}

    const info = extractWebhookBasics(payload);
    const paidEvent = info.type === "payment.succeeded" || info.status === "succeeded" || info.status.includes("paid");
    if (!paidEvent) {
      return json({ ok: true, ignored: true, type: info.type || null, status: info.status || null });
    }

    if (info.checkoutId) {
      const meta = { amount_cents: info.amount_cents, tx_ref: payload?.id || info.raw?.id || null };
      const m = await markPaidByCheckoutId(env, info.checkoutId, meta);
      if (m.ok) return json({ ok: true, processed: true, mode: "by_checkoutId", already_paid: !!m.already_paid });
    }

    if (info.code) {
      const meta = { amount_cents: info.amount_cents, tx_ref: payload?.id || info.raw?.id || null };
      const res = await markPaidAndLog(env, info.code, meta);
      return json({ ok: true, processed: res.ok, mode: "by_code", already_paid: !!res.already_paid });
    }

    console.log("[yoco:webhook] no checkoutId or code; ignoring");
    return json({ ok: true, ignored: true, reason: "no_mapping" });
  });

  router.add("POST", "/api/payments/yoco/reconcile", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");
    const r = await reconcileCheckout(env, code);
    return json(r, r.ok ? 200 : 502);
  });
}
