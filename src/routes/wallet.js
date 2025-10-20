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
function rands(c) { return 'R' + ((Number(c) || 0) / 100).toFixed(2); }
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

function parseTplSel(sel, fallbackName, fallbackLang = "af") {
  if (!sel) return { name: fallbackName, lang: fallbackLang };
  const [n, l] = String(sel).split(":");
  return { name: (n || fallbackName || "").trim(), lang: (l || fallbackLang || "af").trim() };
}

async function waSvc() {
  try { return await import("../services/whatsapp.js"); } catch { return null; }
}

/* ----------------------------- logging ----------------------------- */
async function waLog(env, { to, type, payload, status }) {
  try {
    await env.DB.prepare(
      `INSERT INTO wa_logs (to_msisdn, type, payload, status, created_at)
       VALUES (?1,?2,?3,?4,?5)`
    ).bind(
      String(to || ""),
      String(type || "wallet_wa"),
      JSON.stringify(payload || {}),
      String(status || "info"),
      Math.floor(Date.now()/1000)
    ).run();
  } catch {}
}

/* ----------------------------- WA sender ----------------------------- */
async function sendBarWhatsApp(env, {
  to, tplKey, fallbackName, variables = {}, fallbackText
}) {
  const msisdn = normPhone(to);
  if (!msisdn) { await waLog(env, { to, type: tplKey, payload:{ variables, note:"no_msisdn" }, status:"skip" }); return; }

  const svc = await waSvc();
  if (!svc) { await waLog(env, { to: msisdn, type: tplKey, payload:{ variables, note:"no_wa_service" }, status:"error" }); return; }

  const sel = await getSetting(env, tplKey);
  const { name, lang } = parseTplSel(sel, fallbackName, "af");

  try {
    if (name && svc.sendWhatsAppTemplate) {
      try {
        await svc.sendWhatsAppTemplate(env, msisdn, variables, lang, name);
        await waLog(env, { to: msisdn, type: tplKey, payload:{ name, lang, variables }, status:"sent_template" });
        return;
      } catch (e1) {
        try {
          await svc.sendWhatsAppTemplate(env, { to: msisdn, name, language: lang, variables });
          await waLog(env, { to: msisdn, type: tplKey, payload:{ name, lang, variables }, status:"sent_template_obj" });
          return;
        } catch (e2) {
          await waLog(env, { to: msisdn, type: tplKey, payload:{ e1:String(e1), e2:String(e2) }, status:"template_fail" });
        }
      }
    }
    if (fallbackText && svc.sendWhatsAppTextIfSession) {
      await svc.sendWhatsAppTextIfSession(env, msisdn, fallbackText);
      await waLog(env, { to: msisdn, type: tplKey, payload:{ text:fallbackText }, status:"sent_text" });
    }
  } catch (e) {
    await waLog(env, { to: msisdn, type: tplKey, payload:{ e:String(e) }, status:"send_error" });
  }
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
  } catch { return []; }
}

