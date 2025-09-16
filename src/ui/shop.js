// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#111; --card:#fff; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (contain – no cropping) */
  .hero{ position:relative; border-radius:14px; overflow:hidden; background:#111; display:flex; align-items:flex-end; min-height:160px }
  .hero img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:center; background:#111 }
  .hero .meta{ position:relative; z-index:1; color:#fff; width:100%; padding:18px; background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0)) }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* CTA under hero (mobile-first) */
  .hero-cta-wrap{ display:flex; justify-content:center; margin:10px 0 2px }
  .cta{ display:inline-flex; align-items:center; gap:10px; padding:14px 22px; border-radius:999px; background:var(--green); color:#fff; font-weight:800; border:0; cursor:pointer; box-shadow:0 8px 22px rgba(10,125,43,.25) }
  .cta .badge{ background:rgba(255,255,255,.2); padding:6px 10px; border-radius:999px; font-weight:700 }

  /* Cards */
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }

  /* Info rows */
  .info-row{ display:flex; align-items:center; gap:10px; padding:12px; background:#eaf3ea; border-radius:12px; margin:8px 0 }
  .dot{ width:10px; height:10px; border-radius:999px; background:#0a7d2b; display:inline-block }

  /* Desktop layout */
  .grid{ display:grid; grid-template-columns:1.1fr .9fr; gap:16px; margin-top:14px }
  @media (max-width:900px){ .grid{ display:block } }

  /* Tickets list (desktop) */
  .tickets{ }
  .ticket{ display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:12px 0; border-bottom:1px solid #f1f3f5 }
  .ticket:last-child{ border-bottom:0 }
  .price{ font-weight:700 }
  .qty{ display:flex; align-items:center; gap:10px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }

  /* Cart summary */
  .cart-line{ display:flex; justify-content:space-between; margin:6px 0 }
  .total-row{ display:flex; justify-content:space-between; align-items:center; margin-top:12px; font-weight:800; font-size:18px }

  /* Mobile sheet (for choosing tickets) */
  .sheet{ position:fixed; left:0; right:0; bottom:-100%; background:#fff; border-radius:18px 18px 0 0; box-shadow:0 -20px 40px rgba(0,0,0,.28); transition:bottom .25s ease; max-height:78vh; overflow:auto; padding:14px }
  .sheet.open{ bottom:0 }
  .sheet .grab{ width:48px; height:5px; border-radius:999px; background:#d8dee2; margin:6px auto 10px }
  .sheet h3{ margin:2px 0 10px }
  .sheet .footer{ position:sticky; bottom:0; background:#fff; padding:10px 0 6px; box-shadow:0 -12px 20px rgba(0,0,0,.06) }
  .sheet .footer .row{ display:flex; gap:10px; align-items:center; justify-content:space-between }

  /* Visibility helpers */
  .desktop-only{ display:none }
  .mobile-only{ display:block }
  @media (min-width:901px){
    .desktop-only{ display:block }
    .mobile-only{ display:none }
  }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<!-- Mobile ticket sheet -->
<div id="sheet" class="sheet mobile-only" aria-hidden="true">
  <div class="grab"></div>
  <h3>Kies kaartjies</h3>
  <div id="sheetTickets"></div>
  <div class="footer">
    <div class="row">
      <div style="font-weight:800">Totaal: <span id="sheetTotal">R0.00</span></div>
      <button id="sheetCheckout" class="btn primary">Checkout</button>
    </div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
const state = { items:new Map(), ttypes:new Map(), event:null };

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function fmtWhen(s,e){
  const sdt=new Date((s||0)*1000), edt=new Date((e||0)*1000);
  const opts={ weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts)+' – '+edt.toLocaleDateString('af-ZA',opts);
}

function renderPage(data){
  const ev = data.event || {};
  state.event = ev;
  state.ttypes = new Map((data.ticket_types||[]).map(t=>[t.id, t]));

  const hero = ev.hero_url || ev.poster_url || (Array.isArray(ev.gallery_urls)?ev.gallery_urls[0]:null) || '';
  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="hero">
      \${hero ? '<img alt="" src="'+escapeHtml(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${escapeHtml(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+escapeHtml(ev.venue) : ''}</span></div>
      </div>
    </div>

    <div class="hero-cta-wrap mobile-only">
      <button id="openSheet" class="cta">Kies kaartjies <span id="ctaBadge" class="badge">R0.00</span></button>
    </div>

    <div class="grid">
      <div class="card">
        <h2 style="margin:0 0 10px">Inligting</h2>
        <div class="info-row"><span class="dot"></span><div>\${fmtWhen(ev.starts_at, ev.ends_at)}</div></div>
        <div class="info-row"><span class="dot"></span><div>\${escapeHtml(ev.venue||'')}</div></div>
      </div>

      <!-- DESKTOP tickets column -->
      <div class="card desktop-only">
        <h2 style="margin:0 0 10px">Kaartjies</h2>
        <div id="ticketsPanel" class="tickets"></div>
        <div id="deskCart" style="margin-top:12px">
          <div id="deskEmpty" class="muted">Geen kaartjies gekies</div>
          <div id="deskLines"></div>
          <div class="total-row"><span>Totaal</span><span id="deskTotal">R0.00</span></div>
          <div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end">
            <button id="deskCheckout" class="btn primary" disabled>Checkout</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MOBILE cart card -->
    <div class="card mobile-only" style="margin-top:14px">
      <div id="mobEmpty" class="muted">Geen kaartjies gekies</div>
      <div id="mobLines"></div>
      <div class="total-row"><span>Totaal:</span><span id="mobTotal">R0.00</span></div>
      <div style="margin-top:10px; display:flex; gap:10px; align-items:center; justify-content:space-between">
        <button id="mobChoose" class="btn">Kies kaartjies</button>
        <button id="mobCheckout" class="btn primary" disabled>Checkout</button>
      </div>
    </div>
  \`;

  // Render lists
  renderTicketList("ticketsPanel");     // desktop list
  renderTicketList("sheetTickets", true); // mobile sheet list
  wireEvents();
  updateTotals();
}

/* Render a ticket list into targetEl.
   If isSheet=true we add smaller controls but same data-attrs. */
function renderTicketList(targetId, isSheet=false){
  const host = document.getElementById(targetId);
  if (!host) return;
  const types = Array.from(state.ttypes.values());
  if (!types.length){ host.innerHTML = '<p class="muted">Geen kaartjies beskikbaar nie.</p>'; return; }
  host.innerHTML = types.map(t => \`
    <div class="ticket">
      <div>
        <div style="font-weight:700">\${escapeHtml(t.name)}</div>
        <div class="muted"></div>
      </div>
      <div class="qty">
        <button class="btn" data-dec="\${t.id}">−</button>
        <span id="\${targetId==='sheetTickets'?'s':'q'}\${t.id}">0</span>
        <button class="btn" data-inc="\${t.id}">+</button>
        <span class="price">\${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</span>
      </div>
    </div>\`).join('');

  // Wire the +/- in this container only
  host.querySelectorAll('[data-inc]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.inc), +1, targetId);
  });
  host.querySelectorAll('[data-dec]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.dec), -1, targetId);
  });
}

function changeQty(tid, delta, originId){
  const cur = state.items.get(tid)||0;
  const next = Math.max(0, cur+delta);
  if (next===0) state.items.delete(tid); else state.items.set(tid,next);

  // Reflect in both counters (desktop + sheet)
  const dEl = document.getElementById('q'+tid); if (dEl) dEl.textContent = String(next);
  const sEl = document.getElementById('s'+tid); if (sEl) sEl.textContent = String(next);

  updateTotals();
}

function cartLines(){
  let total = 0;
  const lines = [];
  for (const [tid, qty] of state.items.entries()){
    const tt = state.ttypes.get(tid) || { name:"", price_cents:0 };
    const line = qty * (tt.price_cents||0);
    total += line;
    lines.push({ name: tt.name, qty, line });
  }
  return { total, lines };
}

function updateTotals(){
  const { total, lines } = cartLines();

  // Desktop cart
  const deskEmpty = document.getElementById('deskEmpty');
  const deskLines = document.getElementById('deskLines');
  const deskTotal = document.getElementById('deskTotal');
  const deskCheckout = document.getElementById('deskCheckout');
  if (deskEmpty && deskLines){
    deskEmpty.style.display = lines.length ? 'none' : 'block';
    deskLines.innerHTML = lines.map(l => \`<div class="cart-line"><div>\${escapeHtml(l.name)} × \${l.qty}</div><div>\${l.line? rands(l.line):'FREE'}</div></div>\`).join('');
    if (deskTotal) deskTotal.textContent = rands(total);
    if (deskCheckout) deskCheckout.disabled = total<=0 && !lines.length;
  }

  // Mobile cart
  const mobEmpty = document.getElementById('mobEmpty');
  const mobLines = document.getElementById('mobLines');
  const mobTotal = document.getElementById('mobTotal');
  const mobCheckout = document.getElementById('mobCheckout');
  if (mobEmpty && mobLines){
    mobEmpty.style.display = lines.length ? 'none' : 'block';
    mobLines.innerHTML = lines.map(l => \`<div class="cart-line"><div>\${escapeHtml(l.name)} × \${l.qty}</div><div>\${l.line? rands(l.line):'FREE'}</div></div>\`).join('');
    if (mobTotal) mobTotal.textContent = rands(total);
    if (mobCheckout) mobCheckout.disabled = total<=0 && !lines.length;
  }

  // CTA badge + sheet total
  const badge = document.getElementById('ctaBadge'); if (badge) badge.textContent = rands(total);
  const sheetT = document.getElementById('sheetTotal'); if (sheetT) sheetT.textContent = rands(total);
}

function goCheckout(){
  const items = Array.from(state.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
  if (!items.length) return;
  sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: state.event.id, items }));
  location.href = '/shop/' + encodeURIComponent(state.event.slug) + '/checkout';
}

function wireEvents(){
  // Desktop checkout
  const dChk = document.getElementById('deskCheckout'); if (dChk) dChk.onclick = goCheckout;

  // Mobile CTA & sheet
  const openSheet = document.getElementById('openSheet');
  const mobChoose = document.getElementById('mobChoose');
  const sheet = document.getElementById('sheet');
  const sheetCheckout = document.getElementById('sheetCheckout');

  const open = ()=>{ sheet.classList.add('open'); sheet.setAttribute('aria-hidden','false'); }
  const close = ()=>{ sheet.classList.remove('open'); sheet.setAttribute('aria-hidden','true'); }

  if (openSheet) openSheet.onclick = open;
  if (mobChoose) mobChoose.onclick = open;
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') close(); });
  sheet.addEventListener('click', (e)=>{ if (e.target === sheet) close(); });
  sheetCheckout.onclick = goCheckout;
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  res.event = res.event || {};
  res.event.ticket_types = res.ticket_types || [];
  renderPage(res);
}
load();
</script>
</body></html>`;
