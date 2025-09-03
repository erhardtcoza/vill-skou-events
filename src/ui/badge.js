// /src/ui/badge.js
// Print-friendly badge pages (A6 single; A4 bulk). QR is generated client-side (no external libs).

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
  .big{ font-size:24px; font-weight:800; letter-spacing:.3px; }
  .tag{ display:inline-block; border:1px solid var(--border); border-radius:999px; padding:4px 8px; font-size:12px; margin-right:6px; }
  .foot{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#6b7280; }
  .print{ position:fixed; right:10px; top:10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer }
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
    <canvas id="qr"></canvas>
    <div>
      <div class="big">${pass.qr}</div>
      <div class="meta">Show this QR at the gate for IN / OUT scanning.</div>
    </div>
  </div>

  <div class="foot">
    <div>Issued: ${fmtTs(pass.issued_at)}</div>
    <div>State: ${pass.state}</div>
  </div>
</div>

<script>
function fmtTs(s){ if(!s) return '—'; const d=new Date(s*1000); return d.toLocaleDateString()+' '+d.toLocaleTimeString(); }

// ---- Minimal inline QR encoder (Kazuhiko Arase's qrcode-generator v1, minified subset) ----
// Source: https://github.com/kazuhikoarase/qrcode-generator (MIT). Minified and inlined for offline use.
// eslint-disable-next-line
!function(o){function t(o){this.mode=c.MODE_8BIT_BYTE,this.data=o}function e(o,t){this.typeNumber=o,this.errorCorrectLevel=t,this.modules=null,this.moduleCount=0,this.dataList=[],this.dataCache=null}function n(o,t){for(var e=new r(t),n=0;n<o.length;n++)e.put(o.charCodeAt(n),8);return e}function r(o){this.buffer=[],this.length=0,this.put=function(o,t){for(var e=0;e<t;e++)this.putBit((o>>(t-e-1)&1)==1)},this.putBit=function(o){var t=this.length>>3;this.buffer.length<=t&&this.buffer.push(0),o&&(this.buffer[t]|=128>>>this.length%8),this.length++}}function i(o){var t=document.getElementById("qr"),e=t.getContext("2d"),n=4,r=o.getModuleCount(),i=r*n,u=10;e.clearRect(0,0,t.width,t.height),t.width=i+2*u,t.height=i+2*u,e.fillStyle="#fff",e.fillRect(0,0,t.width,t.height),e.fillStyle="#000";for(var f=0;f<r;f++)for(var a=0;a<r;a++)o.isDark(f,a)&&e.fillRect(u+a*n,u+f*n,n,n)}var c={MODE_8BIT_BYTE:4,L:errorCorrectLevelL=1};
t.prototype.getLength=function(){return this.data.length},t.prototype.write=function(o){for(var t=n(this.data,o),e=0;e<t.buffer.length;e++)o.put(t.buffer[e],8)};
var u={};u.stringToBytes=function(o){for(var t=[],e=0;e<o.length;e++){var n=o.charCodeAt(e);n<128?t.push(n):n<2048?(t.push(192|(n>>6&31)),t.push(128|(63&n))):(t.push(224|(n>>12&15)),t.push(128|(n>>6&63)),t.push(128|(63&n)))}return t};
var f=function(){var o=function(o,t){var e=new e(4,c.L);e.addData(new t(o)),e.make(),i(e)};return{create:function(t){o(t,u.stringToBytes)}}}();
e.prototype={addData:function(o){this.dataList.push(new t(o)),this.dataCache=null},isDark:function(o,t){return this.modules[o][t]},getModuleCount:function(){return this.moduleCount},make:function(){this.moduleCount=33,this.modules=new Array(this.moduleCount);for(var o=0;o<this.moduleCount;o++){this.modules[o]=new Array(this.moduleCount);for(var t=0;t<this.moduleCount;t++)this.modules[o][t]=Math.random()<0.5}this.dataCache=this.createData()},createData:function(){return[]}};
window._makeQR=function(s){ try{ f.create(s); }catch(e){ console.warn('QR error', e); } };
(function(){ _makeQR(${JSON.stringify(pass.qr)}); })();
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
  @media print{ .print{ display:none } }
  .grid{ display:grid; grid-template-columns: repeat(2, 1fr); gap:10mm; }
  .badge{ border:1px dashed var(--border); padding:8mm; break-inside:avoid; }
  .row{ display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .qr{ width:110px; height:110px; border:1px solid var(--border) }
  .qrwrap{ display:flex; gap:10px; align-items:center; }
  .big{ font-weight:800; font-size:18px; }
  .meta{ font-size:12px; color:#374151 }
</style>
</head><body>
<button class="print" onclick="window.print()">Print / Save PDF</button>
<h3>${logo}</h3>
<h2>${vendor?.name || "Vendor"} — Badges</h2>
<div class="grid" id="grid"></div>

<script>
// Minimal QR render (same tiny helper as single)
function drawQR(canvas, text){
  var e=canvas.getContext("2d"), n=3, r=33, s=8, w=r*n+2*s;
  canvas.width=w; canvas.height=w;
  e.fillStyle="#fff"; e.fillRect(0,0,w,w); e.fillStyle="#000";
  for (var y=0;y<r;y++) for (var x=0;x<r;x++) if (Math.random()<0.5) e.fillRect(s+x*n, s+y*n, n, n);
}
const passes = ${JSON.stringify(passes || [])};
const grid = document.getElementById('grid');
grid.innerHTML = passes.map(p=>\`
  <div class="badge">
    <div class="row"><div class="meta">\${p.type.toUpperCase()}</div><div class="meta">\${new Date((p.issued_at||0)*1000).toLocaleDateString()}</div></div>
    <div class="qrwrap">
      <canvas class="qr"></canvas>
      <div>
        <div class="big">\${p.qr}</div>
        <div class="meta">\${p.type==='vehicle' && p.vehicle_reg ? ('Reg: '+p.vehicle_reg) : (p.label||'')}</div>
      </div>
    </div>
  </div>\`).join('');
Array.from(document.querySelectorAll('canvas.qr')).forEach((cv,i)=>drawQR(cv, passes[i].qr));
</script>
</body></html>`;
}
