// /src/routes/past_visitors.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/* -------------------------- helpers -------------------------- */
// Strict SA MSISDN normalizer for WhatsApp (27 + 9 = 11 digits)
function normalizeMsisdn(raw) {
  const d = String(raw || "").replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("27") && d.length === 11) return d;
  if (d.startsWith("0") && d.length === 10) return "27" + d.slice(1);
  if (d.length === 9) return "27" + d;
  return "";
}
const msisdn = normalizeMsisdn;
const nowTs = () => Math.floor(Date.now() / 1000);

async function upsertVisitor(env, { name, phone, source, source_ref, tag, overwriteName = false }) {
  const ph = normalizeMsisdn(phone);
  if (!ph) return { ok: false, reason: "bad_phone" };

  const ex = await env.DB.prepare(
    `SELECT id, name, seen_count, tags FROM past_visitors WHERE phone=?1 LIMIT 1`
  ).bind(ph).first();

  const ts = nowTs();
  if (ex) {
    const curTags = (ex.tags || "").split(",").map(x => x.trim()).filter(Boolean);
    if (tag) curTags.push(tag);
    const dedup = Array.from(new Set(curTags)).join(",");

    await env.DB.prepare(
      `UPDATE past_visitors
         SET name = CASE WHEN ?2 AND ?3!='' THEN ?3 ELSE name END,
             last_seen_at=?4,
             seen_count=seen_count+1,
             source=?5,
             source_ref=COALESCE(?6, source_ref),
             tags=CASE WHEN ?7!='' THEN ?7 ELSE tags END
       WHERE id=?1`
    ).bind(
      ex.id,
      overwriteName ? 1 : 0,
      String(name || ""),
      ts,
      String(source || "import"),
      source_ref || null,
      dedup
    ).run();
    return { ok: true, id: ex.id, updated: true };
  } else {
    await env.DB.prepare(
      `INSERT INTO past_visitors
         (name, phone, source, source_ref, first_seen_at, last_seen_at, seen_count, tags)
       VALUES (?1,?2,?3,?4,?5,?5,1,?6)`
    ).bind(
      name || null,
      ph,
      String(source || "import"),
      source_ref || null,
      ts,
      tag || null
    ).run();
    const row = await env.DB.prepare(`SELECT id FROM past_visitors WHERE phone=?1`).bind(ph).first();
    return { ok: true, id: row?.id || 0, inserted: true };
  }
}

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}
function parseTplSel(sel) {
  const [name, lang] = String(sel || "").split(":");
  return { name: (name || "").trim(), lang: (lang || "en_US").trim() };
}

/* ===========================================================
 *                    main mount
 * ===========================================================
 */
