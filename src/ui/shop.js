// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#0b1320; --card:#fff; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }

  /* HERO (contain so nothing gets cropped) */
  .hero{
    position:relative; border-radius:14px; overflow:hidden; background:#111;
    display:flex; align-items:flex-end; min-height:160px;
  }
  .hero img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:center; background:#111; }
  .hero .meta{ position:relative; z-index:1; color:#fff; width:100%; padding:18px; background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0)); }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* layout */
  .grid{ display:grid; grid-template-columns: 1.15fr .95fr; gap:16px; margin-top:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }

  /* mobile CTA */
  .choose-bar{ display:none; justify-content:center; margin:12px 0 6px }
  .choose-btn{
    display:inline-flex; align-items:center; gap:10px;
    background:var(--green); color:#fff; border:0; border-radius:999px;
    padding:14px 22px; font-weight:800; font-size:18px; box-shadow:0 12px 24px rgba(10,125,43,.25);
    cursor:pointer;
  }
  .badge{ background:rgba(255,255,255,.18); padding:6px 12px; border-radius:999px; font-weight:700 }
  @media (max-width:900px){ .choose-bar{ display:flex; } }

  /* tickets (desktop panel) */
  h2{ margin:6px 0 12px }
  .ticket{ display:grid; grid-template-columns:1fr auto auto; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid #f1f3f5 }
  .ticket:last-child{ border-bottom:0 }
  .price{ font-weight:700; white-space:nowrap }
  .qty{ display:flex; align-items:center; gap:8px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }
  .totals{ font-weight:800; font-size:20px; text-align:right }

  /* info chips + placeholders */
  .chip{ background:#e8f3eb; border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:10px }
  .dot{ width:10px; height:10px; background:#34a853; border-radius:50% }
  .info-stack>div{ margin-top:10px }
  .placeholder{ margin-top:12px; padding:14px; border:1px dashed #e0e4e8; border-radius:12px; color:#4b5563; background:#fafafa }

  /* mobile bottom-sheet */
  .sheet{ position:fixed; left:0; right:0; bottom:0; background:#fff; border-top-left-radius:18px; border-top-right-radius:18px;
          box-shadow:0 -12px 30px rgba(0,0,0,.18); transform:translateY(100%); transition:transform .28s ease; max-height:82vh; display:flex; flex-direction:column }
  .sheet.open{ transform:translateY(0) }
  .sheet .drag{ width:44px; height:4px; background:#e5e7eb; border-radius:999px; margin:10px auto 6px }
  .sheet header{ padding:4px 18px 10px; font-weight:800; font-size:20px }
  .sheet .body{ padding:0 18px 12px; overflow:auto }
  .sheet .footer{ padding:12px 18px; border-top:1px solid #f0f2f4; display:flex; justify-content:flex-end; gap:10px }
  @media (min-width:901px){ .sheet{ display:none } }

  /* show/hide desktop tickets */
  #deskTickets{ display:block }
  @media (max-width:900px){ #deskTickets{ display:none } }

  /* cart (mobile + desktop) */
  .cart-line{ display:flex; justify-content:space-between; margin:6px 0 }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<!-- bottom sheet (mobile ticket picker) -->
<div id="sheet" class="sheet" aria-hidden="true">
  <div class="drag"></div>
  <header id="sheetTitle">Kies jou kaartjies</header>
  <div class="body">
    <div id="sheetTickets"></div>
  </div>
  <div class="footer">
    <button id="sheetClose" class="btn">Sluit</button>
    <button id="sheetCheckout" class="btn primary">Checkout</button>
  </div>
</div>

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
  const ev = cat.event||{};
  const hero = ev.hero_url || ev.poster_url || '';

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="hero">\${hero ? '<img alt="" src="'+escapeHtml(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${escapeHtml(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+escapeHtml(ev.venue) : ''}</span></div>
      </div>
    </div>

    <!-- Mobile CTA -->
    <div class="choose-bar">
      <button id="chooseOpen" class="choose-btn">
        <span>Kies jou kaartjies</span>
        <span id="chooseBadge" class="badge">R0.00</span>
      </button>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Inligting</h2>
        <div class="info-stack">
          <div class="chip"><span class="dot"></span><div>\${fmtWhen(ev.starts_at, ev.ends_at)}</div></div>
          <div class="chip"><span class="dot"></span><div>\${escapeHtml(ev.venue||'Villiersdorp Skougronde')}</div></div>
        </div>
        <div class="placeholder" id="descBox">
          <strong>Oorsig</strong><br/>Meer besonderhede volg binnekort. (Plak hier jou beskrywing, program/hoogtepunte, ens.)
        </div>
      </div>

      <!-- Desktop Tickets + Cart -->
      <div id="deskTickets" class="card">
        <h2>Kaartjies</h2>
        <div id="tickets"></div>
        <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">
          <div class="muted" id="cartEmpty">Geen kaartjies gekies</div>
          <div style="display:flex;gap:12px;align-items:center">
            <span id="total" class="totals">R0.00</span>
            <button id="checkoutBtn" class="btn primary" disabled>Checkout</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile cart card -->
    <div class="card" id="mobileCart" style="margin-top:14px">
      <div class="muted" id="mEmpty">Geen kaartjies gekies</div>
      <div id="mLines"></div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
        <strong>Totaal</strong>
        <span id="mTotal" class="totals">R0.00</span>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button id="mCheckout" class="btn primary" disabled>Checkout</button>
      </div>
    </div>
  \`;

  const state = { items:new Map(), ttypes:new Map((cat.ticket_types||[]).map(t=>[t.id,t])), event:ev };

  // render both ticket lists (desktop + sheet/mobile)
  renderTicketList('tickets', state);
  renderTicketList('sheetTickets', state);

  // open/close sheet
  const sheet = document.getElementById('sheet');
  const openBtn = document.getElementById('chooseOpen');
  const closeBtn = document.getElementById('sheetClose');
  openBtn && (openBtn.onclick = ()=> sheet.classList.add('open'));
  closeBtn && (closeBtn.onclick = ()=> sheet.classList.remove('open'));

  // checkout buttons
  document.getElementById('checkoutBtn').onclick = ()=> goCheckout(state);
  document.getElementById('mCheckout').onclick = ()=> goCheckout(state);
  document.getElementById('sheetCheckout').onclick = ()=> goCheckout(state);

  // expose change handlers
  function changeQty(id, delta){
    const cur = state.items.get(id)||0;
    const next = Math.max(0, cur+delta);
    if (next===0) state.items.delete(id); else state.items.set(id,next);
    syncQtyDisplays(id, next);
    renderCarts();
  }

  function syncQtyDisplays(id, qty){
    // update all mirrors for this ticket id
    document.querySelectorAll('[data-q="'+id+'"]').forEach(el=>el.textContent = String(qty));
  }

  // wire +/- in both lists
  document.querySelectorAll('[data-inc]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.inc), +1);
  });
  document.querySelectorAll('[data-dec]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.dec), -1);
  });

  function renderCarts(){
    const arr = Array.from(state.items.entries());
    const list = arr.map(([tid,qty])=>{
      const tt = state.ttypes.get(tid) || {name:'',price_cents:0};
      const line = qty * (tt.price_cents||0);
      return \`<div class="cart-line"><div>\${escapeHtml(tt.name)} × \${qty}</div><div>\${(tt.price_cents||0)? rands(line): 'FREE'}</div></div>\`;
    }).join('');
    const total = arr.reduce((s,[tid,qty])=>{
      const tt = state.ttypes.get(tid)||{};
      return s + qty*(tt.price_cents||0);
    },0);

    const empty = !arr.length;
    // desktop
    document.getElementById('cartEmpty').style.display = empty?'block':'none';
    document.getElementById('total').textContent = rands(total);
    document.getElementById('checkoutBtn').disabled = empty;
    // mobile
    document.getElementById('mEmpty').style.display = empty?'block':'none';
    document.getElementById('mLines').innerHTML = list;
    document.getElementById('mTotal').textContent = rands(total);
    document.getElementById('mCheckout').disabled = empty;
    // mobile CTA badge
    const badge = document.getElementById('chooseBadge');
    if (badge) badge.textContent = rands(total);
  }

  function goCheckout(state){
    const items = Array.from(state.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
    if (!items.length) return;
    sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: state.event.id, items }));
    location.href = '/shop/' + encodeURIComponent(state.event.slug) + '/checkout';
  }

  renderCarts(); // initial
}

function renderTicketList(containerId, state){
  const el = document.getElementById(containerId);
  if (!el) return;
  const types = Array.from(state.ttypes.values());
  if (!types.length){ el.innerHTML = '<p class="muted">Geen kaartjies beskikbaar nie.</p>'; return; }
  el.innerHTML = types.map(t => \`
    <div class="ticket">
      <div style="font-weight:600">\${escapeHtml(t.name)}</div>
      <div class="price">\${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</div>
      <div class="qty">
        <button class="btn" data-dec="\${t.id}">−</button>
        <span data-q="\${t.id}">0</span>
        <button class="btn" data-inc="\${t.id}">+</button>
      </div>
    </div>\`).join('');
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  res.event = res.event || {};
  render({ event: res.event, ticket_types: res.ticket_types||[] });
}
load();
</script>
</body></html>`;
