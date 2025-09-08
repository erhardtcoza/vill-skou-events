// /src/ui/ticket.js
export const ticketHTML = (code) => `<!doctype html><html lang="af">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jou kaartjies · ${escapeHtml(code)}</title>
<style>
  :root{ --green:#0a7d2b; --muted:#6b7280; --bg:#f6f7f8 }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:900px; margin:24px auto; padding:0 16px }
  h1{ margin:0 0 12px }
  .muted{ color:var(--muted) }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin:12px 0 }
  .row{ display:flex; gap:14px; align-items:center; flex-wrap:wrap }
  .pill{ display:inline-block; padding:4px 8px; border-radius:999px; background:#eef2f7; color:#333; font-size:12px }
  .ticket{ display:flex; gap:16px; align-items:center }
  .qr{ width:110px; height:110px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:700 }
  .btn{ appearance:none; border:0; background:#0a7d2b; color:#fff; padding:10px 14px; border-radius:10px; font-weight:600; cursor:pointer }
  a{ color:#0a7d2b; text-decoration:underline }
  .err{ color:#b42318; font-weight:600 }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Jou kaartjies · <span class="pill">${escapeHtml(code)}</span></h1>
    <div id="msg" class="muted">Laai kaartjies…</div>
    <div id="tickets"></div>
    <div class="card">
      <div class="row">
        <button id="btnCopy" class="btn">Kopieer skakel</button>
        <a id="btnShare" href="#" style="font-weight:600">Deel</a>
      </div>
      <div class="muted" style="margin-top:8px">Wys enige kaartjie se QR-kode by die hek om in te gaan.</div>
    </div>
  </div>

<script>
const CODE = ${JSON.stringify(code || "")};

function rands(c){ return "R" + ((c||0)/100).toFixed(2); }

async function load(){
  const msg = document.getElementById('msg');
  const box = document.getElementById('tickets');
  msg.textContent = "Laai kaartjies…";
  try{
    // Public endpoint (no auth)
    const r = await fetch('/api/public/tickets/by-code/' + encodeURIComponent(CODE));
    const t = await r.text();
    let j; try { j = JSON.parse(t) } catch { j = { ok:false, error:t } }
    if (!j.ok || !(j.tickets||[]).length){
      msg.innerHTML = 'Kon nie kaartjies vind met kode <b>' + esc(CODE) + '</b> nie.';
      return;
    }
    msg.textContent = '';
    const rows = j.tickets;
    box.innerHTML = rows.map(renderTicket).join('');
  }catch(e){
    msg.innerHTML = '<span class="err">Kon nie laai nie:</span> ' + esc(String(e));
  }

  // share/copy helpers
  const shareUrl = window.location.href;
  document.getElementById('btnCopy').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(shareUrl); alert('Skakel gekopieer'); }catch{}
  };
  document.getElementById('btnShare').onclick = (e)=>{
    if (navigator.share){
      e.preventDefault();
      navigator.share({ title:'Jou kaartjies', url: shareUrl }).catch(()=>{});
    }
  };
}

function renderTicket(t){
  // We don't generate an actual QR image here (no library in worker UI).
  // We show the QR string big; scanners can still type/scan from PDF later if needed.
  // If you want a real QR: render server-side PNG and link it here.
  return \`
    <div class="card ticket">
      <div class="qr">\${esc(t.qr).slice(0,10)}</div>
      <div style="flex:1; min-width:240px">
        <div style="font-weight:700">\${esc(t.type_name)}</div>
        <div class="muted">\${esc(t.attendee_first||'')} \${esc(t.attendee_last||'')}</div>
        <div class="muted" style="margin-top:6px">Status: <span class="pill">\${esc(stateLabel(t.state))}</span></div>
      </div>
      <div style="text-align:right; min-width:90px; font-weight:700">\${rands(t.price_cents)}</div>
    </div>\`;
}

function stateLabel(s){
  if (s==='in') return 'By die terrein';
  if (s==='out') return 'Uitgegaan';
  if (s==='void') return 'Nietig';
  return 'Ongebruik';
}

function esc(s){ return String(s??'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

document.addEventListener('DOMContentLoaded', load);
</script>
</body></html>`;

function escapeHtml(s){
  return String(s??'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
