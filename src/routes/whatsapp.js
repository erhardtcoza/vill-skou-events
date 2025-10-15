// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/* ------------------ small utils ------------------ */
const nowSec = () => Math.floor(Date.now() / 1000);
const num = (v) => Number(v || 0) | 0;
const enc = (v) => encodeURIComponent(String(v ?? ""));

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? String(row.value) : null;
}

/* ------------------ send helpers ------------------ */
async function sendViaService(env, to, payload) {
  try {
    const svc = await import("../services/whatsapp.js");

    if (payload.type === "text") {
      if (typeof svc.sendWhatsAppText === "function") {
        // allow both signatures
        try { await svc.sendWhatsAppText(env, to, payload.text); return true; } catch {}
        await svc.sendWhatsAppText(env, { to, text: payload.text }); return true;
      }
      if (typeof svc.sendWhatsAppTextIfSession === "function") {
        await svc.sendWhatsAppTextIfSession(env, to, payload.text);
        return true;
      }
    }

    if (payload.type === "template" && typeof svc.sendWhatsAppTemplate === "function") {
      // allow both signatures
      try {
        await svc.sendWhatsAppTemplate(env, to, payload.variables || [], payload.language || "af", payload.name);
        return true;
      } catch {}
      await svc.sendWhatsAppTemplate(env, {
        to, name: payload.name, language: payload.language || "af", variables: payload.variables || []
      });
      return true;
    }
  } catch {
    // service not present is OK; we'll fallback
  }
  return false;
}

