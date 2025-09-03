// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  a{ color:#111; text-decoration:none }
  .muted{ color:var(--muted) }
  .grid{ display:grid; grid-template-columns:1fr .9fr; gap:16px; margin-top:10px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 8px }
  label{ font-size:13px; color:#475467; display:block; margin-bottom:6px }
  input{ width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn:disabled{ opacity:.5; cursor:not-allowed }
  .totals{ font-weight:700; font-size:20px; text-align:right }
  .line{ display:flex; justify-content:space-between; margin:6px 0 }
  .note{ font-size:13px; color:#667085 }
</style>
</head><body>
<div class="wrap">
  <div style="margin-bottom:8px"><a href="/shop/${encodeURIComponent(slug)}">← Terug na event</a></div>
  <h1>Checkout</h1>

  <div class="grid">
    <div class="card">
      <h2 style="margin:0 0 12px">Jou besonderhede</h2>
      <div class="row" style="margin-bottom:10px">
        <input id="first" placeholder="Naam"/>
        <input id="last" placeholder="Van"/>
      </div>
      <div class="row" style="margin-bottom:12px">
        <input id="email" placeholder="E-pos"/>
        <input id="phone" placeholder="Selfoon"/>
      </div>
      <div style="display:flex; gap:8px">
        <button id="payNow" class="btn primary">Pay now</button>
        <button id="payAt" class="btn">(Pay at event)</button>
      </div>
      <div id="msg" class="note" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h2 style="margin:0 0 12px">Jou keuse</h2>
      <div id="cartEmpty" class="muted">Geen kaartjies gekies nie.</div>
      <div id="cartList"></div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700">Totaal</span>
        <span id="total" class="totals">R0.00</span>
      </div>
      <p class="note" style="margin-top:12px">Let wel: pryse word bevestig en herbereken op die volgende stap.</p>
    </div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }

let state = { event:null, items:[], ttypes:new Map(), total:0 };

function loadFromSession(){
  try {
    const s = sessionStorage.getItem('pending_cart');
    if (!s) return null;
    const j = JSON.parse(s);
    if (!Array.isArray(j.items) || !j.event_id) return null;
    return j;
  } catch { return null; }
}

function renderCart(){
  const list = document.getElementById('cartList');
  const empty = document.getElementById('cartEmpty');
  if (!state.items.length){
    list.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('total').textContent = rands(0);
    return;
  }
  empty.style.display = 'none';
  let total = 0;
  list.innerHTML = state.items.map(it=>{
    const tt = state.ttypes.get(it.ticket_type_id) || {name:'', price_cents:0};
    const line = (tt.price_cents||0) * (it.qty||0);
    total += line;
    return \`<div class="line"><div>\${escapeHtml(tt.name)} × \${it.qty}</div><div>\${(tt.price_cents||0)?rands(line):'FREE'}</div></div>\`;
  }).join('');
  state.total = total;
  document.getElementById('total').textContent = rands(total);
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

async function bootstrap(){
  const cart = loadFromSession();
  if (!cart){
    // nothing selected
    renderCart();
    return;
  }

  // fetch event + ticket types to hydrate names/prices
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ document.getElementById('msg').textContent='Kon nie data laai nie.'; return; }

  state.event = res.event || {};
  const types = res.ticket_types || [];
  state.ttypes = new Map(types.map(t=>[t.id, t]));
  state.items = cart.items || [];
  renderCart();
}

function details(){
  return {
    first: document.getElementById('first').value.trim(),
    last:  document.getElementById('last').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
  };
}

async function createOrder(settle){
  const d = details();
  if (!state.items.length){ document.getElementById('msg').textContent='Kies ten minste één kaartjie.'; return; }

  const body = {
    event_id: state.event?.id,
    items: state.items,
    customer: d,
    payment: settle ? { method:'paynow' } : { method:'pay_at_event' }
  };

  const r = await fetch('/api/orders/create', { // endpoint you already have server-side
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify(body)
  }).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));

  if (!r.ok){
    document.getElementById('msg').textContent = 'Fout: ' + (r.error||'kon nie bestel nie');
    return;
  }

  if (settle && r.pay_url){
    location.href = r.pay_url; // redirect to payment
    return;
  }

  // Pay at event → show code and copy it
  document.getElementById('msg').innerHTML =
    'Bestelling geskep.<br/>Jou bestel nommer is as volg: <b>'+escapeHtml(r.code||'')+'</b>.<br/>Wys dit by die hek om te betaal en jou kaartjies te ontvang.';
  // Clear cart after order
  sessionStorage.removeItem('pending_cart');
}

document.getElementById('payNow').onclick = ()=> createOrder(true);
document.getElementById('payAt').onclick  = ()=> createOrder(false);

bootstrap();
</script>
</body></html>`;
