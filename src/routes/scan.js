// /src/routes/scan.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

async function findTicketByQR(db, qr) {
  return await db.prepare(
    `SELECT t.*, tt.name AS tt_name
     FROM tickets t
     JOIN ticket_types tt ON tt.id=t.ticket_type_id
     WHERE t.qr=?1`
  ).bind(qr).first();
}

async function totalsForEvent(db, event_id){
  const rIn  = await db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE event_id=?1 AND state='in'`).bind(event_id).first();
  const rOut = await db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE event_id=?1 AND state='out'`).bind(event_id).first();
  return { in: Number(rIn?.c||0), out: Number(rOut?.c||0) };
}

async function markScan(db, { qr, direction }) {
  const t = await findTicketByQR(db, qr);
  if (!t) return { ok:false, code:"not_found", msg:"Ticket not found" };
  const now = Math.floor(Date.now()/1000);

  if (direction === "in") {
    if (t.state === "in") return { ok:false, code:"already_in", msg:"Already scanned IN", tt_name: t.tt_name, event_id: t.event_id };
    await db.prepare(`UPDATE tickets SET state='in', first_in_at=COALESCE(first_in_at, ?1) WHERE id=?2`).bind(now, t.id).run();
    return { ok:true, state:"in", tt_name: t.tt_name, event_id: t.event_id };
  } else {
    if (t.state === "out" || t.state === "unused") return { ok:false, code:"not_in", msg:"Ticket not IN", tt_name: t.tt_name, event_id: t.event_id };
    await db.prepare(`UPDATE tickets SET state='out', last_out_at=?1 WHERE id=?2`).bind(now, t.id).run();
    return { ok:true, state:"out", tt_name: t.tt_name, event_id: t.event_id };
  }
}

export function mountScan(router, opts = {}) {
  const guard = opts.protectWith || ((h)=>h);

  router.add("POST", "/api/scan/mark", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.qr || !b?.direction) return bad("Invalid");

    const res = await markScan(env.DB, { qr: String(b.qr), direction: b.direction === "out" ? "out" : "in" });
    if (!res.ok) {
      const t = res.event_id ? await totalsForEvent(env.DB, res.event_id) : null;
      return json({ ok:false, error: res.msg, code: res.code, tt_name: res.tt_name || null, totals: t }, 400);
    }
    const t = await totalsForEvent(env.DB, res.event_id);
    return json({ ok:true, state: res.state, tt_name: res.tt_name, totals: t });
  }));

  router.add("POST", "/api/scan/sync", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    const list = Array.isArray(b?.events) ? b.events : [];
    let okCount = 0;
    for (const ev of list) {
      try {
        const r = await markScan(env.DB, { qr: String(ev.qr||""), direction: ev.direction === "out" ? "out" : "in" });
        if (r.ok) okCount++;
      } catch {}
    }
    return json({ ok:true, accepted: okCount, total: list.length });
  }));
}
