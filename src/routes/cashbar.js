// /src/routes/cashbar.js
import { nanoid } from '../utils/id.js'; // tiny id generator
import { json, bad } from '../utils/http.js'; // your existing helpers

export function mountCashbar(router, env) {
  // REGISTER from ticket or manual
  router.post('/api/wallets/register', async (req) => {
    const { source, ticket_code, name, mobile } = await req.json();

    let attendee = null;
    if (source === 'ticket') {
      // TODO: call your tickets DB/endpoint
      attendee = await lookupAttendee(env, ticket_code); // {id,name,mobile?}
    }
    const fullName = (attendee?.name || name || '').trim();
    const phone = (attendee?.mobile || mobile || '').trim();

    if (!fullName || !phone) return bad(400, 'name_or_mobile_missing');

    const wallet_id = shortId();
    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO wallets(id,attendee_id,name,mobile,created_at,status,version,balance_cents)
      VALUES(?1,?2,?3,?4,?5,'active',0,0)
    `).bind(wallet_id, attendee?.id ?? null, fullName, phone, now).run();

    // Create DO stub with initial state
    const id = env.WALLET_DO.idFromName(wallet_id);
    const stub = env.WALLET_DO.get(id);
    await stub.fetch(new URL('/init', 'https://do').toString(), {
      method: 'POST', body: JSON.stringify({ wallet_id, balance_cents: 0, version: 0, status:'active' })
    });

    const wallet_url = `${env.BASE_URL}/w/${wallet_id}`;

    // WhatsApp welcome
    await sendWA(env, phone, 'bar_welcome', { name: first(fullName), wallet_url });

    return json({ wallet_id, wallet_url, balance_cents: 0 });
  });

  // TOP-UP (after Yoco payment)
  router.post('/api/wallets/:id/topup', async (req, params) => {
    const { amount_cents, source='yoco', ref='', cashier_id='' } = await req.json();
    const wallet_id = params.id;
    const w = await getWallet(env, wallet_id);
    if (!w) return bad(404, 'wallet_not_found');

    // DO atomic increment
    const stub = env.WALLET_DO.get(env.WALLET_DO.idFromName(wallet_id));
    const r = await stub.fetch(new URL('/topup', 'https://do').toString(), {
      method: 'POST', body: JSON.stringify({ amount_cents })
    });
    if (!r.ok) return r;
    const { balance_cents, version } = await r.json();

    // persist topup + version
    await env.DB.prepare(`
      INSERT INTO topups(id,wallet_id,amount_cents,source,ref,cashier_id,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7)
    `).bind(nanoid(), wallet_id, amount_cents, source, ref, cashier_id, Date.now()).run();

    await env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`)
      .bind(balance_cents, version, wallet_id).run();

    // Notify
    await sendWA(env, w.mobile, 'bar_topup', {
      amount: cents(amount_cents), balance: cents(balance_cents), wallet_url: `${env.BASE_URL}/w/${wallet_id}`
    });

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

    // deduct donor
    const sFrom = env.WALLET_DO.get(env.WALLET_DO.idFromName(from));
    let r = await sFrom.fetch(new URL('/deduct', 'https://do').toString(), {
      method:'POST', body: JSON.stringify({ amount_cents, expected_version: donor.version })
    });
    if (!r.ok) return r;
    const { balance_cents: donor_new, version: donor_ver } = await r.json();

    // topup recipient
    const sTo = env.WALLET_DO.get(env.WALLET_DO.idFromName(to));
    r = await sTo.fetch(new URL('/topup', 'https://do').toString(), {
      method:'POST', body: JSON.stringify({ amount_cents })
    });
    const { balance_cents: rec_new, version: rec_ver } = await r.json();

    // persist
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`).bind(donor_new, donor_ver, from),
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`).bind(rec_new,   rec_ver,   to),
      env.DB.prepare(`INSERT INTO transfers(id,donor_wallet_id,recipient_wallet_id,amount_cents,created_at) VALUES(?1,?2,?3,?4,?5)`)
        .bind(nanoid(), from, to, amount_cents, now)
    ]);

    // Notify both
    await sendWA(env, donor.mobile, 'bar_transfer_out', { amount: cents(amount_cents), to_name: first(rec.name), balance: cents(donor_new) });
    await sendWA(env, rec.mobile,   'bar_transfer_in',  { amount: cents(amount_cents), from_name: first(donor.name), balance: cents(rec_new) });

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
    const r = await stub.fetch(new URL('/deduct','https://do').toString(), {
      method:'POST', body: JSON.stringify({ amount_cents: total_cents, expected_version })
    });
    if (!r.ok) return r;
    const { balance_cents, version } = await r.json();

    await env.DB.batch([
      env.DB.prepare(`UPDATE wallets SET balance_cents=?1, version=?2 WHERE id=?3`).bind(balance_cents, version, wallet_id),
      env.DB.prepare(`INSERT INTO sales(id,wallet_id,items_json,total_cents,bartender_id,device_id,created_at)
                      VALUES(?1,?2,?3,?4,?5,?6,?7)`)
        .bind(nanoid(), wallet_id, JSON.stringify(items), total_cents, bartender_id, device_id, Date.now())
    ]);

    // WhatsApp purchase + low-balance nudge
    const summary = items.map(i=>`${i.qty}× ${i.name}`).join(', ');
    await sendWA(env, w.mobile, 'bar_purchase', { items_summary: summary, total: cents(total_cents), balance: cents(balance_cents) });
    if (balance_cents < 10000) {
      await sendWA(env, w.mobile, 'bar_low_balance', {});
    }

    return json({ new_balance_cents: balance_cents, version });
  });
}

/* helpers */
async function getWallet(env, id) {
  return await env.DB.prepare(`SELECT * FROM wallets WHERE id=?1 LIMIT 1`).bind(id).first();
}

function shortId() {
  // 6–7 char readable id
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='W';
  for(let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}

function first(n){ return (n||'').split(' ')[0]; }
function cents(n){ return (n/100).toFixed(2); }

async function lookupAttendee(env, ticket_code){
  // Replace with your real lookup (D1 or existing route)
  const res = await fetch(`${env.BASE_URL}/api/tickets/${encodeURIComponent(ticket_code)}`);
  if (!res.ok) return null;
  return await res.json(); // {id,name,mobile?}
}

async function sendWA(env, to, template, vars){
  if (!to) return;
  // Map templates to your WhatsApp worker templates
  const map = {
    bar_welcome:      { name:'bar_welcome',      lang:'af' },
    bar_topup:        { name:'bar_topup',        lang:'af' },
    bar_purchase:     { name:'bar_purchase',     lang:'af' },
    bar_low_balance:  { name:'bar_low_balance',  lang:'af' },
    bar_transfer_out: { name:'bar_transfer_out', lang:'af' },
    bar_transfer_in:  { name:'bar_transfer_in',  lang:'af' }
  };
  const sel = map[template] || {name:template, lang:'af'};
  await fetch(`${env.WA_BASE}/api/wa/send`, {
    method:'POST',
    headers:{'content-type':'application/json', 'authorization': `Bearer ${env.WA_TOKEN}`},
    body: JSON.stringify({ to, template_key: `${sel.name}:${sel.lang}`, variables: vars })
  }).catch(()=>{});
}
