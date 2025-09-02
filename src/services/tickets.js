// /src/services/tickets.js
// Ticket issuance for paid orders

// QR payload: we store a unique, opaque string in tickets.qr.
// It can be a random base36 plus HMAC suffix for integrity if you like.
// For now, random base36 with a short prefix is fine; scanning uses the DB lookup.

function randCode(len = 10) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

async function orderExists(db, order_id) {
  const row = await db.prepare("SELECT id FROM orders WHERE id=?").bind(Number(order_id)).first();
  return !!row;
}

async function ticketsForOrder(db, order_id) {
  const rows = await db
    .prepare(`SELECT id, qr, ticket_type_id, attendee_first, attendee_last, state
              FROM tickets WHERE order_id=? ORDER BY id`)
    .bind(Number(order_id))
    .all();
  return rows.results || [];
}

async function createTicketsForOrder(db, order_id) {
  // 1) read order + items
  const ord = await db
    .prepare(`SELECT id, event_id, contact_json FROM orders WHERE id=?`)
    .bind(Number(order_id))
    .first();
  if (!ord) throw new Error("Order not found");

  const items = await db
    .prepare(`SELECT ticket_type_id, qty, price_cents FROM order_items WHERE order_id=? ORDER BY id`)
    .bind(Number(order_id))
    .all();
  const lines = items.results || [];
  if (!lines.length) throw new Error("Order has no items");

  // 2) default holder from contact (optional)
  let contact = {};
  try { contact = JSON.parse(ord.contact_json || "{}"); } catch {}
  const defFirst = contact.first_name || "";
  const defLast  = contact.last_name  || (contact.name || "");
  const defPhone = contact.phone || null;
  const defEmail = contact.email || null;

  // 3) generate tickets
  const ins = await db.prepare(
    `INSERT INTO tickets (order_id, event_id, ticket_type_id,
                          attendee_first, attendee_last, email, phone,
                          qr, state, issued_at)
     VALUES (?,?,?,?,?,?,?,?, 'unused', unixepoch())`
  );

  const created = [];

  for (const li of lines) {
    const qty = Math.max(0, Number(li.qty) || 0);
    for (let i = 0; i < qty; i++) {
      // Ensure uniqueness even under concurrency: loop until insert succeeds
      let qr = "";
      for (let tries = 0; tries < 5; tries++) {
        qr = `VS-${randCode(6)}${Date.now().toString(36).slice(-3).toUpperCase()}`;
        try {
          await ins
            .bind(
              Number(order_id),
              Number(ord.event_id),
              Number(li.ticket_type_id),
              defFirst,
              defLast,
              defEmail,
              defPhone,
              qr
            )
            .run();
          created.push({ qr, ticket_type_id: Number(li.ticket_type_id) });
          break;
        } catch (e) {
          // likely unique constraint on qr — retry
          if (tries === 4) throw e;
        }
      }
    }
  }

  return created;
}

export async function ensureTicketsIssuedForOrder(db, order_id) {
  if (!(await orderExists(db, order_id))) throw new Error("Order not found");
  const prev = await ticketsForOrder(db, order_id);
  if (prev.length) return prev; // already issued
  await createTicketsForOrder(db, order_id);
  return ticketsForOrder(db, order_id);
}

export async function listTicketsForOrder(db, order_id) {
  return ticketsForOrder(db, order_id);
}

// Later: delivery via Email / WhatsApp
export async function deliverTickets(_env, _order_id, _tickets) {
  // TODO:
  // - Build per-ticket links: `/t/${qr}`
  // - If WhatsApp is enabled: send message with links
  // - Else email via MailChannels (env.MAILCHANNELS_SENDER)
  return { ok: true };
}
