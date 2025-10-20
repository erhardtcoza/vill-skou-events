// /src/ui/bar_topup.js
export const barTopupHTML = `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Wallets</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:980px; margin:16px auto; padding:0 12px }
  h1{ margin:0 0 12px }
  .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 10px 22px rgba(0,0,0,.07); padding:14px }
  label{ font-weight:800; font-size:14px; margin:6px 0 4px; display:block }
  input{ width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .btn{ display:inline-block; background:var(--accent); color:#fff; padding:11px 14px; border-radius:10px; text-decoration:none; font-weight:800; border:0; cursor:pointer }
  .btn.alt{ background:#111 }
  .btn.ghost{ background:#e5e7eb; color:#111 }
  .btn.warn{ background:var(--danger) }
  .muted{ color:var(--muted) }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  .pill{ display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid var(--border) }
  .balance{ font-size:24px; font-weight:900 }
  .qr{ width:180px; height:180px; border:1px solid var(--border); border-radius:12px; display:flex; align-items:center; justify-content:center; background:#fff }
  .topups .btn{ min-width:86px }

  /* Modal */
  .modal-back{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:none; align-items:center; justify-content:center; padding:16px; z-index:9999 }
  .modal{ background:#fff; border-radius:14px; max-width:520px; width:100%; padding:16px; box-shadow:0 14px 34px rgba(0,0,0,.25) }
  .modal h3{ margin:0 0 8px }
  .modal .actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:12px }
</style>
</head><body>
<div class="wrap">
  <h1>Wallets</h1>

  <div class="grid">
    <!-- LEFT: Create / Load -->
    <div class="card">
      <h2 style="margin:0 0 10px">Skep of laai beursie</h2>

      <label>Laai per ID of Selfoon</label>
      <div class="row">
        <input id="lookupId" placeholder="bv. V95AQHY of 082… / 2772…" />
        <button id="loadBtn" class="btn alt">Laai</button>
        <button id="scanBtn" class="btn ghost">Scan</button>
      </div>

      <hr style="border:0;border-top:1px solid var(--border); margin:14px 0"/>

      <h3 style="margin:0 0 6px">Nuwe beursie</h3>
      <label>Naam</label>
      <input id="newName" placeholder="Naam" />
      <label>Selfoon (SA: 082… / 2772… )</label>
      <input id="newMobile" placeholder="Selfoon" />
      <div class="row" style="margin-top:10px">
        <button id="create" class="btn">Skep beursie</button>
        <div id="msgL" class="muted"></div>
      </div>
    </div>

    <!-- RIGHT: Active wallet + quick topups + transfer -->
    <div class="card">
      <h2 style="margin:0 0 10px">Vinnige top-ups</h2>
      <div class="muted" id="hint">Laai of skep eers 'n beursie aan die linkerkant.</div>

      <div id="wbox" style="display:none">
        <div class="row" style="align-items:center; justify-content:space-between">
          <div>
            <div id="wname" style="font-weight:900">—</div>
            <div class="balance" id="wbal">R0.00</div>
            <div class="pill" id="wid" style="margin-top:6px">ID: —</div>
          </div>
          <div class="qr" id="wqr">QR</div>
        </div>

        <div class="row topups" style="margin-top:12px">
          <button class="btn" data-amt="5000">R50</button>
          <button class="btn" data-amt="10000">R100</button>
          <button class="btn" data-amt="20000">R200</button>
          <button class="btn" data-amt="30000">R300</button>
          <button id="transferBtn" class="btn ghost">Transfer</button>
        </div>
        <div id="msgR" class="muted" style="margin-top:8px"></div>
      </div>
    </div>
  </div>
</div>

<!-- Transfer Modal -->
<div id="modalBack" class="modal-back">
  <div class="modal">
    <h3>Oordrag van balans</h3>
    <p class="muted" style="margin:0 0 8px">Skuif die oorblywende balans volledig van <b>Donor</b> na <b>Ontvanger</b>.</p>
    <label>Donor beursie (ID of selfoon)</label>
    <div class="row">
      <input id="txFrom" placeholder="bv. Q7P3Y8 of 082… / 2772…" />
      <button id="scanFrom" class="btn ghost">Scan</button>
    </div>
    <label style="margin-top:8px">Ontvanger beursie (ID of selfoon)</label>
    <div class="row">
      <input id="txTo" placeholder="bv. NEEPX7Q of 082… / 2772…" />
      <button id="scanTo" class="btn ghost">Scan</button>
    </div>
    <div id="txMsg" class="muted" style="margin-top:8px"></div>
    <div class="actions">
      <button id="txCancel" class="btn ghost">Kanselleer</button>
      <button id="txDo" class="btn warn">Transfer balans</button>
    </div>
  </div>
</div>

<script>
/* ---------- helpers ---------- */
const $ = (id)=>document.getElementById(id);
const digits = (s)=>String(s||'').replace(/\\D+/g,'');
const rands = (c)=> 'R'+((c||0)/100).toFixed(2);
const normPhone = (raw)=>{ const s=digits(raw); if(s.length===10 && s.startsWith('0')) return '27'+s.slice(1); return s; };

/* ---------- local LRU cache (hidden, speeds up repeat loads) ---------- */
const WALLETS_LRU_KEY = 'BAR_WALLETS_LRU_V1';
const WALLETS_MAX = 50;
function lruLoad(){ try{ return JSON.parse(localStorage.getItem(WALLETS_LRU_KEY)||'[]')||[]; }catch{ return []; } }
function lruSave(list){ try{ localStorage.setItem(WALLETS_LRU_KEY, JSON.stringify(list.slice(0,WALLETS_MAX))); }catch{} }
function lruTouch(w){ if(!w?.id) return; const L=lruLoad().filter(x=>x.id!==w.id); L.unshift({ id:w.id, name:w.name||'', mobile:w.mobile||'', balance_cents:w.balance_cents|0, version:Number(w.version||0), ts:Date.now() }); lruSave(L); }
function lruFind(raw){ const d=digits(raw); const L=lruLoad(); return L.find(x => x.id===raw || (d && (x.mobile||'').replace(/\\D+/g,'').endsWith(d))); }

/* ---------- state ---------- */
let current = null; // {id, name, mobile, balance_cents, version}

/* ---------- UI helpers ---------- */
function showWallet(w, isCached=false){
  current = w;
  $('hint').style.display = 'none';
  $('wbox').style.display = 'block';
  $('wname').textContent = w?.name || (w?.mobile || 'Wallet');
  $('wbal').textContent = rands(w?.balance_cents||0) + (isCached ? ' (kas)' : '');
  $('wid').textContent  = 'ID: ' + (w?.id ?? '—');
  $('wqr').innerHTML = '<img src="/api/qr/svg/WALLET-'+encodeURIComponent(w.id)+'" width="180" height="180" alt="QR"/>';
}

async function fetchWalletById(id){
  const r = await fetch('/api/wallets/'+encodeURIComponent(id));
  const j = await r.json().catch(()=>({}));
  if (!r.ok || j.ok===false) throw new Error(j.error||'Wallet nie gevind');
  return j.wallet ? j.wallet : j;
}

async function loadByIdOrMobile(value){
  // Instant: if in LRU, show it while fetching fresh
  const cached = lruFind(value);
  if (cached) showWallet(cached, true);

  // Try exact id first
  let r = await fetch('/api/wallets/'+encodeURIComponent(value));
  let j = await r.json().catch(()=>({}));
  if (!r.ok){
    // Fall back to mobile digits
    const d = digits(value);
    if (d){
      r = await fetch('/api/wallets/by-mobile/'+encodeURIComponent(d));
      j = await r.json().catch(()=>({}));
    }
  }
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Wallet nie gevind');

  const w = j.wallet ? j.wallet : j;
  lruTouch(w);
  showWallet(w, false);
  return w;
}

async function createWallet(name, mobile){
  const r = await fetch('/api/wallets/create', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name, mobile })
  });
  const j = await r.json().catch(()=>({}));
  if (!r.ok || j.ok === false) throw new Error(j.error||'Skep het misluk');
  const w = j.wallet ? j.wallet : j;
  lruTouch(w);
  showWallet(w, false);
  return w;
}

async function topup(cents){
  if (!current?.id) { $('msgR').textContent='Geen beursie gelaai nie.'; return; }
  $('msgR').textContent='Verwerk…';
  try{
    const r = await fetch('/api/wallets/topup', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ wallet_id: current.id, amount_cents: cents })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok === false) throw new Error(j.error||'Top-up het misluk');
    const w = j.wallet ? j.wallet : j;
    lruTouch(w);
    showWallet(w, false);
    $('msgR').textContent='Gedoen';
    setTimeout(()=>$('msgR').textContent='', 1200);
  }catch(e){
    $('msgR').textContent = e.message || 'Fout met top-up';
  }
}

/* ---------- Transfer modal helpers ---------- */
function openModal(){ $('modalBack').style.display='flex'; $('txMsg').textContent=''; $('txFrom').value=''; $('txTo').value=''; }
function closeModal(){ $('modalBack').style.display='none'; }

function askScan(label){
  const v = prompt(label + ' — voer/scan ID of selfoon:');
  return v ? v.trim() : '';
}

async function resolveIdOrPhone(raw){
  if (!raw) return null;
  // First assume it's an id (fast path)
  try { const w = await fetchWalletById(raw); return w.id; } catch {}
  // Try by phone digits
  const d = digits(raw);
  if (d){
    try{
      const r = await fetch('/api/wallets/by-mobile/'+encodeURIComponent(d));
      const j = await r.json().catch(()=>({}));
      if (r.ok && j.ok!==false) return (j.wallet ? j.wallet : j).id;
    }catch{}
  }
  return null;
}

async function doTransfer(){
  const fromRaw = ($('txFrom').value||'').trim();
  const toRaw   = ($('txTo').value||'').trim();
  $('txMsg').textContent = 'Laai beursies…';

  const fromId = await resolveIdOrPhone(fromRaw);
  const toId   = await resolveIdOrPhone(toRaw);
  if (!fromId || !toId){ $('txMsg').textContent='Wallets nie gevind nie.'; return; }
  if (fromId === toId){ $('txMsg').textContent='Donor en ontvanger kan nie dieselfde wees nie.'; return; }

  $('txMsg').textContent = 'Verskuif balans…';
  try{
    const r = await fetch('/api/wallets/transfer', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ from: fromId, to: toId })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok===false) throw new Error(j.error||'Transfer het misluk');

    $('txMsg').textContent = 'Klaar. Bedrag: '+rands(j.amount_cents||0);
    // Refresh recipient wallet into the right panel for convenience
    try{
      const w = await fetchWalletById(toId);
      lruTouch(w);
      showWallet(w, false);
    }catch{}
    setTimeout(()=>{ closeModal(); }, 900);
  }catch(e){
    $('txMsg').textContent = e.message || 'Fout met transfer.';
  }
}

/* ---------- events ---------- */
$('loadBtn').onclick = async ()=>{
  $('msgL').textContent = '';
  const v = ($('lookupId').value||'').trim();
  if (!v){ $('msgL').textContent='Voer ID of selfoon in'; return; }
  try{ await loadByIdOrMobile(v); }catch(e){ $('msgL').textContent = e.message||'Kon nie laai nie'; }
};
$('scanBtn').onclick = ()=>{
  const v = prompt('Voer/scan wallet ID of selfoon:');
  if (!v) return;
  $('lookupId').value = v.trim();
  $('loadBtn').click();
};
$('create').onclick = async ()=>{
  $('msgL').textContent = '';
  const name = ($('newName').value||'').trim();
  const mobile = normPhone(($('newMobile').value||'').trim());
  if (!name){ $('msgL').textContent='Voer naam in'; return; }
  try{
    await createWallet(name, mobile);
    $('newName').value = ''; $('newMobile').value = '';
  }catch(e){ $('msgL').textContent = e.message||'Kon nie skep nie'; }
};
// Quick top-up buttons
document.querySelectorAll('.topups .btn[data-amt]').forEach(b=>{
  b.addEventListener('click', ()=> topup(parseInt(b.dataset.amt,10)||0));
});

// Transfer button + modal controls
$('transferBtn').onclick = openModal;
$('txCancel').onclick = closeModal;
$('txDo').onclick = doTransfer;
$('scanFrom').onclick = ()=>{ const v=askScan('Scan/voer DONOR'); if(v){ $('txFrom').value=v; } };
$('scanTo').onclick   = ()=>{ const v=askScan('Scan/voer ONTVANGER'); if(v){ $('txTo').value=v; } };

// Enter shortcuts
$('lookupId').addEventListener('keydown', e=>{ if(e.key==='Enter') $('loadBtn').click(); });
$('newName').addEventListener('keydown', e=>{ if(e.key==='Enter') $('create').click(); });
$('newMobile').addEventListener('keydown', e=>{ if(e.key==='Enter') $('create').click(); });
</script>
</body></html>`;
