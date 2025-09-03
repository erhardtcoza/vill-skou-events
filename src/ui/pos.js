// /src/ui/pos.js
export const posHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
:root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
*{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
.wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
.card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
h1{ margin:0 0 14px }
.row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
input,select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
.btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
.btn.secondary{ background:#111 }
.btn.light{ background:#e5e7eb; color:#111 }
.muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 } .ok{ color:#067647; font-weight:600 }
.grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:14px; }
.tile{ border:1px solid #e5e7eb; border-radius:12px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px }
.qty{ display:flex; align-items:center; gap:8px }
.big{ font-size:26px; font-weight:800 }
.badge{ display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; font-size:12px; color:#444 }
hr{ border:0; border-top:1px solid #f0f2f4; margin:12px 0 }
.modal{ position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; padding:16px }
.modal>.box{ background:#fff; padding:16px; border-radius:12px; width:min(420px, 92vw) }
kbd{ background:#111; color:#fff; padding:2px 6px; border-radius:6px; font-family:monospace; font-size:12px }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>

  <div id="openCard" class="card" style="margin-bottom:14px">
    <h2 style="margin:0 0 10px">Start shift</h2>
    <div class="row" style="margin-bottom:10px">
      <input id="cashier" placeholder="Cashier name" style="min-width:220px"/>
      <select id="event" style="min-width:280px"></select>
      <select id="gate" style="min-width:180px"></select>
    </div>
    <div class="row">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:140px"/>
      </div>
      <input id="cashierPhone" placeholder="Cashier phone (optional)" style="min-width:220px"/>
      <button id="startBtn" class="btn">Start</button>
      <div id="openMsg" class="muted"></div>
    </div>
    <div id="openErr" class="error"></div>
  </div>

  <div id="sellCard" class="card" style="display:none">
    <div class="row" style="justify-content:space-between; align-items:center">
      <div class="row">
        <div class="badge" id="sessionBadge"></div>
        <button id="recallBtn" class="btn light" title="Recall saved order"><kbd>R</kbd> Recall</button>
      </div>
      <div class="row">
        <button id="cashoutBtn" class="btn secondary">Cash-out</button>
      </div>
    </div>
    <hr/>
    <div class="grid">
      <div>
        <div id="catalog"></div>
      </div>
      <div>
        <div class="tile" style="justify-content:space-between">
          <div>Total</div><div id="total" class="big">R0.00</div>
        </div>
        <div id="cartList"></div>
        <hr/>
        <input id="buyerName" placeholder="Customer name" style="width:100%; margin-bottom:8px"/>
        <input id="buyerPhone" placeholder="Mobile (E.164 e.g. 2771…)" style="width:100%; margin-bottom:8px"/>
        <div class="row">
          <button id="payCash" class="btn">Cash</button>
          <button id="payCard" class="btn">Card</button>
          <button id="clearCart" class="btn light">Clear</button>
        </div>
        <div id="sellErr" class="error"></div>
        <div id="sellOk" class="ok"></div>
      </div>
    </div>
  </div>
</div>

<!-- Recall modal -->
<div id="recModal" class="modal">
  <div class="box">
    <h3 style="margin:0 0 8px">Recall Order</h3>
    <p class="muted" style="margin:0 0 8px">Enter order code for “pay at event”.</p>
    <input id="recCode" placeholder="e.g. ABC123" style="width:100%; margin-bottom:10px"/>
    <div class="row" style="justify-content:flex-end">
      <button id="recClose" class="btn light">Close</button>
      <button id="recLookup" class="btn">Lookup</button>
    </div>
    <div id="recErr" class="error" style="margin-top:8px"></div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const rands = (c)=>'R' + ((c||0)/100).toFixed(2);
const centsFromR = (r)=> Math.max(0, Math.round(Number(r||0)*100));

let BOOT = { events:[], gates:[] };
let SESSION = null;   // {id,event_id,gate_id}
let STATE = { ttypes:new Map(), items:new Map(), recall:null };

function saveSess(){ localStorage.setItem('pos_session', JSON.stringify(SESSION||{})); }
function loadSess(){ try{ SESSION = JSON.parse(localStorage.getItem('pos_session')||'{}'); }catch{} }
function clearCart(){ STATE.items.clear(); renderCart(); }

async function bootstrap(){
  // load prior session
  loadSess();

  // bootstrap lists
  try{
    const j = await fetch('/api/pos/bootstrap').then(r=>r.json());
    if(!j.ok) throw new Error(j.error||'bootstrap');
    BOOT = j;

    // fill selects
    $('event').innerHTML = j.events.map(e=>\`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`).join('') || '<option value="0">No events</option>';
    $('gate').innerHTML  = j.gates.map(g=>\`<option value="\${g.id}">\${g.name}</option>\`).join('');

    if (SESSION?.id){
      // show sell if we already have a session
      $('event').value = SESSION.event_id;
      $('gate').value = SESSION.gate_id;
      $('openCard').style.display='none';
      $('sellCard').style.display='block';
      $('sessionBadge').textContent = 'Session #' + SESSION.id;
      await loadCatalog(SESSION.event_id);
    }
  }catch(e){
    $('openErr').textContent = 'Error: ' + (e.message||'network');
  }
}

$('startBtn').onclick = async ()=>{
  $('openErr').textContent = ''; $('openMsg').textContent = '';
  const cashier_name = ($('cashier').value||'').trim();
  const event_id = Number($('event').value||0);
  const gate_id  = Number($('gate').value||0);
  const opening_float_cents = centsFromR($('float').value);
  const cashier_phone = ($('cashierPhone').value||'').trim();
  if(!cashier_name) return $('openErr').textContent='cashier name required';
  if(!event_id) return $('openErr').textContent='event required';
  if(!gate_id) return $('openErr').textContent='gate required';

  try{
    const r = await fetch('/api/pos/session/open',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ cashier_name, cashier_phone, event_id, gate_id, opening_float_cents })
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if(!j.ok) throw new Error(j.error||'unknown');

    SESSION = { id:j.session_id, event_id, gate_id };
    saveSess();
    $('openMsg').textContent = 'Shift started (session #'+j.session_id+').';

    // enter selling
    $('openCard').style.display='none';
    $('sellCard').style.display='block';
    $('sessionBadge').textContent = 'Session #'+SESSION.id;
    await loadCatalog(event_id);
  }catch(e){
    $('openErr').textContent = 'Error: ' + (e.message||'unknown');
  }
};

async function loadCatalog(eventId){
  $('catalog').innerHTML = '<div class="muted">Loading…</div>';
  try{
    const j = await fetch('/api/pos/catalog/'+encodeURIComponent(eventId)).then(r=>r.json());
    if(!j.ok) throw new Error(j.error||'catalog');
    STATE.ttypes = new Map((j.ticket_types||[]).map(t=>[t.id,t]));
    $('catalog').innerHTML = (j.ticket_types||[]).map(t => tile(t)).join('') || '<div class="muted">No ticket types</div>';
    wireTiles();
    renderCart();
  }catch(e){
    $('catalog').innerHTML = '<div class="error">Error: '+(e.message||'network')+'</div>';
  }
}

function tile(t){
  const price = (t.price_cents||0) ? rands(t.price_cents) : 'FREE';
  return \`
    <div class="tile" data-ttid="\${t.id}">
      <div>
        <div style="font-weight:600">\${escape(t.name)}</div>
        <div class="muted">\${price}</div>
      </div>
      <div class="qty">
        <button class="btn light" data-dec="\${t.id}">−</button>
        <span id="q\${t.id}">0</span>
        <button class="btn light" data-inc="\${t.id}">+</button>
      </div>
    </div>\`;
}

function wireTiles(){
  document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.inc),+1));
  document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.dec),-1));
}

function changeQty(id, delta){
  const cur = STATE.items.get(id)||0;
  const next = Math.max(0, cur+delta);
  if(next===0) STATE.items.delete(id); else STATE.items.set(id,next);
  const q = document.getElementById('q'+id); if(q) q.textContent = String(next);
  renderCart();
}

function renderCart(){
  const arr = Array.from(STATE.items.entries());
  const list = $('cartList');
  let total = 0;
  list.innerHTML = arr.map(([id,qty])=>{
    const tt = STATE.ttypes.get(id) || { name:'', price_cents:0 };
    const line = qty * (tt.price_cents||0);
    total += line;
    return \`<div class="tile"><div>\${escape(tt.name)} × \${qty}</div><div>\${(tt.price_cents||0)? rands(line):'FREE'}</div></div>\`;
  }).join('') || '<div class="muted">Cart empty</div>';
  $('total').textContent = rands(total);
}

$('clearCart').onclick = ()=>{ clearCart(); };

$('payCash').onclick = ()=> settle('pos_cash');
$('payCard').onclick = ()=> settle('pos_card');

async function settle(method){
  $('sellErr').textContent=''; $('sellOk').textContent='';
  if(!SESSION?.id) return $('sellErr').textContent='No session';
  const items = Array.from(STATE.items.entries()).map(([ticket_type_id, qty])=>({ ticket_type_id, qty }));
  if(!items.length) return $('sellErr').textContent='No items';

  const body = {
    session_id: SESSION.id,
    event_id: SESSION.event_id,
    gate_id:  SESSION.gate_id,
    items,
    buyer_name:  ($('buyerName').value||'').trim(),
    buyer_phone: ($('buyerPhone').value||'').trim(),
    method,               // "pos_cash" | "pos_card"
    recall_code: STATE.recall?.short_code || null
  };

  try{
    const r = await fetch('/api/pos/order/sale', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if(!j.ok) throw new Error(j.error||'sale failed');

    $('sellOk').textContent = 'Sale complete · Order #'+ (j.order_id||'') + (j.short_code? ' ('+j.short_code+')':'');

    // reset cart for next customer
    STATE.recall = null;
    clearCart();
    $('buyerName').value = '';
    $('buyerPhone').value = '';
  }catch(e){
    $('sellErr').textContent = 'Error: ' + (e.message||'unknown');
  }
}

// ----- Recall modal
$('recallBtn').onclick = ()=>{ $('recModal').style.display='flex'; $('recErr').textContent=''; $('recCode').value=''; $('recCode').focus(); };
$('recClose').onclick = ()=>{ $('recModal').style.display='none'; };

$('recLookup').onclick = async ()=>{
  $('recErr').textContent='';
  const code = ($('recCode').value||'').trim();
  if(!code) return $('recErr').textContent='Enter a code';
  try{
    const j = await fetch('/api/pos/order/lookup/'+encodeURIComponent(code)).then(r=>r.json());
    if(!j.ok) throw new Error(j.error||'not found');
    // load items from recalled order
    STATE.items.clear();
    (j.order.items||[]).forEach(it=>STATE.items.set(it.ticket_type_id, it.qty));
    STATE.recall = { short_code: j.order.short_code };
    $('recModal').style.display='none';
    renderCart();
  }catch(e){
    $('recErr').textContent = 'Error: '+(e.message||'lookup');
  }
};

// ----- Cash-out
$('cashoutBtn').onclick = async ()=>{
  if(!SESSION?.id) return alert('No session');
  const mgr = prompt('Manager name to close shift:') || '';
  try{
    const r = await fetch('/api/pos/session/close',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ session_id: SESSION.id, closing_manager: mgr })
    });
    const j = await r.json().catch(()=>({ok:false}));
    if(!j.ok) throw new Error(j.error||'close failed');
    alert('Shift closed.');
    localStorage.removeItem('pos_session');
    location.reload();
  }catch(e){
    alert('Error: '+(e.message||'close'));
  }
};

function escape(s){ return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

bootstrap();

// keyboard shortcut: R to open recall
document.addEventListener('keydown', (e)=>{ if(e.key==='r' || e.key==='R'){ e.preventDefault(); if($('sellCard').style.display!=='none') $('recallBtn').click(); }});
</script>
</body></html>`;
