// /src/routes/wallet.js
import { json, bad } from "../utils/http.js";

/* Helpers */
const toInt = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

async function fetchWallet(env, id) {
  return await env.DB
    .prepare(`SELECT id, name, balance_cents FROM wallets WHERE id=?1 LIMIT 1`)
    .bind(Number(id || 0))
    .first();
}

async function upsertTxn(env, payload) {
  // Optional audit table: wallet_txns(id, wallet_id, type, amount_cents, method, meta_json, created_at)
  // If table doesn't exist, just ignore.
  try {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO wallet_txns (wallet_id, type, amount_cents, method, meta_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(
      payload.wallet_id,
      payload.type,                     // 'topup' | 'spend'
      payload.amount_cents,
      payload.method || null,           // 'cash' | 'card' | 'pos'
      JSON.stringify(payload.meta || {}),
      now
    ).run();
  } catch (_e) {
    // Table may not exist yet—non-blocking
  }
}

/* Routes */
export function mountWallet(router) {
  // Create (register) a wallet
  const createHandler = async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const name = String(b?.name || "").trim();
    if (!name) return bad(400, "name_required");

    try {
      const ins = await env.DB.prepare(
        `INSERT INTO wallets (name, balance_cents) VALUES (?1, 0)`
      ).bind(name).run();

      const id = Number(ins.lastRowId ?? ins.meta?.last_row_id ?? 0);
      const w = await fetchWallet(env, id);
      if (!w) return bad(500, "create_failed");
      return json({ ok: true, wallet: w });
    } catch (_e) {
      return bad(500, "create_failed");
    }
  };

  router.add("POST", "/api/wallets/create", createHandler);
  router.add("POST", "/api/wallets/register", createHandler); // alias for current UI

  // Get wallet by id
  router.add("GET", "/api/wallets/:id", async (_req, env, _ctx, { id }) => {
    const w = await fetchWallet(env, id);
    if (!w) return bad(404, "not_found");
    return json({ ok: true, wallet: w });
  });

  // Top-up wallet
  router.add("POST", "/api/wallets/topup", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const wallet_id = Number(b?.wallet_id || 0);
    const amount_cents = toInt(b?.amount_cents || 0);
    const method = String(b?.method || "").trim() || null; // 'cash' | 'card'

    if (!wallet_id || amount_cents <= 0) return bad(400, "invalid_amount");

    const w = await fetchWallet(env, wallet_id);
    if (!w) return bad(404, "wallet_not_found");

    try {
      await env.DB.prepare(
        `UPDATE wallets SET balance_cents = balance_cents + ?1 WHERE id=?2`
      ).bind(amount_cents, wallet_id).run();

      const upd = await fetchWallet(env, wallet_id);
      await upsertTxn(env, { wallet_id, type: "topup", amount_cents, method });

      return json({ ok: true, wallet: upd });
    } catch (_e) {
      return bad(500, "topup_failed");
    }
  });

  // Spend from wallet (for bar POS)
  router.add("POST", "/api/wallets/spend", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const wallet_id = Number(b?.wallet_id || 0);
    const amount_cents = toInt(b?.amount_cents || 0);
    const meta = b?.meta || {}; // e.g. { items:[{id,qty,price_cents}], order_id }
    if (!wallet_id || amount_cents <= 0) return bad(400, "invalid_amount");

    const w = await fetchWallet(env, wallet_id);
    if (!w) return bad(404, "wallet_not_found");
    if (Number(w.balance_cents || 0) < amount_cents) return bad(409, "insufficient_funds");

    try {
      await env.DB.prepare(
        `UPDATE wallets SET balance_cents = balance_cents - ?1 WHERE id=?2`
      ).bind(amount_cents, wallet_id).run();

      const upd = await fetchWallet(env, wallet_id);
      await upsertTxn(env, { wallet_id, type: "spend", amount_cents, method: "pos", meta });

      return json({ ok: true, wallet: upd });
    } catch (_e) {
      return bad(500, "spend_failed");
    }
  });
}
