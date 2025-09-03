// /src/ui/ticket.js
//
// Public ticket view at /t/:code
// Fetches ticket details then renders a printable pass with a QR.
// Uses the same QR helper format we use elsewhere (CDN).

import { qrIMG } from "./qr.js";

export const ticketHTML = (code) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kaartjie · ${code}</title>
<style>
  :root{--green:#0a7d2b;--bg:#f7f7f8;--text:#111;--muted:#667085}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui}
  .wrap{max-width:860px;margin:24px auto;padding:0 16px}
  .card{background:#fff;border-radius:16px;box-shadow:0 18px 42px rgba(0,0,0,.08);padding:16px}
  .header{display:flex;gap:14px;align-items:center}
  .event{font-size:22px;font-weight:800}
  .muted{color:var(--muted)}
  .grid{display:grid;grid-template-columns:220px 1fr;gap:18px;margin-top:14px}
  @media (max-width:760px){.grid{grid-template-columns:1fr}}
  .pill{border:1px solid #e6e7eb;border-radius:999px;padding:6px 10px;display:inline-block}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid #d1d5db;background:#fff;cursor:pointer}
  @media print{
    body{background:#fff}
    .btnbar{display:none}
    .card{box-shadow:none;border:1px solid #ddd}
  }
</style>
</head><body><div class="wrap">

  <div class="btnbar" style="margin-bottom:12px">
    <button class="btn" onclick="window.print()">Druk/Print</button>
  </div>

  <div id="ticket" class="card">Laai kaartjie…</div>

<script>
const code = ${JSON.stringify(code)};

function rands(c){ return 'R'+((c||0)/100).toFixed(2); }
function fmtDateRange(s,e){
  const S=new Date((s||0)*1000), E=new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  const t = { hour:'2-digit', minute:'2-digit' };
  const sd = S.toLocaleDateString('af-ZA',opts)+' '+S.toLocaleTimeString('af-ZA',t);
  const ed = E.toLocaleDateString('af-ZA',opts)+' '+E.toLocaleTimeString('af-ZA',t);
  return sd.split(' ').slice(0,3).join(' ') + ' · ' + ed.split(' ').slice(0,3).join(' ');
}

async function load(){
  const el = document.getElementById('ticket');
  const res = await fetch('/api/public/tickets/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false}));
  if(!res.ok){ el.innerHTML = '<div class="muted">Kon nie kaartjie kry nie.</div>'; return; }

  const t = res.ticket || {};
  const tt = res.ticket_type || {};
  const ev = res.event || {};
  const who = t.holder_name || [t.attendee_first||'', t.attendee_last||''].filter(Boolean).join(' ') || '(onbekend)';
  const when = fmtDateRange(ev.starts_at, ev.ends_at);
  const price = rands((tt.price_cents||0));
  const qr = ${JSON.stringify(qrIMG('${CODE_PLACEHOLDER}', 220))}.replace('${CODE_PLACEHOLDER}', code);

  el.innerHTML = \`
    <div class="header">
      <div class="event">\${ev.name || 'Event'}</div>
      <span class="pill">\${ev.venue || ''}</span>
    </div>
    <div class="muted" style="margin-top:4px">\${when}</div>

    <div class="grid">
      <div>\${qr}</div>
      <div>
        <h3 style="margin:0 0 6px">Kaartjie</h3>
        <div><strong>Tipe:</strong> \${tt.name || ''}</div>
        <div><strong>Houernaam:</strong> \${who}</div>
        <div><strong>Status:</strong> \${t.state || 'unused'}</div>
        <div><strong>Serie/Code:</strong> \${t.code || t.qr || code}</div>
        <div style="margin-top:8px"><strong>Betaal:</strong> \${price}</div>
        <div class="muted" style="margin-top:10px">Wys hierdie QR by die hek vir toegang.</div>
      </div>
    </div>
  \`;
}

load();
</script>
</div></body></html>`;
