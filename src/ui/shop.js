// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Event · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }

  /* HERO (use contain so nothing gets cropped) */
  .hero{
    position:relative; border-radius:14px; overflow:hidden; background:#111;
    display:flex; align-items:flex-end; min-height:160px;
  }
  .hero img{
    position:absolute; inset:0; width:100%; height:100%;
    object-fit:contain; object-position:center; /* IMPORTANT: no cropping */
    background:#111; /* letterbox behind */
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
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }

  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }

  /* GALLERY (no cropping) */
  .gallery-main{
    position:relative; border-radius:12px; overflow:hidden; background:#111;
    display:flex; align-items:center; justify-content:center;
    margin-bottom:10px;
  }
  .gallery-main img{
    width:100%;
    height:auto;             /* let the image decide its height */
    max-height:70vh;         /* but never exceed viewport */
    display:block;
    object-fit:contain;      /* show entire image */
    background:#111;         /* behind transparent PNGs */
    border-radius:12px;
  }
  @media (max-width:900px){
    .gallery-main img{ max-height:60vh; }
  }
  .thumbs{ display:flex; gap:8px; overflow:auto; padding:6px 2px }
  .thumbs img{
    width:88px; height:60px; object-fit:cover; border-radius:8px; cursor:pointer;
    border:2px solid transparent; background:#eee;
  }
  .thumbs img.active{ border-color:#0a7d2b }

  /* TICKETS */
  h2{ margin:10px 0 12px }
  .ticket{ display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid #f1f3f5 }
  .ticket:last-child{ border-bottom:0 }
  .qty{ display:flex; align-items:center; gap:8px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ background:#e5e7eb; color:#777; cursor:not-allowed }

  .totals{ font-weight:700; font-size:20px; text-align:right }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(cents){ return 'R' + ( (cents||0)/100 ).toFixed(2); }

function render(cat){
  const ev = cat.event || {};
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

    <div class="grid">
      <div class="card">
        \${renderGallery(images.length ? images : (ev.poster_url?[ev.poster_url]:[]))}
        <h2>Kaartjies</h2>
        <p class="muted">Kies hoeveel kaartjies jy wil koop. Jy sal jou besonderhede op die volgende blad invoer.</p>
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
        <div style="margin-top:12px;display:flex;justify-content:flex-start;gap:8px;flex-wrap:wrap">
          <span id="statusPill" class="pill" style="display:none"></span>
        </div>
        <div style="margin-top:12px">
          <button id="checkoutBtn" class="btn primary" disabled>Checkout</button>
        </div>
      </div>
    </div>
  \`;

  renderTickets(cat.ticket_types||[]);
  wireCart(cat.event);
}

function renderGallery(imgs){
  if (!imgs.length) return '';
  const first = escapeHtml(imgs[0]);
  const thumbs = imgs.map((u,i)=>\`<img src="\${escapeHtml(u)}" data-idx="\${i}" class="\${i===0?'active':''}" alt="thumbnail"/>\`).join('');
  return \`
    <div class="gallery-main"><img id="gMain" src="\${first}" alt="gallery image"/></div>
    <div class="thumbs" id="gThumbs">\${thumbs}</div>
  \`;
}

function wireGallery(){
  const thumbs = document.querySelectorAll('#gThumbs img');
  const main = document.getElementById('gMain');
  if (!thumbs || !main) return;
  thumbs.forEach(t=>{
    t.addEventListener('click', ()=>{
      thumbs.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      main.src = t.src;
    });
  });
}

function renderTickets(types){
  const el = document.getElementById('tickets');
  if (!types.length){ el.innerHTML = '<p class="muted">Geen kaartjies beskikbaar nie.</p>'; return; }
  el.innerHTML = types.map(t => \`
    <div class="ticket">
      <div>
        <div style="font-weight:600">\${escapeHtml(t.name)}</div>
        <div class="muted">\${(t.price_cents||0) ? rands(t.price_cents) : 'FREE'}</div>
      </div>
      <div class="qty">
        <button class="btn" data-dec="\${t.id}">−</button>
        <span id="q\${t.id}">0</span>
        <button class="btn" data-inc="\${t.id}">+</button>
      </div>
    </div>\`).join('');
}

function wireCart(event){
  const state = { items:new Map(), ttypes:null, event };
  state.ttypes = new Map((event.ticket_types||[]).map(t=>[t.id, t]));

  // Inc/Dec
  document.querySelectorAll('[data-inc]').forEach(b=>{
    b.onclick = ()=> changeQty(state, Number(b.dataset.inc), +1);
  });
  document.querySelectorAll('[data-dec]').forEach(b=>{
    b.onclick = ()=> changeQty(state, Number(b.dataset.dec), -1);
  });

  // Checkout
  document.getElementById('checkoutBtn').onclick = ()=> {
    const items = Array.from(state.items.entries()).map(([id,qty])=>({ ticket_type_id:id, qty }));
    if (!items.length) return;
    const params = new URLSearchParams({ slug: state.event.slug||'' });
    sessionStorage.setItem('pending_cart', JSON.stringify({ event_id: state.event.id, items }));
    location.href = '/shop/' + encodeURIComponent(state.event.slug) + '/checkout';
  };

  // After DOM finished, add gallery handlers
  wireGallery();

  // Status pill (closed?)
  const now = Math.floor(Date.now()/1000);
  if ((state.event.ends_at||0) < now || (state.event.status!=='active')){
    const pill = document.getElementById('statusPill');
    pill.textContent = 'Event Closed';
    pill.style.display = 'inline-block';
    document.getElementById('checkoutBtn').disabled = true;
  }
}

function changeQty(state, id, delta){
  const cur = state.items.get(id)||0;
  const next = Math.max(0, cur+delta);
  if (next===0) state.items.delete(id); else state.items.set(id,next);
  document.getElementById('q'+id).textContent = String(next);

  // Update cart
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  const arr = Array.from(state.items.entries());
  empty.style.display = arr.length ? 'none' : 'block';

  let total = 0;
  list.innerHTML = arr.map(([tid,qty])=>{
    const tt = state.ttypes.get(tid) || (state.event.ticket_types||[]).find(t=>t.id===tid) || {name:'',price_cents:0};
    const line = qty * (tt.price_cents||0);
    total += line;
    return \`<div style="display:flex;justify-content:space-between;margin:6px 0">
      <div>\${escapeHtml(tt.name)} × \${qty}</div>
      <div>\${(tt.price_cents||0)? rands(line): 'FREE'}</div>
    </div>\`;
  }).join('');

  document.getElementById('total').textContent = rands(total);
  document.getElementById('checkoutBtn').disabled = total<=0 && !arr.length;
}

function fmtWhen(s,e){
  const sdt = new Date((s||0)*1000), edt=new Date((e||0)*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA',opts) + ' – ' + edt.toLocaleDateString('af-ZA',opts);
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function tryParseJSON(s){ try{ return JSON.parse(s); }catch{ return null; } }

async function load(){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('app').textContent = 'Kon nie laai nie'; return; }
  // attach ticket types to event for quick access in wireCart()
  res.event = res.event || {};
  res.event.ticket_types = res.ticket_types || [];
  render(res);
}
load();
</script>
</body></html>`;
