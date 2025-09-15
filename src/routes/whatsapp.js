// src/routes/whatsapp.js
import { json } from "../utils/http.js";

// We’ll call the WA service. If it’s missing, we fail gracefully.
async function svc() {
  try { return await import("../services/whatsapp.js"); }
  catch { return {}; }
}

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}
function norm(msisdn) {
  const s = String(msisdn || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("27") && s.length >= 11) return s;
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
async function tableExists(db, name){
  try {
    const r = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?1`).bind(name).first();
    return !!r;
  } catch { return false; }
}

export function mountWhatsApp(router) {
  router.get("/api/whatsapp/diag", async (_req, env) => {
    const token = (await getSetting(env, "WA_TOKEN")) || env.WA_TOKEN;
    const pid =
      (await getSetting(env, "WA_PHONE_ID")) ||
      (await getSetting(env, "WA_PHONE_NUMBER_ID")) ||
      env.WA_PHONE_ID || env.WA_PHONE_NUMBER_ID;
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const lang = (await getSetting(env, "WA_DEFAULT_LANG")) || "en_US";
    return json({ ok: true, cfg: { has_token: !!token, has_phone_id: !!pid, default_lang: lang, public_base: base } });
  });

  // Explicit template test with vars[]
  router.add("POST", "/api/whatsapp/test-template", async (req, env) => {
    let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad_json" }, 400); }
    const to = norm(b?.to || "");
    const template = String(b?.template || "").trim();
    const lang = String(b?.lang || (await getSetting(env, "WA_DEFAULT_LANG")) || "en_US");
    const vars = Array.isArray(b?.vars) ? b.vars.slice(0, 10).map(x => String(x ?? "")) : [];
    if (!to || !template) return json({ ok:false, error:"to and template required" }, 400);

    const WA = await svc();
    if (!WA.sendWhatsAppTemplate) return json({ ok:false, error:"wa_service_missing" }, 500);

    const ok = await WA.sendWhatsAppTemplate(env, to, "", lang, template, vars);
    return json({ ok });
  });

  // High-level order-style test (uses name, code -> builds link via PUBLIC_BASE_URL)
  router.add("POST", "/api/whatsapp/test-order-sample", async (req, env) => {
    let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad_json" }, 400); }
    const to   = norm(b?.to || "");
    const name = String(b?.name || "").trim() || "Klant";
    const code = String(b?.code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase() || "CABCDE1";
    if (!to) return json({ ok:false, error:"to required" }, 400);

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/t/${encodeURIComponent(code)}` : "";

    const which = String(b?.which || "order").toLowerCase();
    const key =
      which === "payment" ? "WA_TMP_PAYMENT_CONFIRM" :
      which === "ticket"  ? "WA_TMP_TICKET_DELIVERY" :
                            "WA_TMP_ORDER_CONFIRM";

    const sel = await getSetting(env, key); // name:lang
    const [template, lang] = String(sel || "").split(":");
    if (!template) return json({ ok:false, error:`template not set for ${key}` }, 400);

    const WA = await svc();
    if (!WA.sendWhatsAppTemplate) return json({ ok:false, error:"wa_service_missing" }, 500);

    const vars = [name, code, link];
    const ok = await WA.sendWhatsAppTemplate(env, to, "", lang || "en_US", template, vars);
    return json({ ok, which, template, lang, vars });
  });

  // ---------- Inbox (best-effort; returns [] if no table) ----------
  router.add("GET", "/api/whatsapp/inbox", async (_req, env) => {
    const has = await tableExists(env.DB, "wa_messages");
    if (!has) return json({ ok:true, messages: [] });
    const q = await env.DB.prepare(
      `SELECT id, direction, wa_from, wa_to, text, ts
         FROM wa_messages
        ORDER BY ts DESC
        LIMIT 100`
    ).all();
    return json({ ok:true, messages: q.results || [] });
  });

  // ---------- Quick reply ----------
  router.add("POST", "/api/whatsapp/reply", async (req, env) => {
    let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad_json" }, 400); }
    const to = norm(b?.to || "");
    const text = String(b?.text || "").trim();
    if (!to || !text) return json({ ok:false, error:"to and text required" }, 400);

    const WA = await svc();
    if (!WA.sendWhatsAppTextIfSession) return json({ ok:false, error:"wa_service_missing" }, 500);

    const ok = await WA.sendWhatsAppTextIfSession(env, to, text);
    return json({ ok });
  });
}
