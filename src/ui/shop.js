// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* VISIBILITY HELPERS */
  .only-desktop{ display:none }
  .only-mobile{ display:block }
  @media (min-width:900px){
    .only-desktop{ display:block }
    .only-mobile{ display:none }
  }

  /* HERO (no cropping) */
  .hero{
    position:relative; border-radius:14px; overflow:hidden; background:#111;
    display:flex; align-items:flex-end; min-height:160px;
  }
  .hero img{
    position:absolute; inset:0; width:100%; height:100%;
    object-fit:contain; object-position:center;
    background:#111;
  }
  .hero .meta{
    position:relative; z-index:1; color:#fff;
    width:100%; padding:18px;
    background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0));
  }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* LAYOUT */
  .grid{ display:grid; grid-template-columns: 1.35fr .9fr; gap:16px; margin-top:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }

  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }

  /* MOBILE CTA */
  .cta-wrap{ display:flex; justify-content:center; margin:14px 0 }
  .cta-choose{
    display:inline-flex; align-items:center; justify-content:center;
    gap:12px; border:0; border-radius:999px; padding:14px 22px;
    background:var(--green); color:#fff; font-weight:700; font-size:18px;
    box-shadow:0 8px 24px rgba(10,125,43,.25); cursor:pointer;
  }

  /* GALLERY (kept simple: just the hero in this page) */

  /* TICKETS (desktop list & mobile sheet share rows) */
  h2{ margin:10px 0 12px }
  .ticket{ display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid #f1f3f5 }
  .ticket:last-child{ border-bottom:0 }
  .qty{ display:flex; align-items:center; gap:8px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }

  .totals{ font-weight:700; font-size:20px; text-align:right }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }

  /* BOTTOM SHEET (mobile) */
  #sheet{
    position:fixed; left:0; right:0; bottom:-100%;
    transition:bottom .3s ease; background:#fff;
    box-shadow:0 -12px 32px rgba(0,0,0,.2);
    border-top-left-radius:16px; border-top-right-radius:16px;
    max-height:80vh; display:flex; flex-direction:column;
  }
  #sheetHead{ padding:14px 16px; position:sticky; top:0; background:#fff; border-bottom:1px solid #f0f2f5 }
  #sheetBody{ padding:10px 16px; overflow:auto }
  #sheetFoot{ display:flex; gap:8px; padding:12px 16px; border-top:1px solid #f0f2f5 }
  .grab{ width:40px; height:4px; border-radius:999px; background:#e5e7eb; margin:0 auto 10px }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<script>
const slug = ${JSON.stringify(slug)};

/* ---------- utils ---------- */
function rands(cents){ return 'R' + ( (cents||0)/100 ).toFixed(2); }
function fmtWhen(s,e){
  const sdt = new Date((s||0)*1000), edt=new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function tryParseJSON(s){ try{ return JSON.parse(s); }catch{ return null; } }

/* ---------- render ---------- */
function render(cat){
  const ev = cat.event || {};
  const images = (ev.gallery_urls ? tryParseJSON(ev.gallery_urls) : []) || [];
  const hero = ev.hero_url || images[0] || ev.poster_url || '';
  const ttypes = cat.ticket_types || [];

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="hero">
      \${hero ? '<img alt="" src="\'+escapeHtml(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${escapeHtml(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+escapeHtml(ev.venue) : ''}</span></div>
      </div>
    </div>

    <!-- MOBILE CTA -->
    <div class="cta-wrap only-mobile">
      <button id="openSheet" class="cta-choose">Kies jou kaartjies</button>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Inligting</h2>
        \${renderInfo(ev)}
        \${renderOverviewPlaceholder()}
      </div>

      <!-- DESKTOP TICKETS ONLY -->
      <div id="ticketsPanel" class="card only-desktop">
        <h2>Kaartjies</h2>
        <div id="tickets"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
          <span id="deskTotal" class="totals">R0.00</span>
          <button id="deskCheckout" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>

    <!-- MOBILE TOTALS CARD -->
    <div id="cartCard" class="card only-mobile" style="margin-top:14px">
      <div id="cartEmpty" class="muted">Geen kaartjies gekies</div>
      <div id="cartList"></div>
      <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
        <b>Totaal</b><span id="total" class="totals">R0.00</span>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button id="checkoutBtn" class="btn primary" disabled>Checkout</button>
      </div>
    </div>

    <!-- MOBILE BOTTOM SHEET -->
    <div id="sheet" class="only-mobile" aria-hidden="true">
      <div id="sheetHead">
        <div class="grab"></div>
        <h2 style="margin:0">Kies jou kaartjies</h2>
      </div>
      <div id="sheetBody"></div>
      <div id="sheetFoot">
        <button id="sheetClose" class="btn" style="flex:0 0 auto">Sluit</button>
        <button id="sheetCheckout" class="btn primary" style="margin-left:auto" disabled>Checkout</button>
      </div>
    </div>
  \`;

  // Desktop ticket list
  const ticketsEl = document.getElementById('tickets');
  if (ticketsEl) ticketsEl.innerHTML = renderTicketRows(ttypes, 'desk');

  // Wire everything
  initState(ev, ttypes);
  wireDesktopQty();
  wireSheet(ttypes);
  wireCheckoutButtons();
}

/* Info + placeholder */
function renderInfo(ev){
  const when = fmtWhen(ev.starts_at, ev.ends_at);
  return \`
    <div style="background:#eaf5e8;border-radius:10px;padding:10px;margin:10px 0">
      🟢 \${escapeHtml(when)}
    </div>
    \${ev.venue ? '<div style="background:#eaf5e8;border-radius:10px;padding:10px;margin:10px 0">🟢 '+escapeHtml(ev.venue)+'</div>' : ''}
  \`;
}
function renderOverviewPlaceholder(){
  return \`
    <div style="border:2px dashed #e5e7eb;border-radius:12px;padding:12px;margin-top:8px">
      <b>Oorsig</b>
      <p class="muted" style="margin:6px 0 0">Meer besonderhede volg binnekort. (Plak hier jou beskrywing, program/hoogtepunte, ens.)</p>
    </div>\`;
}

/* Ticket rows (used by desktop list and the sheet) */
function renderTicketRows(types, mode){
  if (!types.length) return '<p class="muted">Geen kaartjies beskikbaar nie.</p>';
  const dec = mode==='desk' ? 'data-desk-dec' : 'data-sheet-dec';
  const inc = mode==='desk' ? 'data-desk-inc' : 'data-sheet-inc';
  const qid = mode==='desk' ? 'dq' : 'sq';
  return types.map(t => \`
    <div class="ticket">
      <div>
        <div style="font-weight:600">\${escapeHtml(t.name)}</div>
        <div class="muted">\${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</div>
      </div>
      <div class="qty">
        <button class="btn" \${dec}="\${t.id}">−</button>
        <span id="\${qid}\${t.id}">0</span>
        <button class="btn" \${inc}="\${t.id}">+</button>
      </div>
    </div>\`).join('');
}

/* ---------- state & wiring ---------- */
let globalState = null;

function initState(event, ttypes){
  globalState = {
    event,
    ttypes: new Map((ttypes||[]).map(t=>[t.id,t])),
    items: new Map(), // ticket_type_id -> qty
  };
}

function wireDesktopQty(){
  document.querySelectorAll('[data-desk-inc]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.deskInc), +1);
  });
  document.querySelectorAll('[data-desk-dec]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.deskDec), -1);
  });
}

function wireSheet(types){
  // populate sheet body
  const sb = document.getElementById('sheetBody');
  if (sb) sb.innerHTML = renderTicketRows(types, 'sheet');
  // open/close
  const open = document.getElementById('openSheet');
  const sheet = document.getElementById('sheet');
  const close = document.getElementById('sheetClose');
  if (open) open.onclick = ()=>{ sheet.style.bottom='0'; sheet.setAttribute('aria-hidden','false'); };
  if (close) close.onclick = ()=>{ sheet.style.bottom='-100%'; sheet.setAttribute('aria-hidden','true'); };
  // qty buttons
  document.querySelectorAll('[data-sheet-inc]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.sheetInc), +1);
  });
  document.querySelectorAll('[data-sheet-dec]').forEach(b=>{
    b.onclick = ()=> changeQty(Number(b.dataset.sheetDec), -1);
  });
}

function wireCheckoutButtons(){
  const gotoCheckout = ()=>{
    const items = Array.from(globalState.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
    if (!items.length) return;
    sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: globalState.event.id, items }));
    location.href = '/shop/' + encodeURIComponent(globalState.event.slug||'') + '/checkout';
  };
  const d = document.getElementById('deskCheckout');
  const m = document.getElementById('checkoutBtn');
  const s = document.getElementById('sheetCheckout');
  if (d) d.onclick = gotoCheckout;
  if (m) m.onclick = gotoCheckout;
  if (s) s.onclick = gotoCheckout;

  // event closed?
  const now = Math.floor(Date.now()/1000);
  const closed = ((globalState.event.ends_at||0) < now) || (globalState.event.status!=='active');
  if (closed){
    [d,m,s].forEach(el=>{ if(el){ el.disabled = true; el.textContent = 'Gesluit'; } });
  }
}

/* single source of truth for qty & totals */
function changeQty(id, delta){
  const cur = globalState.items.get(id)||0;
  const next = Math.max(0, cur+delta);
  if (next===0) globalState.items.delete(id); else globalState.items.set(id,next);

  // reflect qty in both UIs if present
  const dq = document.getElementById('dq'+id);
  const sq = document.getElementById('sq'+id);
  if (dq) dq.textContent = String(next);
  if (sq) sq.textContent = String(next);

  // rebuild mobile cart list
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  const arr = Array.from(globalState.items.entries());

  if (list && empty){
    empty.style.display = arr.length ? 'none' : 'block';
    list.innerHTML = arr.map(([tid,qty])=>{
      const tt = globalState.ttypes.get(tid) || {name:'',price_cents:0};
      const line = qty * (tt.price_cents||0);
      return \`<div style="display:flex;justify-content:space-between;margin:6px 0">
        <div>\${escapeHtml(tt.name)} × \${qty}</div>
        <div>\${(tt.price_cents||0)? rands(line) : 'FREE'}</div>
      </div>\`;
    }).join('');
  }

  // totals + buttons
  const totalCents = arr.reduce((sum,[tid,qty])=>{
    const tt = globalState.ttypes.get(tid) || {price_cents:0};
    return sum + qty*(tt.price_cents||0);
  },0);

  const mobileTotal = document.getElementById('total');
  const deskTotal = document.getElementById('deskTotal');
  if (mobileTotal) mobileTotal.textContent = rands(totalCents);
  if (deskTotal) deskTotal.textContent  = rands(totalCents);

  const enable = totalCents>0 && arr.length>0;
  const d = document.getElementById('deskCheckout');
  const m = document.getElementById('checkoutBtn');
  const s = document.getElementById('sheetCheckout');
  [d,m,s].forEach(el=>{ if(el) el.disabled = !enable; });
}

/* ---------- boot ---------- */
async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  // attach ticket types to event for quick access if needed elsewhere
  res.event = res.event || {};
  res.event.ticket_types = res.ticket_types || [];
  render(res);
}
load();
</script>
</body></html>`;
