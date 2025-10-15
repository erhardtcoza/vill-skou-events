// /src/services/wa_bar_notifications.js
import { sendTemplateByKey } from "../routes/whatsapp.js"; // uses your existing sender
import { getSetting } from "../utils/settings.js";         // tiny util shown below

// Default threshold = R85 unless overridden in site_settings.BAR_LOW_BALANCE_THRESHOLD_CENTS
async function lowThresholdCents(env) {
  const v = await getSetting(env, "BAR_LOW_BALANCE_THRESHOLD_CENTS");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 8500;
}

// record a "cooldown" so we don't spam low-balance
async function recentlyWarned(env, wallet_id) {
  const row = await env.DB.prepare(
    `SELECT last_low_warn_at FROM wallets WHERE id = ?1 LIMIT 1`
  ).bind(wallet_id).first();
  const now = Math.floor(Date.now()/1000);
  const dayAgo = now - 24*3600;
  return (row?.last_low_warn_at || 0) > dayAgo;
}
async function markWarned(env, wallet_id) {
  const now = Math.floor(Date.now()/1000);
  await env.DB.prepare(
    `UPDATE wallets SET last_low_warn_at = ?2 WHERE id = ?1`
  ).bind(wallet_id, now).run();
}

// Compose “context objects” the mapper can read (wallets.*, wallet_movements.*)
async function loadWallet(env, wallet_id) {
  return await env.DB.prepare(
    `SELECT id, attendee_id, name, mobile, status, balance_cents, created_at
       FROM wallets WHERE id = ?1 LIMIT 1`
  ).bind(wallet_id).first();
}
async function loadMovement(env, movement_id) {
  return await env.DB.prepare(
    `SELECT id, wallet_id, kind, ref, amount_cents, created_at
       FROM wallet_movements WHERE id = ?1 LIMIT 1`
  ).bind(movement_id).first();
}

// --- PUBLIC API -------------------------------------------------------------

// Call this right after you INSERT a wallet row
export async function handleWalletCreated(env, wallet_id) {
  const w = await loadWallet(env, wallet_id);
  if (!w || !w.mobile) return; // nothing to send
  // Template key read from site_settings: WA_TMP_BAR_WELCOME => e.g. "bar_welcome:af"
  const template_key = await getSetting(env, "WA_TMP_BAR_WELCOME");
  if (!template_key) return;

  await sendTemplateByKey(env, {
    template_key,
    context: "visitor",
    msisdn: w.mobile,
    data: { wallets: w },        // available to {{…}} mapping
  });
}

// Call this after you INSERT a wallet_movements row and after you UPDATE wallet balance
export async function handleWalletMovement(env, movement_id) {
  const mv = await loadMovement(env, movement_id);
  if (!mv) return;
  const w  = await loadWallet(env, mv.wallet_id);
  if (!w || !w.mobile) return;

  // Decide which template
  const isTopup    = mv.kind === "topup";
  const isPurchase = mv.kind === "purchase";

  if (isTopup) {
    const template_key = await getSetting(env, "WA_TMP_BAR_TOPUP");
    if (template_key) {
      await sendTemplateByKey(env, {
        template_key,
        context: "visitor",
        msisdn: w.mobile,
        data: { wallets: w, wallet_movements: mv },
      });
    }
  }

  if (isPurchase) {
    const template_key = await getSetting(env, "WA_TMP_BAR_PURCHASE");
    if (template_key) {
      await sendTemplateByKey(env, {
        template_key,
        context: "visitor",
        msisdn: w.mobile,
        data: { wallets: w, wallet_movements: mv },
      });
    }
  }

  // Low-balance after this movement
  const thr = await lowThresholdCents(env);
  if ((w.balance_cents || 0) < thr && !(await recentlyWarned(env, w.id))) {
    const template_key = await getSetting(env, "WA_TMP_BAR_LOW_BALANCE") || "bar_low_balance:af";
    await sendTemplateByKey(env, {
      template_key,
      context: "visitor",
      msisdn: w.mobile,
      data: { wallets: w },
    }).catch(()=>{});
    await markWarned(env, w.id);
  }
}
