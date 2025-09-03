// /src/ui/badge.js
import { qrClientScripts } from "./qr.js";

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
  .meta{ font-size:12px; color:#374151; }
  .qr-wrap{ display:flex; align-items:center; gap:12px; }
  #qr{ width:168px; height:168px; border:1px solid var(--border); }
  .big{ font-size:22px; font-weight:800; letter-spacing:.3px; word-break:break-all; }
  .tag{ display:inline-block; border:1px solid var(--border); border-radius:999px; padding:4px 8px; font-size:12px; margin-right:6px; }
  .foot{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#6b7280; }
  .print{ position:fixed; right:10px; top:10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer }
  .warn{ color:#b45309; font-size:12px; display:none }
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
    <canvas id="qr" width="168" height="168" aria-label="QR code"></canvas>
    <div>
      <div class="big">${pass.qr}</div>
      <div class="meta">Show this QR at the gate for IN / OUT scanning.</div>
      <div id="qrWarn" class="warn">QR library failed to load.</div>
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
${qrClientScripts()}
<script>
(function(){
  const code = ${JSON.stringify(pass.qr)};
  function render(){
    const ok = window.QR && window.QR.drawCanvas(document.getElementById('qr'), code, 4, 10, 'M');
    if (!ok) document.getElementById('qrWarn').style.display = '';
  }
  if (window.qrcode) render();
  else {
    document.addEventListener('qr:ready', render, { once:true });
    document.addEventListener('qr:error', ()=>{ document.getElementById('qrWarn').style.display=''; }, { once:true });
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
  .warn{ color:#b45309; font-size:12px; position:fixed; left:10px; top:12px; display:none }
  @media print{ .print,.warn{ display:none } }
  .grid{ display:grid; grid-template-columns: repeat(2, 1fr); gap:10mm; padding-top:34px; }
  .badge{ border:1px dashed var(--border); padding:8mm; break-inside:avoid; }
  .row{ display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .qr{ width:120px; height:120px; border:1px solid var(--border) }
  .qrwrap{ display:flex; gap:10px; align-items:center; }
  .big{ font-weight:800; font-size:18px; word-break:break-all; }
  .meta{ font-size:12px; color:#374151 }
</style>
</head><body>
<button class="print" onclick="window.print()">Print / Save PDF</button>
<div id="offlineWarn" class="warn">QR library failed to load.</div>
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

${qrClientScripts()}
<script>
(function(){
  function renderAll(){
    var okAny = false;
    document.querySelectorAll('canvas.qr').forEach(function(cv){
      var code = cv.getAttribute('data-code') || '';
      var ok = window.QR && window.QR.drawCanvas(cv, code, 3, 8, 'M');
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
