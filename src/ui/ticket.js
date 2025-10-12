// /src/ui/ticket.js
export function ticketHTML(code) {
  const safe = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  return /*html*/ `
<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Jou kaartjies · ${safe(code)}</title>
  <link rel="icon" href="/favicon.ico"/>
  <style>
    :root{
      --bg:#f7f7f8; --card:#fff; --ink:#0b1320; --muted:#6b7280;
      --green:#0a7d2b; --chip:#e5e7eb; --ok:#136c2e; --warn:#92400e; --void:#991b1b;
    }
    *{ box-sizing:border-box }
    html,body{ margin:0; background:var(--bg); color:var(--ink);
      font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial }
    .wrap{ max-width:1100px; margin:18px auto 40px; padding:0 14px }
    h1{ margin:0 0 6px; font-size:clamp(22px,4.5vw,36px) }
    .lead{ color:var(--muted); margin:0 0 16px }
    .topbar{ display:flex; gap:10px; flex-wrap:wrap; margin:10px 0 18px }
    .btn{ appearance:none; border:0; background:var(--green); color:#fff; padding:10px 14px; border-radius:10px; font-weight:700; cursor:pointer }
    .btn.ghost{ background:#fff; color:#111; border:1px solid #e5e7eb }

    .grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px }
    @media (max-width:900px){ .grid{ grid-template-columns:1fr } }

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
    .qr img{ width:min(280px,72vw); height:auto; display:block; image-rendering:pixelated }

    .actions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px }
    .foot{ margin-top:12px; text-align:center; color:#4b5563; font-size:14px }

    .empty{ color:var(--muted); margin-top:10px }

    /* Print */
    @media print{
      .topbar{ display:none !important }
      body{ background:#fff }
      .grid{ grid-template-columns:1fr 1fr }
      .card{ box-shadow:none; border:1px solid #e5e7eb; page-break-inside:avoid; page-break-after:always }
      .qr img{ width:360px }
    }
  </style>
</head>
<body>
<div class="wrap">
  <h1>Jou kaartjies · <span id="hdrCode">${safe(code)}</span></h1>
  <div class="lead">Wys die QR by die hek sodat dit gescan kan word.</div>

  <div class="topbar">
    <button id="printAll" class="btn">Druk | Stoor as PDF</button>
  </div>

  <div id="list" class="grid" aria-live="polite"></div>
  <div id="empty" class="empty" hidden>Kon nie kaartjies vind met kode <strong>${safe(code)}</strong> nie.</div>
</div>

<script type="module">
  const orderCode = ${JSON.stringify(String(code||""))};

  const money = (c)=> 'R' + (Number(c||0)/100).toFixed(2);
  const qrURL = (data, size=280) => \`/api/qr/svg/\${encodeURIComponent(data)}\`; // internal fast QR

  document.getElementById('printAll').addEventListener('click',()=>window.print());

  function pill(status){
    const s = String(status||'').toLowerCase();
    if (s==='used' || s==='out') return '<span class="pill warn">used</span>';
    if (s==='void') return '<span class="pill void">void</span>';
    return '<span class="pill ok">unused</span>';
  }

  // Normalize to match our /api/public/tickets/by-code response
  function normalize(raw){
    const short = raw.short_code || orderCode;
    const tix = (raw.tickets || []).map(t => ({
      id: t.id,
      status: t.state || 'unused',
      type_name: t.type_name || 'Kaartjie',
      price_cents: Number.isFinite(t.price_cents) ? t.price_cents : 0,
      attendee_first: t.attendee_first || '',
      attendee_last:  t.attendee_last  || '',
      qr_string: t.qr || ''
    }));
    return { order: { short_code: short, buyer_name: raw.buyer_name || '' }, tickets: tix };
  }

  async function downloadSVG(data, name){
    const url = qrURL(data, 600);
    const res = await fetch(url, { mode:'cors' });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'ticket.svg';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function render(listEl, data){
    listEl.innerHTML = data.tickets.map(t=>{
      const who = [t.attendee_first, t.attendee_last].filter(Boolean).join(' ');
      const price = typeof t.price_cents === 'number' ? money(t.price_cents) : '';
      const qrImg = t.qr_string ? qrURL(t.qr_string) : '';

      return \`
        <div class="card">
          <div class="head">
            <h2>Jou kaartjie</h2>
            \${pill(t.status)}
          </div>

          <div class="who">\${who || ''}</div>

          <div class="typePrice">
            <div class="type">\${t.type_name}</div>
            <div class="price">\${price}</div>
          </div>

          <div class="qr">
            \${qrImg ? '<img alt="QR vir toegang" src="'+qrImg+'" loading="eager"/>' : ''}
          </div>

          <div class="actions">
            \${t.qr_string ? '<button class="btn ghost" data-dl="'+String(t.qr_string||'')+'" data-id="'+String(t.id||'')+'">Download QR (SVG)</button>' : ''}
          </div>

          <div class="foot">Bestel \${data.order.short_code || ''} · betaal deur \${data.order.buyer_name || '—'}</div>
        </div>\`;
    }).join('');

    // wire downloads
    listEl.querySelectorAll('[data-dl]').forEach(btn=>{
      btn.addEventListener('click',()=>downloadSVG(btn.getAttribute('data-dl')||'', \`ticket-\${btn.getAttribute('data-id')||''}.svg\`));
    });
  }

  async function load(){
    const list = document.getElementById('list');
    const empty = document.getElementById('empty');

    try{
      const r = await fetch('/api/public/tickets/by-code/' + encodeURIComponent(orderCode), { credentials:'include' });
      const j = await r.json().catch(()=>({ ok:false }));
      if (!j || j.ok === false){
        empty.hidden = false;
        empty.textContent = 'Kon nie kaartjies laai nie.';
        return;
      }
      const data = normalize(j);
      if (!data.tickets.length){ empty.hidden = false; return; }
      empty.hidden = true;
      render(list, data);
    }catch(e){
      empty.hidden = false;
      empty.textContent = 'Kon nie kaartjies laai nie: ' + (e.message || 'fout');
    }
  }

  load();
</script>
</body>
</html>`;
}
