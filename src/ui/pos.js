// /src/ui/pos.js
export const posHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --red:#b42318; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  h1{ margin:0 0 10px } h2{ margin:4px 0 10px }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:1px solid transparent; background:var(--green); color:#fff; cursor:pointer; font-weight:700 }
  .btn.ghost{ background:#fff; color:#111; border-color:#e5e7eb }
  .btn.warn{ background:#fff; color:var(--red); border-color:#f2b4ac }
  .muted{ color:var(--muted) }
  .error{ color:var(--red); font-weight:600 }
  .grid{ display:grid; grid-template-columns: 1fr 360px; gap:14px; margin-top:12px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
  .pill{ display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; font-weight:600 }
  .kpi{ font-size:28px; font-weight:900 }
  .pad{ padding:8px 0 }
  .ticket-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px }
  .tbtn{ padding:16px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; text-align:center }
  .tname{ font-weight:700; margin-bottom:6px }
  .tprice{ color:#111 }
  .cart-line{ display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #f1f3f5 }
  .qtybox{ display:flex; align-items:center; gap:6px }
  .qtybox .qbtn{ width:32px; height:32px; line-height:30px; text-align:center; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer; font-weight:800 }
  .totalbar{ display:flex; justify-content:space-between; align-items:center; padding-top:10px; font-weight:900; font-size:20px }
  .toolbar{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px }
  .leftcol{ display:flex; align-items:center; gap:10px }
  .rightcol{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
  .radio{ display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #e5e7eb; border-radius:999px; background:#fff; cursor:pointer }
  .radio input{ accent-color: var(--green); }
</style>
</head><body>
<div class="wrap" id="app">
  <h1>POS</h1>
  <div id="screen"></div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (rands)=> Math.max(0, Math.round(Number(rands||0) * 100));
const rands = (c)=> 'R' + ((c||0)/100).toFixed(2);
const SKEY = 'vs_pos_session';

let BOOT = { events:[], gates:[] };
let SESSION = null; // { id, event_id, gate_id, cashier_name, cashier_phone? }
let CAT = { ticket_types:[], event:{} };
let CART = new Map(); // ticket_type_id -> qty
let PAYMENT = null;   // 'cash' | 'card'
let BUYER = { name:'', phone:'', send_to_cashier_if_empty: true };

// ---------- FLOW ----------
async function init(){
  const resp = await fetch('/api/pos/bootstrap').then(r=>r.json()).catch(()=>({ok:false}));
  if (!resp.ok){ return renderError('Kon nie POS data laai nie'); }
  BOOT = resp;

  const saved = loadSession();
  if (saved){ SESSION = saved; return renderPOS(); }
  renderShiftStart();
}

function loadSession(){
  try{ const o = JSON.parse(localStorage.getItem(SKEY)||''); if (!o?.id) return null; return o; }
  catch{ return null; }
}
function saveSession(o){
  localStorage.setItem(SKEY, JSON.stringify(o));
}
function clearSession(){ localStorage.removeItem(SKEY); }

// ---------- SCREENS ----------
function renderError(msg){
  $('screen').innerHTML = '<div class="card"><div class="error">'+escapeHtml(msg)+'</div></div>';
}

function renderShiftStart(){
  const evOpts = BOOT.events.map(e=>\`<option value="\${e.id}" data-slug="\${e.slug}">\${escapeHtml(e.name)} (\${escapeHtml(e.slug)})</option>\`).join('');
  const gOpts  = BOOT.gates.map(g=>\`<option value="\${g.id}">\${escapeHtml(g.name)}</option>\`).join('');
  $('screen').innerHTML = \`
    <div class="card">
      <h2>Start shift</h2>
      <div class="row">
        <input id="cashier_name" placeholder="Cashier name" style="min-width:220px"/>
        <input id="cashier_phone" placeholder="Cashier mobile (optional, e.g. 2771…)" style="min-width:240px"/>
      </div>
      <div class="row">
        <label class="muted">Event<br/>
          <select id="event_id" style="min-width:300px">\${evOpts}</select>
        </label>
        <label class="muted">Gate<br/>
          <select id="gate_id" style="min-width:180px">\${gOpts}</select>
        </label>
        <label class="muted">Opening float (R)<br/>
          <input id="float_r" type="number" min="0" step="1" value="0" style="width:130px"/>
        </label>
        <button id="startBtn" class="btn">Start</button>
        <div id="err" class="error"></div>
      </div>
    </div>\`;

  $('startBtn').onclick = async ()=>{
    $('err').textContent = '';
    const cashier_name = ($('cashier_name').value||'').trim();
    const cashier_phone = ($('cashier_phone').value||'').trim();
    const event_id = Number(($('event_id').value||0));
    const gate_id  = Number(($('gate_id').value||0));
    const opening_float_cents = cents($('float_r').value);
    if (!cashier_name) return $('err').textContent = 'Cashier name required';
    if (!event_id) return $('err').textContent = 'Please select event';
    if (!gate_id) return $('err').textContent = 'Please select gate';
    try{
      const r = await fetch('/api/pos/session/open', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents })
      });
      const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
      if (!j.ok) throw new Error(j.error||'unknown');
      SESSION = { id:j.session_id, cashier_name, cashier_phone, event_id, gate_id };
      saveSession(SESSION);
      renderPOS();
    }catch(e){
      $('err').textContent = 'Error: ' + (e.message||'unknown');
    }
  };
}

async function renderPOS(){
  // Load tickets from public catalog by event slug
  const ev = BOOT.events.find(e=>e.id===Number(SESSION.event_id));
  if (!ev){ return renderError('Event not found for session'); }
  const cat = await fetch('/api/public/events/'+encodeURIComponent(ev.slug))
    .then(r=>r.json()).catch(()=>({ok:false}));
  if (!cat.ok){ return renderError('Kon nie kaartjie lys laai nie'); }
  CAT = { ticket_types: cat.ticket_types||[], event: cat.event||{} };

  $('screen').innerHTML = \`
    <div class="toolbar">
      <div class="leftcol">
        <span class="kpi" id="kTotal">R0.00</span>
        <span class="pill" id="clock">--:--</span>
        <span class="pill">\${escapeHtml(ev.name)}</span>
        <button class="btn ghost" id="recallBtn">Recall order</button>
      </div>
      <div class="rightcol">
        <button class="btn warn" id="cashoutBtn">Cash-out</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Tickets</h2>
        <div class="ticket-grid" id="tgrid"></div>
      </div>

      <div class="card">
        <h2>Cart</h2>
        <div id="cartList" class="pad muted">No items</div>

        <div class="pad">
          <input id="buyer_name" placeholder="Buyer name" style="width:100%; margin-bottom:8px"/>
          <input id="buyer_phone" placeholder="Buyer mobile (e.g. 2771…)" style="width:100%"/>
          <label class="row" style="margin-top:6px">
            <input id="fallback_to_cashier" type="checkbox" checked/>
            <span class="muted">If empty, send tickets to cashier mobile</span>
          </label>
        </div>

        <div class="pad">
          <label class="radio"><input type="radio" name="pay" value="cash"> Cash</label>
          <label class="radio"><input type="radio" name="pay" value="card"> Card (Yoco)</label>
          <div id="payErr" class="error"></div>
        </div>

        <div class="totalbar">
          <span>Total</span>
          <span id="totalR">R0.00</span>
        </div>
        <div class="pad" style="display:flex; gap:8px">
          <button class="btn" id="finishBtn" disabled>Finish</button>
          <button class="btn ghost" id="clearBtn">Clear</button>
        </div>
        <div id="msg" class="muted" style="margin-top:6px"></div>
      </div>
    </div>\`;

  // Clock
  const clk = ()=>{ const d=new Date(); $('clock').textContent = d.toLocaleString(); }; clk(); setInterval(clk, 1000);

  // Render ticket buttons
  const T = CAT.ticket_types;
  $('tgrid').innerHTML = T.map(t => \`
    <button class="tbtn" data-tid="\${t.id}">
      <div class="tname">\${escapeHtml(t.name)}</div>
      <div class="tprice">\${(t.price_cents||0)? rands(t.price_cents): 'FREE'}</div>
    </button>\`).join('');

  document.querySelectorAll('[data-tid]').forEach(b=>{
    b.onclick = ()=> addToCart(Number(b.dataset.tid), 1);
  });

  document.getElementsByName('pay').forEach(r=>{
    r.addEventListener('change', ()=>{ PAYMENT = r.value; validateFinish(); });
  });

  $('finishBtn').onclick = doFinish;
  $('clearBtn').onclick = ()=>{ CART.clear(); renderCart(); };
  $('recallBtn').onclick = doRecall;
  $('cashoutBtn').onclick = doCashout;

  renderCart();
}

function renderCart(){
  const list = $('cartList');
  if (CART.size===0){ list.innerHTML = '<span class="muted">No items</span>'; }
  else{
    list.innerHTML = Array.from(CART.entries()).map(([tid,qty])=>{
      const tt = CAT.ticket_types.find(x=>x.id===tid) || {name:'',price_cents:0};
      const line = qty * (tt.price_cents||0);
      return \`
        <div class="cart-line">
          <div>\${escapeHtml(tt.name)}</div>
          <div class="qtybox">
            <button class="qbtn" data-dec="\${tid}">−</button>
            <b id="q\${tid}">\${qty}</b>
            <button class="qbtn" data-inc="\${tid}">+</button>
            <span style="width:80px; text-align:right">\${(tt.price_cents||0)? rands(line): 'FREE'}</span>
          </div>
        </div>\`;
    }).join('');
  }

  document.querySelectorAll('[data-inc]').forEach(b=> b.onclick = ()=> addToCart(Number(b.dataset.inc), +1));
  document.querySelectorAll('[data-dec]').forEach(b=> b.onclick = ()=> addToCart(Number(b.dataset.dec), -1));

  // totals
  let total = 0;
  for (const [tid,qty] of CART){
    const tt = CAT.ticket_types.find(x=>x.id===tid) || {price_cents:0};
    total += qty * (tt.price_cents||0);
  }
  $('totalR').textContent = rands(total);
  $('kTotal').textContent = rands(total);
  validateFinish();
}

function addToCart(tid, delta){
  const cur = CART.get(tid)||0;
  const nxt = Math.max(0, cur+delta);
  if (nxt===0) CART.delete(tid); else CART.set(tid, nxt);
  renderCart();
}

function validateFinish(){
  const totalCents = Array.from(CART.entries()).reduce((s,[tid,q])=>{
    const tt = CAT.ticket_types.find(x=>x.id===tid) || {price_cents:0};
    return s + q * (tt.price_cents||0);
  }, 0);
  const ok = CART.size>0 && (PAYMENT==='cash' || PAYMENT==='card');
  $('finishBtn').disabled = !ok;
  $('payErr').textContent = (!PAYMENT && CART.size>0) ? 'Select payment method' : '';
}

async function doFinish(){
  $('msg').textContent = ''; $('payErr').textContent = '';
  if (!PAYMENT){ $('payErr').textContent = 'Select payment method'; return; }
  if (CART.size===0){ $('msg').textContent = 'Select tickets first'; return; }

  const items = Array.from(CART.entries()).map(([ticket_type_id, qty])=>({ ticket_type_id, qty }));
  const buyer_name  = ($('buyer_name').value||'').trim();
  const buyer_phone = ($('buyer_phone').value||'').trim();
  const send_to_cashier_if_empty = $('fallback_to_cashier').checked;
  const body = {
    event_id: Number(SESSION.event_id),
    session_id: Number(SESSION.id),
    items,
    payment_method: PAYMENT, // 'cash' | 'card'
    buyer_name, buyer_phone,
    cashier_fallback_phone: (send_to_cashier_if_empty ? (SESSION.cashier_phone||'') : ''),
    mode: 'pos'
  };

  try{
    const r = await fetch('/api/pos/order/sale', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if (!j.ok) throw new Error(j.error||'unknown');

    // success → clear cart and show message
    CART.clear(); PAYMENT = null; renderCart();
    $('buyer_name').value = ''; $('buyer_phone').value = '';
    $('msg').textContent = 'Sale completed. Order '+(j.short_code||j.order_id||'')+' issued.';
  }catch(e){
    $('msg').textContent = 'Error: ' + (e.message||'unknown');
  }
}

async function doRecall(){
  const code = prompt('Enter order code (online “pay at event”):','');
  if (!code) return;
  try{
    const r = await fetch('/api/pos/order/lookup/'+encodeURIComponent(code));
    const j = await r.json().catch(()=>({ok:false}));
    if (!j.ok) throw new Error(j.error||'not found');

    // hydrate into cart
    CART.clear();
    (j.order.items||[]).forEach(it=>{
      CART.set(Number(it.ticket_type_id), Number(it.qty||0));
    });
    $('buyer_name').value = j.order.buyer_name||'';
    $('buyer_phone').value = j.order.buyer_phone||'';
    PAYMENT = null; // must choose again at POS
    renderCart();
    $('msg').textContent = 'Order '+(j.order.short_code||'')+' loaded. Adjust items and finish.';
  }catch(e){
    alert('Recall failed: '+(e.message||'unknown'));
  }
}

async function doCashout(){
  const mgr = prompt('Manager name (for cash-up):','');
  if (mgr===null) return;
  try{
    const r = await fetch('/api/pos/session/close', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ session_id: Number(SESSION.id), closing_manager: String(mgr||'').trim() })
    });
    const j = await r.json().catch(()=>({ok:false}));
    if (!j.ok) throw new Error(j.error||'unknown');
    clearSession();
    alert('Shift closed. You are now logged out of POS.');
    location.href = '/pos';
  }catch(e){
    alert('Could not close session: '+(e.message||'unknown'));
  }
}

// ---------- helpers ----------
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

init();
</script>
</body></html>`;
