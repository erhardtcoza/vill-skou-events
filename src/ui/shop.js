// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#111; --soft:#eef4ee }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (contain so poster never crops) */
  .hero{ position:relative; border-radius:14px; overflow:hidden; background:#111; min-height:160px; }
  .hero img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:center; background:#111; }
  .hero .meta{ position:relative; z-index:1; color:#fff; width:100%; padding:18px; background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0)); }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* Big pick CTA (mobile only) */
  .pick-cta{ display:flex; justify-content:center; margin-top:10px; }
  .pick-btn{ display:inline-flex; align-items:center; gap:12px; padding:14px 22px; border-radius:999px; border:0; background:var(--green); color:#fff; font-weight:800; font-size:18px; box-shadow:0 18px 30px rgba(10,125,43,.24); cursor:pointer }

  /* Cards */
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h2{ margin:0 0 12px }

  /* Info list */
  .info-pill{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:12px; background:#eaf6eb; margin-bottom:12px; color:#163c19; }
  .dot{ width:10px; height:10px; border-radius:50%; background:#1bb34a }

  /* Desktop layout */
  .grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:16px; margin-top:14px }
  .desk-right .ticket-row{ display:grid; grid-template-columns: 1fr auto auto; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #f1f3f5 }
  .desk-right .ticket-row:last-child{ border-bottom:0 }
  .price{ font-weight:700 }
  .qty{ display:inline-flex; align-items:center; gap:8px }
  .pillbtn{ width:36px; height:36px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; font-size:18px; cursor:pointer }
  .qty span{ min-width:16px; text-align:center; display:inline-block }

  .totalbar{ margin-top:12px; display:flex; justify-content:space-between; align-items:center }
  .totals{ font-weight:800; font-size:20px; }
  .btn{ padding:10px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }

  /* Mobile cart (summary) – hidden on desktop */
  .mobile-cart{ margin-top:14px }
  .mobile-only{ display:block }
  .desktop-only{ display:none }

  /* Bottom sheet (mobile picker) */
  .sheet-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); opacity:0; pointer-events:none; transition:opacity .2s ease; }
  .sheet{ position:fixed; left:0; right:0; bottom:0; transform:translateY(100%); transition:transform .25s ease; background:#fff; border-radius:16px 16px 0 0; box-shadow:0 -18px 30px rgba(0,0,0,.22); max-height:78vh; overflow:auto; }
  .sheet header{ position:sticky; top:0; background:#fff; padding:14px 16px 8px; border-bottom:1px solid #f1f3f5 }
  .sheet .grab{ width:58px; height:5px; border-radius:999px; background:#e6e6e6; margin:6px auto 12px }
  .sheet .content{ padding:8px 16px 16px }
  .sheet .ticket-row{ display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:10px; padding:14px 0; border-bottom:1px solid #f1f3f5 }
  .sheet .ticket-row:last-child{ border-bottom:0 }
  .sheet .footer{ position:sticky; bottom:0; background:#fff; padding:12px 16px; border-top:1px solid #f1f3f5; display:flex; gap:10px; justify-content:flex-end }
  .sheet.open{ transform:translateY(0) }
  .open + .sheet-backdrop{ opacity:1; pointer-events:auto }

  /* Responsive switches */
  @media (min-width:900px){
    .pick-cta{ display:none }        /* desktop: no big CTA */
    .grid{ margin-top:14px }
    .mobile-cart{ display:none }     /* desktop: no bottom cart card */
    .mobile-only{ display:none }
    .desktop-only{ display:block }
  }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function fmtWhen(s,e){
  const sdt = new Date((s||0)*1000), edt=new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}

function render(cat){
  const ev = cat.event || {};
  const hero = ev.hero_url || ev.poster_url || '';

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="hero">
      \${hero ? '<img alt="" src="'+escapeHtml(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${escapeHtml(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+escapeHtml(ev.venue) : ''}</span></div>
      </div>
    </div>

    <!-- Mobile big CTA -->
    <div class="pick-cta mobile-only">
      <button id="pickOpen" class="pick-btn">Kies jou kaartjies</button>
    </div>

    <!-- Desktop 2-col -->
    <div class="grid">
      <div class="card">
        <h2>Inligting</h2>
        <div class="info-pill"><span class="dot"></span><div>\${fmtWhen(ev.starts_at, ev.ends_at)}</div></div>
        <div class="info-pill"><span class="dot"></span><div>\${escapeHtml(ev.venue||'')}</div></div>
        <div style="margin-top:10px" class="card" >
          <div style="font-weight:800;color:#163c19;margin-bottom:6px">Oorsig</div>
          <div class="muted">Meer besonderhede volg binnekort. (Plak hier jou beskrywing, program/hoogtepunte, ens.)</div>
        </div>
      </div>

      <div class="card desk-right desktop-only">
        <h2>Kaartjies</h2>
        <div id="deskTickets"></div>
        <div class="totalbar">
          <span id="deskNone" class="muted">Geen kaartjies gekies</span>
          <span id="deskTotal" class="totals">R0.00</span>
        </div>
        <div style="margin-top:10px;text-align:right">
          <button id="deskCheckout" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>

    <!-- Mobile Cart Summary -->
    <div class="card mobile-cart mobile-only" id="mCart">
      <div id="mNone" class="muted" style="margin-bottom:10px">Geen kaartjies gekies</div>
      <div id="mLines" style="margin-bottom:8px"></div>
      <div class="totalbar">
        <strong>Totaal</strong>
        <span id="mTotal" class="totals">R0.00</span>
      </div>
      <div style="margin-top:10px;text-align:right">
        <button id="mCheckout" class="btn primary" disabled>Checkout</button>
      </div>
    </div>

    <!-- Bottom sheet (mobile picker) -->
    <div id="sheet" class="sheet" aria-hidden="true">
      <header>
        <div class="grab"></div>
        <h2 style="margin:0 0 6px">Kies jou kaartjies</h2>
      </header>
      <div class="content"><div id="sheetTickets"></div></div>
      <div class="footer">
        <button id="sheetClose" class="btn">Sluit</button>
        <button id="sheetCheckout" class="btn primary" disabled>Checkout</button>
      </div>
    </div>
    <div id="sheetBackdrop" class="sheet-backdrop"></div>
  \`;

  // Build ticket lists (desktop + sheet)
  const types = cat.ticket_types || [];
  document.getElementById('deskTickets').innerHTML = renderTicketList(types, 'desk');
  document.getElementById('sheetTickets').innerHTML = renderTicketList(types, 'sheet');

  // Wire up qty buttons in both contexts
  bindQtyHandlers('desk');
  bindQtyHandlers('sheet');

  // CTA open/close bottom sheet
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheetBackdrop');
  const openBtn = document.getElementById('pickOpen');
  const closeBtn = document.getElementById('sheetClose');
  if (openBtn){
    openBtn.onclick = ()=>{ sheet.classList.add('open'); sheet.setAttribute('aria-hidden','false'); backdrop.classList.add('x'); };
  }
  if (closeBtn){ closeBtn.onclick = ()=>closeSheet(); }
  if (backdrop){ backdrop.onclick = ()=>closeSheet(); }
  function closeSheet(){ sheet.classList.remove('open'); sheet.setAttribute('aria-hidden','true'); backdrop.classList.remove('x'); }

  // Checkout (desktop + sheet + mobile card)
  document.getElementById('deskCheckout').onclick = checkout;
  document.getElementById('sheetCheckout').onclick = checkout;
  document.getElementById('mCheckout').onclick     = checkout;

  // Attach ticket types to state for pricing lookup
  window.__shopState = { items:new Map(), ttypes:new Map(types.map(t=>[t.id,t])), event: ev };
  updateUI();
}

function renderTicketList(types, scope){
  if (!types.length) return '<div class="muted">Geen kaartjies beskikbaar nie.</div>';
  return types.map(t=>`
    <div class="ticket-row">
      <div style="font-weight:600">${escapeHtml(t.name)}</div>
      <div class="price">${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</div>
      <div class="qty" data-scope="${scope}">
        <button class="pillbtn" data-dec="${t.id}">−</button>
        <span id="${scope}-q${t.id}">0</span>
        <button class="pillbtn" data-inc="${t.id}">+</button>
      </div>
    </div>
  `).join('');
}

function bindQtyHandlers(scope){
  document.querySelectorAll(\`.qty[data-scope="\${scope}"] [data-inc]\`).forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.inc), +1);
  });
  document.querySelectorAll(\`.qty[data-scope="\${scope}"] [data-dec]\`).forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.dec), -1);
  });
}

function changeQty(id, delta){
  const st = window.__shopState;
  const cur = st.items.get(id)||0;
  const next = Math.max(0, cur+delta);
  if (next===0) st.items.delete(id); else st.items.set(id,next);
  // reflect new qty in all scopes
  ['desk','sheet'].forEach(scope=>{
    const el = document.getElementById(\`\${scope}-q\${id}\`);
    if (el) el.textContent = String(next);
  });
  updateUI();
}

function updateUI(){
  const st = window.__shopState;
  // Totals + lines
  const arr = Array.from(st.items.entries());
  const lines = arr.map(([tid,qty])=>{
    const tt = st.ttypes.get(tid) || {name:'',price_cents:0};
    const line = qty*(tt.price_cents||0);
    return { name: tt.name, qty, line };
  });

  const total = lines.reduce((s,l)=>s+l.line,0);
  // Desktop
  const dNone = document.getElementById('deskNone');
  const dTotal = document.getElementById('deskTotal');
  const dCheckout = document.getElementById('deskCheckout');
  if (dNone) dNone.style.visibility = arr.length ? 'hidden' : 'visible';
  if (dTotal) dTotal.textContent = rands(total);
  if (dCheckout) dCheckout.disabled = arr.length===0;

  // Mobile cart
  const mNone = document.getElementById('mNone');
  const mLines = document.getElementById('mLines');
  const mTotal = document.getElementById('mTotal');
  const mCheckout = document.getElementById('mCheckout');
  if (mNone) mNone.style.display = arr.length ? 'none' : 'block';
  if (mLines) {
    mLines.innerHTML = lines.map(l => \`
      <div style="display:flex;justify-content:space-between;margin:6px 0">
        <div>\${escapeHtml(l.name)} × \${l.qty}</div>
        <div>\${l.line ? rands(l.line) : 'FREE'}</div>
      </div>\`).join('');
  }
  if (mTotal) mTotal.textContent = rands(total);
  if (mCheckout) mCheckout.disabled = arr.length===0;

  // Sheet checkout button state
  const sCheckout = document.getElementById('sheetCheckout');
  if (sCheckout) sCheckout.disabled = arr.length===0;
}

function checkout(){
  const st = window.__shopState;
  const items = Array.from(st.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
  if (!items.length) return;
  sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: st.event.id, items }));
  location.href = '/shop/' + encodeURIComponent(st.event.slug) + '/checkout';
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug))
    .then(r=>r.json()).catch(()=>({ok:false}));
  const app = document.getElementById('app');
  if (!res.ok){ app.textContent='Kon nie laai nie'; return; }
  res.event = res.event || {};
  render(res);
}
load();
</script>
</body></html>`;
