// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

export function mountPOS(router) {
  // ---------- helpers ----------

  async function getSetting(env, key) {
    const r = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return r ? String(r.value || "") : "";
  }

  async function getWhatsAppCreds(env) {
    // Support both old/new key names
    const token =
      (await getSetting(env, "WHATSAPP_TOKEN")) ||
      (await getSetting(env, "WHATSAPP_ACCESS_TOKEN")) || "";

    const phoneId =
      (await getSetting(env, "PHONE_NUMBER_ID")) ||
      (await getSetting(env, "WHATSAPP_PHONE_NUMBER_ID")) || "";

    return { token, phoneId };
  }

  function parseTemplateSelector(val) {
    // Expect "name:lang", e.g. "betaling_ontvang:af"
    const s = String(val || "");
    const i = s.lastIndexOf(":");
    if (i === -1) return { name: s || "", lang: "" };
    return { name: s.slice(0, i), lang: s.slice(i + 1) };
  }

  async function sendWhatsAppTemplate(env, toE164, selector, components = []) {
    const { token, phoneId } = await getWhatsAppCreds(env);
    if (!token || !phoneId) {
      return { ok: false, skipped: "wa_credentials_missing" };
    }
    const { name, lang } = parseTemplateSelector(selector);
    if (!name || !lang) {
      return { ok: false, skipped: "wa_template_not_selected" };
    }

    const payload = {
      messaging_product: "whatsapp",
      to: toE164,
      type: "template",
      template: {
        name,
        language: { code: lang },
        ...(components && components.length ? { components } : {})
      }
    };

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: j?.error || `HTTP ${res.status}` };
      }
      return { ok: true, id: j?.messages?.[0]?.id || null };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // ---------- DIAG ----------
  // Shows which templates are selected and whether WA creds exist.
  router.add("GET", "/api/pos/diag", async (_req, env) => {
    const base = await getSetting(env, "PUBLIC_BASE_URL");
    const payTmp = await getSetting(env, "WA_TMP_PAYMENT_CONFIRM");
    const tixTmp = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
    const { token, phoneId } = await getWhatsAppCreds(env);

    return json({
      ok: true,
      base_url: base,
      payment_template: payTmp,
      ticket_template: tixTmp,
      has_token: !!token,
      has_phone: !!phoneId
    });
  });

  // ---------- SETTLE ----------
  // POS finalization for cash/card-machine sales.
  // Body: { code, phone?, amount_cents? }
  // - Marks order paid (if not already)
  // - Sets buyer_phone if provided
  // - Sends WhatsApp payment + ticket templates (best-effort)
  router.add("POST", "/api/pos/settle", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    // Lookup order by short_code
    const o = await env.DB.prepare(
      `SELECT id, short_code, status, buyer_name, buyer_email, buyer_phone, total_cents
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();

    if (!o) return bad("Order not found", 404);

    // Optional: amount_cents sanity (if provided)
    const amt = Number(b?.amount_cents || 0);
    if (b?.amount_cents != null && (isNaN(amt) || amt <= 0)) {
      return bad("amount_cents invalid");
    }
    // Optional: update buyer phone if provided
    const phoneIn = String(b?.phone || "").trim();
    if (phoneIn && phoneIn !== (o.buyer_phone || "")) {
      try {
        await env.DB.prepare(
          `UPDATE orders SET buyer_phone=?2 WHERE id=?1`
        ).bind(o.id, phoneIn).run();
        o.buyer_phone = phoneIn;
      } catch {}
    }

    // Mark paid if not already
    if (String(o.status || "").toLowerCase() !== "paid") {
      try {
        await env.DB.prepare(
          `UPDATE orders
              SET status='paid', paid_at=strftime('%s','now'), payment_method='pos_cash'
            WHERE id=?1`
        ).bind(o.id).run();
      } catch (e) {
        return bad("Failed to update order: " + (e?.message || e));
      }
    }

    // Build link to ticket summary page
    const base = await getSetting(env, "PUBLIC_BASE_URL");
    const ticketLink =
      (base && /^https:\/\//i.test(base))
        ? `${base}/t/${encodeURIComponent(code)}`
        : `/t/${encodeURIComponent(code)}`;

    // Prepare WhatsApp sends (best-effort)
    const to = String(o.buyer_phone || "").trim();
    const results = { payment: null, ticket: null };

    if (!to) {
      // No phone — don't fail the settlement
      return json({ ok: true, settled: true, sent: { skipped: "no_phone" } });
    }

    // Payment confirmation
    const paySelector = await getSetting(env, "WA_TMP_PAYMENT_CONFIRM");
    // Default component: body param with link (adjust your template to accept this)
    const payComponents = [
      { type: "body", parameters: [{ type: "text", text: ticketLink }] }
    ];
    results.payment = await sendWhatsAppTemplate(env, to, paySelector, payComponents);

    // Ticket delivery
    const tixSelector = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
    const tixComponents = [
      { type: "body", parameters: [{ type: "text", text: ticketLink }] }
    ];
    results.ticket = await sendWhatsAppTemplate(env, to, tixSelector, tixComponents);

    return json({ ok: true, settled: true, sent: results });
  });
}