/* ----------------------------- routes ------------------------------ */
export function mountWallet(router) {

  // GET wallet by id
  router.add("GET", "/api/wallets/:id", async (_req, env, _ctx, { id }) => {
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // GET wallet by mobile
  router.add("GET", "/api/wallets/by-mobile/:num", async (_req, env, _ctx, { num }) => {
    const s = String(num || "").replace(/\D+/g, "");
    if (!s) return bad(400, "bad_mobile");
    const w = await getWalletByMobile(env, s);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Movements
  router.add("GET", "/api/wallets/:id/movements", async (req, env, _ctx, { id }) => {
    const u = new URL(req.url);
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(Number(u.searchParams.get("offset") || 0), 0);
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    const items = await listMovements(env, String(id), limit, offset);
    return json({ ok: true, wallet: { id: w.id, name: w.name, balance_cents: w.balance_cents, version: w.version }, items, limit, offset });
  });

  // Create wallet
  async function handleCreate(req, env) {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const name = String(b?.name || "").trim();
    const mobile = normPhone(b?.mobile || b?.msisdn || "");
    if (!name) return bad(400, "name_required");

    // unique id
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

    // WA: Welcome
    await sendBarWhatsApp(env, {
      to: mobile,
      tplKey: "WA_TMP_BAR_WELCOME",
      fallbackName: "bar_welcome",
      variables: { name, link },
      fallbackText:
        `Kroeg Beursie\nHi ${name || "vriend"},\n\nJou kroeg beursie is suksesvol geskep.\n${link}\n\nVilliersdorp Landbou Skou`
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

    // Log + optional notify
    try {
      const r = await env.DB.prepare(
        `INSERT INTO wallet_movements (wallet_id, kind, amount_cents, meta_json, created_at)
         VALUES (?1,'topup',?2,?3,?4)`
      ).bind(id, amount, JSON.stringify({ method }), nowSec()).run();
      const mvId = r?.meta?.last_row_id || null;
      if (mvId) {
        const mod = await import("../services/wa_bar_notifications.js");
        if (mod?.handleWalletMovement) await mod.handleWalletMovement(env, mvId);
      }
    } catch {}

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/w/${encodeURIComponent(id)}` : `/w/${encodeURIComponent(id)}`;

    await sendBarWhatsApp(env, {
      to: w.mobile,
      tplKey: "WA_TMP_BAR_TOPUP",
      fallbackName: "bar_topup",
      variables: { amount: rands(amount), link, new_balance: rands(newBal) },
      fallbackText:
        `Kroeg Beursie Aanvulling\nJou kroeg beursie is aangevul met ${rands(amount)}.\n${link}\nBalans: ${rands(newBal)}\nVilliersdorp Landbou Skou`
    });

    const w2 = await getWalletById(env, id);
    return json({ ok: true, wallet: w2 });
  });

  // Deduct / purchase
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

    await env.DB.prepare(
      `UPDATE wallets SET balance_cents=?1, version=version+1 WHERE id=?2`
    ).bind(newBal, id).run();

    // Log + optional notify
    try {
      const t = nowSec();
      const txId = shortId(8);
      const r = await env.DB.prepare(
        `INSERT INTO wallet_movements (wallet_id, kind, amount_cents, meta_json, created_at, ref)
         VALUES (?1,'purchase',?2,?3,?4,?5)`
      ).bind(id, -total, JSON.stringify({ items }), t, txId).run();
      const mvId = r?.meta?.last_row_id || null;
      if (mvId) {
        const mod = await import("../services/wa_bar_notifications.js");
        if (mod?.handleWalletMovement) await mod.handleWalletMovement(env, mvId);
      }
    } catch {}

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/w/${encodeURIComponent(id)}` : `/w/${encodeURIComponent(id)}`;

    // WA: purchase
    await sendBarWhatsApp(env, {
      to: w.mobile,
      tplKey: "WA_TMP_BAR_PURCHASE",
      fallbackName: "bar_purchase",
      variables: { total: rands(total), new_balance: rands(newBal), link },
      fallbackText:
        `Kroeg Bestelling\nTotale aankope: ${rands(total)}\nBalans: ${rands(newBal)}\n${link}\nVilliersdorp Landbou Skou`
    });

    // WA: low balance (preferred key only)
    const lim = Number((await getSetting(env, "BAR_LOW_BALANCE_CENTS")) || 5000);
    if (newBal >= 0 && newBal < lim) {
      await sendBarWhatsApp(env, {
        to: w.mobile,
        tplKey: "WA_TMP_BAR_LOW_BALANCE",
        fallbackName: "bar_low_balance",
        variables: { balance: rands(newBal) },
        fallbackText:
          `Jou Kroeg Beursie Is Laag\nHi ${w.name || "vriend"},\nJou kroeg beursie is amper leeg.\nOnthou om dit aan te vul 😉\nVilliersdorp Landbou Skou`
      });
    }

    const newVersion = Number(w.version || 0) + 1;
    return json({ ok: true, wallet_id: id, new_balance_cents: newBal, version: newVersion });
  });
}
