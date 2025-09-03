// /src/routes/scan.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/* ---------- Tickets ---------- */
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

async function markTicketScan(db, { qr, direction }) {
  const t = await findTicketByQR(db, qr);
  if (!t) return { kind:"ticket", ok:false, code:"not_found", msg:"Ticket not found" };
  const now = Math.floor(Date.now()/1000);

  if (direction === "in") {
    if (t.state === "in") return { kind:"ticket", ok:false, code:"already_in", msg:"Already scanned IN", tt_name: t.tt_name, event_id: t.event_id };
    await db.prepare(`UPDATE tickets SET state='in', first_in_at=COALESCE(first_in_at, ?1) WHERE id=?2`).bind(now, t.id).run();
    return { kind:"ticket", ok:true, state:"in", tt_name: t.tt_name, event_id: t.event_id };
  } else {
    if (t.state === "out" || t.state === "unused") return { kind:"ticket", ok:false, code:"not_in", msg:"Ticket not IN", tt_name: t.tt_name, event_id: t.event_id };
    await db.prepare(`UPDATE tickets SET state='out', last_out_at=?1 WHERE id=?2`).bind(now, t.id).run();
    return { kind:"ticket", ok:true, state:"out", tt_name: t.tt_name, event_id: t.event_id };
  }
}

/* ---------- Vendors ---------- */
async function findVendorPassByQR(db, qr) {
  return await db.prepare(
    `SELECT vp.*, v.name AS vendor_name
     FROM vendor_passes vp
     JOIN vendors v ON v.id = vp.vendor_id
     WHERE vp.qr=?1`
  ).bind(qr).first();
}

async function markVendorScan(db, { qr, direction }) {
  const p = await findVendorPassByQR(db, qr);
  if (!p) return { kind:"vendor", ok:false, code:"not_found", msg:"Pass not found" };
  const now = Math.floor(Date.now()/1000);

  if (direction === "in") {
    if (p.state === "in") return { kind:"vendor", ok:false, code:"already_in", msg:"Already scanned IN", label: p.label, vendor_name: p.vendor_name, type: p.type };
    await db.prepare(`UPDATE vendor_passes SET state='in', first_in_at=COALESCE(first_in_at, ?1) WHERE id=?2`).bind(now, p.id).run();
    return { kind:"vendor", ok:true, state:"in", label: p.label, vendor_name: p.vendor_name, type: p.type };
  } else {
    if (p.state === "out" || p.state === "unused") return { kind:"vendor", ok:false, code:"not_in", msg:"Pass not IN", label: p.label, vendor_name: p.vendor_name, type: p.type };
    await db.prepare(`UPDATE vendor_passes SET state='out', last_out_at=?1 WHERE id=?2`).bind(now, p.id).run();
    return { kind:"vendor", ok:true, state:"out", label: p.label, vendor_name: p.vendor_name, type: p.type };
  }
}

export function mountScan(router, opts = {}) {
  const guard = opts.protectWith || ((h)=>h);

  router.add("POST", "/api/scan/mark", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.qr || !b?.direction) return bad("Invalid");

    // 1) Try tickets
    let res = await markTicketScan(env.DB, { qr: String(b.qr), direction: b.direction === "out" ? "out" : "in" });
    if (res.ok) {
      const totals = res.event_id ? await totalsForEvent(env.DB, res.event_id) : null;
      return json({ ok:true, state: res.state, tt_name: res.tt_name, totals, kind:"ticket" });
    }

    // 2) If no ticket, try vendor pass
    if (res.code === "not_found") {
      res = await markVendorScan(env.DB, { qr: String(b.qr), direction: b.direction === "out" ? "out" : "in" });
      if (res.ok) {
        // Vendor passes do not have event totals (null)
        return json({ ok:true, state: res.state, kind:"vendor", vendor_name: res.vendor_name, label: res.label, pass_type: res.type, totals: null });
      }
    }

    // Return best error we have (ticket/vendor)
    return json({ ok:false, error: res.msg, code: res.code, kind: res.kind }, 400);
  }));

  router.add("POST", "/api/scan/sync", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    const list = Array.isArray(b?.events) ? b.events : [];
    let okCount = 0;
    for (const ev of list) {
      try {
        let r = await markTicketScan(env.DB, { qr: String(ev.qr||""), direction: ev.direction === "out" ? "out" : "in" });
        if (!r.ok && r.code === "not_found") {
          r = await markVendorScan(env.DB, { qr: String(ev.qr||""), direction: ev.direction === "out" ? "out" : "in" });
        }
        if (r.ok) okCount++;
      } catch {}
    }
    return json({ ok:true, accepted: okCount, total: list.length });
  }));
}
