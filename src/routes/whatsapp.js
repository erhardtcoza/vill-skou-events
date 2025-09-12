// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

export function mountWhatsApp(router) {
  const guard = (fn) => requireRole("admin", fn);
  const log = (...a) => { try { console.log("[WA]", ...a); } catch {} };

  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
    ).bind(key).first();
    return row ? row.value : null;
  }

  async function getCreds(env) {
    // Prefer new keys, fall back to old WA_* variants
    const token = (await getSetting(env, "WHATSAPP_TOKEN")) || (await getSetting(env, "WA_TOKEN")) || "";
    const phoneNumberId = (await getSetting(env, "PHONE_NUMBER_ID")) || (await getSetting(env, "WA_PHONE_NUMBER_ID")) || "";
    const businessId = (await getSetting(env, "BUSINESS_ID")) || (await getSetting(env, "WA_BUSINESS_ID")) || "";
    return { token, phoneNumberId, businessId };
  }

  async function getAutoReply(env) {
    const enabled = (await getSetting(env, "WA_AUTOREPLY_ENABLED")) || "0";
    const text = (await getSetting(env, "WA_AUTOREPLY_TEXT")) || "";
    return { enabled: enabled === "1" || enabled === 1, text };
  }

  async function sendText(env, to, text) {
    const { token, phoneNumberId } = await getCreds(env);
    if (!token || !phoneNumberId) throw new Error("Missing WA token or phone number id");
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: String(to),
        type: "text",
        text: { body: String(text).slice(0, 4096) }
      })
    });
    const j = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(j?.error?.message || `Meta error ${res.status}`);
    return j;
  }

  // ---------- Diagnostics ----------
  router.add("GET", "/api/admin/whatsapp/diag", guard(async (_req, env) => {
    const { token, businessId } = await getCreds(env);
    if (!token || !businessId) {
      return json({ ok:false, error:"Missing token or business id" }, 400);
    }
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(businessId)}/message_templates?limit=1&fields=name,status,language,category`;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const meta = await res.json().catch(()=> ({}));
      if (!res.ok) return json({ ok:false, meta, status:res.status }, res.status);
      return json({ ok:true, sample: meta?.data?.[0] || null });
    } catch (e) {
      return json({ ok:false, error:String(e?.message||e) }, 502);
    }
  }));

  // ---------- List from DB ----------
  router.add("GET", "/api/admin/whatsapp/templates", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, name, language, status, category, components_json
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();
    return json({ ok:true, templates: q.results || [] });
  }));

  // ---------- Sync templates from Meta ----------
  router.add("POST", "/api/admin/whatsapp/sync", guard(async (_req, env) => {
    const { token, businessId } = await getCreds(env);
    if (!token || !businessId) return bad("Missing token or business id");
    const fields = "name,status,language,category,components";
    let url = `https://graph.facebook.com/v20.0/${encodeURIComponent(businessId)}/message_templates?fields=${encodeURIComponent(fields)}&limit=100`;
    let total = 0, fetched = 0;
    try {
      while (url) {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const body = await res.json().catch(()=> ({}));
        if (!res.ok) return bad(`Meta error ${res.status}: ${body?.error?.message||"unknown"}`, res.status);
        const data = Array.isArray(body?.data) ? body.data : [];
        fetched += data.length;
        for (const t of data) {
          const name = t?.name || "";
          const lang = t?.language || "";
          const status = t?.status || "";
          const category = t?.category || "";
          const compsJson = JSON.stringify(t?.components || []);
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
        url = body?.paging?.next || null;
      }
    } catch (e) {
      return bad("Sync failed: " + (e?.message || e), 502);
    }
    return json({ ok:true, count: total, fetched, total_in_db: total });
  }));

  // ---------- Optional: create template on Meta ----------
  router.add("POST", "/api/admin/whatsapp/templates", guard(async (req, env) => {
    const { token, businessId } = await getCreds(env);
    if (!token || !businessId) return bad("Missing token or business id");
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(businessId)}/message_templates`,
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
    return json({ ok:true, meta: out });
  }));

  // ======================================================================
  //                            INBOX  (DB: wa_inbox)
  // ======================================================================

  // Public webhook (Meta will POST here)
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return json({ ok:false }, 400); }

    try { log("inbound", JSON.stringify(body).slice(0, 600)); } catch {}

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let inserted = 0;

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        const value = ch?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const to_msisdn = value?.metadata?.display_phone_number || value?.metadata?.phone_number_id || "";

        for (const m of messages) {
          // Only store message‐type events (ignore statuses here)
          const wa_id = m?.id || "";
          if (!wa_id) continue;

          const from = m?.from || "";
          const type = m?.type || "text";
          const ts = Number(m?.timestamp || 0) || Math.floor(Date.now()/1000);
          const bodyText =
            type === "text" ? (m?.text?.body || "") :
            type === "button" ? (m?.button?.text || "") :
            type === "interactive" ? (m?.interactive?.button_reply?.title || m?.interactive?.list_reply?.title || "") :
            "";

          try {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO wa_inbox
                 (wa_id, from_msisdn, to_msisdn, direction, body, type, received_at, replied_auto, replied_manual)
               VALUES (?1, ?2, ?3, 'in', ?4, ?5, ?6, 0, 0)`
            ).bind(wa_id, from, String(to_msisdn), String(bodyText || ""), String(type || "text"), ts).run();
            inserted++;
          } catch (e) {
            log("inbox insert error", e?.message || e);
          }

          // Auto-reply if enabled
          try {
            const { enabled, text } = await getAutoReply(env);
            if (enabled && text) {
              await sendText(env, from, text);
              await env.DB.prepare(
                `UPDATE wa_inbox SET replied_auto=1 WHERE wa_id=?1`
              ).bind(wa_id).run();
            }
          } catch (e) {
            log("auto-reply failed", e?.message || e);
          }
        }
      }
    }
    return json({ ok:true, inserted });
  });

  // Admin: list inbox
  // GET /api/admin/whatsapp/inbox?limit=50&unread=1
  router.add("GET", "/api/admin/whatsapp/inbox", guard(async (req, env) => {
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const unreadOnly = (url.searchParams.get("unread") || "") === "1";

    const where = unreadOnly
      ? "WHERE direction='in' AND COALESCE(replied_auto,0)=0 AND COALESCE(replied_manual,0)=0"
      : "WHERE direction='in'";

    const q = await env.DB.prepare(
      `SELECT id, wa_id, from_msisdn, to_msisdn, body, type, received_at,
              replied_auto, replied_manual
         FROM wa_inbox
        ${where}
        ORDER BY received_at DESC
        LIMIT ?1`
    ).bind(limit).all();

    return json({ ok:true, items: q.results || [] });
  }));

  // Admin: manual quick reply
  // Body: { id?, wa_id?, to?, text }
  router.add("POST", "/api/admin/whatsapp/reply", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const text = String(b?.text || "").trim();
    if (!text) return bad("text required");

    let to = String(b?.to || "").trim();
    if (!to) {
      // Resolve from inbox record
      const wa_id = b?.wa_id ? String(b.wa_id) : null;
      const id = b?.id ? Number(b.id) : null;
      let row = null;
      if (wa_id) row = await env.DB.prepare(`SELECT from_msisdn FROM wa_inbox WHERE wa_id=?1 LIMIT 1`).bind(wa_id).first();
      else if (id) row = await env.DB.prepare(`SELECT from_msisdn FROM wa_inbox WHERE id=?1 LIMIT 1`).bind(id).first();
      to = row?.from_msisdn || "";
    }
    if (!to) return bad("destination (to) not found");

    try {
      const meta = await sendText(env, to, text);
      // Mark manual reply on matching row if provided
      if (b?.wa_id) {
        await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE wa_id=?1`).bind(String(b.wa_id)).run();
      } else if (b?.id) {
        await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE id=?1`).bind(Number(b.id)).run();
      }
      return json({ ok:true, meta });
    } catch (e) {
      return bad(String(e?.message || e), 502);
    }
  }));

  // -----------------------------------------------------------------------
  // NOTE: if Meta calls GET verification for webhook, handle it here too.
  // Add this if you set the Verify Token on the Meta app:
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = await getSetting(env, "VERIFY_TOKEN");
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge || "", { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  });
}