// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  h1{ margin:0 0 14px }
  .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  label{ display:block; font-size:13px; color:var(--muted); margin:6px 0 6px }
  input{ width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  .btn{ padding:12px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .muted{ color:var(--muted) }
  .totals{ font-weight:700; font-size:20px; text-align:right }
  .err{ color:#b42318; font-weight:600; margin-top:8px }
  .ok{ color:#0a7d2b; font-weight:700; margin-top:8px }
  .line{ display:flex; justify-content:space-between; align-items:center; margin:6px 0 }
</style>
</head><body>
<div class="wrap">
  <a href="/shop/${encodeURIComponent(slug)}" style="text-decoration:none;color:#0a7d2b">← Terug na event</a>
  <h1>Checkout</h1>

  <div class="grid">
    <div class="card">
      <h2 style="margin:0 0 10px">Jou besonderhede</h2>
      <div class="row">
        <div><label>Naam</label><input id="first" autocomplete="given-name"/></div>
        <div><label>Van</label><input id="last" autocomplete="family-name"/></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label>E-pos</label><input id="email" type="email" autocomplete="email"/></div>
        <div><label>Selfoon</label><input id="phone" inputmode="tel" placeholder="27…"/></div>
      </div>
      <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap">
        <button id="payNow" class="btn primary">Pay now</button>
        <button id="payAtEvent" class="btn">(Pay at event)</button>
      </div>
      <div id="msg" class="err"></div>
      <div id="ok" class="ok" style="display:none"></div>
    </div>

    <div class="card">
      <h2 style="margin:0 0 10px">Jou keuse</h2>
      <div id="cartList" class="muted">Geen kaartjies gekies nie.</div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700">Totaal</span>
        <span id="total" class="totals">R0.00</span>
      </div>
      <div class="muted" style="margin-top:8px">Let wel: pryse word bevestig en herbereken op die volgende stap.</div>
    </div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
const rands = (c)=>'R'+((c||0)/100).toFixed(2);

let EVENT=null, TTMAP=null, CART=null, TOTAL=0;

// Load event (with ticket_types) and draw the right panel from session cart.
async function bootstrap(){
  $('msg').textContent=''; $('ok').style.display='none';
  CART = JSON.parse(sessionStorage.getItem('pending_cart')||'null');
  if (!CART || !CART.items || !CART.items.length){
    $('cartList').textContent = 'Geen kaartjies gekies nie.';
    return;
  }
  // Fetch event detail (+ticket_types)
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ $('msg').textContent = 'Kon nie event laai nie'; return; }
  EVENT = res.event||{};
  const types = res.ticket_types||[];
  TTMAP = new Map(types.map(t=>[Number(t.id), t]));

  // Build cart UI with names/prices
  let lines = [];
  TOTAL = 0;
  for (const it of CART.items){
    const t = TTMAP.get(Number(it.ticket_type_id));
    const qty = Number(it.qty||0);
    if (!t || !qty) continue;
    const line = qty * Number(t.price_cents||0);
    TOTAL += line;
    lines.push(\`<div class="line"><div>\${esc(t.name)} × \${qty}</div><div>\${line?rands(line):'FREE'}</div></div>\`);
  }
  if (!lines.length){
    $('cartList').textContent = 'Geen kaartjies gekies nie.';
  } else {
    $('cartList').innerHTML = lines.join('');
  }
  $('total').textContent = rands(TOTAL);
}

async function createOrder(method){
  $('msg').textContent = ''; $('ok').style.display='none';
  if (!EVENT || !CART) return;

  const buyer_name = [ $('first').value||'', $('last').value||'' ].map(s=>s.trim()).filter(Boolean).join(' ').trim();
  if (!buyer_name){ $('msg').textContent='Vul asb jou naam in.'; return; }

  const body = {
    event_id: CART.event_id || EVENT.id,
    buyer_name,
    email: $('email').value||'',
    phone: $('phone').value||'',
    items: CART.items.map(i=>({ ticket_type_id:Number(i.ticket_type_id), qty:Number(i.qty) })),
    method: method === 'now' ? 'pay_now' : 'pay_at_event'
  };

  try{
    const r = await fetch('/api/public/orders/create', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if (!j.ok) throw new Error(j.error || ('HTTP '+r.status));

    // Success UX
    if (method === 'later'){
      $('ok').textContent = 'Bestelling vasgelê. Wys jou kode by die hek: ' + (j.order?.short_code || '');
      $('ok').style.display = 'block';
      // keep cart for now
    } else {
      $('ok').textContent = 'Bestelling aangemaak. (Online betaling integrasie volg.)';
      $('ok').style.display = 'block';
      // sessionStorage.removeItem('pending_cart'); // uncomment once you redirect to payment
    }
  }catch(e){
    $('msg').textContent = 'Fout: ' + (e.message || 'network');
  }
}

$('payNow').onclick = ()=>createOrder('now');
$('payAtEvent').onclick = ()=>createOrder('later');

bootstrap();
</script>
</body></html>`;
