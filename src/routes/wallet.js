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
  // site_settings style: "name:lang"
  if (!sel) return { name: fallbackName, lang: fallbackLang };
  const [n, l] = String(sel).split(":");
  return {
    name: (n || fallbackName || "").trim(),
    lang: (l || fallbackLang || "af").trim()
  };
}

async function waSvc() {
  try { return await import("../services/whatsapp.js"); } catch { return null; }
}

// Best-effort sender: tries template first (multiple signatures), then session text.
async function sendBarWhatsApp(env, {
  to,                                  // msisdn (E.164)
  tplKey,                              // site_settings key (e.g. WA_TMP_BAR_WELCOME)
  fallbackName,                        // e.g. "bar_welcome"
  variables = {},                      // map for template or text
  fallbackText                         // plain text if templates not configured
}) {
  const msisdn = normPhone(to);
  if (!msisdn) return;

  const svc = await waSvc();
  if (!svc) return;

  const sel = await getSetting(env, tplKey);
  const { name, lang } = parseTplSel(sel, fallbackName, "af");

  try {
    if (name && svc.sendWhatsAppTemplate) {
      // Signature variant A: (env, to, body, lang, name)
      try {
        await svc.sendWhatsAppTemplate(env, msisdn, variables, lang, name);
        return;
      } catch {}
      // Signature variant B: (env, {to, name, language, variables})
      try {
        await svc.sendWhatsAppTemplate(env, {
          to: msisdn, name, language: lang, variables
        });
        return;
      } catch {}
    }
    if (fallbackText && svc.sendWhatsAppTextIfSession) {
      await svc.sendWhatsAppTextIfSession(env, msisdn, fallbackText);
    }
  } catch {
    /* non-blocking */
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

/* Quick list of movements for a wallet (paged) */
async function listMovements(env, walletId, limit = 50, offset = 0) {
  // prefer new wallet_movements; if table absent, return empty list gracefully
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

/* ----------------------------- routes ------------------------------ */
export function mountWallet(router) {

  // Get wallet by id
  router.add("GET", "/api/wallets/:id", async (_req, env, _ctx, { id }) => {
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Get wallet by mobile digits (new)
  router.add("GET", "/api/wallets/by-mobile/:num", async (_req, env, _ctx, { num }) => {
    const s = String(num || "").replace(/\D+/g, "");
    if (!s) return bad(400, "bad_mobile");
    const w = await getWalletByMobile(env, s);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Movements (for audit / quick panel)
  router.add("GET", "/api/wallets/:id/movements", async (req, env, _ctx, { id }) => {
    const u = new URL(req.url);
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit") || 50), 1), 200);
    const offset = Math.max(Number(u.searchParams.get("offset") || 0), 0);
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    const items = await listMovements(env, String(id), limit, offset);
    return json({ ok: true, wallet: { id: w.id, name: w.name, balance_cents: w.balance_cents, version: w.version }, items, limit, offset });
  });

  // Summary (balance + last 10 movements)
  router.add("GET", "/api/wallets/:id/summary", async (_req, env, _ctx, { id }) => {
    const w = await getWalletById(env, id);
    if (!w) return bad(404, "not_found");
    const items = await listMovements(env, String(id), 10, 0);
    return json({ ok: true, wallet: w, recent: items });
  });

  // Create/register wallet (accepts either endpoint)
  async function handleCreate(req, env) {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const name = String(b?.name || "").trim();
    const mobile = normPhone(b?.mobile || b?.msisdn || "");

    if (!name) return bad(400, "name_required");

    // create unique id
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

    // WhatsApp: bar_welcome
    await sendBarWhatsApp(env, {
      to: mobile,
      tplKey: "WA_TMP_BAR_WELCOME",
      fallbackName: "bar_welcome",
      variables: { name, link },
      fallbackText:
        `Kroeg Beursie\n` +
        `Hi ${name || "vriend"},\n\n` +
        `Jou kroeg beursie is suksesvol geskep.\n\n` +
        `${link}\n\n` +
        `Maak hierdie skakel oop en wys dit by die kroeg voor jy jou bestelling plaas.\n` +
        `As jy wil kyk wat jou balans is kan jy ook hierdie skakel gebruik 🍻🍹🥳\n` +
        `Villiersdorp Landbou Skou`
    });

    const w = await getWalletById(env, id);
    return json({ ok: true, wallet: w });
  }

  router.add("POST", "/api/wallets/create", handleCreate);
  router.add("POST", "/api/wallets/register", handleCreate); // legacy alias

  // Top-up (original)
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

    // Optional: log movement
    try {
      await env.DB.prepare(
        `INSERT INTO wallet_movements (wallet_id, kind, amount_cents, meta_json, created_at)
         VALUES (?1,'topup',?2,?3,?4)`
      ).bind(id, amount, JSON.stringify({ method }), nowSec()).run();
    } catch { /* ignore if table absent */ }

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const link = base ? `${base}/w/${encodeURIComponent(id)}` : `/w/${encodeURIComponent(id)}`;

    // WhatsApp: bar_topup
    await sendBarWhatsApp(env, {
      to: w.mobile,
      tplKey: "WA_TMP_BAR_TOPUP",
      fallbackName: "bar_topup",
      variables: {
        amount: rands(amount),
        link,
        new_balance: rands(newBal)
      },
      fallbackText:
        `Kroeg Beursie Aanvulling\n` +
        `Jou kroeg beursie is suksesvol aangevul met ${rands(amount)} - Baie Dankie!\n\n` +
        `${link}\n\n` +
        `Die balans in jou beursie is nou ${rands(newBal)}\n` +
        `Maak hierdie skakel oop en wys dit by die kroeg voor jy jou bestelling plaas.\n` +
        `As jy wil kyk wat jou balans is kan jy ook hierdie skakel gebruik 🍻🍹🥳\n` +
        `Villiersdorp Landbou Skou`
    });

    const w2 = await getWalletById(env, id);
    return json({ ok: true, wallet: w2 });
  });

  // Top-up (alias with URL param: /api/wallets/:id/topup)
  router.add("POST", "/api/wallets/:id/topup", async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { b = {}; }
    const amount = Number(b?.amount_cents || b?.amount || 0) | 0;
    const method = String(b?.method || "cash");
    if (!id || !amount) return bad(400, "wallet_and_amount_required");

    // Reuse existing handler logic
    const body = JSON.stringify({ wallet_id: id, amount_cents: amount, method });
    const proxied = new Request("/api/wallets/topup", { method: "POST", body, headers: { "content-type": "application/json" }});
    return await router.handle(proxied, env);
  });

  // Deduct at bar (original)
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

    // Log purchase line-items if table exists
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

    // WhatsApp: purchase
    await sendBarWhatsApp(env, {
      to: w.mobile,
      tplKey: "WA_TMP_BAR_PURCHASE",
      fallbackName: "bar_purchase",
      variables: { total: rands(total), new_balance: rands(newBal), link },
      fallbackText:
        `Kroeg Bestelling\n` +
        `Dankie vir jou ondersteuning\n\n` +
        `Die totale aankope vir die rondte was ${rands(total)}\n` +
        `Die huidige balans in jou kroeg-beursie is tans ${rands(newBal)}\n\n` +
        `Skakel: ${link}\n` +
        `Onthou om betyds aan te vul vir die volgende rondte.🍺🥂\n` +
        `Villiersdorp Landbou Skou`
    });

    // WhatsApp: low balance if below threshold
    const lim = Number((await getSetting(env, "BAR_LOW_BALANCE_CENTS")) || 5000); // default R50
    if (newBal >= 0 && newBal < lim) {
      await sendBarWhatsApp(env, {
        to: w.mobile,
        tplKey: "WA_TMP_BAR_LOW_BALANCE",
        fallbackName: "bar_low_balance",
        variables: { balance: rands(newBal) },
        fallbackText:
          `Jou Kroeg Beursie Is Laag\n` +
          `Hi ${w.name || "vriend"},\n\n` +
          `Jou kroeg beursie is amper leeg.\n` +
          `Onthou om dit te gaan aanvul voor jou volgende rondte 😉\n` +
          `Villiersdorp Landbou Skou`
      });
    }

    // respond
    const newVersion = Number(w.version || 0) + 1;
    return json({
      ok: true,
      wallet_id: id,
      new_balance_cents: newBal,
      version: newVersion
    });
  });

  // Purchase (alias: /api/wallets/:id/purchase)
  router.add("POST", "/api/wallets/:id/purchase", async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { b = {}; }
    const items = Array.isArray(b?.items) ? b.items : [];
    const expected_version = Number(b?.expected_version ?? -1);
    const body = JSON.stringify({ items, expected_version });
    const proxied = new Request(`/api/wallets/${encodeURIComponent(id)}/deduct`, { method: "POST", body, headers: { "content-type": "application/json" }});
    return await router.handle(proxied, env);
  });
}
