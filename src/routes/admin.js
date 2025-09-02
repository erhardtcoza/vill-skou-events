// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

function now(){ return Math.floor(Date.now()/1000); }
function toInt(x, d=0){ const n = Number(x); return Number.isFinite(n) ? Math.floor(n) : d; }

export function mountAdmin(router) {
  // -------- Existing admin endpoints you already had (events, ticket types, gates, site settings) --------
  // List events
  router.add("GET", "/api/admin/events", async (_req, env) => {
    const rows = await env.DB
      .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls
                FROM events ORDER BY starts_at DESC`)
      .all();
    return json({ ok:true, events: rows.results || [] });
  });

  // Get one event
  router.add("GET", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    const ev = await env.DB
      .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status,
                       hero_url, poster_url, gallery_urls
                FROM events WHERE id=?`)
      .bind(Number(id)).first();
    if (!ev) return bad("Not found", 404);
    return json({ ok:true, event: ev });
  });

  // Create event
  router.add("POST", "/api/admin/events", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.slug || !b?.name) return bad("Missing slug/name");
    const starts = toInt(b.starts_at); const ends = toInt(b.ends_at);
    await env.DB.prepare(
      `INSERT INTO events (slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls)
       VALUES (?,?,?,?,?, ?, ?, ?, ?)`
    ).bind(
      String(b.slug), String(b.name), String(b.venue||''),
      starts, ends, String(b.status||'active'),
      String(b.hero_url||''), String(b.poster_url||''),
      b.gallery_urls ? JSON.stringify(b.gallery_urls) : null
    ).run();
    const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
    return json({ ok:true, id: row.id });
  });

  // Update event
  router.add("PUT", "/api/admin/events/:id", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b) return bad("Invalid");
    await env.DB.prepare(
      `UPDATE events SET slug=?, name=?, venue=?, starts_at=?, ends_at=?, hero_url=?, poster_url=?, gallery_urls=? WHERE id=?`
    ).bind(
      String(b.slug||''), String(b.name||''), String(b.venue||''),
      toInt(b.starts_at), toInt(b.ends_at),
      String(b.hero_url||''), String(b.poster_url||''),
      b.gallery_urls ? JSON.stringify(b.gallery_urls) : null,
      Number(id)
    ).run();
    return json({ ok:true });
  });

  // Delete event
  router.add("DELETE", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    await env.DB.prepare("DELETE FROM events WHERE id=?").bind(Number(id)).run();
    return json({ ok:true });
  });

  // Ticket types (list/add)
  router.add("GET", "/api/admin/events/:id/ticket-types", async (_req, env, _ctx, { id }) => {
    const rows = await env.DB
      .prepare("SELECT id, name, price_cents, requires_gender FROM ticket_types WHERE event_id=? ORDER BY id")
      .bind(Number(id)).all();
    return json({ ok:true, ticket_types: rows.results || [] });
  });
  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b?.name) return bad("Missing name");
    const price_cents = b.price_rands==='' || b.price_rands==null ? 0 : Math.round(Number(b.price_rands)*100);
    await env.DB.prepare(
      "INSERT INTO ticket_types (event_id, name, price_cents, requires_gender) VALUES (?,?,?,?)"
    ).bind(Number(id), String(b.name), price_cents, !!b.requires_gender ? 1 : 0).run();
    return json({ ok:true });
  });

  // Gates (global list + add)
  router.add("GET", "/api/admin/gates", async (_req, env) => {
    const rows = await env.DB.prepare("SELECT id, name FROM gates ORDER BY id").all();
    return json({ ok:true, gates: rows.results || [] });
  });
  router.add("POST", "/api/admin/gates", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.name) return bad("Missing name");
    await env.DB.prepare("INSERT INTO gates (name) VALUES (?)").bind(String(b.name)).run();
    return json({ ok:true });
  });

  // Site settings (KV or table). Here: KV for simplicity.
  router.add("GET", "/api/admin/site-settings", async (_req, env) => {
    const kv = env.EVENTS_KV;
    const payload = await kv.get("SITE_SETTINGS", "json");
    return json({ ok:true, settings: payload || {} });
  });
  router.add("POST", "/api/admin/site-settings", async (req, env) => {
    const kv = env.EVENTS_KV;
    const b = await req.json().catch(()=>({}));
    await kv.put("SITE_SETTINGS", JSON.stringify(b));
    return json({ ok:true });
  });

  // ------------------------------------ NEW: POS ADMIN ------------------------------------

  // Helper: read search params
  function paramsOf(req){
    try { return new URL(req.url).searchParams; } catch { return new URLSearchParams(); }
  }

  // Summary of sessions within a date range (unix seconds). Defaults: last 7 days.
  router.add("GET", "/api/admin/pos/summary", async (req, env) => {
    const p = paramsOf(req);
    const nowS = now();
    const defFrom = nowS - 7*24*3600;
    const from = toInt(p.get("from"), defFrom);
    const to   = toInt(p.get("to"),   nowS + 24*3600); // inclusive-ish

    // Sessions in range (opened_at within window, or closed within—it’s ok to use opened_at)
    const sessions = await env.DB.prepare(
      `SELECT s.id, s.cashier_name, s.gate_id, s.opening_float_cents, s.opened_at, s.closed_at, s.closing_manager,
              g.name AS gate_name
         FROM pos_sessions s
         LEFT JOIN gates g ON g.id = s.gate_id
        WHERE s.opened_at BETWEEN ? AND ?
        ORDER BY s.opened_at DESC`
    ).bind(from, to).all();

    const out = [];
    let grand_cash=0, grand_card=0, grand_orders=0, grand_total=0;

    for (const s of (sessions.results||[])) {
      // payments by method
      const pays = await env.DB.prepare(
        `SELECT method, SUM(amount_cents) AS total_cents, COUNT(*) AS cnt
           FROM pos_payments
          WHERE session_id=? GROUP BY method`
      ).bind(s.id).all();

      let cash=0, card=0, orders=0;
      for (const r of (pays.results||[])) {
        const t = toInt(r.total_cents);
        if (String(r.method)==='pos_cash') cash += t;
        if (String(r.method)==='pos_card') card += t;
        orders += toInt(r.cnt);
      }

      const total = cash + card;
      grand_cash += cash; grand_card += card; grand_orders += orders; grand_total += total;

      out.push({
        id: s.id,
        cashier_name: s.cashier_name,
        gate_id: s.gate_id,
        gate_name: s.gate_name,
        opening_float_cents: toInt(s.opening_float_cents),
        opened_at: toInt(s.opened_at),
        closed_at: s.closed_at ? toInt(s.closed_at) : null,
        closing_manager: s.closing_manager || null,
        cash_cents: cash,
        card_cents: card,
        total_cents: total,
        orders
      });
    }

    return json({
      ok:true,
      range: { from, to },
      grand: { cash_cents: grand_cash, card_cents: grand_card, total_cents: grand_total, orders: grand_orders },
      sessions: out
    });
  });

  // Per-session breakdown (ticket type mix + payments list)
  router.add("GET", "/api/admin/pos/sessions/:id", async (_req, env, _ctx, { id }) => {
    const s = await env.DB.prepare(
      `SELECT s.id, s.cashier_name, s.gate_id, s.opening_float_cents, s.opened_at, s.closed_at, s.closing_manager,
              g.name AS gate_name
         FROM pos_sessions s
         LEFT JOIN gates g ON g.id = s.gate_id
        WHERE s.id=?`
    ).bind(Number(id)).first();
    if (!s) return bad("Session not found", 404);

    const pays = await env.DB.prepare(
      `SELECT id, method, amount_cents, created_at, order_id
         FROM pos_payments WHERE session_id=? ORDER BY id`
    ).bind(Number(id)).all();

    // Ticket mix: join tickets -> order -> pos_payments(session)
    const mix = await env.DB.prepare(
      `SELECT tt.id AS ticket_type_id, tt.name,
              COUNT(t.id) AS qty,
              SUM(tt.price_cents) AS gross_cents
         FROM pos_payments pp
         JOIN tickets t ON t.order_id = pp.order_id
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE pp.session_id=?
        GROUP BY tt.id, tt.name
        ORDER BY tt.name`
    ).bind(Number(id)).all();

    return json({
      ok:true,
      session: s,
      payments: pays.results || [],
      ticket_mix: mix.results || []
    });
  });
}
