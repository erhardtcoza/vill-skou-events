// /src/ui/pos.js
export const posHTML = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{--green:#176d2b;--bg:#f6f7f9;--card:#ffffff;--muted:#6b7280}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:24px auto;padding:16px}
  h1{margin:0 0 16px}
  .card{background:var(--card);border:1px solid #e5e7eb;border-radius:14px;padding:16px;box-shadow:0 2px 0 rgba(0,0,0,.02)}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  input,select,button{padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;background:#fff}
  input,select{min-width:140px}
  button{background:#e8f1ea;border-color:#cfe3d4;cursor:pointer}
  .btn{background:#e6efe8}
  .btn-primary{background:var(--green);border-color:#0e571f;color:#fff}
  .btn-ghost{background:#fff}
  .pill{border-radius:999px;padding:10px 14px;border:1px solid #d1d5db;background:#fff;cursor:pointer}
  .pill:active{transform:scale(.98)}
  .muted{color:var(--muted)}
  .error{color:#b00020;margin-top:8px}
  .grid{display:grid;grid-template-columns:1fr 320px;gap:16px}
  .summary{position:sticky;top:12px}
  .cart-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #eee}
  .qty{display:inline-flex;border:1px solid #d1d5db;border-radius:999px;overflow:hidden}
  .qty button{border:0;background:#f3f4f6;padding:6px 10px}
  .qty span{display:inline-block;min-width:28px;text-align:center;padding:6px 8px}
  .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .ticket-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
  .wide{min-width:220px}
  .right{margin-left:auto}
  dialog{border:0;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:0}
  dialog .dlg{padding:16px}
  .dlg-header{font-weight:600;margin-bottom:8px}
  .footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
</style>
</head>
<body>
<div class="wrap">
  <h1>POS</h1>

  <!-- START SHIFT -->
  <section id="startView" class="card" style="display:none">
    <h2 style="margin:0 0 12px">Start shift</h2>
    <div class="row">
      <input id="cashier_name" placeholder="Cashier name" class="wide"/>
      <select id="event_id" class="wide"></select>
      <select id="gate_name" class="wide"></select>
    </div>
    <div class="row" style="margin-top:8px">
      <label class="muted">Opening float (R)</label>
      <input id="opening_float" type="number" step="0.01" value="0" style="min-width:120px"/>
      <button class="btn-primary" onclick="startShift()">Start</button>
      <span id="start_err" class="error"></span>
    </div>
  </section>

  <!-- SELL VIEW -->
  <section id="sellView" style="display:none">
    <div class="toolbar">
      <div>
        <div class="muted" id="context_line"></div>
        <div class="muted" id="session_line"></div>
      </div>
      <div class="row">
        <button class="pill" onclick="openRecall()">Recall order</button>
        <button class="pill" onclick="endShift()">End shift</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3 style="margin:0 0 8px">Tickets</h3>
        <div id="ticketGrid" class="ticket-grid"></div>
      </div>

      <div class="card summary">
        <h3 style="margin:0 0 8px">Current sale</h3>
        <div id="cartRows" class="muted">No items</div>
        <div style="display:flex;justify-content:space-between;margin-top:10px">
          <strong>Total</strong>
          <strong id="totalCell">R0.00</strong>
        </div>
        <hr style="margin:12px 0">
        <div class="row">
          <label class="pill"><input type="radio" name="pay" value="cash" onclick="setPay('cash')"> Cash</label>
          <label class="pill"><input type="radio" name="pay" value="card" onclick="setPay('card')"> Card</label>
        </div>
        <div class="row" style="margin-top:8px">
          <input id="buyer_name" placeholder="Customer name" class="wide">
          <input id="buyer_phone" placeholder="Mobile (WhatsApp)" class="wide">
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" onclick="clearCart()">Clear</button>
          <button class="btn-primary right" onclick="finishSale()">Finish</button>
        </div>
        <div id="sell_err" class="error"></div>
      </div>
    </div>
  </section>
</div>

<!-- RECALL DIALOG -->
<dialog id="recallDlg">
  <div class="dlg">
    <div class="dlg-header">Recall Order</div>
    <div class="muted" style="margin-bottom:8px">Enter order code for “Pay at event”.</div>
    <input id="recallCode" placeholder="Order code e.g. ABC123" style="width:100%">
    <div class="footer">
      <button class="btn-ghost" onclick="closeRecall()">Close</button>
      <button class="btn-primary" onclick="lookupRecall()">Lookup</button>
    </div>
    <div id="recall_err" class="error"></div>
  </div>
</dialog>

<script>
let BOOT = { events: [], gates: [] };
let SESSION = null;           // { session_id, event_id, ... }
let CATALOG = [];             // ticket types for event
let CART = {};                // { ticket_type_id: qty }
let PAY = null;               // 'cash'|'card'

const R = (c) => (c/100).toLocaleString('en-ZA',{style:'currency',currency:'ZAR'});

// ---------- Boot ----------
async function boot(){
  // If we have a session in LS, load it and go straight to sell
  try { SESSION = JSON.parse(localStorage.getItem('pos_session')||'null'); } catch {}
  if (!SESSION) {
    await loadBootstrap();
    showStart();
  } else {
    await loadBootstrap(); // to render gate/event names in header
    await loadCatalog(SESSION.event_id);
    showSell();
  }
}

async function loadBootstrap(){
  // Requires pos/admin role cookie
  const r = await fetch('/api/pos/bootstrap');
  if (!r.ok) { document.getElementById('start_err').textContent = 'Error: network'; return; }
  const j = await r.json().catch(()=>({}));
  if (!j.ok) { document.getElementById('start_err').textContent = 'Error: ' + (j.error||'unknown'); return; }
  BOOT = j;

  // Fill selects if start view will be used
  const evSel = document.getElementById('event_id');
  const gtSel = document.getElementById('gate_name');
  if (evSel){
    evSel.innerHTML = (BOOT.events||[]).map(e => 
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="">No events</option>';
  }
  if (gtSel){
    gtSel.innerHTML = (BOOT.gates||[]).map(g => 
      \`<option value="\${g.name}">\${g.name}</option>\`
    ).join('') || '<option value="Main Gate">Main Gate</option>';
  }
}

function showStart(){
  document.getElementById('startView').style.display = 'block';
  document.getElementById('sellView').style.display = 'none';
}

function showSell(){
  document.getElementById('startView').style.display = 'none';
  document.getElementById('sellView').style.display = 'block';

  // Header context
  const ev = (BOOT.events||[]).find(e => e.id === Number(SESSION.event_id));
  document.getElementById('context_line').textContent =
    ev ? \`\${ev.name} · \${new Date(ev.starts_at*1000).toLocaleDateString()} → \${new Date(ev.ends_at*1000).toLocaleDateString()}\` : '';
  document.getElementById('session_line').textContent =
    \`Cashier: \${SESSION.cashier_name} · Gate: \${SESSION.gate_name}\`;

  // Tickets grid
  const grid = document.getElementById('ticketGrid');
  grid.innerHTML = CATALOG.map(tt => {
    const price = tt.price_cents == null ? 'FREE' : R(tt.price_cents);
    return \`<button class="pill" onclick="addItem(\${tt.id})">\${tt.name}<br><span class="muted">\${price}</span></button>\`;
  }).join('') || '<div class="muted">No ticket types configured for this event.</div>';

  renderCart();
}

async function loadCatalog(event_id){
  const r = await fetch(\`/api/pos/catalog/\${event_id}\`);
  const j = await r.json().catch(()=>({}));
  CATALOG = j.ticket_types || [];
}

// ---------- Start shift ----------
async function startShift(){
  const name = document.getElementById('cashier_name').value.trim();
  const event_id = Number(document.getElementById('event_id').value);
  const gate_name = document.getElementById('gate_name').value.trim();
  const opening_float_cents = Math.round(Number(document.getElementById('opening_float').value||0) * 100);
  const err = document.getElementById('start_err'); err.textContent = '';

  if (!name || !event_id || !gate_name){
    err.textContent = 'Please fill all fields.'; return;
  }

  const r = await fetch('/api/pos/session/open', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ cashier_name:name, gate_name, opening_float_cents, event_id })
  });
  const j = await r.json().catch(()=>({}));
  if (!j.ok){ err.textContent = 'Error: ' + (j.error || 'unknown'); return; }

  SESSION = { session_id: j.session_id, cashier_name: name, gate_name, event_id };
  localStorage.setItem('pos_session', JSON.stringify(SESSION));
  await loadCatalog(event_id);
  showSell();
}

// ---------- Cart ----------
function addItem(ttId){ CART[ttId] = (CART[ttId]||0) + 1; renderCart(); }
function decItem(ttId){ if (!CART[ttId]) return; CART[ttId]--; if (CART[ttId]<=0) delete CART[ttId]; renderCart(); }
function clearCart(){ CART = {}; PAY = null; document.querySelectorAll('input[name="pay"]').forEach(el=>el.checked=false); renderCart(); }
function setPay(v){ PAY = v; }

function renderCart(){
  const rowsEl = document.getElementById('cartRows');
  const totalEl = document.getElementById('totalCell');
  const items = Object.entries(CART).map(([id,qty])=>{
    const tt = CATALOG.find(t=>t.id===Number(id)); 
    return tt ? { tt, qty, line: (tt.price_cents||0)*qty } : null;
  }).filter(Boolean);

  if (!items.length){ rowsEl.innerHTML = '<span class="muted">No items</span>'; totalEl.textContent = 'R0.00'; return; }

  rowsEl.innerHTML = items.map(({tt,qty,line}) => \`
    <div class="cart-row">
      <div>\${tt.name}</div>
      <div>
        <span class="qty">
          <button onclick="decItem(\${tt.id})">−</button>
          <span>\${qty}</span>
          <button onclick="addItem(\${tt.id})">+</button>
        </span>
        <strong style="margin-left:10px">\${R(line)}</strong>
      </div>
    </div>\`
  ).join('');

  const total = items.reduce((a,b)=>a+b.line,0);
  totalEl.textContent = R(total);
}

// ---------- Finish sale ----------
async function finishSale(){
  const err = document.getElementById('sell_err'); err.textContent = '';

  const items = Object.entries(CART).map(([ticket_type_id, qty])=>({ ticket_type_id:Number(ticket_type_id), qty:Number(qty) }));
  if (!items.length){ err.textContent = 'Add at least one ticket.'; return; }
  if (!PAY){ err.textContent = 'Select Cash or Card.'; return; }

  const body = {
    session_id: SESSION.session_id,
    event_id: SESSION.event_id,
    items,
    payment_method: PAY,
    buyer_name: (document.getElementById('buyer_name').value||'').trim(),
    buyer_phone:(document.getElementById('buyer_phone').value||'').trim()
  };

  const r = await fetch('/api/pos/order/sale', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  const j = await r.json().catch(()=>({}));
  if (!j.ok){ err.textContent = 'Error: ' + (j.error||'unknown'); return; }

  // Success – clear and show short toast
  clearCart();
  alert('Sale completed. Order #' + j.order_id + (j.payment_ref ? (' · ' + j.payment_ref) : ''));
}

// ---------- Recall ----------
function openRecall(){ document.getElementById('recallDlg').showModal(); }
function closeRecall(){ document.getElementById('recallDlg').close(); }
async function lookupRecall(){
  const code = (document.getElementById('recallCode').value||'').trim();
  const out = document.getElementById('recall_err'); out.textContent = '';
  if (!code) { out.textContent = 'Enter a code'; return; }

  const r = await fetch('/api/pos/order/lookup/' + encodeURIComponent(code));
  const j = await r.json().catch(()=>({}));
  if (!j.ok){ out.textContent = j.error || 'Not found'; return; }

  // Load items into cart for editing/payment
  CART = {};
  (j.order.items||[]).forEach(it => { CART[it.ticket_type_id] = (CART[it.ticket_type_id]||0) + Number(it.qty||0); });
  // Ensure catalog for that order's event is loaded
  if (Number(j.order.event_id) !== Number(SESSION.event_id)) {
    SESSION.event_id = Number(j.order.event_id);
    localStorage.setItem('pos_session', JSON.stringify(SESSION));
    await loadCatalog(SESSION.event_id);
  }
  closeRecall();
  showSell();
}

async function endShift(){
  if (!confirm('End shift?')) return;
  await fetch('/api/pos/session/close', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ session_id: SESSION.session_id })
  });
  localStorage.removeItem('pos_session');
  location.reload();
}

boot();
</script>
</body>
</html>`;
