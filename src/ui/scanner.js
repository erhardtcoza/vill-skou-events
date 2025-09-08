// /src/ui/scanner.js
export const scannerHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scanner · Villiersdorp Skou</title>
<style>
  :root{ --green:#10b981; --amber:#f59e0b; --red:#ef4444; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:960px; margin:16px auto; padding:0 14px }
  h1{ margin:0 0 10px }
  .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  .muted{ color:var(--muted) }
  .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center }
  input{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:#0a7d2b; color:#fff; border-color:transparent }
  .state{ display:inline-block; padding:4px 8px; border-radius:999px; font-size:12px; border:1px solid #e5e7eb }
  .ok{ color:#065f46; border-color:#a7f3d0; background:#ecfdf5 }
  .warn{ color:#92400e; border-color:#fcd34d; background:#fffbeb }
  .bad{ color:#991b1b; border-color:#fecaca; background:#fef2f2 }
  video{ width:100%; border-radius:10px; background:#000 }
  canvas{ display:none }
  .result{ font-size:14px }
  .code{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight:700 }
  /* Flash overlay */
  .flash{ position:fixed; inset:0; pointer-events:none; opacity:0; transition:opacity .14s ease; }
  .flash.show{ opacity:0.50 }
</style>
<!-- jsQR (small, fast) -->
<script src="https://unpkg.com/jsqr/dist/jsQR.js"></script>
</head><body>
<div class="wrap">
  <h1>Scanner</h1>
  <div class="grid">
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="muted">Camera live scan</div>
        <div class="row">
          <button id="toggle" class="btn">Pause</button>
          <button id="flip" class="btn">Flip</button>
          <button id="torch" class="btn">Torch</button>
        </div>
      </div>
      <video id="video" autoplay playsinline></video>
      <canvas id="canvas"></canvas>
      <div id="liveMsg" class="muted" style="margin-top:8px">Point the camera at a QR code.</div>
    </div>

    <div class="card">
      <div class="row">
        <input id="code" placeholder="Type code manually (e.g. E4F3917274E7)" style="flex:1;min-width:220px"/>
        <button id="lookup" class="btn primary">Lookup</button>
      </div>
      <div id="status" class="muted" style="margin-top:8px"></div>
      <div id="result" class="result" style="margin-top:10px"></div>
    </div>
  </div>
</div>

<!-- Flash overlays -->
<div id="flashSuccess" class="flash" style="background:var(--green)"></div>
<div id="flashWarn" class="flash" style="background:var(--amber)"></div>
<div id="flashError" class="flash" style="background:var(--red)"></div>

<script>
const $ = (id)=>document.getElementById(id);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

/* ---------- Audio + Haptics + Flash helpers ---------- */
let actx = null;
function ensureAudio(){ if (!actx) try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch{} }

function beep(pattern){
  // pattern: array of [freqHz, ms, gain] steps
  if (!actx){ ensureAudio(); if(!actx) return; }
  const now = actx.currentTime;
  let t = now;
  pattern.forEach(([f, ms, g=0.2])=>{
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.frequency.value = f;
    gain.gain.setValueAtTime(g, t);
    osc.connect(gain).connect(actx.destination);
    osc.start(t);
    t += ms/1000;
    gain.gain.linearRampToValueAtTime(0.0001, t-0.02);
    osc.stop(t);
  });
}

function vibrate(pattern){ try{ navigator.vibrate && navigator.vibrate(pattern); }catch{} }

function flash(kind){
  const el = kind==='ok' ? $('flashSuccess') : kind==='warn' ? $('flashWarn') : $('flashError');
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 180);
}

function fx(kind){
  // Success: short pleasant beep + short vibrate + green flash
  if (kind==='ok'){
    beep([[880,100,0.18],[1320,120,0.16]]);
    vibrate([60,40,40]);
    flash('ok');
  }
  // Warn: mid beep + amber flash
  else if (kind==='warn'){
    beep([[660,160,0.18]]);
    vibrate([100]);
    flash('warn');
  }
  // Error: low buzz + red flash
  else {
    beep([[220,180,0.22],[180,140,0.20]]);
    vibrate([160,60,160]);
    flash('err');
  }
}

/* ---------- Camera + QR ---------- */
let stream = null, track = null, facing = 'environment', scanning = true, torchOn = false;
let lastCode = '', lastAt = 0;

function norm(s){ return String(s||'').trim().toUpperCase(); }

async function startCamera(){
  if (stream) await stopCamera();
  try{
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: {ideal:1280}, height:{ideal:720} },
      audio: false
    });
    $('video').srcObject = stream;
    track = stream.getVideoTracks()[0] || null;
    $('liveMsg').textContent = 'Camera running.';
  }catch(e){
    $('liveMsg').textContent = 'Camera error: ' + (e.message||e);
  }
}

async function stopCamera(){
  if (stream){
    stream.getTracks().forEach(t=>t.stop());
    stream = null; track = null;
  }
}

async function setTorch(on){
  try{
    if (!track) return false;
    const caps = track.getCapabilities?.();
    if (!caps || !caps.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: !!on }] });
    torchOn = !!on;
    return true;
  }catch{ return false; }
}

