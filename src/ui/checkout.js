// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --bg:#f7f7f8; --muted:#667085; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:980px; margin:20px auto; padding:0 14px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 24px rgba(0,0,0,.08); padding:16px; margin-bottom:16px }
  h1{ margin:0 0 12px } h2{ margin:0 0 12px }
  .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:16px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  label{ display:block; font-size:14px; color:#222; margin:8px 0 6px }
  input{ width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px }
  .muted{ color:var(--muted) }
  .btn{ padding:12px 16px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .total{ display:flex; justify-content:space-between; font-weight:700; font-size:18px; margin-top:10px }
  .row{ display:flex; justify-content:space-between; margin:6px 0; gap:10px }
  .err{ color:#b00020; margin-top:8px } .ok{ color:#0a7d2b; margin-top:8px }
  a.back{ text-decoration:none; color:#111; border:1px solid #e5e7eb; padding:8px 12px; border-radius:8px }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between">
      <h1>Checkout</h1>
      <a class="back" href="/shop/${encodeURIComponent(slug)}">← Terug na event</a>
    </div>
  </div>

  <div id="empty" class="card" style="display:none">
    <p>Geen kaartjies in jou mandjie nie.</p>
    <p><a class="back" href="/shop/${encodeURIComponent(slug)}">Kies kaartjies</a></p>
  </div>

  <div id="content" class="grid" style="display:none">
    <div class="card">
      <h2>Jou besonderhede</h2>
      <label>Naam <input id="firstName" autocomplete="given-name"/></label>
      <label>Van <input id="lastName" autocomplete="family-name"/></label>
      <label>E-pos <input id="email" type="email" autocomplete="email"/></label>
      <label>Selfoon <input id="phone" type="tel" autocomplete="tel"/></label>
      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
        <button id="payNowBtn" class="btn primary">Pay now</button>
        <button id="payLaterBtn" class="btn">Pay at event</button>
        <span id="msg" class="muted"></span>
      </div>
      <p id="pickup" class="ok" style="display:none;margin-top:10px"></p>
      <p class="muted" style="margin-top:10px">
        Attendee-besonderhede (bv. geslag) kan by die hek ingevul word indien nodig.
      </p>
    </div>

    <div class="card">
      <h2>Jou keuse</h2>
      <div id="lines"></div>
      <div class="total"><span>Totaal</span><span id="total">R0.00</span></div>
      <p class="muted" style="margin-top:8px" id="note">
        Let wel: pryse word bevestig en herbereken op die volgende stap.
      </p>
    </div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function loadCart(){
  try { const raw = sessionStorage.getItem('pending_cart'); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

async function fetchCatalog(slug){
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug));
  if (!res.ok) return null;
  const j = await res.json().catch(()=>null);
  if (!j?.ok) return null;
  const map = new Map();
  for (const t of (j.ticket_types||[])) map.set(Number(t.id), t);
  return { event: j.event, types: map };
}

function render(cart, types){
  const empty = document.getElementById('empty');
  const content = document.getElementById('content');
  if (!cart || !Array.isArray(cart.items) || !cart.items.length){
    empty.style.display = 'block'; content.style.display = 'none'; return;
  }
  empty.style.display = 'none'; content.style.display = 'grid';

  const lines = document.getElementById('lines'); let total = 0;
  lines.innerHTML = cart.items.map(it => {
    const meta = types.get(Number(it.ticket_type_id)) || { name: 'Ticket', price_cents: 0 };
    const lineTotal = (meta.price_cents||0) * (it.qty||0);
    total += lineTotal;
    return '<div class="row"><div>'+escapeHtml(meta.name)+' × '+Number(it.qty||0)+'</div><div>'+rands(lineTotal)+'</div></div>';
  }).join('');
  document.getElementById('total').textContent = rands(total);
}

async function submit(cart, mode){
  const msg = document.getElementById('msg');
  msg.className = 'muted'; msg.textContent = 'Besig…';

  const body = {
    event_id: cart.event_id,
    items: cart.items,
    contact: {
      first_name: document.getElementById('firstName').value || '',
      last_name:  document.getElementById('lastName').value || '',
      email:      document.getElementById('email').value || '',
      phone:      document.getElementById('phone').value || ''
    },
    mode
  };

  const res = await fetch('/api/public/checkout', {
    method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
  }).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));

  if (!res.ok){ msg.className='err'; msg.textContent = res.error || 'Kon nie voortgaan nie.'; return; }

  try { sessionStorage.removeItem('pending_cart'); } catch(_){}

  if (mode === 'pay_later') {
    msg.className='ok'; msg.textContent='Bestelling geskep.';
    const el = document.getElementById('pickup');
    el.style.display='block';
    el.textContent = 'Jou versamelkode: ' + res.pickup_code + '. Wys dit by die hek om te betaal en jou kaartjies te ontvang.';
  } else {
    location.href = res.payment_url; // replace with Yoco Hosted URL when wired
  }
}

(async function init(){
  const cart = loadCart();
  const cat = await fetchCatalog(slug);
  if (!cart || !cat){ document.getElementById('empty').style.display = 'block'; return; }
  render(cart, cat.types);
  document.getElementById('content').style.display = 'grid';
  document.getElementById('payNowBtn').onclick  = ()=> submit(cart, 'pay_now');
  document.getElementById('payLaterBtn').onclick= ()=> submit(cart, 'pay_later');
})();
</script>
</body></html>`;