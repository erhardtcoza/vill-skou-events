// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

/** POS-related routes */
export function mountPOS(router) {

  // ---------------- helpers ----------------
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  function moneyRands(cents) {
    const n = Number(cents || 0);
    return "R" + (n / 100).toFixed(2);
  }

  // POST to WhatsApp Cloud API using a template configured like "name:language"
  async function sendWATemplate(env, { to, selectedTemplate, tokens = [] }) {
    if (!to) return { ok: false, error: "no recipient" };
    if (!selectedTemplate) return { ok: false, error: "no template configured" };

    const WHATSAPP_TOKEN = await getSetting(env, "WHATSAPP_TOKEN");
    const PHONE_NUMBER_ID = await getSetting(env, "PHONE_NUMBER_ID");
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      return { ok: false, error: "WhatsApp credentials missing" };
    }

    // selectedTemplate stored as "name:language" (e.g. "payment_confirm:en")
    const [name, language = "en"] = String(selectedTemplate).split(":");

    // Build parameters (order matters for template variables)
    const parameters = tokens.map(v => ({ type: "text", text: String(v ?? "") }));

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language.replace("_", "-") },
        components: parameters.length
          ? [{ type: "body", parameters }]
          : []
      }
    };

    const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(PHONE_NUMBER_ID)}/messages`;

    let res, out;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      out = await res.json().catch(() => ({}));
    } catch (e) {
      return { ok: false, error: "network:" + (e?.message || e) };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: out?.error?.message || "wa_error" };
    }
    return { ok: true, id: out?.messages?.[0]?.id || null };
  }

  // ---------------- routes ----------------

  /**
   * Mark an order as PAID (POS cash / card-machine) and send WA messages.
   * Body: { code:string, phone?:string }
   * Returns: { ok:true, order_id, sent:{ payment?:id|null, tickets?:id|null } }
   */
  router.add("POST", "/api/pos/settle", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code  = String(b?.code || "").trim().toUpperCase();
    const phone = String(b?.phone || "").trim(); // may be empty

    if (!code) return bad("code required");

    // Lookup order
    const o = await env.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone, total_cents, event_id, status
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();

    if (!o) return bad("Order not found", 404);

    // Upsert buyer_phone if caller provided a phone and DB lacks one
    if (phone && !o.buyer_phone) {
      try {
        await env.DB.prepare(
          `UPDATE orders SET buyer_phone=?2 WHERE id=?1`
        ).bind(o.id, phone).run();
      } catch {}
    }

    // Mark order as PAID (idempotent)
    try {
      await env.DB.prepare(
        `UPDATE orders
            SET status='paid',
                paid_at = COALESCE(paid_at, strftime('%s','now')),
                payment_method = COALESCE(payment_method,'pos_cash'),
                updated_at = strftime('%s','now')
          WHERE id=?1`
      ).bind(o.id).run();
    } catch (e) {
      return bad("Failed to update order: " + (e?.message || e), 500);
    }

    // Prepare WhatsApp sends (only if we have a recipient)
    const toMsisdn = phone || o.buyer_phone || "";
    const sent = { payment: null, tickets: null };
    let waErr = null;

    if (toMsisdn) {
      // Read selected template keys from settings
      const tmplPayment = await getSetting(env, "WA_TMP_PAYMENT_CONFIRM");   // "name:lang"
      const tmplTickets = await getSetting(env, "WA_TMP_TICKET_DELIVERY");   // "name:lang"

      // Build a user-facing ticket link (/t/:code)
      const base = await getSetting(env, "PUBLIC_BASE_URL");
      const ticketLink = base ? `${base}/t/${encodeURIComponent(o.short_code)}` : `https://tickets.villiersdorpskou.co.za/t/${encodeURIComponent(o.short_code)}`;

      // Always include the amount (fixes "amount_cents required")
      const amountCents = Number(o.total_cents || 0);
      const amountRand  = moneyRands(amountCents);

      // Try PAYMENT CONFIRM first (pass both code and amount; order matters!)
      if (tmplPayment) {
        const r1 = await sendWATemplate(env, {
          to: toMsisdn,
          selectedTemplate: tmplPayment,
          // Most common arrangement: {1}=order code, {2}=amount (formatted)
          tokens: [o.short_code, amountRand]
        });
        if (r1.ok) sent.payment = r1.id; else waErr = waErr || r1.error;
      }

      // Then TICKET DELIVERY (code + link)
      if (tmplTickets) {
        const r2 = await sendWATemplate(env, {
          to: toMsisdn,
          selectedTemplate: tmplTickets,
          // {1}=order code, {2}=ticket link
          tokens: [o.short_code, ticketLink]
        });
        if (r2.ok) sent.tickets = r2.id; else waErr = waErr || r2.error;
      }
    }

    return json({
      ok: true,
      order_id: o.id,
      amount_cents: Number(o.total_cents || 0),   // for debugging/visibility
      sent,
      wa_error: waErr || null
    });
  });

  // (Optional) Health-check for POS
  router.add("GET", "/api/pos/diag", async (_req, env) => {
    const base = await getSetting(env, "PUBLIC_BASE_URL");
    const pT   = await getSetting(env, "WA_TMP_PAYMENT_CONFIRM");
    const tT   = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
    return json({
      ok: true,
      base_url: base || null,
      payment_template: pT || null,
      ticket_template: tT || null
    });
  });

}
