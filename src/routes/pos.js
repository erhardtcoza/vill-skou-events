// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";

/** Minimal CORS helper so fetch() never gets a CF HTML error page */
function withCORS(resp) {
  try {
    resp.headers.set("Access-Control-Allow-Origin", "*");
    resp.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    resp.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  } catch {}
  return resp;
}

export function mountPOS(router) {
  // Preflight for any API path (important for fetch() + JSON)
  router.add("OPTIONS", "/api/*", async () =>
    withCORS(new Response("", { status: 204 }))
  );

  // Bootstrap: list events + gates from DB
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB
        .prepare(`SELECT id, slug, name FROM events ORDER BY id DESC`)
        .all();
      const events = (evQ.results || []).map(r => ({
        id: r.id, slug: r.slug, name: r.name,
      }));

      // If your table is named differently (e.g. entry_gates), adjust below.
      const gQ = await env.DB
        .prepare(`SELECT id, name FROM gates ORDER BY id ASC`)
        .all();
      const gates = (gQ.results || []).map(r => ({ id: r.id, name: r.name }));

      return withCORS(json({ ok: true, events, gates }));
    })
  );

  // Open session — matches your schema: event_id, gate_id, cashier_name, opening_float_cents
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return withCORS(bad("Bad JSON")); }

      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      // NOTE: we intentionally do NOT write cashier_phone (not in your table)

      if (!cashier_name) return withCORS(bad("cashier_name required"));
      if (!event_id)     return withCORS(bad("event_id required"));
      if (!gate_id)      return withCORS(bad("gate_id required"));

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())`
      ).bind(event_id, cashier_name, gate_id, opening_float_cents).run();

      return withCORS(json({ ok: true, session_id: r.meta.last_row_id }));
    })
  );

  // Close session
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return withCORS(bad("Bad JSON")); }
      const session_id = Number(b?.session_id || 0);
      const closing_manager = String(b?.closing_manager || "").trim();
      if (!session_id) return withCORS(bad("session_id required"));

      await env.DB.prepare(
        `UPDATE pos_sessions
           SET closed_at = unixepoch(),
               closing_manager = COALESCE(NULLIF(?1,''), closing_manager)
         WHERE id = ?2`
      ).bind(closing_manager, session_id).run();

      return withCORS(json({ ok: true }));
    })
  );
}
