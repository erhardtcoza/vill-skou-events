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
  .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}
  .tile{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;text-align:center}
  .tile b{font-size:22px;display:block}
</style>
</head><body>
<header>
  <div class="row">
    <strong>Scanner</strong>
    <span class="pill" id="gate">Gate: —</span>
  </div>
  <div class="row">
    <span class="pill" id="net">Online</span>
    <span class="pill" id="qsize">Q:0</span>
    <button id="syncBtn" class="pill">Sync</button>
  </div>
</header>

<div class="wrap">
  <div class="tiles">
    <div class="tile"><small>IN total</small><b id="tIn">0</b></div>
    <div class="tile"><small>OUT total</small><b id="tOut">0</b></div>
    <div class="tile"><small>Inside now</small><b id="tInside">0</b></div>
  </div>

  <div class="panel">
    <div class="row" style="margin-bottom:8px">
      <select id="dirSel" class="pill">
        <option value="in">IN</option>
        <option value="out">OUT</option>
      </select>
    </div>
    <input id="qr" placeholder="Scan or paste QR here" autofocus />
    <div id="msg" class="status muted">Ready.</div>
  </div>
</div>

<audio id="s-ok"   src="data:audio/wav;base64,UklGRmQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAABAACAgICAgP8..."></audio>
<audio id="s-warn" src="data:audio/wav;base64,UklGRmQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAABAACAgICA..."></audio>
<audio id="s-err"  src="data:audio/wav;base64,UklGRmQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAABAACAgICA..."></audio>

<script>
// (tiny beeps omitted for brevity; you can keep the data URIs above or replace with your own)

function el(id){return document.getElementById(id)}
function setMsg(cls, text){ const m=el('msg'); m.className='status '+cls; m.textContent=text; }
function qGet(){ try{ return JSON.parse(localStorage.getItem('scan_queue')||'[]'); }catch{return []} }
function qSet(a){ localStorage.setItem('scan_queue', JSON.stringify(a)); el('qsize').textContent='Q:'+a.length; }
function qPush(ev){ const a=qGet(); a.push(ev); qSet(a); }
function beep(kind){ try{ el(kind==='ok'?'s-ok':kind==='warn'?'s-warn':'s-err').play().catch(()=>{});}catch{} }
function net(){ el('net').textContent = navigator.onLine ? 'Online' : 'Offline'; }
window.addEventListener('online', net); window.addEventListener('offline', net); net();

let sess = { role:'scan', gate:'' };
function updTotals(t){ if(!t) return; el('tIn').textContent=t.in||0; el('tOut').textContent=t.out||0; el('tInside').textContent=(t.in||0)-(t.out||0); }

async function who(){
  const r = await fetch('/api/auth/whoami').then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok || r.role!=='scan'){ location.href='/scan/login'; return; }
  sess = r; el('gate').textContent = 'Gate: '+(sess.gate||'—');
}
who();

async function mark(qr, dir){
  const ev = { qr, direction: dir, gate_name: sess.gate||'', ts: Date.now() };
  try{
    const resp = await fetch('/api/scan/mark', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(ev) });
    const j = await resp.json();
    if (!j.ok) {
      if (!resp.ok && (resp.status>=500 || resp.status===0)) {
        qPush(ev); setMsg('warn','Saved offline. Will sync later.'); beep('warn');
      } else {
        setMsg('err', j.error || 'Rejected'); beep('err');
      }
      return;
    }
    updTotals(j.totals);
    setMsg('ok', \`OK \${dir.toUpperCase()} — \${j.tt_name||'Ticket'}\`); beep('ok');
  }catch{
    qPush(ev); setMsg('warn','Saved offline. Will sync later.'); beep('warn');
  }
}

async function syncNow(){
  const q = qGet();
  if (!q.length){ setMsg('muted', 'Nothing to sync.'); return; }
  try{
    const j = await fetch('/api/scan/sync', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ events: q }) }).then(r=>r.json());
    if (j?.ok) { qSet([]); setMsg('ok', \`Synced \${j.accepted}/\${j.total}\`); } else setMsg('err', 'Sync failed.');
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
qSet(qGet()); // refresh Q size
setMsg('muted', 'Ready.');
</script>
</body></html>`;
