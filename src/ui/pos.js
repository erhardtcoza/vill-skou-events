// /src/ui/pos.js
export const posHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{--green:#1f7a33;--bg:#f6f7f9}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:var(--bg);color:#111}
  .wrap{max-width:1100px;margin:22px auto;padding:16px}
  h1{margin:6px 0 18px}
  h2{margin:0 0 10px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:12px 0}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  input,select,button{padding:10px;border:1px solid #d1d5db;border-radius:10px;background:#fff}
  input[type="number"]{width:140px}
  button.primary{background:var(--green);color:#fff;border-color:var(--green)}
  button.ghost{background:#fff}
  .muted{color:#6b7280}
  .pill{border-radius:999px;padding:10px 14px;border:1px solid #d1d5db;background:#fff;cursor:pointer}
  .pill:active{transform:scale(.98)}
  .pill strong{display:block;font-size:14px}
  .pill small{display:block;color:#6b7280}
  .grid{display:grid;grid-template-columns:1fr 320px;gap:12px}
  .sumRow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #eee}
  .total{font-size:28px;font-weight:800}
  .toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}
  .toolbar .right{display:flex;gap:8px}
  .danger{background:#fee2e2;border-color:#fecaca}
  .ok{color:#0a7d2b}
  .err{color:#b00020}
  .modalMask{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center}
  .modal{background:#fff;border-radius:12px;border:1px solid #e5e7eb;max-width:480px;width:92%;padding:14px}
  .btn-lg{padding:14px 16px;font-weight:700}
  .selectable{user-select:none}
</style>
</head><body><div class="wrap">
  <div class="toolbar">
    <h1>POS</h1>
    <div class="right">
      <button id="btnRecall" class="ghost">Recall order</button>
      <button id="btnEnd" class="danger">End shift</button>
    </div>
  </div>

  <div id="app"><div class="card"><span class="muted">Loading…</span></div></div>

  <!-- Recall Modal -->
  <div id="recallMask" class="modalMask">
    <div class="modal">
      <h3 style="margin:6px 0 12px">Recall Order</h3>
      <p class="muted" style="margin:0 0 8px">Enter order code for “Pay at event”.</p>
      <div class="row">
        <input id="recallCode" placeholder="Order code e.g. ABC123" style="flex:1"/>
        <button id="recallDo" class="primary">Lookup</button>
        <button id="recallClose" class="ghost">Close</button>
      </div>
      <div id="recallMsg" class="muted" style="margin-top:6px"></div>
    </div>
  </div>

<script>
let SHIFT=null;          // active shift from server
let CATALOG=null;        // {event, ticket_types: [...]}
let CART={};             // { ticket_type_id: qty }
let PAYMENT=null;        // 'cash'|'card'
let CUSTOMER={ name:"", phone:"" };

// --- helpers
const fmtR = cents => "R"+(cents/100).toFixed(2);
function centsSum(){ let t=0;
  for (const [id,qty] of Object.entries(CART)){
    const tt = (CATALOG?.ticket_types||[]).find(x=>x.id===+id);
    if (tt) t += (tt.price_cents||0)*qty;
  }
  return t;
}
function el(id){ return document.getElementById(id) }
function setDisplay(id, show){ const n=el(id); if(n) n.style.display = show?'flex':'none' }

// --- initial bootstrap
async function load(){
  // wire toolbar buttons (but keep them hidden until a shift is active)
  el('btnRecall').onclick = () => showRecall(true);
  el('btnEnd').onclick = endShift;
  el('btnRecall').style.display='none';
  el('btnEnd').style.display='none';

  const r = await fetch('/api/pos/bootstrap').then(r => r.json()).catch(()=>({ok:false,error:'network'}));
  if(!r.ok){ return renderError(r.error||'Failed to load') }

  if (r.activeShift){
    SHIFT = r.activeShift;
    CATALOG = r.catalog || null;
    return renderSell();
  }
  renderStart(r);
}

function renderError(msg){
  el('app').innerHTML = \`<div class="card err">Error: \${msg}</div>\`;
}

function renderStart(bootstrap){
  const events = bootstrap.events||[];
  const gates  = bootstrap.gates||[];
  el('app').innerHTML = \`
    <section class="card">
      <h2>Start shift</h2>
      <div class="row">
        <input id="cashier" placeholder="Cashier name"/>
        <select id="eventId">\${events.map(e=>\`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`).join('')}</select>
        <select id="gateId">\${gates.map(g=>\`<option value="\${g.id}">\${g.name}</option>\`).join('')}</select>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="floatR" type="number" step="0.01" placeholder="Opening float (R)"/>
        <button id="startBtn" class="primary">Start</button>
        <span id="startMsg" class="muted"></span>
      </div>
    </section>
  \`;
  el('startBtn').onclick = startShift;
}

async function startShift(){
  const msg=el('startMsg'); msg.textContent='';
  const cashier_name = el('cashier').value.trim();
  const event_id = +el('eventId').value;
  const gate_id  = +el('gateId').value;
  const opening_float_cents = Math.round((parseFloat(el('floatR').value||"0")||0)*100);

  try{
    const resp = await fetch('/api/pos/shifts/start',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents })
    });
    const data = await resp.json().catch(()=>({ok:false,error:"Bad JSON"}));
    if(!resp.ok || !data.ok){ msg.textContent = 'Error: '+(data.error||('HTTP '+resp.status)); return; }
    SHIFT = data.shift;
    CATALOG = data.catalog || await fetchCatalog(event_id);
    renderSell();
  }catch(e){ msg.textContent = 'Network error: '+e }
}

async function fetchCatalog(event_id){
  // POS catalog endpoint (prefer), fallback to public slug fetch if available in shift
  const try1 = await fetch('/api/pos/catalog?event_id='+event_id).then(r=>r.ok?r.json():null).catch(()=>null);
  if (try1 && try1.ok) return try1.catalog;
  return null;
}

// --- SELL VIEW
function renderSell(){
  el('btnRecall').style.display='inline-block';
  el('btnEnd').style.display='inline-block';

  const evName = CATALOG?.event?.name || 'Event';
  const gate   = SHIFT?.gate_name || ('Gate #'+SHIFT?.gate_id);
  const cashier= SHIFT?.cashier_name || '';
  el('app').innerHTML = \`
    <div class="card">
      <div class="row" style="align-items:center;justify-content:space-between">
        <div class="muted">Cashier: <strong>\${cashier}</strong> · Gate: <strong>\${gate}</strong> · Event: <strong>\${evName}</strong></div>
        <div class="row">
          <button class="ghost" onclick="showRecall(true)">Recall order</button>
          <button class="danger" onclick="endShift()">End shift</button>
        </div>
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <h2>Tickets</h2>
        <div id="pillArea" class="row"></div>
      </section>

      <aside class="card">
        <h2>Summary</h2>
        <div id="summary"></div>
        <div class="row" style="margin-top:8px">
          <button id="payCash" class="pill selectable">Cash</button>
          <button id="payCard" class="pill selectable">Card</button>
        </div>
        <div class="row" style="margin-top:8px">
          <input id="custName" placeholder="Customer name" style="flex:1"/>
          <input id="custPhone" placeholder="Phone e.g. 071 234 5678" style="flex:1"/>
        </div>
        <div class="row" style="margin-top:10px">
          <button id="finishBtn" class="primary btn-lg" style="flex:1">Finish order</button>
        </div>
        <div id="sellMsg" class="muted" style="margin-top:8px"></div>
      </aside>
    </div>
  \`;

  // build ticket pills
  const pills = (CATALOG?.ticket_types||[]).map(tt=>{
    const note = tt.price_cents ? fmtR(tt.price_cents) : 'FREE';
    return \`<button class="pill selectable" onclick="addQty(\${tt.id},1)"><strong>\${tt.name}</strong><small>\${note}</small></button>\`;
  }).join('');
  el('pillArea').innerHTML = pills || '<span class="muted">No ticket types.</span>';

  // wire summary & payment
  el('payCash').onclick = ()=>setPay('cash');
  el('payCard').onclick = ()=>setPay('card');
  el('finishBtn').onclick = finishOrder;

  updateSummary();
}

function addQty(id, q){
  CART[id] = (CART[id]||0) + q;
  if (CART[id] <= 0) delete CART[id];
  updateSummary();
}

function setPay(kind){
  PAYMENT = kind;
  el('payCash').style.borderColor = (kind==='cash') ? 'var(--green)' : '#d1d5db';
  el('payCard').style.borderColor = (kind==='card') ? 'var(--green)' : '#d1d5db';
}

function updateSummary(){
  const box = el('summary');
  const types = CATALOG?.ticket_types||[];
  const lines = Object.entries(CART).map(([id,qty])=>{
    const tt = types.find(x=>x.id===+id); if(!tt) return '';
    const row = \`
      <div class="sumRow">
        <div>\${tt.name} × \${qty}</div>
        <div class="muted">\${tt.price_cents?fmtR(tt.price_cents*qty):'FREE'}</div>
      </div>\`;
    return row;
  }).join('');
  const total = centsSum();
  box.innerHTML = (lines || '') + \`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <div class="muted">Total</div>
      <div class="total">\${fmtR(total)}</div>
    </div>\`;
}

// --- finish / submit
async function finishOrder(){
  const msg = el('sellMsg'); msg.textContent='';
  if (!Object.keys(CART).length){ msg.textContent='Add at least one ticket.'; return; }
  if (!PAYMENT){ msg.textContent='Choose Cash or Card first.'; return; }

  CUSTOMER.name  = el('custName').value.trim();
  CUSTOMER.phone = el('custPhone').value.trim();

  const items = Object.entries(CART).map(([ticket_type_id, qty])=>({ ticket_type_id:+ticket_type_id, qty:+qty }));
  const body = {
    shift_id: SHIFT?.id, event_id: CATALOG?.event?.id,
    items, payment_method: PAYMENT,
    buyer_name: CUSTOMER.name, buyer_phone: CUSTOMER.phone
  };

  try{
    const resp = await fetch('/api/pos/orders', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(()=>({ok:false,error:'Bad JSON'}));
    if (!resp.ok || !data.ok){ msg.textContent = 'Error: '+(data.error||('HTTP '+resp.status)); return; }
    // success
    CART={}; PAYMENT=null; updateSummary();
    el('custName').value=''; el('custPhone').value='';
    msg.innerHTML = '<span class="ok">Order completed.</span>';
  }catch(e){ msg.textContent='Network error: '+e }
}

// --- recall modal
function showRecall(open){
  el('recallMask').style.display = open?'flex':'none';
  if (open){ el('recallMsg').textContent=''; el('recallCode').value=''; el('recallCode').focus(); }
}
el('recallClose').onclick = ()=>showRecall(false);
el('recallDo').onclick = recallLookup;

async function recallLookup(){
  const code = el('recallCode').value.trim().toUpperCase();
  const msg = el('recallMsg'); msg.textContent='';
  if (!code){ msg.textContent='Enter a code'; return; }
  try{
    const resp = await fetch('/api/pos/orders/lookup?code='+encodeURIComponent(code));
    const data = await resp.json().catch(()=>({ok:false,error:'Bad JSON'}));
    if (!resp.ok || !data.ok){ msg.textContent = 'Error: '+(data.error||('HTTP '+resp.status)); return; }

    // preload into cart & customer
    CART = {};
    for (const it of (data.items||[])) CART[it.ticket_type_id] = it.qty;
    CATALOG = data.catalog || CATALOG;
    CUSTOMER.name = data.buyer_name||''; CUSTOMER.phone=data.buyer_phone||'';
    if (el('custName')) el('custName').value = CUSTOMER.name;
    if (el('custPhone')) el('custPhone').value = CUSTOMER.phone;
    updateSummary();
    msg.innerHTML = '<span class="ok">Order loaded. Adjust and finish.</span>';
    setTimeout(()=>showRecall(false), 700);
  }catch(e){ msg.textContent='Network error: '+e }
}

// --- end shift
async function endShift(){
  if (!SHIFT?.id) return;
  if (!confirm('End shift now?')) return;
  const r = await fetch('/api/pos/shifts/'+SHIFT.id+'/end', { method:'POST' })
    .then(r=>r.json()).catch(()=>({ok:false,error:'network'}));
  if (!r.ok){ alert('Error: '+(r.error||'failed')); return; }
  SHIFT=null; CATALOG=null; CART={}; PAYMENT=null; CUSTOMER={};
  // reload bootstrap to show start form again
  const boot = await fetch('/api/pos/bootstrap').then(r=>r.json()).catch(()=>({ok:false}));
  if(boot.ok) renderStart(boot); else renderError('Reload failed');
}

// kick things off
load();
</script>
</div></body></html>`;
