// /src/ui/pos.js

/* ---------------- Start screen (unchanged from last) ---------------- */
export const posHTML = `<!doctype html><html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 12px } .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.gray{ background:#e5e7eb; color:#111 }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600; white-space:pre-wrap }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div class="card">
    <h2 style="margin:0 0 10px">Start shift</h2>
    <div class="row" style="margin-bottom:10px">
      <input id="cashier" placeholder="Cashier name" style="min-width:220px"/>
      <select id="event" style="min-width:320px"></select>
      <select id="gate" style="min-width:200px"></select>
    </div>
    <div class="row">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:140px"/>
      </div>
      <div>
        <div class="muted" style="margin-bottom:4px">Cashier phone (optional)</div>
        <input id="cashier_msisdn" placeholder="+27…" style="width:200px"/>
      </div>
      <button id="startBtn" class="btn">Start</button>
      <div id="err" class="error"></div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (r)=> Math.max(0, Math.round(Number(r||0)*100));
async function safeJson(res){ try{ return await res.json(); }catch{ const t=await res.text().catch(()=> ''); return { ok:false, error:t||('HTTP '+res.status) }; } }

async function load() {
  $('err').textContent = '';
  $('event').innerHTML = '<option>Loading…</option>';
  $('gate').innerHTML  = '<option>Loading…</option>';
  try {
    const r = await fetch('/api/pos/bootstrap', { headers:{ 'accept':'application/json' } });
    const j = await safeJson(r);
    if (!j.ok) throw new Error(j.error || 'bootstrap failed');

    $('event').innerHTML = (j.events||[]).map(e =>
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="0">No events</option>';

    $('gate').innerHTML = (j.gates||[]).map(g =>
      \`<option value="\${g.id}">\${g.name}</option>\`
    ).join('') || '<option value="0">No gates</option>';
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'network');
  }
}

$('startBtn').onclick = async () => {
  $('err').textContent = '';
  const cashier_name = ($('cashier').value || '').trim();
  const event_id = Number(($('event').value || '0'));
  const gate_id  = Number(($('gate').value  || '0'));
  const opening_float_cents = cents($('float').value);
  const cashier_msisdn = ($('cashier_msisdn').value || '').trim();

  if (!cashier_name) return $('err').textContent = 'cashier name required';
  if (!event_id) return $('err').textContent = 'event required';
  if (!gate_id)  return $('err').textContent = 'gate required';

  try {
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      headers:{ 'content-type':'application/json','accept':'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents, cashier_msisdn })
    });
    const j = await safeJson(r);
    if (!j.ok) throw new Error(j.error || 'unknown');
    location.href = '/pos/sell?session_id=' + encodeURIComponent(j.session_id);
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'unknown');
  }
};

load();
</script>
</body></html>`;

