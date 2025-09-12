// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

/** POS routes: (sell UI handled in ui/pos.js), settlement + WA sends */
export function mountPOS(router) {

  // --- tiny helpers --------------------------------------------------------
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
    if (!nameLang) return { ok:false, skip:true };
    const [name, language] = String(nameLang).split(":");
    const token = await setting(env, "WHATSAPP_TOKEN");
    const phone_id = await setting(env, "PHONE_NUMBER_ID");
    if (!token || !phone_id || !name || !language) return { ok:false, err:"WA not configured" };

    const bodyComponents = vars.length ? [{ type:"body", parameters: vars.map(v => ({ type:"text", text:String(v) })) }] : [];
    const payload = {
      messaging_product: "whatsapp",
      to: toMsisdn,
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
    return res.ok ? { ok:true, id: j?.messages?.[0]?.id || null } : { ok:false, err: j?.error?.message || ("HTTP "+res.status) };
  }

  // --- POS settlement endpoint --------------------------------------------
  // Body: { code, phone }
  router.add("POST", "/api/pos/settle", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code  = String(b?.code || "").trim().toUpperCase();
    const phone = normPhone(b?.phone || "");
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, total_cents, status FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    // Mark as paid if not already
    if (String(o.status||"").toLowerCase() !== "paid") {
      await env.DB.prepare(
        `UPDATE orders SET status='paid', paid_at=strftime('%s','now') WHERE id=?1`
      ).bind(o.id).run();
    }

    // WhatsApp sends (best-effort; non-blocking failures)
    (async ()=>{
      try{
        const PUBLIC_BASE_URL = (await setting(env,"PUBLIC_BASE_URL")) || "";
        const payTpl  = await setting(env,"WA_TMP_PAYMENT_CONFIRM"); // e.g. "payment_confirm:en_US"
        const tickTpl = await setting(env,"WA_TMP_TICKET_DELIVERY"); // e.g. "ticket_delivery:en_US"

        if (phone){
          // PAYMENT CONFIRM: vars -> [order_code, amount]
          await sendTemplate(env, phone, payTpl, [code, toRands(o.total_cents)]);

          // TICKET DELIVERY: vars -> [order_code, view_link]
          const viewLink = PUBLIC_BASE_URL ? (PUBLIC_BASE_URL + "/t/" + encodeURIComponent(code)) : ("https://example.com/t/" + encodeURIComponent(code));
          await sendTemplate(env, phone, tickTpl, [code, viewLink]);
        }
      }catch(_e){}
    })();

    return json({ ok:true, id:o.id });
  });

}
