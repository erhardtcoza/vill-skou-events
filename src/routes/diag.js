// /src/routes/diag.js
import { json } from "../utils/http.js";

async function getSetting(env, key) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
    ).bind(key).first();
    return row ? row.value : null;
  } catch {
    return null;
  }
}

async function tableExists(env, name) {
  try {
    const row = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1`
    ).bind(name).first();
    return !!row;
  } catch {
    return false;
  }
}

export function mountDiag(router) {
  // Overall readiness & key settings snapshot
  router.add("GET", "/api/diag", async (_req, env) => {
    const tables = [
      "events", "ticket_types", "orders", "tickets",
      "vendors", "vendor_passes", "site_settings",
      "wallets", "sales", "items" // include bar tables
    ];

    const exists = {};
    for (const t of tables) exists[t] = await tableExists(env, t);

    // Settings sanity
    const publicBase = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || null;
    const waTpl       = await getSetting(env, "WA_TMP_ORDER_CONFIRM");
    const barWelcome  = await getSetting(env, "BAR_TMP_WELCOME");
    const barTopup    = await getSetting(env, "BAR_TMP_TOPUP");
    const paymentTpl  = await getSetting(env, "PAYMENT_TEMPLATE");
    const ticketTpl   = await getSetting(env, "TICKET_TEMPLATE");

    // WhatsApp diag
    let waProbe = { ok: true, note: "no probe" };
    try {
      const svc = await import("../routes/wa_test.js");
      if (svc?.diagWhatsAppStatus) waProbe = await svc.diagWhatsAppStatus(env);
    } catch { /* ignore */ }

    // POS diag
    let posProbe = { ok: true, note: "no probe" };
    try {
      const svc = await import("./pos.js");
      if (svc?.diagPOS) posProbe = await svc.diagPOS(env);
    } catch { /* ignore */ }

    // Cashbar diag (simple balance total check)
    let cashbarProbe = { ok: true };
    try {
      const res = await env.DB.prepare(`SELECT COUNT(*) AS wallets, SUM(balance_cents) AS total_cents FROM wallets`).first();
      cashbarProbe = { ok: true, ...res };
    } catch { cashbarProbe = { ok: false }; }

    return json({
      ok: true,
      time: Math.floor(Date.now() / 1000),
      version: env.__VERSION__ || "local-dev",
      db: { tables: exists },
      settings: {
        PUBLIC_BASE_URL: publicBase,
        WA_TMP_ORDER_CONFIRM: waTpl || null,
        BAR_TMP_WELCOME: barWelcome || null,
        BAR_TMP_TOPUP: barTopup || null,
        PAYMENT_TEMPLATE: paymentTpl || null,
        TICKET_TEMPLATE: ticketTpl || null
      },
      whatsapp: waProbe,
      pos: posProbe,
      cashbar: cashbarProbe
    });
  });

  // WhatsApp only
  router.add("GET", "/api/diag/whatsapp", async (_req, env) => {
    try {
      const svc = await import("../routes/wa_test.js");
      if (svc?.diagWhatsAppStatus) {
        return json(await svc.diagWhatsAppStatus(env));
      }
    } catch { /* ignore */ }
    return json({ ok: false, error: "no_probe" }, 501);
  });

  // POS only
  router.add("GET", "/api/diag/pos", async (_req, env) => {
    try {
      const svc = await import("./pos.js");
      if (svc?.diagPOS) {
        return json(await svc.diagPOS(env));
      }
    } catch { /* ignore */ }
    return json({ ok: false, error: "no_probe" }, 501);
  });
}
