// /src/ui/scanner.js
export const scannerHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scanner</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --green:#0a7d2b; --amber:#a36f00; --red:#b42318; --border:#e5e7eb }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:900px; margin:12px auto; padding:0 14px }
  h1{ margin:8px 0 12px; font-size:34px }
  .card{ background:var(--card); border-radius:16px; padding:14px; box-shadow:0 10px 26px rgba(0,0,0,.08) }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  .btn{ background:#f8fafc; border:1px solid var(--border); color:#2563eb; border-radius:10px; padding:8px 12px; cursor:pointer; font-weight:700 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .pill{ display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid var(--border); color:#444 }
  #view{ width:100%; aspect-ratio:3/4; background:#000; border-radius:10px; }
  #status{ color:var(--muted); margin-top:10px; font-weight:600 }

  /* Flash overlay */
  .flash{ position:fixed; inset:0; pointer-events:none; opacity:0; transition:opacity .15s ease }
  .flash.show{ opacity:.85 }
  .flash.ok{ background:rgba(10,125,43,.7) }
  .flash.warn{ background:rgba(163,111,0,.7) }
  .flash.err{ background:rgba(180,35,24,.8) }
  .flash .msg{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
               color:#fff; font-weight:900; font-size:40px; text-shadow:0 2px 18px rgba(0,0,0,.4) }

  /* Modal */
  .modal{ position:fixed; inset:0; background:rgba(0,0,0,.4); display:none; align-items:center; justify-content:center; padding:14px }
  .modal .box{ background:#fff; border-radius:14px; padding:16px; width:min(520px,90vw) }
  .modal h3{ margin:0 0 10px }
  label{ display:block; font-size:13px; color:#444; margin:8px 0 6px }
  input, select{ width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font:inherit; background:#fff }

  /* Gate bar */
  .bar{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px }
</style>
</head><body>
<div class="wrap">
  <div class="bar">
    <h1>Scanner</h1>
    <div class="row">
      <span id="gatePill" class="pill">Geen hek gekies</span>
      <button id="chooseGate" class="btn">Kies hek</button>
      <a href="/scan/login" class="btn">Sign out</a>
    </div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between">
      <h2 style="margin:0">Camera live scan</h2>
      <div class="row">
        <button id="pause" class="btn">Pause</button>
        <button id="flip" class="btn">Flip</button>
        <button id="torch" class="btn">Torch</button>
      </div>
    </div>
    <video id="view" playsinline muted></video>
    <div id="status">Camera starting…</div>
  </div>

  <div class="card" style="margin-top:12px">
    <div class="row">
      <input id="manual" placeholder="Type code manually (QR value)…"/>
      <button id="lookup" class="btn primary">Lookup</button>
    </div>
  </div>
</div>

<!-- flash overlay -->
<div id="flash" class="flash"><div class="msg" id="flashMsg"></div></div>

<!-- modal: gate selection -->
<div id="gateModal" class="modal">
  <div class="box">
    <h3>Kies Hek</h3>
    <label>Hek</label>
    <select id="gateSel"></select>
    <div class="row" style="margin-top:12px; justify-content:flex-end">
      <button id="gateOK" class="btn primary">OK</button>
    </div>
  </div>
</div>

<!-- modal: ticket details + gender -->
<div id="genderModal" class="modal">
  <div class="box">
    <h3>Besonderhede</h3>
    <div id="gdSummary" class="muted" style="margin-bottom:6px"></div>
    <label>Geslag</label>
    <select id="gdSelect">
      <option value="">—</option>
      <option value="male">Manlik</option>
      <option value="female">Vroulik</option>
      <option value="other">Ander</option>
    </select>
    <div class="row" style="margin-top:12px; justify-content:flex-end">
      <button id="gdSave" class="btn primary">Bevestig</button>
    </div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

/* ---------------- gate selection ---------------- */
let gates = [];
let gate_id = Number(localStorage.getItem("scan_gate_id")||0) || 0;
function setGatePill(){
  const g = gates.find(x=>x.id===gate_id);
  $("gatePill").textContent = g ? ("Hek: " + g.name) : "Geen hek gekies";
}

async function chooseGateFlow(){
  // load gates
  const j = await fetch('/api/scan/gates').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ alert('Kon nie hekke laai nie'); return; }
  gates = j.gates || [];
  // render
  const sel = $("gateSel");
  sel.innerHTML = gates.map(g=>\`<option value="\${g.id}">\${g.name} (\${g.event_id})</option>\`).join("");
  $("gateModal").style.display='flex';
  $("gateOK").onclick = ()=>{
    gate_id = Number(sel.value||0)||0;
    localStorage.setItem("scan_gate_id", String(gate_id));
    setGatePill();
    $("gateModal").style.display='none';
  };
}

/* ---------------- camera + scan ---------------- */
let mediaStream = null;
let facing = "environment";
let torchOn = false;
let paused = false;
let lastCode = "";     // to debounce
let lastAt   = 0;

async function startCam(){
  $("status").textContent = "Camera starting…";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width:{ideal:1280}, height:{ideal:1700} },
      audio: false
    });
    const video = $("view");
    video.srcObject = mediaStream;
    await video.play();
    $("status").textContent = "Camera running.";
    loopRead();
  } catch(e){
    $("status").textContent = "Kon nie kamera open nie: " + (e.message||e);
  }
}

$("pause").onclick = ()=>{
  paused = !paused;
  $("pause").textContent = paused ? "Resume" : "Pause";
};
$("flip").onclick = ()=>{ facing = (facing==="environment"?"user":"environment"); stopCam().then(startCam); };
$("torch").onclick = async ()=>{
  try{
    const t = mediaStream.getVideoTracks()[0];
    await t.applyConstraints({ advanced: [{ torch: !torchOn }] });
    torchOn = !torchOn;
    $("torch").textContent = torchOn ? "Torch ✓" : "Torch";
  }catch{}
};

async function stopCam(){ if (mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }}

// Simple barcode/QR read via browser BarcodeDetector when available
const SupportedFormats = ["qr_code","aztec","code_128","code_39","ean_13","pdf417"];
let detector = null;
async function loopRead(){
  if (!("BarcodeDetector" in window)){
    $("status").textContent = "BarcodeDetector nie beskikbaar nie – gebruik handmatige invoer.";
    return;
  }
  if (!detector){ try{ detector = new BarcodeDetector({ formats: SupportedFormats }); }catch{} }
  const video = $("view");
  while (mediaStream && !video.paused && !video.ended){
    if (!paused){
      try{
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length){
          const val = String(barcodes[0].rawValue||"").trim();
          const now = Date.now();
          if (val && (val!==lastCode || now-lastAt>1500)){
            lastCode = val; lastAt = now;
            handleCode(val);
          }
        }
      }catch{}
    }
    await sleep(120);
  }
}

/* ---------------- sounds + haptics + flashes ---------------- */
function vibrate(pattern){ try{ navigator.vibrate && navigator.vibrate(pattern); }catch{} }
const beepOK    = new Audio('data:audio/mp3;base64,//uQZAAAAAAAA...');
const beepWarn  = new Audio('data:audio/mp3;base64,//uQZAAAAAAAA...');
const beepErr   = new Audio('data:audio/mp3;base64,//uQZAAAAAAAA...');
// (the tiny data URIs above are placeholders; the browser will just no-op if it can't play)

async function flash(kind, text){
  const el = $("flash");
  const msg = $("flashMsg");
  msg.textContent = text||"";
  el.className = "flash show " + (kind==="ok"?"ok":kind==="warn"?"warn":"err");
  await sleep(250);
  el.classList.remove("show");
}

/* ---------------- API glue ---------------- */
async function scanApi(code, gender){
  const r = await fetch("/api/scan/scan", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ code, gate_id, gender: gender || null })
  });
  return await r.json().catch(()=>({ok:false,error:"network"}));
}

let pendingGender = null; // { code, summary }

async function handleCode(code){
  if (!gate_id){ await chooseGateFlow(); if (!gate_id) return; }

  const j = await scanApi(code, null);

  if (j?.ok && j.need_gender){
    pendingGender = { code, summary: j.ticket };
    $("gdSummary").textContent =
      \`\${j.ticket?.name||"Onbekend"} · \${j.ticket?.type||""} · \${j.ticket?.qr||""}\`;
    $("gdSelect").value = "";
    $("genderModal").style.display='flex';
    return;
  }

  renderOutcome(j);
}

$("gdSave").onclick = async ()=>{
  const g = $("gdSelect").value || "";
  if (!pendingGender || !g) { $("genderModal").style.display='none'; return; }
  const j = await scanApi(pendingGender.code, g);
  $("genderModal").style.display='none';
  renderOutcome(j);
  pendingGender = null;
};

function renderOutcome(j){
  if (!j || !j.ok){
    // Failures
    const reason = j?.reason || "invalid";
    const text =
      reason==="unpaid"     ? "Onbetaalde kaartjie" :
      reason==="wrong_date" ? "Verkeerde datum" :
      reason==="void"       ? "Ongeldig" :
      reason==="not_found"  ? "Nie gevind nie" :
                              "Ongeldig";
    flash("err", text);
    vibrate([80,80,80]); // three short buzzes
    try{ beepErr.currentTime=0; beepErr.play(); }catch{}
    $("status").textContent = "❌ " + (j?.error || text);
    return;
  }

  if (j.action === "in"){
    flash("ok", "IN");
    vibrate(50);
    try{ beepOK.currentTime=0; beepOK.play(); }catch{}
    $("status").textContent = "✅ In: " + (j.ticket?.name || "");
  } else if (j.action === "out"){
    flash("warn", "UIT");
    try{ beepWarn.currentTime=0; beepWarn.play(); }catch{}
    $("status").textContent = "↔️ Uit: " + (j.ticket?.name || "");
  } else {
    // pending (asked gender already)
    $("status").textContent = "Vul geslag in…";
  }
}

/* ---------------- manual entry ---------------- */
$("lookup").onclick = ()=>{
  const v = String($("manual").value||"").trim();
  if (v) handleCode(v);
};

/* ---------------- init ---------------- */
$("chooseGate").onclick = chooseGateFlow;
setGatePill();
startCam();
</script>
</body></html>`;
