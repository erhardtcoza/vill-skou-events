// /src/ui/pos.js

/* POS landing (unchanged from your version if you have one) */
export function posHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --accent-ink:#fff; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  a.btn{ display:inline-block; background:var(--accent); color:var(--accent-ink); padding:12px 16px; border-radius:10px; text-decoration:none; font-weight:800 }
  .muted{ color:var(--muted) }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div class="card">
    <p class="muted" style="margin-top:0">Begin 'n nuwe sessie om kaartjies te verkoop.</p>
    <a class="btn" href="/pos/sell">Begin verkoop</a>
  </div>
</div>
</body></html>`;
}

/* POS sell screen – mobile-first, tap-to-add, sticky footer */
export function posSellHTML(session_id = 0) {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>POS · Sell</title>
<style>
  :root{
    --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff;
    --accent:#0a7d2b; --accent-ink:#fff; --danger:#b42318; --shadow:0 12px 26px rgba(0,0,0,.08);
  }
  *{ box-sizing:border-box }
  html,body{ height:100% }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:0 auto; padding:10px 12px 92px } /* padding bottom for sticky bar space */
  .topbar{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 10px }
  h1{ margin:0; font-size:28px }
  .chip{ background:#eaf5ec; color:#06451c; border-radius:999px; padding:6px 10px; font-weight:700 }
  .ghost{ background:#eef2f4; color:#0b1320; border-radius:999px; padding:6px 10px; text-decoration:none; font-weight:700 }
  .row{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px }
  @media (max-width:920px){ .row{ grid-template-columns:1fr 1fr } }
  @media (max-width:640px){ .row{ grid-template-columns:1fr } }

  .inputs{ display:grid; grid-template-columns:1.2fr 1.2fr 1fr auto; gap:8px; margin-bottom:8px }
  @media (max-width:920px){ .inputs{ grid-template-columns:1fr 1fr } }
  @media (max-width:640px){ .inputs{ grid-template-columns:1fr } }

  input{ width:100%; border:1px solid #e5e7eb; background:#fff; border-radius:12px; padding:12px 14px; font:inherit }
  button{ font:inherit }
  .btn{ padding:12px 16px; border-radius:12px; border:0; font-weight:800; cursor:pointer }
  .btn.accent{ background:var(--accent); color:var(--accent-ink) }
  .btn.ghost{ background:#fff; border:1px solid #e5e7eb }

  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:start }
  @media (max-width:920px){ .grid{ grid-template-columns:1fr } }

  .card{ background:var(--card); border-radius:16px; box-shadow:var(--shadow); padding:12px }
  .tickets{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px }
  @media (max-width:1080px){ .tickets{ grid-template-columns:repeat(2,1fr) } }
  @media (max-width:640px){ .tickets{ grid-template-columns:1fr } }

  .tcard{ border:1px solid #eef1f3; border-radius:14px; padding:12px; cursor:pointer; position:relative; user-select:none; -webkit-tap-highlight-color:transparent; }
  .tcard:hover{ box-shadow:0 6px 16px rgba(0,0,0,.06) }
  .price{ color:#111; font-weight:700; margin-top:4px }
  .muted{ color:var(--muted) }
  .qtyBadge{ position:absolute; right:10px; top:10px; background:#0a7d2b; color:#fff; border-radius:999px; padding:4px 8px; font-weight:800; font-size:12px; display:none }
  .tcard.hasQty .qtyBadge{ display:inline-block }

  .summary{ min-height:120px }
  .line{ display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px dashed #eef1f3 }
  .line:last-child{ border-bottom:0 }
  .line small{ color:var(--muted) }

  /* Sticky payment bar */
  .paybar{
    position:fixed; left:0; right:0; bottom:0; z-index:10;
    background:rgba(246,248,247,.92); backdrop-filter:saturate(180%) blur(8px);
    border-top:1px solid #e5e7eb;
  }
  .paybar-inner{ max-width:1100px; margin:auto; padding:10px 12px; display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:center }
  @media (max-width:640px){ .paybar-inner{ grid-template-columns:1fr } }
  .total{ font-size:22px; font-weight:900 }
  .payBtns{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  @media (max-width:640px){ .payBtns{ grid-template-columns:1fr } }
  .cash{ background:#0a7d2b; color:#fff }
  .cardBtn{ background:#111; color:#fff }
  .back{ color:#0a7d2b; text-decoration:none; font-weight:700; display:inline-flex; align-items:center; gap:8px }
</style>
</head><body>
<div class="wrap">
  <div class="topbar">
    <h1 style="flex:1 1 auto">POS</h1>
    <a class="ghost" href="/pos">Close / Cash-out</a>
  </div>

  <div class="inputs">
    <input id="custName" placeholder="Customer name"/>
    <input id="custPhone" placeholder="Mobile (optional)"/>
    <input id="recallCode" placeholder="Recall code"/>
    <button id="btnRecall" class="btn ghost">Recall</button>
  </div>

  <div class="grid">
    <div class="card">
      <div class="tickets" id="tickets"></div>
    </div>
    <div class="card summary">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
        <strong>Total</strong>
        <strong id="totalTop">R0.00</strong>
      </div>
      <div id="cartLines" class="muted">Cart empty</div>
    </div>
  </div>
</div>

<!-- Sticky payment bar -->
<div class="paybar">
  <div class="paybar-inner">
    <div class="total" id="totalSticky">R0.00</div>
    <div class="payBtns">
      <button id="payCash" class="btn cash">Cash</button>
      <button id="payCard" class="btn cardBtn">Card</button>
    </div>
    <div style="grid-column:1 / -1">
      <a class="back" href="/pos">← Back to start</a>
      <span id="msg" class="muted" style="margin-left:12px"></span>
    </div>
  </div>
</div>

<script>
const sessionId = Number(${JSON.stringify(session_id)});
const $ = id => document.getElementById(id);

const state = {
  event: null,
  ttypes: [],
  cart: new Map(), // ticket_type_id -> qty
};

const money = c => 'R' + ((c||0)/100).toFixed(2);
const esc = s => String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));

function phoneNorm(raw){
  const s = String(raw||'').replace(/\\D+/g,'');
  if (s.length===10 && s.startsWith('0')) return '27'+s.slice(1);
  return s;
}

function renderTickets(){
  const box = $('tickets');
  box.innerHTML = state.ttypes.map(t => {
    const q = state.cart.get(t.id)||0;
    return \`
      <div class="tcard \${q?'hasQty':''}" data-id="\${t.id}">
        <div class="qtyBadge">\${q}</div>
        <div style="font-weight:800">\${esc(t.name)}</div>
        <div class="price">\${money(t.price_cents)}</div>
        <div class="muted" style="margin-top:2px"><small>Tap to add</small></div>
      </div>\`;
  }).join('');

  // tap-to-add
  box.querySelectorAll('.tcard').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = Number(el.dataset.id);
      const q = (state.cart.get(id)||0)+1;
      state.cart.set(id,q);
      updateCartUI();
      // micro feedback
      el.classList.add('hasQty');
      el.querySelector('.qtyBadge').textContent = q;
      navigator.vibrate?.(15);
    }, {passive:true});
    // long press to remove one
    let pressTimer;
    el.addEventListener('touchstart', () => {
      pressTimer = setTimeout(()=>{
        const id = Number(el.dataset.id);
        const q = Math.max(0,(state.cart.get(id)||0)-1);
        if (q) state.cart.set(id,q); else state.cart.delete(id);
        updateCartUI();
        const badge = el.querySelector('.qtyBadge');
        if (q){ el.classList.add('hasQty'); badge.textContent = q; }
        else{ el.classList.remove('hasQty'); }
        navigator.vibrate?.(10);
      }, 450);
    }, {passive:true});
    ['touchend','touchcancel','touchmove'].forEach(ev => el.addEventListener(ev, ()=>clearTimeout(pressTimer), {passive:true}));
  });
}

function updateCartUI(){
  const m = new Map(state.ttypes.map(t=>[t.id,t]));
  let total = 0;
  const lines = [];

  state.cart.forEach((qty, id)=>{
    const tt = m.get(id);
    if (!tt) return;
    const line = qty * (tt.price_cents||0);
    total += line;
    lines.push(\`<div class="line"><div>\${esc(tt.name)} <small>× \${qty}</small></div><strong>\${money(line)}</strong></div>\`);
  });

  $('cartLines').innerHTML = lines.length ? lines.join('') : 'Cart empty';
  $('totalTop').textContent = money(total);
  $('totalSticky').textContent = money(total);
}

async function loadEvent(){
  const res = await fetch('/api/public/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok || !(res.events||[]).length){
    $('msg').textContent = 'Kon nie event laai nie.';
    return;
  }
  const ev = res.events[0];
  state.event = ev;
  const d = await fetch('/api/public/events/'+encodeURIComponent(ev.slug)).then(r=>r.json());
  state.ttypes = (d.ticket_types||[]);
  renderTickets();
  updateCartUI();
}

async function makeSale(method){
  const name = String($('custName').value||'').trim();
  const phone = phoneNorm($('custPhone').value||'');
  const items = [];
  state.cart.forEach((qty,id)=>{ if (qty>0) items.push({ ticket_type_id:id, qty }); });

  if (!items.length){
    $('msg').textContent = 'Voeg minstens 1 kaartjie by.';
    return;
  }
  $('msg').textContent = 'Saving…';

  const payload = {
    event_id: state.event.id,
    items,
    attendees: [],           // POS quick sale: blank attendees (scanner can capture gender later)
    buyer_name: name || 'POS',
    email: '',
    phone: phone || '',
    method: (method==='cash' ? 'pos_cash' : 'pos_cash') // card machine also treated as cash in system
  };

  const r = await fetch('/api/public/orders/create', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify(payload)
  });
  const j = await r.json().catch(()=>({ok:false}));
  if (!j.ok){ $('msg').textContent = 'Kon nie bestelling skep nie.'; return; }

  // Mark paid immediately (POS cash/card-machine) and trigger WA sends server-side
  const code = j.order?.short_code;
  const settle = await fetch('/api/pos/settle', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ code, phone })
  }).then(x=>x.json()).catch(()=>({ok:false}));

  if (!settle.ok){
    $('msg').textContent = 'Order gestoor, maar kon nie afhandel nie.';
  } else {
    $('msg').textContent = 'Sale completed.';
    // reset cart
    state.cart.clear();
    renderTickets();
    updateCartUI();
    // tiny toast
    try{ navigator.vibrate?.([20,40,20]); }catch{}
  }
}

$('payCash').onclick = ()=>makeSale('cash');
$('payCard').onclick = ()=>makeSale('card');

$('btnRecall').onclick = async ()=>{
  const code = String($('recallCode').value||'').trim().toUpperCase();
  if (!code) return;
  const r = await fetch('/api/public/tickets/by-code/'+encodeURIComponent(code)).then(x=>x.json()).catch(()=>({ok:false}));
  if (!r.ok){ $('msg').textContent = 'Nie gevind nie.'; return; }
  $('msg').textContent = 'Order '+code+' het '+(r.tickets||[]).length+' kaartjies.';
};

loadEvent();
</script>
</body></html>`;
}
