// /src/ui/tickets.js
export const ticketsHTML = (orderCode) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Jou kaartjies · ${orderCode || ''}</title>
<style>
  :root{ --green:#0a7d2b; --muted:#6b7280; --ink:#0b1320; --bg:#f7f7f8; --card:#fff; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  h1{ margin:0 0 6px; font-size:clamp(22px,4.5vw,36px) }
  .muted{ color:var(--muted) }
  .topActions{ display:flex; gap:10px; flex-wrap:wrap; margin:14px 0 18px }
  .btn{ appearance:none; border:0; background:var(--green); color:#fff; padding:10px 14px; border-radius:10px; font-weight:700; cursor:pointer }
  .btn.secondary{ background:#fff; color:#111; border:1px solid #e5e7eb }

  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }

  .ticket{ background:var(--card); border-radius:16px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  .head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px }
  .head h2{ margin:0; font-size:20px }
  .pill{ font-size:12px; padding:6px 10px; border-radius:999px; border:1px solid #e5e7eb; color:#374151; background:#fff }
  .pill.ok{ background:#e7f7ec; border-color:#b9ebc6; color:#136c2e }
  .pill.warn{ background:#fff8e6; border-color:#fde68a; color:#92400e }

  .who{ font-weight:700; margin:4px 0 2px }
  .typePrice{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:10px }
  .type{ font-size:16px }
  .price{ font-weight:800 }

  .qr{ display:flex; justify-content:center; align-items:center; padding:10px; }
  .qr img{ width:min(280px,72vw); height:auto; display:block }

  .actions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px }
  .foot{ margin-top:14px; text-align:center; color:#4b5563; font-size:14px }

  /* print */
  @media print{
    .topActions{ display:none }
    .grid{ grid-template-columns:1fr 1fr }
    body{ background:#fff }
    .ticket{ box-shadow:none; border:1px solid #e5e7eb }
  }
</style>
</head><body>
<div class="wrap">
  <h1>Jou kaartjies · <span id="code">${orderCode || ''}</span></h1>
  <div class="muted">Wys die QR by die hek sodat dit gescan kan word.</div>

  <div class="topActions">
    <button class="btn" id="printBtn">Druk | Stoor as PDF</button>
  </div>

  <div id="list" class="grid">
    <!-- tickets render here -->
  </div>
</div>

<script>
const code = ${JSON.stringify(orderCode||'')};
const R = cents => 'R' + ((cents||0)/100).toFixed(2);

function normalize(raw){
  // Normalize server payload into { order:{short_code,buyer_name}, tickets:[...] }
  const order = raw.order || raw || {};
  const tickets = raw.tickets || raw.items || [];
  return {
    order: {
      short_code: order.short_code || order.code || code || '',
      buyer_name: order.buyer_name || order.name || order.customer_name || ''
    },
    tickets: tickets.map(t => ({
      id: t.id || t.ticket_id,
      status: (t.status || '').toLowerCase(),        // 'unused' | 'used' | etc
      type_name: t.type_name || t.name || t.category || 'Kaartjie',
      price_cents: t.price_cents ?? t.priceCents ?? t.amount_cents ?? 0,
      attendee_first: t.attendee_first || t.first || t.first_name || '',
      attendee_last:  t.attendee_last  || t.last  || t.last_name  || '',
      qr_png_url: t.qr_png_url || t.qr || t.qr_url || ''
    }))
  };
}

function statusPill(s){
  if (s==='used') return '<span class="pill warn">redeem</span>';
  if (s==='unused' || !s) return '<span class="pill ok">unused</span>';
  return '<span class="pill">'+String(s)+'</span>';
}

function render(listEl, data){
  listEl.innerHTML = data.tickets.map(t => {
    const who = (t.attendee_first + ' ' + t.attendee_last).trim() || data.order.buyer_name || '';
    return \`
      <div class="ticket">
        <div class="head">
          <h2>Jou kaartjie</h2>
          \${statusPill(t.status)}
        </div>

        <div class="who">\${who ? who : ''}</div>

        <div class="typePrice">
          <div class="type">\${t.type_name}</div>
          <div class="price">\${R(t.price_cents)}</div>
        </div>

        <div class="qr">
          \${t.qr_png_url ? '<img alt="QR" src="'+t.qr_png_url+'"/>' : '<div class="muted">Geen QR beskikbaar</div>'}
        </div>

        <div class="actions">
          \${t.qr_png_url ? '<a class="btn secondary" download="ticket-'+(t.id||'')+'.png" href="'+t.qr_png_url+'">Download PNG</a>' : ''}
        </div>

        <div class="foot">Bestel \${data.order.short_code || ''} · paid by \${data.order.buyer_name || '—'}</div>
      </div>\`;
  }).join('');
}

async function load(){
  const list = document.getElementById('list');

  try{
    // Try a sensible default endpoint; adjust on server if needed.
    const res = await fetch('/api/public/orders/' + encodeURIComponent(code) + '/tickets', {
      credentials: 'include'
    }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!res || res.ok === false){ list.innerHTML = '<div class="muted">Kon nie kaartjies laai nie.</div>'; return; }

    const data = normalize(res);
    render(list, data);
  }catch(e){
    list.innerHTML = '<div class="muted">Fout met laai.</div>';
  }

  document.getElementById('printBtn').onclick = ()=> window.print();
}

load();
</script>
</body></html>`;
