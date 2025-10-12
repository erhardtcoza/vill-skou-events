// src/routes/diag.js
import { json } from "../utils/http.js";

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? row.value : null;
}

async function tableExists(env, name) {
  const row = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1`
  ).bind(name).first();
  return !!row;
}

export function mountDiag(router) {
  // Overall readiness & key settings snapshot
  router.add("GET", "/api/diag", async (_req, env) => {
    // Basic DB/table checks
    const tables = [
      "events", "ticket_types", "orders", "order_items", "tickets",
      "vendors", "vendor_badges", "vendor_passes", "site_settings"
    ];
    const exists = {};
    for (const t of tables) exists[t] = await tableExists(env, t);

    // Settings sanity
    const publicBase = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || null;
    const waTpl = await getSetting(env, "WA_TMP_ORDER_CONFIRM");
    const paymentTpl = await getSetting(env, "PAYMENT_TEMPLATE"); // optional
    const ticketTpl  = await getSetting(env, "TICKET_TEMPLATE");  // optional

    // WhatsApp quick status probe (optional, won’t throw)
    let waProbe = null;
    try {
      const svc = await import("../routes/wa_test.js");
      if (svc?.diagWhatsAppStatus) {
        waProbe = await svc.diagWhatsAppStatus(env);
      }
    } catch { /* ignore */ }

    // POS diag (optional)
    let posProbe = null;
    try {
      const svc = await import("./pos.js");
      if (svc?.diagPOS) {
        posProbe = await svc.diagPOS(env);
      }
    } catch { /* ignore */ }

    return json({
      ok: true,
      time: Math.floor(Date.now()/1000),
      db: {
        tables: exists
      },
      settings: {
        PUBLIC_BASE_URL: publicBase,
        WA_TMP_ORDER_CONFIRM: waTpl || null,
        PAYMENT_TEMPLATE: paymentTpl || null,
        TICKET_TEMPLATE: ticketTpl || null
      },
      whatsapp: waProbe || { ok: true, note: "No WA probe available" },
      pos: posProbe || { ok: true, note: "No POS probe available" }
    });
  });

  // Focused WhatsApp diag (if you want a dedicated endpoint)
  router.add("GET", "/api/diag/whatsapp", async (_req, env) => {
    try {
      const svc = await import("../routes/wa_test.js");
      if (svc?.diagWhatsAppStatus) {
        const d = await svc.diagWhatsAppStatus(env);
        return json(d);
      }
    } catch { /* ignore */ }
    return json({ ok: false, error: "no_probe" }, 501);
  });

  // Focused POS diag (optional)
  router.add("GET", "/api/diag/pos", async (_req, env) => {
    try {
      const svc = await import("./pos.js");
      if (svc?.diagPOS) {
        const d = await svc.diagPOS(env);
        return json(d);
      }
    } catch { /* ignore */ }
    return json({ ok: false, error: "no_probe" }, 501);
  });
}
