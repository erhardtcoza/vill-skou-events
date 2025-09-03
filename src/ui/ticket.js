// /src/ui/ticket.js
import { qrImg } from "./qr.js";

/**
 * Public ticket page at /t/:code
 * Looks up ticket by code using /api/public/tickets/:code
 */
export function ticketHTML(code) {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ticket</title>
<style>
  :root{--green:#0a7d2b;--muted:#667085;--bg:#f7f7f8}
  *{box-sizing:border-box} body{font-family:system-ui;margin:0;background:var(--bg)}
  .wrap{max-width:900px;margin:22px auto;padding:0 16px}
  .card{background:#fff;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,.07);padding:16px}
  .head{display:flex;gap:12px;align-items:center}
  .title{font-weight:800;font-size:22px;margin:0}
  .muted{color:var(--muted)}
  .grid{display:grid;grid-template-columns:1fr 260px;gap:18px}
  .qr{text-align:center}
  button{padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;background:#fff}
  .primary{background:var(--green);color:#fff;border-color:var(--green)}
</style></head><body>
<div class="wrap">
  <div class="card">
    <div class="head"><h1 class="title">Jou kaartjie</h1><span class="muted" id="code"></span></div>
    <div id="state" class="muted" style="margin:4px 0 12px;"></div>
    <div class="grid">
      <div id="left"></div>
      <div class="qr" id="qr"></div>
    </div>
  </div>
</div>

<script>
const code = ${JSON.stringify(code)};
document.getElementById('code').textContent = code;

function rands(c){ return 'R'+( (c||0)/100 ).toFixed(2); }

async function load(){
  const res = await fetch('/api/public/tickets/'+encodeURIComponent(code));
  if(!res.ok){
    document.getElementById('left').innerHTML = '<p>Kaartjie nie gevind nie.</p>';
    return;
  }
  const data = await res.json();
  const t = data.ticket, tt=data.ticket_type||{}, ev=data.event||{}, ord=data.order||{};
  const when = (s,e) => {
    const sd=new Date((s||0)*1000), ed=new Date((e||0)*1000);
    const fmt = d=> d.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'});
    return fmt(sd)+' – '+fmt(ed);
  };

  document.getElementById('state').textContent =
    (t.state==='unused'?'Geldig – nog nie gescan nie': t.state==='in'?'In terrein': t.state==='out'?'Uit terrein':'Ongeldig');

  document.getElementById('left').innerHTML = \`
    <h3>\${ev.name||'Event'}</h3>
    <div class="muted">\${when(ev.starts_at,ev.ends_at)} · \${ev.venue||''}</div>
    <hr/>
    <p><strong>Ticket:</strong> \${tt.name||''}</p>
    <p><strong>Naam:</strong> \${t.holder_name || (ord.buyer_name||'')}</p>
    <p class="muted">Bestel nommer: \${ord.short_code || ord.id || ''}</p>
    <p class="muted">Prys: \${rands(tt.price_cents)}</p>
    <div style="margin-top:12px"><button onclick="window.print()">Print</button></div>
  \`;

  // QR
  const qrHTML = ${JSON.stringify(qrImg("PLACEHOLDER"))}.replace('PLACEHOLDER', encodeURIComponent(t.qr || t.code || ''));
  document.getElementById('qr').innerHTML = qrHTML + '<div class="muted" style="margin-top:6px">'+(t.qr||t.code||'')+'</div>';
}
load();
</script>
</body></html>`;
}
