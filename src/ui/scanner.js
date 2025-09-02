// /src/ui/scanner.js
export const scannerHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scanner · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --red:#b91c1c; --amber:#b45309; --bg:#f6f7f8 }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui;background:var(--bg);color:#111}
  header{padding:14px 16px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
  .wrap{max-width:720px;margin:16px auto;padding:0 12px}
  .panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px}
  input{width:100%;padding:14px;border:1px solid #d1d5db;border-radius:12px;font-size:18px}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .pill{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;background:#fff}
  .status{margin-top:12px;padding:14px;border-radius:12px}
  .ok{background:#ecfdf5;border:1px solid #10b981;color:#065f46}
  .warn{background:#fffbeb;border:1px solid #f59e0b;color:#92400e}
  .err{background:#fef2f2;border:1px solid #ef4444;color:#991b1b}
  .muted{color:#6b7280}
</style>
</head><body>
<header>
  <strong>Scanner</strong>
  <div class="row">
    <span class="pill" id="net">Online</span>
    <button id="syncBtn" class="pill">Sync</button>
  </div>
</header>

<div class="wrap">
  <div class="panel">
    <div class="row" style="margin-bottom:8px">
      <select id="gateSel" class="pill"></select>
      <select id="dirSel" class="pill">
        <option value="in">IN</option>
        <option value="out">OUT</option>
      </select>
    </div>
    <input id="qr" placeholder="Scan or paste QR here" autofocus />
    <div id="msg" class="status muted">Ready.</div>
  </div>
</div>

<script>
function el(id){return document.getElementById(id)}
function setMsg(cls, text){ const m=el('msg'); m.className='status '+cls; m.textContent=text; }

function qGet(){ try{ return JSON.parse(localStorage.getItem('scan_queue')||'[]'); }catch{return []} }
function qSet(a){ localStorage.setItem('scan_queue', JSON.stringify(a)); }
function qPush(ev){ const a=qGet(); a.push(ev); qSet(a); }

async function loadGates(){
  // gates require admin API; if guarded, you can hardcode or expose a public list
  try{
    const res = await fetch('/api/admin/gates').then(r=>r.json());
    const opts = (res.gates||[]).map(g=>\`<option>\${g.name}</option>\`).join('');
    el('gateSel').innerHTML = opts || '<option>Main</option>';
  }catch{
    el('gateSel').innerHTML = '<option>Main</option>';
  }
}

async function mark(qr, dir){
  const ev = { qr, direction: dir, gate_name: el('gateSel').value, ts: Date.now() };
  try{
    const r = await fetch('/api/scan/mark', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(ev) });
    const j = await r.json();
    if (!j.ok) {
      // If network error or unauthorized, queue locally
      if (!r.ok && r.status>=500 || r.status===0) {
        qPush(ev);
        setMsg('warn', 'Saved offline. Will sync later.');
      } else {
        setMsg('err', j.error || 'Rejected');
      }
      return;
    }
    setMsg('ok', \`OK \${dir.toUpperCase()} — \${j.tt_name||'Ticket'}\`);
  }catch(e){
    qPush(ev);
    setMsg('warn', 'Saved offline. Will sync later.');
  }
}

async function syncNow(){
  const q = qGet();
  if (!q.length){ setMsg('muted', 'Nothing to sync.'); return; }
  try{
    const j = await fetch('/api/scan/sync', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ events: q }) }).then(r=>r.json());
    if (j?.ok) { qSet([]); setMsg('ok', \`Synced \${j.accepted}/\${j.total}\`); }
    else setMsg('err', 'Sync failed.');
  }catch{ setMsg('err','Sync failed.'); }
}

el('qr').addEventListener('keydown', (e)=>{
  if (e.key==='Enter'){
    const v = el('qr').value.trim();
    el('qr').value = '';
    if (v) mark(v, el('dirSel').value);
  }
});

el('syncBtn').onclick = syncNow;
window.addEventListener('focus', syncNow);
setInterval(syncNow, 5*60*1000);

// online/offline UI hint
function net(){ el('net').textContent = navigator.onLine ? 'Online' : 'Offline'; }
window.addEventListener('online', net);
window.addEventListener('offline', net);
net();

loadGates();
setMsg('muted', 'Ready.');
</script>
</body></html>`;