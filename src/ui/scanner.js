// /src/ui/scanner.js
export const scannerHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scanner</title>
<style>
  :root{
    --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff;
    --green:#0a7d2b; --amber:#a36f00; --red:#b42318; --border:#e5e7eb;
    --paid-bg:#e7f7ec; --paid-border:#b9ebc6; --paid-text:#136c2e;
    --unpaid-bg:#fff8e6; --unpaid-border:#fde68a; --unpaid-text:#a36f00;
    --err-bg:#fee2e2; --err-border:#fecaca; --err-text:#b42318;
  }
  *{ box-sizing:border-box }
  body{
    margin:0;
    font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--ink)
  }
  .wrap{ max-width:900px; margin:12px auto 40px; padding:0 14px }
  h1{ margin:8px 0 12px; font-size:34px }
  .card{
    background:var(--card); border-radius:16px; padding:14px;
    box-shadow:0 10px 26px rgba(0,0,0,.08); margin-bottom:12px
  }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  .btn{
    background:#f8fafc; border:1px solid var(--border); color:#2563eb;
    border-radius:10px; padding:8px 12px; cursor:pointer; font-weight:700
  }
  .btn.primary{
    background:var(--green); color:#fff; border-color:transparent
  }
  #view{
    width:100%; aspect-ratio:3/4; background:#000; border-radius:10px;
  }
  #status{
    color:var(--muted); margin-top:10px; font-weight:600;
    min-height:1.4em;
  }

  /* Result block */
  #resultBox .pill{
    display:inline-block; font-size:13px; font-weight:700;
    border-radius:999px; padding:6px 10px; border:1px solid transparent;
    margin-right:8px;
  }
  .pill.paid{
    background:var(--paid-bg); border-color:var(--paid-border); color:var(--paid-text);
  }
  .pill.unpaid{
    background:var(--unpaid-bg); border-color:var(--unpaid-border); color:var(--unpaid-text);
  }
  .pill.err{
    background:var(--err-bg); border-color:var(--err-border); color:var(--err-text);
  }

  .ticketRow{
    border:1px solid var(--border);
    border-radius:12px;
    padding:10px 12px;
    margin-top:8px;
    background:#fff;
  }
  .ticketHead{
    display:flex; flex-wrap:wrap;
    justify-content:space-between; gap:8px;
    font-weight:600;
    font-size:15px;
  }
  .ticketMeta{
    color:var(--muted); font-size:14px; margin-top:4px;
  }

  /* Camera control row */
  .ctrlRow{
    display:flex; flex-wrap:wrap;
    justify-content:space-between; gap:8px; align-items:center;
  }

  @media (max-width:500px){
    h1{ font-size:28px }
  }
</style>
</head><body>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
    <h1 style="margin:8px 0 4px">Ticket Check</h1>
    <a href="/scan/login" class="btn">Sign out</a>
  </div>
  <div style="color:var(--muted);font-size:14px;margin-bottom:12px">
    Scan 'n kaartjie of tik 'n kode om vinnig te kyk of dit betaal is.
  </div>

  <div class="card">
    <div class="ctrlRow">
      <h2 style="margin:0;font-size:18px">Camera scan</h2>
      <div class="row" style="flex-shrink:0">
        <button id="pause" class="btn">Pause</button>
        <button id="flip" class="btn">Flip</button>
        <button id="torch" class="btn">Torch</button>
      </div>
    </div>
    <video id="view" playsinline muted></video>
    <div id="status">Camera starting…</div>
  </div>

  <div class="card">
    <div class="row" style="width:100%">
      <input id="manual" style="flex:1 1 auto;min-width:140px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font:inherit"
        placeholder="Scan of tik QR / bestel kode (bv. CAXHIEG)…"/>
      <button id="lookup" class="btn primary">Check</button>
    </div>
  </div>

  <div id="resultBox" class="card" style="display:none">
    <div id="paidLine" style="margin-bottom:8px"></div>
    <div id="ticketsList"></div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

/* ---------------- camera + scan ---------------- */
let mediaStream = null;
let facing = "environment";
let torchOn = false;
let paused = false;
let lastCode = "";     // debounce
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
    const track = mediaStream && mediaStream.getVideoTracks && mediaStream.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
    torchOn = !torchOn;
    $("torch").textContent = torchOn ? "Torch ✓" : "Torch";
  }catch{}
};

async function stopCam(){
  if (mediaStream){
    mediaStream.getTracks().forEach(t=>t.stop());
    mediaStream = null;
  }
}

// Use built-in browser BarcodeDetector if available
const SupportedFormats = ["qr_code","aztec","code_128","code_39","ean_13","pdf417"];
let detector = null;
async function loopRead(){
  if (!("BarcodeDetector" in window)){
    $("status").textContent = "BarcodeDetector nie beskikbaar nie – gebruik handmatige kode.";
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
            doCheck(val);
          }
        }
      }catch{}
    }
    await sleep(120);
  }
}

/* ---------------- API: /api/scan/check ---------------- */
async function apiCheck(code){
  const r = await fetch("/api/scan/check", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ code })
  });
  return await r.json().catch(()=>({ok:false,error:"network"}));
}

/* ---------------- render result ---------------- */
function centsToRand(c){
  const n = Number(c||0);
  const rands = (n/100).toFixed(2);
  return "R"+rands;
}

function renderResult(j){
  const box = $("resultBox");
  const paidLine = $("paidLine");
  const list = $("ticketsList");

  if (!j || !j.ok){
    box.style.display = "block";
    paidLine.innerHTML = \`
      <span class="pill err">NIE GEVIND / ONGELDIG</span>
    \`;
    list.textContent = j?.error || j?.reason || "No result";
    return;
  }

  // paid/unpaid indicator
  const pillClass = j.paid ? "paid" : "unpaid";
  const pillText  = j.paid ? "BETAAL" : "ONBETAALD";
  paidLine.innerHTML = \`<span class="pill \${pillClass}">\${pillText}</span>\`;

  // tickets in that order / single ticket
  const rows = (j.items||[]).map(t=>{
    const who = [t.attendee_first||"", t.attendee_last||""].filter(Boolean).join(" ");
    return \`
      <div class="ticketRow">
        <div class="ticketHead">
          <div>\${who || "(geen naam)"} · \${t.type_name || ""}</div>
          <div>\${(t.price_cents||0) ? centsToRand(t.price_cents) : ""}</div>
        </div>
        <div class="ticketMeta">
          QR: \${t.qr || ""} · Ticket #\${t.ticket_id || ""}<br/>
          Order: \${t.order_code || ""} (\${t.order_status || ""})<br/>
          State: \${t.state || ""}
        </div>
      </div>\`;
  }).join("");

  list.innerHTML = rows || "<div class='ticketMeta'>Geen kaartjies</div>";
  box.style.display = "block";
}

/* ---------------- main actions ---------------- */
async function doCheck(code){
  $("status").textContent = "Checking…";
  const j = await apiCheck(code);
  renderResult(j);
  $("status").textContent = j && j.ok
    ? (j.paid ? "✅ Betaal" : "⚠ Nie betaal nie")
    : "❌ Nie gevind nie";
}

/* manual lookup button */
$("lookup").onclick = ()=>{
  const v = String($("manual").value||"").trim();
  if (v) doCheck(v);
};

/* ---------------- init ---------------- */
startCam();
</script>
</body></html>`;
