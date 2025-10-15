// /src/routes/wallet.js
import { json, bad } from "../utils/http.js";

/* ---------------- helpers ---------------- */

function nowSec() { return Math.floor(Date.now() / 1000); }

function normPhone(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}

// 7-char wallet id like the examples you already have (e.g. W2D2VHK)
function genWalletId() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 7; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

async function uniqueWalletId(env) {
  for (let i = 0; i < 6; i++) {
    const id = genWalletId();
    const row = await env.DB.prepare(
      "SELECT 1 FROM wallets WHERE id=?1 LIMIT 1"
    ).bind(id).first();
    if (!row) return id;
  }
  // last-resort fallback (extremely unlikely)
  return genWalletId() + "-" + genWalletId().slice(0, 2);
}

async function getWallet(env, id) {
  return await env.DB.prepare(
    `SELECT id, attendee_id, name, mobile, created_at, status, version, balance_cents
       FROM wallets WHERE id=?1 LIMIT 1`
  ).bind(String(id)).first();
}

/* -------------- routes -------------- */

export function mountWallet(router) {
  // Create/register wallet (both paths supported)
  router.add("POST", "/api/wallets/create", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const name = String(b?.name || "").trim();
    const mobile = normPhone(b?.phone || b?.mobile || "");

    if (!name || !mobile) return bad(400, "missing_name_or_phone");

    try {
      const id = await uniqueWalletId(env);
      const ts = nowSec();
      await env.DB.prepare(
        `INSERT INTO wallets (id, attendee_id, name, mobile, created_at, status, version, balance_cents)
         VALUES (?1, NULL, ?2, ?3, ?4, 'active', 0, 0)`
      ).bind(id, name, mobile, ts).run();

      const wallet = await getWallet(env, id);
      return json({ ok: true, wallet }, 201);
    } catch (e) {
      return bad(500, "create_failed");
    }
  });

  // Backwards-compat alias
  router.add("POST", "/api/wallets/register", async (req, env) => {
    // simply forward to /create handler logic
    const b = await req.json().catch(() => ({}));
    const name = String(b?.name || "").trim();
    const mobile = normPhone(b?.phone || b?.mobile || "");
    if (!name || !mobile) return bad(400, "missing_name_or_phone");

    try {
      const id = await uniqueWalletId(env);
      const ts = nowSec();
      await env.DB.prepare(
        `INSERT INTO wallets (id, attendee_id, name, mobile, created_at, status, version, balance_cents)
         VALUES (?1, NULL, ?2, ?3, ?4, 'active', 0, 0)`
      ).bind(id, name, mobile, ts).run();

      const wallet = await getWallet(env, id);
      return json({ ok: true, wallet }, 201);
    } catch {
      return bad(500, "register_failed");
    }
  });

  // Read wallet
  router.add("GET", "/api/wallets/:id", async (_req, env, _ctx, { id }) => {
    const w = await getWallet(env, id);
    if (!w) return bad(404, "not_found");
    // keep the shape your UI expects
    return json({ ok: true, wallet: w });
  });

  // Top-up (cash or card)
  // Body: { wallet_id, amount_cents, method: 'cash'|'card' }
  router.add("POST", "/api/wallets/topup", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const id = String(b?.wallet_id || "").trim();
    const cents = Number(b?.amount_cents || 0) | 0;
    const method = (String(b?.method || "cash").toLowerCase() === "card") ? "card" : "cash";

    if (!id || cents <= 0) return bad(400, "invalid_input");

    const w = await getWallet(env, id);
    if (!w) return bad(404, "wallet_not_found");
    if (String(w.status || "") !== "active") return bad(409, "wallet_inactive");

    // optimistic update using version
    const newBal = Number(w.balance_cents || 0) + cents;
    const res = await env.DB.prepare(
      `UPDATE wallets
          SET balance_cents = ?1,
              version       = version + 1
        WHERE id = ?2 AND version = ?3 AND status = 'active'`
    ).bind(newBal, id, Number(w.version || 0)).run();

    // if no row updated → version changed; reload and retry once
    if ((res.changes || res.meta?.changes || 0) === 0) {
      const cur = await getWallet(env, id);
      if (!cur) return bad(404, "wallet_not_found");
      if (String(cur.status || "") !== "active") return bad(409, "wallet_inactive");
      const newBal2 = Number(cur.balance_cents || 0) + cents;
      const res2 = await env.DB.prepare(
        `UPDATE wallets
            SET balance_cents = ?1,
                version       = version + 1
          WHERE id = ?2 AND version = ?3 AND status = 'active'`
      ).bind(newBal2, id, Number(cur.version || 0)).run();

      if ((res2.changes || res2.meta?.changes || 0) === 0) {
        return bad(409, "version_conflict");
      }
    }

    const wallet = await getWallet(env, id);
    // (Optional: write a TX log table if you have one)
    return json({ ok: true, wallet, method });
  });

  // Deduct at the bar with optimistic concurrency
  // Path: /api/wallets/:id/deduct
  // Body: { items:[{id,name,qty,unit_price_cents}], expected_version, bartender_id?, device_id? }
  router.add("POST", "/api/wallets/:id/deduct", async (req, env, _ctx, { id }) => {
    let b; try { b = await req.json(); } catch { return bad(400, "bad_json"); }
    const items = Array.isArray(b?.items) ? b.items : [];
    const expectedVersion = Number(b?.expected_version ?? -1);

    if (!items.length) return bad(400, "no_items");

    const w = await getWallet(env, id);
    if (!w) return bad(404, "wallet_not_found");
    if (String(w.status || "") !== "active") return bad(409, "wallet_inactive");

    // compute total
    let total = 0;
    for (const it of items) {
      const qty = Math.max(0, Number(it?.qty || 0));
      const unit = Math.max(0, Number(it?.unit_price_cents || 0));
      total += qty * unit;
    }
    if (total <= 0) return bad(400, "invalid_total");

    // version check
    const baseVersion = (expectedVersion >= 0) ? expectedVersion : Number(w.version || 0);
    const currentBal = (expectedVersion >= 0 && expectedVersion !== w.version)
      ? (await getWallet(env, id))?.balance_cents ?? w.balance_cents
      : w.balance_cents;

    if (Number(currentBal) < total) return bad(402, "insufficient_funds");

    const newBal = Number(currentBal) - total;
    const res = await env.DB.prepare(
      `UPDATE wallets
          SET balance_cents=?1, version=version+1
        WHERE id=?2 AND version=?3 AND status='active'`
    ).bind(newBal, id, baseVersion).run();

    if ((res.changes || res.meta?.changes || 0) === 0) {
      return bad(409, "version_conflict");
    }

    const after = await getWallet(env, id);
    return json({
      ok: true,
      new_balance_cents: Number(after.balance_cents || 0),
      version: Number(after.version || 0)
    });
  });
}
