// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

const nowSec = () => Math.floor(Date.now() / 1000);
const num = (v) => Number(v || 0) | 0;
const enc = (v) => encodeURIComponent(String(v ?? ""));

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? String(row.value) : null;
}

/* ---------------- Send helpers ---------------- */
async function sendViaService(env, to, payload) {
  try {
    const svc = await import("../services/whatsapp.js");
    if (payload.type === "text" && typeof svc.sendWhatsAppText === "function") {
      try { await svc.sendWhatsAppText(env, to, payload.text); return true; } catch {}
      await svc.sendWhatsAppText(env, { to, text: payload.text }); return true;
    }
    if (payload.type === "template" && typeof svc.sendWhatsAppTemplate === "function") {
      try {
        await svc.sendWhatsAppTemplate(env, to, payload.variables || [], payload.language || "af", payload.name);
        return true;
      } catch {}
      await svc.sendWhatsAppTemplate(env, {
        to, name: payload.name, language: payload.language || "af", variables: payload.variables || []
      });
      return true;
    }
  } catch {}
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
  } else throw new Error("Unsupported payload type");

  const res = await fetch(`https://graph.facebook.com/v20.0/${enc(pnid)}/messages`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(j?.error?.message || ("Meta error " + res.status));
  return j?.messages?.[0]?.id || null;
}

async function sendWA(env, to, payload) {
  if (await sendViaService(env, to, payload)) return null;
  return await sendDirectGraph(env, to, payload);
}

/* ------------- Parse inbound webhook payload ------------- */
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
      body: text, type: t, ts: num(m?.timestamp) || nowSec(),
    });
  }
  return results;
}

