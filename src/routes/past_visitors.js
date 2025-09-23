// /src/routes/past_visitors.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/* ---------------------------- utils ---------------------------- */
const nowTs = () => Math.floor(Date.now() / 1000);

function msisdn(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("27") && s.length >= 11) return s;
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function upsertVisitor(env, { name, phone, source, source_ref, tag, overwriteName = false }) {
  const ph = msisdn(phone);
  if (!ph) return { ok: false, reason: "bad_phone" };

  const ex = await env.DB.prepare(
    `SELECT id, name, seen_count, tags FROM past_visitors WHERE phone=?1 LIMIT 1`
  ).bind(ph).first();

  const ts = nowTs();
  if (ex) {
    const curTags = String(ex.tags || "")
      .split(",").map(x => x.trim()).filter(Boolean);
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

/* ---------------------- WA helpers (service) -------------------- */
async function sendTemplate(env, to, templateKey, vars = []) {
  // templateKey is a site_settings key like WA_TMP_SKOU_SALES with value "name:lang"
  const sel = await getSetting(env, templateKey);
  const [name, lang] = String(sel || "").split(":");
  if (!name) return { ok: false, error: `template_not_configured:${templateKey}` };

  // Lazy import service
  let svc = null;
  try { svc = await import("../services/whatsapp.js"); } catch {}
  if (!svc?.sendWhatsAppTemplate) return { ok: false, error: "wa_service_missing" };

  const ok = await svc.sendWhatsAppTemplate(env, to, "", lang || "en_US", name, vars);
  return { ok };
}

/* ---------------------------- router --------------------------- */
export function mountPastVisitors(router) {
  const guard = (fn) => requireRole("admin", fn);

  /* -------- Import CSV rows -------- */
  router.add("POST", "/api/admin/past/import", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const rows = Array.isArray(b?.rows) ? b.rows : [];
    if (!rows.length) return bad("rows required");

    const overwrite = !!b?.overwrite_names;
    const filename = b?.filename || null;
    let inserted = 0, updated = 0, skipped_invalid = 0, total = rows.length;

    for (const r of rows) {
      const name = (r?.name || "").trim();
      const ph = msisdn(r?.phone || "");
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

  /* -------- Sync from existing data -------- */
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
          WHERE COALESCE(buyer_phone,'')!='' AND payment_method LIKE 'pos_%' ${event_id ? "AND event_id="+event_id : ""}`
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

  /* -------- List + filter (limit 50) -------- */
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

  /* -------- Create a campaign (optional) --------
     Body: { name?, template_key, vars?:[], visitor_ids?:[] }
     - if visitor_ids provided, we seed wa_campaign_sends rows in 'queued'
  */
  router.add("POST", "/api/admin/past/campaigns/create", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const template_key = String(b?.template_key || "WA_TMP_SKOU_SALES");
    const vars = Array.isArray(b?.vars) ? b.vars : [];
    const name = (b?.name || `Ad-hoc ${new Date().toLocaleString()}`).slice(0, 120);
    const visitor_ids = Array.isArray(b?.visitor_ids) ? b.visitor_ids.slice(0, 500) : [];
    const ts = nowTs();

    const r = await env.DB.prepare(
      `INSERT INTO wa_campaigns (name, template_key, template_vars_json, status, created_at)
       VALUES (?1, ?2, ?3, 'created', ?4)`
    ).bind(name, template_key, JSON.stringify(vars), ts).run();
    const campaign_id = r.meta.last_row_id;

    if (visitor_ids.length) {
      // seed sends as 'queued' (skip dupes for this campaign)
      const recs = await env.DB.prepare(
        `SELECT id, phone, opt_out FROM past_visitors WHERE id IN (${"?,".repeat(visitor_ids.length).slice(0,-1)})`
      ).bind(...visitor_ids).all();

      for (const v of (recs.results || [])) {
        const ph = msisdn(v.phone);
        if (!ph || v.opt_out) continue;
        await env.DB.prepare(
          `INSERT INTO wa_campaign_sends (campaign_id, visitor_id, phone, status, sent_at)
           VALUES (?1, ?2, ?3, 'queued', 0)`
        ).bind(campaign_id, v.id, ph).run().catch(()=>{});
      }
    }

    return json({ ok: true, campaign_id });
  }));

  /* -------- Run/continue a campaign (batch) --------
     Body: { campaign_id, batch_size?:30, delay_ms?:350 }
  */
  router.add("POST", "/api/admin/past/campaigns/run", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const campaign_id = Number(b?.campaign_id || 0);
    if (!campaign_id) return bad("campaign_id required");
    const batch_size = Math.min(Math.max(Number(b?.batch_size || 30), 1), 100);
    const delay_ms = Math.min(Math.max(Number(b?.delay_ms || 350), 100), 2000);

    const c = await env.DB.prepare(
      `SELECT id, template_key, template_vars_json, status FROM wa_campaigns WHERE id=?1 LIMIT 1`
    ).bind(campaign_id).first();
    if (!c) return bad("campaign not found", 404);

    // ensure status
    if (c.status !== "running") {
      await env.DB.prepare(`UPDATE wa_campaigns SET status='running', started_at=?2 WHERE id=?1`)
        .bind(campaign_id, nowTs()).run();
    }

    const vars = (()=>{ try { return JSON.parse(c.template_vars_json||"[]"); } catch { return []; } })();

    // fetch a batch
    const batch = await env.DB.prepare(
      `SELECT s.id, s.visitor_id, s.phone
         FROM wa_campaign_sends s
        WHERE s.campaign_id=?1 AND (s.status IS NULL OR s.status='queued')
        LIMIT ?2`
    ).bind(campaign_id, batch_size).all();

    const rows = batch.results || [];
    if (!rows.length) {
      await env.DB.prepare(`UPDATE wa_campaigns SET status='finished', finished_at=?2 WHERE id=?1`)
        .bind(campaign_id, nowTs()).run();
      return json({ ok: true, done: true, processed: 0 });
    }

    // template send key ready?
    for (const r of rows) {
      const to = msisdn(r.phone);
      let ok = false, error = null, msgId = null;

      try {
        const res = await sendTemplate(env, to, c.template_key, vars);
        ok = !!res.ok;
        if (!ok) error = res.error || "send_failed";
      } catch (e) {
        error = String(e?.message || e);
      }

      // log
      const ts = nowTs();
      await env.DB.prepare(
        `UPDATE wa_campaign_sends
            SET status=?3, provider_message_id=COALESCE(?4, provider_message_id), error=COALESCE(?5,''), sent_at=?6
          WHERE id=?1 AND campaign_id=?2`
      ).bind(r.id, campaign_id, ok ? "sent" : "failed", msgId, error || null, ts).run().catch(()=>{});

      // backfill past_visitors status
      if (r.visitor_id) {
        await env.DB.prepare(
          `UPDATE past_visitors
              SET last_contacted_at=?2,
                  last_send_status=?3
            WHERE id=?1`
        ).bind(r.visitor_id, ts, ok ? "sent" : ("failed:" + (error || ""))).run().catch(()=>{});
      }

      // optional wa_logs row
      await env.DB.prepare(
        `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
         VALUES (?1,'template',?2,?3,?4)`
      ).bind(to, JSON.stringify({ template_key: c.template_key, vars }), ok ? "ok" : ("err:" + (error || "")), ts).run().catch(()=>{});

      // throttle
      await new Promise(res => setTimeout(res, delay_ms));
    }

    return json({ ok: true, processed: rows.length });
  }));

  /* -------- Campaign status -------- */
  router.add("GET", "/api/admin/past/campaigns/:id/status", guard(async (_req, env, _ctx, { id }) => {
    const cid = Number(id || 0);
    const c = await env.DB.prepare(
      `SELECT id, name, template_key, status, created_at, started_at, finished_at
         FROM wa_campaigns WHERE id=?1 LIMIT 1`
    ).bind(cid).first();
    if (!c) return bad("not_found", 404);

    const stats = await env.DB.prepare(
      `SELECT
         SUM(status='queued') AS queued,
         SUM(status='sent')   AS sent,
         SUM(status='failed') AS failed
       FROM wa_campaign_sends WHERE campaign_id=?1`
    ).bind(cid).first();

    return json({ ok: true, campaign: c, stats: {
      queued:  Number(stats?.queued || 0),
      sent:    Number(stats?.sent   || 0),
      failed:  Number(stats?.failed || 0),
    }});
  }));

  /* -------- Ad-hoc send (UI “Send to selected”) --------
     Body: { visitor_ids:[], template_key, vars?:[] }
     - Creates a one-off campaign behind the scenes so duplicate sends
       are prevented and everything is logged.
  */
  router.add("POST", "/api/admin/past/send", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const ids = Array.isArray(b?.visitor_ids) ? b.visitor_ids.slice(0, 50) : [];
    const template_key = String(b?.template_key || "WA_TMP_SKOU_SALES");
    const vars = Array.isArray(b?.vars) ? b.vars : [];
    if (!ids.length) return bad("visitor_ids required");

    // create an ad-hoc campaign
    const name = `Ad-hoc (${template_key}) · ${new Date().toLocaleString()}`;
    const cRes = await env.DB.prepare(
      `INSERT INTO wa_campaigns (name, template_key, template_vars_json, status, created_at)
       VALUES (?1, ?2, ?3, 'created', ?4)`
    ).bind(name, template_key, JSON.stringify(vars), nowTs()).run();
    const campaign_id = cRes.meta.last_row_id;

    // fetch recipients
    const recs = await env.DB.prepare(
      `SELECT id, phone, opt_out FROM past_visitors WHERE id IN (${"?,".repeat(ids.length).slice(0,-1)})`
    ).bind(...ids).all();

    const results = [];
    for (const r of (recs.results || [])) {
      const ph = msisdn(r.phone);
      if (!ph || r.opt_out) {
        results.push({ id: r.id, skipped: true, reason: r.opt_out ? "opt_out" : "no_phone" });
        continue;
      }

      // prevent duplicate sends for this campaign + visitor
      const already = await env.DB.prepare(
        `SELECT id FROM wa_campaign_sends WHERE campaign_id=?1 AND visitor_id=?2 LIMIT 1`
      ).bind(campaign_id, r.id).first();
      if (already) { results.push({ id: r.id, skipped: true, reason: "already_queued" }); continue; }

      // send
      let ok = false, errMsg = null, msgId = null;
      try {
        const res = await sendTemplate(env, ph, template_key, vars);
        ok = !!res.ok;
        if (!ok) errMsg = res.error || "send_failed";
      } catch (e) {
        errMsg = String(e?.message || e);
      }

      const ts = nowTs();

      // log in campaign_sends
      await env.DB.prepare(
        `INSERT INTO wa_campaign_sends (campaign_id, visitor_id, phone, status, provider_message_id, error, sent_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(campaign_id, r.id, ph, ok ? "sent" : "failed", msgId, errMsg || null, ts).run().catch(()=>{});

      // backfill last_contacted on past_visitors
      await env.DB.prepare(
        `UPDATE past_visitors
            SET last_contacted_at=?2,
                last_send_status=?3
          WHERE id=?1`
      ).bind(r.id, ts, ok ? "sent" : ("failed:" + (errMsg || ""))).run().catch(()=>{});

      // optional raw log
      await env.DB.prepare(
        `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
         VALUES (?1,'template',?2,?3,?4)`
      ).bind(ph, JSON.stringify({ template_key, vars }), ok ? "ok" : ("err:" + (errMsg || "")), ts).run().catch(()=>{});

      results.push({ id: r.id, ok, message_id: msgId, error: errMsg || null });

      // be gentle
      await new Promise(r => setTimeout(r, 350));
    }

    // mark campaign as finished for this ad-hoc run
    await env.DB.prepare(
      `UPDATE wa_campaigns SET status='finished', started_at=COALESCE(started_at,?2), finished_at=?2 WHERE id=?1`
    ).bind(campaign_id, nowTs()).run().catch(()=>{});

    return json({ ok: true, campaign_id, results });
  }));
}