async function sendDirectGraph(env, to, payload) {
  const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
  const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");
  if (!token || !pnid) throw new Error("WA_TOKEN/WA_PHONE_NUMBER_ID not configured");

  let body;
  if (payload.type === "text") {
    body = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: String(payload.text || "").slice(0, 4096) }
    };
  } else if (payload.type === "template") {
    body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: payload.name,
        language: { code: payload.language || "af" },
        components: Array.isArray(payload.variables) && payload.variables.length
          ? [{ type: "body", parameters: payload.variables.map(t => ({ type: "text", text: String(t) })) }]
          : []
      }
    };
  } else {
    throw new Error("Unsupported payload type");
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${enc(pnid)}/messages`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(()=>({}));
  if (!res.ok) {
    const msg = j?.error?.message || ("Meta error " + res.status);
    throw new Error(msg);
  }
  return j?.messages?.[0]?.id || null;
}

async function sendWA(env, to, payload) {
  if (await sendViaService(env, to, payload)) return null;
  return await sendDirectGraph(env, to, payload);
}

/* --------- parse inbound webhook payload ---------- */
function extractInbound(valueObj) {
  const results = [];
  const messages = Array.isArray(valueObj?.messages) ? valueObj.messages : [];
  for (const m of messages) {
    const t = String(m.type || "text");
    let text = "";
    if (t === "text") text = m?.text?.body || "";
    else if (t === "button") text = m?.button?.text || "";
    else if (t === "interactive") {
      const ir = m.interactive || {};
      text = ir?.button_reply?.title || ir?.list_reply?.title || "";
    } else if (t === "image") text = "[image]";
    else if (t === "audio") text = "[audio]";
    else if (t === "document") text = "[document]";
    else text = `[${t}]`;

    results.push({
      wa_id: m?.id || null,
      from_msisdn: m?.from || null,
      to_msisdn: valueObj?.metadata?.display_phone_number || valueObj?.metadata?.phone_number_id || null,
      body: text,
      type: t,
      ts: num(m?.timestamp) || nowSec(),
    });
  }
  return results;
}

/* ------------------ mount ------------------ */
export function mountWhatsApp(router) {
  const guardAdmin = (fn) => requireRole("admin", fn);

  /* ----- Webhook verification (GET) ----- */
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge") || "";

    const expected = await getSetting(env, "VERIFY_TOKEN")
                  || await getSetting(env, "WA_VERIFY_TOKEN")
                  || "";
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { "content-type":"text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  });

  /* ----- Webhook receiver (POST) ----- */
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    let body;
    try { body = await req.json(); } catch { return bad("bad json", 400); }

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let stored = 0;

    for (const e of entries) {
      const changes = Array.isArray(e?.changes) ? e.changes : [];
      for (const ch of changes) {
        const v = ch?.value || {};
        const arr = extractInbound(v);
        for (const r of arr) {
          if (!r.wa_id) continue;
          try {
            await env.DB.prepare(
              `INSERT INTO wa_inbox (wa_id, from_msisdn, to_msisdn, direction, body, type, received_at)
               VALUES (?1,?2,?3,'in',?4,?5,?6)
               ON CONFLICT(wa_id) DO NOTHING`
            ).bind(r.wa_id, r.from_msisdn, r.to_msisdn, r.body, r.type, r.ts).run();
            stored++;
          } catch {}

          // optional auto-reply
          try {
            const enabled = (await getSetting(env, "WA_AUTOREPLY_ENABLED")) || "";
            const text = (await getSetting(env, "WA_AUTOREPLY_TEXT")) || "";
            const yes = String(enabled).trim() === "1" || /true/i.test(String(enabled));
            if (yes && text) {
              await sendWA(env, r.from_msisdn, { type: "text", text });
              await env.DB.prepare(`UPDATE wa_inbox SET replied_auto=1 WHERE wa_id=?1`).bind(r.wa_id).run();
              await env.DB.prepare(
                `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
                 VALUES (?1,'auto_reply',?2,'sent',?3)`
              ).bind(r.from_msisdn, text, nowSec()).run();
            }
          } catch {
            try {
              await env.DB.prepare(
                `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
                 VALUES (?1,'auto_reply','', 'error', ?2)`
              ).bind(r.from_msisdn, nowSec()).run();
            } catch {}
          }
        }
      }
    }

    return json({ ok: true, stored });
  });

  /* ---------------------------------------------------------
   * ADMIN + UI-FRIENDLY ALIASES
   * -------------------------------------------------------*/

  // Shared handler builders
  const listInboxHandler = guardAdmin(async (req, env) => {
    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();
    const dir = (u.searchParams.get("direction") || "").trim(); // optional: 'in'|'out'
    const limit = Math.min(Math.max(num(u.searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(num(u.searchParams.get("offset") || 0), 0);

    const where = [];
    const args = [];
    if (q) {
      where.push(`(UPPER(from_msisdn) LIKE UPPER(?${args.length+1}) OR UPPER(body) LIKE UPPER(?${args.length+1}))`);
      args.push(`%${q}%`);
    }
    if (dir) {
      where.push(`direction = ?${args.length+1}`);
      args.push(dir);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const list = await env.DB.prepare(
      `SELECT id, wa_id, from_msisdn, to_msisdn, direction, body, type,
              received_at, replied_auto, replied_manual
         FROM wa_inbox
        ${whereSql}
        ORDER BY received_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}`
    ).bind(...args).all();

    const cRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM wa_inbox ${whereSql}`).bind(...args).first();
    return json({
      ok: true,
      items: list.results || [],
      total: Number(cRow?.c || 0),
      limit, offset
    });
  });

  const replyHandler = guardAdmin(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const text = String(b?.text || "").trim();
    if (!text) return bad("text required");

    const row = await env.DB.prepare(
      `SELECT id, from_msisdn FROM wa_inbox WHERE id=?1 LIMIT 1`
    ).bind(num(id)).first();
    if (!row) return bad("not found", 404);

    try {
      await sendWA(env, row.from_msisdn, { type: "text", text });
      await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE id=?1`).bind(row.id).run();
      await env.DB.prepare(
        `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
         VALUES (?1,'manual_reply',?2,'sent',?3)`
      ).bind(row.from_msisdn, text, nowSec()).run();
      return json({ ok: true });
    } catch (e) {
      await env.DB.prepare(
        `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
         VALUES (?1,'manual_reply',?2,'error',?3)`
      ).bind(row.from_msisdn, text, nowSec()).run();
      return bad("send failed: " + (e?.message || e), 502);
    }
  });

  const deleteHandler = guardAdmin(async (_req, env, _ctx, { id }) => {
    await env.DB.prepare(`DELETE FROM wa_inbox WHERE id=?1`).bind(num(id)).run();
    return json({ ok: true });
  });

  const listTemplatesHandler = guardAdmin(async (_req, env) => {
    const rows = await env.DB.prepare(
      `SELECT id, name, language, status, category, updated_at, components_json
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();
    return json({ ok:true, templates: rows.results || [] });
  });

  const syncTemplatesHandler = guardAdmin(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN");
    const waba  = await getSetting(env, "WA_BUSINESS_ID");
    if (!token) return bad("WA_TOKEN missing");
    if (!waba)  return bad("WA_BUSINESS_ID missing");

    let url = `https://graph.facebook.com/v20.0/${enc(waba)}/message_templates?fields=${enc("name,language,status,category,components")}&limit=50&access_token=${enc(token)}`;
    let fetched = 0;
    const now = nowSec();

    while (url) {
      const res = await fetch(url);
      const data = await res.json().catch(()=>({}));
      if (!res.ok || data?.error) {
        const msg = data?.error?.message || `Meta error ${res.status}`;
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
  });

  // Admin paths
  router.add("GET",  "/api/admin/whatsapp/inbox",           listInboxHandler);
  router.add("POST", "/api/admin/whatsapp/inbox/:id/reply", replyHandler);
  router.add("POST", "/api/admin/whatsapp/inbox/:id/delete",deleteHandler);
  router.add("GET",  "/api/admin/whatsapp/templates",       listTemplatesHandler);
  router.add("POST", "/api/admin/whatsapp/sync",            syncTemplatesHandler);

  // UI-friendly aliases (so existing UI calls work)
  router.add("GET",  "/api/whatsapp/inbox",           listInboxHandler);
  router.add("GET",  "/api/whatsapp/templates",       listTemplatesHandler);
  router.add("POST", "/api/whatsapp/templates/sync",  syncTemplatesHandler);
}
