// /src/ui/badge.js
// Print-friendly badge pages (A6 single; A4 bulk) with real QR codes.
// Uses "qrcode-generator" via CDN + SRI for integrity. Falls back with a warning if offline.

const QR_LIB_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
const QR_LIB_SRI = "sha256-7aB2Q9vVexq0j8+ZqYHcQeX0aAioO6oR5GQ3i1i7E1I="; // pinned

function qrScriptTag() {
  return `
<script>
(function(){
  if (window.qrcode) return;
  var s = document.createElement('script');
  s.src = ${JSON.stringify(QR_LIB_URL)};
  s.integrity = ${JSON.stringify(QR_LIB_SRI)};
  s.crossOrigin = "anonymous";
  s.onload = function(){ document.dispatchEvent(new Event('qr:ready')); };
  s.onerror = function(){
    console.warn('Could not load QR library. You appear to be offline.');
    document.dispatchEvent(new Event('qr:error'));
  };
  document.head.appendChild(s);
})();
</script>`;
}

function qrHelpers() {
  // Use qrcode-generator to draw on a <canvas> or inline SVG
  return `
<script>
function drawQRToCanvas(canvas, text, cell=4, margin=10){
  if (!window.qrcode) { console.warn('QR lib missing'); return false; }
  // auto select type number (0 = best fit) and L error correction
  var qr = qrcode(0, 'L'); // 'L','M','Q','H'
  qr.addData(text);
  qr.make();
  var count = qr.getModuleCount();
  var size = count * cell + 2 * margin;
  var ctx = canvas.getContext('2d');
  canvas.width = size; canvas.height = size;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,size,size);
  ctx.fillStyle = '#000';
  for (var r=0; r<count; r++){
    for (var c=0; c<count; c++){
      if (qr.isDark(r,c)) ctx.fillRect(margin + c*cell, margin + r*cell, cell, cell);
    }
  }
  return true;
}

function makeSvgQR(text, cell=4, margin=10){
  if (!window.qrcode) { console.warn('QR lib missing'); return null; }
  var qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  var count = qr.getModuleCount();
  var size = count * cell + 2 * margin;
  var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'];
  svg.push('<rect width="100%" height="100%" fill="#fff"/>');
  for (var r=0; r<count; r++){
    for (var c=0; c<count; c++){
      if (qr.isDark(r,c)){
        var x = margin + c*cell, y = margin + r*cell;
        svg.push('<rect x="'+x+'" y="'+y+'" width="'+cell+'" height="'+cell+'" fill="#000"/>');
      }
    }
  }
  svg.push('</svg>');
  return svg.join('');
}
</script>`;
}

