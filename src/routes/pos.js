// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";
import { createPOSOrder, loadPendingOrderByCode } from "../services/orders.js";

/** POS API
 *  GET  /api/pos/bootstrap           -> events + gates (for open form)
 *  GET  /api/pos/catalog/:eventId    -> ticket types for POS
 *  POST /api/pos/session/open        -> open a cashier session
 *  POST /api/pos/session/close       -> close a cashier session
 *  GET  /api/pos/order/lookup/:code  -> recall "pay at event" order
 *  POST /api/pos/order/sale          -> create/settle a sale (cash/card)
 */

export function mountPOS(router) {
  // -------- Bootstrap: events + gates
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB.prepare(
        `SELECT id, slug, name FROM events ORDER BY id DESC`
      ).all();
      const events = (evQ.results || []).map(r => ({
        id: r.id, slug: r.slug, name: r.name
      }));

      // Gates from DB (adjust table/column names if yours differ)
      const gQ = await env.DB.prepare(
        `SELECT id, name FROM gates ORDER BY id ASC`
      ).all();
      const gates = (gQ.results || []).map(r => ({ id: r.id, name: r.name }));

      return json({ ok: true, events, gates });
    })
  );

  // -------- Catalog for POS
  router.add(
    "GET",
    "/api/pos/catalog/:eventId",
    requireRole("pos", async (_req, env, _ctx, { eventId }) => {
      const rows = (
        await env.DB.prepare(
          `SELECT id, event_id, name, price_cents, requires_gender
             FROM ticket_types
            WHERE event_id = ?1
            ORDER BY id ASC`
        )
          .bind(Number(eventId))
          .all()
      ).results || [];
      return json({ ok: true, ticket_types: rows });
    })
  );

  // -------- Open session (schema uses gate_id + event_id)
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const cashier_name = String(b?.cashier_name || "").trim();
      const cashier_phone = String(b?.cashier_phone || "").trim(); // optional
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions
           (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())`
      )
        .bind(event_id, cashier_name, gate_id, opening_float_cents)
        .run();

      // store phone if you have a column; otherwise ignore safely
      try {
        await env.DB.prepare(
          `UPDATE pos_sessions
             SET cashier_phone = COALESCE(?1, cashier_phone)
           WHERE id = ?2`
        ).bind(cashier_phone || null, r.meta.last_row_id).run();
      } catch { /* column may not exist; ignore */ }

      return json({ ok: true, session_id: r.meta.last_row_id });
    })
  );

  // -------- Close session
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const id = Number(b?.session_id || 0);
      const closing_manager = String(b?.closing_manager || "").trim();
      if (!id) return bad("session_id required");

      await env.DB.prepare(
        `UPDATE pos_sessions
            SET closed_at = unixepoch(),
                closing_manager = COALESCE(NULLIF(?1,''), closing_manager)
          WHERE id = ?2`
      ).bind(closing_manager, id).run();

      return json({ ok: true });
    })
  );

  // -------- Recall a pending online order (pay-at-event)
  router.add(
    "GET",
    "/api/pos/order/lookup/:code",
    requireRole("pos", async (_req, env, _ctx, { code }) => {
      const o = await loadPendingOrderByCode(env.DB, code);
      if (!o) return bad("Order not found", 404);
      return json({ ok: true, order: o });
    })
  );

  // -------- Create / settle a POS sale (cash or card)
  router.add(
    "POST",
    "/api/pos/order/sale",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      try {
        // Pass-through to service; keep fields flexible
        const res = await createPOSOrder(env.DB, b);
        return json({ ok: true, ...res });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 400);
      }
    })
  );
}
