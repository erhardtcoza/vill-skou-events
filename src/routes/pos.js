// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";

/* Utilities */
async function recalcOrderTotal(env, order_id) {
  const q = await env.DB.prepare(
    `SELECT COALESCE(SUM(qty * price_cents),0) AS tot FROM order_items WHERE order_id = ?1`
  ).bind(order_id).first();
  const tot = Number(q?.tot || 0);
  await env.DB.prepare(`UPDATE orders SET total_cents = ?1 WHERE id = ?2`)
    .bind(tot, order_id)
    .run();
  return tot;
}

async function issueTicketsForOrder(env, order_id) {
  // Get order and its items
  const ord = await env.DB.prepare(
    `SELECT id, event_id, short_code FROM orders WHERE id=?1`
  ).bind(order_id).first();
  if (!ord) throw new Error("order not found");

  const items = await env.DB.prepare(
    `SELECT ticket_type_id, qty, price_cents FROM order_items WHERE order_id=?1`
  ).bind(order_id).all();

  // Insert 1 ticket per qty
  for (const it of (items.results || [])) {
    const tid = Number(it.ticket_type_id);
    const qty = Number(it.qty || 0);
    if (!tid || qty <= 0) continue;

    for (let i = 0; i < qty; i++) {
      // 12-char QR token (hex)
      const qrRow = await env.DB.prepare(`SELECT lower(hex(randomblob(6))) AS qr`).first();
      const qr = String(qrRow?.qr || "").toUpperCase();

      await env.DB.prepare(
        `INSERT INTO tickets
           (order_id, event_id, ticket_type_id, qr, state, issued_at)
         VALUES (?1, ?2, ?3, ?4, 'unused', unixepoch())`
      ).bind(order_id, ord.event_id, tid, qr).run();
    }
  }

  return { ok: true };
}

