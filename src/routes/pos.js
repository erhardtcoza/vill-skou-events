// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";

/** Gates are not in DB; keep static list for now (IDs must match what's used at the gate) */
const GATES = [
  { id: 1, name: "Main Gate" },
  { id: 2, name: "Exhibitor Gate" },
  { id: 3, name: "VIP Gate" },
];

/** POS API
 *  GET  /api/pos/bootstrap            -> { events, gates }
 *  POST /api/pos/session/open         -> open a cashier session
 *  POST /api/pos/session/close        -> close a cashier session (optional notes)
 *  GET  /api/pos/order/lookup/:code   -> future: recall "pay at event" order
 */

export function mountPOS(router) {
  // Minimal bootstrap: events + gates
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      // Only the fields used by the UI
      const q = await env.DB.prepare(
        `SELECT id, slug, name FROM events ORDER BY id DESC`
      ).all();
      const events = (q.results || []).map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
      }));
      return json({ ok: true, events, gates: GATES });
    })
  );

  // Open session (uses gate_id; matches your schema)
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b = null;
      try {
        b = await req.json();
      } catch {
        return bad("Bad JSON");
      }

      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(
        0,
        Number(b?.opening_float_cents || 0)
      );

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      // Columns per your screenshots:
      // pos_sessions(id, cashier_name, gate_id, opening_float_cents, opened_at, closed_at, closing_manager, event_id)
      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())`
      )
        .bind(event_id, cashier_name, gate_id, opening_float_cents)
        .run();

      return json({ ok: true, session_id: r.meta.last_row_id });
    })
  );

  // Close session – store close time and (optionally) manager/notes
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b = null;
      try {
        b = await req.json();
      } catch {
        return bad("Bad JSON");
      }
      const session_id = Number(b?.session_id || 0);
      if (!session_id) return bad("session_id required");
      const closing_manager = String(b?.closing_manager || "").trim();
      const notes = String(b?.notes || "").trim();

      await env.DB.prepare(
        `UPDATE pos_sessions
           SET closed_at = unixepoch(),
               closing_manager = COALESCE(NULLIF(?1,''), closing_manager)
         WHERE id = ?2`
      )
        .bind(closing_manager, session_id)
        .run();

      if (notes) {
        // Optional: keep any free-form notes in a tiny side table if you have one.
        // If not, you can ignore this; we won't error when the table doesn't exist.
        try {
          await env.DB.prepare(
            `INSERT INTO pos_session_notes (session_id, note, created_at)
             VALUES (?1, ?2, unixepoch())`
          )
            .bind(session_id, notes)
            .run();
        } catch {}
      }

      return json({ ok: true });
    })
  );
}
