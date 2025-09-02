// /src/routes/scan.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

async function findTicketByQR(db, qr) {
  return await db.prepare(
    `SELECT t.*, tt.name AS tt_name, o.event_id AS ord_event_id
     FROM tickets t
     JOIN ticket_types tt ON tt.id=t.ticket_type_id
     LEFT JOIN orders o ON o.id=t.order_id
     WHERE t.qr=?1`
  ).bind(qr).first();
}

async function markScan(db, { qr, direction, gate_name }) {
  const t = await findTicketByQR(db, qr);
  if (!t) return { ok:false, code:"not_found", msg:"Ticket not found" };

  // Basic anti-replay: if direction==in and already 'in', warn; if out but not in, warn
  const now = Math.floor(Date.now()/1000);
  if (direction === "in") {
    if (t.state === "in") {
      // Already in – convert to 'out' if you want a toggle behavior; here we treat as duplicate
      return { ok:false, code:"already_in", msg:"Already scanned IN" };
    }
    await db.prepare(
      `UPDATE tickets SET state='in', first_in_at=COALESCE(first_in_at, ?1) WHERE id=?2`
    ).bind(now, t.id).run();
    return { ok:true, state:"in", tt_name: t.tt_name };
  } else {
    // direction === "out"
    if (t.state === "out" || t.state === "unused") {
      return { ok:false, code:"not_in", msg:"Ticket not IN" };
    }
    await db.prepare(`UPDATE tickets SET state='out', last_out_at=?1 WHERE id=?2`)
      .bind(now, t.id).run();
    return { ok:true, state:"out", tt_name: t.tt_name };
  }
}

export function mountScan(router, opts = {}) {
  const guard = opts.protectWith || ((h)=>h);

  // Single scan mark
  router.add("POST", "/api/scan/mark", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.qr || !b?.direction) return bad("Invalid");
    const res = await markScan(env.DB, {
      qr: String(b.qr),
      direction: b.direction === "out" ? "out" : "in",
      gate_name: (b.gate_name||"").trim()
    });
    if (!res.ok) return json({ ok:false, error: res.msg, code: res.code }, 400);
    return json({ ok:true, state: res.state, tt_name: res.tt_name });
  }));

  // Batch sync (offline queue)
  // Body: { events: [{ qr, direction, gate_name, ts }] }
  router.add("POST", "/api/scan/sync", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    const list = Array.isArray(b?.events) ? b.events : [];
    let okCount = 0;
    for (const ev of list) {
      try {
        const res = await markScan(env.DB, {
          qr: String(ev.qr || ""),
          direction: ev.direction === "out" ? "out" : "in",
          gate_name: (ev.gate_name||"").trim()
        });
        if (res.ok) okCount++;
      } catch {}
    }
    return json({ ok:true, accepted: okCount, total: list.length });
  }));
}