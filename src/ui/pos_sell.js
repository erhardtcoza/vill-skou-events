// /src/ui/pos_sell.js
export const posSellHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Sell</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  h1{ margin:0 0 12px }
  .grid{ display:grid; grid-template-columns: 1.25fr .9fr; gap:16px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  .muted{ color:var(--muted) }
  .pill{ display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; font-size:12px; color:#444 }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn.warn{ background:#b42318; color:#fff; border-color:transparent }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .catalog{ display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px }
  .tt{ border:1px solid #e5e7eb; border-radius:12px; padding:12px; cursor:pointer; background:#fff; user-select:none; -webkit-tap-highlight-color:transparent }
  .tt:hover{ border-color:#cbd5e1 }
  .tt .name{ font-weight:700; margin:0 0 4px }
  .tt .price{ color:#444 }
  .cart-line{ display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f3f5 }
  .cart-line:last-child{ border-bottom:0 }
  .qty{ display:flex; gap:8px; align-items:center }
  .total{ font-size:22px; font-weight:800; text-align:right }
  .error{ color:#b42318; font-weight:700 }
  .toolbar{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:10px; flex-wrap:wrap }
  a.link{ color:#0a7d2b; text-decoration:underline; cursor:pointer }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>

  <div class="toolbar">
    <div>
      <span id="sessionPill" class="pill"></span>
      <span id="eventPill" class="pill" style="margin-left:6px"></span>
    </div>
    <div class="row">
      <input id="recallCode" placeholder="Recall code bv. ABC123" style="width:180px"/>
      <button id="recallBtn" class="btn">Recall</button>
      <span id="miniMsg" class="muted"></span>
    </div>
  </div>

  <div class="grid">
    <!-- LEFT: Catalog -->
    <div class="card">
      <h3 style="margin:0 0 10px">Tickets</h3>
      <div id="catalog" class="catalog"></div>
      <div id="catalogMsg" class="muted" style="margin-top:8px"></div>
    </div>

    <!-- RIGHT: Cart + Tender -->
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <input id="custName" placeholder="Customer name (optional)" style="min-width:220px"/>
        <input id="custPhone" placeholder="Customer phone (E.164 e.g. 2771… optional)" style="min-width:240px"/>
      </div>

      <div id="cartList"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px">
        <span style="font-weight:700">Total</span>
        <span id="total" class="total">R0.00</span>
      </div>

      <div class="row" style="margin-top:12px">
        <button id="cashBtn" class="btn primary">Take cash</button>
        <button id="cardBtn" class="btn">Take card</button>
        <button id="closeBtn" class="btn warn" style="margin-left:auto">Close session</button>
      </div>
      <div id="err" class="error" style="margin-top:10px"></div>
      <div id="ok" class="pill" style="margin-top:10px; display:none; border-color:#16a34a; color:#14532d">Saved</div>
    </div>
  </div>

  <div style="margin-top:14px"><a class="link" href="/gate">&larr; Back to start</a></div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const q = new URLSearchParams(location.search);
const session_id = Number(q.get('session_id')||0);
let event_slug = q.get('event_slug') || '';   // may be empty (we'll fall back)
const event_id = Number(q.get('event_id')||0);

const state = { ttypes: new Map(), cart: new Map(), eventName:'' };

function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function phoneNorm(raw){
  const s = String(raw||'').replace(/\\D+/g,'');
  if (s.length===10 && s.startsWith('0')) return '27' + s.slice(1);
  return s;
}

function renderCatalog(){
  const div = $('catalog');
  const arr = Array.from(state.ttypes.values());
  if (!arr.length) { $('catalogMsg').textContent='No ticket types found.'; div.innerHTML=''; return; }
  $('catalogMsg').textContent='';
  div.innerHTML = arr.map(t => \`
    <div class="tt" data-add="\${t.id}">
      <div class="name">\${escapeHtml(t.name)}</div>
      <div class="price">\${t.price_cents ? rands(t.price_cents) : 'FREE'}</div>
    </div>\`
  ).join('');
  div.querySelectorAll('[data-add]').forEach(el=>{
    el.onclick = ()=> { changeQty(Number(el.dataset.add), +1); try{navigator.vibrate?.(15)}catch{} };
  });
}

function renderCart(){
  const list = $('cartList');
  const items = Array.from(state.cart.entries());
  let total=0;
  if (!items.length){ list.innerHTML = '<div class="muted">Cart empty.</div>'; $('total').textContent='R0.00'; return; }
  list.innerHTML = items.map(([id,qty])=>{
    const t = state.ttypes.get(id) || {name:'',price_cents:0};
    const line = qty * (t.price_cents||0); total += line;
    return \`
      <div class="cart-line">
        <div>\${escapeHtml(t.name)}</div>
        <div class="qty">
          <button class="btn" data-dec="\${id}">−</button>
          <strong>\${qty}</strong>
          <button class="btn" data-inc="\${id}">+</button>
          <div style="width:80px; text-align:right">\${t.price_cents ? rands(line) : 'FREE'}</div>
        </div>
      </div>\`;
  }).join('');
  $('total').textContent = rands(total);
  list.querySelectorAll('[data-inc]').forEach(b=> b.onclick = ()=> { changeQty(Number(b.dataset.inc), +1); try{navigator.vibrate?.(10)}catch{} });
  list.querySelectorAll('[data-dec]').forEach(b=> b.onclick = ()=> { changeQty(Number(b.dataset.dec), -1); try{navigator.vibrate?.(10)}catch{} });
}

function changeQty(id, d){
  const cur = state.cart.get(id)||0;
  const next = Math.max(0, cur+d);
  if (next===0) state.cart.delete(id); else state.cart.set(id,next);
  renderCart();
}

async function loadEventAndTickets(){
  $('sessionPill').textContent = 'Session #' + (session_id||'?');

  try{
    // If we didn't get a slug, fall back to the first event
    if (!event_slug){
      const evs = await fetch('/api/public/events').then(r=>r.json()).catch(()=>({ok:false}));
      if (!evs.ok || !(evs.events||[]).length){
        $('eventPill').textContent = 'No event';
        $('catalogMsg').textContent = 'No event available.';
        return;
      }
      event_slug = evs.events[0].slug;
    }

    const j = await fetch('/api/public/events/'+encodeURIComponent(event_slug)).then(r=>r.json());
    if (!j.ok) throw new Error(j.error || 'Failed to load event');

    const list = j.ticket_types || [];
    state.ttypes = new Map(list.map(t=>[t.id, t]));
    state.eventName = (j.event && j.event.name) || j.name || event_slug;
    $('eventPill').textContent = 'Event ' + state.eventName;

    renderCatalog();
    renderCart();
  }catch(e){
    $('eventPill').textContent = 'Event ?';
    $('catalogMsg').textContent = 'Error loading catalog: ' + (e.message||'');
  }
}

async function recall(){
  $('miniMsg').textContent = '';
  const code = ($('recallCode').value||'').trim();
  if (!code) return;
  try{
    const r = await fetch('/api/pos/order/lookup/'+encodeURIComponent(code));
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if (!j.ok) throw new Error(j.error || 'not found');
    state.cart.clear();
    (j.order.items||[]).forEach(it => {
      if (state.ttypes.has(it.ticket_type_id)) state.cart.set(it.ticket_type_id, Number(it.qty||0));
    });
    renderCart();
    $('miniMsg').textContent = 'Order loaded.';
  }catch(e){
    $('miniMsg').textContent = 'Recall failed: ' + (e.message||'');
  }
}

async function tender(method){
  $('err').textContent=''; $('ok').style.display='none';

  const items = Array.from(state.cart.entries()).map(([ticket_type_id, qty])=>({ ticket_type_id, qty }));
  if (!items.length){ $('err').textContent='Cart empty.'; return; }

  const payload = {
    session_id,
    event_id: event_id || undefined,
    customer_name: ($('custName').value||'').trim(),
    customer_msisdn: phoneNorm($('custPhone').value||''),
    method, // 'pos_cash' | 'pos_card'
    items
  };

  try{
    const r = await fetch('/api/pos/order/sale', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if (!j.ok) throw new Error(j.error || 'save failed');
    state.cart.clear();
    renderCart();
    $('ok').style.display='inline-block';
    $('ok').textContent = 'Saved sale #' + (j.order_id||'');
    try{ navigator.vibrate?.([15,25,15]); }catch{}
  }catch(e){
    $('err').textContent = 'Error: ' + (e.message||'unknown');
  }
}

async function closeSession(){
  const mgr = prompt('Manager name to confirm closing? (leave blank to cancel)') || '';
  if (!mgr) return;
  try{
    const r = await fetch('/api/pos/session/close', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ session_id, closing_manager:mgr })
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if (!j.ok) throw new Error(j.error || 'close failed');
    location.href = '/gate';
  }catch(e){
    alert('Close failed: ' + (e.message||''));
  }
}

$('recallBtn').onclick = recall;
$('cashBtn').onclick = ()=> tender('pos_cash');
$('cardBtn').onclick = ()=> tender('pos_card');
$('closeBtn').onclick = closeSession;

loadEventAndTickets();
</script>
</body></html>`;
