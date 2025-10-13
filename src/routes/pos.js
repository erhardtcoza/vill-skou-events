// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

/* ------------------------------------------------------------------ *
 * Helpers: settings + WhatsApp (template-driven)                      *
 * ------------------------------------------------------------------ */
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
  const sendTpl = svc.sendWhatsAppTemplate || null;
  const sendTxt = svc.sendWhatsAppTextIfSession || null;

  const { name, lang } = await parseTpl(env, tplKey);
  try {
    if (name && sendTpl) {
      await sendTpl(env, toMsisdn, fallbackText, lang, name);
    } else if (sendTxt) {
      await sendTxt(env, toMsisdn, fallbackText);
    }
  } catch { /* non-blocking */ }
}

async function sendTicketDelivery(env, toMsisdn, code, buyerName) {
  if (!toMsisdn || !code) return;
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch { return; }
  const sendTicketTemplate = svc.sendTicketTemplate || null;
  if (!sendTicketTemplate) return;

  const sel = await getSetting(env, "WA_TMP_TICKET_DELIVERY");
  const [tplName, lang] = String(sel || "").split(":");
  const language = (lang || "en_US").trim();
  const templateName = (tplName || "ticket_delivery").trim();
  const firstName = String(buyerName||"").split(/\s+/)[0] || "Vriend";

  await sendTicketTemplate(env, String(toMsisdn), {
    templateName,
    language,
    bodyParam1: firstName,   // {{1}}
    urlSuffixParam1: code    // {{1}} in URL button → /t/{{1}}
  });
}

/* ------------------------------------------------------------------ *
 * DB helpers                                                          *
 * ------------------------------------------------------------------ */
async function getGateIdByName(env, name){
  const n = String(name||"").trim();
  if (!n) return 0;
  const found = await env.DB.prepare(
    `SELECT id FROM gates WHERE name=?1 LIMIT 1`
  ).bind(n).first();
  if (found?.id) return Number(found.id);
  const ins = await env.DB.prepare(`INSERT INTO gates(name) VALUES(?1)`).bind(n).run();
  const id = (ins.lastRowId ?? ins.meta?.last_row_id ?? 0);
  return Number(id);
}

function shortCode(){
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i=0;i<6;i++) s += A[Math.floor(Math.random()*A.length)];
  return s;
}
function randToken(len=22){
  const A="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s=""; for(let i=0;i<len;i++) s+=A[Math.floor(Math.random()*A.length)];
  return s;
}
function normPhone(raw){
  const s = String(raw||"").replace(/\D+/g,"");
  if (s.length===10 && s.startsWith("0")) return "27"+s.slice(1);
  return s;
}

async function getTicketType(env, id){
  return await env.DB.prepare(
    `SELECT id, event_id, name, price_cents FROM ticket_types WHERE id=?1 LIMIT 1`
  ).bind(Number(id)).first();
}

