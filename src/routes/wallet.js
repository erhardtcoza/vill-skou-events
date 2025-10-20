// /src/routes/wallet.js
import { json, bad } from "../utils/http.js";

/* ----------------------------- helpers ----------------------------- */
function normPhone(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
function nowSec() { return Math.floor(Date.now() / 1000); }
function rands(c) { return "R" + ((Number(c) || 0) / 100).toFixed(2); }
function shortId(len = 7) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare(
    `SELECT value FROM site_settings WHERE key=?1 LIMIT 1`
  ).bind(key).first();
  return row ? String(row.value) : null;
}
function parseNameLang(sel, fallbackName = "", fallbackLang = "af") {
  if (!sel) return { name: fallbackName, language: fallbackLang };
  const [n, l] = String(sel).split(":");
  return { name: (n || fallbackName || "").trim(), language: (l || fallbackLang || "af").trim() };
}
async function logWA(env, { to, type = "template", payload, status = "sent" }) {
  try {
    await env.DB.prepare(
      `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(String(to || ""), String(type), JSON.stringify(payload || null), String(status), nowSec()).run();
  } catch {}
}

/* ----------------------------- queries ----------------------------- */
async function getWalletById(env, id) {
  return await env.DB.prepare(
    `SELECT id,name,mobile,status,version,balance_cents,created_at
       FROM wallets WHERE id=?1 LIMIT 1`
  ).bind(String(id)).first();
}
async function getWalletByMobile(env, mobileDigits) {
  return await env.DB.prepare(
    `SELECT id,name,mobile,status,version,balance_cents,created_at
       FROM wallets
      WHERE REPLACE(mobile,' ','') LIKE ?1
      ORDER BY created_at DESC
      LIMIT 1`
  ).bind(`%${mobileDigits}%`).first();
}
async function listMovements(env, walletId, limit = 50, offset = 0) {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, wallet_id, kind, amount_cents, meta_json, created_at, ref
         FROM wallet_movements
        WHERE wallet_id=?1
        ORDER BY created_at DESC
        LIMIT ?2 OFFSET ?3`
    ).bind(walletId, limit, offset).all();
    return rows.results || [];
  } catch {
    return [];
  }
}

/* ---------------------- template-only sender ----------------------- */
async function sendTemplateOnly(env, { to, settingKey, variables = [] }) {
  const msisdn = normPhone(to);
  if (!msisdn) return { ok: false, reason: "no_msisdn" };

  const sel = await getSetting(env, settingKey);
  if (!sel) {
    await logWA(env, { to: msisdn, payload: { error: "no_template_setting", settingKey }, status: "error" });
    return { ok: false, reason: "no_template_setting" };
  }
  const { name, language } = parseNameLang(sel);

  try {
    const mod = await import("../services/whatsapp.js");
    if (!mod || typeof mod.sendWhatsAppTemplate !== "function") {
      await logWA(env, { to: msisdn, payload: { error: "service_missing", template: name, language, variables }, status: "error" });
      return { ok: false, reason: "service_missing" };
    }

    try {
      await mod.sendWhatsAppTemplate(env, { to: msisdn, name, language, variables });
    } catch {
      await mod.sendWhatsAppTemplate(env, msisdn, variables, language, name);
    }
    await logWA(env, { to: msisdn, payload: { template: name, language, variables }, status: "sent" });
    return { ok: true };
  } catch (e) {
    await logWA(env, { to: msisdn, payload: { template: name, language, variables, error: String(e && e.message || e) }, status: "error" });
    return { ok: false, reason: "exception" };
  }
}

