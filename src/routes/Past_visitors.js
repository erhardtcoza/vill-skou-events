// /src/routes/past_visitors.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

function msisdn(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
function nowTs() { return Math.floor(Date.now() / 1000); }

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

export function mountPastVisitors(router) {
  const guard = (fn) => requireRole("admin", fn);

  // Import CSV rows: { rows:[{name, phone}], filename?, overwrite_names? }
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

  // Sync from existing data
  // Body: { from: "orders"|"pos"|"attendees", event_id?, tag? }
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
      // If you store POS buyer phone elsewhere, adapt here. Using orders table with method like pos_*.
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

  // List + filter (limit 50)
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

  // Send to selection (max 50). Body: { visitor_ids:[], template_key, vars?:[] }
  router.add("POST", "/api/admin/past/send", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const ids = Array.isArray(b?.visitor_ids) ? b.visitor_ids.slice(0, 50) : [];
    const template_key = String(b?.template_key || "WA_TMP_SKOU_SALES");
    const vars = Array.isArray(b?.vars) ? b.vars : [];
    if (!ids.length) return bad("visitor_ids required");

    // read template selection from site_settings, then send via WhatsApp API
    async function getSetting(key) {
      const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(key).first();
      return row ? row.value : null;
    }
    const token = await getSetting("WA_TOKEN") || await getSetting("WHATSAPP_TOKEN");
    const pnid  = await getSetting("WA_PHONE_NUMBER_ID") || await getSetting("PHONE_NUMBER_ID");
    if (!token || !pnid) return bad("WhatsApp credentials missing in settings");

    const selRow = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(template_key).first();
    const sel = String(selRow?.value || "");
    const [tplName, tplLang] = sel.split(":");
    if (!tplName || !tplLang) return bad(`Template not configured for ${template_key}`);

    const ts = nowTs();
    const results = [];

    const vs = vars.length
      ? [{ type: "body", parameters: vars.map(v => ({ type: "text", text: String(v) })) }]
      : [];

    // fetch recipients
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
      // simple throttle to be gentle
      await new Promise(r => setTimeout(r, 350));
    }

    return json({ ok: true, results });
  }));
}