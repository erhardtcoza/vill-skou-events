import { q, qi } from "../env.js";
import { verifyPayload } from "../utils/hmac.js";

export async function scanTicket(db, secret, qr, gate_id, device_id, collect) {
  const v = await verifyPayload(secret, qr);
  if (!v.ok) return { ok:false, error:v.error };

  // Only tickets in this v1 (passes later)
  if (v.type !== "t") return { ok:false, error:"Unsupported QR type" };

  const t = (await q(db, "SELECT * FROM tickets WHERE id=?", v.id))[0];
  if (!t) return { ok:false, error:"Ticket not found" };

  // Collect missing gender if required by ticket type
  const tt = (await q(db, "SELECT requires_gender FROM ticket_types WHERE id=?", t.ticket_type_id))[0];
  if (tt?.requires_gender && !t.gender && !collect?.gender) {
    return { ok:true, action:"collect", field:"gender", ticket:{ id:t.id, attendee_first:t.attendee_first, attendee_last:t.attendee_last } };
  }
  if (collect?.gender && !t.gender) {
    await qi(db, "UPDATE tickets SET gender=? WHERE id=?", collect.gender, t.id);
  }

  // IN/OUT logic
  if (t.state === "unused" || t.state === "out") {
    await qi(db, "UPDATE tickets SET state='in', first_in_at=COALESCE(first_in_at, unixepoch()) WHERE id=?", t.id);
    await qi(db, "INSERT INTO scans (ticket_id, gate_id, direction, device_id) VALUES (?,?, 'in', ?)", t.id, gate_id, device_id||null);
    const nowIn = (await q(db,"SELECT first_in_at,last_out_at FROM tickets WHERE id=?", t.id))[0];
    return { ok:true, action:"in", ticket_id:t.id, dwell_seconds: Math.max(0, (nowIn.last_out_at||nowIn.first_in_at) - nowIn.first_in_at) };
  }
  if (t.state === "in") {
    // Ask client to confirm OUT
    if (collect?.confirm === "out") {
      await qi(db, "UPDATE tickets SET state='out', last_out_at=unixepoch() WHERE id=?", t.id);
      await qi(db, "INSERT INTO scans (ticket_id, gate_id, direction, device_id) VALUES (?,?, 'out', ?)", t.id, gate_id, device_id||null);
      const rows = await q(db,"SELECT first_in_at,last_out_at FROM tickets WHERE id=?", t.id);
      const dwell = rows[0]?.last_out_at - rows[0]?.first_in_at;
      return { ok:true, action:"out", ticket_id:t.id, dwell_seconds: dwell };
    }
    return { ok:true, action:"prompt", prompt:"out", ticket_id:t.id };
  }
  return { ok:false, error:"Ticket void or unknown state" };
}