export function singleVendorPassBadgeHTML({ pass, vendor, settings }) {
  const title = (settings?.name) || "Villiersdorp Skou";
  const logo = settings?.logo_url ? `<img src="${settings.logo_url}" alt="logo" style="height:26px">` : title;

  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Badge · ${vendor?.name || "Vendor"}</title>
<style>
  :root{ --green:#0a7d2b; --border:#d1d5db }
  @page{ size: A6; margin: 8mm }
  *{ box-sizing:border-box }
  body{ font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin:0; padding:0; background:#fff; }
  .card{ width:100%; height:100%; border:1px dashed var(--border); display:flex; flex-direction:column; justify-content:space-between; padding:10mm; }
  .head{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
  h1{ font-size:16px; margin:0; }
  .meta{ font-size:12px; color:#374151; }
  .qr-wrap{ display:flex; align-items:center; gap:12px; }
  #qr{ width:128px; height:128px; border:1px solid var(--border); }
  .big{ font-size:22px; font-weight:800; letter-spacing:.3px; word-break:break-all; }
  .tag{ display:inline-block; border:1px solid var(--border); border-radius:999px; padding:4px 8px; font-size:12px; margin-right:6px; }
  .foot{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#6b7280; }
  .print{ position:fixed; right:10px; top:10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer }
  .warn{ color:#b45309; font-size:12px; }
  @media print{ .print{ display:none } }
</style>
</head><body>
<button class="print" onclick="window.print()">Print / Save PDF</button>
<div class="card">
  <div class="head">
    <div>${logo}</div>
    <div class="meta">
      <div><span class="tag">${pass.type.toUpperCase()}</span><span class="tag">${vendor?.stall_no ? ('Stall '+vendor.stall_no) : 'Vendor'}</span></div>
      <div>${vendor?.name || ''}</div>
      ${pass.type === 'vehicle' && pass.vehicle_reg ? `<div>Reg: <strong>${pass.vehicle_reg}</strong></div>` : ''}
      ${pass.type === 'staff' && pass.label ? `<div>Staff: <strong>${pass.label}</strong></div>` : ''}
    </div>
  </div>

  <div class="qr-wrap">
    <canvas id="qr" width="148" height="148" aria-label="QR code"></canvas>
    <div>
      <div class="big">${pass.qr}</div>
      <div class="meta">Show this QR at the gate for IN / OUT scanning.</div>
      <div id="qrWarn" class="warn" style="display:none">QR library not loaded (offline). The image above is not encoded.</div>
    </div>
  </div>

  <div class="foot">
    <div>Issued: ${fmtTs(pass.issued_at)}</div>
    <div>State: ${pass.state}</div>
  </div>
</div>

<script>
function fmtTs(s){ if(!s) return '—'; const d=new Date(s*1000); return d.toLocaleDateString()+' '+d.toLocaleTimeString(); }
</script>
${qrScriptTag()}
${qrHelpers()}
<script>
(function(){
  const text = ${JSON.stringify(pass.qr)};
  function render(){
    const ok = drawQRToCanvas(document.getElementById('qr'), text, 4, 10);
    if (!ok) document.getElementById('qrWarn').style.display = '';
  }
  if (window.qrcode) render();
  else {
    document.addEventListener('qr:ready', render, { once:true });
    document.addEventListener('qr:error', function(){ document.getElementById('qrWarn').style.display = ''; }, { once:true });
  }
})();
</script>
</body></html>`;
}

export function bulkVendorBadgesHTML({ vendor, passes, settings }) {
  const title = (settings?.name) || "Villiersdorp Skou";
  const logo = settings?.logo_url ? `<img src="${settings.logo_url}" alt="logo" style="height:18px">` : title;

  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Badges · ${vendor?.name || "Vendor"}</title>
<style>
  :root{ --border:#d1d5db }
  @page{ size: A4; margin: 10mm }
  body{ font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin:0; }
  .print{ position:fixed; right:10px; top:10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer }
  .warn{ color:#b45309; font-size:12px; position:fixed; left:10px; top:12px; }
  @media print{ .print,.warn{ display:none } }
  .grid{ display:grid; grid-template-columns: repeat(2, 1fr); gap:10mm; padding-top:34px; }
  .badge{ border:1px dashed var(--border); padding:8mm; break-inside:avoid; }
  .row{ display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .qr{ width:110px; height:110px; border:1px solid var(--border) }
  .qrwrap{ display:flex; gap:10px; align-items:center; }
  .big{ font-weight:800; font-size:18px; word-break:break-all; }
  .meta{ font-size:12px; color:#374151 }
</style>
</head><body>
<button class="print" onclick="window.print()">Print / Save PDF</button>
<div id="offlineWarn" class="warn" style="display:none">QR library not loaded (offline). Badges will not contain encoded QR.</div>
<h3 style="margin:12px 10mm 0;">${logo}</h3>
<h2 style="margin:4px 10mm 10px;">${vendor?.name || "Vendor"} — Badges</h2>
<div class="grid" id="grid">
  ${(passes||[]).map(p => `
    <div class="badge">
      <div class="row"><div class="meta">${(p.type||'').toUpperCase()}</div><div class="meta">${p.issued_at? new Date(p.issued_at*1000).toLocaleDateString() : ''}</div></div>
      <div class="qrwrap">
        <canvas class="qr" data-code="${String(p.qr)}" width="120" height="120"></canvas>
        <div>
          <div class="big">${p.qr}</div>
          <div class="meta">${p.type==='vehicle' && p.vehicle_reg ? ('Reg: '+p.vehicle_reg) : (p.label||'')}</div>
        </div>
      </div>
    </div>
  `).join('')}
</div>

${qrScriptTag()}
${qrHelpers()}
<script>
(function(){
  function renderAll(){
    var okAny = false;
    document.querySelectorAll('canvas.qr').forEach(function(cv){
      var code = cv.getAttribute('data-code') || '';
      var ok = drawQRToCanvas(cv, code, 3, 8);
      okAny = okAny || ok;
    });
    if (!okAny) document.getElementById('offlineWarn').style.display = '';
  }
  if (window.qrcode) renderAll();
  else {
    document.addEventListener('qr:ready', renderAll, { once:true });
    document.addEventListener('qr:error', function(){ document.getElementById('offlineWarn').style.display = ''; }, { once:true });
  }
})();
</script>
</body></html>`;
}
