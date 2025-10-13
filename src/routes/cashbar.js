// /src/routes/cashbar.js
import { nanoid } from '../utils/id.js';
import { json, bad } from '../utils/http.js';

// ---- WhatsApp helpers (use your in-Worker service) ----
async function waSvc() {
  try { return await import('../services/whatsapp.js'); }
  catch { return null; }
}
async function getSetting(env, key) {
  try {
    const row = await env.DB
      .prepare('SELECT value FROM site_settings WHERE key=?1 LIMIT 1')
      .bind(key).first();
    return row ? row.value : null;
  } catch { return null; }
}
function normMSISDN(msisdn) {
  const s = String(msisdn || '').replace(/\D+/g, '');
  if (!s) return '';
  if (s.startsWith('27') && s.length >= 11) return s;
  if (s.length === 10 && s.startsWith('0')) return '27' + s.slice(1);
  return s;
}
/** Send WA template if site_settings[key] = "name:lang"; else fallback text (if session). */
async function sendWA(env, to, templateKey, variablesObj = {}, fallbackText = '') {
  const svc = await waSvc();
  const msisdn = normMSISDN(to);
  if (!svc || !msisdn) return false;

  const sel = (await getSetting(env, templateKey)) || '';
  const [name, lang] = String(sel).includes(':') ? sel.split(':') : [sel, 'af'];

  if (name) {
    try {
      await svc.sendWhatsAppTemplate(env, {
        to: msisdn, name: name.trim(), language: (lang || 'af').trim(), variables: variablesObj
      });
      return true;
    } catch (_) { /* fall through to text */ }
  }
  if (fallbackText) {
    try { await svc.sendWhatsAppTextIfSession(env, msisdn, fallbackText); } catch {}
  }
  return true;
}

// -------------------------------------------------------

