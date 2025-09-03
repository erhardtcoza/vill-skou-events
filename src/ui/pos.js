// /src/ui/pos.js
export const posHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --bg:#f6f7f8; --muted:#6b7280; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  header{ display:flex; align-items:center; gap:8px; justify-content:space-between; padding:14px 16px; background:#fff; border-bottom:1px solid #e5e7eb; position:sticky; top:0; z-index:10 }
  .brand{ font-weight:800; letter-spacing:.2px }
  .tag{ font-size:12px; color:#fff; background:var(--green); padding:4px 8px; border-radius:999px }
  .row{ display:flex; gap:16px; padding:16px; max-width:1200px; margin:0 auto }
  .col{ flex:1; }
  .panel{ background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:14px }
  .grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px }
  .pill{ display:flex; align-items:center; justify-content:center; min-height:68px; border:1px solid #e5e7eb; border-radius:14px; background:#fff; cursor:pointer; font-weight:700 }
  .pill:hover{ outline:3px solid #e5e7eb }
  .qty{ display:flex; align-items:center; gap:6px }
  .qty button{ width:36px; height:36px; border-radius:10px; border:1px solid #d1d5db; background:#fff; font-size:20px; font-weight:700; cursor:pointer }
  .line{ display:grid; grid-template-columns:1fr 90px 90px 110px 36px; align-items:center; gap:8px; padding:8px 0; border-bottom:1px dashed #f0f0f0 }
  .muted{ color:var(--muted) }
  .total{ font-size:28px; font-weight:800 }
  .btn{ border:none; padding:12px 14px; border-radius:12px; cursor:pointer; font-weight:700 }
  .btn.primary{ background:var(--green); color:#fff }
  .btn.ghost{ background:#fff; border:1px solid #e5e7eb }
  .btn.warn{ background:#fee2e2; color:#991b1b; border:1px solid #fecaca }
  .toolbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  select, input{ padding:10px 12px; border:1px solid #d1d5db; border-radius:10px; }
  .right{ text-align:right }
  .center{ text-align:center }
  .hidden{ display:none }
  /* modal */
  .modal{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; padding:16px; z-index:40 }
  .card{ background:#fff; border-radius:16px; padding:16px; width:min(560px,96vw); box-shadow:0 30px 60px rgba(0,0,0,.2) }
  .card h3{ margin:0 0 8px }
  .split{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  @media (max-width:900px){ .row{ flex-direction:column } .line{ grid-template-columns:1fr 70px 80px 100px 36px } }
</style>
</head><body>

<header>
  <div class="toolbar">
    <span class="brand">POS</span>
    <span id="shiftBadge" class="tag hidden">Shift open</span>
    <button id="endShiftBtn" class="btn warn hidden">End Shift</button>
  </div>
  <div class="toolbar">
    <button id="recallBtn" class="btn ghost">Recall order</button>
    <select id="eventSel"></select>
  </div>
</header>

<div class="row">
  <div class="col">
    <div class="panel">
      <div class="toolbar" style="margin-bottom:10px;">
        <strong>Ticket Types</strong>
      </div>
      <div id="ttGrid" class="grid"></div>
    </div>
  </div>

  <div class="col" style="max-width:520px;">
    <div class="panel">
      <div class="toolbar" style="justify-content:space-between">
        <strong>Current Sale</strong>
        <button id="clearBtn" class="btn ghost">Clear</button>
      </div>
      <div id="lines"></div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
        <div class="muted">Items: <span id="itemsCount">0</span></div>
        <div class="total">R <span id="grand">0.00</span></div>
      </div>
      <div class="split" style="margin-top:12px">
        <button id="checkoutBtn" class="btn primary" disabled>Proceed</button>
        <button id="cashBtn" class="btn ghost">Cash</button>
      </div>
      <small class="muted">Tip: tap ticket buttons. Each tap adds one.</small>
    </div>
  </div>
</div>

<!-- SHIFT MODAL -->
<div id="shiftModal" class="modal">
  <div class="card">
    <h3>Open Shift</h3>
    <div class="split">
      <div>
        <label class="muted">Cashier name</label>
        <input id="mCashier" placeholder="e.g. Jaco"/>
      </div>
      <div>
        <label class="muted">Gate</label>
        <select id="mGate"></select>
      </div>
      <div>
        <label class="muted">Opening float (R)</label>
        <input id="mFloat" type="number" inputmode="decimal" step="0.01" value="0.00"/>
      </div>
      <div class="center" style="display:flex; align-items:end; justify-content:end">
        <button id="openShiftBtn" class="btn primary">Start</button>
      </div>
    </div>
  </div>
</div>

<!-- CHECKOUT MODAL -->
<div id="checkoutModal" class="modal hidden">
  <div class="card">
    <h3>Finish Order</h3>
    <div class="split">
      <div>
        <label class="muted">Payment method (required)</label>
        <div class="toolbar">
          <label><input type="radio" name="pay" value="cash"> Cash</label>
          <label><input type="radio" name="pay" value="card"> Card (Yoco)</label>
        </div>
      </div>
      <div class="right">
        <div class="muted">Total</div>
        <div class="total">R <span id="ckTotal">0.00</span></div>
      </div>
      <div>
        <label class="muted">Buyer name</label>
        <input id="ckName" placeholder="(optional)"/>
      </div>
      <div>
        <label class="muted">Buyer phone (for WhatsApp)</label>
        <input id="ckPhone" placeholder="+27…"/>
      </div>
    </div>
    <div class="toolbar" style="justify-content:flex-end; margin-top:10px">
      <button id="cancelCheckout" class="btn ghost">Cancel</button>
      <button id="confirmCheckout" class="btn primary" disabled>Finish</button>
    </div>
  </div>
</div>

<!-- END SHIFT MODAL -->
<div id="closeModal" class="modal hidden">
  <div class="card">
    <h3>End Shift</h3>
    <p class="muted">Enter manager responsible for cash-up.</p>
    <div class="split">
      <input id="mgrName" placeholder="Manager name"/>
      <div class="right">
        <button id="cancelClose" class="btn ghost">Cancel</button>
        <button id="confirmClose" class="btn warn">End Shift</button>
      </div>
    </div>
  </div>
</div>

<!-- RECALL (placeholder) -->
<div id="recallModal" class="modal hidden">
  <div class="card">
    <h3>Recall Order</h3>
    <p class="muted">Enter order code for “Pay at event”. (API hookup coming next.)</p>
    <div class="split">
      <input id="recCode" placeholder="Order code e.g. ABC123"/>
      <div class="right">
        <button id="recCancel" class="btn ghost">Close</button>
        <button id="recGo" class="btn">Lookup</button>
      </div>
    </div>
  </div>
</div>

<script>
const centsToRand = c => (Number(c||0)/100).toFixed(2);
const randsToCents = r => Math.round(Number(r||0)*100);
let catalog = { events:[], ticket_types_by_event:{} };
let currentEventId = null;
let cart = new Map(); // ticket_type_id -> {tt, qty}
let cashup = null; // { id, cashier_name, gate_name }

function el(id){ return document.getElementById(id); }
function show(e){ e.classList.remove('hidden'); }
function hide(e){ e.classList.add('hidden'); }

async function fetchJSON(url, opt){ 
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

async function bootstrap(){
  // gates for shift modal
  try{
    const gs = await fetchJSON('/api/admin/gates');
    el('mGate').innerHTML = (gs.gates||[]).map(g=>\`<option>\${g.name}</option>\`).join('') || '<option>Main Gate</option>';
  }catch{}

  const boot = await fetchJSON('/api/pos/bootstrap', {method:'POST'});
  catalog = boot;
  const evSel = el('eventSel');
  evSel.innerHTML = boot.events.map(e=>\`<option value="\${e.id}">\${e.name}</option>\`).join('');
  currentEventId = boot.events[0]?.id || null;
  evSel.value = currentEventId || '';
  evSel.onchange = () => { currentEventId = Number(evSel.value||0)||null; renderTT(); resetSale(); };

  renderTT();
}

function renderTT(){
  const grid = el('ttGrid');
  const list = catalog.ticket_types_by_event[currentEventId] || [];
  if (!list.length){ grid.innerHTML = '<div class="muted">No ticket types.</div>'; return; }
  grid.innerHTML = list.map(t => \`
    <button class="pill" data-tt="\${t.id}">
      <div>
        <div>\${t.name}</div>
        <div class="muted">R \${centsToRand(t.price_cents||0)}</div>
      </div>
    </button>\`).join('');
  [...grid.querySelectorAll('.pill')].forEach(btn=>{
    btn.onclick = () => addItem(Number(btn.dataset.tt));
  });
}

function addItem(ttId){
  const tt = (catalog.ticket_types_by_event[currentEventId]||[]).find(x=>x.id===ttId);
  if (!tt) return;
  const key = String(ttId);
  const cur = cart.get(key) || { tt, qty:0 };
  cur.qty++;
  cart.set(key, cur);
  renderCart();
}

function renderCart(){
  const lines = el('lines');
  const arr = [...cart.values()].filter(v=>v.qty>0);
  if (!arr.length){
    lines.innerHTML = '<div class="muted">Nothing yet. Tap ticket buttons to add.</div>';
    el('itemsCount').textContent = '0';
    el('grand').textContent = '0.00';
    el('checkoutBtn').disabled = true;
    return;
  }
  let total = 0, count = 0;
  lines.innerHTML = arr.map(({tt, qty})=>{
    const unit = Number(tt.price_cents||0);
    const sub = unit*qty; total += sub; count += qty;
    return \`
    <div class="line">
      <div><strong>\${tt.name}</strong><div class="muted">R \${centsToRand(unit)}</div></div>
      <div class="qty">
        <button data-minus="\${tt.id}">−</button>
        <div>\${qty}</div>
        <button data-plus="\${tt.id}">+</button>
      </div>
      <div class="muted right">R \${centsToRand(unit)}</div>
      <div class="right"><strong>R \${centsToRand(sub)}</strong></div>
      <button class="btn ghost" data-del="\${tt.id}">×</button>
    </div>\`;
  }).join('');
  lines.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{ cart.get(String(+b.dataset.plus)).qty++; renderCart(); });
  lines.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{ const it=cart.get(String(+b.dataset.minus)); it.qty=Math.max(0,it.qty-1); if(it.qty===0) cart.delete(String(+b.dataset.minus)); renderCart(); });
  lines.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ cart.delete(String(+b.dataset.del)); renderCart(); });

  el('itemsCount').textContent = String(count);
  el('grand').textContent = centsToRand(total);
  el('checkoutBtn').disabled = false;
}

function resetSale(){ cart.clear(); renderCart(); }

// SHIFT open/close
async function openShift(){
  const cashier = el('mCashier').value.trim();
  const gate = el('mGate').value.trim();
  const f = el('mFloat').value;
  if (!cashier || !gate) return;
  const res = await fetchJSON('/api/pos/cashups/open',{
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ cashier_name:cashier, gate_name:gate, opening_float_rands:f })
  });
  cashup = { id: res.id, cashier_name:cashier, gate_name:gate };
  localStorage.setItem('pos_cashup', JSON.stringify(cashup));
  hide(el('shiftModal')); el('shiftBadge').classList.remove('hidden'); el('endShiftBtn').classList.remove('hidden');
}

async function closeShift(){
  const mgr = el('mgrName').value.trim();
  if (!mgr || !cashup?.id) return;
  await fetchJSON('/api/pos/cashups/close',{
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ cashup_id: cashup.id, manager_name: mgr })
  });
  localStorage.removeItem('pos_cashup');
  location.reload();
}

// CHECKOUT flow
function beginCheckout(){
  const total = el('grand').textContent;
  el('ckTotal').textContent = total;
  // reset radios & button
  document.querySelectorAll('input[name="pay"]').forEach(r=> r.checked=false );
  el('ckName').value = ''; el('ckPhone').value='';
  el('confirmCheckout').disabled = true;
  show(el('checkoutModal'));
}
function onPayChange(){
  const any = [...document.querySelectorAll('input[name="pay"]')].some(r=>r.checked);
  el('confirmCheckout').disabled = !any;
}

async function confirmCheckout(){
  const pay = [...document.querySelectorAll('input[name="pay"]')].find(r=>r.checked)?.value || '';
  if (!pay) return;
  const items = [...cart.values()].map(({tt, qty})=>({ ticket_type_id: tt.id, qty }));
  const res = await fetchJSON('/api/pos/sale',{
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({
      cashup_id: cashup.id,
      event_id: currentEventId,
      items,
      payment_method: pay,
      buyer_name: el('ckName').value.trim(),
      buyer_phone: el('ckPhone').value.trim()
    })
  });
  hide(el('checkoutModal'));
  resetSale();
  alert('Order #' + res.order_id + ' completed. Tickets: ' + (res.tickets?.length||0));
}

// wire up
el('openShiftBtn').onclick = openShift;
el('endShiftBtn').onclick = ()=> show(el('closeModal'));
el('cancelClose').onclick = ()=> hide(el('closeModal'));
el('confirmClose').onclick = closeShift;

el('recallBtn').onclick = ()=> show(el('recallModal'));
el('recCancel').onclick = ()=> hide(el('recallModal'));
el('recGo').onclick = ()=> alert('Lookup coming in next step.');

el('clearBtn').onclick = resetSale;
el('checkoutBtn').onclick = beginCheckout;
el('cancelCheckout').onclick = ()=> hide(el('checkoutModal'));
document.querySelectorAll('input[name="pay"]').forEach(r=> r.addEventListener('change', onPayChange));
el('cashBtn').onclick = ()=>{ /* quick-add cash button could open modal preset to cash */ beginCheckout(); document.querySelector('input[name="pay"][value="cash"]').checked = true; onPayChange(); };

// init
(async ()=>{
  // Restore open shift if exists
  try{ cashup = JSON.parse(localStorage.getItem('pos_cashup')||'null'); }catch{}
  if (cashup?.id){ el('shiftBadge').classList.remove('hidden'); el('endShiftBtn').classList.remove('hidden'); hide(el('shiftModal')); }
  await bootstrap();
  resetSale();
})();
</script>

</body></html>`;
