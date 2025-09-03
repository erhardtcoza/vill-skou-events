// /src/ui/scanner.js
//
// Gate scanning console (mobile-first).
// - If not logged in (scanner role cookie), it shows a login form and POSTs /api/auth/login {role:'scan', token, name}
// - Uses the native BarcodeDetector if available; falls back to manual entry.
// - Logic:
//     1) Scan QR -> lookup ticket via /api/public/tickets/:code
//     2) Decide default action: first time => IN; if already IN => prompt OUT
//     3) Allow gender prompt if unknown and ticket type requires it
//     4) POST to /api/scan/mark { code, action: 'in'|'out', gender?, gate_name? }
//     5) Show result + sound / haptic feedback
//
// Expect server to accept the POST and record the scan with gate name from a gate selector.

export const scannerHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>Scanner · Villiersdorp Skou</title>
<style>
  :root{--green:#0a7d2b;--bg:#0b0f12;--card:#11151a;--text:#e6efe6;--muted:#9fb1a1;--bad:#b00020;--ok:#18a957}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui}
  .wrap{max-width:900px;margin:0 auto;padding:12px}
  h1{margin:10px 0 12px;font-size:22px}
  .card{background:var(--card);border:1px solid #1c2228;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:12px;margin-bottom:12px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input,select,button{font-size:16px;padding:10px 12px;border-radius:12px;border:1px solid #2a3238;background:#0e1318;color:var(--text)}
  .primary{background:var(--green);border-color:var(--green)}
  .ok{color:var(--ok)} .bad{color:var(--bad)} .muted{color:var(--muted)}
  #video{width:100%;aspect-ratio:16/10;border-radius:14px;background:#000;object-fit:cover}
  .big{font-size:18px;font-weight:700}
  .pill{border-radius:999px;padding:6px 10px;border:1px solid #263037;background:#0e151a}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:740px){.grid2{grid-template-columns:1fr}}
</style>
</head><body><div class="wrap">

  <h1>Scanner</h1>

  <div id="loginCard" class="card" style="display:none">
    <div class="row"><strong>Sign in</strong><span class="muted"> · scanner</span></div>
    <div class="row">
      <input id="lg_name" placeholder="Your name" style="flex:1 1 180px" />
      <input id="lg_token" placeholder="Scanner token" style="flex:1 1 180px" />
      <button class="primary" id="lg_btn">Login</button>
      <span id="lg_msg" class="muted"></span>
    </div>
  </div>

  <div id="setupCard" class="card" style="display:none">
    <div class="row">
      <select id="gateSel"></select>
      <button id="startBtn" class="primary">Start camera</button>
      <button id="stopBtn">Stop</button>
      <input id="manual" placeholder="Type/scan code…" style="flex:1 1 220px"/>
      <button id="goBtn">Lookup</button>
    </div>
    <div class="muted" style="margin-top:6px">Tip: If your device blocks the camera, use the manual box or a USB scanner into the same field.</div>
  </div>

  <div id="videoCard" class="card" style="display:none">
    <video id="video" playsinline></video>
  </div>

  <div id="resultCard" class="card" style="display:none"></div>

  <audio id="beepOK" preload="auto" src="data:audio/wav;base64,UklGRoQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAAA..."></audio>
  <audio id="beepNO" preload="auto" src="data:audio/wav;base64,UklGRoQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAAA..."></audio>

<script>
const S = {
  sess: null,
  stream: null,
  detector: ('BarcodeDetector' in window) ? new BarcodeDetector({formats:['qr_code']}) : null,
  gate: '',
};

// Mini auth check – try hitting a protected endpoint to see if cookie exists
async function haveSession(){
  // hit a tiny endpoint; if unauthorized we’ll get 401
  const r = await fetch('/api/scan/ping').catch(()=>({ok:false,status:0}));
  return r.ok;
}

async function login(){
  const name = document.getElementById('lg_name').value.trim();
  const token = document.getElementById('lg_token').value.trim();
  const res = await fetch('/api/auth/login', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({ role:'scan', token, name })
  }).then(r=>r.json()).catch(()=>({ok:false}));
  if(res.ok){ location.reload(); }
  else document.getElementById('lg_msg').textContent = 'Wrong token';
}

async function loadGates(){
  const g = await fetch('/api/admin/gates').then(r=>r.json()).catch(()=>({gates:[]}));
  const sel = document.getElementById('gateSel');
  const gs = (g.gates||[]); if (!gs.length) gs.push({id:0,name:'Main Gate'});
  sel.innerHTML = gs.map(x=>'<option>'+x.name+'</option>').join('');
  S.gate = sel.value = gs[0].name;
  sel.onchange = ()=> S.gate = sel.value;
}

function show(id, on=true){ document.getElementById(id).style.display = on?'block':'none'; }

async function startCam(){
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const v = document.getElementById('video');
    v.srcObject = S.stream; await v.play();
    show('videoCard', true);
    if (S.detector) tick();
  } catch(e){
    alert('Camera blocked: '+e);
  }
}
function stopCam(){
  if (S.stream) { for (const t of S.stream.getTracks()) t.stop(); S.stream = null; }
  show('videoCard', false);
}
async function tick(){
  if (!S.stream || !S.detector) return;
  const v = document.getElementById('video');
  try {
    const codes = await S.detector.detect(v);
    if (codes && codes.length) {
      const val = codes[0].rawValue || '';
      if (val) { handleCode(val); await new Promise(r=>setTimeout(r, 800)); }
    }
  } catch {}
  requestAnimationFrame(tick);
}

function renderResult(html){ const c = document.getElementById('resultCard'); c.innerHTML = html; show('resultCard', true); }

async function lookup(code){
  const r = await fetch('/api/public/tickets/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false}));
  return r.ok ? r : null;
}

async function mark(code, action, gender){
  const payload = { code, action, gate_name: S.gate };
  if (gender) payload.gender = gender;
  const r = await fetch('/api/scan/mark', {
    method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
  }).then(r=>r.json()).catch(()=>({ok:false}));
  return r.ok ? r : null;
}

function feedback(ok=true){
  try {
    if (ok) document.getElementById('beepOK').play(); else document.getElementById('beepNO').play();
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [80,40,80]);
  } catch {}
}

async function handleCode(raw){
  const code = String(raw).trim();
  if (!code) return;
  const d = await lookup(code);
  if (!d){ feedback(false); return renderResult('<div class="bad big">❌ Ongeldige kaartjie</div>'); }

  const t = d.ticket, tt = d.ticket_type || {}, ev = d.event || {};
  const who = t.holder_name || '(onbekend)';
  const st  = t.state || 'unused';

  // Decide default action
  let def = 'in';
  if (st === 'in') def = 'out';

  const genderAsk = (!t.gender && (tt.requires_gender || 0));
  const genderCtl = genderAsk ? `
    <div class="row" style="margin-top:6px">
      <label class="pill"><input type="radio" name="g" value="male"> Manlik</label>
      <label class="pill"><input type="radio" name="g" value="female"> Vroulik</label>
      <label class="pill"><input type="radio" name="g" value="other"> Ander</label>
    </div>` : '';

  renderResult(\`
    <div class="big">\${ev.name || ''}</div>
    <div class="muted">\${tt.name || ''}</div>
    <div class="row" style="margin:6px 0">
      <span>Houer:</span><strong>\${who}</strong>
      <span class="pill">Huidig: \${st}</span>
      <span class="pill">Poort: \${S.gate}</span>
    </div>
    \${genderCtl}
    <div class="row" style="margin-top:8px">
      <button class="primary" id="actIn">Scan IN</button>
      <button id="actOut">Scan OUT</button>
      <input id="codeEcho" readonly class="pill" value="\${code}" style="flex:1 1 180px"/>
    </div>
  \`);

  // Emphasize default
  if (def === 'in') document.getElementById('actIn').classList.add('big'); else document.getElementById('actOut').classList.add('big');

  document.getElementById('actIn').onclick = async ()=>{
    let gender = undefined;
    if (genderAsk){
      const r = [...document.querySelectorAll('input[name="g"]')].find(x=>x.checked);
      if (!r) return alert('Kies geslag');
      gender = r.value;
    }
    const m = await mark(code,'in',gender);
    if (!m){ feedback(false); return renderResult('<div class="bad big">⚠️ Kon nie IN merk nie</div>'); }
    feedback(true);
    renderResult('<div class="ok big">✅ Ingeskandeer</div>');
  };

  document.getElementById('actOut').onclick = async ()=>{
    const m = await mark(code,'out');
    if (!m){ feedback(false); return renderResult('<div class="bad big">⚠️ Kon nie OUT merk nie</div>'); }
    feedback(true);
    renderResult('<div class="ok big">✅ Uitgeskandeer</div>');
  };
}

document.getElementById('lg_btn').onclick = login;
document.getElementById('startBtn').onclick = startCam;
document.getElementById('stopBtn').onclick = stopCam;
document.getElementById('goBtn').onclick = ()=>{
  const v = document.getElementById('manual').value.trim(); if (v) handleCode(v);
};
document.getElementById('manual').addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); const v=e.target.value.trim(); if(v) handleCode(v); }
});

(async function init(){
  if (await haveSession()){
    show('setupCard', true);
    await loadGates();
  } else {
    show('loginCard', true);
  }
})();
</script>
</div></body></html>`;
