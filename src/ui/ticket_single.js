// /src/ui/ticket_single.js
export function ticketSingleHTML(token) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  return /*html*/ `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Jou kaartjie</title>
  <link rel="icon" href="/favicon.ico"/>
  <style>
    :root{
      --bg:#f7f7f8; --card:#fff; --ink:#0b1320; --muted:#6b7280;
      --green:#0a7d2b; --chip:#e5e7eb; --ok:#136c2e; --warn:#92400e; --void:#991b1b;
    }
    *{ box-sizing:border-box }
    html,body{ margin:0; background:var(--bg); color:var(--ink);
      font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial }
    .wrap{ max-width:760px; margin:18px auto 40px; padding:0 14px }
    h1{ margin:0 0 6px; font-size:clamp(22px,4.5vw,34px) }
    .lead{ color:var(--muted); margin:0 0 16px }

    .card{ background:var(--card); border-radius:16px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
    .head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }
    .head h2{ margin:0; font-size:20px }
    .pill{ font-size:12px; padding:6px 10px; border-radius:999px; border:1px solid #e5e7eb; color:#374151; background:#fff }
    .pill.ok{ background:#e7f7ec; border-color:#b9ebc6; color:var(--ok) }
    .pill.warn{ background:#fff8e6; border-color:#fde68a; color:var(--warn) }
    .pill.void{ background:#fee2e2; border-color:#fecaca; color:var(--void) }

    .who{ font-weight:800; font-size:18px; margin:2px 0 4px }
    .typePrice{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:8px }
    .type{ font-size:16px }
    .price{ font-weight:800 }

    .qr{ display:flex; justify-content:center; align-items:center; padding:10px }
    .qr img{ width:min(320px,78vw); height:auto; display:block; image-rendering:pixelated }

    .actions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; justify-content:center }
    .btn{ appearance:none; border:0; background:var(--green); color:#fff; padding:10px 14px; border-radius:10px; font-weight:700; cursor:pointer }
    .btn.ghost{ background:#fff; color:#111; border:1px solid #e5e7eb }

    .foot{ margin-top:12px; text-align:center; color:#4b5563; font-size:14px }
    .empty{ color:var(--muted); margin-top:10px }

    @media print{
      .btn{ display:none !important }
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

  <div id="view" class="card" aria-live="polite"></div>
  <div id="empty" class="empty" hidden>Kon nie kaartjie vind nie.</div>
</div>

<script type="module">
  const token = ${JSON.stringify(String(token||""))};
  const money = (c)=> 'R' + (Number(c||0)/100).toFixed(2);
  const qrURL = (data, size=320, fmt='png') =>
    \`https://api.qrserver.com/v1/create-qr-code/?format=\${fmt}&size=\${size}x\${size}&data=\${encodeURIComponent(data)}\`;

  function pill(status){
    const s = String(status||'').toLowerCase();
    if (s==='used' || s==='out') return '<span class="pill warn">used</span>';
    if (s==='void') return '<span class="pill void">void</span>';
    return '<span class="pill ok">unused</span>';
  }

  async function downloadPNG(data, name){
    const url = qrURL(data, 600, 'png');
    const res = await fetch(url, { mode:'cors' });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'ticket.png';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  async function load(){
    const view = document.getElementById('view');
    const empty = document.getElementById('empty');

    try{
      const r = await fetch('/api/public/tickets/by-token/' + encodeURIComponent(token));
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok || !j.ticket){ empty.hidden = false; return; }

      const t = j.ticket;
      const who = [t.attendee_first, t.attendee_last].filter(Boolean).join(' ') || '';
      const price = typeof t.price_cents === 'number' ? money(t.price_cents) : '';
      const qrImg = qrURL(t.qr, 320, 'png');

      view.innerHTML = \`
        <div class="head">
          <h2>Jou kaartjie</h2>
          \${pill(t.state)}
        </div>

        <div class="who">\${who}</div>
        <div class="typePrice">
          <div class="type">\${t.type_name || 'Kaartjie'}</div>
          <div class="price">\${price}</div>
        </div>

        <div class="qr"><img alt="QR vir toegang" src="\${qrImg}"/></div>

        <div class="actions">
          <button class="btn" onclick="window.print()">Druk | Stoor as PDF</button>
          <button class="btn ghost" id="dl">Download PNG</button>
        </div>

        <div class="foot">
          Bestel \${t.short_code || ''} · paid by \${t.buyer_name || '—'}
        </div>\`;

      document.getElementById('dl')?.addEventListener('click', ()=>downloadPNG(t.qr, \`ticket-\${t.id}.png\`));
    }catch(e){
      empty.hidden = false;
      empty.textContent = 'Kon nie kaartjie laai nie: ' + (e.message || 'fout');
    }
  }
  load();
</script>
</body>
</html>`;
}