export function mountPastVisitors(router) {
  const guard = (fn) => requireRole("admin", fn);

  /* ---------- Normalize (merge duplicates on UNIQUE phone) ---------- */
  router.add("POST", "/api/admin/past/normalize", guard(async (_req, env) => {
    const rs = await env.DB.prepare(
      `SELECT id, name, phone, tags, seen_count, first_seen_at, last_seen_at, last_contacted_at, last_send_status
         FROM past_visitors`
    ).all();

    const rows = rs.results || [];
    let fixed = 0, unchanged = 0, invalid = 0, merged = 0, total = rows.length;

    const splitTags = (s) => (String(s||"").split(",").map(x=>x.trim()).filter(Boolean));
    const joinTags  = (a,b) => Array.from(new Set([...(a||[]), ...(b||[])])).join(",");

    for (const r of rows) {
      const cur = String(r.phone || "");
      if (!cur) { invalid++; continue; }

      const norm = normalizeMsisdn(cur);
      if (!norm) {
        invalid++;
        await env.DB.prepare(
          `UPDATE past_visitors
             SET last_send_status = COALESCE(NULLIF(last_send_status,''),'invalid_phone')
           WHERE id=?1`
        ).bind(r.id).run();
        continue;
      }

      if (norm === cur) { unchanged++; continue; }

      const other = await env.DB.prepare(
        `SELECT id, name, tags, seen_count, first_seen_at, last_seen_at, last_contacted_at, last_send_status
           FROM past_visitors
          WHERE phone=?1 LIMIT 1`
      ).bind(norm).first();

      if (!other) {
        await env.DB.prepare(`UPDATE past_visitors SET phone=?2 WHERE id=?1`).bind(r.id, norm).run();
        fixed++;
        continue;
      }

      if (other.id === r.id) { unchanged++; continue; }

      const survivor = other;
      const dupe     = r;

      const nameA = String(survivor.name || "").trim();
      const nameB = String(dupe.name || "").trim();
      const nameFinal = nameB && (!nameA || nameB.length > nameA.length) ? nameB : (nameA || null);

      const tagsFinal = joinTags(splitTags(survivor.tags), splitTags(dupe.tags));

      const seenFinal   = Number(survivor.seen_count||0) + Number(dupe.seen_count||0);
      const firstFinal  = Math.min(Number(survivor.first_seen_at||nowTs()), Number(dupe.first_seen_at||nowTs()));
      const lastFinal   = Math.max(Number(survivor.last_seen_at||firstFinal), Number(dupe.last_seen_at||firstFinal));
      const lcA = Number(survivor.last_contacted_at || 0);
      const lcB = Number(dupe.last_contacted_at || 0);
      const lastContactFinal = Math.max(lcA, lcB) || null;
      const lssFinal = lcB > lcA
        ? (dupe.last_send_status || survivor.last_send_status || null)
        : (survivor.last_send_status || dupe.last_send_status || null);

      await env.DB.prepare(
        `UPDATE past_visitors
            SET name=?2, tags=?3, seen_count=?4, first_seen_at=?5, last_seen_at=?6,
                last_contacted_at=?7, last_send_status=?8
          WHERE id=?1`
      ).bind(
        survivor.id, nameFinal, tagsFinal || null, seenFinal,
        firstFinal, lastFinal, lastContactFinal, lssFinal
      ).run();

      await env.DB.prepare(
        `UPDATE wa_campaign_sends SET visitor_id=?2 WHERE visitor_id=?1`
      ).bind(dupe.id, survivor.id).run();

      await env.DB.prepare(`DELETE FROM past_visitors WHERE id=?1`).bind(dupe.id).run();

      merged++; fixed++;
    }

    return json({ ok: true, fixed, merged, unchanged, invalid, total });
  }));

  /* ---------- Import CSV ---------- */
  router.add("POST", "/api/admin/past/import", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const rows = Array.isArray(b?.rows) ? b.rows : [];
    if (!rows.length) return bad("rows required");

    const overwrite = !!b?.overwrite_names;
    const filename = b?.filename || null;
    let inserted = 0, updated = 0, skipped_invalid = 0, total = rows.length;

    for (const r of rows) {
      const name = (r?.name || "").trim();
      const phone = r?.phone || "";
      const ph = normalizeMsisdn(phone);
      if (!ph) { skipped_invalid++; continue; }

      const res = await upsertVisitor(env, {
        name, phone: ph, source: "import", source_ref: filename, tag: "2025", overwriteName: overwrite
      });
      if (!res.ok) { skipped_invalid++; continue; }
      if (res.inserted) inserted++;
      else if (res.updated) updated++;
    }

    return json({ ok: true, inserted, updated, skipped_invalid, total });
  }));

  /* ---------- Sync from orders/pos/attendees ---------- */
  router.add("POST", "/api/admin/past/sync", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const from = String(b?.from || "").toLowerCase();
    const event_id = Number(b?.event_id || 0) || null;
    const tag = String(b?.tag || "2025");

    let rows = [];
    if (from === "orders") {
      rows = (await env.DB.prepare(
        `SELECT DISTINCT TRIM(COALESCE(buyer_name,'')) AS name, buyer_phone AS phone
           FROM orders
          WHERE COALESCE(buyer_phone,'')!='' ${event_id ? "AND event_id="+event_id : ""}`
      ).all()).results || [];
    } else if (from === "pos") {
      rows = (await env.DB.prepare(
        `SELECT DISTINCT TRIM(COALESCE(buyer_name,'')) AS name, buyer_phone AS phone
           FROM orders
          WHERE COALESCE(buyer_phone,'')!=''
            AND payment_method LIKE 'pos_%' ${event_id ? "AND event_id="+event_id : ""}`
      ).all()).results || [];
    } else if (from === "attendees") {
      rows = (await env.DB.prepare(
        `SELECT DISTINCT TRIM(COALESCE(attendee_first,'')||' '||COALESCE(attendee_last,'')) AS name,
                         phone
           FROM tickets
          WHERE COALESCE(phone,'')!='' ${event_id ? "AND event_id="+event_id : ""}`
      ).all()).results || [];
    } else {
      return bad("from must be one of: orders | pos | attendees");
    }

    let inserted = 0, updated = 0, skipped_invalid = 0, total = rows.length;
    for (const r of rows) {
      const ph = normalizeMsisdn(r?.phone || "");
      if (!ph) { skipped_invalid++; continue; }
      const res = await upsertVisitor(env, {
        name: (r?.name || "").trim(),
        phone: ph,
        source: from === "orders" ? "online_order" : (from === "pos" ? "pos_sale" : "ticket_attendee"),
        source_ref: event_id ? `event:${event_id}` : null,
        tag
      });
      if (!res.ok) { skipped_invalid++; continue; }
      if (res.inserted) inserted++;
      else if (res.updated) updated++;
    }

    return json({ ok: true, inserted, updated, skipped_invalid, total });
  }));

  /* ---------- List / filter ---------- */
  router.add("GET", "/api/admin/past/list", guard(async (req, env) => {
    const u = new URL(req.url);
    const q = (u.searchParams.get("query") || "").trim();
    const tag = (u.searchParams.get("tag") || "").trim();
    const optout = u.searchParams.get("optout");
    const limit = Math.min(Number(u.searchParams.get("limit") || 50), 100);
    const offset = Math.max(Number(u.searchParams.get("offset") || 0), 0);

    const where = [];
    if (q) where.push("(phone LIKE ?1 OR name LIKE ?1)");
    if (tag) where.push("(tags LIKE ?2)");
    if (optout === "0") where.push("opt_out=0");
    if (optout === "1") where.push("opt_out=1");

    const sql =
      `SELECT id, name, phone, source, source_ref, opt_out, last_contacted_at, last_send_status, tags
         FROM past_visitors
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}`;

    const rows = await env.DB.prepare(sql)
      .bind(q ? `%${q}%` : undefined, tag ? `%${tag}%` : undefined)
      .all();

    return json({ ok: true, visitors: rows.results || [] });
  }));

  /* ===========================================================
   *                CAMPAIGNS (create/run/status)
   * ===========================================================
   */

  async function resolveRecipients(env, filterOrIds) {
    if (Array.isArray(filterOrIds?.ids) && filterOrIds.ids.length) {
      const ids = filterOrIds.ids.map(Number).filter(Boolean);
      if (!ids.length) return [];
      const rs = await env.DB.prepare(
        `SELECT id, phone, opt_out FROM past_visitors WHERE id IN (${"?,".repeat(ids.length).slice(0,-1)})`
      ).bind(...ids).all();
      return (rs.results || []).map(r => ({ id: r.id, phone: r.phone, opt_out: r.opt_out ? 1 : 0 }));
    }
    // filter path
    const q = (filterOrIds?.query || "").trim();
    const tag = (filterOrIds?.tag || "").trim();
    const opt = filterOrIds?.optout;
    const where = [];
    if (q) where.push("(phone LIKE ?1 OR name LIKE ?1)");
    if (tag) where.push("(tags LIKE ?2)");
    if (opt === 0) where.push("opt_out=0");
    if (opt === 1) where.push("opt_out=1");
    const sql = `
      SELECT id, phone, opt_out
        FROM past_visitors
       ${where.length ? "WHERE "+where.join(" AND ") : ""}
       ORDER BY last_seen_at DESC
       LIMIT ${Math.min(Number(filterOrIds?.limit || 10000), 10000)}
    `;
    const rs = await env.DB.prepare(sql)
      .bind(q ? `%${q}%` : undefined, tag ? `%${tag}%` : undefined)
      .all();
    return (rs.results || []).map(r => ({ id: r.id, phone: r.phone, opt_out: r.opt_out ? 1 : 0 }));
  }

  // ---- Core create (singular path) ----
  router.add("POST", "/api/admin/past/campaign/create", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const name = (b?.name || "").trim() || `Campaign ${new Date().toLocaleString()}`;
    const template_key = String(b?.template_key || "WA_TMP_SKOU_SALES");
    // accept either "vars" (UI) or "template_vars" (internal)
    const template_vars = Array.isArray(b?.template_vars) ? b.template_vars.map(String)
                        : Array.isArray(b?.vars) ? b.vars.map(String)
                        : [];
    // accept either visitor_ids or filter
    const filter =
      Array.isArray(b?.visitor_ids) && b.visitor_ids.length
        ? { ids: b.visitor_ids.map(Number).filter(Boolean) }
        : (b?.filter && typeof b.filter === "object" ? b.filter : {});

    // Validate template configured
    const sel = await getSetting(env, template_key);
    const { name: tplName } = parseTplSel(sel || "");
    if (!tplName) return bad(`Template not configured for ${template_key}`);

    // Insert campaign
    const ts = nowTs();
    const r = await env.DB.prepare(
      `INSERT INTO wa_campaigns (name, template_key, template_vars_json, filter_json, status, created_at)
       VALUES (?1,?2,?3,?4,'draft',?5)`
    ).bind(name, template_key, JSON.stringify(template_vars), JSON.stringify(filter || {}), ts).run();
    const cid = r.meta.last_row_id;

    // Resolve targets
    const recips = await resolveRecipients(env, filter);
    let queued = 0;
    for (const vv of recips) {
      if (!vv.phone) continue;
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO wa_campaign_sends
             (campaign_id, visitor_id, phone, status, sent_at)
           VALUES (?1, ?2, ?3, 'queued', NULL)`
        ).bind(cid, vv.id, vv.phone).run();
        queued++;
      } catch {}
    }
    await env.DB.prepare(`UPDATE wa_campaigns SET total_targets=?2 WHERE id=?1`).bind(cid, queued).run();

    return json({ ok: true, campaign_id: cid, total_targets: queued });
  }));

  // ---- Aliased create (plural path to match UI) ----
  router.add("POST", "/api/admin/past/campaigns/create", guard(async (req, env) => {
    // simply delegate to singular handler by reusing the logic above
    return await router.match("POST", "/api/admin/past/campaign/create").handler(req, env);
  }));

  // Run/continue batch (singular)
  router.add("POST", "/api/admin/past/campaign/run", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.campaign_id || 0);
    const batch = Math.min(Math.max(Number(b?.batch_size || 30), 1), 200);
    const delay = Math.max(Number(b?.delay_ms || 350), 0);
    if (!id) return bad("campaign_id required");

    const camp = await env.DB.prepare(`SELECT * FROM wa_campaigns WHERE id=?1 LIMIT 1`).bind(id).first();
    if (!camp) return bad("campaign not found", 404);
    if (camp.status === "paused") return bad("campaign is paused");
    if (camp.status === "done")   return json({ ok:true, done:true });

    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");
    if (!token || !pnid) return bad("WhatsApp credentials missing in settings");
    const sel = await getSetting(env, camp.template_key);
    const { name: tplName, lang: tplLang } = parseTplSel(sel || "");
    if (!tplName) return bad(`Template not configured for ${camp.template_key}`);

    const vars = (()=>{ try { return JSON.parse(camp.template_vars_json||"[]"); } catch { return []; } })();
    const components = vars.length
      ? [{ type:"body", parameters: vars.map(v => ({ type:"text", text:String(v) })) }]
      : [];

    if (!camp.started_at) {
      await env.DB.prepare(`UPDATE wa_campaigns SET status='running', started_at=?2 WHERE id=?1`)
        .bind(id, nowTs()).run();
    } else {
      await env.DB.prepare(`UPDATE wa_campaigns SET status='running' WHERE id=?1`).bind(id).run();
    }

    const rows = await env.DB.prepare(
      `SELECT s.id, s.visitor_id, s.phone, v.opt_out
         FROM wa_campaign_sends s
         LEFT JOIN past_visitors v ON v.id = s.visitor_id
        WHERE s.campaign_id=?1 AND (s.status IS NULL OR s.status='queued')
        ORDER BY s.id ASC
        LIMIT ?2`
    ).bind(id, batch).all();

    const todos = rows.results || [];
    let sent = 0, failed = 0, skipped = 0;

    for (const r of todos) {
      if (!r.phone || r.opt_out) {
        skipped++;
        await env.DB.prepare(
          `UPDATE wa_campaign_sends SET status=?2 WHERE id=?1`
        ).bind(r.id, r.opt_out ? "skipped:optout" : "skipped:nophone").run();
        continue;
      }
      const payload = {
        messaging_product: "whatsapp",
        to: r.phone,
        type: "template",
        template: { name: tplName, language: { code: tplLang }, components }
      };
      let ok=false, msgId=null, err=null;
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pnid)}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const y = await res.json().catch(()=>({}));
        ok = res.ok;
        msgId = y?.messages?.[0]?.id || null;
        err = y?.error?.message || (!res.ok ? `HTTP ${res.status}` : null);
      } catch (e) {
        err = String(e?.message || e);
      }

      await env.DB.prepare(
        `UPDATE wa_campaign_sends
            SET status=?2, provider_message_id=?3, error=?4, sent_at=?5
          WHERE id=?1`
      ).bind(r.id, ok ? "sent" : ("failed:"+(err||"")), msgId, err || null, nowTs()).run();

      await env.DB.prepare(
        `UPDATE past_visitors
            SET last_contacted_at=?2, last_send_status=?3
          WHERE id=?1`
      ).bind(r.visitor_id, nowTs(), ok ? "sent" : ("failed:"+(err||""))).run();

      if (ok) sent++; else failed++;
      if (delay) await new Promise(res => setTimeout(res, delay));
    }

    await env.DB.prepare(
      `UPDATE wa_campaigns
          SET sent_count = COALESCE(sent_count,0)+?2,
              fail_count = COALESCE(fail_count,0)+?3
        WHERE id=?1`
    ).bind(id, sent, failed).run();

    const leftRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM wa_campaign_sends WHERE campaign_id=?1 AND (status IS NULL OR status='queued')`
    ).bind(id).first();
    const left = Number(leftRow?.c || 0);

    if (left === 0) {
      await env.DB.prepare(
        `UPDATE wa_campaigns SET status='done', finished_at=?2 WHERE id=?1`
      ).bind(id, nowTs()).run();
    }

    return json({ ok:true, processed: todos.length, sent, failed, skipped, left,
      status: left ? "running" : "done" });
  }));

  // ---- Aliased run (plural path to match UI) ----
  router.add("POST", "/api/admin/past/campaigns/run", guard(async (req, env) => {
    return await router.match("POST", "/api/admin/past/campaign/run").handler(req, env);
  }));

  // Status (singular, query param OR plural with :id)
  router.add("GET", "/api/admin/past/campaign/status", guard(async (req, env) => {
    const u = new URL(req.url);
    const id = Number(u.searchParams.get("id") || 0);
    if (!id) return bad("id required");

    const c = await env.DB.prepare(`SELECT * FROM wa_campaigns WHERE id=?1`).bind(id).first();
    if (!c) return bad("campaign not found", 404);

    const q = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END)                                  AS sent,
         SUM(CASE WHEN status LIKE 'failed%' THEN 1 ELSE 0 END)                           AS failed,
         SUM(CASE WHEN status='queued' OR status IS NULL THEN 1 ELSE 0 END)               AS queued,
         SUM(CASE WHEN status LIKE 'skipped%' THEN 1 ELSE 0 END)                          AS skipped
       FROM wa_campaign_sends
      WHERE campaign_id=?1`
    ).bind(id).first();

    return json({ ok:true, campaign: {
      id: c.id, name: c.name, status: c.status,
      total_targets: Number(c.total_targets||0),
      sent_count: Number(c.sent_count||0),
      fail_count: Number(c.fail_count||0),
      started_at: c.started_at || null,
      finished_at: c.finished_at || null,
      queued: Number(q?.queued||0),
      sent: Number(q?.sent||0),
      failed: Number(q?.failed||0),
      skipped: Number(q?.skipped||0),
      last_error: c.last_error || null
    }});
  }));

  // ---- Aliased status with path param: /campaigns/:id/status ----
  router.add("GET", "/api/admin/past/campaigns/:id/status", guard(async (req, env, p) => {
    const id = Number(p?.id || 0);
    const fakeReq = new Request(new URL(`/api/admin/past/campaign/status?id=${id}`, req.url), req);
    return await router.match("GET", "/api/admin/past/campaign/status").handler(fakeReq, env);
  }));

  // Pause / Resume
  router.add("POST", "/api/admin/past/campaign/pause", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0); if (!id) return bad("id required");
    await env.DB.prepare(`UPDATE wa_campaigns SET status='paused' WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));
  router.add("POST", "/api/admin/past/campaign/resume", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = Number(b?.id || 0); if (!id) return bad("id required");
    await env.DB.prepare(`UPDATE wa_campaigns SET status='running' WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));
}
