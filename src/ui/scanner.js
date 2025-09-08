// /src/ui/scanner.js
export function scannerHTML() {
  return /*html*/`<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Skandeerder · Villiersdorp Skou</title>
  <style>
    :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#111; --warn:#92400e; --bad:#991b1b; --ok:#065f46; }
    *{ box-sizing:border-box }
    body{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial }
    .wrap{ max-width:960px; margin:18px auto; padding:0 14px }
    h1{ margin:0 0 10px }
    .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
    .panel{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:14px; margin-bottom:14px }
    .muted{ color:var(--muted) }
    .btn{ padding:10px 12px; border-radius:10px; border:0; background:var(--green); color:#fff; font-weight:600; cursor:pointer }
    .btn.ghost{ background:#e5e7eb; color:#111 }
    .btn.warn{ background:var(--warn); color:#fff }
    .btn.bad{ background:var(--bad); color:#fff }
    input{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff; min-width:260px }
    video{ width:100%; max-height:56vh; border-radius:12px; background:#000 }
    .status{ font-weight:700 }
    .ok{ color:var(--ok) } .warn{ color:var(--warn) } .bad{ color:var(--bad) }
    .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:14px }
    @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
    .ticket{ display:flex; flex-direction:column; gap:8px }
    .kv{ display:flex; justify-content:space-between; gap:10px; }
    .pill{ display:inline-block; padding:2px 8px; border-radius:999px; background:#e5e7eb; font-size:12px }
    .state-unused{ color:var(--ok) } .state-in{ color:var(--ok) } .state-out{ color:var(--warn) } .state-void{ color:var(--bad) }
    .qrbox{ display:flex; justify-content:center; }
    .qrbox img{ width:180px; height:180px; image-rendering: pixelated; }
    .actions{ display:flex; gap:8px; flex-wrap:wrap }
    .error{ color:var(--bad); font-weight:600 }
    .small{ font-size:13px }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Skandeerder</h1>

    <div class="grid">
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <div class="muted small">
            Gebruik jou kamera om ’n kaartjie se QR te skandeer. Indien die kamera nie beskikbaar is nie, tik die kode onder.
          </div>
          <div class="row">
            <button id="btnStart" class="btn">Begin kamera</button>
            <button id="btnStop" class="btn ghost">Stop</button>
            <button id="btnTorch" class="btn ghost" title="Skakel flits">🔦</button>
          </div>
        </div>
        <div style="margin-top:10px">
          <video id="video" muted playsinline></video>
        </div>
        <div class="row" style="margin-top:10px">
          <input id="manual" placeholder="Tik of plak QR / kaartjiekode" />
          <button id="btnCheck" class="btn">Kontroleer</button>
          <span id="scanMsg" class="muted small"></span>
        </div>
      </div>

      <div class="panel">
        <div id="resultEmpty" class="muted small">Geen kaartjie gelaai nie.</div>
        <div id="result" class="ticket" style="display:none">
          <div class="kv"><div>Kaartjie tipe</div><div id="tType" class="pill">–</div></div>
          <div class="kv"><div>Naam</div><div id="tName">–</div></div>
          <div class="kv"><div>Status</div><div id="tState" class="pill">–</div></div>
          <div class="kv"><div>Bestel nommer</div><div id="tOrder">–</div></div>
          <div class="kv"><div>Prys</div><div id="tPrice">–</div></div>
          <div class="qrbox" style="margin-top:6px"><img id="tQR" alt="QR"></div>
          <div class="actions" style="margin-top:6px">
            <button id="btnIn" class="btn">Merk IN</button>
            <button id="btnOut" class="btn warn">Merk UIT</button>
          </div>
          <div id="actMsg" class="muted small" style="margin-top:6px"></div>
        </div>
        <div id="err" class="error"></div>
      </div>
    </div>
  </div>

<script>
const $ = (id)=>document.getElementById(id);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const qrPNG = (data, size=220)=>\`https://api.qrserver.com/v1/create-qr-code/?format=png&size=\${size}x\${size}&data=\${encodeURIComponent(data)}\`;

let stream = null;
let detector = null;
let scanning = false;
let lastValue = "";
let lastAt = 0;
let track = null;

function setMsg(el, text, cls=""){
  el.textContent = text || "";
  el.className = (cls ? cls + " " : "") + el.className.replace(/\b(ok|warn|bad)\b/g,"").trim();
}

function showTicket(t){
  $("resultEmpty").style.display = "none";
  $("result").style.display = "flex";
  $("tType").textContent = t.type_name || "–";
  $("tName").textContent = [t.attendee_first,t.attendee_last].filter(Boolean).join(" ") || "–";
  const st = (t.state || "unused").toLowerCase();
  $("tState").textContent = st;
  $("tState").className = "pill state-" + (st==="in"?"in":st==="out"?"out":st==="void"?"void":"unused");
  $("tOrder").textContent = t.short_code || "–";
  $("tPrice").textContent = typeof t.price_cents==="number" ? ("R"+(t.price_cents/100).toFixed(2)) : "–";
  $("tQR").src = qrPNG(t.qr || "");
}

async function lookupTicket(qr){
  // try primary, then fallback
  let r = await fetch(\`/api/scan/ticket?qr=\${encodeURIComponent(qr)}\`, {credentials:"include"});
  if (r.status === 404) r = await fetch(\`/api/scan/lookup?qr=\${encodeURIComponent(qr)}\`, {credentials:"include"});
  const j = await r.json().catch(()=>({}));
  if (!j.ok) throw new Error(j.error || "Lookup het misluk");
  return j.ticket || j.tickets?.[0] || j;
}

async function mark(direction, qr){
  // primary endpoints
  let r = await fetch(\`/api/scan/\${direction}\`, {
    method:"POST", headers:{ "content-type":"application/json" }, credentials:"include",
    body: JSON.stringify({ qr })
  });
  if (r.status === 404) {
    // fallback mark API
    r = await fetch("/api/scan/mark", {
      method:"POST", headers:{ "content-type":"application/json" }, credentials:"include",
      body: JSON.stringify({ qr, direction })
    });
  }
  const j = await r.json().catch(()=>({}));
  if (!j.ok) throw new Error(j.error || "Aksie het misluk");
  return j.ticket || j;
}

async function handleValue(val){
  const now = Date.now();
  if (val === lastValue && (now - lastAt) < 2000) return; // debounce same code
  lastValue = val; lastAt = now;
  $("err").textContent = ""; $("actMsg").textContent = ""; setMsg($("scanMsg"), ""); 

  try {
    setMsg($("scanMsg"), "Soek kaartjie…");
    const t = await lookupTicket(val);
    showTicket(t);
    setMsg($("scanMsg"), "Gevind", "ok");
    $("btnIn").onclick = async ()=>{
      $("actMsg").textContent = "Merk IN…";
      try{
        const r = await mark("in", t.qr || val);
        showTicket(r.ticket || r);
        setMsg($("actMsg"), "IN gemerk", "ok");
      }catch(e){ $("actMsg").textContent = e.message || "Fout"; }
    };
    $("btnOut").onclick = async ()=>{
      $("actMsg").textContent = "Merk UIT…";
      try{
        const r = await mark("out", t.qr || val);
        showTicket(r.ticket || r);
        setMsg($("actMsg"), "UIT gemerk", "ok");
      }catch(e){ $("actMsg").textContent = e.message || "Fout"; }
    };
  } catch(e){
    $("result").style.display = "none";
    $("resultEmpty").style.display = "block";
    $("err").textContent = e.message || "Kon nie kaartjie vind nie";
    setMsg($("scanMsg"), "Nie gevind nie", "bad");
  }
}

async function startCam(){
  $("err").textContent = "";
  try{
    // Prefer environment (rear) camera
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" }, audio:false });
    const v = $("video");
    v.srcObject = stream;
    await v.play();
    track = stream.getVideoTracks()[0];

    // BarcodeDetector if available
    if ("BarcodeDetector" in window) {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      scanning = true;
      loopDetect();
    } else {
      setMsg($("scanMsg"), "Geen BarcodeDetector; gebruik handmatige invoer", "warn");
    }
  }catch(e){
    $("err").textContent = "Kamera fout: " + (e.message || e);
  }
}

async function loopDetect(){
  const v = $("video");
  while (scanning && detector) {
    try{
      const codes = await detector.detect(v);
      if (codes && codes.length) {
        const val = String(codes[0].rawValue || "").trim();
        if (val) await handleValue(val);
      }
    }catch{}
    await sleep(120);
  }
}

function stopCam(){
  scanning = false;
  if (track) { try { track.stop(); } catch{} track = null; }
  if (stream) { try { stream.getTracks().forEach(t=>t.stop()); } catch{} stream = null; }
  detector = null;
}

async function toggleTorch(){
  try{
    if (!track) return;
    const caps = track.getCapabilities?.() || {};
    if (!("torch" in caps)) return;
    const st = track.getSettings?.() || {};
    const want = !st.torch;
    await track.applyConstraints({ advanced:[{ torch: want }] });
  }catch{}
}

$("btnStart").onclick = startCam;
$("btnStop").onclick = stopCam;
$("btnTorch").onclick = toggleTorch;

$("btnCheck").onclick = ()=>{
  const val = ($("manual").value||"").trim();
  if (val) handleValue(val);
};

// Auto start if permissions previously allowed
if (navigator.mediaDevices?.getUserMedia) {
  // don’t auto start on desktop if you prefer; leave manual
}
</script>
</body>
</html>`;
}
