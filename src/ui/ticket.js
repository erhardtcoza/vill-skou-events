// /src/ui/ticket.js
export const ticketHTML = (code) => `<!doctype html><html lang="af">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Jou kaartjie · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:880px; margin:18px auto; padding:0 14px }
  .card{ background:#fff; border-radius:16px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .hero{ display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap }
  .event{ flex:1 1 420px }
  h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:var(--muted) }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444; background:#fff }
  .grid{ display:grid; grid-template-columns: 1.2fr .9fr; gap:16px; margin-top:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .qrbox{ display:flex; align-items:center; justify-content:center; background:#111; border-radius:12px; padding:14px }
  .qrbox img{ width:100%; height:auto; max-width:330px; background:#fff; border-radius:8px }
  .rows{ display:grid; gap:10px; margin-top:8px }
  .row{ display:flex; justify-content:space-between; gap:10px; border-bottom:1px dashed #eee; padding:8px 0 }
  .row b{ font-weight:600 }
  .toolbar{ display:flex; gap:8px; flex-wrap:wrap }
  button,a.btn{ appearance:none; border:1px solid #e5e7eb; background:#fff; color:#111; padding:10px 12px; border-radius:10px; cursor:pointer; text-decoration:none }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .center{ text-align:center }
  .err{ color:#b42318; font-weight:600 }
</style>
</head>
<body>
  <div class="wrap" id="app">
    <div class="card center">Laai kaartjie…</div>
  </div>

<script>
const CODE = ${JSON.stringify(code)};

const esc = s => String(s??'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }
function whenRange(s,e){
  if(!s||!e) return '';
  const sd=new Date(s*1000), ed=new Date(e*1000);
  const o={ weekday:'short', day:'2-digit', month:'short' };
  return sd.toLocaleDateString('af-ZA',o)+' – '+ed.toLocaleDateString('af-ZA',o);
}

async function fetchJson(url){
  const r = await fetch(url);
  if (r.ok) return await r.json();
  const t = await r.text().catch(()=> '');
  throw new Error(t || ('HTTP '+r.status));
}

async function load(){
  const app = document.getElementById('app');

  // Try /api/public/tickets/:code first, then /api/public/ticket/:code
  let data, lastErr;
  const urls = [
    '/api/public/tickets/' + encodeURIComponent(CODE),
    '/api/public/ticket/' + encodeURIComponent(CODE),
  ];
  for (const u of urls){
    try { data = await fetchJson(u); if (data?.ok) break; } catch(e){ lastErr = e; }
  }
  if (!data?.ok){
    app.innerHTML = '<div class="card err">Kon nie kaartjie kry nie. '+esc(lastErr?.message||'')+'</div>';
    return;
  }

  const t = data.ticket || {};
  const ev = data.event || {};
  const type = data.ticket_type || {};
  const priceText = (typeof type.price_cents === 'number' ? rands(type.price_cents) : '');

  // We’ll use an image endpoint if present, else allow a data URL in payload
  const qrSrc = data.qr_url || ('/api/public/tickets/'+encodeURIComponent(CODE)+'/qr');

  app.innerHTML = \`
    <div class="card">
      <div class="hero">
        <div class="event">
          <h1>\${esc(ev.name||'Villiersdorp Skou')}</h1>
          <div class="muted">\${whenRange(ev.starts_at, ev.ends_at)}\${ev.venue ? ' · '+esc(ev.venue):''}</div>
          <div class="toolbar" style="margin-top:10px">
            <button class="btn" id="copyBtn" title="Kopieer kode">Kopieer kode</button>
            <a class="btn" id="shareBtn" href="#">Deel</a>
            <a class="btn" href="/" aria-label="Home">Tuis</a>
            <span class="pill">Kode: <b id="shortCode">\${esc(t.short_code||CODE)}</b></span>
          </div>
        </div>
      </div>

      <div class="grid" style="margin-top:14px">
        <div class="qrbox"><img id="qr" alt="QR" src="\${esc(qrSrc)}"/></div>

        <div class="rows">
          <div class="row"><b>Kaartjie tipe</b><span>\${esc(type.name||'')}</span></div>
          <div class="row"><b>Naam op kaartjie</b><span>\${esc([t.attendee_first,t.attendee_last].filter(Boolean).join(' ')||data.buyer_name||'-')}</span></div>
          <div class="row"><b>Status</b><span>\${esc(t.state||'unused')}</span></div>
          <div class="row"><b>Prys</b><span>\${priceText||'—'}</span></div>
          \${t.issued_at ? '<div class="row"><b>Uitgereik</b><span>'+new Date(t.issued_at*1000).toLocaleString('af-ZA')+'</span></div>' : ''}
        </div>
      </div>
    </div>
  \`;

  document.getElementById('copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(String(t.short_code||CODE));
      const b = document.getElementById('copyBtn');
      const orig = b.textContent; b.textContent = 'Gekopieer ✓';
      setTimeout(()=>b.textContent=orig, 1500);
    } catch {}
  };

  document.getElementById('shareBtn').onclick = (e) => {
    e.preventDefault();
    const link = location.href;
    const txt = 'My Villiersdorp Skou kaartjie: '+(t.short_code||CODE)+' '+link;
    // Try Web Share
    if (navigator.share){
      navigator.share({ title:'Villiersdorp Skou kaartjie', text:txt, url:link }).catch(()=>{});
      return;
    }
    // WhatsApp fallback
    const wa = 'https://wa.me/?text=' + encodeURIComponent(txt);
    location.href = wa;
  };
}

load();
</script>
</body></html>`;