async function loop(){
  const video = $('video'); const canvas = $('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently:true });
  while(true){
    try{
      if (scanning && video.readyState === video.HAVE_ENOUGH_DATA){
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts:'dontInvert' });
        if (qr && qr.data){
          const code = norm(qr.data);
          const tooSoon = (Date.now() - lastAt) < 1400;
          if (!tooSoon && code && code !== lastCode){
            lastCode = code; lastAt = Date.now();
            $('code').value = code;
            await handleLookup(code, true);
          }
        }
      }
    }catch(e){
      $('status').textContent = 'Scan error: ' + (e.message||e);
    }
    await sleep(120);
  }
}

/* ---------- API ---------- */
function classifyState(state){
  const s = String(state||'').toLowerCase();
  if (s==='unused') return 'ok';
  if (s==='in' || s==='out') return 'warn';
  return 'err';
}

async function handleLookup(code, fromCamera=false){
  ensureAudio();
  $('status').textContent = 'Looking up ' + code + '…';
  $('result').innerHTML = '';
  try{
    const r = await fetch('/api/scan/lookup/' + encodeURIComponent(code));
    const j = await r.json();
    if (!j.ok){
      $('status').innerHTML = '<span class="state bad">Lookup failed</span>';
      $('result').innerHTML = '<div class="muted">No record for <span class="code">'+code+'</span>.</div>';
      fx('err');
      return;
    }
    $('status').innerHTML = '<span class="state ok">Found</span>';

    // Visual classification by current state
    const kind = j.kind; // 'ticket' | 'vendor_pass' | 'pass'
    if (kind === 'ticket'){
      const t = j.ticket;
      const who = [t.attendee_first, t.attendee_last].filter(Boolean).join(' ') || '(no name)';
      const level = classifyState(t.state);
      if (level==='ok') fx('ok'); else if (level==='warn') fx('warn'); else fx('err');

      const btnIn = (t.state !== 'in') ? '<button id="markIn" class="btn primary">Mark IN</button>' : '';
      const btnOut= (t.state === 'in') ? '<button id="markOut" class="btn">Mark OUT</button>' : '';
      $('result').innerHTML = \`
        <div><div class="muted">Ticket</div>
          <div style="font-weight:700">\${who}</div>
          <div>\${t.type_name || ''} · <span class="code">\${t.qr}</span></div>
          <div style="margin:6px 0">State: <span class="state \${t.state==='in'?'warn':(t.state==='unused'?'ok':'bad')}">\${t.state}</span></div>
          <div class="row">\${btnIn} \${btnOut}</div>
        </div>\`;
      $('markIn')?.addEventListener('click', ()=> mark('ticket', t.id, 'IN'));
      $('markOut')?.addEventListener('click', ()=> mark('ticket', t.id, 'OUT'));
    } else if (kind === 'vendor_pass' || kind === 'pass'){
      const v = j.pass;
      const label = v.label || v.holder_name || '(no label)';
      const level = classifyState(v.state);
      if (level==='ok') fx('ok'); else if (level==='warn') fx('warn'); else fx('err');

      const btnIn = (v.state !== 'in') ? '<button id="markIn" class="btn primary">Mark IN</button>' : '';
      const btnOut= (v.state === 'in') ? '<button id="markOut" class="btn">Mark OUT</button>' : '';
      $('result').innerHTML = \`
        <div><div class="muted">Vendor/Pass</div>
          <div style="font-weight:700">\${label}</div>
          <div>\${v.type || v.kind} · <span class="code">\${v.qr}</span></div>
          <div style="margin:6px 0">State: <span class="state \${v.state==='in'?'warn':(v.state==='unused'?'ok':'bad')}">\${v.state}</span></div>
          <div class="row">\${btnIn} \${btnOut}</div>
        </div>\`;
      $('markIn')?.addEventListener('click', ()=> mark(kind, v.id, 'IN'));
      $('markOut')?.addEventListener('click', ()=> mark(kind, v.id, 'OUT'));
    } else {
      fx('warn');
      $('result').innerHTML = '<div class="muted">Unknown kind.</div>';
    }
  }catch(e){
    $('status').innerHTML = '<span class="state bad">Network</span>';
    fx('err');
  }
}

async function mark(kind, id, action){
  $('status').textContent = 'Updating…';
  try{
    const r = await fetch('/api/scan/mark', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ kind, id, action })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'mark failed');
    $('status').innerHTML = '<span class="state ok">Updated</span>';
    fx('ok');
  }catch(e){
    $('status').innerHTML = '<span class="state bad">Failed</span>';
    fx('err');
  }
}

/* ---------- UI wiring ---------- */
$('lookup').onclick = ()=> {
  const code = norm($('code').value);
  if (!code) { $('status').textContent = 'Enter a code.'; return; }
  handleLookup(code, false);
};
$('toggle').onclick = ()=> {
  scanning = !scanning;
  $('toggle').textContent = scanning ? 'Pause' : 'Resume';
};
$('flip').onclick = async ()=> {
  facing = (facing === 'environment') ? 'user' : 'environment';
  await startCamera();
};
$('torch').onclick = async ()=> {
  const ok = await setTorch(!torchOn);
  if (!ok) $('status').textContent = 'Torch not supported on this device';
};

startCamera();
loop();
</script>
</body></html>`;
