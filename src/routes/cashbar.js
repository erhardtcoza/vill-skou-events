// /src/routes/cashbar.js
import { nanoid } from "../utils/id.js";
import { json, bad } from "../utils/http.js";

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */
function shortId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "W";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
function first(s) { return String(s || "").trim().split(/\s+/)[0] || ""; }
function cents(n) { return (Number(n || 0) / 100).toFixed(2); }
function normMSISDN(msisdn) {
  const s = String(msisdn || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("27") && s.length >= 11) return s;
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
async function getSetting(env, key) {
  const row = await env.DB.prepare(
    "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
  ).bind(key).first();
  return row?.value ?? null;
}

/* ------------------------------------------------------------------ */
/* WhatsApp via template mapper                                        */
/* ------------------------------------------------------------------ */
async function sendTpl(env, { msisdn, templateSettingKey, context, data, fallbackText }) {
  let svc;
  try { svc = await import("../services/whatsapp.js"); } catch { svc = null; }
  const ms = normMSISDN(msisdn);
  if (!svc || !ms) return false;

  // resolve template_key (e.g. "bar_purchase:af")
  let template_key = null;
  try {
    const v = await getSetting(env, templateSettingKey);
    template_key = v && String(v).trim() ? String(v).trim() : null;
  } catch {}

  try {
    if (template_key && typeof svc.sendTemplateByKey === "function") {
      await svc.sendTemplateByKey(env, { template_key, context, msisdn: ms, data });
      return true;
    }
    if (template_key && typeof svc.sendTemplateWithMapping === "function") {
      await svc.sendTemplateWithMapping(env, { template_key, context, msisdn: ms, data });
      return true;
    }
    // Fallback: old plain-sender (positional signature)
    if (template_key && typeof svc.sendWhatsAppTemplate === "function") {
      const [name, language = "af"] = template_key.includes(":")
        ? template_key.split(":")
        : [template_key, "af"];
      await svc.sendWhatsAppTemplate(env, ms, "", language.trim(), name.trim(), []);
      return true;
    }
  } catch {
    // fall through to text
  }

  if (fallbackText && typeof svc.sendTextIfSession === "function") {
    try { await svc.sendTextIfSession(env, ms, fallbackText); } catch {}
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* low-balance behaviour                                               */
/* ------------------------------------------------------------------ */
async function lowThresholdCents(env) {
  const v = Number(await getSetting(env, "BAR_LOW_BALANCE_THRESHOLD_CENTS"));
  return Number.isFinite(v) && v > 0 ? v : 8500; // default: R85
}
async function lowWarnCooldownSecs(env) {
  const v = Number(await getSetting(env, "BAR_LOW_BALANCE_COOLDOWN_SECS"));
  return Number.isFinite(v) && v > 0 ? v : 900; // default: 15 minutes
}
async function recentlyWarned(env, wallet_id) {
  const row = await env.DB.prepare(
    "SELECT last_low_warn_at FROM wallets WHERE id=?1 LIMIT 1"
  ).bind(wallet_id).first();
  const last = Number(row?.last_low_warn_at || 0);
  const age = Math.floor(Date.now() / 1000) - last;
  return last > 0 && age < (await lowWarnCooldownSecs(env));
}
async function markWarned(env, wallet_id) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE wallets SET last_low_warn_at=?2 WHERE id=?1"
  ).bind(wallet_id, now).run();
}

/* ------------------------------------------------------------------ */
/* data helpers                                                        */
/* ------------------------------------------------------------------ */
async function getWallet(env, id) {
  return await env.DB.prepare("SELECT * FROM wallets WHERE id=?1 LIMIT 1").bind(id).first();
}

async function lookupAttendee(env, codeOrQr) {
  let row = await env.DB.prepare(
    `SELECT
       t.id AS attendee_id,
       TRIM(COALESCE(NULLIF(TRIM(t.attendee_first || ' ' || t.attendee_last), ''), o.buyer_name)) AS name,
       COALESCE(NULLIF(t.phone,''), o.buyer_phone) AS mobile
     FROM tickets t
     LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.qr = ?1
     LIMIT 1`
  ).bind(codeOrQr).first();

  if (!row) {
    row = await env.DB.prepare(
      `SELECT
         t.id AS attendee_id,
         TRIM(COALESCE(NULLIF(TRIM(t.attendee_first || ' ' || t.attendee_last), ''), o.buyer_name)) AS name,
         COALESCE(NULLIF(t.phone,''), o.buyer_phone) AS mobile
       FROM orders o
       LEFT JOIN tickets t ON t.order_id = o.id
       WHERE o.short_code = ?1
       ORDER BY t.id ASC
       LIMIT 1`
    ).bind(codeOrQr).first();
  }

  if (!row) return null;
  return {
    id: row.attendee_id ?? null,
    name: row.name || "",
    mobile: normMSISDN(row.mobile || "")
  };
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */
export function mountCashbar(router, env) {
  router.post("/api/wallets/register", async (req) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON", 400); }
    const { source, ticket_code, name, mobile } = body;

    let attendee = null;
    if (source === "ticket" && ticket_code) attendee = await lookupAttendee(env, ticket_code);

    const fullName = (attendee?.name || name || "").trim();
    const phone    = (attendee?.mobile || mobile || "").trim();
    if (!fullName || !phone) return bad("name_or_mobile_missing", 400);

    const wallet_id = shortId();
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO wallets (id, attendee_id, name, mobile, created_at, status, version, balance_cents)
       VALUES (?1, ?2, ?3, ?4, ?5, 'active', 0, 0)`
    ).bind(wallet_id, attendee?.id ?? null, fullName, phone, now).run();

    if (env.WALLET_DO) {
      const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
      await stub.fetch("https://do/init", {
        method: "POST",
        body: JSON.stringify({ wallet_id, balance_cents: 0, version: 0, status: "active" })
      }).catch(() => {});
    }

    const wallet_url = `${env.PUBLIC_BASE_URL}/w/${wallet_id}`;

    await sendTpl(env, {
      msisdn: phone,
      templateSettingKey: "WA_TMP_BAR_WELCOME",
      context: "visitor",
      data: { wallets: { id: wallet_id, name: fullName, mobile: phone, balance_cents: 0 } },
      fallbackText: `Hallo ${first(fullName)}! Jou Skou kroegrekening is gereed: ${wallet_url}`
    });

    return json({ wallet_id, wallet_url, balance_cents: 0 });
  });

  router.post("/api/wallets/:id/topup", async (req, params) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON", 400); }
    const { amount_cents, source = "yoco", ref = "", cashier_id = "" } = body;
    const wallet_id = params.id;

    if (!(Number.isFinite(Number(amount_cents)) && Number(amount_cents) > 0)) {
      return bad("invalid_amount", 400);
    }
    const w = await getWallet(env, wallet_id);
    if (!w) return bad("wallet_not_found", 404);

    let balance_cents = w.balance_cents;
    let version = w.version;
    if (env.WALLET_DO) {
      const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
      const r = await stub.fetch("https://do/topup", {
        method: "POST",
        body: JSON.stringify({ amount_cents: Number(amount_cents) })
      });
      if (!r.ok) return r;
      ({ balance_cents, version } = await r.json());
    } else {
      balance_cents = Number(w.balance_cents) + Number(amount_cents);
      version = Number(w.version) + 1;
    }

    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO topups (id, wallet_id, amount_cents, source, ref, cashier_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(nanoid(), wallet_id, Number(amount_cents), source, ref, cashier_id, now).run().catch(() => {});

    const mv_id = nanoid();
    await env.DB.prepare(
      `INSERT INTO wallet_movements (id, wallet_id, kind, ref, amount_cents, created_at)
       VALUES (?1, ?2, 'topup', ?3, ?4, ?5)`
    ).bind(mv_id, wallet_id, ref || source, Number(amount_cents), now).run();

    await env.DB.prepare("UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3")
      .bind(balance_cents, version, wallet_id).run();

    await sendTpl(env, {
      msisdn: w.mobile,
      templateSettingKey: "WA_TMP_BAR_TOPUP",
      context: "visitor",
      data: {
        wallets: { ...w, balance_cents, version },
        wallet_movements: { id: mv_id, wallet_id, kind: "topup", amount_cents: Number(amount_cents) }
      },
      fallbackText: `Top-up van R${cents(amount_cents)}. Nuwe balans: R${cents(balance_cents)}`
    });

    await maybeWarnLowBalance(env, { wallet: { ...w, balance_cents }, msisdn: w.mobile });

    return json({ new_balance_cents: balance_cents, version });
  });

  router.get("/api/wallets/:id", async (_req, params) => {
    const w = await getWallet(env, params.id);
    if (!w) return bad("wallet_not_found", 404);
    return json({
      id: w.id, name: w.name, mobile: w.mobile,
      balance_cents: w.balance_cents, version: w.version
    });
  });

  router.post("/api/wallets/transfer", async (req) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON", 400); }
    const { from, to, amount_cents } = body;
    if (!from || !to || !amount_cents) return bad("missing_fields", 400);
    if (from === to) return bad("same_wallet", 400);

    const donor = await getWallet(env, from);
    const rec   = await getWallet(env, to);
    if (!donor || !rec) return bad("wallet_not_found", 404);

    let donor_new = donor.balance_cents, donor_ver = donor.version;
    if (env.WALLET_DO) {
      const sFrom = env.WALLET_DO.get(env.WALLET_DO.idFromName(from));
      const r = await sFrom.fetch("https://do/deduct", {
        method: "POST",
        body: JSON.stringify({ amount_cents: Number(amount_cents), expected_version: donor.version })
      });
      if (!r.ok) return r;
      ({ balance_cents: donor_new, version: donor_ver } = await r.json());
    } else {
      donor_new = Number(donor.balance_cents) - Number(amount_cents);
      donor_ver = donor.version + 1;
    }

    let rec_new = rec.balance_cents, rec_ver = rec.version;
    if (env.WALLET_DO) {
      const sTo = env.WALLET_DO.get(env.WALLET_DO.idFromName(to));
      const r2 = await sTo.fetch("https://do/topup", {
        method: "POST",
        body: JSON.stringify({ amount_cents: Number(amount_cents) })
      });
      ({ balance_cents: rec_new, version: rec_ver } = await r2.json());
    } else {
      rec_new = Number(rec.balance_cents) + Number(amount_cents);
      rec_ver = rec.version + 1;
    }

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3").bind(donor_new, donor_ver, from),
      env.DB.prepare("UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3").bind(rec_new,   rec_ver,   to),
      env.DB.prepare(`INSERT INTO transfers(id,donor_wallet_id,recipient_wallet_id,amount_cents,created_at)
                      VALUES(?1,?2,?3,?4,?5)`)
        .bind(nanoid(), from, to, Number(amount_cents), now),
      env.DB.prepare(`INSERT INTO wallet_movements(id,wallet_id,kind,ref,amount_cents,created_at)
                      VALUES(?1,?2,'transfer_out',?3,?4,?5)`).bind(nanoid(), from, to, Number(amount_cents), now),
      env.DB.prepare(`INSERT INTO wallet_movements(id,wallet_id,kind,ref,amount_cents,created_at)
                      VALUES(?1,?2,'transfer_in',?3,?4,?5)`).bind(nanoid(), to, from, Number(amount_cents), now)
    ]);

    await sendTpl(env, {
      msisdn: donor.mobile,
      templateSettingKey: "",
      context: "visitor",
      data: {},
      fallbackText: `Jy het R${cents(amount_cents)} oorgedra na ${first(rec.name)}. Nuwe balans: R${cents(donor_new)}`
    });
    await sendTpl(env, {
      msisdn: rec.mobile,
      templateSettingKey: "",
      context: "visitor",
      data: {},
      fallbackText: `Jy het R${cents(amount_cents)} ontvang van ${first(donor.name)}. Nuwe balans: R${cents(rec_new)}`
    });

    await maybeWarnLowBalance(env, { wallet: { ...donor, balance_cents: donor_new }, msisdn: donor.mobile });

    return json({ from_balance_cents: donor_new, to_balance_cents: rec_new });
  });

  router.post("/api/wallets/:id/deduct", async (req, params) => {
    let body; try { body = await req.json(); } catch { return bad("Bad JSON", 400); }
    const { items = [], expected_version, bartender_id = "", device_id = "" } = body;
    const wallet_id = params.id;

    if (!items.length) return bad("no_items", 400);

    const w = await getWallet(env, wallet_id);
    if (!w) return bad("wallet_not_found", 404);

    const total_cents = items.reduce(
      (s, it) => s + (Number(it.unit_price_cents) * Number(it.qty)),
      0
    );

    let balance_cents = w.balance_cents, version = w.version;
    if (env.WALLET_DO) {
      const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
      const r = await stub.fetch("https://do/deduct", {
        method: "POST",
        body: JSON.stringify({ amount_cents: Number(total_cents), expected_version })
      });
      if (!r.ok) return r;
      ({ balance_cents, version } = await r.json());
    } else {
      balance_cents = Number(w.balance_cents) - Number(total_cents);
      version = Number(w.version) + 1;
    }

    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO sales (id, wallet_id, items_json, total_cents, bartender_id, device_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(nanoid(), wallet_id, JSON.stringify(items), Number(total_cents), bartender_id, device_id, now)
     .run().catch(() => {});

    const mv_id = nanoid();
    await env.DB.prepare(
      `INSERT INTO wallet_movements (id, wallet_id, kind, ref, amount_cents, created_at, meta_json)
       VALUES (?1, ?2, 'purchase', ?3, ?4, ?5, ?6)`
    ).bind(mv_id, wallet_id, device_id || bartender_id || "bar", Number(total_cents), now, JSON.stringify({ items }))
     .run();

    await env.DB.prepare("UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3")
      .bind(balance_cents, version, wallet_id).run();

    const summary = items.map(i => `${i.qty}× ${i.name}`).join(", ");
    await sendTpl(env, {
      msisdn: w.mobile,
      templateSettingKey: "WA_TMP_BAR_PURCHASE",
      context: "visitor",
      data: {
        wallets: { ...w, balance_cents, version },
        wallet_movements: { id: mv_id, wallet_id, kind: "purchase", amount_cents: Number(total_cents) }
      },
      fallbackText: `Aankoop: ${summary} – R${cents(total_cents)}. Balans: R${cents(balance_cents)}`
    });

    await maybeWarnLowBalance(env, { wallet: { ...w, balance_cents }, msisdn: w.mobile });

    return json({ new_balance_cents: balance_cents, version });
  });
}

/* ------------------------------------------------------------------ */
/* low-balance check                                                   */
/* ------------------------------------------------------------------ */
async function maybeWarnLowBalance(env, { wallet, msisdn }) {
  const thr = await lowThresholdCents(env);
  if ((wallet.balance_cents || 0) < thr && !(await recentlyWarned(env, wallet.id))) {
    await sendTpl(env, {
      msisdn,
      templateSettingKey: "WA_TMP_BAR_LOW_BALANCE",
      context: "visitor",
      data: { wallets: wallet },
      fallbackText: "Jou kroegbeursie is amper leeg. Vul gerus weer aan 🍻"
    }).catch(() => {});
    await markWarned(env, wallet.id);
  }
}
