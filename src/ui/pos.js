// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/** POS endpoints: simple sale + settle (mark paid) + WA sends */
export function mountPOS(router) {
  const guard = (fn) => requireRole("pos", fn);

  // ---------------- Helpers ----------------
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }

  function parseTpl(v) {
    // stored as "template_name:language" e.g. "payment_confirm:en"
    if (!v) return null;
    const [name, language] = String(v).split(":");
    return (name && language) ? { name, language } : null;
  }

  async function sendWaTemplate(env, { to, templateKey, vars = [] }) {
    const token = await getSetting(env, "WHATSAPP_TOKEN");
    const phoneId = await getSetting(env, "PHONE_NUMBER_ID");
    const chosen = parseTpl(await getSetting(env, templateKey));

    if (!token || !phoneId || !chosen) {
      return { ok:false, err:"WA not configured (token/phone_id/template:lang missing)" };
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: chosen.name,
        language: { code: chosen.language },
        components: vars.length ? [{ type: "body", parameters: vars }] : undefined
      }
    };

    let res, j;
    try {
      res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
        method: "POST",
        headers: {
          "authorization": "Bearer " + token,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      j = await res.json().catch(()=> ({}));
    } catch (e) {
      return { ok:false, err: "WA network error: " + (e?.message || e) };
    }

    if (!res.ok) {
      return { ok:false, err: "WA rejected: " + (j?.error?.message || res.status) };
    }
    return { ok:true, id: j?.messages?.[0]?.id || null };
  }

  // ---------------- Minimal sale endpoint (optional) ----------------
  // If you already have /api/pos/order/sale elsewhere, keep that.
  router.add("POST", "/api/pos/order/sale", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const session_id = Number(b?.session_id || 0);
    const event_id   = Number(b?.event_id || 0);
    const items      = Array.isArray(b?.items) ? b.items : [];
    const method     = String(b?.method || "pos_cash");
    const buyer_name = String(b?.customer_name || "").trim() || "POS";
    const buyer_phone= String(b?.customer_msisdn || "").trim();

    if (!event_id) return bad("event_id required");
    if (!items.length) return bad("items required");

    // ticket type prices
    const ttQ = await env.DB.prepare(
      `SELECT id, price_cents FROM ticket_types WHERE event_id=?1`
    ).bind(event_id).all();
    const priceById = new Map((ttQ.results||[]).map(r=>[Number(r.id), Number(r.price_cents||0)]));

    let total_cents = 0;
    const order_items = [];
    for (const it of items) {
      const tid = Number(it.ticket_type_id||0);
      const qty = Math.max(0, Number(it.qty||0));
      if (!tid || !qty) continue;
      const price = priceById.get(tid) || 0;
      total_cents += qty * price;
      order_items.push({ ticket_type_id: tid, qty, price_cents: price });
    }
    if (!order_items.length) return bad("no valid items");

    const now = Math.floor(Date.now()/1000);
    const short_code = ("E" + Math.random().toString(36).slice(2,7)).toUpperCase();

    const r = await env.DB.prepare(
      `INSERT INTO orders
         (short_code, event_id, status, payment_method, total_cents, contact_json,
          created_at, buyer_name, buyer_phone, items_json, session_id)
       VALUES (?1, ?2, 'pending', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(
      short_code, event_id, method, total_cents,
      JSON.stringify({ phone: buyer_phone }),
      now, buyer_name, buyer_phone, JSON.stringify(order_items), (session_id||null)
    ).run();

    const order_id = r.meta.last_row_id;

    // create tickets (blank attendees)
    for (const it of order_items) {
      await env.DB.prepare(
        `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
         VALUES (?1, ?2, ?3, ?4)`
      ).bind(order_id, it.ticket_type_id, it.qty, it.price_cents).run();

      for (let i=0;i<it.qty;i++){
        const qr = short_code + "-" + it.ticket_type_id + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
        await env.DB.prepare(
          `INSERT INTO tickets
             (order_id, event_id, ticket_type_id, qr, state, issued_at)
           VALUES (?1, ?2, ?3, ?4, 'unused', ?5)`
        ).bind(order_id, event_id, it.ticket_type_id, qr, now).run();
      }
    }

    return json({ ok:true, order_id, code: short_code });
  }));

  // ---------------- SETTLE (mark paid + WhatsApp) ----------------
  // Body: { order_id? , code? , amount_cents?, buyer_phone?, buyer_name?, method? }
  router.add("POST", "/api/pos/settle", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const order_id = Number(b?.order_id || 0);
    const code     = String(b?.code || "").trim().toUpperCase();
    const buyer_phone = String(b?.buyer_phone || "").trim();
    const buyer_name  = String(b?.buyer_name  || "POS").trim();
    const method      = String(b?.method || "cash");

    // Lookup order
    let o;
    if (order_id) {
      o = await env.DB.prepare(
        `SELECT id, short_code, event_id, status, total_cents, buyer_phone
           FROM orders WHERE id=?1 LIMIT 1`
      ).bind(order_id).first();
    } else if (code) {
      o = await env.DB.prepare(
        `SELECT id, short_code, event_id, status, total_cents, buyer_phone
           FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
      ).bind(code).first();
    } else {
      return bad("order_id or code required");
    }
    if (!o) return bad("order not found", 404);

    // Update to paid
    const now = Math.floor(Date.now()/1000);
    try {
      await env.DB.prepare(
        `UPDATE orders
            SET status='paid',
                payment_method=CASE WHEN ?3='card' THEN 'pos_card' ELSE 'pos_cash' END,
                paid_at=?2, updated_at=?2
          WHERE id=?1`
      ).bind(o.id, now, method).run();
    } catch (e) {
      return bad("DB update failed: " + (e?.message||e));
    }

    // WhatsApp sends (if configured)
    const phoneToUse = (buyer_phone || o.buyer_phone || "").replace(/\D+/g,"");
    const wa = { skipped:false };

    if (phoneToUse) {
      // Payment confirmation
      const payVars = [
        { type:"text", text: buyer_name || "Kliënt" },
        { type:"text", text: o.short_code }
      ];
      const pay = await sendWaTemplate(env, {
        to: phoneToUse,
        templateKey: "WA_TMP_PAYMENT_CONFIRM",
        vars: payVars
      });

      // Tickets delivery
      // Build simple ticket link list (or a single link to view by code)
      const PUBLIC_BASE_URL = await getSetting(env, "PUBLIC_BASE_URL") || "";
      const link = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/t/${encodeURIComponent(o.short_code)}` : '';
      const tickVars = [
        { type:"text", text: buyer_name || "Kliënt" },
        { type:"text", text: o.short_code },
        ...(link ? [{ type:"text", text: link }] : [])
      ];
      const ticks = await sendWaTemplate(env, {
        to: phoneToUse,
        templateKey: "WA_TMP_TICKET_DELIVERY",
        vars: tickVars
      });

      wa.payment = pay;
      wa.tickets = ticks;
    } else {
      wa.skipped = true;
    }

    return json({ ok:true, id:o.id, wa });
  }));
}
