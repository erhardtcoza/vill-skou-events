// /src/routes/whatsapp.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

function q(v){ return encodeURIComponent(v); }

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key = ?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

export function mountWhatsApp(router) {
  /* ---------- Inbox: list last 100 ----------- */
  router.add("GET", "/api/whatsapp/inbox", async (_req, env) => {
    const r = await env.DB.prepare(
      `SELECT id, wa_id, from_msisdn, to_msisdn, direction, body, type, received_at,
              replied_auto, replied_manual
         FROM wa_inbox
        ORDER BY received_at DESC, id DESC
        LIMIT 100`
    ).all();
    return json({ ok: true, rows: r.results || [] });
  });

  /* ---------- Admin: send plain text --------- */
  router.add(
    "POST",
    "/api/admin/whatsapp/send-text",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const to = String(b?.to || "").replace(/\D+/g, "");
      const text = String(b?.text || "");
      if (!to) return bad("to required (digits only)");
      if (!text.trim()) return bad("text required");

      const token = (await getSetting(env, "WA_TOKEN")) || (await getSetting(env, "WHATSAPP_TOKEN"));
      const pnid  = (await getSetting(env, "WA_PHONE_NUMBER_ID")) || (await getSetting(env, "PHONE_NUMBER_ID"));
      if (!token || !pnid) return bad("WhatsApp token / phone number ID missing in Site Settings");

      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: text }
      };

      let res, y;
      try {
        res = await fetch(`https://graph.facebook.com/v20.0/${q(pnid)}/messages`, {
          method: "POST",
          headers: { authorization: "Bearer " + token, "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        y = await res.json().catch(()=>({}));
      } catch (e) {
        return bad("Meta API network error: " + (e?.message || e), 502);
      }
      if (!res.ok) return bad(y?.error?.message || ("Meta error " + res.status), res.status);

      // Optional: log
      try {
        await env.DB.prepare(
          `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
           VALUES (?1, 'text', ?2, 'SENT', unixepoch())`
        ).bind(to, JSON.stringify(payload)).run();
      } catch {}

      return json({ ok: true, message_id: y?.messages?.[0]?.id || null });
    })
  );

  /* ---------- Admin: delete inbox row -------- */
  router.add(
    "POST",
    "/api/admin/whatsapp/delete",
    requireRole("admin", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const id = Number(b?.id || 0);
      if (!id) return bad("id required");
      await env.DB.prepare(`DELETE FROM wa_inbox WHERE id=?1`).bind(id).run();
      return json({ ok: true });
    })
  );
}