/* ---------------- Sell screen ---------------- */
export function posSellHTML(sessionId) {
  const sid = String(sessionId||"");
  return `<!doctype html><html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Sell</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1200px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .topbar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600; white-space:pre-wrap }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.gray{ background:#e5e7eb; color:#111 }
  a{ color:var(--green); text-decoration:none }
  .grid{ display:grid; grid-template-columns: 2fr 1fr; gap:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .tickets{ display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px }
  .tt{ padding:12px; border:1px solid #e5e7eb; border-radius:12px; background:#fff; display:flex; flex-direction:column; gap:6px }
  .qty{ display:flex; gap:8px; align-items:center }
  .chip{ display:inline-block; padding:2px 8px; border-radius:999px; background:#ecfdf3; color:#065f46; font-size:12px; font-weight:700 }
  .pill{ display:inline-block; padding:4px 10px; border-radius:999px; background:#ecfdf3; color:#065f46; font-weight:700; font-size:13px }
  input{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
</style>
</head><body>
<div class="wrap">
  <div class="topbar">
    <div>
      <h1 style="margin:0 0 4px">POS</h1>
      <div class="muted">Session <span id="sid">${sid}</span> · <span id="clock"></span></div>
    </div>
    <div>
      <button id="cashOutBtn" class="btn gray">Close / Cash-out</button>
    </div>
  </div>

  <div id="msg" class="card" style="display:none"></div>

  <div class="grid">
    <div class="card">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px">
        <input id="buyer_name" placeholder="Customer name" style="min-width:200px"/>
        <input id="buyer_phone" placeholder="Mobile (optional)" style="min-width:180px"/>
        <input id="recall_code" placeholder="Recall code" style="width:160px"/>
        <button id="recallBtn" class="btn gray">Recall</button>
      </div>

      <div id="tickets" class="tickets"></div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:700">Total</div>
        <div class="pill" id="totalPill">R0.00</div>
      </div>
      <div id="cart" class="muted" style="min-height:80px">Cart empty</div>
      <button id="cashBtn" class="btn" style="width:100%;margin-top:10px">Cash</button>
      <button id="cardBtn" class="btn" style="width:100%;background:#111;margin-top:8px">Card</button>
      <div class="muted" style="margin-top:10px"><a href="/pos">← Back to start</a></div>
      <div id="err" class="error" style="margin-top:8px"></div>
    </div>
  </div>
</div>

<script>
const sid = ${JSON.stringify(sid)};
const $ = (id)=>document.getElementById(id);
const rands = c => 'R' + ((c||0)/100).toFixed(2);
const state = { ttypes:new Map(), cart:new Map(), event:null };

function tick(){ $('clock').textContent = new Date().toLocaleString('af-ZA'); }
tick(); setInterval(tick, 1000);

async function safeJson(res){ try{ return await res.json(); }catch{ const t=await res.text().catch(()=> ''); return { ok:false, error:t||('HTTP '+res.status) }; } }

function renderTickets() {
  const el = $('tickets');
  const arr = Array.from(state.ttypes.values());
  el.innerHTML = arr.map(t => \`
    <div class="tt">
      <div style="font-weight:700">\${t.name}</div>
      <div class="muted">\${t.price_cents ? rands(t.price_cents) : 'FREE'}</div>
      <div class="qty">
        <button data-dec="\${t.id}" class="btn gray" style="padding:6px 10px">−</button>
        <div id="q\${t.id}" style="min-width:20px;text-align:center">\${state.cart.get(t.id)||0}</div>
        <button data-inc="\${t.id}" class="btn" style="padding:6px 10px">+</button>
      </div>
    </div>\`).join('');

  el.querySelectorAll('[data-inc]').forEach(b=> b.onclick = ()=> changeQty(Number(b.dataset.inc), +1));
  el.querySelectorAll('[data-dec]').forEach(b=> b.onclick = ()=> changeQty(Number(b.dataset.dec), -1));
  renderCart();
}

function changeQty(id, d){
  const cur = state.cart.get(id)||0;
  const next = Math.max(0, cur+d);
  if (next===0) state.cart.delete(id); else state.cart.set(id,next);
  const q = $('q'+id); if (q) q.textContent = String(next);
  renderCart();
}

function renderCart(){
  const cart = $('cart');
  if (!state.cart.size){ cart.textContent='Cart empty'; $('totalPill').textContent='R0.00'; return; }
  let total=0;
  cart.innerHTML = Array.from(state.cart.entries()).map(([tid,qty])=>{
    const tt = state.ttypes.get(tid) || {};
    const line = qty * (tt.price_cents||0);
    total += line;
    return \`<div style="display:flex;justify-content:space-between;margin:4px 0">
      <div>\${tt.name} × \${qty}</div><div>\${tt.price_cents? rands(line): 'FREE'}</div>
    </div>\`;
  }).join('');
  $('totalPill').textContent = rands(total);
}

async function load() {
  const r = await fetch('/api/pos/session_bootstrap?session_id='+encodeURIComponent(sid));
  const j = await safeJson(r);
  if (!j.ok) { $('err').textContent = j.error||'failed'; return; }
  state.event = j.event;
  (j.ticket_types||[]).forEach(t=> state.ttypes.set(t.id, t));
  renderTickets();
}

$('recallBtn').onclick = async ()=>{
  $('err').textContent='';
  const code = ($('recall_code').value||'').trim();
  if (!code) return;
  const r = await fetch('/api/pos/order/recall', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ short_code: code })
  });
  const j = await safeJson(r);
  if (!j.ok) { $('err').textContent = j.error||'recall failed'; return; }

  // Load items into cart
  state.cart.clear();
  (j.items||[]).forEach(it=> state.cart.set(it.ticket_type_id, it.qty));
  $('buyer_name').value = j.order?.buyer_name||'';
  $('buyer_phone').value = j.order?.buyer_phone||'';
  renderTickets();
};

async function tender(method){
  $('err').textContent='';
  try{
    // 1) create pos order
    const r1 = await fetch('/api/pos/order/start', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({
        session_id: Number(sid),
        event_id: Number(state.event?.id||0),
        buyer_name: ($('buyer_name').value||'').trim(),
        buyer_phone: ($('buyer_phone').value||'').trim()
      })
    });
    const j1 = await safeJson(r1);
    if(!j1.ok) throw new Error(j1.error||'start failed');

    // 2) set items
    const items = Array.from(state.cart.entries()).map(([ticket_type_id, qty])=>({ ticket_type_id, qty }));
    const r2 = await fetch('/api/pos/order/set-items', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ order_id: j1.order_id, items })
    });
    const j2 = await safeJson(r2);
    if(!j2.ok) throw new Error(j2.error||'set-items failed');

    // 3) tender
    const r3 = await fetch('/api/pos/order/tender', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ order_id: j1.order_id, method })
    });
    const j3 = await safeJson(r3);
    if(!j3.ok) throw new Error(j3.error||'tender failed');

    state.cart.clear();
    renderTickets();
    const msg = document.getElementById('msg');
    msg.style.display='block';
    msg.innerHTML = '<div class="chip">Sale completed</div><div class="muted" style="margin-top:6px">Order '+(j1.short_code||'#'+j1.order_id)+' paid via '+(method==='pos_cash'?'cash':'card')+'.</div>';
  }catch(e){
    $('err').textContent = 'Error: ' + (e.message||'unknown');
  }
}

$('cashBtn').onclick = ()=> tender('pos_cash');
$('cardBtn').onclick = ()=> tender('pos_card');

// Close session
document.getElementById('cashOutBtn').onclick = async () => {
  const manager = prompt('Manager name to close this session:','');
  if (manager===null) return;
  const r = await fetch('/api/pos/session/close', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ session_id: Number(sid), closing_manager: (manager||'').trim() })
  });
  const j = await safeJson(r);
  if(!j.ok){ $('err').textContent = j.error||'close failed'; return; }
  location.href = '/pos';
};

load();
</script>
</body></html>`;
}
