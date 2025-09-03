// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";

/** POS endpoints */
export function mountPOS(router) {
  // Bootstrap: list events + gates from DB
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB.prepare(
        `SELECT id, slug, name FROM events ORDER BY id DESC`
      ).all();
      const events = (evQ.results || []).map(r => ({ id:r.id, slug:r.slug, name:r.name }));

      // 🔹 Adjust this SELECT if your table/columns differ (e.g. entry_gates)
      // If gates are per event, add WHERE event_id = ? and pass one if needed.
      const gQ = await env.DB.prepare(
        `SELECT id, name FROM gates ORDER BY id ASC`
      ).all();
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

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())`
      ).bind(event_id, cashier_name, gate_id, opening_float_cents).run();

      return json({ ok:true, session_id: r.meta.last_row_id });
    })
  );

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
}
