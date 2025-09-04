// /src/ui/pos.js
/** Start screen (open shift) */
export const posHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1000px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 12px } .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 }
  .ok{ color:#0a7d2b; font-weight:600 }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div class="card">
    <h2 style="margin:0 0 10px">Start shift</h2>
    <div class="row" style="margin-bottom:10px">
      <input id="cashier" placeholder="Cashier name" style="min-width:180px"/>
      <select id="event" style="min-width:260px"></select>
      <select id="gate" style="min-width:180px"></select>
    </div>
    <div class="row">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:120px"/>
      </div>
      <div>
        <div class="muted" style="margin-bottom:4px">Cashier phone (optional)</div>
        <input id="msisdn" placeholder="+27…" style="width:160px"/>
      </div>
      <button id="startBtn" class="btn">Start</button>
      <div id="msg" class="ok"></div>
      <div id="err" class="error"></div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (r)=> Math.max(0, Math.round(Number(r||0)*100));

async function load() {
  $('err').textContent = '';
  $('event').innerHTML = '<option>Loading…</option>';
  $('gate').innerHTML = '<option>Loading…</option>';
  try {
    const r = await fetch('/api/pos/bootstrap');
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'bootstrap failed');

    const ev = $('event');
    ev.innerHTML = j.events.map(e =>
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="0">No events</option>';

    const gt = $('gate');
    gt.innerHTML = j.gates.map(g =>
      \`<option value="\${g.id}">\${g.name}</option>\`
    ).join('');
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'network');
  }
}

$('startBtn').onclick = async () => {
  $('err').textContent = ''; $('msg').textContent = '';
  const cashier_name = ($('cashier').value || '').trim();
  const event_id = Number(($('event').value || '0'));
  const gate_id = Number(($('gate').value || '0'));
  const opening_float_cents = cents($('float').value);
  const cashier_msisdn = ($('msisdn').value || '').trim();

  if (!cashier_name) return $('err').textContent = 'cashier name required';
  if (!event_id) return $('err').textContent = 'event required';
  if (!gate_id) return $('err').textContent = 'gate required';

  try {
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents, cashier_msisdn })
    });
    const j = await r.json().catch(()=>({ok:false,error:'bad json'}));
    if (!j.ok) throw new Error(j.error || 'unknown');
    $('msg').textContent = \`Shift started (session #\${j.session_id}).\`;
    // go to sell screen
    setTimeout(()=> location.href = '/pos/sell?session_id='+encodeURIComponent(j.session_id), 400);
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'unknown');
  }
};

load();
</script>
</body></html>`;

/** Sell screen (ticket buttons, cart, tender) */
export const posSellHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Sell</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 12px }
  .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:16px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
  .tickets{ display:grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap:10px }
  .btn{ padding:12px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; text-align:left }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent; text-align:center; font-weight:700 }
  .line{ display:flex; justify-content:space-between; margin:6px 0 }
  .muted{ color:var(--muted) }
  input{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .error{ color:#b42318; font-weight:600 }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div id="app" class="card">Loading…</div>
</div>

<script>
const qs = new URLSearchParams(location.search);
const SESSION_ID = Number(qs.get('session_id') || '0');

function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }
const $ = (sel)=>document.querySelector(sel);

async function load(){
  const app = $('#app');
  try{
    const r = await fetch('/api/pos/session/'+SESSION_ID+'/context');
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || 'context failed');

    const tButtons = (j.ticket_types||[]).map(t => 
      \`<button class="btn" data-tt="\${t.id}">
         <div style="font-weight:700">\${t.name}</div>
         <div class="muted">\${t.price_cents ? rands(t.price_cents) : 'FREE'}</div>
       </button>\`
    ).join('');

    app.innerHTML = \`
      <div class="grid">
        <div>
          <div class="muted" style="margin-bottom:8px">
            Session #\${j.session.id} · \${j.event?.name || ''} · \${j.session.gate_name || 'Gate'}
          </div>
          <div class="tickets">\${tButtons || '<div class="muted">No ticket types</div>'}</div>
        </div>
        <div>
          <div class="line" style="margin-bottom:8px">
            <div style="font-weight:700">Cart</div>
            <a href="/pos" class="muted" style="text-decoration:none">← Back to start</a>
          </div>
          <div id="cartEmpty" class="muted">Add items…</div>
          <div id="cartLines"></div>
          <div class="line" style="font-weight:700; font-size:18px; border-top:1px solid #f1f3f5; padding-top:8px">
            <div>Total</div><div id="total">R0.00</div>
          </div>

          <div style="margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input id="buyerName" placeholder="Customer name"/>
            <input id="buyerPhone" placeholder="Customer phone (+27…)"/>
          </div>

          <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
            <button id="payCash" class="btn primary">Pay CASH</button>
            <button id="payCard" class="btn primary">Pay CARD</button>
            <input id="recallCode" placeholder="Recall code…" style="flex:1"/>
            <button id="recallBtn" class="btn">Recall</button>
          </div>
          <div id="err" class="error" style="margin-top:8px"></div>
        </div>
      </div>
    \`;

    // --- interactivity ---
    const cart = new Map();           // tid -> qty
    const prices = new Map((j.ticket_types||[]).map(t=>[t.id, t.price_cents|0]));
    const names  = new Map((j.ticket_types||[]).map(t=>[t.id, t.name]));

    const renderCart = ()=>{
      const lines = Array.from(cart.entries());
      $('#cartEmpty').style.display = lines.length ? 'none':'block';
      let total = 0;
      $('#cartLines').innerHTML = lines.map(([tid,qty])=>{
        const p = prices.get(tid) || 0;
        const line = qty * p; total += line;
        return \`<div class="line"><div>\${names.get(tid)} × \${qty}</div><div>\${p? rands(line): 'FREE'}</div></div>\`;
      }).join('');
      $('#total').textContent = rands(total);
      return total;
    };

    document.querySelectorAll('[data-tt]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const tid = Number(b.dataset.tt);
        cart.set(tid, (cart.get(tid)||0)+1);
        renderCart();
      });
    });

    async function tender(kind){
      $('#err').textContent = '';
      const items = Array.from(cart.entries()).map(([ticket_type_id, qty])=>({ ticket_type_id, qty }));
      if (!items.length) return $('#err').textContent = 'Add at least one item';
      const buyer_name = ($('#buyerName').value || '').trim();
      const buyer_phone = ($('#buyerPhone').value || '').trim();

      try{
        const r = await fetch('/api/pos/order/tender', {
          method:'POST',
          headers:{ 'content-type':'application/json' },
          body: JSON.stringify({ session_id: SESSION_ID, method: kind, items, buyer_name, buyer_phone })
        });
        const j2 = await r.json().catch(()=>({ok:false,error:'bad json'}));
        if (!j2.ok) throw new Error(j2.error || 'tender failed');
        // clear cart and show mini confirmation
        cart.clear(); renderCart();
        alert('Sale completed. Order #'+j2.order_id+' · '+rands(j2.total_cents));
      }catch(e){
        $('#err').textContent = e.message || 'network';
      }
    }

    $('#payCash').onclick = ()=> tender('cash');
    $('#payCard').onclick = ()=> tender('card');

    // (Optional) Recall stub – future: call a recall endpoint and populate cart
    $('#recallBtn').onclick = ()=>{
      const code = ($('#recallCode').value||'').trim();
      if (!code) return;
      alert('Recall not wired yet. Entered: '+code);
    };

  }catch(e){
    $('#app').innerHTML = '<div class="error">'+(e.message||'load failed')+'</div>';
  }
}

if (!SESSION_ID) {
  document.body.innerHTML = '<div style="padding:20px;font-family:system-ui">Missing session_id</div>';
} else {
  load();
}
</script>
</body></html>`;
