// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountWhatsApp(router) {
  const guard = (fn) => requireRole("admin", fn);

  // -------- settings helpers --------
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
    ).bind(key).first();
    return row ? row.value : null;
  }
  const q = (v) => encodeURIComponent(v ?? "");

  /* ========================================================================
   *  ADMIN: Diagnostics / Templates (guarded)
   * ===================================================================== */

  // GET /api/admin/whatsapp/diag  -> quick connectivity probe to Meta
  router.add("GET", "/api/admin/whatsapp/diag", guard(async (_req, env) => {
    const token = (await getSetting(env, "WA_TOKEN")) || (await getSetting(env, "WHATSAPP_TOKEN"));
    const waba  = (await getSetting(env, "WA_BUSINESS_ID")) || (await getSetting(env, "BUSINESS_ID"));
    if (!token || !waba) {
      return json({ ok:false, haveToken:!!token, haveWaba:!!waba }, 400);
    }

    const url = `https://graph.facebook.com/v20.0/${q(waba)}/message_templates?fields=name,status,language,category&limit=1`;
    let res, body;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      body = await res.json().catch(()=> ({}));
    } catch (e) {
      return json({ ok:false, error:"network "+(e?.message||e) }, 502);
    }
    if (!res.ok) return json({ ok:false, metaError: body?.error || { status: res.status } }, res.status);
    return json({ ok:true, sample: (body?.data?.[0] || null) });
  }));

  // GET /api/admin/whatsapp/templates  -> list from our DB
  router.add("GET", "/api/admin/whatsapp/templates", guard(async (_req, env) => {
    const qres = await env.DB.prepare(
      `SELECT id, name, language, status, category, components_json, updated_at
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();
    return json({ ok:true, templates: qres.results || [] });
  }));

  // POST /api/admin/whatsapp/sync  -> pull templates from Meta and upsert
  router.add("POST", "/api/admin/whatsapp/sync", guard(async (_req, env) => {
    const token = (await getSetting(env, "WA_TOKEN")) || (await getSetting(env, "WHATSAPP_TOKEN"));
    const waba  = (await getSetting(env, "WA_BUSINESS_ID")) || (await getSetting(env, "BUSINESS_ID"));
    if (!token || !waba) return bad("Missing WA_TOKEN or BUSINESS_ID");

    let url = `https://graph.facebook.com/v20.0/${q(waba)}/message_templates?fields=${q("name,status,language,category,components")}&limit=100`;
    let fetched = 0;

    try {
      while (url) {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const body = await res.json().catch(()=> ({}));
        if (!res.ok) return bad(body?.error?.message || `Meta error ${res.status}`, res.status);

        const data = Array.isArray(body?.data) ? body.data : [];
        for (const t of data) {
          const name = t?.name || "";
          const lang = t?.language || "";
          if (!name || !lang) continue;

          await env.DB.prepare(
            `INSERT INTO wa_templates (name, language, status, category, components_json, updated_at)
             VALUES (?1,?2,?3,?4,?5,strftime('%s','now'))
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
            JSON.stringify(t?.components || [])
          ).run();

          fetched++;
        }

        url = body?.paging?.next || null;
      }
    } catch (e) {
      return bad("Sync failed: " + (e?.message || e), 502);
    }

    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM wa_templates`).first();
    return json({ ok:true, fetched, total: Number(countRow?.c || 0) });
  }));

  // POST /api/admin/whatsapp/templates  -> create draft template on Meta
  router.add("POST", "/api/admin/whatsapp/templates", guard(async (req, env) => {
    const token = (await getSetting(env, "WA_TOKEN")) || (await getSetting(env, "WHATSAPP_TOKEN"));
    const waba  = (await getSetting(env, "WA_BUSINESS_ID")) || (await getSetting(env, "BUSINESS_ID"));
    if (!token || !waba) return bad("Missing WA_TOKEN or BUSINESS_ID");

    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    const res = await fetch(`https://graph.facebook.com/v20.0/${q(waba)}/message_templates`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const out = await res.json().catch(()=> ({}));
    if (!res.ok) return bad(out?.error?.message || "Meta error", res.status);
    // You can run /sync afterwards to pull it into DB.
    return json({ ok:true, meta: out });
  }));

  /* ========================================================================
   *  PUBLIC: Webhook (verification + receiver)
   *  Route: /api/whatsapp/webhook
   * ===================================================================== */

  // GET verification (Meta calls this once when you set up the webhook)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge") || "";

    // We accept either VERIFY_TOKEN or WA_VERIFY_TOKEN from settings
    const expected =
      (await getSetting(env, "VERIFY_TOKEN")) ||
      (await getSetting(env, "WA_VERIFY_TOKEN")) ||
      "";

    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  });

  // POST receiver (Meta delivers messages/updates here; must 200 quickly)
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    // Signature verification is optional but recommended
    // Meta signs the RAW request body with your App Secret (not the access token)
    const appSecret =
      (await getSetting(env, "WA_APP_SECRET")) ||
      (await getSetting(env, "WHATSAPP_APP_SECRET")) ||
      "";
    const sigHeader = req.headers.get("x-hub-signature-256") || ""; // "sha256=…"

    // Read raw body first (so HMAC is computed over exact bytes)
    const raw = await req.text();

    if (appSecret) {
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          enc.encode(appSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
        const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
        const expected = "sha256=" + hex;
        if (sigHeader !== expected) {
          // Reject if signature mismatch. Meta will retry, which is desired in this case.
          return new Response("invalid signature", { status: 401 });
        }
      } catch {
        // If crypto fails for any reason, fall through and accept (to avoid retry storms).
      }
    }

    // Parse and (optionally) act on payload
    let payload = {};
    try { payload = JSON.parse(raw || "{}"); } catch { /* ignore parse errors; we still ack */ }

    // TODO: If you want to store inbound messages, add a table (e.g. wa_inbox)
    // and upsert here. Keep it fast; do not call Meta synchronously.
    // For now we no-op, just acknowledge to stop retries.

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
}