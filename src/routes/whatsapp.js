// src/routes/whatsapp.js
import { json } from "../utils/http.js";
import { sendWhatsAppTemplate, sendWhatsAppTextIfSession } from "../services/whatsapp.js";

async function getSetting(env, key) {
  const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(key).first();
  return row ? row.value : null;
}

export function mountWhatsApp(router) {
  router.get("/api/whatsapp/diag", async (_req, env) => {
    const cfg = {
      has_token: !!((await getSetting(env, "WA_TOKEN")) || env.WA_TOKEN),
      has_phone_id: !!((await getSetting(env, "WA_PHONE_ID")) || env.WA_PHONE_ID),
      default_lang: (await getSetting(env, "WA_DEFAULT_LANG")) || "en_US",
      public_base: (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || ""
    };
    return json({ ok: true, cfg });
  });

  // POST { to, text?, templateName?, lang? }
  router.add("POST", "/api/whatsapp/test", async (req, env) => {
    let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad_json" }, 400); }
    const to = b?.to || "";
    const text = b?.text || "Test 👋";
    if (b?.templateName) {
      const ok = await sendWhatsAppTemplate(env, to, text, b?.lang || "en_US", b.templateName);
      return json({ ok });
    } else {
      const ok = await sendWhatsAppTextIfSession(env, to, text);
      return json({ ok });
    }
  });
}