/* Create a paid POS order + tickets and return {order_id, short_code, total_cents} */
async function createPosOrder(env, { event_id, items, buyer_name, buyer_phone, method }) {
  // Build items with price from DB and ensure same event_id
  let total = 0;
  const expanded = [];
  let evId = Number(event_id||0) || null;

  for (const it of (items||[])) {
    const tt = await getTicketType(env, it.ticket_type_id);
    if (!tt) throw new Error("ticket_type_missing");
    if (!evId) evId = Number(tt.event_id);
    if (evId !== Number(tt.event_id)) throw new Error("mixed_event_types");
    const qty = Math.max(0, Number(it.qty||0));
    if (!qty) continue;
    const price = Number(tt.price_cents||0);
    total += price * qty;
    expanded.push({ ticket_type_id: tt.id, qty, price_cents: price, name: tt.name });
  }
  if (!expanded.length) throw new Error("no_items");

  const now = Math.floor(Date.now()/1000);
  const code = shortCode();

  // Insert order
  const ins = await env.DB.prepare(
    `INSERT INTO orders (short_code, event_id, status, total_cents,
                         created_at, updated_at, payment_method,
                         contact_json, items_json, buyer_name, buyer_phone, paid_at)
     VALUES (?1, ?2, 'paid', ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?4)`
  ).bind(
    code, evId, total, now,
    method || "pos_cash",
    JSON.stringify({ phone: normPhone(buyer_phone||"") }),
    JSON.stringify(expanded),
    buyer_name || "POS",
    normPhone(buyer_phone||"")
  ).run();

  const order_id = (ins.lastRowId ?? ins.meta?.last_row_id ?? 0);

  // Issue tickets
  for (const it of expanded) {
    for (let i=0; i<it.qty; i++){
      const qr = "T" + randToken(18);
      const token = randToken(24);
      await env.DB.prepare(
        `INSERT INTO tickets (order_id, event_id, ticket_type_id,
                              attendee_first, attendee_last, email, phone,
                              qr, state, issued_at, token)
         VALUES (?1, ?2, ?3, '', '', '', ?4, ?5, 'unused', ?6, ?7)`
      ).bind(order_id, evId, it.ticket_type_id, normPhone(buyer_phone||""), qr, now, token).run();
    }
  }

  return { order_id: Number(order_id), short_code: code, total_cents: total, event_id: evId };
}

/* ------------------------------------------------------------------ *
 * Diagnostics used by /api/diag                                      *
 * ------------------------------------------------------------------ */
