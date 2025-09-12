// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

/**
 * WhatsApp endpoints:
 *  - Admin (guarded): diag, templates list/sync, inbox list, manual reply
 *  - Public: webhook GET verify + POST receive (stores wa_inbox, optional auto-reply)
 */
export function mountWhatsApp(router) {
  const guard = (fn) => requireRole("admin", fn);
  const log = (...a) => { try { console.log("[WA]", ...a); } catch {} };

  /* -------------------- helpers -------------------- */
  async function getSetting(env, key) {
    const row = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
    ).bind(key).first();
    return row ? row.value : null;
  }
  const nowTs = () => Math.floor(Date.now() / 1000);
  const msisdn = (v) => String(v || "").replace(/\D+/g, "");
  const safeStr = (v) => (v == null ? null : String(v));

  async function sendWhatsAppText(env, toMsisdn, body) {
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");
    if (!token || !pnid) throw new Error("WhatsApp token or phone number ID missing");
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(pnid)}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: msisdn(toMsisdn),
      type: "text",
      text: { preview_url: false, body: String(body || "") },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j?.error?.message || `Meta error ${res.status}`);
    }
    return j;
  }

  /* =========================================================
   *                      ADMIN ENDPOINTS
   * =======================================================*/

  // ---------- Diagnostics ----------
  router.add("GET", "/api/admin/whatsapp/diag", guard(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const wabaId = await getSetting(env, "WA_BUSINESS_ID") || await getSetting(env, "BUSINESS_ID");
    const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");

    if (!token || !wabaId) {
      return json({ ok:false, haveToken:!!token, haveBusiness:!!wabaId, havePhoneId:!!pnid }, 400);
    }

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/message_templates?limit=1&fields=name,status,language,category`;
    let meta;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      meta = await res.json().catch(()=> ({}));
      if (!res.ok) return json({ ok:false, meta, status:res.status }, res.status);
    } catch (e) {
      return json({ ok:false, error:String(e?.message||e) }, 502);
    }

    return json({
      ok:true,
      sample: meta?.data?.[0] || null,
      phone_id_present: !!pnid,
      auto_reply_enabled: (await getSetting(env, "WA_AUTO_REPLY_ENABLED")) === "1",
    });
  }));

  // ---------- List templates from DB ----------
  router.add("GET", "/api/admin/whatsapp/templates", guard(async (_req, env) => {
    const q = await env.DB.prepare(
      `SELECT id, name, language, status, category, components_json, updated_at
         FROM wa_templates
        ORDER BY name ASC, language ASC`
    ).all();
    return json({ ok:true, templates: q.results || [] });
  }));

  // ---------- Sync templates from Meta ----------
  router.add("POST", "/api/admin/whatsapp/sync", guard(async (_req, env) => {
    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const wabaId = await getSetting(env, "WA_BUSINESS_ID") || await getSetting(env, "BUSINESS_ID");
    if (!token || !wabaId) return bad("Missing WA_TOKEN or BUSINESS_ID");

    const fields = "name,status,language,category,components";
    let url = `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/message_templates?fields=${encodeURIComponent(fields)}&limit=100`;
    const ts = nowTs();
    let fetched = 0;

    try {
      while (url) {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const body = await res.json().catch(()=> ({}));
        if (!res.ok) return bad(`Meta error ${res.status}: ${body?.error?.message||"unknown"}`, res.status);

        for (const t of (Array.isArray(body?.data) ? body.data : [])) {
          await env.DB.prepare(
            `INSERT INTO wa_templates (name, language, status, category, components_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(name, language) DO UPDATE SET
               status=excluded.status,
               category=excluded.category,
               components_json=excluded.components_json,
               updated_at=excluded.updated_at`
          ).bind(
            t?.name || "",
            t?.language || "",
            t?.status || "",
            t?.category || "",
            JSON.stringify(t?.components || []),
            ts
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

  // ---------- Inbox: list with simple cursor paging ----------
  // GET /api/admin/whatsapp/inbox?limit=50&cursor=<id>
  router.add("GET", "/api/admin/whatsapp/inbox", guard(async (req, env) => {
    const u = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") || 50)));
    const cursor = Number(u.searchParams.get("cursor") || 0);

    const rows = await env.DB.prepare(
      `SELECT id, wa_msg_id, from_msisdn, name, type, text, received_at,
              auto_replied, auto_reply_text, auto_reply_at,
              manual_replied, manual_reply_text, manual_reply_at
         FROM wa_inbox
        WHERE (?1 = 0 OR id < ?1)
        ORDER BY id DESC
        LIMIT ?2`
    ).bind(cursor, limit).all();

    const list = rows.results || [];
    const next_cursor = list.length ? list[list.length - 1].id : null;
    return json({ ok:true, items: list, next_cursor });
  }));

  // ---------- Inbox: manual quick-reply ----------
  // POST body: { to: "27...", text: "Hello" }
  router.add("POST", "/api/admin/whatsapp/reply", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const to = msisdn(b?.to || "");
    const text = String(b?.text || "").trim();
    if (!to) return bad("to required");
    if (!text) return bad("text required");

    try {
      const r = await sendWhatsAppText(env, to, text);
      // mark latest message from that msisdn as manually replied
      await env.DB.prepare(
        `UPDATE wa_inbox
            SET manual_replied=1,
                manual_reply_text=?2,
                manual_reply_at=?3
          WHERE from_msisdn=?1
          ORDER BY id DESC
          LIMIT 1`
      ).bind(to, text, nowTs()).run();

      return json({ ok:true, message_id: r?.messages?.[0]?.id || null });
    } catch (e) {
      return bad(String(e?.message || e), 502);
    }
  }));

  /* =========================================================
   *                      PUBLIC WEBHOOK
   * =======================================================*/

  // GET verify (for initial webhook challenge)
  // Meta calls with: hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    const expected = await getSetting(env, "VERIFY_TOKEN");
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge || "", { status: 200, headers: { "content-type":"text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  });

  // POST receive
  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    let payload; try { payload = await req.json(); } catch { return bad("Bad JSON"); }
    // quick acknowledge; we’ll do best-effort inserts below
    // (Meta requires a 200 within short time)
    const ack = json({ ok: true });

    try { log("inbound", JSON.stringify(payload).slice(0, 1000)); } catch {}

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    if (!entries.length) return ack;

    // Auto-reply config
    const autoOn   = (await getSetting(env, "WA_AUTO_REPLY_ENABLED")) === "1";
    const autoText = (await getSetting(env, "WA_AUTO_REPLY_TEXT")) || "";

    for (const e of entries) {
      const changes = Array.isArray(e?.changes) ? e.changes : [];
      for (const ch of changes) {
        const v = ch?.value || {};
        if (v?.messaging_product !== "whatsapp") continue;

        const messages = Array.isArray(v?.messages) ? v.messages : [];
        const contacts = Array.isArray(v?.contacts) ? v.contacts : [];
        const contactNameByWaId = new Map(
          contacts.map(c => [String(c?.wa_id || ""), String(c?.profile?.name || "")])
        );

        for (const m of messages) {
          // Only store user-originated messages (ignore our own status)
          const from = msisdn(m?.from || "");
          if (!from) continue;

          const waMsgId = String(m?.id || "");
          const type = String(m?.type || "");
          let text = "";

          if (type === "text") text = String(m?.text?.body || "");
          else if (type === "button") text = String(m?.button?.text || "");
          else if (type === "interactive") {
            // could be list/button reply
            const i = m?.interactive || {};
            text = String(i?.button_reply?.title || i?.list_reply?.title || i?.list_reply?.description || "");
          } else if (type === "image") {
            text = "[image]";
          } else if (type === "audio") {
            text = "[audio]";
          } else if (type === "sticker") {
            text = "[sticker]";
          } else if (type === "contacts") {
            text = "[contacts]";
          } else if (type === "location") {
            text = "[location]";
          } else if (type === "document") {
            text = "[document]";
          } else if (type === "order") {
            text = "[order]";
          }

          const name = contactNameByWaId.get(from) || null;
          const received_at = Number(m?.timestamp ? Number(m.timestamp) : nowTs());

          // insert into inbox
          try {
            await env.DB.prepare(
              `INSERT INTO wa_inbox
                 (wa_msg_id, from_msisdn, name, type, text, raw_json, received_at,
                  auto_replied, auto_reply_text, auto_reply_at,
                  manual_replied, manual_reply_text, manual_reply_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
                       0, NULL, NULL,
                       0, NULL, NULL)`
            ).bind(
              waMsgId || null,
              from || null,
              name,
              type || null,
              text || null,
              JSON.stringify(m || {}),
              received_at || nowTs()
            ).run();
          } catch (e) {
            // ignore unique conflicts etc.
            try { log("inbox insert err", e?.message || e); } catch {}
          }

          // Optional auto-reply
          if (autoOn && autoText) {
            try {
              await sendWhatsAppText(env, from, autoText);
              await env.DB.prepare(
                `UPDATE wa_inbox
                    SET auto_replied=1,
                        auto_reply_text=?2,
                        auto_reply_at=?3
                  WHERE from_msisdn=?1
                  ORDER BY id DESC
                  LIMIT 1`
              ).bind(from, autoText, nowTs()).run();
            } catch (e) {
              try { log("auto-reply failed", e?.message || e); } catch {}
              // we do not fail webhook ack on auto-reply failures
            }
          }
        }
      }
    }

    return ack;
  });

  /* =========================================================
   *        (Optional) create wa_inbox if missing at boot
   * =======================================================*/
  // Lightweight safety: attempt to create wa_inbox if it doesn't exist.
  // This runs on first call that touches this module, harmless if exists.
  (async () => {
    try {
      await router?.__wa_init_done; // avoid duplicate
    } catch {}
    if (router && !router.__wa_init_done) {
      try {
        await router?.env?.DB?.prepare?.(
          `CREATE TABLE IF NOT EXISTS wa_inbox (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             wa_msg_id TEXT,
             from_msisdn TEXT,
             name TEXT,
             type TEXT,
             text TEXT,
             raw_json TEXT,
             received_at INTEGER,
             auto_replied INTEGER DEFAULT 0,
             auto_reply_text TEXT,
             auto_reply_at INTEGER,
             manual_replied INTEGER DEFAULT 0,
             manual_reply_text TEXT,
             manual_reply_at INTEGER
           )`
        )?.run?.();
      } catch { /* best-effort */ }
      router.__wa_init_done = true;
    }
  })();
}