export function mountCashbar(router, env) {
  // REGISTER (from ticket QR/order short_code OR manual)
  router.post('/api/wallets/register', async (req) => {
    const { source, ticket_code, name, mobile } = await req.json();

    let attendee = null;
    if (source === 'ticket' && ticket_code) attendee = await lookupAttendee(env, ticket_code);

    const fullName = (attendee?.name || name || '').trim();
    const phone    = (attendee?.mobile || mobile || '').trim();
    if (!fullName || !phone) return bad(400, 'name_or_mobile_missing');

    const wallet_id = shortId();
    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO wallets(id,attendee_id,name,mobile,created_at,status,version,balance_cents)
      VALUES(?1,?2,?3,?4,?5,'active',0,0)
    `).bind(wallet_id, attendee?.id ?? null, fullName, phone, now).run();

    // init Durable Object
    const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
    await stub.fetch('https://do/init', {
      method: 'POST',
      body: JSON.stringify({ wallet_id, balance_cents: 0, version: 0, status: 'active' })
    });

    const wallet_url = `${env.PUBLIC_BASE_URL}/w/${wallet_id}`;

    // WhatsApp welcome
    await sendWA(
      env, phone, 'BAR_TMP_WELCOME',
      { name: first(fullName), wallet_url },
      `Hallo ${first(fullName)}! Jou Skou kroegrekening is gereed: ${wallet_url}`
    );

    return json({ wallet_id, wallet_url, balance_cents: 0 });
  });

  // TOP-UP
  router.post('/api/wallets/:id/topup', async (req, params) => {
    const { amount_cents, source='yoco', ref='', cashier_id='' } = await req.json();
    const wallet_id = params.id;

    if (!(Number.isFinite(amount_cents) || /^\d+$/.test(String(amount_cents)))) {
      return bad(400, 'invalid_amount');
    }

    const w = await getWallet(env, wallet_id);
    if (!w) return bad(404, 'wallet_not_found');

    const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
    const r = await stub.fetch('https://do/topup', {
      method: 'POST', body: JSON.stringify({ amount_cents: Number(amount_cents) })
    });
    if (!r.ok) return r;
    const { balance_cents, version } = await r.json();

    await env.DB.prepare(`
      INSERT INTO topups(id,wallet_id,amount_cents,source,ref,cashier_id,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7)
    `).bind(nanoid(), wallet_id, Number(amount_cents), source, ref, cashier_id, Date.now()).run();

    await env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`)
      .bind(balance_cents, version, wallet_id).run();

    const wallet_url = `${env.PUBLIC_BASE_URL}/w/${wallet_id}`;
    await sendWA(
      env, w.mobile, 'BAR_TMP_TOPUP',
      { amount: cents(amount_cents), balance: cents(balance_cents), wallet_url },
      `Top-up van R${cents(amount_cents)}. Nuwe balans: R${cents(balance_cents)}`
    );

    return json({ new_balance_cents: balance_cents, version });
  });

  // BALANCE
  router.get('/api/wallets/:id', async (_req, params) => {
    const w = await getWallet(env, params.id);
    if (!w) return bad(404, 'wallet_not_found');
    return json({ id:w.id, name:w.name, mobile:w.mobile, balance_cents:w.balance_cents, version:w.version });
  });

  // TRANSFER
  router.post('/api/wallets/transfer', async (req) => {
    const { from, to, amount_cents } = await req.json();
    if (!from || !to || !amount_cents) return bad(400, 'missing_fields');
    if (from === to) return bad(400, 'same_wallet');

    const donor = await getWallet(env, from);
    const rec   = await getWallet(env, to);
    if (!donor || !rec) return bad(404, 'wallet_not_found');

    const sFrom = env.WALLET_DO.get(env.WALLET_DO.idFromName(from));
    let r = await sFrom.fetch('https://do/deduct', {
      method:'POST', body: JSON.stringify({ amount_cents: Number(amount_cents), expected_version: donor.version })
    });
    if (!r.ok) return r;
    const { balance_cents: donor_new, version: donor_ver } = await r.json();

    const sTo = env.WALLET_DO.get(env.WALLET_DO.idFromName(to));
    r = await sTo.fetch('https://do/topup', { method:'POST', body: JSON.stringify({ amount_cents: Number(amount_cents) }) });
    const { balance_cents: rec_new, version: rec_ver } = await r.json();

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`).bind(donor_new, donor_ver, from),
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`).bind(rec_new,   rec_ver,   to),
      env.DB.prepare(`INSERT INTO transfers(id,donor_wallet_id,recipient_wallet_id,amount_cents,created_at)
                      VALUES(?1,?2,?3,?4,?5)`)
        .bind(nanoid(), from, to, Number(amount_cents), now)
    ]);

    await sendWA(env, donor.mobile, 'BAR_TMP_TRANSFER_OUT',
      { amount: cents(amount_cents), to_name: first(rec.name),   balance: cents(donor_new) },
      `Jy het R${cents(amount_cents)} oorgedra na ${first(rec.name)}. Nuwe balans: R${cents(donor_new)}`
    );
    await sendWA(env, rec.mobile,   'BAR_TMP_TRANSFER_IN',
      { amount: cents(amount_cents), from_name: first(donor.name), balance: cents(rec_new) },
      `Jy het R${cents(amount_cents)} ontvang van ${first(donor.name)}. Nuwe balans: R${cents(rec_new)}`
    );

    return json({ from_balance_cents: donor_new, to_balance_cents: rec_new });
  });

  // DEDUCT (bar sale)
  router.post('/api/wallets/:id/deduct', async (req, params) => {
    const wallet_id = params.id;
    const { items=[], expected_version, bartender_id='', device_id='' } = await req.json();
    if (!items.length) return bad(400, 'no_items');

    const w = await getWallet(env, wallet_id);
    if (!w) return bad(404, 'wallet_not_found');

    const total_cents = items.reduce((s,it)=> s + (it.unit_price_cents*it.qty), 0);

    const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
    const r = await stub.fetch('https://do/deduct', {
      method:'POST', body: JSON.stringify({ amount_cents: Number(total_cents), expected_version })
    });
    if (!r.ok) return r;
    const { balance_cents, version } = await r.json();

    await env.DB.batch([
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`)
        .bind(balance_cents, version, wallet_id),
      env.DB.prepare(`INSERT INTO sales(id,wallet_id,items_json,total_cents,bartender_id,device_id,created_at)
                      VALUES(?1,?2,?3,?4,?5,?6,?7)`)
        .bind(nanoid(), wallet_id, JSON.stringify(items), Number(total_cents), bartender_id, device_id, Date.now())
    ]);

    const summary = items.map(i=>`${i.qty}× ${i.name}`).join(', ');
    await sendWA(env, w.mobile, 'BAR_TMP_PURCHASE',
      { items_summary: summary, total: cents(total_cents), balance: cents(balance_cents) },
      `Aankoop: ${summary} – R${cents(total_cents)}. Balans: R${cents(balance_cents)}`
    );
    if (balance_cents < 10000) {
      await sendWA(env, w.mobile, 'BAR_TMP_LOW_BAL', {}, 'Jou kroegbalans is onder R100. Vul gerus weer aan by die kas.');
    }

    return json({ new_balance_cents: balance_cents, version });
  });
}

/* helpers */
async function getWallet(env, id) {
  return await env.DB.prepare(`SELECT * FROM wallets WHERE id=?1 LIMIT 1`).bind(id).first();
}
function shortId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='W'; for(let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}
function first(n){ return (n||'').split(' ')[0]; }
function cents(n){ return (Number(n)/100).toFixed(2); }

/** DIRECT D1 attendee lookup using your tables (tickets.qr OR orders.short_code). */
async function lookupAttendee(env, codeOrQr) {
  // try tickets.qr
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
    // try orders.short_code
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
  return { id: row.attendee_id ?? null, name: row.name || '', mobile: normMSISDN(row.mobile || '') };
}
