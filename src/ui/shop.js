// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#111; --card:#fff; --border:#e5e7eb; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (no cropping) */
  .hero{ position:relative; border-radius:14px; overflow:hidden; background:#111; min-height:160px; }
  .hero img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:center; background:#111; }
  .hero .meta{
    position:relative; z-index:1; color:#fff; width:100%; padding:18px;
    background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0));
  }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* CTA (mobile only) */
  .cta-wrap{ display:flex; justify-content:center; margin:12px 0 6px }
  .cta{ appearance:none; border:0; background:var(--green); color:#fff; font-weight:800;
        padding:14px 22px; border-radius:999px; cursor:pointer; box-shadow:0 12px 26px rgba(10,125,43,.25); }
  @media (min-width:901px){ .cta-wrap{ display:none } }

  /* GRID (desktop) */
  .grid{ display:grid; grid-template-columns: 1.2fr .9fr; gap:16px; margin-top:10px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }

  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }

  /* Info chips */
  .chip{ display:flex; align-items:center; gap:10px; background:#e9f2ea; border-radius:12px; padding:12px 14px; margin:8px 0 }
  .dot{ width:10px; height:10px; background:#2ecc71; border-radius:50% }

  /* Oorsig placeholder */
  .oorsig{ border:2px dashed #e5e7eb; border-radius:12px; padding:14px; background:#fafafa; }

  /* Tickets list (desktop and in sheet) */
  .trow{ display:grid; grid-template-columns:1fr auto auto auto; gap:10px; align-items:center; padding:12px 0; border-bottom:1px solid #f1f3f5 }
  .trow:last-child{ border-bottom:0 }
  .qty{ display:flex; align-items:center; gap:8px }
  .btn{ padding:8px 12px; border-radius:10px; border:1px solid var(--border); background:#fff; cursor:pointer }
  .btn:disabled{ background:#eee; color:#777; cursor:not-allowed }
  .price{ min-width:90px; text-align:right; font-weight:600 }
  .checkout-row{ display:flex; justify-content:space-between; align-items:center; margin-top:12px }
  .primary{ background:var(--green); color:#fff; border-color:transparent }

  /* Sheet (mobile) */
  #sheet{ position:fixed; inset:0; display:none; }
  #sheet .backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.35); }
  #sheet .panel{
    position:absolute; left:0; right:0; bottom:0; background:#fff;
    border-top-left-radius:16px; border-top-right-radius:16px; padding:14px 16px; max-height:80vh; overflow:auto;
    box-shadow:0 -10px 30px rgba(0,0,0,.25);
  }
  #sheet .handle{ width:48px; height:5px; background:#e5e7eb; border-radius:999px; margin:6px auto 12px }
  #sheet h3{ margin:0 0 10px }
  @media (min-width:901px){ #sheet{ display:none !important } }

  /* Bottom “Jou keuse” card is mobile only */
  #cartCard{ }
  @media (min-width:901px){ #cartCard{ display:none } }

  /* Desktop column header */
  .col-title{ font-size:20px; font-weight:800; margin:0 0 8px }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function fmtWhen(s,e){
  const sdt = new Date((s||0)*1000), edt=new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}
function tryJSON(s){ try{ return JSON.parse(s); }catch{ return null; } }

function render(cat){
  const ev = cat.event || {};
  const images = (ev.gallery_urls ? tryJSON(ev.gallery_urls) : []) || [];
  const hero = ev.hero_url || images[0] || ev.poster_url || '';

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="hero">
      \${hero ? '<img alt="" src="'+esc(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${esc(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+esc(ev.venue) : ''}</span></div>
      </div>
    </div>

    <!-- Mobile CTA -->
    <div class="cta-wrap"><button id="openSheet" class="cta">Kies jou kaartjies</button></div>

    <div class="grid">
      <!-- LEFT: Info -->
      <div class="card">
        <h2 style="margin:0 0 10px">Inligting</h2>
        <div class="chip"><span class="dot"></span><span>\${fmtWhen(ev.starts_at, ev.ends_at)}</span></div>
        <div class="chip"><span class="dot"></span><span>\${esc(ev.venue||'Villiersdorp Skougronde')}</span></div>

        <div class="oorsig" style="margin-top:12px">
          <div style="font-weight:800; margin-bottom:6px">Oorsig</div>
          <div class="muted" style="color:#334155">
            Meer besonderhede volg binnekort. (Plak hier jou beskrywing, program/hoogtepunte, ens.)
          </div>
        </div>
      </div>

      <!-- RIGHT: Tickets (desktop) -->
      <div class="card" id="deskCol">
        <div class="col-title">Kaartjies</div>
        <div id="deskTickets"></div>
        <div class="checkout-row">
          <strong id="deskTotal">R0.00</strong>
          <button id="deskCheckout" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>

    <!-- Bottom “Jou keuse” (mobile only) -->
    <div id="cartCard" class="card" style="margin-top:12px">
      <div id="cartEmpty" class="muted">Geen kaartjies gekies</div>
      <div id="cartList"></div>
      <div class="checkout-row">
        <strong id="total">R0.00</strong>
        <button id="checkoutBtn" class="btn primary" disabled>Checkout</button>
      </div>
    </div>

    <!-- Ticket Sheet (mobile) -->
    <div id="sheet" aria-hidden="true">
      <div class="backdrop" id="sheetClose"></div>
      <div class="panel">
        <div class="handle"></div>
        <h3 style="margin:0 0 6px">Kies jou kaartjies</h3>
        <div id="mobiTickets"></div>
        <div class="checkout-row">
          <button id="sheetCloseBtn" class="btn">Sluit</button>
          <button id="sheetCheckout" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>
  \`;

  const state = initState(ev, cat.ticket_types||[]);
  renderTickets(state);     // desktop and sheet
  wireInteractions(state);
}

function initState(event, types){
  const ttypes = new Map(types.map(t=>[t.id, t]));
  return { event, types, ttypes, items:new Map() };
}

function renderTickets(state){
  // Desktop ticket list
  const desk = document.getElementById('deskTickets');
  desk.innerHTML = state.types.map(t => rowHTML(t)).join('');

  // Mobile sheet ticket list
  const mobi = document.getElementById('mobiTickets');
  mobi.innerHTML = state.types.map(t => rowHTML(t, true)).join('');

  // Bind all +/- buttons
  bindQtyButtons(state);
  updateTotals(state);
}

function rowHTML(t, mobile=false){
  const id = t.id;
  return \`
    <div class="trow">
      <div>\${esc(t.name)}</div>
      <div class="qty">
        <button class="btn" data-dec="\${id}" \${mobile?'data-scope="m"':''}>−</button>
        <span id="\${mobile?'mq':'dq'}\${id}">0</span>
        <button class="btn" data-inc="\${id}" \${mobile?'data-scope="m"':''}>+</button>
      </div>
      <div class="price">\${(t.price_cents||0)? rands(t.price_cents): 'FREE'}</div>
    </div>\`;
}

function bindQtyButtons(state){
  document.querySelectorAll('[data-inc]').forEach(b=>{
    b.onclick = ()=> changeQty(state, Number(b.getAttribute('data-inc')), +1);
  });
  document.querySelectorAll('[data-dec]').forEach(b=>{
    b.onclick = ()=> changeQty(state, Number(b.getAttribute('data-dec')), -1);
  });
}

function changeQty(state, id, delta){
  const cur = state.items.get(id)||0;
  const next = Math.max(0, cur+delta);
  if (next===0) state.items.delete(id); else state.items.set(id,next);

  // Sync both counters
  const dq = document.getElementById('dq'+id); if (dq) dq.textContent = String(next);
  const mq = document.getElementById('mq'+id); if (mq) mq.textContent = String(next);

  updateTotals(state);
}

function updateTotals(state){
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  const arr = Array.from(state.items.entries());
  if (empty) empty.style.display = arr.length ? 'none' : 'block';

  let total = 0;
  if (list){
    list.innerHTML = arr.map(([tid,qty])=>{
      const tt = state.ttypes.get(tid) || {name:'',price_cents:0};
      const line = qty * (tt.price_cents||0);
      total += line;
      return \`<div style="display:flex;justify-content:space-between;margin:6px 0">
        <div>\${esc(tt.name)} × \${qty}</div>
        <div>\${(tt.price_cents||0)? rands(line): 'FREE'}</div>
      </div>\`;
    }).join('');
  } else {
    // compute total anyway for desktop
    for (const [tid,qty] of arr){
      const tt = state.ttypes.get(tid) || {price_cents:0};
      total += qty * (tt.price_cents||0);
    }
  }

  const totEl = document.getElementById('total');      if (totEl) totEl.textContent = rands(total);
  const dTot  = document.getElementById('deskTotal');  if (dTot)  dTot.textContent  = rands(total);

  const mobileCheckout = document.getElementById('checkoutBtn'); if (mobileCheckout) mobileCheckout.disabled = total<=0 && !arr.length;
  const sheetCheckout  = document.getElementById('sheetCheckout'); if (sheetCheckout) sheetCheckout.disabled = total<=0 && !arr.length;
  const deskCheckout   = document.getElementById('deskCheckout'); if (deskCheckout) deskCheckout.disabled = total<=0 && !arr.length;
}

function wireInteractions(state){
  // Mobile: open/close sheet
  const sheet = document.getElementById('sheet');
  const open  = document.getElementById('openSheet');
  const close = ()=>{ sheet.style.display='none'; sheet.setAttribute('aria-hidden','true'); };
  const show  = ()=>{ sheet.style.display='block'; sheet.setAttribute('aria-hidden','false'); };

  if (open){ open.onclick = show; }
  const sheetClose = document.getElementById('sheetClose'); if (sheetClose) sheetClose.onclick = close;
  const sheetCloseBtn = document.getElementById('sheetCloseBtn'); if (sheetCloseBtn) sheetCloseBtn.onclick = close;

  // Checkout (mobile card + sheet + desktop)
  const goCheckout = ()=>{
    const items = Array.from(state.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
    if (!items.length) return;
    sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: state.event.id, items }));
    location.href = '/shop/' + encodeURIComponent(state.event.slug) + '/checkout';
  };
  const b1 = document.getElementById('checkoutBtn');   if (b1) b1.onclick = goCheckout;
  const b2 = document.getElementById('sheetCheckout'); if (b2) b2.onclick = goCheckout;
  const b3 = document.getElementById('deskCheckout');  if (b3) b3.onclick = goCheckout;
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  res.event = res.event || {};
  res.event.ticket_types = res.ticket_types || [];
  render({ event:res.event, ticket_types:res.ticket_types });
}
load();
</script>
</body></html>`;
