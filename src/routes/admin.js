// /src/routes/admin.js
import { json, bad } from "../utils/http.js";

// === Helpers ===
function now() { return Math.floor(Date.now() / 1000); }
function tsStartOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return Math.floor(x.getTime()/1000); }
function tsEndOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return Math.floor(x.getTime()/1000); }
function parseWindow(url) {
  const u = new URL(url);
  const from = u.searchParams.get("from");
  const to   = u.searchParams.get("to");
  const nowS = Math.floor(Date.now()/1000);
  let fromS = from ? tsStartOfDay(from) : (nowS - 7*86400);
  let toS   = to   ? tsEndOfDay(to)     : nowS;
  if (toS < fromS) [fromS,toS] = [toS,fromS];
  return { fromS, toS };
}

export function mountAdmin(router) {
  // === Site settings ===
  router.add("GET", "/api/admin/site-settings", async (_req, env) => {
    const row = await env.DB.prepare("SELECT key,value FROM site_settings").all().catch(()=>({results:[]}));
    const settings = {};
    for (const r of (row.results||[])) settings[r.key] = r.value;
    return json({ ok:true, settings });
  });

  router.add("POST", "/api/admin/site-settings", async (req, env) => {
    const body = await req.json().catch(()=>null);
    if (!body) return bad("Invalid JSON");
    const keys = ["site_title","site_banner_url","site_logo_url","site_favicon_url"];
    for (const k of keys) {
      if (body[k] !== undefined) {
        await env.DB.prepare(
          "INSERT INTO site_settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        ).bind(k, body[k]).run();
      }
    }
    return json({ ok:true });
  });

  // === Events CRUD ===
  router.add("GET", "/api/admin/events", async (_req, env) => {
    const rows = await env.DB
      .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status,
                       hero_url, poster_url, gallery_urls
                 FROM events ORDER BY starts_at DESC`)
      .all();
    return json({ ok:true, events: rows.results||[] });
  });

  router.add("POST", "/api/admin/events", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.slug || !b?.name) return bad("slug and name required");
    await env.DB.prepare(
      `INSERT INTO events (slug,name,venue,starts_at,ends_at,status,hero_url,poster_url,gallery_urls)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(
      b.slug, b.name, b.venue||"", Number(b.starts_at)||0, Number(b.ends_at)||0,
      b.status||"active", b.hero_url||"", b.poster_url||"", JSON.stringify(b.gallery_urls||[])
    ).run();
    const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
    return json({ ok:true, id: row.id });
  });

  router.add("GET", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    const e = await env.DB.prepare("SELECT * FROM events WHERE id=?").bind(Number(id)).first();
    if (!e) return bad("Not found", 404);
    return json({ ok:true, event: e });
  });

  router.add("PUT", "/api/admin/events/:id", async (req, env, _ctx, { id }) => {
    const b = await req.json().catch(()=>null);
    if (!b) return bad("Invalid JSON");
    await env.DB.prepare(
      `UPDATE events SET slug=?, name=?, venue=?, starts_at=?, ends_at=?,
        hero_url=?, poster_url=?, gallery_urls=? WHERE id=?`
    ).bind(
      b.slug||"", b.name||"", b.venue||"", Number(b.starts_at)||0, Number(b.ends_at)||0,
      b.hero_url||"", b.poster_url||"", JSON.stringify(b.gallery_urls||[]), Number(id)
    ).run();
    return json({ ok:true });
  });

  router.add("DELETE", "/api/admin/events/:id", async (_req, env, _ctx, { id }) => {
    await env.DB.prepare("DELETE FROM events WHERE id=?").bind(Number(id)).run();
    return json({ ok:true });
  });

  // === Ticket Types ===
  router.add("GET", "/api/admin/events/:id/ticket-types", async (_req, env, _ctx, { id }) => {
    const rows = await env.DB.prepare(
      "SELECT id,name,price_cents,requires_gender FROM ticket_types WHERE event_id=?"
    ).bind(Number(id)).all();
    return json({ ok:true, ticket_types: rows.results||[] });
  });

  router.add("POST", "/api/admin/events/:id/ticket-types", async (req, env, _ctx, { id }) => {
    let b = await req.json().catch(()=>null);
    if (!b?.name) return bad("name required");
    const price_cents = b.price_rands!=null ? Math.round(Number(b.price_rands)*100) : (Number(b.price_cents)||0);
    const requires_gender = b.requires_gender ? 1 : 0;
    await env.DB.prepare(
      "INSERT INTO ticket_types (event_id,name,price_cents,requires_gender,capacity) VALUES (?,?,?,?,0)"
    ).bind(Number(id), b.name, price_cents, requires_gender).run();
    const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
    return json({ ok:true, id: row.id });
  });

  // === Gates (global) ===
  router.add("GET", "/api/admin/gates", async (_req, env) => {
    const rows = await env.DB.prepare("SELECT id,name FROM gates ORDER BY id").all();
    return json({ ok:true, gates: rows.results||[] });
  });

  router.add("POST", "/api/admin/gates", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.name) return bad("name required");
    await env.DB.prepare("INSERT INTO gates (name) VALUES (?)").bind(b.name).run();
    const row = await env.DB.prepare("SELECT last_insert_rowid() AS id").first();
    return json({ ok:true, id: row.id });
  });

  // === POS Admin ===

  // Overview: totals & breakdown in window
  router.add("GET", "/api/admin/pos/overview", async (req, env) => {
    try {
      const { fromS, toS } = parseWindow(req.url);

      const pay = await env.DB.prepare(
        `SELECT method, SUM(amount_cents) AS total_cents, COUNT(*) AS payments
           FROM pos_payments
          WHERE created_at BETWEEN ?1 AND ?2
          GROUP BY method`
      ).bind(fromS, toS).all();

      let totals = { pos_cash: 0, pos_card: 0, payments: 0 };
      for (const r of (pay.results||[])) {
        const m = String(r.method||"");
        const amt = Number(r.total_cents)||0;
        const cnt = Number(r.payments)||0;
        if (m === "pos_cash") totals.pos_cash += amt;
        if (m === "pos_card") totals.pos_card += amt;
        totals.payments += cnt;
      }

      const ttb = await env.DB.prepare(
        `SELECT tt.id, tt.name,
                SUM(oi.qty) AS qty,
                SUM(oi.qty * oi.price_cents) AS rev_cents
           FROM pos_payments p
           JOIN order_items oi ON oi.order_id = p.order_id
           JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          WHERE p.created_at BETWEEN ?1 AND ?2
          GROUP BY tt.id
          ORDER BY rev_cents DESC`
      ).bind(fromS, toS).all();

      return json({ ok:true, window:{ from:fromS, to:toS }, totals, by_type: ttb.results||[] });
    } catch (e) {
      return json({ ok:false, error:String(e) }, 500);
    }
  });

  // Sessions list
  router.add("GET", "/api/admin/pos/sessions", async (req, env) => {
    try {
      const u = new URL(req.url);
      const limit = Math.max(1, Math.min(200, Number(u.searchParams.get("limit")||50)));

      const rows = await env.DB.prepare(
        `SELECT s.id, s.cashier_name, s.gate_id, g.name AS gate_name,
                s.opening_float_cents, s.opened_at, s.closed_at,
                SUM(CASE WHEN p.method='pos_cash' THEN p.amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN p.method='pos_card' THEN p.amount_cents ELSE 0 END) AS card_cents,
                COUNT(p.id) AS payments
           FROM pos_sessions s
           LEFT JOIN gates g ON g.id = s.gate_id
           LEFT JOIN pos_payments p ON p.session_id = s.id
          GROUP BY s.id
          ORDER BY s.opened_at DESC
          LIMIT ?1`
      ).bind(limit).all();

      return json({ ok:true, sessions: rows.results||[] });
    } catch (e) {
      return json({ ok:false, error:String(e) }, 500);
    }
  });

  // Session detail
  router.add("GET", "/api/admin/pos/sessions/:id", async (_req, env, _ctx, { id }) => {
    try {
      const s = await env.DB.prepare(
        `SELECT s.id, s.cashier_name, s.gate_id, g.name AS gate_name,
                s.opening_float_cents, s.opened_at, s.closed_at
           FROM pos_sessions s
           LEFT JOIN gates g ON g.id = s.gate_id
          WHERE s.id = ?1`
      ).bind(Number(id)).first();
      if (!s) return bad("Session not found", 404);

      const totals = await env.DB.prepare(
        `SELECT method, SUM(amount_cents) AS total_cents, COUNT(*) AS payments
           FROM pos_payments
          WHERE session_id = ?1
          GROUP BY method`
      ).bind(Number(id)).all();

      const byType = await env.DB.prepare(
        `SELECT tt.id, tt.name,
                SUM(oi.qty) AS qty,
                SUM(oi.qty * oi.price_cents) AS rev_cents
           FROM pos_payments p
           JOIN order_items oi ON oi.order_id = p.order_id
           JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          WHERE p.session_id = ?1
          GROUP BY tt.id
          ORDER BY rev_cents DESC`
      ).bind(Number(id)).all();

      const payments = await env.DB.prepare(
        `SELECT id, order_id, method, amount_cents, created_at
           FROM pos_payments
          WHERE session_id = ?1
          ORDER BY created_at ASC`
      ).bind(Number(id)).all();

      return json({
        ok:true,
        session: s,
        totals: totals.results||[],
        by_type: byType.results||[],
        payments: payments.results||[]
      });
    } catch (e) {
      return json({ ok:false, error:String(e) }, 500);
    }
  });
}
