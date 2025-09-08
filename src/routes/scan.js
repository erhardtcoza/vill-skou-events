// /src/routes/scan.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountScan(router){

  // Lookup by QR (tickets.qr OR vendor_passes.qr OR passes.qr)
  router.add("GET", "/api/scan/lookup/:code", requireRole("scan", async (_req, env, _ctx, { code }) => {
    const c = String(code || "").trim().toUpperCase();

    // 1) Ticket by qr
    {
      const q = await env.DB.prepare(
        `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last,
                tt.name AS type_name
           FROM tickets t
           JOIN ticket_types tt ON tt.id = t.ticket_type_id
          WHERE UPPER(t.qr) = ?1
          LIMIT 1`
      ).bind(c).all();
      const t = (q.results || [])[0];
      if (t) return json({ ok:true, kind:"ticket", ticket:t });
    }

    // 2) Vendor pass (vendor_passes)
    {
      const q = await env.DB.prepare(
        `SELECT id, qr, state, type, label, vehicle_reg
           FROM vendor_passes
          WHERE UPPER(qr) = ?1
          LIMIT 1`
      ).bind(c).all();
      const v = (q.results || [])[0];
      if (v) return json({ ok:true, kind:"vendor_pass", pass:v });
    }

    // 3) Generic passes table
    {
      const q = await env.DB.prepare(
        `SELECT id, qr, state, kind, holder_name, vehicle_reg
           FROM passes
          WHERE UPPER(qr) = ?1
          LIMIT 1`
      ).bind(c).all();
      const p = (q.results || [])[0];
      if (p) return json({ ok:true, kind:"pass", pass:p });
    }

    return bad("Not found", 404);
  }));

  // Mark IN/OUT for ticket / vendor_pass / pass
  // Body: { kind: 'ticket'|'vendor_pass'|'pass', id: number, action: 'IN'|'OUT' }
  router.add("POST", "/api/scan/mark", requireRole("scan", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const kind = String(b?.kind||'');
    const id = Number(b?.id||0);
    const action = String(b?.action||'').toUpperCase();
    if (!id || !['ticket','vendor_pass','pass'].includes(kind)) return bad("Invalid kind/id");
    if (!['IN','OUT'].includes(action)) return bad("Invalid action");

    const now = Math.floor(Date.now()/1000);
    let sql = "", bind = [];
    if (kind === 'ticket'){
      sql = (action==='IN')
        ? `UPDATE tickets SET state='in', first_in_at=COALESCE(first_in_at, ?2) WHERE id=?1`
        : `UPDATE tickets SET state='out', last_out_at=?2 WHERE id=?1`;
      bind = [id, now];
    } else if (kind === 'vendor_pass'){
      sql = (action==='IN')
        ? `UPDATE vendor_passes SET state='in', first_in_at=COALESCE(first_in_at, ?2) WHERE id=?1`
        : `UPDATE vendor_passes SET state='out', last_out_at=?2 WHERE id=?1`;
      bind = [id, now];
    } else {
      // passes
      sql = (action==='IN')
        ? `UPDATE passes SET state='in', first_in_at=COALESCE(first_in_at, ?2) WHERE id=?1`
        : `UPDATE passes SET state='out', last_out_at=?2 WHERE id=?1`;
      bind = [id, now];
    }

    await env.DB.prepare(sql).bind(...bind).run();
    return json({ ok:true });
  }));
}