/* ----------------------------- routes ------------------------------ */
export function mountWallet(router) {

  // Get wallet by id
  router.add("GET", "/api/wallets/:id", async (_req, env, _ctx, { id }) => {
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Get wallet by mobile digits
  router.add("GET", "/api/wallets/by-mobile/:num", async (_req, env, _ctx, { num }) => {
    const s = String(num || "").replace(/\D+/g, "");
    if (!s) return bad(400, "bad_mobile");
    const w = await getWalletByMobile(env, s);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Movements (audit / quick panel)
  router.add("GET", "/api/wallets/:id/movements", async (req, env, _ctx, { id }) => {
    const u = new URL(req.url);
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(Number(u.searchParams.get("offset") || 0), 0);
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    const items = await listMovements(env, String(id), limit, offset);
    return json({ ok: true, wallet: { id: w.id, name: w.name, balance_cents: w.balance_cents, version: w.version }, items, limit, offset });
  });

  // Summary
  router.add("GET", "/api/wallets/:id/summary", async (_req, env, _ctx, { id }) => {
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    const items = await listMovements(env, String(id), 10, 0);
    return json({ ok: true, wallet: w, recent: items });
  });

  // Create/register wallet
  async function handleCreate(req, env) {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const name = String(b?.name || "").trim();
    const mobile = normPhone(b?.mobile || b?.msisdn || "");
    if (!name) return bad(400, "name_required");

    let id = shortId();
    for (let i = 0; i < 3; i++) {
      const exists = await getWalletById(env, id);
      if (!exists) break;
      id = shortId();
    }

    const t = nowSec();
    await env.DB.prepare(
      `INSERT INTO wallets (id, name, mobile, created_at, status, version, balance_cents)
       VALUES (?1, ?2, ?3, ?4, 'active', 0, 0)`
    ).bind(id, name, mobile || null, t).run();

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/w/${encodeURIComponent(id)}` : `/w/${encodeURIComponent(id)}`;

    await sendTemplateOnly(env, {
      to: mobile,
      settingKey: "WA_TMP_BAR_WELCOME",
      variables: [ name || "", link ]
    });

    const w = await getWalletById(env, id);
    return json({ ok: true, wallet: w });
  }
  router.add("POST", "/api/wallets/create", handleCreate);
  router.add("POST", "/api/wallets/register", handleCreate);

  // Top-up
  router.add("POST", "/api/wallets/topup", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const id = String(b?.wallet_id || b?.walletId || "");
    const amount = Number(b?.amount_cents || 0) | 0;
    const method = String(b?.method || "cash");
    if (!id || !amount) return bad(400, "wallet_and_amount_required");

    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    if (String(w.status) !== "active") return bad(409, "wallet_not_active");

    const newBal = Number(w.balance_cents || 0) + amount;
    await env.DB.prepare(
      `UPDATE wallets SET balance_cents=?1, version=version+1 WHERE id=?2`
    ).bind(newBal, id).run();

    try {
      await env.DB.prepare(
        `INSERT INTO wallet_movements (wallet_id, kind, amount_cents, meta_json, created_at)
         VALUES (?1,'topup',?2,?3,?4)`
      ).bind(id, amount, JSON.stringify({ method }), nowSec()).run();
    } catch {}

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/w/${encodeURIComponent(id)}` : `/w/${encodeURIComponent(id)}`;

    await sendTemplateOnly(env, {
      to: w.mobile,
      settingKey: "WA_TMP_BAR_TOPUP",
      variables: [ rands(amount), link, rands(newBal) ]
    });

    const w2 = await getWalletById(env, id);
    return json({ ok: true, wallet: w2 });
  });

  // Deduct (purchase)
  router.add("POST", "/api/wallets/:id/deduct", async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const items = Array.isArray(b?.items) ? b.items : [];
    const expected = Number(b?.expected_version ?? -1);

    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    if (expected >= 0 && Number(w.version) !== expected) return bad(409, "version_conflict");

    const total = items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.unit_price_cents || 0)), 0);
    if (total <= 0) return bad(400, "empty_cart");

    const newBal = Number(w.balance_cents || 0) - total;
    if (newBal < 0) return bad(400, "insufficient_balance");

    await env.DB.prepare(
      `UPDATE wallets SET balance_cents=?1, version=version+1 WHERE id=?2`
    ).bind(newBal, id).run();

    try {
      const t = nowSec();
      const txId = shortId(8);
      await env.DB.prepare(
        `INSERT INTO wallet_movements (wallet_id, kind, amount_cents, meta_json, created_at, ref)
         VALUES (?1,'purchase',?2,?3,?4,?5)`
      ).bind(id, -total, JSON.stringify({ items }), t, txId).run();
    } catch {}

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/w/${encodeURIComponent(id)}` : `/w/${encodeURIComponent(id)}`;

    await sendTemplateOnly(env, {
      to: w.mobile,
      settingKey: "WA_TMP_BAR_PURCHASE",
      variables: [ rands(total), rands(newBal) ]
    });

    const lim = Number((await getSetting(env, "BAR_LOW_BALANCE_CENTS")) || 5000);
    if (newBal >= 0 && newBal < lim) {
      await sendTemplateOnly(env, {
        to: w.mobile,
        settingKey: "WA_TMP_BAR_LOW_BALANCE",
        variables: []
      });
    }

    const newVersion = Number(w.version || 0) + 1;
    return json({ ok: true, wallet_id: id, new_balance_cents: newBal, version: newVersion });
  });

  /* --------------------------- NEW: Wallet Transfer --------------------------- */
  router.add("POST", "/api/wallets/transfer", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const donor = String(b?.from || "").trim();
    const recipient = String(b?.to || "").trim();
    if (!donor || !recipient) return bad(400, "missing_wallets");
    if (donor === recipient) return bad(400, "same_wallet");

    const dw = await getWalletById(env, donor);
    const rw = await getWalletById(env, recipient);
    if (!dw || !rw) return bad(404, "wallet_not_found");

    const amount = Number(dw.balance_cents || 0);
    if (amount <= 0) return bad(400, "no_balance");

    const newDonorBal = 0;
    const newRecBal = Number(rw.balance_cents || 0) + amount;
    const t = nowSec();
    const id = shortId(10);

    await env.DB.batch([
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1,version=version+1 WHERE id=?2`).bind(newDonorBal, donor),
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1,version=version+1 WHERE id=?2`).bind(newRecBal, recipient),
      env.DB.prepare(`INSERT INTO transfers (id,donor_wallet_id,recipient_wallet_id,amount_cents,created_at) VALUES (?1,?2,?3,?4,?5)`).bind(id, donor, recipient, amount, t)
    ]);

    // Optional: WhatsApp notifications
    await sendTemplateOnly(env, {
      to: dw.mobile,
      settingKey: "WA_TMP_BAR_TRANSFER_OUT",
      variables: [ rands(amount) ]
    });
    await sendTemplateOnly(env, {
      to: rw.mobile,
      settingKey: "WA_TMP_BAR_TRANSFER_IN",
      variables: [ rands(amount) ]
    });

    return json({ ok: true, id, amount_cents: amount, donor, recipient });
  });
}