export async function diagPOS(env){
  const must = ["pos_sessions","ticket_types","orders","tickets","gates"];
  const out = {};
  for (const t of must){
    try{
      const r = await env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1`
      ).bind(t).first();
      out[t] = !!r;
    }catch{ out[t] = false; }
  }
  return { ok:true, tables: out };
}

/* ------------------------------------------------------------------ *
 * POS routes                                                          *
 * ------------------------------------------------------------------ */
export function mountPOS(router, env) {
  // light diag
  router.add("GET", "/api/pos/diag", async () => json({ ok:true, pos:"ready" }));

  /* --------- Session open ---------- */
  router.add("POST", "/api/pos/session/open", async (req) => {
    try{
      const b = await req.json();
      const cashier_name = String(b.cashier_name||"").trim();
      const gate_name    = String(b.gate_name||b.gate||"").trim();
      const opening_float_cents = (b.opening_float_cents|0);
      const event_id = Number(b.event_id||0) || null;
      const cashier_msisdn = normPhone(b.cashier_msisdn||"");
      if (!cashier_name || !gate_name) return bad(400,"missing_fields");

      const gate_id = await getGateIdByName(env, gate_name);
      if (!gate_id) return bad(400,"invalid_gate");

      const now = Math.floor(Date.now()/1000);
      const ins = await env.DB.prepare(
        `INSERT INTO pos_sessions (cashier_name, gate_id, opening_float_cents, opened_at, event_id, cashier_msisdn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(cashier_name, gate_id, opening_float_cents, now, event_id, cashier_msisdn || null).run();

      const session_id = (ins.lastRowId ?? ins.meta?.last_row_id ?? 0);
      return json({ ok:true, session:{ id:Number(session_id), gate_id, opened_at: now } });
    }catch(e){
      return bad(500,"open_failed");
    }
  });

  /* --------- Session close ---------- */
  router.add("POST", "/api/pos/session/close", async (req) => {
    try{
      const { session_id, closing_manager='' } = await req.json();
      if (!session_id) return bad(400,"missing_session");
      const now = Math.floor(Date.now()/1000);
      await env.DB.prepare(
        `UPDATE pos_sessions SET closed_at=?1, closing_manager=?2 WHERE id=?3 AND closed_at IS NULL`
      ).bind(now, String(closing_manager||"").trim() || null, Number(session_id)).run();
      return json({ ok:true, session_id:Number(session_id), closed_at: now });
    }catch(_e){
      return bad(500,"close_failed");
    }
  });

  /* --------- POS order: sale (create + pay + tickets + WA) ---------- */
  // Body: { session_id, event_id?, customer_name?, customer_msisdn?, method: 'pos_cash'|'pos_card', items:[{ticket_type_id, qty}] }
  router.add("POST", "/api/pos/order/sale", async (req) => {
    let b;
    try { b = await req.json(); } catch { return bad(400,"bad_json"); }
    const method = (String(b.method||"pos_cash").toLowerCase()==="pos_card") ? "pos_card" : "pos_cash";
    const session_id = Number(b.session_id||0) || null;

    try{
      const order = await createPosOrder(env, {
        event_id: b.event_id,
        items: b.items || [],
        buyer_name: String(b.customer_name||"POS"),
        buyer_phone: normPhone(b.customer_msisdn||""),
        method
      });

      // log pos payment
      try{
        await env.DB.prepare(
          `INSERT INTO pos_payments (session_id, order_id, method, amount_cents, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        ).bind(session_id, order.order_id, method, order.total_cents, Math.floor(Date.now()/1000)).run();
      }catch{}

      // WhatsApp payment confirm + ticket delivery
      try {
        const to = normPhone(b.customer_msisdn||"");
        if (to) {
          await sendViaTemplateKey(env, "WA_TMP_PAYMENT_CONFIRM", to,
            `Betaling ontvang vir bestelling ${order.short_code}. Dankie! 🎉`);
          await sendTicketDelivery(env, to, order.short_code, String(b.customer_name||""));
        }
      } catch {}

      return json({ ok:true, order_id: order.order_id, code: order.short_code });
    }catch(e){
      const msg = e?.message || "sale_failed";
      return bad(400, msg);
    }
  });

  /* --------- POS order: lookup by short code (for Recall) ---------- */
  router.add("GET", "/api/pos/order/lookup/:code", async (_req, env2, _ctx, { code }) => {
    const c = String(code||"").toUpperCase();
    if (!c) return bad(400,"code_required");
    const row = await env2.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone, total_cents, items_json
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(c).first();
    if (!row) return bad(404,"not_found");

    let items = [];
    try { items = JSON.parse(row.items_json||"[]"); } catch { items = []; }
    // Map to expected shape: [{ticket_type_id, qty}]
    const compact = items.map(it => ({ ticket_type_id: it.ticket_type_id, qty: it.qty }));

    return json({ ok:true, order:{
      id: row.id, short_code: row.short_code,
      buyer_name: row.buyer_name, buyer_phone: row.buyer_phone,
      total_cents: row.total_cents, items: compact
    }});
  });

  /* --------- Existing: settle (idempotent) ---------- */
  // Body: { order_id?, code?, buyer_phone?, buyer_name?, method?: 'cash'|'card' }
  router.add("POST", "/api/pos/settle", async (req, env3) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const code = String(b?.code || "").trim().toUpperCase();
    const methodRaw = String(b?.method || "cash").toLowerCase();
    const method = methodRaw === "card" ? "pos_card" : "pos_cash";
    if (!code) return bad("code required");

    const row = await env3.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone, total_cents, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(code).first();
    if (!row) return bad("Order not found", 404);

    const now = Math.floor(Date.now()/1000);

    await env3.DB.prepare(
      `UPDATE orders SET status='paid', payment_method=?1, paid_at=?2, updated_at=?2 WHERE id=?3`
    ).bind(method, now, row.id).run();

    await env3.DB.prepare(
      `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'approved', ?4, ?4)`
    ).bind(row.id, Number(row.total_cents || 0), method, now).run();

    try {
      const msg = `Betaling ontvang vir bestelling ${code}. Dankie! 🎉`;
      const to = String(row.buyer_phone || b?.buyer_phone || "").trim();
      if (to) await sendViaTemplateKey(env3, "WA_TMP_PAYMENT_CONFIRM", to, msg);
    } catch {}

    try {
      const to = String(row.buyer_phone || b?.buyer_phone || "").trim();
      if (to) await sendTicketDelivery(env3, to, code, (row.buyer_name || b?.buyer_name || ""));
    } catch {}

    return json({ ok: true, order_id: row.id, code, method });
  });
}
