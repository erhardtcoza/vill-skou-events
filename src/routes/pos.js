// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireRole, requireAny } from "../utils/auth.js";
import {
  hydrateItems,
  createPOSOrder,
  loadPendingOrderByCode
} from "../services/orders.js";

/** POS API
 *  GET  /api/pos/bootstrap             -> minimal boot info (events)
 *  GET  /api/pos/catalog/:eventId      -> ticket types for POS
 *  POST /api/pos/session/open          -> open a cashier shift
 *  POST /api/pos/session/close         -> close a cashier shift
 *  GET  /api/pos/order/lookup/:code    -> recall "pay at event" order
 *  POST /api/pos/order/sale            -> create/settle a sale (cash/card)
 */

export function mountPOS(router) {
  // 0) Bootstrap (allow admin too so you can test from admin account)
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evs = await env.DB
        .prepare(
          `SELECT id, slug, name, starts_at, ends_at
             FROM events
            WHERE status='active'
            ORDER BY starts_at ASC`
        )
        .all();

      return json({
        ok: true,
        events: evs.results || []
      });
    })
  );

  // 1) Catalog for POS
  router.add(
    "GET",
    "/api/pos/catalog/:eventId",
    requireAny(["pos", "admin"], async (_req, env, _ctx, { eventId }) => {
      const rows =
        (
          await env.DB
            .prepare(
              `SELECT id, event_id, name, price_cents, requires_gender
                 FROM ticket_types
                WHERE event_id=?1
                ORDER BY id ASC`
            )
            .bind(Number(eventId))
            .all()
        ).results || [];
      return json({ ok: true, ticket_types: rows });
    })
  );

  // 2) Open shift
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env, _ctx, _params, sess) => {
      const b = await req.json().catch(() => null);
      const cashier_name = (b?.cashier_name || sess?.name || "").trim();
      const gate_name = (b?.gate_name || "").trim();
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      const event_id = Number(b?.event_id || 0);

      if (!event_id) return bad("event_id required");
      if (!cashier_name || !gate_name) return bad("cashier_name and gate_name required");

      const r = await env.DB
        .prepare(
          `INSERT INTO pos_shifts
             (event_id, cashier_name, gate_name, opened_at, opening_float_cents, cash_cents, card_cents, notes)
           VALUES (?1, ?2, ?3, unixepoch(), ?4, 0, 0, NULL)`
        )
        .bind(event_id, cashier_name, gate_name, opening_float_cents)
        .run();

      return json({ ok: true, shift_id: r.meta.last_row_id });
    })
  );

  // 3) Close shift
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      const b = await req.json().catch(() => null);
      const id = Number(b?.shift_id || 0);
      if (!id) return bad("shift_id required");
      const cashC = Math.max(0, Number(b?.cash_cents || 0));
      const cardC = Math.max(0, Number(b?.card_cents || 0));
      const notes = (b?.notes || "").trim();

      await env.DB
        .prepare(
          `UPDATE pos_shifts
              SET closed_at = unixepoch(),
                  cash_cents = ?1,
                  card_cents = ?2,
                  notes = COALESCE(NULLIF(?3,''), notes)
            WHERE id=?4`
        )
        .bind(cashC, cardC, notes, id)
        .run();

      return json({ ok: true });
    })
  );

  // 4) Recall "pay at event" order
  router.add(
    "GET",
    "/api/pos/order/lookup/:code",
    requireAny(["pos", "admin"], async (_req, env, _ctx, { code }) => {
      const o = await loadPendingOrderByCode(env.DB, code);
      if (!o) return bad("Order not found", 404);
      return json({ ok: true, order: o, items: hydrateItems(o.items_json) });
    })
  );

  // 5) Create/settle POS sale
  router.add(
    "POST",
    "/api/pos/order/sale",
    requireRole("pos", async (req, env) => {
      const b = await req.json().catch(() => null);
      if (!b) return bad("Invalid body");
      try {
        const res = await createPOSOrder(env.DB, b);
        return json({ ok: true, ...res });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 400);
      }
    })
  );
}
