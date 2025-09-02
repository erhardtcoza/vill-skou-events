// /src/services/notify.js
const MC_ENDPOINT = "https://api.mailchannels.net/tx/v1/send";

function moneyR(cents){ return "R " + (Number(cents||0)/100).toFixed(2); }

function ticketListHTML(event, tickets) {
  if (!tickets?.length) return "<p>No tickets issued.</p>";
  return `<ul>${tickets.map(t => {
    const link = `/t/${encodeURIComponent(t.qr)}`;
    return `<li><a href="${link}">${event?.name || 'Ticket'} — ${t.qr}</a></li>`;
  }).join("")}</ul>`;
}

function buildEmailHTML(settings, order, event, items, total_cents, tickets) {
  const logo = settings?.logo_url ? `<img src="${settings.logo_url}" alt="logo" height="34" />` : (settings?.name || "Villiersdorp Skou Tickets");
  const when = event?.starts_at ? new Date(event.starts_at*1000).toLocaleString() : "";
  const lines = (items||[]).map(i => `<tr><td>${i.name||'Ticket'}</td><td style="text-align:right">${i.qty} × R ${(i.price_cents/100).toFixed(2)}</td></tr>`).join("");
  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;">${logo}</div>
    <h2 style="margin:16px 0;">Your tickets for ${event?.name || 'the event'}</h2>
    <p>Order #${order?.id}${order?.short_code ? ' · ' + order.short_code : ''}</p>
    <p><strong>When:</strong> ${when}${event?.venue ? ' · ' + event.venue : ''}</p>
    <table style="width:100%;border-collapse:collapse">${lines}
      <tr><td style="border-top:1px solid #eee;padding-top:8px"><strong>Total</strong></td><td style="text-align:right;border-top:1px solid #eee;padding-top:8px"><strong>${moneyR(total_cents)}</strong></td></tr>
    </table>
    <h3>Tickets</h3>
    ${ticketListHTML(event, tickets)}
    <p style="color:#6b7280;font-size:12px">Show the QR on your phone at the gate. Re-entry is supported (IN/OUT).</p>
  </div>`;
}

export async function sendTicketEmail(env, { order, event, items, total_cents, tickets }) {
  // Skip if no email
  const toEmail = (order?.buyer_email || "").trim();
  if (!toEmail) return { ok: true, skipped: "no_email" };

  // Load site settings once
  const settings = await env.DB.prepare("SELECT * FROM settings LIMIT 1").first().catch(()=>null);

  const subject = `${event?.name || 'Your tickets'} — ${order?.short_code ? order.short_code+' · ' : ''}#${order?.id || ''}`;
  const html = buildEmailHTML(settings, order, event, items, total_cents, tickets);

  const fromEmail = env.MAILCHANNELS_SENDER || "tickets@villiersdorpskou.co.za";
  const payload = {
    personalizations: [{ to: [{ email: toEmail, name: order?.buyer_name || "" }] }],
    from: { email: fromEmail, name: settings?.name || (env.APP_NAME || "Villiersdorp Skou Tickets") },
    subject,
    content: [{ type: "text/html", value: html }]
  };

  const res = await fetch(MC_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  return { ok: res.ok, status: res.status };
}

// Placeholder; wire to WhatsApp Business once verified.
export async function sendTicketWhatsApp(_env, { order, tickets }) {
  if (!order?.buyer_phone) return { ok: true, skipped: "no_phone" };
  // In future: call WA API with links like `${origin}/t/${encodeURIComponent(t.qr)}`
  return { ok: true, stub: true };
}

// Convenience for other modules
export async function notifyTicketsPaid(env, order_id) {
  // Load order+event+items+tickets
  const order = await env.DB.prepare(
    `SELECT o.*, e.name AS ev_name, e.starts_at, e.ends_at, e.venue, e.slug, e.hero_url, e.poster_url
     FROM orders o JOIN events e ON e.id=o.event_id WHERE o.id=?1`
  ).bind(order_id).first();
  if (!order) return { ok:false, error:"order_not_found" };

  let items = [];
  try { items = JSON.parse(order.items_json || "[]"); } catch {}
  // hydrate items for names/prices
  const out = [];
  for (const it of items) {
    const tt = await env.DB.prepare("SELECT id,name,price_cents FROM ticket_types WHERE id=?1").bind(it.ticket_type_id).first();
    if (tt) out.push({ ticket_type_id: tt.id, name: tt.name, price_cents: tt.price_cents, qty: it.qty });
  }
  const tickets = (await env.DB.prepare("SELECT id, qr FROM tickets WHERE order_id=?1").bind(order_id).all()).results || [];

  const event = {
    id: order.event_id,
    name: order.ev_name,
    starts_at: order.starts_at,
    ends_at: order.ends_at,
    venue: order.venue,
    slug: order.slug,
    hero_url: order.hero_url,
    poster_url: order.poster_url
  };

  const email = await sendTicketEmail(env, {
    order, event, items: out, total_cents: order.total_cents, tickets
  });

  const wa = await sendTicketWhatsApp(env, { order, tickets });

  return { ok:true, email, wa };
}