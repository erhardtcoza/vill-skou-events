// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";
import {
  hydrateItems,
  createPOSOrder,
  loadPendingOrderByCode
} from "../services/orders.js";

/** POS API
 *  GET  /api/pos/catalog/:eventId      -> ticket types for POS
 *  POST /api/pos/session/open          -> open a cashier session
 *  POST /api/pos/session/close         -> close a cashier session
 *  GET  /api/pos/order/lookup/:code    -> recall "pay at event" order
 *  POST /api/pos/order/sale            -> create/settle a sale (cash/card)
 */

export function mountPOS(router) {
  // Catalog for POS
  router.add(
    "GET",
    "/api/pos/catalog/:eventId",
    requireRole("pos", async (_req, env, _ctx, { eventId }) => {
      const rows = (await env.DB.prepare(
        `SELECT id, event_id, name, price_cents, requires_gender
         FROM ticket_types WHERE event_id=?1 ORDER BY id ASC`
      ).bind(Number(eventId)).all()).results || [];
      return json({ ok: true, ticket_types: rows });
    })
  );

  // Open session
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env, _ctx, _params, sess) => {
      const b = await req.json().catch(()=>null);
      const cashier_name = (b?.cashier_name || sess?.name || "").trim();
      const gate_name = (b?.gate_name || "").trim();
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      if (!cashier_name || !gate_name) return bad("cashier_name and gate_name required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (cashier_name, gate_name, opening_float_cents, opened_at, cash_total_cents, card_total_cents)
         VALUES (?1, ?2, ?3, unixepoch(), 0, 0)`
      ).bind(cashier_name, gate_name, opening_float_cents).run();

      return json({ ok: true, session_id: r.meta.last_row_id });
    })
  );

  // Close session
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      const b = await req.json().catch(()=>null);
      const id = Number(b?.session_id || 0);
      if (!id) return bad("session_id required");
      const cashC = Math.max(0, Number(b?.cash_total_cents || 0));
      const cardC = Math.max(0, Number(b?.card_total_cents || 0));
      const notes = (b?.notes || "").trim();

      await env.DB.prepare(
        `UPDATE pos_sessions
           SET closed_at = unixepoch(),
               cash_total_cents = ?1,
               card_total_cents = ?2,
               notes = COALESCE(NULLIF(?3,''), notes)
         WHERE id=?4`
      ).bind(cashC, cardC, notes, id).run();

      return json({ ok: true });
    })
  );

  // Recall "pay at event" order
  router.add(
    "GET",
    "/api/pos/order/lookup/:code",
    requireRole("pos", async (_req, env, _ctx, { code }) => {
      const o = await loadPendingOrderByCode(env.DB, code);
      if (!o) return bad("Order not found", 404);
      return json({ ok: true, order: o });
    })
  );

  // Create or settle POS sale
  router.add(
    "POST",
    "/api/pos/order/sale",
    requireRole("pos", async (req, env) => {
      const b = await req.json().catch(()=>null);
      if (!b) return bad("Invalid body");
      try {
        const res = await createPOSOrder(env.DB, b);
        return json({ ok: true, ...res });
      } catch (e) {
        return json({ ok:false, error: String(e) }, 400);
      }
    })
  );
}
