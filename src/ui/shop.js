// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${slug} · Villiersdorp Skou</title>
<style>
  :root{
    --skou-green:#0a7d2b; --skou-yellow:#ffd900; --grey-1:#f7f7f8; --grey-2:#eef0f2; --text:#222; --muted:#666;
  }
  *{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--grey-1);margin:0;color:var(--text)}
  .hero{position:relative;background:#e9f5eb;color:#fff}
  .hero .img{width:100%;height:220px;object-fit:cover;display:block;filter:brightness(.75)}
  .hero .wrap{position:absolute;inset:0;display:flex;align-items:flex-end}
  .hero .inner{max-width:1100px;margin:0 auto;padding:16px;display:flex;gap:16px;align-items:flex-end;width:100%}
  .poster{width:160px;height:110px;background:#ffffff55;border-radius:10px;overflow:hidden;flex:0 0 auto;border:1px solid #ffffff66}
  .poster img{width:100%;height:100%;object-fit:cover;display:block}
  .meta{color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.4)}
  .meta h1{margin:0 0 6px;font-size:28px}
  .meta small{opacity:.95}

  .page{max-width:1100px;margin:18px auto;padding:0 16px;display:grid;grid-template-columns:1.5fr .9fr;gap:20px}
  .card{background:#fff;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.06);padding:18px}
  .muted{color:var(--muted);font-size:14px}

  .gallery{display:flex;flex-direction:column;gap:10px}
  .gallery-main{position:relative;border-radius:12px;overflow:hidden;background:#000}
  .gallery-main img{width:100%;height:360px;object-fit:cover;display:block}
  .gallery-thumbs{display:flex;gap:8px;overflow:auto;padding-bottom:4px}
  .gallery-thumbs img{width:90px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid transparent}
  .gallery-thumbs img.active{border-color:var(--skou-green)}

  .ticket{display:grid;grid-template-columns:1fr 140px 140px;gap:10px;align-items:center;border-bottom:1px solid var(--grey-2);padding:12px 0}
  .ticket:last-child{border-bottom:none}
  .name{font-weight:600}
  .price{font-variant-numeric:tabular-nums;color:#000}
  .price.free{color:#0a7d2b;font-weight:700}
  .qty{display:flex;align-items:center;gap:6px;justify-content:flex-end}
  .qty button{width:32px;height:32px;border:none;border-radius:8px;background:var(--grey-2);cursor:pointer}
  .qty input{width:56px;text-align:center;padding:8px;border:1px solid var(--grey-2);border-radius:8px}

  .summary .row{display:flex;justify-content:space-between;margin:8px 0}
  .summary .total{font-size:20px;font-weight:700}
  .btn{display:inline-block;background:var(--skou-green);color:#fff;text-decoration:none;border:none;border-radius:10px;padding:12px 16px;cursor:pointer}
  .btn[disabled]{opacity:.4;cursor:not-allowed}
  .sticky{position:sticky;top:16px}

  @media (max-width:900px){
    .page{grid-template-columns:1fr}
    .gallery-main img{height:240px}
    .poster{display:none}
  }
</style>
</head><body>

  <div class="hero">
    <img id="heroImg" class="img" alt="" />
    <div class="wrap">
      <div class="inner">
        <div class="poster" id="posterBox" aria-hidden="true"></div>
        <div class="meta">
          <h1 id="ev-name">Loading…</h1>
          <small id="ev-when"></small><br/>
          <small id="ev-venue"></small>
        </div>
      </div>
    </div>
  </div>

  <div class="page">
    <div class="card">
      <div class="gallery" id="gallery" style="display:none">
        <div class="gallery-main"><img id="gMain" alt="Gallery image"></div>
        <div class="gallery-thumbs" id="gThumbs"></div>
      </div>

      <h2 style="margin:14px 0 6px">Kaartjies</h2>
      <div id="tickets"></div>
      <p class="muted">Kies hoeveel kaartjies jy wil koop. Jy sal jou besonderhede op die volgende blad invoer.</p>
    </div>

    <div class="card sticky summary">
      <h3 style="margin-top:0">Jou keuse</h3>
      <div id="summary-list" class="muted">Geen kaartjies gekies</div>
      <div class="row"><span>Subtotaal</span><span id="subtotal">R0.00</span></div>
      <div class="row total"><span>Totaal</span><span id="total">R0.00</span></div>
      <button id="checkout" class="btn" disabled>Checkout</button>
    </div>
  </div>

<script>
const slug=${JSON.stringify(slug)};
let catalog=null, selections=new Map(); // ticket_type_id -> {name, price_cents, qty}

function fmtR(c){ return 'R'+(c/100).toFixed(2); }

function fmtWhen(s,e){
  const sdt = new Date(s*1000), edt=new Date(e*1000);
  const sameDay = sdt.toDateString() === edt.toDateString();
  const dopt = { weekday:'short', day:'2-digit', month:'short' };
  const topt = { hour:'2-digit', minute:'2-digit' };
  return sameDay
    ? sdt.toLocaleDateString('af-ZA', dopt) + ' ' + sdt.toLocaleTimeString('af-ZA', topt)
    : sdt.toLocaleDateString('af-ZA', dopt) + ' – ' + edt.toLocaleDateString('af-ZA', dopt);
}

async function load(){
  const res = await fetch('/api/public/events/'+slug).then(r=>r.json());
  catalog = res; const ev=res.event, types=res.types||[];

  // Header info
  document.getElementById('ev-name').textContent = ev.name || slug;
  document.getElementById('ev-when').textContent = fmtWhen(ev.starts_at, ev.ends_at);
  document.getElementById('ev-venue').textContent = ev.venue || '';

  // Hero image
  const hero = document.getElementById('heroImg');
  if (ev.hero_url) {
    hero.src = ev.hero_url;
    hero.alt = ev.name || 'Event';
  } else {
    // fallback gradient
    hero.style.background = 'linear-gradient(90deg,var(--skou-green),var(--skou-yellow))';
    hero.style.filter = 'none';
  }

  // Poster image (beside title)
  const posterBox = document.getElementById('posterBox');
  if (ev.poster_url) {
    const img = new Image(); img.src = ev.poster_url; img.alt = (ev.name||'') + ' poster';
    posterBox.appendChild(img);
  } else {
    posterBox.style.display='none';
  }

  // Gallery
  let gallery = [];
  try { gallery = Array.isArray(ev.gallery_urls) ? ev.gallery_urls : JSON.parse(ev.gallery_urls||'[]'); }
  catch(_) { gallery = []; }
  gallery = (gallery||[]).filter(Boolean).slice(0,8);
  if (gallery.length){
    const gWrap = document.getElementById('gallery');
    const gMain = document.getElementById('gMain');
    const gThumbs = document.getElementById('gThumbs');
    gWrap.style.display='flex';
    let idx = 0;
    function show(i){
      idx = i;
      gMain.src = gallery[i];
      [...gThumbs.children].forEach((el,j)=> el.classList.toggle('active', j===i));
    }
    gallery.forEach((url,i)=>{
      const t = new Image();
      t.src = url; t.alt = 'Gallery '+(i+1);
      t.onclick = ()=> show(i);
      gThumbs.appendChild(t);
    });
    show(0);

    // swipe support
    let sx=0, dx=0;
    gMain.addEventListener('touchstart', e=>{ sx = e.changedTouches[0].clientX; }, {passive:true});
    gMain.addEventListener('touchend',   e=>{
      dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40){
        const n = (idx + (dx<0?1:-1) + gallery.length) % gallery.length;
        show(n);
      }
    }, {passive:true});
  }

  renderTickets(types); updateSummary();
}

function renderTickets(types){
  const wrap = document.getElementById('tickets'); wrap.innerHTML='';
  types.forEach(t=>{
    const row=document.createElement('div'); row.className='ticket';
    const isFree = !t.price_cents || t.price_cents===0;
    const priceHTML = isFree ? '<span class="price free">FREE</span>' : '<span class="price">'+fmtR(t.price_cents)+'</span>';
    row.innerHTML = \`
      <div>
        <div class="name">\${t.name}</div>
        <div class="muted">\${t.per_order_limit ? ('Max per order: '+t.per_order_limit) : (t.requires_gender?'Gender required':'' )}</div>
      </div>
      <div>\${priceHTML}</div>
      <div class="qty">
        <button aria-label="decrease">-</button>
        <input type="number" min="0" value="0">
        <button aria-label="increase">+</button>
      </div>\`;
    const [dec,input,inc]=row.querySelectorAll('.qty *');
    function set(v){
      v = Math.max(0, Math.min(v, t.per_order_limit||99));
      input.value=v;
      if (v>0) selections.set(t.id, { name:t.name, price_cents:t.price_cents||0, qty:v, requires_gender: !!t.requires_gender, ticket_type_id:t.id });
      else selections.delete(t.id);
      updateSummary();
    }
    dec.onclick=()=>set(+input.value-1);
    inc.onclick=()=>set(+input.value+1);
    input.oninput=()=>set(+input.value||0);
    wrap.appendChild(row);
  });
}

function updateSummary(){
  const list=document.getElementById('summary-list');
  if (!selections.size){ list.textContent='Geen kaartjies gekies'; }
  else {
    list.innerHTML = [...selections.values()].map(s=>{
      const linePrice = (s.price_cents===0) ? 'FREE' : fmtR(s.price_cents*s.qty);
      return \`<div class="row"><span>\${s.name} × \${s.qty}</span><span>\${linePrice}</span></div>\`;
    }).join('');
  }
  let total = 0; selections.forEach(s=> total += (s.price_cents||0)*s.qty );
  document.getElementById('subtotal').textContent = fmtR(total);
  document.getElementById('total').textContent = fmtR(total);
  document.getElementById('checkout').disabled = total===0;
}

// move to checkout (store cart in sessionStorage)
document.getElementById('checkout').onclick = ()=>{
  const items = [...selections.values()].map(s=>({ ticket_type_id:s.ticket_type_id, qty:s.qty, requires_gender:s.requires_gender, name:s.name, price_cents:s.price_cents||0 }));
  sessionStorage.setItem('skou_cart', JSON.stringify({ slug, event_id: catalog.event.id, items, ts: Date.now() }));
  location.href = '/shop/'+slug+'/checkout';
};

load();
</script>
</body></html>`;
