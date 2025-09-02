// /src/routes/pos.js
import { json, bad } from "../utils/http.js";

function now(){ return Math.floor(Date.now()/1000); }

export function mountPOS(router) {
  // Bootstrap POS (active event, gates, ticket types, and any open session for this gate/cashier if provided)
  router.add("POST", "/api/pos/bootstrap", async (req, env) => {
    const body = await req.json().catch(()=>({})) || {};
    // get latest active event
    const ev = await env.DB
      .prepare("SELECT id, slug, name, starts_at, ends_at FROM events WHERE status='active' ORDER BY starts_at ASC LIMIT 1")
      .first();

    const tts = ev
      ? await env.DB.prepare("SELECT id, name, price_cents FROM ticket_types WHERE event_id=? ORDER BY id")
          .bind(ev.id).all()
      : { results: [] };

    const gates = await env.DB.prepare("SELECT id, name FROM gates ORDER BY id").all();

    // try to locate any open session if gate_id+cashier_name matches (optional)
    let session = null;
    if (body.cashier_name && body.gate_id) {
      session = await env.DB
        .prepare("SELECT id, cashier_name, gate_id, opening_float_cents, opened_at FROM pos_sessions WHERE closed_at IS NULL AND cashier_name=? AND gate_id=?")
        .bind(body.cashier_name, Number(body.gate_id))
        .first();
    }

    return json({ ok:true, event: ev||null, ticket_types: tts.results||[], gates: gates.results||[], session });
  });

  // Start a POS session
  router.add("POST", "/api/pos/sessions/start", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.cashier_name || !b?.gate_id) return bad("Missing cashier_name or gate_id");
    const opening = Math.round(Number(b.opening_float_rands||0) * 100);
    await env.DB
      .prepare("INSERT INTO pos_sessions (cashier_name, gate_id, opening_float_cents, opened_at) VALUES (?,?,?,?)")
      .bind(String(b.cashier_name), Number(b.gate_id), opening, now())
      .run();
    const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
    return json({ ok:true, session_id: row.id });
  });

  // End a POS session (cashier cannot see totals; just close)
  router.add("POST", "/api/pos/sessions/:id/end", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=> ({}));
    await env.DB
      .prepare("UPDATE pos_sessions SET closed_at=?, closing_manager=? WHERE id=? AND closed_at IS NULL")
      .bind(now(), String(b.manager_name||''), Number(id))
      .run();
    return json({ ok:true });
  });

  // === ORDER RECALL & SETTLEMENT ===

  // Lookup an awaiting-payment order by its short pickup code
  router.add("GET", "/api/pos/orders/lookup/:code", async (_req, env, _ctx, { code }) => {
    try {
      const o = await env.DB
        .prepare(`SELECT id, short_code, event_id, status, total_cents, contact_json
                  FROM orders WHERE short_code=?`)
        .bind(String(code||'').toUpperCase())
        .first();
      if (!o) return bad("Order not found", 404);

      const items = await env.DB
        .prepare(`SELECT ticket_type_id, qty, price_cents FROM order_items WHERE order_id=? ORDER BY id ASC`)
        .bind(o.id).all();

      // enrich with ticket names
      const ids = (items.results||[]).map(r=>r.ticket_type_id);
      let names = new Map();
      if (ids.length) {
        const q = ids.map(()=>'?').join(',');
        const r = await env.DB
          .prepare(`SELECT id, name FROM ticket_types WHERE id IN (${q})`).bind(...ids).all();
        names = new Map((r.results||[]).map(x=>[Number(x.id), x.name]));
      }

      return json({ ok:true, order:o, items:(items.results||[]).map(i=>({...i, name:names.get(Number(i.ticket_type_id))||'Ticket'})) });
    } catch (e) {
      return json({ ok:false, error:String(e) }, 500);
    }
  });

  // Update items on recalled order (allow cashier to amend quantities)
  router.add("POST", "/api/pos/orders/:id/update-items", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b || !Array.isArray(b.items)) return bad("Invalid items");

    // delete previous items; re-insert with server prices
    const order = await env.DB.prepare("SELECT event_id, status FROM orders WHERE id=?").bind(Number(id)).first();
    if (!order) return bad("Order not found", 404);
    if (order.status === 'paid') return bad("Order already paid", 400);

    // resolve prices
    const ids = b.items.map(i=>Number(i.ticket_type_id)).filter(Boolean);
    const q = ids.length ? ids.map(()=>'?').join(',') : 'NULL';
    const priceRows = ids.length
      ? await env.DB.prepare(`SELECT id, price_cents FROM ticket_types WHERE event_id=? AND id IN (${q})`).bind(order.event_id, ...ids).all()
      : { results:[] };
    const priceMap = new Map((priceRows.results||[]).map(r=>[Number(r.id), Number(r.price_cents)||0]));

    await env.DB.prepare("DELETE FROM order_items WHERE order_id=?").bind(Number(id)).run();

    let total = 0;
    const ins = await env.DB.prepare("INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents) VALUES (?,?,?,?)");
    for (const it of b.items) {
      const qty = Math.max(0, Number(it.qty)||0);
      if (!qty) continue;
      const tt = Number(it.ticket_type_id);
      const pc = priceMap.get(tt) ?? 0;
      total += pc*qty;
      await ins.bind(Number(id), tt, qty, pc).run();
    }

    await env.DB.prepare("UPDATE orders SET total_cents=? WHERE id=?").bind(total, Number(id)).run();

    return json({ ok:true, total_cents: total });
  });

  // Settle a pay-later order at the gate (cash or card) and record POS payment
  router.add("POST", "/api/pos/orders/:id/settle", async (req, env, _ctx, { id }) => {
    const body = await req.json().catch(() => ({}));
    const method = body.method === "pos_card" ? "pos_card" : "pos_cash";
    const ref = body.payment_ref || "";
    const session_id = Number(body.session_id)||0;

    const o = await env.DB.prepare("SELECT status, total_cents FROM orders WHERE id=?").bind(Number(id)).first();
    if (!o) return bad("Order not found", 404);
    if (o.status === 'paid') return json({ ok:true, already:true });

    await env.DB
      .prepare(`UPDATE orders SET status='paid', payment_method=?, payment_ref=?, paid_at=? WHERE id=?`)
      .bind(method, ref, now(), Number(id))
      .run();

    await env.DB
      .prepare("INSERT INTO pos_payments (session_id, order_id, method, amount_cents, created_at) VALUES (?,?,?,?,?)")
      .bind(session_id, Number(id), method, Number(o.total_cents)||0, now())
      .run();

    // TODO: issue tickets + deliver
    return json({ ok:true });
  });
}