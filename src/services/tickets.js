import { q, qi } from "../env.js";
import { buildPayload, signPayload, isoPlusDays, rand } from "../utils/hmac.js";

export async function issueTickets(db, secret, order_id, event_id, items, attendees) {
  // issue N tickets per item.qty, pairing attendees by array order
  let idx = 0, tickets = [];
  for (const it of items) {
    for (let i=0; i<it.qty; i++) {
      const att = attendees[idx] || {};
      const id = await qi(db, `
        INSERT INTO tickets (order_id,event_id,ticket_type_id,attendee_first,attendee_last,gender,email,phone,qr,state)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        order_id, event_id, it.ticket_type_id, att.first||null, att.last||null, att.gender||null, att.email||null, att.phone||null, "tmp", "unused");
      const base = buildPayload("t", id, isoPlusDays(7), rand());
      const qr = await signPayload(secret, base);
      await qi(db, `UPDATE tickets SET qr=? WHERE id=?`, qr, id);
      const row = (await q(db, `SELECT * FROM tickets WHERE id=?`, id))[0];
      tickets.push(row);
      idx++;
    }
  }
  return tickets;
}

export async function findTicketByQR(db, qr) {
  const rows = await q(db, "SELECT * FROM tickets WHERE qr=?", qr);
  return rows[0] || null;
}
