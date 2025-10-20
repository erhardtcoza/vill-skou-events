// /src/ui/bar_topup.js
export const barTopupHTML = `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Wallets</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 14px }
  h1{ margin:0 0 14px }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  label{ font-weight:800; display:block; margin:8px 0 6px }
  input{ width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  .btn{ display:inline-block; background:var(--accent); color:#fff; padding:12px 16px; border-radius:12px; font-weight:900; border:0; cursor:pointer }
  .btn.alt{ background:#111 }
  .btn.mini{ padding:10px 12px; }
  .muted{ color:var(--muted) }
  .pill{ display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid var(--border) }
  .balance{ font-size:22px; font-weight:900 }
  .qr{ width:180px; height:180px; border:1px solid var(--border); border-radius:12px; display:flex; align-items:center; justify-content:center; background:#fff }
  .error{ color:var(--danger); font-weight:700; margin-top:8px }
  .actions{ display:flex; gap:10px; flex-wrap:wrap }
  .quick{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px }
  @media (max-width:420px){ .quick{ grid-template-columns:1fr 1fr } }
  .disabled{ opacity:.6; pointer-events:none }
</style>
</head><body>
<div class="wrap">
  <h1>Wallets</h1>

  <div class="grid">
    <!-- LEFT: create / load -->
    <div class="card">
      <h3 style="margin:0 0 6px">Skep of laai beursie</h3>

      <label>Laai per ID of Selfoon</label>
      <div class="row">
        <input id="lookupId" placeholder="bv. V95AQHY of 082… / 2772…"/>
        <button id="lookup" class="btn alt mini">Laai</button>
        <button id="scan" class="btn alt mini">Scan</button>
      </div>

      <hr style="border:0;border-top:1px solid var(--border);margin:14px 0"/>

      <h4 style="margin:0 0 6px">Nuwe beursie</h4>
      <label>Naam</label>
      <input id="newName" placeholder="Naam"/>
      <label>Selfoon (SA: 082… / 2772… )</label>
      <input id="newMobile" placeholder="Selfoon"/>
      <div class="actions" style="margin-top:10px">
        <button id="create" class="btn">Skep beursie</button>
        <div id="leftMsg" class="muted"></div>
      </div>
    </div>

    <!-- RIGHT: current + quick top-ups -->
    <div class="card">
      <h3 style="margin:0 0 6px">Vinnige top-ups</h3>

      <div class="row" style="justify-content:space-between; align-items:flex-start">
        <div>
          <div class="muted">Huidige beursie</div>
          <div id="wname" style="font-weight:900; margin-top:4px">—</div>
          <div class="balance" id="wbal">R0.00</div>
          <div class="pill" id="wid" style="margin-top:6px">ID: —</div>
          <div style="margin-top:8px"><a id="wlink" class="muted" target="_blank" rel="noopener">—</a></div>
        </div>
        <div class="qr" id="wqr">QR</div>
      </div>

      <div style="margin-top:12px" class="quick">
        <button class="btn" data-topup="5000">R50</button>
        <button class="btn" data-topup="10000">R100</button>
        <button class="btn" data-topup="20000">R200</button>
      </div>

      <div id="msg" class="error"></div>
    </div>
  </div>
</div>

<script>
/* ---------- helpers ---------- */
const $ = (id)=>document.getElementById(id);
const digits = (s)=>String(s||'').replace(/\\D+/g,'');
const toCents = (r)=>{ const n=Number(String(r||'').replace(',','.')); return Number.isFinite(n)?Math.round(n*100):0; };
const rands = (c)=>'R'+((c||0)/100).toFixed(2);
const normPhone = (raw)=>{ const s=digits(raw); return (s.length===10 && s.startsWith('0')) ? ('27'+s.slice(1)) : s; };

/* ---------- invisible LRU cache (last 50 wallets) ---------- */
const CACHE_KEY = 'BAR_WALLETS_LRU_V1';
const MAX_CACHE = 50;

function cacheLoad(){
  try{ return JSON.parse(localStorage.getItem(CACHE_KEY)||'[]') || []; } catch{ return []; }
}
function cacheSave(list){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0,MAX_CACHE))); }catch{}
}
function cacheTouch(entry){
  const list = cacheLoad().filter(x => x.id !== entry.id);
  list.unshift({ id: entry.id, name: entry.name||'', mobile: entry.mobile||'', ts: Date.now() });
  cacheSave(list);
}

/* ---------- state ---------- */
let current = null;

/* ---------- UI setters ---------- */
function showWallet(w){
  current = w;
  $('wname').textContent = w?.name || '—';
  $('wbal').textContent  = rands(w?.balance_cents||0);
  $('wid').textContent   = 'ID: ' + (w?.id ?? '—');
  const link = '/w/' + (w?.id ?? '');
  $('wlink').href = link; $('wlink').textContent = link;
  $('wqr').innerHTML = w?.id ? '<img src="/api/qr/svg/WALLET-'+encodeURIComponent(w.id)+'" width="180" height="180" alt="QR"/>' : 'QR';
  // update cache silently
  if (w?.id) cacheTouch({ id:w.id, name:w.name, mobile:w.mobile });
}

/* ---------- loaders ---------- */
async function loadByIdOrMobile(v){
  // try exact id first
  let r = await fetch('/api/wallets/'+encodeURIComponent(v));
  let j = await r.json().catch(()=>({}));
  if (!r.ok){
    const d = digits(v);
    if (d){
      r = await fetch('/api/wallets/by-mobile/'+encodeURIComponent(d));
      j = await r.json().catch(()=>({}));
    }
  }
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Wallet nie gevind');
  return j.wallet || j;
}

/* ---------- actions ---------- */
$('scan').onclick = ()=>{
  const v = prompt('Voer/scan wallet ID of selfoon:');
  if (!v) return;
  $('lookupId').value = v.trim();
  $('lookup').click();
};

$('lookup').onclick = async ()=>{
  $('leftMsg').textContent = '';
  const v = ($('lookupId').value||'').trim();
  if (!v){ $('leftMsg').textContent = 'Voer ID of selfoon in.'; return; }
  try{
    const w = await loadByIdOrMobile(v);
    showWallet(w);
  }catch(e){
    $('leftMsg').textContent = e.message || 'Kon nie laai nie.';
  }
};

$('create').onclick = async ()=>{
  $('leftMsg').textContent = '';
  const name = ($('newName').value||'').trim();
  const mobile = normPhone(($('newMobile').value||'').trim());
  if (!name){ $('leftMsg').textContent='Voer \'n naam in.'; return; }
