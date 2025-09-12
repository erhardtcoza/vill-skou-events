// src/routes/scan.js
import { Router } from "../router.js";
import { nowTs } from "../utils/time.js";

export function mountScan(router, env) {
  const r = new Router();

  r.get("/diag", async () => Response.json({ ok: true, scanner: "ready" }));

  // Lookup by QR
  r.post("/lookup", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`
        SELECT t.id, t.qr, t.state, t.issued_at, t.first_in_at, t.last_out_at,
               t.order_id, t.event_id, t.ticket_type_id,
               tt.name AS ticket_type_name, tt.code AS ticket_type_code
        FROM tickets t
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.qr = ?
      `).bind(qr).first();

      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      return Response.json({ ok: true, ticket: t });
    } catch (err) {
      console.error("SCAN /lookup error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Enter (gate-in)
  r.post("/enter", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`SELECT id, state, first_in_at FROM tickets WHERE qr=?`).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: false, error: "ticket void" }, { status: 400 });

      const ts = nowTs();
      await env.DB.prepare(`
        UPDATE tickets SET state='in', first_in_at = COALESCE(first_in_at, ?)
        WHERE id = ?
      `).bind(ts, t.id).run();

      return Response.json({ ok: true, state: "in", first_in_at: t.first_in_at ?? ts });
    } catch (err) {
      console.error("SCAN /enter error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Exit (gate-out)
  r.post("/exit", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`SELECT id, state FROM tickets WHERE qr=?`).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: false, error: "ticket void" }, { status: 400 });

      const ts = nowTs();
      await env.DB.prepare(`UPDATE tickets SET state='out', last_out_at=? WHERE id=?`).bind(ts, t.id).run();

      return Response.json({ ok: true, state: "out", last_out_at: ts });
    } catch (err) {
      console.error("SCAN /exit error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Toggle: if in -> out; if unused/out -> in
  r.post("/toggle", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`SELECT id, state, first_in_at FROM tickets WHERE qr=?`).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: false, error: "ticket void" }, { status: 400 });

      const ts = nowTs();
      if (t.state === "in") {
        await env.DB.prepare(`UPDATE tickets SET state='out', last_out_at=? WHERE id=?`).bind(ts, t.id).run();
        return Response.json({ ok: true, action: "exit", state: "out", last_out_at: ts });
      } else {
        await env.DB.prepare(`
          UPDATE tickets SET state='in', first_in_at = COALESCE(first_in_at, ?)
          WHERE id=?
        `).bind(ts, t.id).run();
        return Response.json({ ok: true, action: "enter", state: "in", first_in_at: t.first_in_at ?? ts });
      }
    } catch (err) {
      console.error("SCAN /toggle error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  router.mount("/api/scan", r);
}