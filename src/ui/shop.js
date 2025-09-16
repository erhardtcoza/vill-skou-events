// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#111; --card:#fff; --shadow:0 12px 26px rgba(0,0,0,.08) }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (no cropping) */
  .hero{ position:relative; border-radius:14px; overflow:hidden; background:#111; display:flex; align-items:flex-end; min-height:160px }
  .hero img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:center; background:#111 }
  .hero .meta{ position:relative; z-index:1; color:#fff; width:100%; padding:18px; background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0)) }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  .card{ background:var(--card); border-radius:14px; box-shadow:var(--shadow); padding:18px }
  h2{ margin:10px 0 12px }

  /* Info list */
  .info-row{ display:flex; align-items:center; gap:10px; padding:12px; background:#eef5ef; border-radius:12px; margin:8px 0 }
  .info-row .dot{ width:10px; height:10px; border-radius:999px; background:var(--green) }

  /* Top CTA */
  .center-cta{ text-align:center; margin:14px 0 6px }
  .cta{ display:inline-block; padding:14px 18px; border-radius:999px; background:var(--green); color:#fff; font-weight:800; text-decoration:none; border:none; cursor:pointer; box-shadow:0 8px 16px rgba(10,125,43,.25) }
  .cta .total{ opacity:.9; font-weight:700; margin-left:.35rem; background:rgba(255,255,255,.18); padding:4px 8px; border-radius:999px }

  /* Bottom sheet modal */
  .sheet{ position:fixed; left:0; right:0; bottom:-100%; background:#fff; border-radius:16px 16px 0 0; box-shadow:0 -18px 40px rgba(0,0,0,.25); transition:bottom .25s ease; z-index:30; max-height:90vh; display:flex; flex-direction:column }
  .sheet.show{ bottom:0 }
  .sheet .grab{ width:46px; height:5px; background:#e5e7eb; border-radius:999px; margin:10px auto }
  .sheet header{ padding:0 16px 8px; display:flex; align-items:center; justify-content:space-between }
  .sheet h3{ margin:0; font-size:20px }
  .sheet .list{ overflow:auto; padding:0 16px 8px }
  .sheet .ticket{ display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; padding:14px 0; border-bottom:1px solid #f1f3f5 }
  .sheet .ticket:last-child{ border-bottom:0 }
  .qty{ display:flex; align-items:center; gap:10px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.circle{ width:40px; height:40px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:18px }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }

  .sheet .footer{ border-top:1px solid #eef1f3; padding:12px 16px; display:flex; gap:10px; align-items:center; justify-content:space-between }
  .sheet .total{ font-weight:800; font-size:18px }

  /* Sticky summary bar (visible on mobile to avoid “lost total”) */
  .sticky-bar{ position:sticky; bottom:0; background:rgba(255,255,255,.92); backdrop-filter:saturate(150%) blur(6px); border-radius:16px; box-shadow:var(--shadow); padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px }
  .sticky-bar .ghost{ opacity:.65 }

  /* Desktop layout helper */
  .grid{ display:grid; grid-template-columns: 1fr; gap:16px; margin-top:14px }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function fmtWhen(s,e){
  const sdt = new Date((s||0)*1000), edt = new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function tryParseJSON(s){ try{ return JSON.parse(s); }catch{ return null; } }

const State = { items:new Map(), ttypes:new Map(), event:null };

function render(cat){
  const ev = cat.event || {};
  State.event = ev;
  State.ttypes = new Map((cat.ticket_types||[]).map(t=>[t.id,t]));

  const images = (ev.gallery_urls ? tryParseJSON(ev.gallery_urls) : []) || [];
  const hero = ev.hero_url || images[0] || ev.poster_url || '';

  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="hero">
      \${hero ? '<img alt="" src="'+escapeHtml(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${escapeHtml(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+escapeHtml(ev.venue) : ''}</span></div>
      </div>
    </div>

    <div class="center-cta">
      <button id="openPicker" class="cta">Kies kaartjies <span id="ctaTotal" class="total">R0.00</span></button>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Inligting</h2>
        <div class="info-row"><div class="dot"></div><div>\${fmtWhen(ev.starts_at, ev.ends_at)}</div></div>
        <div class="info-row"><div class="dot"></div><div>\${escapeHtml(ev.venue||'')}</div></div>
        \${ev.description ? '<div style="margin-top:12px" class="muted">'+escapeHtml(ev.description)+'</div>' : ''}
      </div>

      <div class="card">
        <h2>Jou keuse</h2>
        <div id="cartEmpty" class="muted">Geen kaartjies gekies</div>
        <div id="cartList"></div>

        <div class="sticky-bar">
          <button id="openPickerBar" class="btn ghost">Kies kaartjies</button>
          <div style="font-weight:800">Totaal: <span id="sumA">R0.00</span></div>
          <button id="checkoutBtn" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>

    <!-- Bottom sheet -->
    <div id="sheet" class="sheet" aria-hidden="true">
      <div class="grab"></div>
      <header>
        <h3>Kies kaartjies</h3>
        <button id="sheetClose" class="btn circle" aria-label="close">×</button>
      </header>
      <div id="sheetList" class="list"></div>
      <div class="footer">
        <div class="total">Totaal: <span id="sumB">R0.00</span></div>
        <button id="checkoutBtn2" class="btn primary" disabled>Checkout</button>
      </div>
    </div>
  \`;

  buildTicketList();
  wireInteractions();
  updateCartUI();
}

function buildTicketList(){
  const types = Array.from(State.ttypes.values());
  const list = document.getElementById('sheetList');
  if (!types.length){ list.innerHTML = '<div class="muted" style="padding:10px 0 18px">Geen kaartjies beskikbaar nie.</div>'; return; }
  list.innerHTML = types.map(t => \`
    <div class="ticket">
      <div>
        <div style="font-weight:700">\${escapeHtml(t.name)}</div>
        <div class="muted">\${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</div>
      </div>
      <div class="qty">
        <button class="btn circle" data-dec="\${t.id}">−</button>
        <span id="q\${t.id}">0</span>
        <button class="btn circle" data-inc="\${t.id}">+</button>
      </div>
    </div>\`).join('');
}

function wireInteractions(){
  const sheet = document.getElementById('sheet');
  const open = ()=> sheet.classList.add('show');
  const close= ()=> sheet.classList.remove('show');

  document.getElementById('openPicker').onclick = open;
  document.getElementById('openPickerBar').onclick = open;
  document.getElementById('sheetClose').onclick = close;

  // +/- buttons (event delegation)
  document.getElementById('sheetList').addEventListener('click', (e)=>{
    const inc = e.target.closest('[data-inc]'); const dec = e.target.closest('[data-dec]');
    if (!inc && !dec) return;
    const id = Number((inc||dec).dataset.inc || (inc||dec).dataset.dec);
    changeQty(id, inc ? +1 : -1);
  });

  // Checkout (both places)
  const goCheckout = ()=>{
    const items = Array.from(State.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
    if (!items.length) return;
    sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: State.event.id, items }));
    location.href = '/shop/' + encodeURIComponent(State.event.slug) + '/checkout';
  };
  document.getElementById('checkoutBtn').onclick  = goCheckout;
  document.getElementById('checkoutBtn2').onclick = goCheckout;
}

function changeQty(id, delta){
  const cur = State.items.get(id)||0;
  const next = Math.max(0, cur + delta);
  if (next===0) State.items.delete(id); else State.items.set(id, next);
  const el = document.getElementById('q'+id);
  if (el) el.textContent = String(next);
  updateCartUI();
}

function updateCartUI(){
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');

  const arr = Array.from(State.items.entries());
  empty.style.display = arr.length ? 'none' : 'block';

  let total = 0;
  list.innerHTML = arr.map(([tid,qty])=>{
    const tt = State.ttypes.get(tid) || { name:'', price_cents:0 };
    const line = qty * (tt.price_cents||0);
    total += line;
    return \`<div style="display:flex;justify-content:space-between;margin:6px 0">
      <div>\${escapeHtml(tt.name)} × \${qty}</div>
      <div>\${(tt.price_cents||0)? rands(line): 'FREE'}</div>
    </div>\`;
  }).join('');

  const has = total>0 || arr.length>0;
  document.getElementById('sumA').textContent = rands(total);
  document.getElementById('sumB').textContent = rands(total);
  document.getElementById('ctaTotal').textContent = rands(total);
  document.getElementById('checkoutBtn').disabled  = !has;
  document.getElementById('checkoutBtn2').disabled = !has;
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug))
    .then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  res.event = res.event || {};
  res.event.ticket_types = res.ticket_types || [];
  render(res);
}
load();
</script>
</body></html>`;
