// /src/routes/past_visitors.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/* -------------------------- helpers -------------------------- */
function msisdn(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}

// Strict normaliser to WhatsApp format (27 + 9 digits = 11 total)
function norm27(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("27") && s.length === 11) return s;
  if (s.startsWith("0") && s.length === 10) return "27" + s.slice(1);
  if (!s.startsWith("0") && !s.startsWith("27") && s.length === 9) return "27" + s;
  const last9 = s.slice(-9);
  if (last9.length === 9) return "27" + last9;
  return "";
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

  /* ---------- Normalize ALL numbers to 27XXXXXXXXX ---------- */
  router.add("POST", "/api/admin/past/normalize", guard(async (_req, env) => {
    const q = await env.DB.prepare(`SELECT id, phone FROM past_visitors`).all();
    const rows = q.results || [];
    let fixed = 0, unchanged = 0, invalid = 0;

    for (const r of rows) {
      const current = String(r.phone || "");
      const normalized = norm27(current);
      if (!normalized) { invalid++; continue; }
      if (normalized === current) { unchanged++; continue; }
      await env.DB.prepare(`UPDATE past_visitors SET phone=?2 WHERE id=?1`).bind(r.id, normalized).run();
      fixed++;
    }
    return json({ ok: true, fixed, unchanged, invalid, total: rows.length });
  }));

  /* ---------- (Optional) List endpoint (kept for compatibility) ---------- */
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

  /* ---------- Quick send to selected (kept for compatibility) ---------- */
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
      let ok=false, msgId=null, errMsg=null;
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
   *                CAMPAIGNS (create-from-ALL / run / status)
   * ===========================================================
   */

  // Create a campaign from ALL eligible past visitors (opted in, valid 27XXXXXXXXX)
  // Body: { name?, template_key, vars?:[] }
  router.add("POST", "/api/admin/past/campaigns/create", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const template_key = String(b?.template_key || "").trim();
    const name = String(b?.name || "").trim() || `Campaign ${new Date().toLocaleString()}`;
    const vars = Array.isArray(b?.vars) ? b.vars.map(String) : [];
    if (!template_key) return bad("template_key required");

    // Validate template configured
    const sel = await getSetting(env, template_key);
    const { name: tplName } = parseTplSel(sel || "");
    if (!tplName) return bad(`Template not configured for ${template_key}`);

    const now = nowTs();

    // Insert campaign
    await env.DB.prepare(
      `INSERT INTO wa_campaigns (name, template_key, template_vars_json, filter_json, status, created_at)
       VALUES (?1,?2,?3,?4,'created',?5)`
    ).bind(name, template_key, JSON.stringify(vars), JSON.stringify({ scope: "all_eligible" }), now).run();

    const row = await env.DB.prepare(
      `SELECT id FROM wa_campaigns WHERE name=?1 AND created_at=?2 ORDER BY id DESC LIMIT 1`
    ).bind(name, now).first();
    const campaign_id = Number(row?.id || 0);
    if (!campaign_id) return bad("campaign_insert_failed");

    // Eligible recipients
    const vs = await env.DB.prepare(
      `SELECT id, phone FROM past_visitors
        WHERE opt_out=0
          AND phone LIKE '27_________'
          AND length(phone)=11`
    ).all();
    const visitors = vs.results || [];

    if (visitors.length) {
      await env.DB.batch(visitors.map(v => ({
        sql: `INSERT INTO wa_campaign_sends (campaign_id, visitor_id, phone, status, sent_at)
              VALUES (?1,?2,?3,'queued',NULL)`,
        args: [campaign_id, v.id, v.phone]
      })));
    }

    await env.DB.prepare(`UPDATE wa_campaigns SET total_targets=?2 WHERE id=?1`)
      .bind(campaign_id, visitors.length).run();

    return json({ ok: true, campaign_id, enqueued: visitors.length });
  }));

  // Run/continue a batch (large batches allowed)
  router.add("POST", "/api/admin/past/campaigns/run", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const campaign_id = Number(b?.campaign_id || 0);
    const batch_size = Math.max(1, Number(b?.batch_size || 5000));
    const delay_ms   = Math.max(0, Number(b?.delay_ms   || 200));
    if (!campaign_id) return bad("campaign_id required");

    const camp = await env.DB.prepare(
      `SELECT id, name, status, template_key, template_vars_json, started_at FROM wa_campaigns WHERE id=?1 LIMIT 1`
    ).bind(campaign_id).first();
    if (!camp) return bad("campaign not found", 404);
    if (camp.status === "done") return json({ ok:true, processed:0, done:true });

    // Resolve WhatsApp + template
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");
    if (!token || !pnid) return bad("WhatsApp credentials missing in settings");

    const selRow = await getSetting(env, camp.template_key);
    const { name: tplName, lang: tplLang } = parseTplSel(selRow || "");
    if (!tplName) return bad(`Template not configured for ${camp.template_key}`);

    const vars = (()=>{ try { return JSON.parse(camp.template_vars_json||"[]"); } catch { return []; } })();
    const components = vars.length
      ? [{ type: "body", parameters: vars.map(v => ({ type: "text", text: String(v) })) }]
      : [];

    // mark running
    await env.DB.prepare(
      `UPDATE wa_campaigns SET status='running', started_at=COALESCE(started_at,?2) WHERE id=?1`
    ).bind(campaign_id, nowTs()).run();

    // Fetch queued
    const q = await env.DB.prepare(
      `SELECT s.id AS sid, s.visitor_id, s.phone, v.opt_out
         FROM wa_campaign_sends s
         JOIN past_visitors v ON v.id = s.visitor_id
        WHERE s.campaign_id=?1 AND s.status='queued'
        LIMIT ?2`
    ).bind(campaign_id, batch_size).all();

    const items = q.results || [];
    if (!items.length) {
      const remain = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM wa_campaign_sends WHERE campaign_id=?1 AND status='queued'`
      ).bind(campaign_id).first();
      const noneLeft = Number(remain?.c || 0) === 0;
      if (noneLeft) {
        await env.DB.prepare(`UPDATE wa_campaigns SET status='done', finished_at=?2 WHERE id=?1`)
          .bind(campaign_id, nowTs()).run();
      }
      return json({ ok:true, processed:0, done: noneLeft });
    }

    let processed = 0;
    for (const it of items) {
      if (it.opt_out || !/^27\d{9}$/.test(String(it.phone||""))) {
        await env.DB.prepare(
          `UPDATE wa_campaign_sends SET status='failed', error=?2 WHERE id=?1`
        ).bind(it.sid, it.opt_out ? "opted_out" : "invalid_phone").run();
        processed++; continue;
      }

      const payload = {
        messaging_product: "whatsapp",
        to: it.phone,
        type: "template",
        template: { name: tplName, language: { code: tplLang }, components }
      };

      let ok=false, msgId=null, err=null;
      try{
        const r = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pnid)}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const y = await r.json().catch(()=>({}));
        ok = r.ok;
        msgId = y?.messages?.[0]?.id || null;
        err = ok ? null : (y?.error?.message || `HTTP ${r.status}`);
      } catch (e) {
        err = String(e?.message || e);
      }

      if (ok) {
        await env.DB.prepare(
          `UPDATE wa_campaign_sends SET status='sent', provider_message_id=?2, error=NULL, sent_at=?3 WHERE id=?1`
        ).bind(it.sid, msgId, nowTs()).run();
        await env.DB.prepare(
          `UPDATE past_visitors SET last_contacted_at=?2, last_send_status='sent' WHERE id=?1`
        ).bind(it.visitor_id, nowTs()).run();
      } else {
        await env.DB.prepare(
          `UPDATE wa_campaign_sends SET status='failed', error=?2 WHERE id=?1`
        ).bind(it.sid, err || "unknown").run();
        await env.DB.prepare(
          `UPDATE past_visitors SET last_contacted_at=?2, last_send_status=?3 WHERE id=?1`
        ).bind(it.visitor_id, nowTs(), `failed:${err||""}`).run();
      }

      processed++;
      if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
    }

    const remain = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM wa_campaign_sends WHERE campaign_id=?1 AND status='queued'`
    ).bind(campaign_id).first();
    const done = Number(remain?.c || 0) === 0;
    if (done) await env.DB.prepare(`UPDATE wa_campaigns SET status='done', finished_at=?2 WHERE id=?1`)
      .bind(campaign_id, nowTs()).run();

    return json({ ok:true, processed, done });
  }));

  // Campaign status
  router.add("GET", "/api/admin/past/campaigns/:id/status", guard(async (_req, env, _ctx, params) => {
    const cid = Number(params?.id || 0);
    const camp = await env.DB.prepare(
      `SELECT id, name, status, template_key, template_vars_json FROM wa_campaigns WHERE id=?1 LIMIT 1`
    ).bind(cid).first();
    if (!camp) return bad("not_found", 404);
    const st = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END)   AS sent,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM wa_campaign_sends WHERE campaign_id=?1`
    ).bind(cid).first();

    return json({
      ok: true,
      campaign: { id: camp.id, name: camp.name, status: camp.status, template_key: camp.template_key, vars: JSON.parse(camp.template_vars_json||"[]") },
      stats: { queued: Number(st?.queued||0), sent: Number(st?.sent||0), failed: Number(st?.failed||0) }
    });
  }));
}
