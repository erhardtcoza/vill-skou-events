// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";
import { createPOSOrder } from "../services/orders.js";
import { sendOrderOnWhatsApp } from "../services/whatsapp.js";

/** Utility: normalize SA msisdn into E.164 if it looks local */
function toMsisdn(phone) {
  if (!phone) return "";
  let p = String(phone).replace(/[^\d+]/g, "");
  if (p.startsWith("0")) p = "27" + p.slice(1);
  if (!p.startsWith("+")) p = "+" + p;
  return p;
}

/** POS endpoints */
export function mountPOS(router) {
  // Bootstrap: list events + gates from DB
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB
        .prepare(`SELECT id, slug, name FROM events ORDER BY id DESC`)
        .all();
      const events = (evQ.results || []).map(r => ({ id:r.id, slug:r.slug, name:r.name }));

      const gQ = await env.DB
        .prepare(`SELECT id, name FROM gates ORDER BY id ASC`)
        .all();
      const gates = (gQ.results || []).map(r => ({ id:r.id, name:r.name }));

      return json({ ok:true, events, gates });
    })
  );

  // Open session (matches your schema: gate_id, event_id, cashier_name,…)
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      const cashier_phone = String(b?.cashier_phone || "").trim(); // optional

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at, notes)
         VALUES (?1, ?2, ?3, ?4, unixepoch(), ?5)`
      ).bind(event_id, cashier_name, gate_id, opening_float_cents, cashier_phone).run();

      return json({ ok:true, session_id: r.meta.last_row_id });
    })
  );

  // Close session
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

  // Recall "pay at event" order
  router.add(
    "GET",
    "/api/pos/order/lookup/:code",
    requireRole("pos", async (_req, env, _ctx, { code }) => {
      // You already had a loader in services/orders earlier; keep your existing one if present.
      // For now, load minimal order snapshot by short_code:
      const o = await env.DB.prepare(
        `SELECT id, short_code, event_id, buyer_name, buyer_phone, total_cents
           FROM orders WHERE short_code = ?1 AND status IN ('pending','reserved')`
      ).bind(String(code || "").trim().toUpperCase()).first();

      if (!o) return bad("Order not found", 404);

      const ttRows = await env.DB.prepare(
        `SELECT t.ticket_type_id AS id, t.qty
           FROM order_items t WHERE t.order_id = ?1`
      ).bind(o.id).all();

      return json({ ok:true, order: { ...o, items: (ttRows.results || []) } });
    })
  );

  // Create or settle POS sale → then send WA tickets
  router.add(
    "POST",
    "/api/pos/order/sale",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      // Expecting: { session_id, event_id, gate_id, items:[{ticket_type_id, qty}], payment_method:'cash'|'card', buyer_name?, buyer_phone?, cashier_phone? }
      if (!Array.isArray(b?.items) || !b.items.length) return bad("No items");
      if (!b.payment_method || !['cash','card'].includes(b.payment_method)) return bad("payment_method required");

      try {
        // Create order + generate tickets (your existing service)
        const result = await createPOSOrder(env.DB, b);
        // result should at least have: { order_id, short_code, total_cents, event_slug? }
        const order = {
          id: result.order_id,
          short_code: result.short_code,
          total_cents: result.total_cents ?? 0,
          event_slug: result.event_slug
        };

        // WhatsApp send (best-effort — never fail the sale if WA fails)
        try {
          const msisdn = toMsisdn(b.buyer_phone || b.cashier_phone || "");
          if (msisdn) {
            await sendOrderOnWhatsApp(env, msisdn, order);
          }
        } catch (waErr) {
          // Log but ignore WA errors
          console.log("WA send error:", waErr?.message || waErr);
        }

        return json({ ok:true, ...result });
      } catch (e) {
        return json({ ok:false, error:String(e) }, 400);
      }
    })
  );
}
