// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

function msisdn(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key=?1 LIMIT 1").bind(key).first();
  return row ? row.value : null;
}

export function mountWhatsApp(router) {
  const guard = (fn) => requireRole("admin", fn);

  // --- INBOX table (already added in previous step) ---
  // CREATE TABLE IF NOT EXISTS wa_inbox (
  //   id INTEGER PRIMARY KEY AUTOINCREMENT,
  //   wa_id TEXT UNIQUE, from_msisdn TEXT, to_msisdn TEXT,
  //   direction TEXT, body TEXT, type TEXT,
  //   received_at INTEGER, replied_auto INTEGER DEFAULT 0, replied_manual INTEGER DEFAULT 0
  // );

  // Verify (GET) + Receive (POST)
  router.add("GET", "/api/whatsapp/webhook", async (req, env) => {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    const verify = await getSetting(env, "VERIFY_TOKEN");
    if (mode === "subscribe" && token && verify && token === verify) {
      return new Response(challenge || "", { status: 200 });
    }
    return new Response("Bad verify", { status: 403 });
  });

  router.add("POST", "/api/whatsapp/webhook", async (req, env) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON"); }

    // Extract basic inbound messages
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const e of entries) {
      const changes = Array.isArray(e?.changes) ? e.changes : [];
      for (const ch of changes) {
        const msgs = ch?.value?.messages;
        const contacts = ch?.value?.contacts;
        if (!Array.isArray(msgs)) continue;

        for (const m of msgs) {
          const waId = m?.id || null;
          const from = msisdn(m?.from || "");
          const to = msisdn(ch?.value?.metadata?.display_phone_number || "");
          const text = (m?.text?.body || "").trim();
          const type = m?.type || "text";
          const ts = Math.floor(Date.now()/1000);

          // Upsert to wa_inbox
          try {
            await env.DB.prepare(
              `INSERT INTO wa_inbox (wa_id, from_msisdn, to_msisdn, direction, body, type, received_at)
               VALUES (?1, ?2, ?3, 'in', ?4, ?5, ?6)
               ON CONFLICT(wa_id) DO NOTHING`
            ).bind(waId, from, to, text || null, type, ts).run();
          } catch {}

          // Also upsert to past_visitors (source=inbound_wa)
          if (from) {
            const ex = await env.DB.prepare(
              `SELECT id, name, seen_count FROM past_visitors WHERE phone=?1 LIMIT 1`
            ).bind(from).first();
            if (ex) {
              await env.DB.prepare(
                `UPDATE past_visitors
                   SET last_seen_at=?2,
                       seen_count=seen_count+1,
                       source='inbound_wa'
                 WHERE id=?1`
              ).bind(ex.id, ts).run();
            } else {
              await env.DB.prepare(
                `INSERT INTO past_visitors (name, phone, source, source_ref, first_seen_at, last_seen_at, seen_count, tags)
                 VALUES (NULL, ?1, 'inbound_wa', NULL, ?2, ?2, 1, '2025')`
              ).bind(from, ts).run();
            }
          }

          // STOP / unsubscribe?  mark opt_out=1
          if (/^\s*(stop|unsubscribe|opt\s*out)\s*$/i.test(text || "")) {
            await env.DB.prepare(
              `UPDATE past_visitors SET opt_out=1, notes=COALESCE(notes,'')||';STOP '||CAST(?2 AS TEXT) WHERE phone=?1`
            ).bind(from, ts).run();
          }

          // Auto-reply?
          const autoEnabled = (await getSetting(env, "WA_AUTOREPLY_ENABLED")) === "1";
          const autoText    = await getSetting(env, "WA_AUTOREPLY_TEXT");
          const token       = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
          const pnid        = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");

          if (autoEnabled && autoText && token && pnid && from) {
            const payload = { messaging_product: "whatsapp", to: from, type: "text", text: { body: autoText } };
            try {
              const r = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pnid)}/messages`, {
                method: "POST",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify(payload)
              });
              if (r.ok) {
                await env.DB.prepare(
                  `UPDATE wa_inbox SET replied_auto=1 WHERE wa_id=?1`
                ).bind(waId).run();
              }
            } catch {}
          }
        }
      }
    }
    return json({ ok: true });
  });

  // Manual quick reply
  router.add("POST", "/api/admin/whatsapp/reply", guard(async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const to = msisdn(b?.to || "");
    const bodyText = String(b?.text || "");
    const msgId = String(b?.wa_id || "");
    if (!to || !bodyText) return bad("to and text required");

    const token = await getSetting(env, "WA_TOKEN") || await getSetting(env, "WHATSAPP_TOKEN");
    const pnid  = await getSetting(env, "WA_PHONE_NUMBER_ID") || await getSetting(env, "PHONE_NUMBER_ID");
    if (!token || !pnid) return bad("WhatsApp credentials missing");

    const payload = { messaging_product: "whatsapp", to, type: "text", text: { body: bodyText } };
    const r = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pnid)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const y = await r.json().catch(()=> ({}));
    if (!r.ok) return bad(y?.error?.message || "Meta error", r.status);

    if (msgId) {
      await env.DB.prepare(`UPDATE wa_inbox SET replied_manual=1 WHERE wa_id=?1`).bind(msgId).run();
    }
    return json({ ok: true, message_id: y?.messages?.[0]?.id || null });
  }));
}