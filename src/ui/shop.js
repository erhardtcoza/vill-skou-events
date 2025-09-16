// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{
    --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --card:#ffffff; --ink:#111;
    --shadow:0 12px 26px rgba(0,0,0,.08);
  }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (poster never cropped) */
  .hero{ position:relative; border-radius:14px; overflow:hidden; background:#111; display:flex; align-items:flex-end }
  .hero img{ width:100%; height:auto; display:block; object-fit:contain; background:#111 }
  .hero .meta{
    position:absolute; left:0; right:0; bottom:0;
    color:#fff; padding:18px;
    background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0));
  }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* LAYOUT */
  .grid{ display:grid; grid-template-columns: 1.3fr .9fr; gap:16px; margin-top:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }

  .card{ background:var(--card); border-radius:14px; box-shadow:var(--shadow); padding:18px }

  /* INFO CARD */
  .facts{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:8px 0 6px }
  .fact{ background:#f3f5f4; border-radius:10px; padding:8px 10px; font-size:14px }
  @media (max-width:520px){ .facts{ grid-template-columns:1fr } }

  details.more > summary { cursor:pointer; list-style:none; }
  details.more > summary::-webkit-details-marker { display:none; }
  details.more > summary{ padding:8px 0; font-weight:600 }

  /* TICKETS LIST */
  h2{ margin:10px 0 12px }
  .ticket{ display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:12px 0; border-bottom:1px solid #f1f3f5 }
  .ticket:last-child{ border-bottom:0 }
  .price{ color:#374151; font-weight:600; }
  .sub{ font-size:12px; color:#6b7280 }
  .qty{ display:flex; align-items:center; gap:10px }
  .btn{ padding:10px 12px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }
  .chip{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }

  /* STICKY BAR (mobile) */
  .sticky{
    position:sticky; bottom:0; z-index:20; background:transparent; margin-top:10px;
  }
  .sticky .bar{
    display:none;
    position:fixed; left:0; right:0; bottom:0; z-index:50;
    padding:10px 12px; background:rgba(255,255,255,.92); backdrop-filter:saturate(150%) blur(6px);
    border-top:1px solid #e5e7eb;
  }
  .sticky .bar .row{
    max-width:1100px; margin:auto; display:flex; gap:10px; align-items:center; justify-content:space-between;
  }
  .pillTotal{ font-weight:800 }
  @media (max-width:900px){
    .sticky .bar{ display:flex }
  }

  /* FLOATING SHEET for ticket selection (mobile) */
  .sheet{
    display:none; position:fixed; left:0; right:0; bottom:0; top:0; z-index:60;
    background:rgba(0,0,0,.35);
  }
  .sheet .panel{
    position:absolute; left:0; right:0; bottom:0; background:#fff; border-radius:16px 16px 0 0;
    box-shadow:var(--shadow); padding:16px; max-height:85vh; overflow:auto;
  }
  .sheet .grab{ width:42px; height:5px; background:#e5e7eb; border-radius:999px; margin:4px auto 8px }
  .sheet .closeB{ position:absolute; right:10px; top:10px; border:0; background:#f1f3f5; border-radius:999px; padding:6px 10px; cursor:pointer }
  .sheet.show{ display:block }
  .sheet .footer{ position:sticky; bottom:0; background:#fff; padding-top:8px; margin-top:10px }
  .cta{ display:inline-block; background:var(--green); color:#fff; border:0; border-radius:999px; padding:12px 18px; font-weight:800; }

  /* DESKTOP SIDE SUMMARY */
  .sumRow{ display:flex; justify-content:space-between; margin:6px 0 }
  .totals{ font-weight:800; font-size:20px; text-align:right }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<!-- Bottom-sheet ticket selector (mobile) -->
<div id="sheet" class="sheet" aria-hidden="true">
  <div class="panel" role="dialog" aria-label="Kies kaartjies">
    <div class="grab"></div>
    <button class="closeB" id="sheetClose">✕</button>
    <h3 style="margin:2px 0 8px">Kies kaartjies</h3>
    <div id="sheetTickets"></div>
    <div class="footer">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div class="pillTotal" id="sheetTotal">Totaal: R0.00</div>
        <button id="sheetCheckout" class="cta" disabled>Checkout</button>
      </div>
    </div>
  </div>
</div>

<!-- Sticky bottom bar (mobile) -->
<div class="sticky"><div class="bar">
  <div class="row">
    <button id="openSheet" class="btn">Kies kaartjies</button>
    <div style="display:flex;gap:12px;align-items:center">
      <span class="pillTotal" id="stickyTotal">R0.00</span>
      <button id="stickyCheckout" class="btn primary" disabled>Checkout</button>
    </div>
  </div>
</div></div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
function fmtWhen(s,e){
  const sdt=new Date((s||0)*1000), edt=new Date((e||0)*1000);
  const opts={ weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts)+' – '+edt.toLocaleDateString('af-ZA',opts);
}

function render(cat){
  const ev = cat.event || {};
  const app = document.getElementById('app');

  const hero = ev.hero_url || ev.poster_url || '';
  const desc = ev.description || ''; // optional (safe to be empty)

  app.innerHTML = \`
    <div class="hero">\${hero ? '<img alt="" src="'+esc(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${esc(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}\${ev.venue ? ' · '+esc(ev.venue) : ''}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Inligting</h2>
        <div class="facts">
          <div class="fact">📅 \${fmtWhen(ev.starts_at, ev.ends_at)}</div>
          \${ev.venue ? '<div class="fact">📍 '+esc(ev.venue)+'</div>' : ''}
        </div>
        \${desc ? '<p style="margin:8px 0 0; line-height:1.45">'+esc(desc)+'</p>' : ''}

        <details class="more" style="\${desc?'':'display:none'}">
          <summary>Meer info</summary>
          <div class="muted">Meer besonderhede kan later bygevoeg word (parkering, skedule, ens.).</div>
        </details>

        <div style="height:10px"></div>
        <h2>Kaartjies</h2>
        <div id="tickets"></div>
      </div>

      <div class="card">
        <h2>Jou keuse</h2>
        <div id="cartEmpty" class="muted">Geen kaartjies gekies</div>
        <div id="cartList"></div>
        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">Totaal</span>
          <span id="total" class="totals">R0.00</span>
        </div>
        <div style="margin-top:12px">
          <button id="checkoutBtn" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>
  \`;

  renderTickets(cat.ticket_types||[], '#tickets');
  renderTickets(cat.ticket_types||[], '#sheetTickets', true); // same list inside sheet
  wireCart(cat.event, cat.ticket_types||[]);
}

function renderTickets(types, selector, compact=false){
  const el = document.querySelector(selector);
  if (!types.length){ el.innerHTML = '<p class="muted">Geen kaartjies beskikbaar nie.</p>'; return; }
  el.innerHTML = types.map(t => {
    const limit = Number(t.per_order_limit||0);
    const sub = limit ? ('Max '+limit+' per bestelling') : '';
    return \`
      <div class="ticket">
        <div>
          <div style="font-weight:700">\${esc(t.name)}</div>
          <div class="sub">\${sub}</div>
        </div>
        <div class="qty">
          <div class="price">\${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</div>
          <button class="btn" data-dec="\${t.id}">−</button>
          <span id="q\${t.id}\${compact?'s':''}">0</span>
          <button class="btn" data-inc="\${t.id}">+</button>
        </div>
      </div>\`;
  }).join('');
}

function wireCart(event, ttypesArr){
  const state = { items:new Map(), ttypes:new Map(ttypesArr.map(t=>[t.id,t])), event };

  const incs = document.querySelectorAll('[data-inc]');
  const decs = document.querySelectorAll('[data-dec]');
  incs.forEach(b=>b.onclick=()=> changeQty(state, Number(b.dataset.inc), +1));
  decs.forEach(b=>b.onclick=()=> changeQty(state, Number(b.dataset.dec), -1));

  // Desktop checkout
  document.getElementById('checkoutBtn').onclick = ()=> proceedCheckout(state);

  // Sticky & sheet controls (mobile)
  const openSheet = document.getElementById('openSheet');
  const sheet = document.getElementById('sheet');
  const sheetClose = document.getElementById('sheetClose');
  const sheetCheckout = document.getElementById('sheetCheckout');
  const stickyCheckout = document.getElementById('stickyCheckout');

  if (openSheet){
    openSheet.onclick = ()=> sheet.classList.add('show');
  }
  if (sheetClose){
    sheetClose.onclick = ()=> sheet.classList.remove('show');
    sheet.addEventListener('click', (e)=>{ if (e.target === sheet) sheet.classList.remove('show'); });
  }
  if (sheetCheckout){ sheetCheckout.onclick = ()=> proceedCheckout(state); }
  if (stickyCheckout){ stickyCheckout.onclick = ()=> proceedCheckout(state); }

  // Closed event guard
  const now = Math.floor(Date.now()/1000);
  if ((state.event.ends_at||0) < now || (state.event.status!=='active')){
    document.getElementById('checkoutBtn').disabled = true;
    stickyCheckout && (stickyCheckout.disabled = true);
    sheetCheckout && (sheetCheckout.disabled = true);
  }

  updateTotals(state); // initial
}

function changeQty(state, id, delta){
  const tt = state.ttypes.get(id) || {};
  const limit = Number(tt.per_order_limit||0) || Infinity;
  const cur = state.items.get(id)||0;
  const next = Math.max(0, Math.min(limit, cur+delta));
  if (next===0) state.items.delete(id); else state.items.set(id,next);

  // Update both inline counters (page + sheet)
  const elA = document.getElementById('q'+id);
  const elB = document.getElementById('q'+id+'s');
  if (elA) elA.textContent = String(next);
  if (elB) elB.textContent = String(next);

  updateTotals(state);
}

function updateTotals(state){
  const arr = Array.from(state.items.entries());
  const cartList = document.getElementById('cartList');
  const cartEmpty = document.getElementById('cartEmpty');

  cartEmpty.style.display = arr.length ? 'none' : 'block';
  let total = 0;
  cartList.innerHTML = arr.map(([tid,qty])=>{
    const tt = state.ttypes.get(tid) || {name:'',price_cents:0};
    const line = qty * (tt.price_cents||0);
    total += line;
    return '<div class="sumRow"><div>'+esc(tt.name)+' × '+qty+'</div><div>'+((tt.price_cents||0)? rands(line) : 'FREE')+'</div></div>';
  }).join('');

  document.getElementById('total').textContent = rands(total);
  const stickyTotal = document.getElementById('stickyTotal');
  if (stickyTotal) stickyTotal.textContent = rands(total);
  const sheetTotal = document.getElementById('sheetTotal');
  if (sheetTotal) sheetTotal.textContent = 'Totaal: ' + rands(total);

  const has = total>0 && arr.length>0;
  const checkoutBtn = document.getElementById('checkoutBtn');
  const stickyCheckout = document.getElementById('stickyCheckout');
  const sheetCheckout = document.getElementById('sheetCheckout');
  if (checkoutBtn) checkoutBtn.disabled = !has;
  if (stickyCheckout) stickyCheckout.disabled = !has;
  if (sheetCheckout) sheetCheckout.disabled = !has;
}

function proceedCheckout(state){
  const items = Array.from(state.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
  if (!items.length) return;
  sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: state.event.id, items }));
  location.href = '/shop/' + encodeURIComponent(state.event.slug) + '/checkout';
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  // attach ticket types to event for access
  res.event = res.event || {};
  res.event.ticket_types = res.ticket_types || [];
  render(res);
}
load();
</script>
</body></html>`;
