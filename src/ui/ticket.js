// /src/ui/ticket.js
export const ticketHTML = (code) => `<!doctype html><html lang="af">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Kaartjies • ${escapeHtml(code || "")} • Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1000px; margin:20px auto; padding:0 16px }
  header{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px }
  .brand{ display:flex; align-items:center; gap:10px }
  .brand .logo{ width:36px; height:36px; border-radius:8px; background:var(--green) }
  .brand h1{ font-size:18px; margin:0 }
  .muted{ color:var(--muted) }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  .row{ display:flex; gap:12px; flex-wrap:wrap; }
  .btn{ padding:10px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:14px; margin-top:12px }
  .ticket{ border:1px solid #e5e7eb; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:10px }
  .ticket .top{ display:flex; align-items:center; justify-content:space-between; gap:10px }
  .pill{ font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444; background:#f9fafb }
  .qr-wrap{ display:flex; align-items:center; justify-content:center; background:#fff; border:1px dashed #e5e7eb; border-radius:10px; padding:8px }
  .qr-wrap img{ width:100%; max-width:260px; height:auto; display:block }
  .meta{ font-size:14px; line-height:1.3 }
  .actions{ display:flex; gap:8px; flex-wrap:wrap }
  .center{ text-align:center }
  .err{ color:#b42318; font-weight:600; margin-top:8px }
  @media print{
    body{ background:#fff }
    .no-print{ display:none !important }
    .grid{ grid-template-columns: repeat(2, 1fr) } /* 2 per row on print */
    .ticket{ break-inside: avoid; page-break-inside: avoid }
  }
</style>
</head>
<body>
<div class="wrap" id="app">
  <header class="no-print">
    <div class="brand">
      <div class="logo"></div>
      <div>
        <h1>Villiersdorp Skou</h1>
        <div class="muted">Toegangkaartjies • Bestel nommer: <b id="hdrCode">${escapeHtml(code || "")}</b></div>
      </div>
    </div>
    <div class="row">
      <button class="btn" id="btnBack" onclick="history.back()">← Terug</button>
      <button class="btn" id="btnRefresh">Herlaai</button>
      <button class="btn primary" id="btnPrint">Druk</button>
    </div>
  </header>

  <div class="card" id="statusCard">
    <div id="loading">Laai kaartjies vir kode <b>${escapeHtml(code || "")}</b>…</div>
    <div id="error" class="err" style="display:none"></div>
    <div id="none" class="muted" style="display:none">Kon nie kaartjies vind met kode <b>${escapeHtml(code || "")}</b> nie.</div>
  </div>

  <div class="grid" id="grid" style="display:none"></div>

  <div class="center muted" style="margin-top:12px">
    Het jy ’n probleem? Vra by die hek met jou bestel nommer <b>${escapeHtml(code || "")}</b>.
  </div>
</div>

<script>
const shortCode = ${JSON.stringify(code || "")};

const CDN_QR = "https://api.qrserver.com/v1/create-qr-code/"; // stable CDN

function esc(s){ return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])) }

function rands(c){ return "R" + ((c||0)/100).toFixed(2) }

function qrUrl(text, size=280){
  // Encode the *scanner payload* exactly as stored in tickets.qr
  const data = encodeURIComponent(String(text||""));
  return CDN_QR + "?size=" + size + "x" + size + "&data=" + data;
}

function templateTicket(t){
  const label = (t.attendee_first||t.attendee_last) ? esc((t.attendee_first||"") + " " + (t.attendee_last||"")) : "Besoeker";
  const type = esc(t.type_name || "Kaartjie");
  const price = (typeof t.price_cents === "number") ? rands(t.price_cents) : "—";
  const codeTail = esc(String(t.qr||"").slice(-6));

  const img = qrUrl(t.qr, 280);
  const dl = qrUrl(t.qr, 600); // nicer resolution download

  return \`
  <div class="ticket">
    <div class="top">
      <div style="font-weight:700">\${type}</div>
      <div class="pill">\${esc(t.state || 'unused')}</div>
    </div>
    <div class="qr-wrap"><img src="\${img}" alt="QR vir kaartjie"/></div>
    <div class="meta">
      <div><b>Naam:</b> \${label}</div>
      <div><b>Reeks:</b> \${codeTail}</div>
      <div><b>Prijs:</b> \${price}</div>
    </div>
    <div class="actions no-print">
      <a class="btn" href="\${dl}" download="ticket-\${codeTail}.png">Laai QR af</a>
    </div>
  </div>\`;
}

async function load(){
  const status = document.getElementById('statusCard');
  const loading = document.getElementById('loading');
  const err = document.getElementById('error');
  const none = document.getElementById('none');
  const grid = document.getElementById('grid');

  loading.style.display = 'block';
  err.style.display = 'none';
  none.style.display = 'none';
  grid.style.display = 'none';
  grid.innerHTML = '';

  try{
    // Uses the public helper that returns all tickets for the order short_code
    const r = await fetch('/api/public/tickets/by-code/' + encodeURIComponent(shortCode));
    const j = await r.json().catch(()=>({ok:false,error:'Bad JSON'}));
    if(!j.ok) throw new Error(j.error || 'Kon nie kaartjies kry nie');

    const tickets = j.tickets || [];
    if(!tickets.length){
      loading.style.display = 'none';
      none.style.display = 'block';
      return;
    }

    // Render all tickets
    grid.innerHTML = tickets.map(templateTicket).join('');
    loading.style.display = 'none';
    grid.style.display = 'grid';
  }catch(e){
    loading.style.display = 'none';
    err.textContent = (e && e.message) ? e.message : 'Netwerkfout';
    err.style.display = 'block';
  }
}

document.getElementById('btnPrint').onclick = () => window.print();
document.getElementById('btnRefresh').onclick = load;

load();

/* ------------ small helper so this module can inline-escape title ------------- */
function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
}
</script>
</body></html>`;
