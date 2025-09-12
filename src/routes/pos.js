// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** POS endpoints */
export function mountPOS(router) {
  const guard = (fn) => requireRole("pos", fn);

  // --- small helpers -------------------------------------------------------
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  function parseTemplateSetting(v) {
    // format "template_name:lang"  e.g. "payment_confirm:af"
    if (!v) return { name: "", lang: "" };
    const [name, lang] = String(v).split(":");
    return { name: (name || "").trim(), lang: (lang || "").trim() };
  }

  async function validateWAConfig(env) {
    const token      = await getSetting(env, "WHATSAPP_TOKEN");
    const phoneId    = await getSetting(env, "PHONE_NUMBER_ID");
    const tPayRaw    = await getSetting(env, "WA_TMP_PAYMENT_CONFIRM");
    const tTixRaw    = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
    const tPay       = parseTemplateSetting(tPayRaw);
    const tTickets   = parseTemplateSetting(tTixRaw);

    const problems = [];
    if (!token) problems.push("WHATSAPP_TOKEN");
    if (!phoneId) problems.push("PHONE_NUMBER_ID");
    if (!tPay.name || !tPay.lang) problems.push("WA_TMP_PAYMENT_CONFIRM");
    if (!tTickets.name || !tTickets.lang) problems.push("WA_TMP_TICKET_DELIVERY");

    return {
      ok: problems.length === 0,
      problems, // array of missing keys
      token, phoneId, tPay, tTickets
    };
  }

  async function waSendTemplate(env, { to, template, lang, vars = [] }) {
    // Defensive: don’t throw if WhatsApp is not configured; let caller decide
    const token   = await getSetting(env, "WHATSAPP_TOKEN");
    const phoneId = await getSetting(env, "PHONE_NUMBER_ID");
    if (!token || !phoneId) {
      return { ok: false, err: (!token ? "Missing WHATSAPP_TOKEN" : "Missing PHONE_NUMBER_ID") };
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: vars.length
          ? [{ type: "body", parameters: vars.map(v => ({ type: "text", text: String(v) })) }]
          : undefined
      }
    };

    let res, j;
    try {
      res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      j = await res.json().catch(() => ({}));
    } catch (e) {
      return { ok: false, err: "Network error: " + (e?.message || e) };
    }

    if (!res.ok) {
      return { ok: false, err: "Meta error " + res.status + ": " + (j?.error?.message || JSON.stringify(j)) };
    }
    return { ok: true, id: j?.messages?.[0]?.id || null };
  }

  // --- POS: start / session meta you already have --------------------------
  router.add("GET", "/api/pos/session", guard(async (_req, env) => {
    // (keep whatever you already do here; stub for completeness)
    return json({ ok: true });
  }));

  // --- POS: settle a sale ---------------------------------------------------
  // Expected body: { order_id, amount_cents, buyer_phone?, buyer_name?, method: "cash"|"card" }
  router.add("POST", "/api/pos/settle", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const order_id     = Number(b?.order_id || 0);
    const amount_cents = Number(b?.amount_cents || 0);
    const method       = (b?.method || "cash").toLowerCase();
    const buyer_phone  = String(b?.buyer_phone || "").trim();
    const buyer_name   = String(b?.buyer_name || "").trim();

    if (!order_id) return bad("order_id required");
    if (!amount_cents) return bad("amount_cents required");

    // Load order + short_code
    const o = await env.DB.prepare(
      `SELECT id, short_code, status FROM orders WHERE id=?1 LIMIT 1`
    ).bind(order_id).first();
    if (!o) return bad("Order not found", 404);

    // Mark paid (POS)
    const now = Math.floor(Date.now()/1000);
    await env.DB.prepare(
      `UPDATE orders
          SET status='paid',
              paid_at=?2,
              payment_method = CASE WHEN ?3='card' THEN 'pos_card' ELSE 'pos_cash' END,
              updated_at = strftime('%s','now')
        WHERE id=?1`
    ).bind(order_id, now, method).run();

    // WhatsApp — detailed config diagnostics
    const diag = await validateWAConfig(env);

    // Decide recipient:
    // Prefer buyer_phone param; else use order’s stored phone if any
    let to = buyer_phone;
    if (!to) {
      const r = await env.DB.prepare(`SELECT buyer_phone FROM orders WHERE id=?1`).bind(order_id).first();
      to = (r?.buyer_phone || "").trim();
    }

    const wa = { skipped: false, payment: { ok: false }, tickets: { ok: false } };

    if (!to) {
      wa.skipped = true;
      wa.reason = "no_recipient_phone";
    } else if (!diag.ok) {
      wa.skipped = true;
      wa.reason = "config_missing";
      wa.missing = diag.problems; // <— tells you exactly what is missing
      console.log("[WA POS] Skipped — missing:", diag.problems);
    } else {
      // Send payment confirmation
      const payVars = [
        buyer_name || "",           // {{1}} name (if your template expects it)
        o.short_code || "",         // {{2}} order code
        "R" + (amount_cents/100).toFixed(2) // {{3}} formatted total
      ].filter(Boolean);

      const r1 = await waSendTemplate(env, {
        to,
        template: diag.tPay.name,
        lang: diag.tPay.lang,
        vars: payVars
      });
      wa.payment = r1;

      // Send ticket delivery
      const r2 = await waSendTemplate(env, {
        to,
        template: diag.tTickets.name,
        lang: diag.tTickets.lang,
        // body variables if needed by your template; leave [] if none
        vars: [o.short_code]
      });
      wa.tickets = r2;

      // Console breadcrumbs
      console.log("[WA POS] payment:", r1.ok ? "sent" : r1.err);
      console.log("[WA POS] tickets:", r2.ok ? "sent" : r2.err);
    }

    return json({ ok: true, id: order_id, wa });
  }));
}
