// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --ink:#111; --card:#fff; --pill:#eef6f0 }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (no cropping) */
  .hero{ position:relative; border-radius:14px; overflow:hidden; background:#111; min-height:150px; }
  .hero img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:center; background:#111; }
  .hero .meta{ position:relative; z-index:1; color:#fff; width:100%; padding:18px; background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0)); }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .muted{ color:#9aa3af }

  /* CTA */
  .cta-wrap{ display:flex; justify-content:center; margin-top:10px }
  .cta{ display:inline-flex; align-items:center; gap:12px; padding:14px 18px; border-radius:999px; border:0; background:var(--green); color:#fff; font-weight:800; cursor:pointer; box-shadow:0 10px 20px rgba(10,125,43,.18) }
  .cta .badge{ background:rgba(255,255,255,.18); border-radius:999px; padding:6px 12px; font-weight:800 }

  /* GRID */
  .grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:16px; margin-top:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }

  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }

  /* INFO */
  .info-row{ background:#eaf5ea; border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:10px; margin:10px 0 }
  .dot{ width:10px; height:10px; border-radius:999px; background:#1bbf47; box-shadow:0 0 0 2px rgba(27,191,71,.25) inset }

  .desc{ margin-top:12px; border:1px dashed #e0e7e0; border-radius:12px; padding:12px 14px; color:#3b4b3b; background:#f8fbf8 }
  .desc b{ display:block; color:#2d3b2d; margin-bottom:6px }

  /* TICKETS (desktop panel) */
  h2{ margin:6px 0 12px }
  .trow{ display:grid; grid-template-columns:1fr auto auto; gap:10px; align-items:center; padding:12px 0; border-bottom:1px solid #f1f3f5 }
  .trow:last-child{ border-bottom:0 }
  .qty{ display:flex; align-items:center; gap:8px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.icon{ width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:12px }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }
  .price{ font-weight:700 }

  /* Desktop totals inside right panel */
  .panel-total{ display:flex; justify-content:space-between; align-items:center; margin-top:12px }
  .panel-total strong{ font-size:18px }
  .panel-total .sum{ font-weight:800 }

  /* Mobile selection summary block */
  .mobile-cart{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px; margin:14px 0 }
  .mobile-cart .line{ display:flex; justify-content:space-between; margin:8px 0 }
  .mobile-cart .sum{ font-weight:900; font-size:22px }
  .only-mobile{ display:none }
  @media (max-width:900px){ .only-mobile{ display:block } .only-desktop{ display:none } }

  /* Bottom sheet */
  .sheet{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:none; z-index:50 }
  .sheet.open{ display:block }
  .sheet .panel{
    position:absolute; left:0; right:0; bottom:0; background:#fff; border-radius:18px 18px 0 0;
    max-height:85vh; overflow:auto; padding:16px; box-shadow:0 -14px 28px rgba(0,0,0,.2);
  }
  .grab{ width:46px; height:5px; border-radius:999px; background:#e3e7ed; margin:4px auto 12px }
  .sheet .row{ display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:12px; padding:14px 6px; border-bottom:1px solid #f3f4f6 }
  .sheet .row:last-child{ border-bottom:0 }
  .sheet .footer{ position:sticky; bottom:0; background:#fff; padding-top:10px; display:flex; justify-content:flex-end; gap:10px }
  .chip{ padding:8px 12px; border-radius:999px; background:#eef2f5; color:#333; border:1px solid #e5e7eb }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function fmtWhen(s,e){
  const sdt = new Date((s||0)*1000), edt = new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}

function render(data){
  const ev = data.event || {};
  const hero = ev.hero_url || ev.poster_url || '';
  const ttypes = data.ticket_types || [];
  const app = document.getElementById('app');

  app.innerHTML = \`
    <div class="hero">
      \${hero ? '<img alt="" src="'+escapeHtml(hero)+'"/>' : ''}
      <div class="meta">
        <h1>\${escapeHtml(ev.name||'Event')}</h1>
        <div class="muted">\${fmtWhen(ev.starts_at, ev.ends_at)}<span>\${ev.venue ? ' · '+escapeHtml(ev.venue) : ''}</span></div>
      </div>
    </div>

    <!-- Mobile CTA -->
    <div class="cta-wrap only-mobile">
      <button id="openSheet" class="cta">
        <span>Kies jou kaartjies</span>
        <span class="badge" id="ctaTotal">R0.00</span>
      </button>
    </div>

    <div class="grid">
      <!-- LEFT: Inligting -->
      <div class="card">
        <h2>Inligting</h2>
        <div class="info-row"><span class="dot"></span><div>\${fmtWhen(ev.starts_at, ev.ends_at)}</div></div>
        <div class="info-row"><span class="dot"></span><div>\${escapeHtml(ev.venue || 'Villiersdorp Skougronde')}</div></div>
        <div class="desc">
          <b>Oorsig</b>
          Meer besonderhede volg binnekort. (Plak hier jou beskrywing, program/hoogtepunte, ens.)
        </div>
      </div>

      <!-- RIGHT: Tickets (desktop) -->
      <div class="card only-desktop" id="deskPanel">
        <h2>Kaartjies</h2>
        <div id="deskRows"></div>
        <div class="panel-total">
          <strong>R<span id="deskSum">0.00</span></strong>
          <button id="deskCheckout" class="btn primary">Checkout</button>
        </div>
      </div>
    </div>

    <!-- Mobile selected / total (no duplicate on desktop) -->
    <div class="mobile-cart only-mobile" id="mCart">
      <div id="mobileLines" class="muted">Geen kaartjies gekies</div>
      <div class="line" style="margin-top:14px"><strong>Totaal</strong><span class="sum" id="mSum">R0.00</span></div>
      <div style="display:flex;justify-content:flex-end;margin-top:10px">
        <button id="mCheckout" class="btn primary">Checkout</button>
      </div>
    </div>

    <!-- Bottom sheet for mobile selection -->
    <div class="sheet" id="sheet">
      <div class="panel">
        <div class="grab"></div>
        <h2 style="margin:0 0 8px">Kies jou kaartjies</h2>
        <div id="sheetRows"></div>
        <div class="footer">
          <button id="closeSheet" class="btn">Sluit</button>
          <button id="sheetCheckout" class="btn primary">Checkout</button>
        </div>
      </div>
    </div>
  \`;

  const state = {
    event: ev,
    types: new Map(ttypes.map(t=>[t.id, t])),
    qty: new Map(), // ticket_type_id -> qty
  };

  // ----- Build rows in desktop panel & bottom sheet -----
  const mkRowHTML = (t, loc) => \`
    <div class="\${loc==='sheet' ? 'row' : 'trow'}">
      <div>\${escapeHtml(t.name)}</div>
      <div class="price">\${(t.price_cents||0)? rands(t.price_cents) : 'FREE'}</div>
      <div class="qty">
        <button class="btn icon" data-dec="\${t.id}" aria-label="minus">−</button>
        <span id="q-\${loc}-\${t.id}">0</span>
        <button class="btn icon" data-inc="\${t.id}" aria-label="plus">+</button>
      </div>
    </div>\`;

  document.getElementById('deskRows').innerHTML = ttypes.map(t=>mkRowHTML(t,'desk')).join('');
  document.getElementById('sheetRows').innerHTML = ttypes.map(t=>mkRowHTML(t,'sheet')).join('');

  // ----- Quantity change handlers (both UIs share the same state) -----
  function change(id, d){
    const cur = state.qty.get(id) || 0;
    const next = Math.max(0, cur + d);
    if (next===0) state.qty.delete(id); else state.qty.set(id, next);
    // update counters in both places
    ['desk','sheet'].forEach(loc=>{
      const el = document.getElementById('q-'+loc+'-'+id);
      if (el) el.textContent = String(next);
    });
    renderTotals();
  }
  document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>change(Number(b.dataset.inc), +1));
  document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>change(Number(b.dataset.dec), -1));

  // ----- Totals + lines (desktop + mobile + CTA badge) -----
  function renderTotals(){
    let total=0;
    const lines=[];
    state.qty.forEach((q, id)=>{
      const tt = state.types.get(id);
      const line = q * (tt?.price_cents||0);
      total += line;
      lines.push(\`<div class="line"><span>\${escapeHtml(tt?.name||'')} × \${q}</span><span>\${(tt?.price_cents||0)? rands(line) : 'FREE'}</span></div>\`);
    });

    // desktop sum
    const dSum = document.getElementById('deskSum');
    if (dSum) dSum.textContent = (total/100).toFixed(2);

    // mobile list + sum
    const mLines = document.getElementById('mobileLines');
    const mSum = document.getElementById('mSum');
    if (mLines) mLines.innerHTML = lines.length ? lines.join('') : '<span class="muted">Geen kaartjies gekies</span>';
    if (mSum) mSum.textContent = rands(total);

    // CTA badge
    const badge = document.getElementById('ctaTotal');
    if (badge) badge.textContent = rands(total);
  }
  renderTotals();

  // ----- Checkout wiring (both buttons behave the same) -----
  function goCheckout(){
    // build items payload from state
    const items = Array.from(state.qty.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
    if (!items.length) return;
    sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: state.event.id, items }));
    location.href = '/shop/' + encodeURIComponent(state.event.slug) + '/checkout';
  }
  const mCheckout = document.getElementById('mCheckout');
  const dCheckout = document.getElementById('deskCheckout');
  const sCheckout = document.getElementById('sheetCheckout');
  if (mCheckout) mCheckout.onclick = goCheckout;
  if (dCheckout) dCheckout.onclick = goCheckout;
  if (sCheckout) sCheckout.onclick = goCheckout;

  // ----- Mobile sheet open/close -----
  const sheet = document.getElementById('sheet');
  const open = document.getElementById('openSheet');
  const close = document.getElementById('closeSheet');
  if (open) open.onclick = ()=> sheet.classList.add('open');
  if (close) close.onclick = ()=> sheet.classList.remove('open');
  if (sheet) sheet.addEventListener('click', (e)=>{ if (e.target === sheet) sheet.classList.remove('open'); });
}

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  const app = document.getElementById('app');
  if (!res.ok){ app.textContent = 'Kon nie laai nie'; return; }
  // ensure ticket_types present on response
  res.event = res.event || {};
  render(res);
}
load();
</script>
</body></html>`;
