// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountWhatsApp(router) {
  const guard = (fn) => requireRole("admin", fn);
  const q = (v) => encodeURIComponent(v ?? "");

  // ---- settings helpers ---------------------------------------------------
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
    ).bind(key).first();
    return row ? row.value : null;
  }

  async function getWAAuth(env) {
    const token =
      (await getSetting(env, "WA_TOKEN")) ||
      (await getSetting(env, "WHATSAPP_TOKEN")) ||
      "";
    const phoneNumberId =
      (await getSetting(env, "WA_PHONE_NUMBER_ID")) ||
      (await getSetting(env, "PHONE_NUMBER_ID")) ||
      "";
    const businessId =
      (await getSetting(env, "WA_BUSINESS_ID")) ||
      (await getSetting(env, "BUSINESS_ID")) ||
      "";
    return { token, phoneNumberId, businessId };
  }

  const now = () => Math.floor(Date.now() / 1000);

  /* ========================================================================
   *  ADMIN: Diagnostics / Templates (guarded)
   * ===================================================================== */

  // GET /api/admin/whatsapp/diag
  router.add("GET", "/api/admin/whatsapp/diag", guard(async (_req, env) => {
    const { token, businessId } = await getWAAuth(env);
    if (!token || !businessId) {
      return json({ ok:false, haveToken:!!token, haveWaba:!!businessId }, 400);
    }
    const url = `https://graph.facebook.com/v20.0/${q(businessId)}/message_templates?fields=name,status,language,category&limit=1`;
    let res, body;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      body = await res.json().catch(()=> ({}));
    } catch (e) {
      return json({ ok:false, error:"network "+(e?.message||e) }, 502);
    }
    if (!res.ok) return json({ ok:false, metaError: body?.error || { status: res.status } }, res.status);
    return json({ ok:true, sample: body?.data?.[0] || null });
  }));

  // GET /api/admin/whatsapp/templates
  router.add("GET", "/api/admin/whatsapp/templates", guard(async (_req, env) => {
    const qres = await env.DB.prepare(
      `SELECT id, name, language, status, category, components_json, updated_at
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();
    return json({ ok:true, templates: qres.results || [] });
  }));

  // POST /api/admin/whatsapp/sync
  router.add("POST", "/api/admin/whatsapp/sync", guard(async (_req, env) => {
    const { token, businessId } = await getWAAuth(env);
    if (!token || !businessId) return bad("Missing WA_TOKEN or BUSINESS_ID");

    let url = `https://graph.facebook.com/v20.0/${q(businessId)}/message_templates?fields=${q("name,status,language,category,components")}&limit=100`;
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
            name, lang,
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

  // POST /api/admin/whatsapp/templates (create draft on Meta)
  router.add("POST", "/api/admin/whatsapp/templates", guard(async (req, env) => {
    const { token, businessId } = await getWAAuth(env);
    if (!token || !businessId) return bad("Missing WA_TOKEN or BUSINESS_ID");
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const res = await fetch(`https://graph.facebook.com/v20.0/${q(businessId)}/message_templates`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const out = await res.json().catch(()=> ({}));
    if (!res.ok) return bad(out?.error?.message || "Meta error", res.status);
    return json({ ok:true, meta: out });
  }));

  /* ========================================================================
   *  ADMIN: Inbox (guarded)
   * ===================================================================== */

  // GET /api/admin/whatsapp/inbox?limit=100
  router.add("GET", "/api/admin/whatsapp/inbox", guard(async (req, env) => {
    const u = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(u.searchParams.get("limit") || 100)));
    const rows = await env.DB.prepare(
      `SELECT id, wa_message_id, wa_from, wa_to, name, timestamp, type, text,
              auto_replied, manual_replied, auto_reply_id, manual_reply_id, created_at
         FROM wa_inbox
        ORDER BY id DESC
        LIMIT ?1`
    ).bind(limit).all();
    return json({ ok:true, inbox: rows.results || [] });
  }));

  // POST /api/admin/whatsapp/reply  { inbox_id, text }
  router.add("POST", "/api/admin/whatsapp/reply", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const inbox_id = Number(b?.inbox_id || 0);
    const text = String(b?.text || "").trim();
    if (!inbox_id || !text) return bad("inbox_id and text required");

    const row = await env.DB.prepare(
      `SELECT id, wa_from FROM wa_inbox WHERE id=?1 LIMIT 1`
    ).bind(inbox_id).first();
    if (!row) return bad("inbox row not found", 404);

    const { token, phoneNumberId } = await getWAAuth(env);
    if (!token || !phoneNumberId) return bad("WA token/phone not configured", 400);

    const payload = {
      messaging_product: "whatsapp",
      to: row.wa_from,
      type: "text",
      text: { body: text }
    };

    let res, out;
    try {
      res = await fetch(`https://graph.facebook.com/v20.0/${q(phoneNumberId)}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      out = await res.json().catch(()=> ({}));
    } catch (e) {
      return bad("Meta network error: " + (e?.message || e), 502);
    }
    if (!res.ok) return bad(out?.error?.message || `Meta ${res.status}`, res.status);

    const msgId = out?.messages?.[0]?.id || null;
    await env.DB.prepare(
      `UPDATE wa_inbox SET manual_replied=1, manual_reply_id=?2 WHERE id=?1`
    ).bind(inbox_id, msgId).run();

    return json({ ok:true, id: inbox_id, reply_id: msgId });
  }));

  /* ========================================================================
   *  PUBLIC: Webhook (verification + receiver)
   * ===================================================================== */

  // GET /api/whatsapp/webhook  (verification)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge") || "";

    const expected =
      (await getSetting(env, "VERIFY_TOKEN")) ||
      (await getSetting(env, "WA_VERIFY_TOKEN")) ||
      "";

    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  });

  // POST /api/whatsapp/webhook  (receiver)
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    // optional signature verification with app secret
    const appSecret =
      (await getSetting(env, "WA_APP_SECRET")) ||
      (await getSetting(env, "WHATSAPP_APP_SECRET")) ||
      "";
    const sigHeader = req.headers.get("x-hub-signature-256") || "";
    const raw = await req.text();

    if (appSecret) {
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw", enc.encode(appSecret),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
        const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
        const expected = "sha256=" + hex;
        if (sigHeader !== expected) {
          return new Response("invalid signature", { status: 401 });
        }
      } catch { /* ignore and continue */ }
    }

    // parse payload
    let payload = {};
    try { payload = JSON.parse(raw || "{}"); } catch { /* ignore */ }

    // Extract messages per Meta structure
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const e of entries) {
      const changes = Array.isArray(e?.changes) ? e.changes : [];
      for (const c of changes) {
        const val = c?.value || {};
        const msgs = Array.isArray(val?.messages) ? val.messages : [];
        const contacts = Array.isArray(val?.contacts) ? val.contacts : [];
        const contactName = contacts?.[0]?.profile?.name || null;

        for (const m of msgs) {
          const type = m?.type || "";
          const text = type === "text" ? (m?.text?.body || "") : null;

          // insert (ignore duplicate ids)
          try {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO wa_inbox
                 (wa_message_id, wa_from, wa_to, name, timestamp, type, text, payload_json, created_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
            ).bind(
              m?.id || null,
              m?.from || null,
              val?.metadata?.phone_number_id || null,
              contactName,
              Number(m?.timestamp || 0) || now(),
              type || null,
              text,
              JSON.stringify(m || {}),
              now()
            ).run();
          } catch { /* ignore */ }

          // auto-reply if enabled and this is a text message from a human
          const enabledRaw = (await getSetting(env, "WA_AUTO_REPLY_ENABLED")) || "0";
          const autoEnabled = /^(1|true|yes|on)$/i.test(enabledRaw);
          if (autoEnabled && text && (m?.from)) {
            const { token, phoneNumberId } = await getWAAuth(env);
            if (token && phoneNumberId) {
              const replyText =
                (await getSetting(env, "WA_AUTO_REPLY_TEXT")) ||
                "Dankie! Ons sal gou weer terugkom na jou met meer inligting.";

              const payloadOut = {
                messaging_product: "whatsapp",
                to: m.from,
                type: "text",
                text: { body: replyText }
              };

              let res, out;
              try {
                res = await fetch(`https://graph.facebook.com/v20.0/${q(phoneNumberId)}/messages`, {
                  method: "POST",
                  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                  body: JSON.stringify(payloadOut)
                });
                out = await res.json().catch(()=> ({}));
                if (res.ok) {
                  const replyId = out?.messages?.[0]?.id || null;
                  await env.DB.prepare(
                    `UPDATE wa_inbox SET auto_replied=1, auto_reply_id=?2 WHERE wa_message_id=?1`
                  ).bind(m?.id || "", replyId).run();
                } else {
                  const err = out?.error?.message || `Meta ${res.status}`;
                  await env.DB.prepare(
                    `UPDATE wa_inbox SET auto_reply_error=?2 WHERE wa_message_id=?1`
                  ).bind(m?.id || "", String(err).slice(0, 300)).run();
                }
              } catch (e) {
                await env.DB.prepare(
                  `UPDATE wa_inbox SET auto_reply_error=?2 WHERE wa_message_id=?1`
                ).bind(m?.id || "", String(e?.message || e).slice(0, 300)).run();
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
}