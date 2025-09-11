// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  h1{ margin:0 0 12px }
  .grid{ display:grid; grid-template-columns: 1.2fr .9fr; gap:16px; }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .muted{ color:var(--muted) }
  label{ display:block; font-weight:600; margin:10px 0 6px }
  input, select, textarea{ width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  .btn{ padding:12px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; cursor:pointer; font-weight:700; width:100% }
  .btn.sec{ background:#1f2937 }
  .btn:disabled{ opacity:.6; cursor:not-allowed }
  .total{ display:flex; justify-content:space-between; align-items:center; margin-top:12px; font-weight:800; font-size:18px }
  .line{ display:flex; justify-content:space-between; margin:6px 0 }
  .err{ color:#b42318; font-weight:600; margin-top:8px }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
</style>
</head><body>
<div class="wrap">
  <h1>Checkout</h1>
  <div id="app" class="grid">
    <div class="card">Loading…</div>
    <div class="card"></div>
  </div>
</div>
<script>
const slug = ${JSON.stringify(slug)};
const $ = (s, e=document)=>e.querySelector(s);
const rands = c => 'R' + ((c||0)/100).toFixed(2);

let EVENT = null;
let TYPES = new Map();     // id -> ticket_type
let CART = [];             // [{ticket_type_id, qty}]

function setError(msg){
  const el = document.getElementById('formErr');
  if (el) el.textContent = msg || '';
}

function render(event, ticketTypes){
  EVENT = event || {};
  TYPES = new Map((ticketTypes||[]).map(t=>[t.id, t]));

  // Pull cart from session
  try {
    const saved = JSON.parse(sessionStorage.getItem('pending_cart')||'{}');
    if (saved && saved.items && Array.isArray(saved.items)) {
      CART = saved.items.map(x => ({ ticket_type_id:Number(x.ticket_type_id), qty:Number(x.qty||0) }))
                        .filter(x => x.ticket_type_id && x.qty>0);
    }
  } catch {}

  const app = document.getElementById('app');

  // LEFT: buyer details + payment method
  const left = document.createElement('div');
  left.className = 'card';
  left.innerHTML = \`
    <h2>Jou besonderhede</h2>
    <div class="muted">Ons gebruik dit vir jou bestelling en om jou kaartjies te stuur.</div>
    <label>Volle naam</label>
    <input id="name" placeholder="Jou naam" autocomplete="name"/>
    <div class="row">
      <div>
        <label>Selfoon</label>
        <input id="phone" placeholder="2771xxxxxxx" inputmode="numeric" autocomplete="tel"/>
      </div>
      <div>
        <label>E-pos</label>
        <input id="email" placeholder="opsioneel" type="email" autocomplete="email"/>
      </div>
    </div>
    <label>Betaal</label>
    <select id="pay">
      <option value="pay_now">Pay now (card)</option>
      <option value="pay_at_event">Pay at event</option>
    </select>
    <div id="formErr" class="err"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      <button id="backBtn" class="btn sec">← Terug</button>
      <button id="submitBtn" class="btn">Plaas bestelling</button>
    </div>
  \`;

  // RIGHT: order summary
  const right = document.createElement('div');
  right.className = 'card';
  right.innerHTML = \`
    <h2>Jou bestelling</h2>
    <div id="lines"></div>
    <div class="total">
      <span>Totaal</span>
      <span id="total">R0.00</span>
    </div>
    <div style="margin-top:10px">
      <span id="statusPill" class="pill" style="display:none"></span>
    </div>
  \`;

  app.innerHTML = '';
  app.appendChild(left);
  app.appendChild(right);

  $('#backBtn').onclick = ()=>{ history.back(); };

  // Update summary
  updateSummary();

  // Submit
  $('#submitBtn').onclick = submitOrder;
}

function updateSummary(){
  const box = document.getElementById('lines');
  let total = 0;
  let out = '';

  CART.forEach(it=>{
    const tt = TYPES.get(it.ticket_type_id) || {};
    const unit = Number(tt.price_cents||0);
    const line = unit * it.qty;
    total += line;
    const name = (tt.name||'Type #'+it.ticket_type_id);
    out += '<div class="line"><div>'+escapeHtml(name)+' × '+it.qty+'</div><div>'+ (unit? rands(line) : 'FREE') +'</div></div>';
  });

  if (!out) out = '<div class="muted">Geen items in mandjie.</div>';
  box.innerHTML = out;
  document.getElementById('total').textContent = rands(total);

  // Closed status?
  const pill = document.getElementById('statusPill');
  const now = Math.floor(Date.now()/1000);
  if ((EVENT.ends_at||0) < now || (EVENT.status !== 'active')) {
    pill.textContent = 'Event Closed';
    pill.style.display = 'inline-block';
    $('#submitBtn').disabled = true;
  } else {
    pill.style.display = 'none';
    $('#submitBtn').disabled = total<=0;
  }
}

async function submitOrder(){
  setError('');
  const name = ($('#name').value||'').trim();
  const phone = ($('#phone').value||'').trim();
  const email = ($('#email').value||'').trim();
  const method = $('#pay').value;

  if (!CART.length){ setError('Geen items in mandjie'); return; }
  if (!name){ setError('Naam is nodig'); return; }

  const payload = {
    event_id: EVENT.id,
    buyer_name: name,
    email, phone,
    items: CART.map(x=>({ ticket_type_id:x.ticket_type_id, qty:x.qty })),
    method: method // "pay_now" | "pay_at_event"
  };

  $('#submitBtn').disabled = true;

  try {
    const r = await fetch('/api/public/orders/create', {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=>({ok:false, error:'Invalid JSON'}));
    if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));

    // Success view
    const order = j.order || {};
    const container = document.getElementById('app');
    const link = '/t/' + encodeURIComponent(order.short_code || '');
    const payURL = j.payment_url || '';

    let next = '';
    if (payload.method==='pay_now') {
      if (payURL) {
        next = '<a class="btn" href="'+payURL+'">Pay now</a>';
      } else {
        next = '<div class="muted">Payment provider not configured yet. You can still pay at the event using your code.</div>';
      }
    } else {
      next = '<div class="muted">Wys jou kode by die hek om te betaal en jou kaartjies te ontvang.</div>';
    }

    container.innerHTML = ''
      + '<div class="card">'
      +   '<h2>Order placed ✅</h2>'
      +   '<div>Your code: <b>'+escapeHtml(order.short_code||'')+'</b></div>'
      +   '<div style="margin-top:8px">View tickets (once paid/issued): '
      +     '<a href="'+link+'" target="_blank">'+link+'</a>'
      +   '</div>'
      +   '<div style="margin-top:12px">'+ next +'</div>'
      +   '<div style="margin-top:16px"><button class="btn sec" onclick="location.href=\'/shop/'+encodeURIComponent(EVENT.slug||'')+'\'">Back to event</button></div>'
      + '</div>';

    // Clear cart after successful order
    try { sessionStorage.removeItem('pending_cart'); } catch {}

  } catch (e) {
    setError(e.message || 'Kon nie bestel nie');
    $('#submitBtn').disabled = false;
  }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

async function load(){
  // event + ticket_types (server already returns both)
  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="card">Kon nie laai nie</div><div class="card"></div>';
    return;
  }
  // attach
  render(res.event, res.ticket_types);
}
load();
</script>
</body></html>`;
