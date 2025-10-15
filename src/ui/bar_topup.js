// /src/ui/bar_topup.js
export const barTopupHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar · Wallet Top-up</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:840px; margin:18px auto; padding:0 14px }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  @media (max-width:720px){ .row{ grid-template-columns:1fr } }
  label{ font-weight:700; font-size:14px; margin-top:8px; display:block }
  input{ width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .btn{ display:inline-block; background:var(--accent); color:#fff; padding:12px 16px; border-radius:10px; text-decoration:none; font-weight:800; border:0; cursor:pointer; margin-top:12px }
  .btn.alt{ background:#111 }
  .muted{ color:var(--muted) }
  .pill{ display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid var(--border); }
  .error{ color:var(--danger); font-weight:700; margin-top:8px }
  .balance{ font-size:24px; font-weight:900 }
  .qr{ width:200px; height:200px; border:1px solid var(--border); border-radius:12px; display:flex; align-items:center; justify-content:center; background:#fff }
</style>
</head><body>
<div class="wrap">
  <h1 style="margin:0 0 8px">Wallet top-up</h1>
  <p class="muted" style="margin:0 0 14px">Create or find a wallet, then take a cash or card top-up.</p>

  <div class="card">
    <div class="row">
      <div>
        <label>New wallet name</label>
        <input id="newName" placeholder="Attendee name"/>
        <button id="create" class="btn">Create wallet</button>
      </div>
      <div>
        <label>Lookup wallet ID</label>
        <input id="lookupId" placeholder="e.g. 123"/>
        <button id="lookup" class="btn alt">Load wallet</button>
      </div>
    </div>

    <hr style="border:0;border-top:1px solid var(--border); margin:16px 0"/>

    <div class="row">
      <div>
        <div class="muted">Current wallet</div>
        <div id="wname" style="font-weight:800; margin-top:6px">—</div>
        <div class="balance" id="wbal">R0.00</div>
        <div class="pill" id="wid" style="margin-top:6px">ID: —</div>
        <div style="margin-top:10px"><a id="wlink" class="muted" target="_blank" rel="noopener">Open public wallet</a></div>
      </div>
      <div style="display:flex; gap:16px; align-items:center">
        <div class="qr" id="wqr">QR</div>
        <div>
          <label>Amount (R)</label>
          <input id="amt" type="number" min="0" step="0.01" placeholder="e.g. 100.00"/>
          <div style="display:flex; gap:8px; margin-top:10px">
            <button id="cash" class="btn">Cash top-up</button>
            <button id="card" class="btn alt">Card top-up</button>
          </div>
          <div id="msg" class="error"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const toCents = (v)=> {
  const n = Number(String(v||'').replace(',','.')); 
  return Number.isFinite(n) ? Math.round(n*100) : 0;
};
const rands = (c)=> 'R'+((c||0)/100).toFixed(2);

let current = null;

function show(raw){
  // tolerate both {wallet:{...}} and flat {...}
  const w = raw?.wallet ? raw.wallet : raw;
  current = w;
  $('wname').textContent = w?.name || '—';
  $('wbal').textContent = rands(w?.balance_cents||0);
  $('wid').textContent  = 'ID: ' + (w?.id ?? '—');
  const link = '/w/' + (w?.id ?? '');
  $('wlink').href = link; $('wlink').textContent = link;
  // use SVG endpoint for crisp QR
  $('wqr').innerHTML = '<img src="/api/qr/svg/WALLET-'+encodeURIComponent(w.id)+'" width="200" height="200" alt="QR"/>';
}

async function load(id){
  $('msg').textContent = '';
  try{
    const r = await fetch('/api/wallets/'+encodeURIComponent(id));
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok === false) throw new Error(j.error||'Wallet not found');
    show(j);
  }catch(e){
    $('msg').textContent = e.message||'load failed';
  }
}

$('create').onclick = async ()=>{
  $('msg').textContent = '';
  const name = ($('newName').value||'').trim();
  if (!name){ $('msg').textContent='Enter a name'; return; }
  try{
    // support either /create or /register backends
    let r = await fetch('/api/wallets/create', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ name })
    });
    if (r.status === 404) {
      r = await fetch('/api/wallets/register', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ name })
      });
    }
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok === false) throw new Error(j.error||'create failed');
    show(j);
    $('newName').value = '';
  }catch(e){ $('msg').textContent = e.message||'create failed'; }
};

$('lookup').onclick = ()=> {
  const id = Number(($('lookupId').value||'').trim());
  if (!id) { $('msg').textContent='Enter wallet ID'; return; }
  load(id);
};

// enter-to-submit quality of life
$('lookupId').addEventListener('keydown', (e)=>{ if(e.key==='Enter') $('lookup').click(); });
$('newName').addEventListener('keydown', (e)=>{ if(e.key==='Enter') $('create').click(); });

async function topup(method){
  $('msg').textContent = '';
  if (!current?.id){ $('msg').textContent='No wallet loaded.'; return; }
  const cents = toCents($('amt').value);
  if (!cents){ $('msg').textContent='Enter an amount'; return; }
  try{
    const r = await fetch('/api/wallets/topup', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ wallet_id: current.id, amount_cents: cents, method })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok === false) throw new Error(j.error||'topup failed');
    show(j);
    $('amt').value = '';
  }catch(e){ $('msg').textContent = e.message||'topup failed'; }
}

$('cash').onclick = ()=> topup('cash');
$('card').onclick = ()=> topup('card');
</script>
</body></html>`;
