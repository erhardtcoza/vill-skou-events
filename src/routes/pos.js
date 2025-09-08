// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";

/** POS endpoints */
export function mountPOS(router) {
  // Bootstrap: events + gates
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      try {
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
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  // Open session (schema: pos_sessions has event_id, cashier_name, gate_id, opening_float_cents, opened_at, closing_manager?, closed_at?)
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b;
      try { b = await req.json(); }
      catch { return bad("Bad JSON"); }

      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      // Accept but DO NOT write to DB (column may not exist yet)
      const _cashier_msisdn = String(b?.cashier_msisdn || "").trim();

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      try {
        const r = await env.DB.prepare(
          `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
           VALUES (?1, ?2, ?3, ?4, unixepoch())`
        ).bind(event_id, cashier_name, gate_id, opening_float_cents).run();

        return json({ ok: true, session_id: r.meta.last_row_id });
      } catch (e) {
        // Always return JSON so the UI never tries to parse HTML
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  // Close session (optional manager name)
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b;
      try { b = await req.json(); }
      catch { return bad("Bad JSON"); }
      const session_id = Number(b?.session_id || 0);
      const closing_manager = String(b?.closing_manager || "").trim();
      if (!session_id) return bad("session_id required");

      try {
        await env.DB.prepare(
          `UPDATE pos_sessions
             SET closed_at = unixepoch(),
                 closing_manager = COALESCE(NULLIF(?1,''), closing_manager)
           WHERE id = ?2`
        ).bind(closing_manager, session_id).run();

        return json({ ok: true });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );
}
