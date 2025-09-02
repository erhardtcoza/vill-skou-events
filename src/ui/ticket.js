// /src/ui/ticket.js
export const ticketHTML = (code) => `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kaartjie · ${code}</title>
<meta name="color-scheme" content="light dark">
<style>
:root{ --green:#0a7d2b; --muted:#667085; --card:#fff; --bg:#f7f7f8; }
@media (prefers-color-scheme:dark){
  :root{ --card:#111; --bg:#0b0b0c; --muted:#9aa3af }
}
*{ box-sizing:border-box }
body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
.wrap{ max-width:720px; margin:16px auto; padding:16px }
.card{ background:var(--card); border:1px solid #e5e7eb22; border-radius:16px; padding:16px; box-shadow:0 10px 24px rgba(0,0,0,.08) }
.header{ display:flex; align-items:center; gap:12px; margin-bottom:12px }
.header img.logo{ height:36px; width:auto; border-radius:8px }
.hero{ border-radius:12px; overflow:hidden; margin:10px 0 16px; background:#eef3; }
.hero img{ width:100%; max-height:200px; object-fit:cover; display:block }
h1{ margin:0 0 6px; font-size:22px; line-height:1.25 }
.meta{ color:var(--muted); font-size:14px }
.grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px }
@media (max-width:640px){ .grid{ grid-template-columns:1fr } }
.badge{ display:inline-block; padding:6px 10px; border-radius:999px; background:#e8f5ec; color:#0a7d2b; font-weight:700; font-size:13px }
.row{ display:flex; gap:12px; align-items:center; justify-content:space-between }
.qr{ display:flex; align-items:center; justify-content:center; padding:10px; border:1px dashed #e5e7eb; border-radius:12px; background:#fff }
.qr img{ width:220px; height:220px }
h3{ margin:12px 0 6px; font-size:16px }
.kv{ display:grid; grid-template-columns:130px 1fr; gap:8px; font-size:14px }
.kv div.key{ color:var(--muted) }
.actions a{ display:inline-block; margin-right:10px; margin-top:8px; padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; text-decoration:none; color:inherit }
.actions a.primary{ background:var(--green); color:#fff; border-color:transparent }
.terms{ color:var(--muted); font-size:12px; margin-top:10px }
@media print{
  body{ background:#fff }
  .wrap{ margin:0; padding:0 }
  .actions{ display:none }
}
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <img id="logo" class="logo" alt="logo" src="" style="display:none"/>
      <div>
        <div class="badge">Villiersdorp Skou</div>
        <h1 id="title">Kaartjie</h1>
        <div class="meta" id="subtitle"></div>
      </div>
    </div>

    <div class="hero" id="heroWrap" style="display:none"><img id="hero" alt=""/></div>

    <div class="grid">
      <div>
        <h3>Kaartjie inligting</h3>
        <div class="kv">
          <div class="key">Tipe</div><div id="ttype">—</div>
          <div class="key">Houernaam</div><div id="holder">—</div>
          <div class="key">Order #</div><div id="order">—</div>
          <div class="key">Kaartjie #</div><div id="ticket">—</div>
          <div class="key">Ingang</div><div id="gate">Enige</div>
          <div class="key">Status</div><div id="status">Geldig</div>
        </div>

        <div class="actions">
          <a id="cal" target="_blank" rel="noopener">Voeg by kalender</a>
          <a id="dirs" target="_blank" rel="noopener">Aanwysings</a>
          <a id="print" onclick="window.print()">Druk</a>
        </div>

        <div class="terms">Deur hierdie kaartjie te gebruik stem jy in tot die terreinreëls. Herinskrywing is onderhewig aan skandeer. Oordraagbaar slegs teen organisator se beleid.</div>
      </div>

      <div class="qr"><img id="qr" alt="QR"/></div>
    </div>
  </div>
</div>

<script>
const code = ${JSON.stringify(code)};

// Load site branding
async function loadSite(){
  const s = await fetch('/api/admin/site-settings').then(r=>r.json()).catch(()=>({ok:false}));
  if (s.ok && s.settings){
    if (s.settings.site_logo_url){ const l=document.getElementById('logo'); l.src=s.settings.site_logo_url; l.style.display='block'; }
  }
}

// Fetch ticket
async function loadTicket(){
  const r = await fetch('/api/public/tickets/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok){ document.getElementById('title').textContent='Onbekende kaartjie'; return; }
  const t = r.ticket, ev = r.event, tt = r.ticket_type;

  document.title = ev.name + ' · Kaartjie';
  document.getElementById('title').textContent = ev.name;
  const when = new Date(ev.starts_at*1000).toLocaleDateString('af-ZA',{weekday:'short',day:'2-digit',month:'short'}) +
               ' – ' + new Date(ev.ends_at*1000).toLocaleDateString('af-ZA',{weekday:'short',day:'2-digit',month:'short'});
  document.getElementById('subtitle').textContent = when + (ev.venue?(' · '+ev.venue):'');

  if (ev.hero_url){ const h=document.getElementById('hero'); h.src=ev.hero_url; document.getElementById('heroWrap').style.display='block'; }

  document.getElementById('ttype').textContent = tt ? tt.name : '—';
  document.getElementById('holder').textContent = t.holder_name || (r.order?.buyer_name || '—');
  document.getElementById('order').textContent = r.order ? (r.order.short_code || r.order.id) : '—';
  document.getElementById('ticket').textContent = t.serial || t.id;
  document.getElementById('gate').textContent = t.gate_name || 'Enige';
  document.getElementById('status').textContent = t.state || 'Geldig';

  // Simple QR render via CDN (swap later to self-SVG if you prefer)
  const qrData = t.scan_payload || t.code || code; // what your /scan expects
  document.getElementById('qr').src =
    'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(qrData);

  // Calendar
  const start = new Date(ev.starts_at*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  const end   = new Date(ev.ends_at*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  const calUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text='+encodeURIComponent(ev.name)
    + '&dates='+start+'/'+end
    + '&location='+encodeURIComponent(ev.venue||'')
    + '&details='+encodeURIComponent('Order '+(r.order?.short_code||r.order?.id||'')+' · Ticket '+(t.serial||t.id));
  document.getElementById('cal').href = calUrl;

  // Directions
  if (ev.venue){ document.getElementById('dirs').href = 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(ev.venue); }
  else { document.getElementById('dirs').style.display='none'; }
}

loadSite();
loadTicket();
</script>
</body></html>`;
