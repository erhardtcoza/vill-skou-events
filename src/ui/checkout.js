// /src/ui/checkout.js
//
// Public checkout page for /shop/:slug/checkout
// Reads the cart from sessionStorage key: vs_cart_<slug>
// Cart structure expected: { event_id, slug, items: [{ticket_type_id, qty}], total_cents? }
//
// Shows buyer contact form and two actions:
//  - Pay now     -> createOrderPayNow (returns payment_url placeholder)
//  - Pay at event-> createOrderPayLater (shows short pickup/order code)
//
// Afrikaans copy per your request.

export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{--green:#0a7d2b;--muted:#667085;--bg:#f7f7f8}
  *{box-sizing:border-box} body{font-family:system-ui;margin:0;background:var(--bg);color:#111}
  .wrap{max-width:1100px;margin:20px auto;padding:0 16px}
  .bar{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .card{background:#fff;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,.07);padding:16px;margin-bottom:16px}
  h1{margin:0 0 8px}
  .grid{display:grid;grid-template-columns:1fr 360px;gap:16px}
  @media (max-width:900px){.grid{grid-template-columns:1fr}}
  input,button{padding:12px;border:1px solid #d1d5db;border-radius:12px}
  button{cursor:pointer}
  .primary{background:var(--green);color:#fff;border-color:var(--green)}
  .muted{color:var(--muted)}
  .total{font-weight:800;font-size:22px;text-align:right}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  .err{color:#b00020}
  .ok{color:#0a7d2b}
  .actions{display:flex;gap:10px;flex-wrap:wrap}
  .line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #eee}
</style>
</head><body><div class="wrap">

  <div class="bar">
    <h1>Checkout</h1>
    <div style="margin-left:auto"><a href="/shop/${slug}">← Terug na event</a></div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Jou besonderhede</h2>
      <div class="row">
        <input id="first" placeholder="Naam" style="flex:1 1 180px"/>
        <input id="last" placeholder="Van" style="flex:1 1 180px"/>
      </div>
      <div class="row">
        <input id="email" placeholder="E-pos" style="flex:1 1 280px"/>
        <input id="phone" placeholder="Selfoon" style="flex:1 1 180px"/>
      </div>
      <div class="actions">
        <button class="primary" id="btnPayNow">Pay now</button>
        <button id="btnPayLater">Pay at event</button>
        <span id="status" class="muted" role="status"></span>
      </div>
      <p class="muted" style="margin-top:10px;">
        Attendee-besonderhede (bv. geslag) kan by die hek ingevul word indien nodig.
      </p>
    </div>

    <div class="card">
      <h2>Jou keuse</h2>
      <div id="lines" class="muted">Laai keuse…</div>
      <div class="line"><strong>Totaal</strong><div id="total" class="total">R0.00</div></div>
      <p class="muted">Let wel: pryse word bevestig en herbereken op die volgende stap.</p>
    </div>
  </div>

</div>

<script>
const slug = ${JSON.stringify(slug)};
const cartKey = 'vs_cart_'+slug;
let cart = null;         // {event_id, slug, items:[{ticket_type_id, qty}]}
let ttById = new Map();  // ticket_type details for display

function rands(c){ return 'R'+((c||0)/100).toFixed(2); }
function qs(id){ return document.getElementById(id); }

async function loadCatalog(){
  // Fetch event catalog to resolve ticket names + prices
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug));
  if(!res.ok){ throw new Error('kon nie event laai nie'); }
  const data = await res.json();
  const tts = data.ticket_types || [];
  ttById = new Map(tts.map(t=> [t.id, t]));
}

function render(){
  const el = qs('lines');
  if(!cart || !Array.isArray(cart.items) || cart.items.length===0){
    el.textContent = 'Geen kaartjies gekies nie.';
    qs('total').textContent = rands(0);
    qs('btnPayNow').disabled = true;
    qs('btnPayLater').disabled = true;
    return;
  }
  let html = '';
  let total = 0;
  for (const it of cart.items) {
    const tt = ttById.get(it.ticket_type_id);
    if (!tt) continue;
    const qty = Number(it.qty||0);
    const line = qty * Number(tt.price_cents||0);
    total += line;
    const nm = tt.name || ('Tipe '+it.ticket_type_id);
    html += '<div class="line"><span>'+nm+' × '+qty+'</span><strong>'+rands(line)+'</strong></div>';
  }
  el.innerHTML = html || '<div class="muted">Geen kaartjies nie.</div>';
  qs('total').textContent = rands(total);
  qs('btnPayNow').disabled = false;
  qs('btnPayLater').disabled = false;
}

function buyerFromForm(){
  return {
    first: qs('first').value.trim(),
    last:  qs('last').value.trim(),
    email: qs('email').value.trim(),
    phone: qs('phone').value.trim(),
  };
}

async function submit(mode){
  if(!cart?.event_id || !cart?.items?.length){
    qs('status').textContent = 'Geen kaartjies gekies nie.';
    return;
  }
  qs('status').textContent = 'Laai…';
  const body = {
    mode,
    event_id: cart.event_id,
    items: cart.items.map(i=>({ticket_type_id:i.ticket_type_id, qty:Number(i.qty||0)})),
    buyer: buyerFromForm()
  };
  const res = await fetch('/api/public/checkout', {
    method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
  }).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));

  if(!res.ok){
    qs('status').className = 'err';
    qs('status').textContent = 'Error: '+(res.error||'Kon nie voortgaan nie');
    return;
  }

  if(mode === 'pay_later'){
    // Afrikaans copy you requested:
    // Bestelling geskep.
    // Jou bestel nommer is as volg: CODE.
    // Wys dit by die hek om te betaal en jou kaartjies te ontvang.
    qs('status').className = 'ok';
    qs('status').innerHTML =
      'Bestelling geskep. <br/>' +
      'Jou bestel nommer is as volg: <strong>'+res.pickup_code+'</strong>. '+
      'Wys dit by die hek om te betaal en jou kaartjies te ontvang.';
    try { sessionStorage.removeItem(cartKey); } catch {}
  } else {
    // pay_now: redirect to placeholder URL (later: Yoco hosted payment)
    location.href = res.payment_url || '/';
  }
}

document.getElementById('btnPayLater').addEventListener('click', ()=>submit('pay_later'));
document.getElementById('btnPayNow').addEventListener('click', ()=>submit('pay_now'));

(async function init(){
  try { cart = JSON.parse(sessionStorage.getItem(cartKey)||'null'); } catch { cart = null; }
  await loadCatalog().catch(()=>{});
  render();
})();
</script>
</body></html>`;
