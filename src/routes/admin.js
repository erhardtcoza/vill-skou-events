// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

/** pass { protectWith } from index.js to guard all admin endpoints */
export function mountAdmin(router, opts = {}) {
  const guard = opts.protectWith || ((h) => h);

  /* ---------- Site settings ---------- */
  router.add("GET", "/api/admin/settings", guard(async (_req, env) => {
    const row = await env.DB.prepare("SELECT * FROM settings LIMIT 1").first().catch(()=>null);
    return json({ ok: true, settings: row || {} });
  }));

  router.add("POST", "/api/admin/settings", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b) return bad("Invalid body");
    const exists = await env.DB.prepare("SELECT id FROM settings LIMIT 1").first();
    if (exists) {
      await env.DB.prepare(
        `UPDATE settings SET name=?1, logo_url=?2, banner_url=?3 WHERE id=?4`
      ).bind(b.name||"", b.logo_url||"", b.banner_url||"", exists.id).run();
      return json({ ok: true, updated: true });
    } else {
      const ins = await env.DB.prepare(
        `INSERT INTO settings (name, logo_url, banner_url) VALUES (?1,?2,?3)`
      ).bind(b.name||"", b.logo_url||"", b.banner_url||"").run();
      return json({ ok: true, id: Number(ins.lastInsertRowid) });
    }
  }));

  /* ---------- Events ---------- */
  router.add("GET", "/api/admin/events", guard(async (_req, env) => {
    const rows = await env.DB.prepare(
      "SELECT id, slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls FROM events ORDER BY starts_at ASC"
    ).all();
    return json({ ok: true, events: rows.results || [] });
  }));

  router.add("GET", "/api/admin/events/:id", guard(async (_req, env, _ctx, { id }) => {
    const e = await env.DB.prepare("SELECT * FROM events WHERE id=?1").bind(id).first();
    if (!e) return bad("Not found", 404);
    return json({ ok: true, event: e });
  }));

  router.add("POST", "/api/admin/events", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.slug || !b?.name || !b.starts_at || !b.ends_at) return bad("Invalid");
    const ins = await env.DB.prepare(
      `INSERT INTO events (slug,name,venue,starts_at,ends_at,status,hero_url,poster_url,gallery_urls)
       VALUES (?1,?2,?3,?4,?5,COALESCE(?6,'active'),?7,?8,?9)`
    ).bind(b.slug, b.name, b.venue||"", b.starts_at, b.ends_at, b.status||'active', b.hero_url||"", b.poster_url||"", b.gallery_urls||"").run();
    return json({ ok: true, id: Number(ins.lastInsertRowid) });
  }));

  router.add("PUT", "/api/admin/events/:id", guard(async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b) return bad("Invalid");
    await env.DB.prepare(
      `UPDATE events
       SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5, status=?6,
           hero_url=?7, poster_url=?8, gallery_urls=?9
       WHERE id=?10`
    ).bind(b.slug||"", b.name||"", b.venue||"", b.starts_at||0, b.ends_at||0, b.status||"active", b.hero_url||"", b.poster_url||"", b.gallery_urls||"", id).run();
    return json({ ok: true });
  }));

  router.add("DELETE", "/api/admin/events/:id", guard(async (_req, env, _ctx, { id }) => {
    await env.DB.prepare("DELETE FROM events WHERE id=?1").bind(id).run();
    return json({ ok: true });
  }));

  /* ---------- Ticket types ---------- */
  router.add("POST", "/api/admin/events/:id/ticket-types", guard(async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b?.name) return bad("Invalid");
    const price = Math.round(Number(b.price_rand||0)*100);
    const ins = await env.DB.prepare(
      `INSERT INTO ticket_types (event_id, name, price_cents, requires_gender)
       VALUES (?1,?2,?3,?4)`
    ).bind(id, b.name, price, !!b.requires_gender).run();
    return json({ ok: true, id: Number(ins.lastInsertRowid) });
  }));

  router.add("DELETE", "/api/admin/ticket-types/:tid", guard(async (_req, env, _ctx, { tid }) => {
    await env.DB.prepare("DELETE FROM ticket_types WHERE id=?1").bind(tid).run();
    return json({ ok: true });
  }));

  /* ---------- Gates ---------- */
  router.add("GET", "/api/admin/gates", guard(async (_req, env) => {
    const rows = await env.DB.prepare("SELECT id,name FROM gates ORDER BY id ASC").all();
    return json({ ok: true, gates: rows.results || [] });
  }));

  router.add("POST", "/api/admin/gates", guard(async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.name) return bad("Invalid");
    const ins = await env.DB.prepare("INSERT INTO gates (name) VALUES (?1)").bind(b.name).run();
    return json({ ok: true, id: Number(ins.lastInsertRowid) });
  }));

  router.add("DELETE", "/api/admin/gates/:id", guard(async (_req, env, _ctx, { id }) => {
    await env.DB.prepare("DELETE FROM gates WHERE id=?1").bind(id).run();
    return json({ ok: true });
  }));

  /* =========================================================
   * POS ADMIN — Filters + Drill-downs
   * ========================================================= */

  // Helpers: parse query params safely
  function num(v, d=0){ const n = Number(v); return Number.isFinite(n) ? n : d; }
  function bool(v){ return v === "1" || v === "true"; }

  // GET /api/admin/pos/summary?event_id=&from=&to=&include_online=0|1
  router.add("GET", "/api/admin/pos/summary", guard(async (req, env) => {
    const url = new URL(req.url);
    const event_id = num(url.searchParams.get("event_id"), 0);
    const from = num(url.searchParams.get("from"), 0); // unix seconds
    const to   = num(url.searchParams.get("to"),   0); // unix seconds
    const include_online = bool(url.searchParams.get("include_online"));

    // ---- payments from orders (filtered) ----
    // We compute by orders so filters (event, time) apply cleanly.
    const srcClause = include_online
      ? "('pos','online')"
      : "('pos')";
    const evClause = event_id ? "AND o.event_id = ?1" : "";
    const timeClause = (from || to)
      ? `AND o.paid_at BETWEEN COALESCE(?2,0) AND COALESCE(?3, 32503680000)` // to year 3000
      : "";

    const pay = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN o.payment_method='cash' THEN o.total_cents ELSE 0 END) AS cash_cents,
         SUM(CASE WHEN o.payment_method='card' THEN o.total_cents ELSE 0 END) AS card_cents
       FROM orders o
       WHERE o.status='paid' AND o.source IN ${srcClause}
       ${evClause} ${timeClause}`
    ).bind(event_id||null, from||null, to||null).first();

    const payments = {
      cash_cents: Number(pay?.cash_cents || 0),
      card_cents: Number(pay?.card_cents || 0),
      total_cents: Number(pay?.cash_cents || 0) + Number(pay?.card_cents || 0),
    };

    // ---- cashups (unfiltered list for ops oversight) ----
    const cashups = (await env.DB.prepare(
      `SELECT id, cashier_name, gate_name, opening_float_cents,
              COALESCE(total_cash_cents,0)  AS total_cash_cents,
              COALESCE(total_card_cents,0)  AS total_card_cents,
              (COALESCE(total_cash_cents,0)+COALESCE(total_card_cents,0)) AS total_cents,
              opened_at, closed_at, manager_name
       FROM pos_cashups
       ORDER BY opened_at DESC`
    ).all()).results || [];

    // ---- ticket types (filtered by event/time using tickets.issued_at) ----
    const byTT = (await env.DB.prepare(
      `SELECT tt.event_id, e.name AS event_name, tt.id AS ticket_type_id, tt.name,
              COUNT(t.id) AS sold_qty,
              (COUNT(t.id) * COALESCE(tt.price_cents,0)) AS revenue_cents
       FROM ticket_types tt
       JOIN events e ON e.id=tt.event_id
       LEFT JOIN tickets t ON t.ticket_type_id=tt.id
       WHERE 1=1
         ${event_id ? "AND tt.event_id = ?1" : ""}
         ${from || to ? "AND t.issued_at BETWEEN COALESCE(?2,0) AND COALESCE(?3,32503680000)" : ""}
       GROUP BY tt.id
       ORDER BY e.starts_at DESC, tt.id ASC`
    ).bind(event_id||null, from||null, to||null).all()).results || [];

    // ---- scans (filtered by event/time) ----
    // We report IN/OUT events within window (first_in_at, last_out_at).
    const scans = (await env.DB.prepare(
      `SELECT e.id AS event_id, e.name,
              SUM(CASE WHEN t.first_in_at BETWEEN COALESCE(?2,0) AND COALESCE(?3,32503680000) THEN 1 ELSE 0 END) AS in_count,
              SUM(CASE WHEN t.last_out_at BETWEEN COALESCE(?2,0) AND COALESCE(?3,32503680000) THEN 1 ELSE 0 END) AS out_count
       FROM events e
       LEFT JOIN tickets t ON t.event_id=e.id
       WHERE 1=1 ${event_id ? "AND e.id=?1":""}
       GROUP BY e.id
       ORDER BY e.starts_at DESC`
    ).bind(event_id||null, from||null, to||null).all()).results?.map(r=>({
      event_id: r.event_id,
      name: r.name,
      in: Number(r.in_count||0),
      out: Number(r.out_count||0),
      // current inside regardless of window (live now)
      // (optional: compute inside-in-window; for ops we show live)
      inside: 0
    })) || [];

    // compute "inside now" per event
    for (const s of scans) {
      const live = await env.DB.prepare(
        `SELECT
           SUM(CASE WHEN state='in' THEN 1 ELSE 0 END) AS in_c,
           SUM(CASE WHEN state='out' THEN 1 ELSE 0 END) AS out_c
         FROM tickets WHERE event_id=?1`
      ).bind(s.event_id).first();
      s.inside = Number(live?.in_c||0) - Number(live?.out_c||0);
    }

    return json({
      ok: true,
      updated_at: Math.floor(Date.now()/1000),
      payments,
      cashups,
      by_ticket_type: byTT,
      scans
    });
  }));

  // Drill-down: single cashup summarized by its window (opened_at..closed_at|now)
  router.add("GET", "/api/admin/pos/cashups/:id", guard(async (_req, env, _ctx, { id }) => {
    const cu = await env.DB.prepare(
      `SELECT id, cashier_name, gate_name, opening_float_cents,
              COALESCE(total_cash_cents,0) AS total_cash_cents,
              COALESCE(total_card_cents,0) AS total_card_cents,
              opened_at, closed_at, manager_name
       FROM pos_cashups WHERE id=?1`
    ).bind(id).first();
    if (!cu) return bad("Not found", 404);

    const toTs = cu.closed_at || Math.floor(Date.now()/1000);

    // Orders paid in this window (source=pos)
    const orders = (await env.DB.prepare(
      `SELECT id, event_id, buyer_name, buyer_phone, total_cents, payment_method, paid_at
       FROM orders
       WHERE status='paid' AND source='pos'
         AND paid_at BETWEEN ?1 AND ?2
       ORDER BY paid_at DESC`
    ).bind(cu.opened_at, toTs).all()).results || [];

    // Ticket breakdown (issued in this window)
    const breakdown = (await env.DB.prepare(
      `SELECT e.name AS event_name, tt.name AS ticket_type, COUNT(t.id) AS qty,
              (COUNT(t.id)*COALESCE(tt.price_cents,0)) AS revenue_cents
       FROM tickets t
       JOIN ticket_types tt ON tt.id=t.ticket_type_id
       JOIN events e ON e.id=t.event_id
       WHERE t.issued_at BETWEEN ?1 AND ?2
       GROUP BY tt.id
       ORDER BY e.starts_at DESC, tt.id ASC`
    ).bind(cu.opened_at, toTs).all()).results || [];

    return json({
      ok:true,
      cashup: cu,
      orders,
      breakdown
    });
  }));

  // Orders list with filters (for the Orders table + CSV)
  // GET /api/admin/pos/orders?event_id=&from=&to=&source=pos|online|all
  router.add("GET", "/api/admin/pos/orders", guard(async (req, env) => {
    const url = new URL(req.url);
    const event_id = Number(url.searchParams.get("event_id")||0);
    const from = Number(url.searchParams.get("from")||0);
    const to   = Number(url.searchParams.get("to")||0);
    const source = String(url.searchParams.get("source")||"pos").toLowerCase();
    const srcClause =
      source === "all" ? "('pos','online')" :
      source === "online" ? "('online')" : "('pos')";

    const evClause = event_id ? "AND o.event_id=?1" : "";
    const timeClause = (from || to)
      ? `AND o.paid_at BETWEEN COALESCE(?2,0) AND COALESCE(?3,32503680000)`
      : "";

    const rows = (await env.DB.prepare(
      `SELECT o.id, o.event_id, e.name AS event_name, o.source, o.payment_method,
              o.total_cents, o.buyer_name, o.buyer_phone, o.paid_at
       FROM orders o
       JOIN events e ON e.id=o.event_id
       WHERE o.status='paid' AND o.source IN ${srcClause}
         ${evClause} ${timeClause}
       ORDER BY o.paid_at DESC
       LIMIT 500`
    ).bind(event_id||null, from||null, to||null).all()).results || [];

    return json({ ok:true, orders: rows });
  }));

  // CSV export for orders with same filters
  router.add("GET", "/api/admin/pos/orders.csv", guard(async (req, env) => {
    const url = new URL(req.url);
    const event_id = Number(url.searchParams.get("event_id")||0);
    const from = Number(url.searchParams.get("from")||0);
    const to   = Number(url.searchParams.get("to")||0);
    const source = String(url.searchParams.get("source")||"pos").toLowerCase();
    const srcClause =
      source === "all" ? "('pos','online')" :
      source === "online" ? "('online')" : "('pos')";

    const evClause = event_id ? "AND o.event_id=?1" : "";
    const timeClause = (from || to)
      ? `AND o.paid_at BETWEEN COALESCE(?2,0) AND COALESCE(?3,32503680000)`
      : "";

    const orders = (await env.DB.prepare(
      `SELECT o.id, e.name AS event, o.source, o.payment_method, o.total_cents,
              o.buyer_name, o.buyer_phone, o.paid_at
       FROM orders o JOIN events e ON e.id=o.event_id
       WHERE o.status='paid' AND o.source IN ${srcClause}
         ${evClause} ${timeClause}
       ORDER BY o.paid_at DESC`
    ).bind(event_id||null, from||null, to||null).all()).results || [];

    const toCSV = rows => {
      if (!rows?.length) return "";
      const keys = Object.keys(rows[0]);
      const esc = v => (v==null?"":String(v).includes(",")||String(v).includes("\"")||String(v).includes("\n")
        ? `"${String(v).replace(/"/g,'""')}"`
        : String(v));
      const head = keys.join(",");
      const body = rows.map(r => keys.map(k => esc(r[k])).join(",")).join("\n");
      return head+"\n"+body;
    };

    const csv = toCSV(orders);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="orders-${Date.now()}.csv"`
      }
    });
  }));

  /* ---------- Admin email preview (cookie-guarded) ---------- */
  router.add("GET", "/api/admin/debug/email/:order_id", guard(async (_req, env, _ctx, { order_id }) => {
    const moneyR = (c)=>"R "+(Number(c||0)/100).toFixed(2);

    const o = await env.DB.prepare(
      `SELECT o.*, e.name AS ev_name, e.starts_at, e.ends_at, e.venue
       FROM orders o JOIN events e ON e.id=o.event_id
       WHERE o.id=?1`
    ).bind(order_id).first();
    if (!o) return new Response("Order not found", { status: 404 });

    let items = [];
    try { items = JSON.parse(o.items_json || "[]"); } catch {}
    const hydrated = [];
    for (const it of items) {
      const tt = await env.DB.prepare("SELECT id,name,price_cents FROM ticket_types WHERE id=?1").bind(it.ticket_type_id).first();
      if (tt) hydrated.push({ ticket_type_id: tt.id, name: tt.name, price_cents: tt.price_cents, qty: it.qty });
    }
    const tickets = (await env.DB.prepare("SELECT id, qr FROM tickets WHERE order_id=?1").bind(order_id).all()).results || [];
    const settings = await env.DB.prepare("SELECT * FROM settings LIMIT 1").first().catch(()=>null) || {};
    const when = o.starts_at ? new Date(o.starts_at*1000).toLocaleString() : "";

    const lines = hydrated.map(i =>
      `<tr><td>${i.name}</td><td style="text-align:right">${i.qty} × R ${(i.price_cents/100).toFixed(2)}</td></tr>`
    ).join("");

    const list = tickets.length
      ? `<ul>${tickets.map(t => `<li><a href="/t/${encodeURIComponent(t.qr)}" target="_blank" rel="noopener">Ticket ${t.id} — ${t.qr}</a></li>`).join("")}</ul>`
      : "<p>No tickets yet (pending or not issued).</p>";

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
              <td style="text-align:right;border-top:1px solid #eee;padding-top:8px"><strong>${moneyR(o.total_cents||0)}</strong></td></tr>
        </table>
        <h3>Tickets</h3>
        ${list}
        <p style="color:#6b7280;font-size:12px">Show the QR on your phone at the gate. Re-entry is supported (IN/OUT).</p>
      </div>`;
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }});
  })));
}