export function mountPOS(router) {
  /* ---------- Bootstrap lists ---------- */
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB.prepare(
        `SELECT id, slug, name FROM events ORDER BY id DESC`
      ).all();
      const events = (evQ.results || []).map(r => ({ id:r.id, slug:r.slug, name:r.name }));

      const gQ = await env.DB.prepare(
        `SELECT id, name FROM gates ORDER BY id ASC`
      ).all();
      const gates = (gQ.results || []).map(r => ({ id:r.id, name:r.name }));

      return json({ ok:true, events, gates });
    })
  );

  /* ---------- Open session ---------- */
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      const cashier_msisdn = String(b?.cashier_msisdn || "").trim();

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions
           (event_id, cashier_name, gate_id, opening_float_cents, opened_at, cashier_msisdn)
         VALUES (?1, ?2, ?3, ?4, unixepoch(), NULLIF(?5,''))`
      ).bind(event_id, cashier_name, gate_id, opening_float_cents, cashier_msisdn).run();

      return json({ ok:true, session_id: r.meta.last_row_id });
    })
  );

  /* ---------- Close session ---------- */
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const session_id = Number(b?.session_id || 0);
      const closing_manager = String(b?.closing_manager || "").trim();
      if (!session_id) return bad("session_id required");

      await env.DB.prepare(
        `UPDATE pos_sessions
           SET closed_at = unixepoch(),
               closing_manager = COALESCE(NULLIF(?1,''), closing_manager)
         WHERE id = ?2`
      ).bind(closing_manager, session_id).run();

      return json({ ok:true });
    })
  );

  /* ---------- SELL screen bootstrap ---------- */
  router.add(
    "GET",
    "/api/pos/session_bootstrap",
    requireRole("pos", async (req, env) => {
      const url = new URL(req.url);
      const session_id = Number(url.searchParams.get("session_id") || 0);
      if (!session_id) return bad("session_id required");

      const s = await env.DB.prepare(
        `SELECT id, event_id, cashier_name, gate_id, opened_at, closed_at
           FROM pos_sessions WHERE id = ?1`
      ).bind(session_id).first();
      if (!s) return bad("session not found");

      const ev = await env.DB.prepare(
        `SELECT id, slug, name FROM events WHERE id = ?1`
      ).bind(s.event_id).first();

      const types = await env.DB.prepare(
        `SELECT id, name, price_cents, requires_gender
           FROM ticket_types WHERE event_id = ?1 ORDER BY id ASC`
      ).bind(s.event_id).all();

      return json({ ok:true, session:s, event:ev, ticket_types: types.results||[] });
    })
  );

  /* ---------- Recall existing web order by short_code ---------- */
  router.add(
    "POST",
    "/api/pos/order/recall",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const code = String(b?.short_code || "").trim().toUpperCase();
      if (!code) return bad("short_code required");

      const ord = await env.DB.prepare(
        `SELECT id, short_code, event_id, status, total_cents, buyer_name, buyer_phone
           FROM orders WHERE UPPER(short_code) = ?1 LIMIT 1`
      ).bind(code).first();
      if (!ord) return bad("order not found");

      const items = await env.DB.prepare(
        `SELECT oi.id, oi.ticket_type_id, oi.qty, oi.price_cents, tt.name
           FROM order_items oi
           JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          WHERE oi.order_id = ?1 ORDER BY oi.id ASC`
      ).bind(ord.id).all();

      return json({ ok:true, order:ord, items:items.results||[] });
    })
  );

  /* ---------- Start POS order ---------- */
  router.add(
    "POST",
    "/api/pos/order/start",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const session_id = Number(b?.session_id || 0);
      const event_id   = Number(b?.event_id   || 0);
      const buyer_name  = String(b?.buyer_name  || "").trim();
      const buyer_phone = String(b?.buyer_phone || "").trim();

      if (!session_id || !event_id) return bad("session_id and event_id required");

      const r = await env.DB.prepare(
        `INSERT INTO orders
           (short_code, event_id, status, payment_method, total_cents, contact_json, created_at, source, buyer_name, buyer_phone)
         VALUES (substr(upper(hex(randomblob(4))),1,6), ?1, 'awaiting_payment', NULL, 0, NULL, unixepoch(), 'pos', NULLIF(?2,''), NULLIF(?3,''))`
      ).bind(event_id, buyer_name, buyer_phone).run();

      const row = await env.DB.prepare(
        `SELECT id, short_code FROM orders WHERE id=?1`
      ).bind(r.meta.last_row_id).first();

      return json({ ok:true, order_id: row.id, short_code: row.short_code });
    })
  );

  /* ---------- Replace order items ---------- */
  router.add(
    "POST",
    "/api/pos/order/set-items",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const order_id = Number(b?.order_id || 0);
      const items = Array.isArray(b?.items) ? b.items : [];
      if (!order_id) return bad("order_id required");

      await env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?1`).bind(order_id).run();

      for (const it of items) {
        const tid = Number(it.ticket_type_id || 0);
        const qty = Math.max(0, Number(it.qty || 0));
        if (!tid || !qty) continue;

        const t = await env.DB.prepare(
          `SELECT price_cents FROM ticket_types WHERE id=?1`
        ).bind(tid).first();
        const price_cents = Number(t?.price_cents || 0);

        await env.DB.prepare(
          `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
           VALUES (?1, ?2, ?3, ?4)`
        ).bind(order_id, tid, qty, price_cents).run();
      }

      const total = await recalcOrderTotal(env, order_id);
      return json({ ok:true, total_cents: total });
    })
  );

  /* ---------- Tender (cash / card) -> issue tickets -> optional WhatsApp ---------- */
  router.add(
    "POST",
    "/api/pos/order/tender",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const order_id = Number(b?.order_id || 0);
      const method   = String(b?.method || "");
      if (!order_id || (method !== "pos_cash" && method !== "pos_card")) {
        return bad("order_id and valid method required");
      }

      // Recalc + mark paid
      const total = await recalcOrderTotal(env, order_id);

      const ord = await env.DB.prepare(
        `SELECT id, short_code, event_id, buyer_phone, buyer_name
           FROM orders WHERE id=?1`
      ).bind(order_id).first();
      if (!ord) return bad("order not found");

      await env.DB.prepare(
        `UPDATE orders
            SET status='paid', payment_method=?1, paid_at=unixepoch()
          WHERE id=?2`
      ).bind(method, order_id).run();

      // Issue tickets
      await issueTicketsForOrder(env, order_id);

      // Try WhatsApp (non-fatal)
      if (ord.buyer_phone && env.WHATSAPP_TOKEN) {
        try {
          const { sendWhatsAppTemplate } = await import("../services/whatsapp.js");
          const lang = env.WHATSAPP_TEMPLATE_LANG || "af";
          // Template expects a single {{1}} in body (e.g. name or short greeting text).
          // Button URL in template should be configured as .../t/{{1}}, and our service
          // will pass the short_code as the URL parameter automatically.
          await sendWhatsAppTemplate(
            env,
            ord.buyer_phone,
            (ord.buyer_name && ('Hi ' + ord.buyer_name)) || "Hi",
            lang
          );
        } catch (e) {
          // Log only; do not fail the sale
          console.log("WA send failed:", e?.message || e);
        }
      }

      return json({ ok:true, total_cents: total });
    })
  );
}
