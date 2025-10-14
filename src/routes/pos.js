// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

/* ---------------- Settings + WhatsApp helpers ---------------- */
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function parseTpl(env, key) {
  const sel = await getSetting(env, key);
  if (!sel) return { name: null, lang: "af" };
  const [n, l] = String(sel).split(":");
  return { name: (n || "").trim() || null, lang: (l || "").trim() || "af" };
}

async function waSvc() {
  try { return await import("../services/whatsapp.js"); }
  catch { return null; }
}

function normPhone(raw){
  const s = String(raw||"").replace(/\D+/g,"");
  if (s.length===10 && s.startsWith("0")) return "27"+s.slice(1);
  return s;
}

// Ticket delivery only (gate sales)
async function sendTicketDelivery(env, msisdn, shortCode, buyerName){
  const svc = await waSvc();
  if (!svc || !msisdn || !shortCode) return;
  const base = (await getSetting(env,"PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
  const link = `${base}/t/${encodeURIComponent(shortCode)}`;
  const first = String(buyerName||"").split(/\s+/)[0] || "Vriend";

  const { name, lang } = await parseTpl(env, "WA_TMP_TICKET_DELIVERY");
  try {
    if (name && svc.sendWhatsAppTemplate) {
      await svc.sendWhatsAppTemplate(env, {
        to: msisdn,
        name,
        language: lang,
        variables: { name:first, code:shortCode, link }
      });
    } else if (svc.sendWhatsAppTextIfSession) {
      await svc.sendWhatsAppTextIfSession(env, msisdn,
        `Hallo ${first}! Jou kaartjies is gereed: ${link}`);
    }
  } catch {}
}

/* ---------------- Small DB helpers ---------------- */
async function ensureGateId(env, { gate_id, gate_name }){
  const idNum = Number(gate_id||0);
  if (idNum) return idNum;

  const n = String(gate_name||"").trim();
  if (!n) return 0;

  const found = await env.DB.prepare(
    `SELECT id FROM gates WHERE name=?1 LIMIT 1`
  ).bind(n).first();
  if (found?.id) return Number(found.id);

  const ins = await env.DB.prepare(`INSERT INTO gates(name) VALUES(?1)`).bind(n).run();
  return Number(ins.lastRowId ?? ins.meta?.last_row_id ?? 0);
}

async function getGateNameById(env, id){
  const row = await env.DB.prepare(`SELECT name FROM gates WHERE id=?1`).bind(Number(id||0)).first();
  return row?.name || null;
}

function shortCode(){
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<6;i++) s += A[Math.floor(Math.random()*A.length)];
  return s;
}
function randToken(len=24){
  const A="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s=""; for(let i=0;i<len;i++) s+=A[Math.floor(Math.random()*A.length)];
  return s;
}
async function getTicketType(env, id){
  return await env.DB.prepare(
    `SELECT id,event_id,name,price_cents FROM ticket_types WHERE id=?1 LIMIT 1`
  ).bind(Number(id)).first();
}

/* Create paid POS order + tickets; return {order_id, short_code, total_cents, event_id} */
async function createPosOrder(env, { event_id, items, buyer_name, buyer_phone, method }) {
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
  const msisdn = normPhone(buyer_phone||"");

  // Save order as PAID (gate flow settles immediately)
  const ins = await env.DB.prepare(
    `INSERT INTO orders (short_code,event_id,status,total_cents,created_at,updated_at,
                         payment_method,contact_json,items_json,buyer_name,buyer_phone,paid_at)
     VALUES (?1,?2,'paid',?3,?4,?4,?5,?6,?7,?8,?9,?4)`
  ).bind(
    code, evId, total, now,
    method || "pos_cash",
    JSON.stringify({ phone: msisdn }),
    JSON.stringify(expanded),
    buyer_name || "POS", msisdn
  ).run();
  const order_id = Number(ins.lastRowId ?? ins.meta?.last_row_id ?? 0);

  // Issue tickets – set attendee name/phone so Admin list shows it
  const [firstName, ...rest] = String(buyer_name||"").trim().split(/\s+/);
  const lastName = rest.join(" ");
  for (const it of expanded) {
    for (let i=0; i<it.qty; i++){
      const qr = shortCode() + "-" + randToken(6).toUpperCase();
      await env.DB.prepare(
        `INSERT INTO tickets (order_id,event_id,ticket_type_id,
                              attendee_first,attendee_last,phone,qr,state,issued_at,token)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'unused',?8,?9)`
      ).bind(order_id, evId, it.ticket_type_id,
             firstName||"", lastName||"", msisdn, qr, now, randToken(28)).run();
    }
  }

  return { order_id, short_code: code, total_cents: total, event_id: evId };
}

/* ---------------- Public diag used by /api/diag ---------------- */
export async function diagPOS(env){
  const must = ["gates","pos_sessions","ticket_types","orders","tickets","pos_payments"];
  const out = {};
  for (const t of must){
    const r = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1`
    ).bind(t).first();
    out[t] = !!r;
  }
  return { ok:true, tables: out };
}

/* ---------------- Routes ---------------- */
export function mountPOS(router, env) {

  router.add("GET", "/api/pos/diag", async () => json({ ok:true, pos:"ready" }));

  // 🚪 Gates list for dropdown
  router.add("GET", "/api/pos/gates", async (_req, env2) => {
    try{
      const res = await env2.DB.prepare(`SELECT id,name FROM gates ORDER BY id`).all();
      const gates = res?.results || [];
      return json({ ok:true, gates });
    }catch{
      return bad(500, "gates_failed");
    }
  });

  // Session OPEN
  router.add("POST", "/api/pos/session/open", async (req) => {
    try{
      const b = await req.json();
      const cashier_name = String(b.cashier_name||"").trim();
      const opening_float_cents = (b.opening_float_cents|0);
      const event_id = Number(b.event_id||0) || null;
      const cashier_msisdn = normPhone(b.cashier_msisdn||"");
      if (!cashier_name) return bad(400,"missing_fields");

      const gate_id = await ensureGateId(env, { gate_id: b.gate_id, gate_name: b.gate_name || b.gate });
      if (!gate_id) return bad(400,"invalid_gate");

      const now = Math.floor(Date.now()/1000);
      const ins = await env.DB.prepare(
        `INSERT INTO pos_sessions (cashier_name,gate_id,opening_float_cents,opened_at,event_id,cashier_msisdn)
         VALUES (?1,?2,?3,?4,?5,?6)`
      ).bind(cashier_name, gate_id, opening_float_cents, now, event_id, cashier_msisdn||null).run();
      const id = Number(ins.lastRowId ?? ins.meta?.last_row_id ?? 0);

      return json({ ok:true, session:{ id, gate_id, opened_at:now } });
    }catch{
      return bad(500,"open_failed");
    }
  });

  // Session CLOSE
  router.add("POST", "/api/pos/session/close", async (req) => {
    try{
      const { session_id, closing_manager='' } = await req.json();
      if (!session_id) return bad(400,"missing_session");
      const now = Math.floor(Date.now()/1000);
      await env.DB.prepare(
        `UPDATE pos_sessions SET closed_at=?1, closing_manager=?2 WHERE id=?3 AND closed_at IS NULL`
      ).bind(now, String(closing_manager||"").trim() || null, Number(session_id)).run();
      return json({ ok:true, session_id:Number(session_id), closed_at: now });
    }catch{
      return bad(500,"close_failed");
    }
  });

  // Session INFO (for gate name on UI)
  router.add("GET", "/api/pos/session/:id", async (_req, env2, _ctx, { id }) => {
    const s = await env2.DB.prepare(
      `SELECT ps.id, ps.gate_id, ps.cashier_name, ps.opened_at, ps.closed_at, ps.event_id
         FROM pos_sessions ps WHERE ps.id=?1 LIMIT 1`
    ).bind(Number(id||0)).first();
    if (!s) return bad(404,"not_found");
    const gate_name = await getGateNameById(env2, s.gate_id);
    return json({ ok:true, session:{ ...s, gate_name } });
  });

  // POS order: SALE (create order + tickets, log payment, send **tickets only** via WA)
  router.add("POST", "/api/pos/order/sale", async (req) => {
    let b;
    try { b = await req.json(); } catch { return bad(400,"bad_json"); }

    const method = (String(b.method||"pos_cash").toLowerCase()==="pos_card") ? "pos_card" : "pos_cash";
    const name = String(b.customer_name||"").trim();
    const phone = normPhone(b.customer_msisdn||"");
    if (!name || !phone) return bad(400,"name_phone_required");

    try{
      const order = await createPosOrder(env, {
        event_id: b.event_id,
        items: b.items || [],
        buyer_name: name,
        buyer_phone: phone,
        method
      });

      // log pos payment
      try{
        await env.DB.prepare(
          `INSERT INTO pos_payments (session_id, order_id, method, amount_cents, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        ).bind(Number(b.session_id||0)||null, order.order_id, method, order.total_cents, Math.floor(Date.now()/1000)).run();
      }catch{}

      // WhatsApp: **only** deliver tickets for gate sales
      await sendTicketDelivery(env, phone, order.short_code, name);

      return json({ ok:true, order_id: order.order_id, code: order.short_code });
    }catch(e){
      return bad(400, e?.message || "sale_failed");
    }
  });

  // Recall: if PAID -> do not return cart, offer resend details instead
  router.add("GET", "/api/pos/order/lookup/:code", async (_req, env2, _ctx, { code }) => {
    const c = String(code||"").toUpperCase();
    if (!c) return bad(400,"code_required");
    const row = await env2.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone, total_cents, status, items_json
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(c).first();
    if (!row) return bad(404,"not_found");

    const paid = String(row.status||"").toLowerCase()==="paid";
    let items = [];
    if (!paid){
      try { items = JSON.parse(row.items_json||"[]"); } catch {}
      items = items.map(it => ({ ticket_type_id: it.ticket_type_id, qty: it.qty }));
    }
    return json({ ok:true, paid, order:{
      id: row.id, short_code: row.short_code,
      buyer_name: row.buyer_name, buyer_phone: row.buyer_phone,
      total_cents: row.total_cents,
      items
    }});
  });

  // Resend tickets for a paid order
  router.add("POST", "/api/pos/order/resend/:code", async (req, env2, _ctx, { code }) => {
    const b = await req.json().catch(()=>({}));
    const c = String(code||"").toUpperCase();
    const row = await env2.DB.prepare(
      `SELECT id, short_code, buyer_name, buyer_phone, status
         FROM orders WHERE UPPER(short_code)=?1 LIMIT 1`
    ).bind(c).first();
    if (!row) return bad(404,"not_found");
    if (String(row.status||"").toLowerCase()!=="paid") return bad(409,"not_paid");
    const to = normPhone(row.buyer_phone || b.to || "");
    if (!to) return bad(400,"no_msisdn");
    await sendTicketDelivery(env2, to, row.short_code, row.buyer_name);
    return json({ ok:true, code: row.short_code });
  });

  /* Existing settle kept for compatibility (sends both) */
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
    ).bind(row.id, Number(row.total_cents||0), method, now).run();

    // For settle we keep both for compatibility with older flows
    const to = normPhone(row.buyer_phone || b?.buyer_phone || "");
    await sendTicketDelivery(env3, to, code, (row.buyer_name || b?.buyer_name || ""));
    return json({ ok:true, order_id: row.id, code, method });
  });
}
