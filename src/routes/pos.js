// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

export function mountPOS(router) {

  // ---------- helpers ----------
  async function setting(env, key){
    const r = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(key).first();
    return r ? r.value : null;
  }
  const toRands = cents => 'R' + ((Number(cents||0))/100).toFixed(2);
  const normPhone = raw => {
    const s = String(raw||'').replace(/\D+/g,'');
    if (s.length===10 && s.startsWith('0')) return '27'+s.slice(1);
    return s;
  };

  async function sendTemplate(env, toMsisdn, nameLang, vars = []) {
    if (!nameLang) return { ok:false, skip:true, why:"no_template_selected" };
    const [name, language] = String(nameLang).split(":");
    const token = await setting(env, "WHATSAPP_TOKEN");
    const phone_id = await setting(env, "PHONE_NUMBER_ID");
    if (!token || !phone_id || !name || !language) {
      return { ok:false, err:"WA not configured (token/phone_id/template/lang missing)" };
    }

    const bodyComponents = vars.length ? [{
      type: "body",
      parameters: vars.map(v => ({ type:"text", text:String(v) }))
    }] : [];

    const payload = {
      messaging_product: "whatsapp",
      to: toMsisdn,                // e.g. 27721234567 (no +)
      type: "template",
      template: { name, language: { code: language }, components: bodyComponents }
    };

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phone_id)}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type":"application/json", "authorization":"Bearer " + token },
      body: JSON.stringify(payload)
    });

    let j = null; try { j = await res.json(); } catch {}
    if (!res.ok) {
      const err = j?.error?.message || (`HTTP ${res.status}`);
      console.log("[WA SEND FAIL]", err, { to: toMsisdn, nameLang, vars });
      return { ok:false, err };
    }
    const id = j?.messages?.[0]?.id || null;
    console.log("[WA SENT]", { to: toMsisdn, nameLang, id });
    return { ok:true, id };
  }

  // ---------- POS settlement ----------
  // Body: { code, phone? }
  router.add("POST", "/api/pos/settle", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code  = String(b?.code || "").trim().toUpperCase();
    const phoneFromBody = normPhone(b?.phone || "");
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status, buyer_phone
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    // Mark paid if not already
    if (String(o.status||"").toLowerCase() !== "paid") {
      await env.DB.prepare(
        `UPDATE orders
            SET status='paid', paid_at=strftime('%s','now')
          WHERE id=?1`
      ).bind(o.id).run();
    }

    // Choose phone: body > order.buyer_phone
    const toMsisdn = normPhone(phoneFromBody || o.buyer_phone || "");
    const waResults = { payment:null, tickets:null, skipped:false };

    if (!toMsisdn) {
      waResults.skipped = true; // nothing to send to
      console.log("[WA SKIP] no phone for", code);
    } else {
      // Settings/URLs
      const PUBLIC_BASE_URL = (await setting(env,"PUBLIC_BASE_URL")) || "";
      const payTpl  = await setting(env,"WA_TMP_PAYMENT_CONFIRM");   // e.g. "payment_confirm:af"
      const tickTpl = await setting(env,"WA_TMP_TICKET_DELIVERY");   // e.g. "ticket_delivery:af"
      const viewLink = PUBLIC_BASE_URL
        ? (PUBLIC_BASE_URL + "/t/" + encodeURIComponent(code))
        : ("https://example.com/t/" + encodeURIComponent(code));

      // Send both, best effort, and capture results
      try {
        waResults.payment = await sendTemplate(env, toMsisdn, payTpl, [code, toRands(o.total_cents)]);
      } catch (e) { waResults.payment = { ok:false, err: String(e?.message||e) }; }

      try {
        waResults.tickets = await sendTemplate(env, toMsisdn, tickTpl, [code, viewLink]);
      } catch (e) { waResults.tickets = { ok:false, err: String(e?.message||e) }; }
    }

    return json({ ok:true, id:o.id, wa: waResults });
  });

}
