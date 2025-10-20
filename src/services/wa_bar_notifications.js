// /src/services/wa_bar_notifications.js
// Wallet WhatsApp notifications — TEMPLATES ONLY (no text fallbacks)

import { sendTemplateByKey } from "../services/whatsapp.js";
import { getSetting } from "../utils/settings.js";

// ---- helpers ---------------------------------------------------------------

async function logWA(env, { to_msisdn, type, payload, status }) {
  try {
    await env.DB.prepare(
      `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(
      String(to_msisdn || ""),
      String(type || "wallet"),
      JSON.stringify(payload || {}),
      String(status || "queued"),
      Math.floor(Date.now() / 1000)
    ).run();
  } catch {
    // non-blocking
  }
}

function normPhone(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}

// Default threshold = R50 unless overridden
async function lowThresholdCents(env) {
  const v = await getSetting(env, "BAR_LOW_BALANCE_CENTS");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

// 15-min cooldown marker (optional column; handled safely)
async function recentlyWarned(env, wallet_id) {
  try {
    const row = await env.DB.prepare(
      `SELECT last_low_warn_at FROM wallets WHERE id = ?1 LIMIT 1`
    ).bind(wallet_id).first();
    const now = Math.floor(Date.now() / 1000);
    return Number(row?.last_low_warn_at || 0) > (now - 15 * 60);
  } catch {
    return false; // column may not exist — skip cooldown
  }
}
async function markWarned(env, wallet_id) {
  try {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE wallets SET last_low_warn_at = ?2 WHERE id = ?1`
    ).bind(wallet_id, now).run();
  } catch {}
}

async function templateKey(env, keyName) {
  // Expect exact keys in site_settings:
  // WA_TMP_BAR_WELCOME, WA_TMP_BAR_TOPUP, WA_TMP_BAR_PURCHASE, WA_TMP_BAR_LOW_BALANCE
  const v = await getSetting(env, keyName);
  return v && String(v).trim() ? String(v).trim() : null; // e.g. "bar_purchase:af"
}

// Map data shape expected by your template mappings (context = "visitor")
function buildData({ wallet, movement, link }) {
  // Keep keys stable for your mapper:
  return {
    wallets: wallet || null,
    wallet_movements: movement || null,
    link: link || null
  };
}

async function sendTemplated(env, { msisdn, template_key, data, type }) {
  const to = normPhone(msisdn);
  if (!to || !template_key) return false;

  const payload = { template_key, context: "visitor", msisdn: to, data };

  try {
    await sendTemplateByKey(env, payload);
    await logWA(env, { to_msisdn: to, type, payload, status: "sent" });
    return true;
  } catch (e) {
    await logWA(env, {
      to_msisdn: to,
      type,
      payload: { ...payload, error: String(e?.message || e) },
      status: "failed"
    });
    return false;
  }
}

// ---- DB helpers ------------------------------------------------------------

async function loadWallet(env, wallet_id) {
  return await env.DB.prepare(
    `SELECT id, attendee_id, name, mobile, status, version, balance_cents, created_at
       FROM wallets WHERE id = ?1 LIMIT 1`
  ).bind(wallet_id).first();
}

async function loadMovement(env, movement_id) {
  return await env.DB.prepare(
    `SELECT id, wallet_id, kind, ref, amount_cents, created_at, meta_json
       FROM wallet_movements WHERE id = ?1 LIMIT 1`
  ).bind(movement_id).first();
}

// ---- PUBLIC API ------------------------------------------------------------

// Call right after wallet creation INSERT
export async function handleWalletCreated(env, wallet_id) {
  const w = await loadWallet(env, wallet_id);
  if (!w || !w.mobile) return;

  const key = await templateKey(env, "WA_TMP_BAR_WELCOME");
  if (!key) return;

  const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
  const link = base ? `${base}/w/${encodeURIComponent(w.id)}` : `/w/${encodeURIComponent(w.id)}`;

  await sendTemplated(env, {
    msisdn: w.mobile,
    template_key: key,
    data: buildData({ wallet: w, movement: null, link }),
    type: "wallet_welcome"
  });
}

// Call after each wallet_movements INSERT (topup/purchase)
export async function handleWalletMovement(env, movement_id) {
  const mv = await loadMovement(env, movement_id);
  if (!mv) return;
  const w = await loadWallet(env, mv.wallet_id);
  if (!w || !w.mobile) return;

  const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
  const link = base ? `${base}/w/${encodeURIComponent(w.id)}` : `/w/${encodeURIComponent(w.id)}`;

  const isTopup = mv.kind === "topup";
  const isPurchase = mv.kind === "purchase";

  if (isTopup) {
    const key = await templateKey(env, "WA_TMP_BAR_TOPUP");
    if (key) {
      await sendTemplated(env, {
        msisdn: w.mobile,
        template_key: key,
        data: buildData({ wallet: w, movement: mv, link }),
        type: "wallet_topup"
      });
    }
  }

  if (isPurchase) {
    const key = await templateKey(env, "WA_TMP_BAR_PURCHASE");
    if (key) {
      await sendTemplated(env, {
        msisdn: w.mobile,
        template_key: key,
        data: buildData({ wallet: w, movement: mv, link }),
        type: "wallet_purchase"
      });
    }
  }

  // Low-balance nudge (templates only)
  const thr = await lowThresholdCents(env);
  if ((Number(w.balance_cents || 0) < thr) && !(await recentlyWarned(env, w.id))) {
    const key = await templateKey(env, "WA_TMP_BAR_LOW_BALANCE");
    if (key) {
      await sendTemplated(env, {
        msisdn: w.mobile,
        template_key: key,
        data: buildData({ wallet: w, movement: null, link }),
        type: "wallet_low_balance"
      });
      await markWarned(env, w.id);
    }
  }
}

export default {
  handleWalletCreated,
  handleWalletMovement,
};
