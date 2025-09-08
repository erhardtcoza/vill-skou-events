// /src/ui/ticket.js
export function ticketHTML(code) {
  return `<!doctype html><html lang="af">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Jou kaartjies · ${escapeHtml(code || '')}</title>
<style>
  :root{
    --green:#0a7d2b; --bg:#f6f7f9; --muted:#6b7280; --ink:#111;
    --card:#fff; --ring:#e5e7eb;
  }
  *{box-sizing:border-box}
  body{margin:0; font-family:system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:var(--bg); color:var(--ink)}
  .wrap{max-width:960px; margin:14px auto; padding:0 14px}
  header{
    background:linear-gradient(90deg,#0a7d2b 0%, #1aa34a 60%, #a3d977 120%);
    color:#fff; border-radius:16px; padding:18px;
  }
  header h1{margin:0 0 6px; font-size:24px}
  header .muted{opacity:.9}
  .event-head{display:flex; gap:12px; align-items:center}
  .event-head img{width:68px; height:68px; object-fit:cover; border-radius:10px; background:#000; flex:0 0 auto}

  .grid{display:grid; grid-template-columns:1.15fr .85fr; gap:14px; margin-top:14px}
  @media (max-width:900px){ .grid{grid-template-columns:1fr} }

  .card{background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.06); border:1px solid var(--ring)}
  .pad{padding:14px}

  .tickets{display:grid; gap:12px}
  .ticket{
    display:grid; gap:10px; grid-template-columns: 1fr 180px; align-items:center;
    padding:12px; border:1px dashed #d8dde3; border-radius:12px; background:#fff;
  }
  @media (max-width:700px){ .ticket{ grid-template-columns:1fr } }

  .label{font-size:12px; color:var(--muted); margin-bottom:4px}
  .value{font-weight:600}
  .row{display:flex; gap:14px; flex-wrap:wrap}
  .badge{display:inline-block; border:1px solid var(--ring); border-radius:999px; padding:4px 8px; font-size:12px; color:#374151}
  .qrbox{width:180px; height:180px; border-radius:12px; border:1px solid var(--ring); display:flex; align-items:center; justify-content:center; background:#fff}
  .qrbox .code{font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight:700; font-size:18px}

  .hint{color:var(--muted); font-size:13px}
  .btn{display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:10px 12px; border-radius:10px; border:1px solid var(--ring); background:#fff; cursor:pointer; font-weight:600}
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{opacity:.6; cursor:not-allowed}

  .list{margin:0; padding:0; list-style:none}
  .list li{display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f2f4}
  .list li:last-child{border-bottom:0}
  .big{font-size:22px; font-weight:800}
  a{color:#0a7d2b; text-decoration:none}
</style>
</head>
<body>
<div class="wrap" id="app">
  <div class="card pad"><div>Laaidata…</div></div>
</div>

<script>
const code = ${JSON.stringify(code || '')};

function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function whenRange(s,e){
  if(!s||!e) return '';
  const sdt = new Date(s*1000), edt = new Date(e*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}

async function fetchFirstOk(paths){
  for(const p of paths){
    try{
      const r = await fetch(p);
      if(!r.ok) continue;
      const j = await r.json().catch(()=>null);
      if(j && (j.ok===true || j.tickets || j.order)) return j;
    }catch{}
  }
  return null;
}

/* Try a few likely endpoints; the first that returns data wins.
   Normalized shape we aim for:
   { ok:true, event:{...}, order:{...}, tickets:[{ id, qr, ticket_type:{name,price_cents}, attendee_first, attendee_last, gender }] }
*/
async function load(){
  const tries = [
    '/api/public/ticket/' + encodeURIComponent(code),
    '/api/public/tickets/by-code/' + encodeURIComponent(code),
    '/api/public/orders/by-code/' + encodeURIComponent(code),
    '/api/public/orders/lookup?code=' + encodeURIComponent(code)
  ];
  const data = await fetchFirstOk(tries);

  if(!data){
    document.getElementById('app').innerHTML =
      '<div class="card pad"><div>Kon nie kaartjies vind met kode <b>'+escapeHtml(code)+'</b> nie.</div></div>';
    return;
  }

  // Normalize
  const ev = data.event || data.order?.event || {};
  const order = data.order || {};
  const tickets = data.tickets || data.order?.tickets || [];

  render(ev, order, tickets);
}

function renderQR(el, text){
  // Placeholder: show big short code; we’ll swap in a QR encoder here next pass.
  el.innerHTML = '<div class="code">'+escapeHtml(text.slice(-6))+'</div>';
}

function render(ev, order, tickets){
  const app = document.getElementById('app');
  const hero = ev.hero_url || ev.poster_url || '';
  const buyer = (order.buyer_name || '').trim() || (order.contact?.name || '');
  const when = whenRange(ev.starts_at, ev.ends_at);

  app.innerHTML = \`
    <header class="card">
      <div class="event-head">
        \${hero ? '<img alt="" src="\'+escapeHtml(hero)+'"/>' : ''}
        <div>
          <h1>\${escapeHtml(ev.name || 'Jou kaartjies')}</h1>
          <div class="muted">\${when}\${ev.venue ? ' · '+escapeHtml(ev.venue):''}</div>
          <div class="muted">Bestel nommer: <b>\${escapeHtml(order.short_code || code)}</b>\${buyer ? ' · \'+escapeHtml(buyer):''}</div>
        </div>
      </div>
    </header>

    <div class="grid">
      <div class="card pad">
        <div class="label">Kaartjies</div>
        <div class="tickets" id="tickets"></div>
      </div>

      <div class="card pad">
        <div class="label">Opsomming</div>
        <ul class="list">
          <li><span>Aantal</span><span>\${tickets.length}</span></li>
          <li><span>Status</span><span>\${escapeHtml(order.status||'paid')}</span></li>
          <li><span>Betaal met</span><span>\${escapeHtml(order.payment_method||'-')}</span></li>
          <li class="big"><span>Totaal</span><span>\${rands(order.total_cents|| sumTickets(tickets))}</span></li>
        </ul>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn" id="shareBtn">Deel skakel</button>
          <a class="btn" href="/shop/\${encodeURIComponent(ev.slug||'')}" style="text-decoration:none">Koop nog</a>
        </div>
        <p class="hint" style="margin-top:10px">
          Wys asseblief die QR/kaartjie by die hek vir inskandering. Reg van toegang voorbehou.
        </p>
      </div>
    </div>
  \`;

  const holder = document.getElementById('tickets');
  holder.innerHTML = tickets.map(t=>{
    const nm = [t.attendee_first,t.attendee_last].filter(Boolean).join(' ') || buyer || 'Besitlike kaartjie';
    const tt = t.ticket_type || {};
    const g  = t.gender ? ' · ' + t.gender : '';
    return \`
      <div class="ticket">
        <div>
          <div class="row" style="align-items:center; margin-bottom:6px">
            <span class="badge">\${escapeHtml(tt.name||'Kaartjie')}</span>
            <span class="badge">\${rands(tt.price_cents||0)}</span>
            <span class="badge">\${escapeHtml(t.state||'unused')}</span>
          </div>
          <div class="value" style="margin-bottom:4px">\${escapeHtml(nm)}\${g}</div>
          <div class="hint">Kode: \${escapeHtml(t.qr || order.short_code || '')}</div>
        </div>
        <div class="qrbox"><div data-qr="\${escapeHtml(t.qr||'')}" class="qrPh"></div></div>
      </div>\`;
  }).join('');

  // Fill QR placeholders with something legible (short tail) for now
  document.querySelectorAll('.qrPh').forEach(ph=>{
    renderQR(ph, ph.getAttribute('data-qr') || order.short_code || code);
  });

  // Share
  const shareBtn = document.getElementById('shareBtn');
  shareBtn?.addEventListener('click', async ()=>{
    const url = location.href;
    const title = ev.name || 'Skou kaartjies';
    const text = 'Jou Skou kaartjies (' + (order.short_code||code) + ')';
    try{
      if (navigator.share){
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = 'Skakel gekopieer';
        setTimeout(()=> shareBtn.textContent = 'Deel skakel', 1800);
      }
    }catch{}
  });
}

function sumTickets(tickets){
  return (tickets||[]).reduce((s,t)=> s + (t.ticket_type?.price_cents||0), 0);
}

load();
</script>
</body></html>`;
}

/* ---------------- helpers ---------------- */
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
