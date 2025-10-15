// /src/routes/wallet.js
import { json, bad } from "../utils/http.js";

/** ----------------------- helpers ----------------------- **/
function randsToCents(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function nowSec() { return Math.floor(Date.now()/1000); }

async function ensureLedgerTables(db) {
  await db.batch?.([
    db.prepare(`CREATE TABLE IF NOT EXISTS pos_wallet_topups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL,             -- 'cash' | 'card'
      session_id INTEGER,
      note TEXT,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pos_wallet_spends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      session_id INTEGER,
      note TEXT,
      created_at INTEGER NOT NULL
    )`)
  ]) ?? null;
}

/** ----------------------- routes ------------------------ **/
export function mountWallet(router) {

  // Create a wallet (name required)
  router.add("POST", "/api/wallets/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const name = String(b?.name || "").trim();
    if (!name) return bad(400, "name_required");

    try {
      const ins = await env.DB.prepare(
        `INSERT INTO wallets (name, balance_cents) VALUES (?1, 0)`
      ).bind(name).run();

      const id = Number(ins.lastRowId ?? ins.meta?.last_row_id ?? 0);
      return json({ ok: true, wallet: { id, name, balance_cents: 0 } });
    } catch (e) {
      return bad(500, "create_failed");
    }
  });

  // Get wallet by id
  router.add("GET", "/api/wallets/:id", async (_req, env, _ctx, { id }) => {
    const w = await env.DB.prepare(
      `SELECT id, name, balance_cents FROM wallets WHERE id=?1 LIMIT 1`
    ).bind(Number(id||0)).first();
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Top-up a wallet
  // Body: { wallet_id, amount_cents? , amount_rands?, method: 'cash'|'card', session_id?, note? }
  router.add("POST", "/api/wallets/topup", async (req, env) => {
    await ensureLedgerTables(env.DB);

    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const wallet_id = Number(b?.wallet_id || 0);
    const method = (String(b?.method || "cash").toLowerCase() === "card") ? "card" : "cash";
    const amount_cents = Number.isFinite(+b?.amount_cents)
      ? Math.max(0, Number(b.amount_cents))
      : randsToCents(b?.amount_rands);
    const session_id = b?.session_id ? Number(b.session_id) : null;
    const note = String(b?.note || "").trim() || null;

    if (!wallet_id || !amount_cents) return bad(400, "wallet_or_amount_missing");

    const w = await env.DB.prepare(
      `SELECT id, balance_cents FROM wallets WHERE id=?1 LIMIT 1`
    ).bind(wallet_id).first();
    if (!w) return bad(404, "wallet_missing");

    const t = nowSec();

    // ledger row
    await env.DB.prepare(
      `INSERT INTO pos_wallet_topups (wallet_id, amount_cents, method, session_id, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(wallet_id, amount_cents, method, session_id, note, t).run();

    // balance
    await env.DB.prepare(
      `UPDATE wallets SET balance_cents = balance_cents + ?1 WHERE id=?2`
    ).bind(amount_cents, wallet_id).run();

    const updated = await env.DB.prepare(
      `SELECT id, name, balance_cents FROM wallets WHERE id=?1 LIMIT 1`
    ).bind(wallet_id).first();

    return json({ ok: true, wallet: updated });
  });

  // Spend from a wallet (for the bar POS; we’ll hook this up next)
  // Body: { wallet_id, amount_cents, session_id?, note? }
  router.add("POST", "/api/wallets/spend", async (req, env) => {
    await ensureLedgerTables(env.DB);

    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const wallet_id = Number(b?.wallet_id || 0);
    const amount_cents = Math.max(0, Number(b?.amount_cents || 0));
    const session_id = b?.session_id ? Number(b.session_id) : null;
    const note = String(b?.note || "").trim() || null;

    if (!wallet_id || !amount_cents) return bad(400, "wallet_or_amount_missing");

    const w = await env.DB.prepare(
      `SELECT id, balance_cents FROM wallets WHERE id=?1 LIMIT 1`
    ).bind(wallet_id).first();
    if (!w) return bad(404, "wallet_missing");

    if (Number(w.balance_cents) < amount_cents) {
      return bad(409, "insufficient_funds");
    }

    const t = nowSec();

    await env.DB.prepare(
      `INSERT INTO pos_wallet_spends (wallet_id, amount_cents, session_id, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(wallet_id, amount_cents, session_id, note, t).run();

    await env.DB.prepare(
      `UPDATE wallets SET balance_cents = balance_cents - ?1 WHERE id=?2`
    ).bind(amount_cents, wallet_id).run();

    const updated = await env.DB.prepare(
      `SELECT id, name, balance_cents FROM wallets WHERE id=?1 LIMIT 1`
    ).bind(wallet_id).first();

    return json({ ok: true, wallet: updated });
  });

  // Simple history (last 30)
  router.add("GET", "/api/wallets/:id/history", async (_req, env, _ctx, { id }) => {
    await ensureLedgerTables(env.DB);
    const wid = Number(id||0);
    const topups = await env.DB.prepare(
      `SELECT id, amount_cents, method, session_id, note, created_at
         FROM pos_wallet_topups WHERE wallet_id=?1 ORDER BY id DESC LIMIT 30`
    ).bind(wid).all();
    const spends = await env.DB.prepare(
      `SELECT id, amount_cents, session_id, note, created_at
         FROM pos_wallet_spends WHERE wallet_id=?1 ORDER BY id DESC LIMIT 30`
    ).bind(wid).all();
    return json({ ok:true, topups: topups?.results || [], spends: spends?.results || [] });
  });
}
