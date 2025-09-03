// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:980px; margin:18px auto; padding:0 14px }
  .grid{ display:grid; grid-template-columns:1.1fr .9fr; gap:16px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:8px 0 14px } .muted{ color:#9aa3af }
  input{ width:100%; padding:12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  .btn{ padding:12px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; cursor:pointer; font-weight:700 }
  .btn.ghost{ background:#fff; color:#111; border:1px solid #e5e7eb }
  .totals{ display:flex; justify-content:space-between; margin-top:10px; font-weight:700; font-size:20px }
  .err{ color:#b42318; margin-top:8px; font-weight:600 }
  .ok{ color:#0f7b2e; margin-top:8px; font-weight:700 }
</style>
</head><body>
<div class="wrap">
  <a href="/shop/${encodeURIComponent(slug)}" style="text-decoration:none;color:#0a7d2b">← Terug na event</a>
  <h1>Checkout</h1>

  <div class="grid">
    <div class="card">
      <h2>Jou besonderhede</h2>
      <div class="row" style="margin-bottom:10px">
        <input id="first" placeholder="Naam"/>
        <input id="last" placeholder="Van"/>
      </div>
      <div class="row" style="margin-bottom:10px">
        <input id="email" placeholder="E-pos"/>
        <input id="phone" placeholder="Selfoon"/>
      </div>
      <div class="row" style="gap:8px">
        <button id="payNow" type="button" class="btn">Pay now</button>
        <button id="payEvent" type="button" class="btn ghost">(Pay at event)</button>
      </div>
      <div id="msg" class="err"></div>
      <div id="ok" class="ok" style="display:none"></div>
    </div>

    <div class="card">
      <h2>Jou keuse</h2>
      <div id="list" class="muted">Geen kaartjies gekies nie.</div>
      <div class="totals">
        <span>Totaal</span>
        <span id="total">R0.00</span>
      </div>
      <p class="muted">Let wel: pryse word bevestig en herbereken op die volgende stap.</p>
    </div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
const R = c => 'R' + ((c||0)/100).toFixed(2);
const $ = id => document.getElementById(id);

function loadCart() {
  try {
    const c = JSON.parse(sessionStorage.getItem('pending_cart')||'null');
    return (c && Array.isArray(c.items) && c.event_id) ? c : null;
  } catch { return null; }
}

function renderCart(cart) {
  if (!cart || !cart.items.length) { $('list').textContent = 'Geen kaartjies gekies nie.'; $('total').textContent = 'R0.00'; return; }
  $('list').innerHTML = cart.items.map(i => 
    '<div style="display:flex;justify-content:space-between;margin:6px 0"><div>Type #'+i.ticket_type_id+' × '+i.qty+'</div><div>—</div></div>'
  ).join('');
}

async function createOrder(method) {
  $('msg').textContent = ''; $('ok').style.display='none';
  const cart = loadCart();
  if (!cart) { $('msg').textContent = 'Geen kaartjies in jou mandjie nie.'; return; }

  const body = {
    event_id: cart.event_id,
    items: cart.items,
    method,
    buyer_name: ($('first').value||'').trim(),
    buyer_surname: ($('last').value||'').trim(),
    email: ($('email').value||'').trim(),
    phone: ($('phone').value||'').trim(),
  };

  try {
    const r = await fetch('/api/public/orders/create', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify(body)
    });

    // If the server responded with HTML (e.g. CF error or redirect), show it plainly
    const ct = r.headers.get('content-type')||'';
    if (!ct.includes('application/json')) {
      const txt = await r.text();
      throw new Error('Unexpected response: ' + String(txt).slice(0,140));
    }

    const j = await r.json();
    if (!j.ok) throw new Error(j.error||'server');
    $('ok').textContent = 'Order created (' + j.order.short_code + ').';
    $('ok').style.display = 'block';

    // For "pay_event" we could redirect to the ticket page once paid/issued;
    // for now we just confirm.
  } catch (e) {
    $('msg').textContent = 'Fout: ' + (e.message || 'network');
  }
}

$('payNow').onclick = () => createOrder('pay_now');
$('payEvent').onclick = () => createOrder('pay_event');

// Render initial cart (totals are confirmed server-side on create)
renderCart(loadCart());
</script>
</body></html>`;