// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import {
  computeTotalCents,
  hydrateItems,
  createPOSOrder,
  loadPendingOrderByCode,
} from "../services/orders.js";

/* ---------- Local helpers ---------- */

async function issueTicketsForOrder(db, order_id, event_id, items, buyer_phone) {
  // Local fallback used by POS sale path if needed
  const tickets = [];
  for (const it of items || []) {
    const qty = Number(it.qty || 0);
    const ttId = Number(it.ticket_type_id);
    if (!qty || !ttId) continue;
    for (let i = 0; i < qty; i++) {
      const qr = `O${order_id}-TT${ttId}-${i + 1}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const ins = await db
        .prepare(
          `INSERT INTO tickets (order_id, event_id, ticket_type_id, attendee_first, attendee_last, email, phone, qr, state, issued_at)
           VALUES (?1, ?2, ?3, '', '', '', ?4, ?5, 'unused', unixepoch())`
        )
        .bind(order_id, event_id, ttId, buyer_phone || "", qr)
        .run();
      tickets.push({ id: Number(ins.lastInsertRowid), qr });
    }
  }
  return tickets;
}

function moneyR(cents) {
  return "R " + (Number(cents || 0) / 100).toFixed(2);
}

/* ---------- Routes ---------- */

export function mountPOS(router) {
  // POS bootstrap (events + ticket types)
  router.add("POST", "/api/pos/bootstrap", async (_req, env) => {
    try {
      const events =
        (
          await env.DB
            .prepare(
              `SELECT id, slug, name, starts_at, ends_at, venue
               FROM events WHERE status='active' ORDER BY starts_at ASC`
            )
            .all()
        ).results || [];

      const tts =
        (
          await env.DB
            .prepare(
              `SELECT id, event_id, name, price_cents, requires_gender
               FROM ticket_types ORDER BY id`
            )
            .all()
        ).results || [];

      const byEvent = {};
      for (const t of tts) (byEvent[t.event_id] ||= []).push(t);

      return json({ ok: true, events, ticket_types_by_event: byEvent });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Open cashup session
  router.add("POST", "/api/pos/cashups/open", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const cashier = (b.cashier_name || "").trim();
    const gate = (b.gate_name || "").trim();
    const openingFloatCents = Math.round(Number(b.opening_float_rands || 0) * 100);
    if (!cashier || !gate) return bad("Missing cashier_name or gate_name");

    try {
      const existing = await env.DB
        .prepare(
          `SELECT id FROM pos_cashups
           WHERE cashier_name=?1 AND gate_name=?2 AND closed_at IS NULL
           ORDER BY opened_at DESC LIMIT 1`
        )
        .bind(cashier, gate)
        .first();
      if (existing) return json({ ok: true, id: existing.id, reused: true });

      const res = await env.DB
        .prepare(
          `INSERT INTO pos_cashups (cashier_name, gate_name, opening_float_cents, opened_at)
           VALUES (?1,?2,?3,unixepoch())`
        )
        .bind(cashier, gate, openingFloatCents)
        .run();

      return json({ ok: true, id: Number(res.lastInsertRowid) });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Close cashup
  router.add("POST", "/api/pos/cashups/close", async (req, env) => {
    const b = await req.json().catch(() => ({}));
    const id = Number(b.cashup_id || 0);
    const manager = (b.manager_name || "").trim();
    if (!id || !manager) return bad("Missing cashup_id or manager_name");
    try {
      await env.DB
        .prepare(
          `UPDATE pos_cashups
           SET closed_at=unixepoch(), manager_name=?1
           WHERE id=?2`
        )
        .bind(manager, id)
        .run();
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // POS immediate sale
  router.add("POST", "/api/pos/sale", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (
      !b?.cashup_id ||
      !b?.event_id ||
      !Array.isArray(b.items) ||
      b.items.length === 0
    )
      return bad("Invalid request");

    const method = b.payment_method === "card" ? "card" : "cash";

    try {
      // Use service to create order and tickets
      const sale = await createPOSOrder(env.DB, {
        event_id: b.event_id,
        items: b.items,
        buyer_name: b.buyer_name || "",
        buyer_phone: b.buyer_phone || "",
        payment_method: method,
        cashup_id: b.cashup_id,
      });

      if (!sale?.order_id)
        return json({ ok: false, error: "Failed to create order" }, 500);

      const totalCents =
        typeof sale.total_cents === "number"
          ? sale.total_cents
          : await computeTotalCents(env.DB, b.items);

      // Update cashup totals
      const field =
        method === "cash" ? "total_cash_cents" : "total_card_cents";
      await env.DB
        .prepare(
          `UPDATE pos_cashups SET ${field}=COALESCE(${field},0)+?1
           WHERE id=?2`
        )
        .bind(totalCents, b.cashup_id)
        .run();

      // Notify (email/WA) – best-effort
      try {
        const { notifyTicketsPaid } = await import("../services/notify.js");
        await notifyTicketsPaid(env, sale.order_id);
      } catch {}

      return json({
        ok: true,
        order_id: sale.order_id,
        total_cents: totalCents,
        tickets: sale.tickets || [],
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Recall → fetch pending by short code
  router.add("GET", "/api/pos/recall/:code", async (_req, env, _ctx, { code }) => {
    try {
      const found = await loadPendingOrderByCode(env.DB, code);
      if (!found) return bad("Order not found or not pending", 404);

      const items = await hydrateItems(env.DB, found.items);
      const total_cents = await computeTotalCents(env.DB, items);

      return json({
        ok: true,
        order_id: found.order.id,
        event_id: found.order.event_id,
        buyer_name: found.order.buyer_name || "",
        buyer_phone: found.order.buyer_phone || "",
        items,
        total_cents,
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  // Recall confirm → mark paid, issue tickets, update cashup, notify
  // Body: { code, cashup_id, payment_method, buyer_name?, buyer_phone?, items? }
  router.add("POST", "/api/pos/recall/confirm", async (req, env) => {
    const b = await req.json().catch(() => null);
    if (!b?.code || !b?.cashup_id) return bad("Missing code or cashup_id");

    try {
      const found = await loadPendingOrderByCode(env.DB, b.code);
      if (!found) return bad("Order not found or not pending", 404);

      // Adjust items if cashier changed them
      let items =
        Array.isArray(b.items) && b.items.length ? b.items : found.items;
      items = await hydrateItems(env.DB, items);

      const total_cents = await computeTotalCents(env.DB, items);
      const method = b.payment_method === "card" ? "card" : "cash";

      // Mark order paid + store details
      await env.DB
        .prepare(
          `UPDATE orders
           SET status='paid', source='pos', payment_method=?1, total_cents=?2,
               buyer_name=COALESCE(?3, buyer_name),
               buyer_phone=COALESCE(?4, buyer_phone),
               paid_at=unixepoch(),
               items_json=?5
           WHERE id=?6`
        )
        .bind(
          method,
          total_cents,
          b.buyer_name || null,
          b.buyer_phone || null,
          JSON.stringify(items.map(({ ticket_type_id, qty }) => ({ ticket_type_id, qty }))),
          found.order.id
        )
        .run();

      // Issue tickets
      const tickets = await issueTicketsForOrder(
        env.DB,
        found.order.id,
        found.order.event_id,
        items,
        b.buyer_phone || found.order.buyer_phone
      );

      // Update cashup totals
      const field =
        method === "cash" ? "total_cash_cents" : "total_card_cents";
      await env.DB
        .prepare(
          `UPDATE pos_cashups SET ${field}=COALESCE(${field},0)+?1 WHERE id=?2`
        )
        .bind(total_cents, b.cashup_id)
        .run();

      // Notify (email/WA) – best-effort
      try {
        const { notifyTicketsPaid } = await import("../services/notify.js");
        await notifyTicketsPaid(env, found.order.id);
      } catch {}

      return json({
        ok: true,
        order_id: found.order.id,
        total_cents,
        tickets,
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  });

  /* -------------------------
   * Admin email preview (HTML)
   * GET /api/admin/debug/email/:order_id
   * ------------------------- */
  router.add(
    "GET",
    "/api/admin/debug/email/:order_id",
    async (_req, env, _ctx, { order_id }) => {
      try {
        const o = await env.DB
          .prepare(
            `SELECT o.*, e.name AS ev_name, e.starts_at, e.ends_at, e.venue, e.slug, e.hero_url, e.poster_url
             FROM orders o JOIN events e ON e.id=o.event_id
             WHERE o.id=?1`
          )
          .bind(order_id)
          .first();
        if (!o) return new Response("Order not found", { status: 404 });

        let items = [];
        try {
          items = JSON.parse(o.items_json || "[]");
        } catch {}
        const hydrated = await hydrateItems(env.DB, items);

        const tickets =
          (
            await env.DB
              .prepare("SELECT id, qr FROM tickets WHERE order_id=?1")
              .bind(order_id)
              .all()
          ).results || [];

        const settings =
          (await env.DB
            .prepare("SELECT * FROM settings LIMIT 1")
            .first()
            .catch(() => null)) || {};

        const when = o.starts_at
          ? new Date(o.starts_at * 1000).toLocaleString()
          : "";

        const lines = hydrated
          .map(
            (i) =>
              `<tr><td>${i.name}</td><td style="text-align:right">${i.qty} × R ${(i.price_cents / 100).toFixed(
                2
              )}</td></tr>`
          )
          .join("");

        const list =
          tickets.length === 0
            ? "<p>No tickets yet (pending or not issued).</p>"
            : `<ul>${tickets
                .map(
                  (t) =>
                    `<li><a href="/t/${encodeURIComponent(
                      t.qr
                    )}" target="_blank" rel="noopener">Ticket ${t.id} — ${t.qr}</a></li>`
                )
                .join("")}</ul>`;

        const logo = settings?.logo_url
          ? `<img src="${settings.logo_url}" alt="logo" height="34" />`
          : (settings?.name || env.APP_NAME || "Villiersdorp Skou Tickets");

        const html = `
          <meta charset="utf-8"/>
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto;padding:16px">
            <div style="display:flex;align-items:center;gap:10px;">${logo}</div>
            <h2 style="margin:16px 0;">Your tickets for ${o.ev_name || "the event"}</h2>
            <p>Order #${o.id}${o.short_code ? " · " + o.short_code : ""}</p>
            <p><strong>When:</strong> ${when}${o.venue ? " · " + o.venue : ""}</p>
            <table style="width:100%;border-collapse:collapse">${lines}
              <tr><td style="border-top:1px solid #eee;padding-top:8px"><strong>Total</strong></td>
                  <td style="text-align:right;border-top:1px solid #eee;padding-top:8px"><strong>${moneyR(
                    o.total_cents || 0
                  )}</strong></td></tr>
            </table>
            <h3>Tickets</h3>
            ${list}
            <p style="color:#6b7280;font-size:12px">Show the QR on your phone at the gate. Re-entry is supported (IN/OUT).</p>
          </div>`;

        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }
  );
}