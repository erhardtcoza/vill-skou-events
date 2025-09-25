// /src/routes/past_visitors.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/* -------------------------- helpers -------------------------- */
function msisdn(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
const nowTs = () => Math.floor(Date.now() / 1000);

async function upsertVisitor(env, { name, phone, source, source_ref, tag, overwriteName = false }) {
  const ph = msisdn(phone);
  if (!ph) return { ok: false, reason: "bad_phone" };

  // fetch existing
  const ex = await env.DB.prepare(
    `SELECT id, name, seen_count, tags FROM past_visitors WHERE phone=?1 LIMIT 1`
  ).bind(ph).first();

  const ts = nowTs();
  if (ex) {
    // merge tags (very simple CSV dedupe)
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

/* ------------------------- main mount ------------------------ */
export function mountPastVisitors(router) {
  const guard = (fn) => requireRole("admin", fn);

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
      const ph = msisdn(phone);
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
      const ph = msisdn(r?.phone || "");
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

  /* ---------- Send to selected (quick send; unchanged) ---------- */
  router.add("POST", "/api/admin/past/send", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const ids = Array.isArray(b?.visitor_ids) ? b.visitor_ids.slice(0, 50) : [];
    const template_key = String(b?.template_key || "WA_TMP_SKOU_SALES");
    const vars = Array.isArray(b?.vars) ? b.vars : [];
    if (!ids.length) return bad("visitor_ids required");

    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");
    if (!token || !pnid) return bad("WhatsApp credentials missing in settings");

    const selRow = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(template_key).first();
    const { name: tplName, lang: tplLang } = parseTplSel(selRow?.value || "");
    if (!tplName) return bad(`Template not configured for ${template_key}`);

    const ts = nowTs();
    const results = [];
    const vs = vars.length
      ? [{ type: "body", parameters: vars.map(v => ({ type: "text", text: String(v) })) }]
      : [];

    // recipients
    const recs = await env.DB.prepare(
      `SELECT id, phone, opt_out FROM past_visitors WHERE id IN (${"?,".repeat(ids.length).slice(0,-1)})`
    ).bind(...ids).all();

    for (const r of (recs.results || [])) {
      if (!r.phone || r.opt_out) {
        results.push({ id: r.id, skipped: true, reason: r.opt_out ? "opt_out" : "no_phone" });
        continue;
      }
      const payload = {
        messaging_product: "whatsapp",
        to: r.phone,
        type: "template",
        template: { name: tplName, language: { code: tplLang }, components: vs }
      };
      let ok = false, msgId = null, errMsg = null;
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pnid)}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const y = await res.json().catch(()=> ({}));
        ok = res.ok;
        msgId = y?.messages?.[0]?.id || null;
        errMsg = y?.error?.message || (!res.ok ? `HTTP ${res.status}` : null);
      } catch (e) {
        errMsg = String(e?.message || e);
      }

      await env.DB.prepare(
        `UPDATE past_visitors
            SET last_contacted_at=?2,
                last_send_status=?3
          WHERE id=?1`
      ).bind(r.id, ts, ok ? "sent" : ("failed:" + (errMsg || ""))).run();

      results.push({ id: r.id, ok, message_id: msgId, error: errMsg || null });
      await new Promise(r => setTimeout(r, 350));
    }

    return json({ ok: true, results });
  }));

  /* ===========================================================
   *                CAMPAIGNS (create/run/status)
   * ===========================================================
   */

  // Helper: resolve recipients from explicit ids OR a filter object
  async function resolveRecipients(env, filter) {
    if (Array.isArray(filter?.ids) && filter.ids.length) {
      const ids = filter.ids.map(Number).filter(Boolean);
      const rs = await env.DB.prepare(
        `SELECT id, phone, opt_out FROM past_visitors WHERE id IN (${"?,".repeat(ids.length).slice(0,-1)})`
      ).bind(...ids).all();
      return (rs.results || []).map(r => ({ id: r.id, phone: r.phone, opt_out: r.opt_out ? 1 : 0 }));
    }
    // filter by query/tag/optout
    const q = (filter?.query || "").trim();
    const tag = (filter?.tag || "").trim();
    const opt = filter?.optout; // undefined | 0 | 1
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
       LIMIT ${Math.min(Number(filter?.limit || 5000), 10000)}
    `;
    const rs = await env.DB.prepare(sql)
      .bind(q ? `%${q}%` : undefined, tag ? `%${tag}%` : undefined)
      .all();
    return (rs.results || []).map(r => ({ id: r.id, phone: r.phone, opt_out: r.opt_out ? 1 : 0 }));
  }

  // Create campaign from current selection/filter
  router.add("POST", "/api/admin/past/campaign/create", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const name = (b?.name || "").trim() || `Campaign ${new Date().toLocaleString()}`;
    const template_key = String(b?.template_key || "WA_TMP_SKOU_SALES");
    const template_vars = Array.isArray(b?.template_vars) ? b.template_vars.map(v => String(v)) : [];
    const filter = b?.filter && typeof b.filter === "object" ? b.filter : {};

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

  // Run/continue batch
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

    // WhatsApp config & template
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

    // mark running/started
    if (!camp.started_at) {
      await env.DB.prepare(`UPDATE wa_campaigns SET status='running', started_at=?2 WHERE id=?1`)
        .bind(id, nowTs()).run();
    } else {
      await env.DB.prepare(`UPDATE wa_campaigns SET status='running' WHERE id=?1`).bind(id).run();
    }

    // Fetch next queued items (skip hard-opted out visitors)
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

      // mirror on past_visitors
      await env.DB.prepare(
        `UPDATE past_visitors
            SET last_contacted_at=?2, last_send_status=?3
          WHERE id=?1`
      ).bind(r.visitor_id, nowTs(), ok ? "sent" : ("failed:"+(err||""))).run();

      if (ok) sent++; else failed++;
      if (delay) await new Promise(res => setTimeout(res, delay));
    }

    // Update tallies
    await env.DB.prepare(
      `UPDATE wa_campaigns
          SET sent_count = COALESCE(sent_count,0)+?2,
              fail_count = COALESCE(fail_count,0)+?3
        WHERE id=?1`
    ).bind(id, sent, failed).run();

    // Are there any queued left?
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

  // Status
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
