// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";

export function mountPOS(router) {
  // ───────────────────────────────────────────────────────────────
  // Bootstrap: return events and gates (gracefully handles missing gates table)
  // ───────────────────────────────────────────────────────────────
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      try {
        // Events
        const evQ = await env.DB.prepare(
          `SELECT id, slug, name FROM events ORDER BY id DESC`
        ).all();
        const events = (evQ.results || []).map(r => ({
          id: r.id, slug: r.slug, name: r.name
        }));

        // Gates — some DBs may not have a "gates" table (yet)
        let gates = [];
        let gates_error = undefined;
        try {
          const gQ = await env.DB.prepare(
            `SELECT id, name FROM gates ORDER BY id ASC`
          ).all();
          gates = (gQ.results || []).map(r => ({ id: r.id, name: r.name }));
        } catch (e) {
          // Soft-fail: UI can still work; user can choose a default gate or DB can be migrated later
          gates_error = String(e?.message || e) || "gates select failed";
          gates = [];
        }

        return json({ ok: true, events, gates, gates_error });
      } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  // ───────────────────────────────────────────────────────────────
  // Open session  (matches your schema: event_id, cashier_name, gate_id, opening_float_cents, opened_at)
  // ───────────────────────────────────────────────────────────────
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b;
      try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id)     return bad("event_id required");
      if (!gate_id)      return bad("gate_id required");

      try {
        const r = await env.DB.prepare(
          `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
           VALUES (?1, ?2, ?3, ?4, unixepoch())`
        ).bind(event_id, cashier_name, gate_id, opening_float_cents).run();

        return json({ ok: true, session_id: r.meta.last_row_id });
      } catch (e) {
        // Surface the *real* D1 error to the UI
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    })
  );

  // ───────────────────────────────────────────────────────────────
  // Close session
  // ───────────────────────────────────────────────────────────────
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b;
      try { b = await req.json(); } catch { return bad("Bad JSON"); }

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

  // Optional: quick health endpoint to see DB errors in plain text from the browser
  router.add("GET", "/api/pos/health", async (_req, env) => {
    try {
      const r = await env.DB.prepare("SELECT 1 AS ok").all();
      return json({ ok: true, d1: r.results?.[0]?.ok === 1 });
    } catch (e) {
      return json({ ok: false, error: String(e?.message || e) }, 500);
    }
  });
}
