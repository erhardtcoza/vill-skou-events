// /src/ui/bar_topup.js
export const barTopupHTML = `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar · Wallets</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px }
  @media (max-width:980px){ .grid{ grid-template-columns:1fr } }
  h1{ margin:0 0 8px }
  label{ font-weight:700; font-size:14px; margin-top:8px; display:block }
  input, select{ width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .btn{ display:inline-block; background:var(--accent); color:#fff; padding:12px 16px; border-radius:10px; text-decoration:none; font-weight:800; border:0; cursor:pointer }
  .btn.ghost{ background:#111 }
  .btn.small{ padding:10px 12px; border-radius:12px; font-size:14px }
  .muted{ color:var(--muted) }
  .row{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
  .pill{ display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid var(--border); }
  .error{ color:var(--danger); font-weight:700; margin-top:6px }
  .balance{ font-size:26px; font-weight:900 }
  .qr{ width:220px; height:220px; border:1px solid var(--border); border-radius:12px; display:flex; align-items:center; justify-content:center; background:#fff }
  .tops{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:10px }
  @media (max-width:520px){ .tops{ grid-template-columns:repeat(2,1fr) } }
  .topbtn{ padding:16px 10px; border-radius:12px; border:0; cursor:pointer; font-weight:900; background:#0a7d2b; color:#fff }
  .topbtn:disabled{ opacity:.6; cursor:not-allowed }
</style>
</head><body>
<div class="wrap">
  <h1>Wallets</h1>
  <div class="grid">

    <!-- LEFT: Create / Load -->
    <div class="card">
      <h3 style="margin:0 0 10px">Skep of laai beursie</h3>

      <div class="row">
        <div style="flex:1">
          <label>Laai per ID of Selfoon</label>
          <input id="lookup" placeholder="bv. V95AQHY of 082… / 2772…" />
        </div>
        <button id="btnLoad" class="btn ghost">Laai</button>
        <button id="btnScan" class="btn ghost">Scan</button>
      </div>

      <div style="margin-top:10px">
        <label>Onlangse beursies</label>
        <select id="recent"></select>
      </div>

      <hr style="border:0;border-top:1px solid var(--border); margin:16px 0"/>

      <h4 style="margin:0 0 6px">Nuwe beursie</h4>
      <div class="row">
        <input id="newName" placeholder="Naam"/>
        <input id="newMobile" placeholder="Selfoon (SA: 082… / 2772… )"/>
      </div>
      <div class="row" style="margin-top:8px">
        <button id="btnCreate" class="btn">Skep beursie</button>
        <span id="msg" class="error"></span>
      </div>
    </div>

    <!-- RIGHT: Top-up only -->
    <div class="card">
      <h3 style="margin:0 0 10px">Vinnige top-ups</h3>
      <div class="muted" id="noWallet">Laai of skep eers 'n beursie aan die linkerkant.</div>

      <div id="walletBox" style="display:none">
        <div class="row" style="justify-content:space-between">
          <div>
            <div id="wname" style="font-weight:800">—</div>
            <div class="balance" id="wbal">R0.00</div>
            <div class="pill" id="wid" style="margin-top:6px">ID: —</div>
            <div style="margin-top:8px"><a id="wlink" class="muted" target="_blank" rel="noopener">Open publieke skakel</a></div>
          </div>
          <div class="qr" id="wqr">QR</div>
        </div>

        <div class="tops">
          <button class="topbtn" data-amt="5000">R50</button>
          <button class="topbtn" data-amt="10000">R100</button>
          <button class="topbtn" data-amt="20000">R200</button>
        </div>

        <div id="opmsg" class="muted" style="margin-top:8px"></div>
      </div>
    </div>

  </div>
</div>

<script>
/* ---------- helpers ---------- */
const $ = (id)=>document.getElementById(id);
const digits = (s)=>String(s||'').replace(/\\D+/g,'');
const normPhone = (raw)=>{ const s=digits(raw); if(s.length===10 && s.startsWith('0')) return '27'+s.slice(1); return s; };
const rands = (c)=>'R'+((Number(c)||0)/100).toFixed(2);

const LS_RECENT = 'bar_recent_wallets_v2'; // last 50

function loadRecent(){
  try{ return JSON.parse(localStorage.getItem(LS_RECENT)||'[]'); }catch{ return []; }
}
function saveRecentList(arr){
  try{ localStorage.setItem(LS_RECENT, JSON.stringify(arr.slice(0,50))); }catch{}
}
function bumpRecent(w){
  if(!w?.id) return;
  let arr = loadRecent().filter(x => x.id !== w.id);
  arr.unshift({ id:w.id, name:w.name||'', mobile:w.mobile||'', balance_cents:w.balance_cents|0, version:Number(w.version||0), updated: Date.now() });
  saveRecentList(arr);
  renderRecent();
}
function renderRecent(){
  const arr = loadRecent();
  const opts = ['<option value="">Kies onlangse…</option>'].concat(
    arr.map(w => '<option value="'+w.id+'">'+(w.name||w.id)+' · '+rands(w.balance_cents)+'</option>')
  ).join('');
  $('recent').innerHTML = opts;
}

/* ---------- state ---------- */
let current = null; // {id,name,balance_cents,version,...}

/* ---------- view ---------- */
function showWallet(w){
  current = w;
  if(!w){ $('walletBox').style.display='none'; $('noWallet').style.display='block'; return; }
  $('noWallet').style.display='none';
  $('walletBox').style.display='block';
  $('wname').textContent = w.name || 'Wallet';
  $('wbal').textContent  = rands(w.balance_cents||0);
  $('wid').textContent   = 'ID: '+(w.id||'—');
  const link = '/w/'+encodeURIComponent(w.id);
  $('wlink').href = link; $('wlink').textContent = link;
  $('wqr').innerHTML = '<img src="/api/qr/svg/WALLET-'+encodeURIComponent(w.id)+'" width="220" height="220" alt="QR"/>';
  bumpRecent(w);
}

/* ---------- api ---------- */
async function apiCreate(name, mobile){
  const r = await fetch('/api/wallets/create', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name, mobile })
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok || j.ok===false) throw new Error(j.error||'create_failed');
  return j.wallet || j;
}
async function apiLoadBy(value){
  // try id else phone
  let r = await fetch('/api/wallets/'+encodeURIComponent(value));
  let j = await r.json().catch(()=>({}));
  if(r.ok && j && j.ok!==false) return j.wallet || j;
  const d = digits(value);
  if(!d) throw new Error('not_found');
  r = await fetch('/api/wallets/by-mobile/'+d);
  j = await r.json().catch(()=>({}));
  if(!r.ok || j.ok===false) throw new Error(j.error||'not_found');
  return j.wallet || j;
}
async function apiTopup(id, cents){
  const r = await fetch('/api/wallets/topup', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ wallet_id:id, amount_cents:cents })
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok || j.ok===false) throw new Error(j.error||'topup_failed');
  return j.wallet || j;
}

/* ---------- actions ---------- */
$('btnCreate').onclick = async ()=>{
  $('msg').textContent = '';
  const name = ($('newName').value||'').trim();
  const mobile = normPhone(($('newMobile').value||'').trim());
  if(!name){ $('msg').textContent='Voer naam in'; return; }
  try{
    const w = await apiCreate(name, mobile);
    $('newName').value=''; $('newMobile').value='';
    $('lookup').value = w.id;
    showWallet(w);
  }catch(e){
    $('msg').textContent = e.message||'Kon nie skep nie';
  }
};

$('btnLoad').onclick = async ()=>{
  $('msg').textContent=''; $('opmsg').textContent='';
  const raw = ($('lookup').value||'').trim();
  if(!raw){ $('msg').textContent='Voer ID of selfoon in'; return; }
  try{
    const w = await apiLoadBy(raw);
    showWallet(w);
  }catch(e){
    $('msg').textContent = 'Nie gevind nie';
  }
};

$('btnScan').onclick = ()=>{
  const v = prompt('Scan/voer ID of selfoon:');
  if(!v) return;
  $('lookup').value = v.trim();
  $('btnLoad').click();
};

$('recent').onchange = ()=>{
  const id = $('recent').value;
  if(!id) return;
  $('lookup').value = id;
  $('btnLoad').click();
};

// Top-up buttons (R50/100/200) with optimistic UI
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.topbtn');
  if(!btn) return;
  if(!current?.id){ $('opmsg').textContent = 'Geen beursie gelaai nie.'; return; }
  const cents = Number(btn.dataset.amt||0)|0;
  if(!cents) return;

  // optimistic update for speed
  const oldBal = Number(current.balance_cents||0);
  const newBal = oldBal + cents;
  current.balance_cents = newBal;
  $('wbal').textContent = rands(newBal);
  $('opmsg').textContent = 'Top-up gestuur…';
  btn.disabled = true;

  try{
    const w = await apiTopup(current.id, cents);
    // server is source of truth
    current.balance_cents = Number(w.balance_cents||newBal);
    current.version = Number(w.version||current.version);
    $('wbal').textContent = rands(current.balance_cents);
    $('opmsg').textContent = 'Top-up voltooi.';
    bumpRecent(current);
  }catch(e){
    // revert on failure
    current.balance_cents = oldBal;
    $('wbal').textContent = rands(oldBal);
    $('opmsg').textContent = 'Kon nie top-up nie.';
  }finally{
    btn.disabled = false;
  }
});

/* ---------- boot ---------- */
renderRecent();
</script>
</body></html>`;
