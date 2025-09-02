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

    // Upsert single row
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

  /* ---------- POS admin: cashups & totals (read-only) ---------- */
  router.add("GET", "/api/admin/pos/cashups", guard(async (_req, env) => {
    const rows = await env.DB.prepare(
      `SELECT id, cashier_name, gate_name, opening_float_cents, total_cash_cents, total_card_cents, opened_at, closed_at, manager_name
       FROM pos_cashups ORDER BY opened_at DESC`
    ).all();
    return json({ ok: true, cashups: rows.results || [] });
  }));

  /* ---------- Admin email preview (cookie-guarded) ---------- */
  router.add("GET", "/api/admin/debug/email/:order_id", guard(async (_req, env, _ctx, { order_id }) => {
    // Build same HTML as the notify email
    const moneyR = (c)=>"R "+(Number(c||0)/100).toFixed(2);

    const o = await env.DB.prepare(
      `SELECT o.*, e.name AS ev_name, e.starts_at, e.ends_at, e.venue, e.slug, e.hero_url, e.poster_url
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