// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";
import { sendOrderOnWhatsApp } from "../services/whatsapp.js";

/**
 * POS API
 * - GET  /api/pos/bootstrap                 → events + gates for start form
 * - POST /api/pos/session/open              → open a session (uses gate_id)
 * - POST /api/pos/session/close             → close a session
 * - GET  /api/pos/session/:id/bootstrap     → data for the sell screen (session + event + ticket_types)
 * - POST /api/pos/notify-order              → send WA ticket_delivery template after order completion
 */
export function mountPOS(router) {
  /* ---------------------------- Start form bootstrap ---------------------------- */
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

      const gQ = await env.DB.prepare(
        `SELECT id, name FROM gates ORDER BY id ASC`
      ).all();
      const gates = (gQ.results || []).map(r => ({
        id: r.id, name: r.name
      }));

      return json({ ok: true, events, gates });
    })
  );

  /* --------------------------------- Open session -------------------------------- */
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      // NOTE: we intentionally do NOT write cashier_msisdn (no such column in your schema)

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())`
      ).bind(event_id, cashier_name, gate_id, opening_float_cents).run();

      return json({ ok: true, session_id: r.meta.last_row_id });
    })
  );

  /* -------------------------------- Close session -------------------------------- */
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
               closing_manager = COALESCE(NULLIF(?1, ''), closing_manager)
         WHERE id = ?2`
      ).bind(closing_manager, session_id).run();

      return json({ ok: true });
    })
  );

  /* ------------------------------- Sell screen bootstrap ------------------------------- */
  router.add(
    "GET",
    "/api/pos/session/:id/bootstrap",
    requireRole("pos", async (_req, env, _ctx, params) => {
      const id = Number(params?.id || 0);
      if (!id) return bad("session id required");

      const s = await env.DB.prepare(
        `SELECT ps.id, ps.event_id, ps.cashier_name, ps.gate_id, ps.opening_float_cents,
                ps.opened_at, ps.closed_at, ps.closing_manager,
                g.name AS gate_name,
                e.slug AS event_slug, e.name AS event_name
           FROM pos_sessions ps
           JOIN events e ON e.id = ps.event_id
           LEFT JOIN gates g ON g.id = ps.gate_id
          WHERE ps.id = ?1`
      ).bind(id).first();

      if (!s) return bad("session not found");

      const tQ = await env.DB.prepare(
        `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit, requires_gender
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(s.event_id).all();

      return json({
        ok: true,
        session: s,
        event: { id: s.event_id, slug: s.event_slug, name: s.event_name },
        ticket_types: tQ.results || []
      });
    })
  );

  /* ----------------------------- WhatsApp notify hook ----------------------------- */
  router.add(
    "POST",
    "/api/pos/notify-order",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const order_id = Number(b?.order_id || 0);
      const phone_fallback = String(b?.phone_fallback || "").trim();
      if (!order_id) return bad("order_id required");

      const q = await env.DB.prepare(
        `SELECT id, short_code, buyer_name, buyer_phone
           FROM orders
          WHERE id = ?1`
      ).bind(order_id).first();

      if (!q) return bad("order not found");

      try {
        const wa = await sendOrderOnWhatsApp(env, phone_fallback, q);
        return json({ ok: true, wa });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 200);
      }
    })
  );
}
