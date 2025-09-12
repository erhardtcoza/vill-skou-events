// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountWhatsApp(router) {
  const guard = (fn) => requireRole("admin", fn);

  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
    ).bind(key).first();
    return row ? row.value : null;
  }

  // ---------- Diagnostics ----------
  // GET /api/admin/whatsapp/diag -> quick connectivity probe to Meta
  router.add("GET", "/api/admin/whatsapp/diag", guard(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const wabaId = await getSetting(env, "WA_BUSINESS_ID") || await getSetting(env, "BUSINESS_ID");

    if (!token || !wabaId) {
      return json({ ok:false, error:"Missing WA_TOKEN or BUSINESS_ID in site_settings" }, 400);
    }

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/message_templates?limit=1&fields=name,status,language,category`;
    let meta;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      meta = await res.json().catch(()=> ({}));
      if (!res.ok) {
        return json({ ok:false, meta, status:res.status }, res.status);
      }
    } catch (e) {
      return json({ ok:false, error:String(e?.message||e) }, 502);
    }

    return json({ ok:true, sample: meta?.data?.[0] || null });
  }));

  // ---------- List from DB ----------
  // GET /api/admin/whatsapp/templates
  router.add("GET", "/api/admin/whatsapp/templates", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, name, language, status, category, components_json
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();

    return json({ ok:true, templates: q.results || [] });
  }));

  // ---------- Sync from Meta ----------
  // POST /api/admin/whatsapp/sync
  router.add("POST", "/api/admin/whatsapp/sync", guard(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const wabaId = await getSetting(env, "WA_BUSINESS_ID") || await getSetting(env, "BUSINESS_ID");

    if (!token || !wabaId) {
      return bad("Missing WA_TOKEN or BUSINESS_ID");
    }

    const fields = "name,status,language,category,components";
    let url = `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/message_templates?fields=${encodeURIComponent(fields)}&limit=100`;
    let total = 0;

    try {
      while (url) {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const body = await res.json().catch(()=> ({}));

        if (!res.ok) {
          return bad(`Meta error ${res.status}: ${body?.error?.message||"unknown"}`, res.status);
        }

        const data = Array.isArray(body?.data) ? body.data : [];
        for (const t of data) {
          const name = t?.name || "";
          const lang = t?.language || "";
          const status = t?.status || "";
          const category = t?.category || "";
          const compsJson = JSON.stringify(t?.components || []);

          // upsert by (name, language)
          await env.DB.prepare(
            `INSERT INTO wa_templates (name, language, status, category, components_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s','now'))
             ON CONFLICT(name, language) DO UPDATE SET
               status=excluded.status,
               category=excluded.category,
               components_json=excluded.components_json,
               updated_at=excluded.updated_at`
          ).bind(name, lang, status, category, compsJson).run();

          total++;
        }

        url = body?.paging?.next || null; // follow pagination
      }
    } catch (e) {
      return bad("Sync failed: " + (e?.message || e), 502);
    }

    return json({ ok:true, count: total });
  }));

  // ---------- Optional: create new template (draft) via Meta ----------
  // POST /api/admin/whatsapp/templates (body should already match Meta shape)
  router.add("POST", "/api/admin/whatsapp/templates", guard(async (req, env) => {
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const wabaId = await getSetting(env, "WA_BUSINESS_ID") || await getSetting(env, "BUSINESS_ID");
    if (!token || !wabaId) return bad("Missing WA_TOKEN or BUSINESS_ID");

    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/message_templates`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    const out = await res.json().catch(()=> ({}));
    if (!res.ok) return bad(out?.error?.message || "Meta error", res.status);

    // After creating a template on Meta, schedule/manual sync will pull it into DB
    return json({ ok:true, meta: out });
  }));
}