/* ============================================================
   MOUNT
============================================================ */
export function mountWhatsApp(router) {
  const guardAdmin = (fn) => requireRole("admin", fn);

  /* ----- Webhook verify + ingest ----- */
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge") || "";
    const expected = await getSetting(env, "VERIFY_TOKEN") || await getSetting(env, "WA_VERIFY_TOKEN") || "";
    if (mode === "subscribe" && token === expected)
      return new Response(challenge, { status: 200, headers: { "content-type":"text/plain" } });
    return new Response("forbidden", { status: 403 });
  });

  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("bad json"); }
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let stored = 0;
    for (const e of entries) {
      const changes = Array.isArray(e?.changes) ? e.changes : [];
      for (const ch of changes) {
        const arr = extractInbound(ch?.value || {});
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
        }
      }
    }
    return json({ ok:true, stored });
  });

  /* ----- Inbox list / reply / delete (admin + alias) ----- */
  const inboxList = guardAdmin(async (req, env) => {
    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(num(u.searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(num(u.searchParams.get("offset") || 0), 0);

    const clauses = []; const args = [];
    if (q) { clauses.push(`(UPPER(from_msisdn) LIKE UPPER(?1) OR UPPER(body) LIKE UPPER(?1))`); args.push(\`%\${q}%\`); }
    const whereSql = clauses.length ? \`WHERE \${clauses.join(" AND ")}\` : "";

    const list = await env.DB.prepare(
      \`SELECT id,wa_id,from_msisdn,to_msisdn,direction,body,type,received_at,replied_auto,replied_manual
         FROM wa_inbox \${whereSql}
        ORDER BY received_at DESC,id DESC
        LIMIT \${limit} OFFSET \${offset}\`
    ).bind(...args).all();

    const c = await env.DB.prepare(\`SELECT COUNT(*) AS c FROM wa_inbox \${whereSql}\`).bind(...args).first();
    return json({ ok:true, items:list.results||[], total:Number(c?.c||0), limit, offset });
  });

  const inboxReply = guardAdmin(async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad("bad json"); }
    const text = String(b?.text || "").trim();
    const overrideTo = (b?.to ? String(b.to).trim() : "");
    if (!text) return bad("text required");

    let row = null;
    if (!overrideTo) {
      row = await env.DB.prepare(`SELECT from_msisdn FROM wa_inbox WHERE id=?1`).bind(num(id)).first();
      if (!row) return bad("not found",404);
    }
    const to = overrideTo || row.from_msisdn;

    try {
      await sendWA(env, to, { type:"text", text });
      await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE id=?1`).bind(num(id)).run().catch(()=>{});
      return json({ ok:true });
    } catch(e){ return bad("send failed:"+e.message,500); }
  });

  const inboxDelete = guardAdmin(async (_req, env, _ctx, { id }) => {
    await env.DB.prepare(`DELETE FROM wa_inbox WHERE id=?1`).bind(num(id)).run();
    return json({ ok:true });
  });

  router.add("GET",  "/api/admin/whatsapp/inbox",            inboxList);
  router.add("GET",  "/api/whatsapp/inbox",                  inboxList);       // alias (guarded)
  router.add("POST", "/api/admin/whatsapp/inbox/:id/reply",  inboxReply);
  router.add("POST", "/api/admin/whatsapp/inbox/:id/delete", inboxDelete);

  /* ----- Templates list / sync (admin + alias) ----- */
  const listTemplates = guardAdmin(async (_req, env) => {
    const rows = await env.DB.prepare(
      `SELECT id,name,language,status,category,updated_at,components_json
         FROM wa_templates
        ORDER BY name ASC,language ASC`
    ).all();
    return json({ ok:true, templates:rows.results||[] });
  });

  const syncTemplates = guardAdmin(async (_req, env) => {
    const token = await getSetting(env,"WA_TOKEN");
    const waba  = await getSetting(env,"WA_BUSINESS_ID");
    if(!token||!waba) return bad("WA_TOKEN/WA_BUSINESS_ID missing");

    let url=\`https://graph.facebook.com/v20.0/\${enc(waba)}/message_templates?fields=\${enc("name,language,status,category,components")}&limit=50&access_token=\${enc(token)}\`;
    let fetched=0; const now=nowSec();

    while(url){
      const res=await fetch(url); const data=await res.json().catch(()=>({}));
      if(!res.ok||data?.error) return bad(data?.error?.message||\`Meta \${res.status}\`,res.status);

      for(const t of (data.data||[])){
        const {name,language,status,category,components}=t;
        if(!name||!language) continue;
        await env.DB.prepare(
          `INSERT INTO wa_templates (name,language,status,category,components_json,updated_at)
           VALUES (?1,?2,?3,?4,?5,?6)
           ON CONFLICT(name,language) DO UPDATE SET
             status=excluded.status,category=excluded.category,
             components_json=excluded.components_json,updated_at=excluded.updated_at`
        ).bind(name,language,status||null,category||null,JSON.stringify(components||null),now).run();
        fetched++;
      }
      url=data?.paging?.next||"";
    }
    const c=await env.DB.prepare(`SELECT COUNT(*) AS c FROM wa_templates`).first();
    return json({ok:true,fetched,total:Number(c?.c||0)});
  });

  router.add("GET",  "/api/admin/whatsapp/templates", listTemplates);
  router.add("POST", "/api/admin/whatsapp/sync",      syncTemplates);
  router.add("GET",  "/api/whatsapp/templates",       listTemplates);
  router.add("POST", "/api/whatsapp/templates/sync",  syncTemplates);

  /* ----- Template Mappings CRUD ----- */
  const listMappings = guardAdmin(async (req, env) => {
    const u = new URL(req.url);
    const ctx = (u.searchParams.get("context") || "").trim();
    const where = ctx ? `WHERE context=?1` : "";
    const rows = await env.DB.prepare(
      `SELECT id,template_key,context,mapping_json,updated_at
         FROM wa_template_mappings ${where}
        ORDER BY template_key ASC`
    ).bind(ctx || undefined).all();
    return json({ ok:true, mappings:rows.results||[] });
  });

  const saveMapping = guardAdmin(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const key = String(b?.template_key || "").trim();
    const context = String(b?.context || "").trim();
    const mapping = b?.mapping || {};
    if(!key||!context) return bad("template_key and context required");
    await env.DB.prepare(
      `INSERT INTO wa_template_mappings (template_key,context,mapping_json,updated_at)
       VALUES (?1,?2,?3,?4)
       ON CONFLICT(template_key,context)
       DO UPDATE SET mapping_json=excluded.mapping_json,updated_at=excluded.updated_at`
    ).bind(key,context,JSON.stringify(mapping),nowSec()).run();
    return json({ok:true});
  });

  const deleteMapping = guardAdmin(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const key=String(b?.template_key||"").trim(); const ctx=String(b?.context||"").trim();
    if(!key||!ctx) return bad("template_key/context required");
    await env.DB.prepare(
      `DELETE FROM wa_template_mappings WHERE template_key=?1 AND context=?2`
    ).bind(key,ctx).run();
    return json({ok:true});
  });

  router.add("GET",  "/api/admin/whatsapp/mappings",        listMappings);
  router.add("POST", "/api/admin/whatsapp/mappings/save",   saveMapping);
  router.add("POST", "/api/admin/whatsapp/mappings/delete", deleteMapping);

  /* ----- Quick template test sender (kept for the Send tab) ----- */
  router.add("POST", "/api/admin/whatsapp/test", guardAdmin(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const to = String(b?.to || "").replace(/\\D+/g, "");
    if (!to) return bad("to required (e.g. 2771… digits only)");

    const key = String(b?.template_key || "WA_TMP_ORDER_CONFIRM");
    const selRow = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();

    const sel = String(selRow?.value || "");
    const [tplName, tplLang] = sel.split(":");
    if (!tplName || !tplLang) {
      return bad(\`Template not configured in site_settings for \${key}. Save "name:lang" first.\`);
    }

    try {
      await sendWA(env, to, { type:"template", name: tplName, language: tplLang, variables: (b?.vars||[]) });
      return json({ ok:true });
    } catch (e) {
      return bad(e?.message||"send failed", 502);
    }
  }));
}
