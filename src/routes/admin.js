// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountAdmin(router) {
  const guard = (fn) => requireRole("admin", fn);

  /* ---------------- Dashboard summary ---------------- */
  router.add("GET", "/api/admin/summary", guard(async (_req, env) => {
    const evQ = await env.DB.prepare(
      `SELECT id, slug, name
         FROM events
        WHERE status='active'
        ORDER BY starts_at ASC`
    ).all();

    const sums = {};
    for (const ev of (evQ.results || [])) {
      const tQ = await env.DB.prepare(
        `SELECT
           COUNT(*)                            AS total,
           SUM(state='unused')                 AS unused,
           SUM(state='in')                     AS inside,
           SUM(state='out')                    AS outside,
           SUM(state='void')                   AS voided
         FROM tickets
        WHERE event_id = ?1`
      ).bind(ev.id).first();

      sums[ev.id] = {
        total:   Number(tQ?.total  || 0),
        unused:  Number(tQ?.unused || 0),
        inside:  Number(tQ?.inside || 0),
        outside: Number(tQ?.outside|| 0),
        voided:  Number(tQ?.voided || 0),
      };
    }

    return json({ ok: true, events: evQ.results || [], ticket_totals: sums });
  }));

  /* ---------------- Site settings (site_settings table) ------------------- */
  function normalizeInKey(k) {
    const map = {
      WHATSAPP_TOKEN:    "WA_TOKEN",
      PHONE_NUMBER_ID:   "WA_PHONE_NUMBER_ID",
      BUSINESS_ID:       "WA_BUSINESS_ID",
      WA_TMP_ORDER_CONFIRM:    "WA_TMP_ORDER_CONFIRM",
      WA_TMP_PAYMENT_CONFIRM:  "WA_TMP_PAYMENT_CONFIRM",
      WA_TMP_TICKET_DELIVERY:  "WA_TMP_TICKET_DELIVERY",
      WA_TMP_SKOU_SALES:       "WA_TMP_SKOU_SALES",
      // new vendor templates (aliases)
      WA_TMP_VENDOR_WELCOME:   "WA_TMP_VENDOR_WELCOME",
      WA_TMP_VENDOR_ASSIGNED:  "WA_TMP_VENDOR_ASSIGNED",
      PUBLIC_BASE_URL:         "PUBLIC_BASE_URL",
    };
    return map[k] || k;
  }
  function normalizeOutKey(k) {
    const map = {
      WA_TOKEN:           "WHATSAPP_TOKEN",
      WA_PHONE_NUMBER_ID: "PHONE_NUMBER_ID",
      WA_BUSINESS_ID:     "BUSINESS_ID",
      WA_TMP_ORDER_CONFIRM:   "WA_TMP_ORDER_CONFIRM",
      WA_TMP_PAYMENT_CONFIRM: "WA_TMP_PAYMENT_CONFIRM",
      WA_TMP_TICKET_DELIVERY: "WA_TMP_TICKET_DELIVERY",
      WA_TMP_SKOU_SALES:      "WA_TMP_SKOU_SALES",
      // vendor
      WA_TMP_VENDOR_WELCOME:  "WA_TMP_VENDOR_WELCOME",
      WA_TMP_VENDOR_ASSIGNED: "WA_TMP_VENDOR_ASSIGNED",
      PUBLIC_BASE_URL:        "PUBLIC_BASE_URL",
    };
    return map[k] || k;
  }

  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key = ?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  }
  async function setSetting(env, key, value) {
    await env.DB.prepare(
      `INSERT INTO site_settings (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).bind(key, value).run();
  }

  router.add("GET", "/api/admin/settings", guard(async (_req, env) => {
    const wanted = [
      "PUBLIC_BASE_URL",
      "VERIFY_TOKEN",
      "WA_TOKEN",
      "WA_PHONE_NUMBER_ID",
      "WA_BUSINESS_ID",
      "WA_TMP_ORDER_CONFIRM",
      "WA_TMP_PAYMENT_CONFIRM",
      "WA_TMP_TICKET_DELIVERY",
      "WA_TMP_SKOU_SALES",
      // Vendor templates (new)
      "WA_TMP_VENDOR_WELCOME",
      "WA_TMP_VENDOR_ASSIGNED",
      "WA_AUTOREPLY_ENABLED",
      "WA_AUTOREPLY_TEXT",
      "WA_MAP_VAR1","WA_MAP_VAR2","WA_MAP_VAR3",
      // Yoco
      "YOCO_MODE","YOCO_PUBLIC_KEY","YOCO_SECRET_KEY","YOCO_CLIENT_ID",
      "YOCO_REDIRECT_URI","YOCO_REQUIRED_SCOPES","YOCO_STATE",
      "YOCO_TEST_PUBLIC_KEY","YOCO_TEST_SECRET_KEY",
      "YOCO_LIVE_PUBLIC_KEY","YOCO_LIVE_SECRET_KEY",
      // Site branding
      "SITE_NAME","SITE_LOGO_URL",
    ];
    const out = {};
    for (const dbKey of wanted) {
      const v = await getSetting(env, dbKey);
      if (v != null) out[normalizeOutKey(dbKey)] = v;
    }
    return json({ ok: true, settings: out });
  }));

  router.add("POST", "/api/admin/settings/update", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const updates = b?.updates && typeof b.updates === "object" ? b.updates : null;
    if (!updates) return bad("updates required");
    for (const [rawKey, rawVal] of Object.entries(updates)) {
      const dbKey = normalizeInKey(String(rawKey || "").trim());
      const val = rawVal == null ? "" : String(rawVal);
      await setSetting(env, dbKey, val);
    }
    return json({ ok: true });
  }));

  /* ---------------- WhatsApp: templates sync/list/diag -------------------- */
  function enc(v){ return encodeURIComponent(String(v ?? "")); }

  router.add("GET", "/api/admin/whatsapp/templates", guard(async (_req, env) => {
    const rows = await env.DB.prepare(
      `SELECT id, name, language, status, category, updated_at, components_json
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();
    return json({ ok:true, templates: rows.results || [] });
  }));

  router.add("POST", "/api/admin/whatsapp/sync", guard(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN");
    const waba  = await getSetting(env, "WA_BUSINESS_ID");
    if (!token) return bad("WA_TOKEN missing");
    if (!waba)  return bad("WA_BUSINESS_ID missing");

    let url = "https://graph.facebook.com/v20.0/" + enc(waba)
            + "/message_templates?fields="
            + enc("name,language,status,category,components")
            + "&limit=50&access_token=" + enc(token);

    let fetched = 0;
    const now = Math.floor(Date.now()/1000);

    while (url) {
      let res, data;
      try {
        res = await fetch(url);
        data = await res.json();
      } catch (e) {
        return bad("Network error talking to Meta: " + (e?.message || e), 502);
      }
      if (!res.ok || data?.error) {
        const msg = data?.error?.message || ("Meta error " + res.status);
        return bad("Meta API: " + msg, res.status || 500);
      }

      const arr = Array.isArray(data?.data) ? data.data : [];
      for (const t of arr) {
        const name = t?.name || "";
        const lang = t?.language || "";
        if (!name || !lang) continue;
        await env.DB.prepare(
          `INSERT INTO wa_templates (name, language, status, category, components_json, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6)
           ON CONFLICT(name, language) DO UPDATE SET
             status=excluded.status,
             category=excluded.category,
             components_json=excluded.components_json,
             updated_at=excluded.updated_at`
        ).bind(
          name,
          lang,
          (t?.status || null),
          (t?.category || null),
          (t?.components ? JSON.stringify(t.components) : null),
          now
        ).run();
        fetched++;
      }
      url = data?.paging?.next || "";
    }

    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM wa_templates`).first();
    return json({ ok:true, fetched, total: Number(countRow?.c || 0) });
  }));

  router.add("GET", "/api/admin/whatsapp/diag", guard(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN");
    const waba  = await getSetting(env, "WA_BUSINESS_ID");
    if (!token || !waba) return json({ ok:false, haveToken:!!token, haveWaba:!!waba });

    const testUrl = "https://graph.facebook.com/v20.0/" + enc(waba)
                  + "/message_templates?fields=name,language,status&limit=1&access_token=" + enc(token);
    let res, data;
    try { res = await fetch(testUrl); data = await res.json(); }
    catch(e){ return json({ ok:false, error:"network "+(e?.message||e) }); }
    if (!res.ok || data?.error) return json({ ok:false, metaError: data?.error || { status: res.status } });
    return json({ ok:true, sample: (data.data && data.data[0]) || null });
  }));

  /* ---------------- WhatsApp Inbox (list/reply/delete) -------------------- */
  const inboxList = guard(async (req, env) => {
    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(Number(u.searchParams.get("offset") || 0), 0);

    const clauses = [];
    const args = [];
    if (q) {
      clauses.push("(UPPER(from_msisdn) LIKE UPPER(?1) OR UPPER(body) LIKE UPPER(?1))");
      args.push("%" + q + "%");
    }
    const whereSql = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

    const list = await env.DB.prepare(
      "SELECT id, wa_id, from_msisdn, to_msisdn, direction, body, type, " +
      "       received_at, replied_auto, replied_manual " +
      "  FROM wa_inbox " + whereSql +
      " ORDER BY received_at DESC, id DESC " +
      " LIMIT " + limit + " OFFSET " + offset
    ).bind(...args).all();

    const cRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM wa_inbox " + whereSql).bind(...args).first();

    return json({
      ok: true,
      items: list.results || [],
      total: Number(cRow?.c || 0),
      limit, offset
    });
  });

  router.add("GET", "/api/admin/whatsapp/inbox", inboxList);
  router.add("GET", "/api/whatsapp/inbox", inboxList); // alias

  router.add("POST", "/api/admin/whatsapp/inbox/:id/reply", guard(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const text = String(b?.text || "").trim();
    const explicitTo = (b?.to ? String(b.to).trim() : "");
    if (!text) return bad("text required");

    let msisdn = explicitTo;
    if (!msisdn) {
      const row = await env.DB.prepare(
        `SELECT from_msisdn FROM wa_inbox WHERE id=?1 LIMIT 1`
      ).bind(Number(id)||0).first();
      if (!row) return bad("not found", 404);
      msisdn = row.from_msisdn;
    }

    try {
      const mod = await import("../services/whatsapp.js");
      if (typeof mod.sendWhatsAppText === "function") {
        try { await mod.sendWhatsAppText(env, msisdn, text); }
        catch { await mod.sendWhatsAppText(env, { to: msisdn, text }); }
      } else {
        throw new Error("service missing");
      }
      await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE id=?1`).bind(Number(id)||0).run();
      return json({ ok: true });
    } catch {
      await env.DB.prepare(
        `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
         VALUES (?1,'manual_reply',?2,'queued',?3)`
      ).bind(msisdn, text, Math.floor(Date.now()/1000)).run();
      return json({ ok: true, queued: true });
    }
  }));

  router.add("POST", "/api/admin/whatsapp/inbox/:id/delete", guard(async (_req, env, _ctx, { id }) => {
    await env.DB.prepare(`DELETE FROM wa_inbox WHERE id=?1`).bind(Number(id)||0).run();
    return json({ ok: true });
  }));

  /* ---------------- Template Mappings CRUD -------------------- */
  router.add("GET", "/api/admin/whatsapp/mappings", guard(async (req, env) => {
    const u = new URL(req.url);
    const ctx = (u.searchParams.get("context") || "").trim();
    const where = ctx ? "WHERE context=?1" : "";
    const stmt = env.DB.prepare(
      "SELECT id, template_key, context, mapping_json, updated_at " +
      "FROM wa_template_mappings " + where +
      " ORDER BY template_key ASC"
    );
    const rows = ctx ? await stmt.bind(ctx).all() : await stmt.all();
    return json({ ok:true, mappings: rows.results || [] });
  }));

  router.add("POST", "/api/admin/whatsapp/mappings/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const key = String(b?.template_key || "").trim();
    const context = String(b?.context || "").trim();
    const mapping = b?.mapping || {};
    if (!key || !context) return bad("template_key and context required");

    await env.DB.prepare(
      `INSERT INTO wa_template_mappings (template_key, context, mapping_json, updated_at)
       VALUES (?1,?2,?3,?4)
       ON CONFLICT(template_key, context)
       DO UPDATE SET mapping_json=excluded.mapping_json, updated_at=excluded.updated_at`
    ).bind(key, context, JSON.stringify(mapping), Math.floor(Date.now()/1000)).run();

    return json({ ok: true });
  }));

  router.add("POST", "/api/admin/whatsapp/mappings/delete", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const key = String(b?.template_key || "").trim();
    const ctx = String(b?.context || "").trim();
    if (!key || !ctx) return bad("template_key/context required");
    await env.DB.prepare(
      `DELETE FROM wa_template_mappings WHERE template_key=?1 AND context=?2`
    ).bind(key, ctx).run();
    return json({ ok: true });
  }));

  /* ---------------- DB schema (no PRAGMA; parse sqlite_master.sql) -------- */
  router.add("GET", "/api/admin/db/schema", guard(async (_req, env) => {
    function columnsFromCreateSQL(sql) {
      if (!sql) return [];
      const open = sql.indexOf("(");
      const close = sql.lastIndexOf(")");
      if (open < 0 || close < 0 || close <= open) return [];
      const body = sql.slice(open + 1, close);

      const parts = [];
      let buf = "", depth = 0, inQuote = null;
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (inQuote) {
          buf += ch;
          if (ch === inQuote && body[i - 1] !== "\\") inQuote = null;
          continue;
        }
        if (ch === "'" || ch === '"' || ch === "`") { inQuote = ch; buf += ch; continue; }
        if (ch === "(") { depth++; buf += ch; continue; }
        if (ch === ")") { depth--; buf += ch; continue; }
        if (ch === "," && depth === 0) { parts.push(buf.trim()); buf = ""; continue; }
        buf += ch;
      }
      if (buf.trim()) parts.push(buf.trim());

      const cols = [];
      for (const p of parts) {
        const up = p.trim().toUpperCase();
        if (up.startsWith("PRIMARY KEY") || up.startsWith("FOREIGN KEY") || up.startsWith("UNIQUE") || up.startsWith("CHECK") || up.startsWith("CONSTRAINT")) {
          continue;
        }
        const m = p.trim().match(/^(`([^`]+)`|"([^"]+)"|'([^']+)'|([A-Za-z0-9_]+))/);
        const name = m ? (m[2] || m[3] || m[4] || m[5]) : null;
        if (name) cols.push(name);
      }
      return cols;
    }

    const tablesRes = await env.DB.prepare(
      `SELECT name, sql
         FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`
    ).all();

    const schema = {};
    for (const r of (tablesRes.results || [])) {
      const tbl = String(r.name || "");
      const ddl = String(r.sql || "");
      schema[tbl] = columnsFromCreateSQL(ddl);
    }

    return json({ ok: true, schema });
  }));

  /* ---------------- Events ---------------- */
  router.add("GET", "/api/admin/events", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        ORDER BY starts_at DESC`
    ).all();
    return json({ ok: true, events: q.results || [] });
  }));

  router.add("GET", "/api/admin/events/:id", guard(async (_req, env, _ctx, { id }) => {
    const ev = await env.DB.prepare(
      `SELECT id, slug, name, venue, starts_at, ends_at, status,
              hero_url, poster_url, gallery_urls
         FROM events
        WHERE id = ?1
        LIMIT 1`
    ).bind(Number(id)).first();
    if (!ev) return bad("Not found", 404);
    return json({ ok: true, event: ev });
  }));

  router.add("POST", "/api/admin/events/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id  = Number(b?.id || 0);
    const now = Math.floor(Date.now() / 1000);

    const fields = {
      slug: (b.slug || "").trim(),
      name: (b.name || "").trim(),
      venue: (b.venue || "").trim(),
      starts_at: Number(b.starts_at || 0),
      ends_at: Number(b.ends_at || 0),
      status: (b.status || "active").trim(),
      hero_url: b.hero_url || null,
      poster_url: b.poster_url || null,
      gallery_urls: b.gallery_urls || null,
    };

    if (id) {
      await env.DB.prepare(
        `UPDATE events
            SET slug=?1, name=?2, venue=?3, starts_at=?4, ends_at=?5, status=?6,
                hero_url=?7, poster_url=?8, gallery_urls=?9, updated_at=?10
          WHERE id=?11`
      ).bind(
        fields.slug, fields.name, fields.venue, fields.starts_at, fields.ends_at, fields.status,
        fields.hero_url, fields.poster_url, fields.gallery_urls, now, id
      ).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO events
           (slug, name, venue, starts_at, ends_at, status,
            hero_url, poster_url, gallery_urls, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`
      ).bind(
        fields.slug, fields.name, fields.venue, fields.starts_at, fields.ends_at, fields.status,
        fields.hero_url, fields.poster_url, fields.gallery_urls, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  /* ---------------- Ticket types ---------------- */
  router.add("GET", "/api/admin/events/:id/ticket-types", guard(async (_req, env, _ctx, { id }) => {
    const q = await env.DB.prepare(
      `SELECT id, event_id, name, code, price_cents, capacity, per_order_limit,
              requires_gender, requires_name
         FROM ticket_types
        WHERE event_id = ?1
        ORDER BY id ASC`
    ).bind(Number(id)).all();
    return json({ ok: true, ticket_types: q.results || [] });
  }));

  router.add("POST", "/api/admin/ticket-types/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id       = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    if (!event_id) return bad("event_id required");

    const fields = {
      name: (b.name || "").trim(),
      code: (b.code || null),
      price_cents: Number(b.price_cents || 0),
      capacity: Number(b.capacity || 0),
      per_order_limit: Number(b.per_order_limit || 10),
      requires_gender: Number(b.requires_gender || 0) ? 1 : 0,
      requires_name:   Number(b.requires_name   || 0) ? 1 : 0,
    };

    if (id) {
      await env.DB.prepare(
        `UPDATE ticket_types
            SET name=?1, code=?2, price_cents=?3, capacity=?4, per_order_limit=?5,
                requires_gender=?6, requires_name=?7
          WHERE id=?8 AND event_id=?9`
      ).bind(
        fields.name, fields.code, fields.price_cents, fields.capacity,
        fields.per_order_limit, fields.requires_gender, fields.requires_name,
        id, event_id
      ).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO ticket_types
           (event_id, name, code, price_cents, capacity, per_order_limit,
            requires_gender, requires_name)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
      ).bind(
        event_id, fields.name, fields.code, fields.price_cents, fields.capacity,
        fields.per_order_limit, fields.requires_gender, fields.requires_name
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  router.add("POST", "/api/admin/ticket-types/delete", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM ticket_types WHERE id=?1`).bind(id).run();
    return json({ ok: true });
  }));

  /* ---------------- Tickets summary + order lookup ---------------- */
  router.add("GET", "/api/admin/tickets/summary", guard(async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const rows = await env.DB.prepare(
      `SELECT tt.id AS ticket_type_id, tt.name,
              COUNT(t.id)                         AS total,
              SUM(t.state='unused')               AS unused,
              SUM(t.state='in')                   AS inside,
              SUM(t.state='out')                  AS outside,
              SUM(t.state='void')                 AS voided
         FROM ticket_types tt
    LEFT JOIN tickets t ON t.ticket_type_id = tt.id
        WHERE tt.event_id = ?1
        GROUP BY tt.id
        ORDER BY tt.id`
    ).bind(event_id).all();

    return json({ ok: true, summary: rows.results || [] });
  }));

  router.add("GET", "/api/admin/orders/by-code/:code", guard(async (_req, env, _ctx, { code }) => {
    const c = String(code || "").trim();
    if (!c) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, event_id, status, payment_method, total_cents,
              buyer_name, buyer_email, buyer_phone, created_at, paid_at
         FROM orders
        WHERE UPPER(short_code) = UPPER(?1)
        LIMIT 1`
    ).bind(c).first();

    if (!o) {
      return json({ ok: false, error: "Kon nie bestelling vind met kode " + c + " nie." }, 404);
    }

    const tickets = await env.DB.prepare(
      `SELECT t.id, t.qr, t.state, t.attendee_first, t.attendee_last, t.phone,
              tt.name AS type_name, tt.price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
    ).bind(o.id).all();

    return json({ ok: true, order: o, tickets: tickets.results || [] });
  }));

  /* ---------------- POS Admin sessions ---------------- */
  router.add("GET", "/api/admin/pos/sessions", guard(async (_req, env) => {
    const sQ = await env.DB.prepare(
      `SELECT ps.id, ps.cashier_name, ps.event_id, ps.gate_id, g.name AS gate_name,
              ps.opened_at, ps.closed_at, ps.closing_manager, ps.opening_float_cents
         FROM pos_sessions ps
         LEFT JOIN gates g ON g.id = ps.gate_id
        ORDER BY ps.id DESC`
    ).all();

    const sessions = sQ.results || [];
    const tQ = await env.DB.prepare(
      `SELECT session_id,
              SUM(CASE WHEN method='pos_cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN method='pos_card' THEN amount_cents ELSE 0 END) AS card_cents
         FROM pos_payments
        GROUP BY session_id`
    ).all();

    const totals = {};
    for (const r of (tQ.results || [])) {
      totals[r.session_id] = {
        cash_cents: Number(r.cash_cents || 0),
        card_cents: Number(r.card_cents || 0),
      };
    }

    const out = sessions.map(s => ({
      ...s,
      gate_name: s.gate_name || String(s.gate_id || ""),
      cash_cents: totals[s.id]?.cash_cents || 0,
      card_cents: totals[s.id]?.card_cents || 0,
    }));

    return json({ ok: true, sessions: out });
  }));

  /* ---------------- Vendors ---------------- */
  router.add("GET", "/api/admin/vendors", guard(async (req, env) => {
    const u = new URL(req.url);
    const event_id = Number(u.searchParams.get("event_id") || 0);
    if (!event_id) return bad("event_id required");

    const vQ = await env.DB.prepare(
      `SELECT id, event_id, name, contact_name, phone, email,
              stand_number, staff_quota, vehicle_quota,
              portal_token, portal_status, welcome_sent_at, assigned_sent_at
         FROM vendors
        WHERE event_id = ?1
        ORDER BY name ASC`
    ).bind(event_id).all();

    return json({ ok: true, vendors: vQ.results || [] });
  }));

  router.add("POST", "/api/admin/vendors/save", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id       = Number(b?.id || 0);
    const event_id = Number(b?.event_id || 0);
    if (!event_id) return bad("event_id required");

    const fields = {
      name: (b.name || "").trim(),
      contact_name: (b.contact_name || null),
      phone: (b.phone || null),
      email: (b.email || null),
      stand_number: (b.stand_number || null),
      staff_quota: Number(b.staff_quota || 0),
      vehicle_quota: Number(b.vehicle_quota || 0),
    };

    if (id) {
      await env.DB.prepare(
        `UPDATE vendors
            SET name=?1, contact_name=?2, phone=?3, email=?4,
                stand_number=?5, staff_quota=?6, vehicle_quota=?7
          WHERE id=?8 AND event_id=?9`
      ).bind(
        fields.name, fields.contact_name, fields.phone, fields.email,
        fields.stand_number, fields.staff_quota, fields.vehicle_quota,
        id, event_id
      ).run();
      return json({ ok: true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO vendors
           (event_id, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
      ).bind(
        event_id, fields.name, fields.contact_name, fields.phone, fields.email,
        fields.stand_number, fields.staff_quota, fields.vehicle_quota
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
  }));

  router.add("GET", "/api/admin/vendor/:id/passes", guard(async (_req, env, _ctx, { id }) => {
    const v = await env.DB.prepare(
      `SELECT id, event_id, name
         FROM vendors
        WHERE id = ?1
        LIMIT 1`
    ).bind(Number(id)).first();
    if (!v) return bad("Vendor not found", 404);

    const pQ = await env.DB.prepare(
      `SELECT id, vendor_id, type, label, vehicle_reg, qr, state,
              first_in_at, last_out_at, issued_at
         FROM vendor_passes
        WHERE vendor_id = ?1
        ORDER BY id ASC`
    ).bind(Number(id)).all();

    return json({ ok: true, vendor: v, passes: pQ.results || [] });
  }));

  router.add("POST", "/api/admin/vendor/:id/pass/add", guard(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const vendor_id = Number(id || 0);
    if (!vendor_id) return bad("vendor_id required");

    const type = (b.type || "").trim(); // 'staff' | 'vehicle'
    if (!(type === "staff" || type === "vehicle")) return bad("Invalid type");

    const label = (b.label || "").trim();
    const vehicle_reg = type === "vehicle" ? (b.vehicle_reg || "").trim() : null;
    const qr = ("VND-" + Math.random().toString(36).slice(2, 8)).toUpperCase();

    await env.DB.prepare(
      `INSERT INTO vendor_passes (vendor_id, type, label, vehicle_reg, qr)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(vendor_id, type, label || null, vehicle_reg, qr).run();

    return json({ ok: true, qr });
  }));

  router.add("POST", "/api/admin/vendor/:id/pass/delete", guard(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const pid = Number(b?.pass_id || 0);
    if (!pid) return bad("pass_id required");
    await env.DB.prepare(
      `DELETE FROM vendor_passes
        WHERE id = ?1 AND vendor_id = ?2`
    ).bind(pid, Number(id || 0)).run();
    return json({ ok: true });
  }));

  /* ---------------- Vendors (extras: portal + WhatsApp) ------------------- */
  function randToken(len = 22) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < len; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  async function ensureVendorToken(env, id) {
    const row = await env.DB.prepare(`SELECT portal_token FROM vendors WHERE id=?1`).bind(id).first();
    let tok = row?.portal_token;
    if (!tok) {
      tok = randToken(24);
      try {
        await env.DB.prepare(`UPDATE vendors SET portal_token=?1, portal_status=COALESCE(portal_status,'invited') WHERE id=?2`).bind(tok, id).run();
      } catch {}
    }
    return tok;
  }
  async function sendWA(env, to, text, tplKey, fallbackName, vars) {
    if (!to) return;
    try {
      const mod = await import("../services/whatsapp.js");
      // try template via site setting "name:lang"
      const sel = await getSetting(env, tplKey);
      if (sel && mod.sendWhatsAppTemplate) {
        const [name, language='af'] = String(sel).split(":");
        try {
          await mod.sendWhatsAppTemplate(env, { to, name, language, variables: (vars||{}) });
          return true;
        } catch {}
      }
      if (text && mod.sendWhatsAppTextIfSession) {
        await mod.sendWhatsAppTextIfSession(env, to, text);
        return true;
      }
    } catch {}
    return false;
  }

  // Get (or create) vendor portal link
  router.add("GET", "/api/admin/vendor/:id/portal-link", guard(async (_req, env, _ctx, { id }) => {
    const v = await env.DB.prepare(`SELECT id, phone FROM vendors WHERE id=?1`).bind(Number(id)).first();
    if (!v) return bad("not found", 404);
    const tok = await ensureVendorToken(env, v.id);
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/vendor/${tok}` : `/vendor/${tok}`;
    return json({ ok:true, link, token: tok });
  }));

  // Send welcome WA
  router.add("POST", "/api/admin/vendors/:id/send-welcome", guard(async (_req, env, _ctx, { id }) => {
    const v = await env.DB.prepare(`SELECT id, name, phone FROM vendors WHERE id=?1`).bind(Number(id)).first();
    if (!v) return bad("not found", 404);
    const tok = await ensureVendorToken(env, v.id);
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/vendor/${tok}` : `/vendor/${tok}`;

    const ok = await sendWA(
      env,
      v.phone,
      `Welkom by die Villiersdorp Skou!\nVoltooi asseblief jou verkoper-profiel:\n${link}\nDankie 🌾`,
      "WA_TMP_VENDOR_WELCOME",
      "vendor_welcome",
      { name: v.name || "", link }
    );

    try {
      await env.DB.prepare(
        `UPDATE vendors SET portal_status=COALESCE(portal_status,'invited'), welcome_sent_at=?1 WHERE id=?2`
      ).bind(Math.floor(Date.now()/1000), v.id).run();
    } catch {}
    return json({ ok:true, sent: ok === true });
  }));

  // Load submitted profile for review
  router.add("GET", "/api/admin/vendor/:id/profile", guard(async (_req, env, _ctx, { id }) => {
    const v = await env.DB.prepare(
      `SELECT id, name, phone, email, profile_json, portal_status
         FROM vendors WHERE id=?1 LIMIT 1`
    ).bind(Number(id)).first();
    if (!v) return bad("not found", 404);
    let profile = null;
    try { profile = v.profile_json ? JSON.parse(v.profile_json) : null; } catch {}
    return json({ ok:true, vendor: { id:v.id, name:v.name, phone:v.phone, email:v.email, portal_status:v.portal_status }, profile });
  }));

  // Assign stand info (admin)
  router.add("POST", "/api/admin/vendor/:id/assign", guard(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const assigned = b?.assigned || {};
    await env.DB.prepare(
      `UPDATE vendors SET assigned_json=?1, portal_status='approved' WHERE id=?2`
    ).bind(JSON.stringify(assigned), Number(id)).run();
    return json({ ok:true });
  }));

  // Send assigned pack WA
  router.add("POST", "/api/admin/vendors/:id/send-assigned", guard(async (_req, env, _ctx, { id }) => {
    const v = await env.DB.prepare(`SELECT id, name, phone, portal_token FROM vendors WHERE id=?1`).bind(Number(id)).first();
    if (!v) return bad("not found", 404);
    const tok = v.portal_token || await ensureVendorToken(env, v.id);
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/vendor/${tok}/pack` : `/vendor/${tok}/pack`;

    const ok = await sendWA(
      env,
      v.phone,
      `Jou stalletjie is bevestig ✅\nAlle info & toegangspasse:\n${link}\nSien jou by die Skou!`,
      "WA_TMP_VENDOR_ASSIGNED",
      "vendor_assigned",
      { name: v.name || "", link }
    );

    try {
      await env.DB.prepare(
        `UPDATE vendors SET assigned_sent_at=?1 WHERE id=?2`
      ).bind(Math.floor(Date.now()/1000), v.id).run();
    } catch {}
    return json({ ok:true, sent: ok === true });
  }));

  /* ---------------- Users ----------------------- */
  router.add("GET", "/api/admin/users", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, username, role
         FROM users
        ORDER BY id ASC`
    ).all();
    return json({ ok: true, users: q.results || [] });
  }));
}
