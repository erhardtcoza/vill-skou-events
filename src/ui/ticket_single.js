// /src/ui/ticket_single.js
export function ticketSingleHTML(token) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Jou kaartjie</title>
  <style>
    :root{
      --bg:#f7f7f8; --card:#fff; --ink:#0b1320; --muted:#6b7280;
      --green:#0a7d2b; --chip:#e5e7eb; --ok:#136c2e; --warn:#92400e; --void:#991b1b;
    }
    *{ box-sizing:border-box }
    body{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial }
    .wrap{ max-width:760px; margin:18px auto 40px; padding:0 14px }
    h1{ margin:0 0 8px; font-size:clamp(22px,4.5vw,30px) }
    .lead{ color:var(--muted); margin:0 0 16px }
    .card{ background:var(--card); border-radius:16px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
    .row{ display:flex; justify-content:space-between; align-items:center; gap:10px }
    .pill{ font-size:12px; padding:6px 10px; border-radius:999px; border:1px solid #e5e7eb; color:#374151; background:#fff }
    .pill.ok{ background:#e7f7ec; border-color:#b9ebc6; color:var(--ok) }
    .pill.warn{ background:#fff8e6; border-color:#fde68a; color:var(--warn) }
    .pill.void{ background:#fee2e2; border-color:#fecaca; color:var(--void) }
    .who{ font-weight:800; font-size:18px; margin:6px 0 }
    .type{ font-weight:600 }
    .price{ font-weight:800 }
    .qr{ display:flex; justify-content:center; padding:12px }
    .qr img{ width:min(320px,80vw); height:auto; display:block; image-rendering:pixelated }
    .foot{ margin-top:12px; text-align:center; color:#4b5563; font-size:14px }
    .topbar{ display:flex; gap:8px; margin:10px 0 14px; flex-wrap:wrap }
    .btn{ appearance:none; border:0; background:var(--green); color:#fff; padding:10px 14px; border-radius:10px; font-weight:700; cursor:pointer }
    .btn.ghost{ background:#fff; color:#111; border:1px solid #e5e7eb }
    .empty{ color:#6b7280; }
    @media print{
      .topbar{ display:none !important }
      body{ background:#fff }
      .card{ box-shadow:none; border:1px solid #e5e7eb; page-break-inside:avoid }
      .qr img{ width:360px }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Jou kaartjie</h1>
    <div class="lead">Wys die QR by die hek sodat dit gescan kan word.</div>

    <div class="topbar"><button id="printBtn" class="btn">Druk | Stoor as PDF</button></div>

    <div id="box" class="card" hidden></div>
    <div id="empty" class="empty">Laai kaartjie…</div>
  </div>

<script type="module">
  const token = ${JSON.stringify(String(token||""))};
  const money = (c)=> 'R' + (Number(c||0)/100).toFixed(2);
  const qrURL = (data, size=300, fmt='png') =>
    \`https://api.qrserver.com/v1/create-qr-code/?format=\${fmt}&size=\${size}x\${size}&data=\${encodeURIComponent(data)}\`;

  document.getElementById('printBtn').addEventListener('click',()=>window.print());

  function pill(status){
    const s = String(status||'').toLowerCase();
    if (s==='used' || s==='out') return '<span class="pill warn">used</span>';
    if (s==='void') return '<span class="pill void">void</span>';
    return '<span class="pill ok">unused</span>';
  }

  async function load(){
    const box = document.getElementById('box');
    const empty = document.getElementById('empty');
    try{
      const r = await fetch('/api/public/tickets/by-token/'+encodeURIComponent(token));
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok){ empty.textContent = 'Kon nie kaartjie vind nie.'; return; }
      const t = j.ticket;
      const fullName = [t.attendee_first, t.attendee_last].filter(Boolean).join(' ');
      const qrImg = qrURL(t.qr, 320, 'png');

      box.innerHTML = \`
        <div class="row">
          <div class="type">\${t.type_name || 'Kaartjie'}</div>
          \${pill(t.state)}
        </div>
        <div class="who">\${fullName || ''}</div>
        <div class="row" style="margin:6px 0 8px">
          <div class="muted">\${t.event_name ? t.event_name : ''}\${t.venue ? ' · '+t.venue : ''}</div>
          <div class="price">\${typeof t.price_cents==='number' ? money(t.price_cents) : ''}</div>
        </div>
        <div class="qr"><img alt="QR vir toegang" src="\${qrImg}"/></div>
        <div class="foot">Bestel \${t.short_code || ''} · paid by \${t.buyer_name || '—'}</div>
      \`;
      empty.hidden = true;
      box.hidden = false;
    }catch(e){
      empty.textContent = 'Kon nie kaartjie laai nie.';
    }
  }
  load();
</script>
</body>
</html>`;
}
