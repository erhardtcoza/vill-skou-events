// src/routes/scan.js
import { Router } from "../router.js";
import { nowTs } from "../utils/time.js";

export function mountScan(router, env) {
  const r = new Router();

  r.get("/diag", async () => Response.json({ ok: true, scanner: "ready" }));

  /* ---------- Gates list for UI ---------- */
  r.get("/gates", async () => {
    try {
      const q = await env.DB.prepare(
        `SELECT id, event_id, name
           FROM gates
          ORDER BY event_id ASC, id ASC`
      ).all();
      return Response.json({ ok: true, gates: q.results || [] });
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  });

  /* ---------- Unified smart scan endpoint for UI ---------- */
  // Body: { code, gate_id, gender? }
  r.post("/scan", async (req) => {
    let b; try { b = await req.json(); } catch { return Response.json({ ok:false, error:"Bad JSON" }, { status: 400 }); }
    const code = String(b?.code || "").trim();
    const gate_id = Number(b?.gate_id || 0);
    const providedGender = (b?.gender ? String(b.gender) : "").trim() || null;

    if (!code) return Response.json({ ok:false, error:"code required" }, { status: 400 });

    try {
      const t = await env.DB.prepare(
        `SELECT t.id, t.qr, t.state, t.issued_at, t.first_in_at, t.last_out_at,
                t.order_id, t.event_id, t.ticket_type_id, t.gender,
                tt.name AS ticket_type_name, tt.code AS ticket_type_code, tt.requires_gender,
                o.status AS order_status,
                e.starts_at, e.ends_at
           FROM tickets t
           JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN orders o       ON o.id = t.order_id
      LEFT JOIN events e       ON e.id = t.event_id
          WHERE t.qr = ?1
          LIMIT 1`
      ).bind(code).first();

      if (!t) return Response.json({ ok:false, reason:"not_found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok:false, reason:"void" }, { status: 400 });

      // Require paid order
      if ((t.order_status || "").toLowerCase() !== "paid") {
        return Response.json({ ok:false, reason:"unpaid" }, { status: 400 });
      }

      // Optional date window check (only if starts/ends present)
      const now = nowTs();
      if (Number(t.starts_at || 0) && Number(t.ends_at || 0)) {
        if (now < Number(t.starts_at) || now > Number(t.ends_at)) {
          return Response.json({ ok:false, reason:"wrong_date" }, { status: 400 });
        }
      }

      // Gender required flow
      if (Number(t.requires_gender || 0) === 1 && !t.gender && !providedGender) {
        return Response.json({
          ok: true,
          need_gender: true,
          ticket: { name: t.ticket_type_name, type: t.ticket_type_code, qr: t.qr }
        });
      }
      if (Number(t.requires_gender || 0) === 1 && !t.gender && providedGender) {
        await env.DB.prepare(`UPDATE tickets SET gender=?1 WHERE id=?2`).bind(providedGender, t.id).run();
      }

      // Toggle in/out
      const ts = nowTs();
      if (t.state === "in") {
        await env.DB.prepare(`UPDATE tickets SET state='out', last_out_at=?1 WHERE id=?2`).bind(ts, t.id).run();
        return Response.json({ ok:true, action:"out", ticket:{ name: t.ticket_type_name, qr: t.qr } });
      } else {
        await env.DB.prepare(
          `UPDATE tickets SET state='in', first_in_at=COALESCE(first_in_at, ?1) WHERE id=?2`
        ).bind(ts, t.id).run();
        return Response.json({ ok:true, action:"in", ticket:{ name: t.ticket_type_name, qr: t.qr } });
      }
    } catch (e) {
      return Response.json({ ok:false, error:String(e?.message||e) }, { status: 500 });
    }
  });

  /* ---------- Compatibility endpoints you already had ---------- */

  // Lookup by QR
  // Body: { qr }
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
        WHERE t.qr = ?1
        LIMIT 1
      `).bind(qr).first();

      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      return Response.json({ ok: true, ticket: t });
    } catch (err) {
      console.error("SCAN /lookup error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Enter (gate-in)
  // Body: { qr }
  r.post("/enter", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`SELECT id, state, first_in_at FROM tickets WHERE qr=?1`).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: false, error: "ticket void" }, { status: 400 });

      const ts = nowTs();
      await env.DB.prepare(
        `UPDATE tickets SET state='in', first_in_at = COALESCE(first_in_at, ?1) WHERE id = ?2`
      ).bind(ts, t.id).run();

      return Response.json({ ok: true, state: "in", first_in_at: t.first_in_at ?? ts });
    } catch (err) {
      console.error("SCAN /enter error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Exit (gate-out)
  // Body: { qr }
  r.post("/exit", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(`SELECT id, state FROM tickets WHERE qr=?1`).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: false, error: "ticket void" }, { status: 400 });

      const ts = nowTs();
      await env.DB.prepare(`UPDATE tickets SET state='out', last_out_at=?1 WHERE id=?2`).bind(ts, t.id).run();

      return Response.json({ ok: true, state: "out", last_out_at: ts });
    } catch (err) {
      console.error("SCAN /exit error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  // Toggle (smart scan)
  // Body: { qr }
  r.post("/toggle", async (req) => {
    try {
      const { qr } = await req.json();
      if (!qr) return Response.json({ ok: false, error: "qr required" }, { status: 400 });

      const t = await env.DB.prepare(
        `SELECT id, state, first_in_at FROM tickets WHERE qr=?1 LIMIT 1`
      ).bind(qr).first();
      if (!t) return Response.json({ ok: false, error: "ticket not found" }, { status: 404 });
      if (t.state === "void") return Response.json({ ok: false, error: "ticket void" }, { status: 400 });

      const ts = nowTs();
      if (t.state === "in") {
        await env.DB.prepare(`UPDATE tickets SET state='out', last_out_at=?1 WHERE id=?2`).bind(ts, t.id).run();
        return Response.json({ ok:true, state:"out", last_out_at: ts });
      } else {
        await env.DB.prepare(
          `UPDATE tickets SET state='in', first_in_at = COALESCE(first_in_at, ?1) WHERE id=?2`
        ).bind(ts, t.id).run();
        return Response.json({ ok:true, state:"in", first_in_at: t.first_in_at ?? ts });
      }
    } catch (err) {
      console.error("SCAN /toggle error:", err);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  });

  router.mount("/api/scan", r);
}