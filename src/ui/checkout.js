// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{--bg:#f6f7f8;--card:#fff;--line:#e5e7eb;--muted:#6b7280;--brand:#0a7d2b}
  html,body{margin:0;background:var(--bg);font:16px/1.45 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b0b0b}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  h1{margin:0 0 18px}
  a{color:#0b4b9d;text-decoration:none}
  .grid{display:grid;grid-template-columns:2fr 1.1fr;gap:16px}
  @media (max-width:900px){ .grid{grid-template-columns:1fr} }
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
  input,button{padding:12px;border:1px solid #d1d5db;border-radius:12px}
  input{width:100%}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .muted{color:var(--muted)}
  button.primary{background:var(--brand);border-color:var(--brand);color:#fff;cursor:pointer}
  .total{font-size:28px;font-weight:800}
  .ok{color:#0a7d2b}
  .err{color:#b00020}
  .li{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #eee}
</style>
</head><body><div class="wrap">
  <h1>Checkout</h1>
  <div class="row" style="margin:-6px 0 14px">
    <a href="/shop/${slug}">← Terug na event</a>
  </div>

  <div class="grid">
    <section class="card">
      <h2 style="margin:0 0 12px">Jou besonderhede</h2>
      <div class="row">
        <input id="first" placeholder="Naam" style="flex:1 1 200px"/>
        <input id="last"  placeholder="Van" style="flex:1 1 200px"/>
      </div>
      <div class="row">
        <input id="email" type="email" placeholder="E-pos" style="flex:1 1 260px"/>
        <input id="phone" placeholder="Selfoon" style="flex:1 1 200px"/>
      </div>
      <div class="row" style="margin-top:10px">
        <button id="payNow" class="primary">Pay now</button>
        <button id="payLater">Pay at event</button>
        <span id="msg" class="muted" style="align-self:center"></span>
      </div>
    </section>

    <aside class="card">
      <h2 style="margin:0 0 12px">Jou keuse</h2>
      <div id="items"></div>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <div class="muted" style="font-weight:700">Totaal</div>
        <div class="total" id="total">R0.00</div>
      </div>
      <div class="muted" style="margin-top:8px">Let wel: pryse word bevestig en herbereken op die volgende stap.</div>
    </aside>
  </div>
</div>

<script>
const SLUG = ${JSON.stringify(slug)};
const $ = id => document.getElementById(id);
const fmtR = cents => 'R' + (Math.round(cents)/100).toFixed(2);

let catalog = null;     // { event, ticket_types }
let cartMap = {};       // { ticket_type_id: qty }
let priceById = {};     // { id: price_cents }
let itemsArray = [];    // [{ticket_type_id, qty, price_cents, name}]

start();

async function start(){
  cartMap = readCartFromStorage();
  // load catalog
  const res = await fetch('/api/public/events/'+encodeURIComponent(SLUG)).then(r=>r.json()).catch(()=>({ok:false}));
  if(!res.ok){ $('msg').textContent = 'Kon nie event laai nie.'; return; }
  catalog = res;
  (res.ticket_types||[]).forEach(t=> priceById[t.id] = Number(t.price_cents||0));
  rebuildItems();
  wire();
}

function readCartFromStorage(){
  // Try several keys to be resilient across UI versions
  const keys = [
    'vs_cart_'+SLUG,
    'cart_'+SLUG,
    'cart'
  ];
  for (const k of keys){
    try{
      const raw = localStorage.getItem(k);
      if(!raw) continue;
      const v = JSON.parse(raw);
      // Accept array of {ticket_type_id, qty} OR map {id:qty}
      if (Array.isArray(v)) {
        const m = {};
        v.forEach(it => { if (it && it.ticket_type_id && it.qty) m[it.ticket_type_id] = Number(it.qty)||0; });
        if (Object.keys(m).length) return m;
      } else if (v && typeof v === 'object') {
        // if nested like {items:[...]}
        if (Array.isArray(v.items)) {
          const m = {};
          v.items.forEach(it => { if (it && it.ticket_type_id && it.qty) m[it.ticket_type_id] = Number(it.qty)||0; });
          if (Object.keys(m).length) return m;
        } else {
          // assume direct map
          let any=false, m={};
          Object.keys(v).forEach(id => { const q = Number(v[id])||0; if(q>0){ m[Number(id)] = q; any=true; }});
          if (any) return m;
        }
      }
    }catch(e){}
  }
  return {};
}

function rebuildItems(){
  // Convert cartMap to displayable array with names/prices
  const types = (catalog && catalog.ticket_types) || [];
  const byId = {}; types.forEach(t=>byId[t.id]=t);
  itemsArray = Object.entries(cartMap)
    .map(([id,qty])=>{
      id = Number(id); qty = Number(qty)||0;
      const t = byId[id];
      if(!t || qty<=0) return null;
      return { ticket_type_id:id, qty, price_cents: Number(t.price_cents||0), name: t.name };
    })
    .filter(Boolean);

  renderItems();
}

function renderItems(){
  const el = $('items');
  if (!itemsArray.length){
    el.innerHTML = '<div class="muted">Geen kaartjies gekies nie.</div>';
    $('total').textContent = 'R0.00';
    return;
  }
  let total = 0;
  el.innerHTML = itemsArray.map(it=>{
    const line = it.qty * (it.price_cents||0);
    total += line;
    return \`<div class="li"><div>\${it.name} × \${it.qty}</div><div>\${fmtR(line)}</div></div>\`;
  }).join('');
  $('total').textContent = fmtR(total);
}

function readBuyer(){
  return {
    first: $('first').value.trim(),
    last:  $('last').value.trim(),
    email: $('email').value.trim(),
    phone: $('phone').value.trim(),
  };
}

function payload(mode){
  const buyer = readBuyer();
  // minimal validation for pay_now; relaxed for pay_later
  const items = itemsArray.map(it=>({ ticket_type_id: it.ticket_type_id, qty: it.qty }));
  return {
    mode, 
    event_id: catalog.event?.id,
    items,
    contact: buyer
  };
}

function wire(){
  $('payLater').addEventListener('click', async ()=>{
    $('msg').textContent = '';
    const body = payload('pay_later');
    if (!body.items.length) { $('msg').textContent = 'Kies ten minste een kaartjie.'; return; }
    const res = await fetch('/api/public/checkout', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    }).then(r=>r.json()).catch(()=>({ok:false,error:'Netwerkfout'}));
    if(!res.ok){ $('msg').textContent = res.error || 'Kon nie bestelling skep nie.'; return; }
    $('msg').innerHTML = '<span class="ok">Bestelling geskep.</span>';
    const code = res.pickup_code || res.short_code || '—';
    // Clear cart on success
    try{ localStorage.removeItem('vs_cart_'+SLUG); localStorage.removeItem('cart_'+SLUG); }catch{}
    // Show friendly message
    const box = document.createElement('div');
    box.className = 'card';
    box.style.marginTop = '10px';
    box.innerHTML = \`
      <div class="ok" style="font-weight:700;margin-bottom:6px">Jou bestel nommer is as volg: \${code}.</div>
      <div>Wys dit by die hek om te betaal en jou kaartjies te ontvang.</div>\`;
    document.querySelector('.wrap .grid').prepend(box);
  });

  $('payNow').addEventListener('click', async ()=>{
    $('msg').textContent = '';
    const b = readBuyer();
    if(!b.first || !b.last || !b.email || !b.phone){
      $('msg').textContent = 'Vul asseblief jou besonderhede in om voort te gaan.'; return;
    }
    const body = payload('pay_now');
    if (!body.items.length) { $('msg').textContent = 'Kies ten minste een kaartjie.'; return; }

    const res = await fetch('/api/public/checkout', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    }).then(r=>r.json()).catch(()=>({ok:false,error:'Netwerkfout'}));

    if(!res.ok){ $('msg').textContent = res.error || 'Kon nie betaal stap begin nie.'; return; }
    const url = res.payment_url || '';
    if (url) location.href = url;
    else $('msg').textContent = 'Payment URL nie beskikbaar nie.';
  });
}
</script>
</body></html>`;
