// /src/ui/pos.js
export const posHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --bg:#f7f7f8; --muted:#667085; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:16px auto; padding:0 14px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 24px rgba(0,0,0,.08); padding:16px; margin-bottom:16px }
  h1,h2{ margin:0 0 12px }
  label{ display:block; font-size:14px; color:#222; margin:8px 0 6px }
  input,select{ width:100%; padding:12px; border:1px solid #e5e7eb; border-radius:10px; font-size:16px }
  .row{ display:flex; gap:10px; flex-wrap:wrap }
  .btn{ padding:12px 16px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .muted{ color:var(--muted) }
  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px }
  .pill{ border:1px solid #e5e7eb; border-radius:999px; padding:14px 16px; text-align:center; cursor:pointer; user-select:none }
  .pill:active{ transform:scale(.98) }
  .summary{ display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
  .sumtotal{ font-size:28px; font-weight:800 }
  .line{ display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #eee }
  .topbar{ display:flex; justify-content:space-between; align-items:center; }
  .danger{ background:#8b0000; color:#fff; border-color:transparent }
  .ok{ color:var(--green) } .err{ color:#b00020 }
  .tiny{ font-size:12px }
</style>
</head><body><div class="wrap">

  <div id="screen-start" class="card">
    <h1>Begin skof</h1>
    <div class="row">
      <label style="flex:2">Kassier Naam
        <input id="iCashier" placeholder="Jou naam"/>
      </label>
      <label style="flex:2">Ingang
        <select id="iGate"></select>
      </label>
      <label style="flex:1">Opening float (R)
        <input id="iFloat" type="number" step="0.01" placeholder="0.00"/>
      </label>
    </div>
    <div class="row">
      <button class="btn primary" id="btnStart">Begin</button>
      <span id="startMsg" class="muted"></span>
    </div>
  </div>

  <div id="screen-sell" style="display:none">
    <div class="card topbar">
      <div class="row" style="align-items:center">
        <button class="btn" id="btnEnd">End shift</button>
        <div class="muted tiny" id="who"></div>
      </div>
      <div class="row" style="align-items:center">
        <input id="code" placeholder="Recall order code (pickup code)"/>
        <button class="btn" id="btnRecall">Recall</button>
        <span id="recallMsg" class="muted tiny"></span>
      </div>
    </div>

    <div class="card">
      <div class="summary">
        <div>
          <h2 id="evName">Event</h2>
          <div class="muted tiny" id="evMeta"></div>
        </div>
        <div class="sumtotal" id="sum">R0.00</div>
      </div>
      <div id="cartLines" style="margin-top:6px"></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button class="btn" id="btnClear">Clear</button>
        <button class="btn primary" id="btnProcess">Process</button>
      </div>
    </div>

    <div class="card">
      <h2>Kaartjie tipes</h2>
      <p class="muted tiny">Tik die knoppies. Elke tik voeg 1 kaartjie by.</p>
      <div id="pills" class="grid"></div>
    </div>
  </div>

  <div id="screen-pay" class="card" style="display:none">
    <h2>Betaling</h2>
    <div class="row">
      <button class="btn" id="payCash">Kontant</button>
      <button class="btn" id="payCard">Kaart</button>
    </div>
    <div class="row" style="margin-top:12px">
      <label style="flex:2">Naam <input id="cName"/></label>
      <label style="flex:2">Selfoon <input id="cPhone"/></label>
    </div>
    <div class="row">
      <button class="btn primary" id="btnComplete">Voltooi</button>
      <button class="btn" id="btnBackSell">Terug</button>
      <span id="payMsg" class="muted"></span>
    </div>
  </div>

  <div id="screen-end" class="card" style="display:none">
    <h2>Beëindig skof</h2>
    <label>Bestuurder Naam <input id="mName" placeholder="Manager"/></label>
    <div class="row">
      <button class="btn danger" id="btnRealEnd">End shift</button>
      <button class="btn" id="btnCancelEnd">Cancel</button>
      <span id="endMsg" class="muted"></span>
    </div>
  </div>

</div>

<script>
const R = (c)=>'R'+((c||0)/100).toFixed(2);
let state = {
  session: null,
  event: null,
  ticketTypes: [],
  gateId: null,
  cart: new Map(), // ticket_type_id -> qty
  mode: 'new',     // 'new' or 'recall'
  recalledOrder: null
};

// Load gates & event & ticket types
async function boot(prefCashier, prefGate){
  const body = { cashier_name: prefCashier||'', gate_id: prefGate||null };
  const r = await fetch('/api/pos/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  const gateSel = document.getElementById('iGate');
  gateSel.innerHTML = (r.gates||[]).map(g=>'<option value="'+g.id+'">'+g.name+'</option>').join('');
  if (prefGate) gateSel.value = String(prefGate);

  state.event = r.event;
  state.ticketTypes = r.ticket_types||[];

  if (r.session){
    state.session = r.session;
    state.gateId = r.session.gate_id;
    document.getElementById('iCashier').value = r.session.cashier_name;
    gateSel.value = String(r.session.gate_id);
    gotoSell();
  }
}
boot();

function renderCart(){
  let total=0;
  const lines=[];
  for (const [id, qty] of state.cart.entries()){
    const tt = state.ticketTypes.find(t=>Number(t.id)===Number(id));
    const name = tt?tt.name:'Ticket';
    const pc = tt?Number(tt.price_cents)||0:0;
    const lt = pc*qty;
    total += lt;
    lines.push('<div class="line"><div>'+name+' × '+qty+'</div><div>'+R(lt)+'</div></div>');
  }
  document.getElementById('cartLines').innerHTML = lines.join('') || '<div class="muted tiny">Geen items nie.</div>';
  document.getElementById('sum').textContent = R(total);
}

function renderPills(){
  const p = document.getElementById('pills');
  p.innerHTML = state.ticketTypes.map(t=> '<div class="pill" data-id="'+t.id+'">'+t.name+'<br><span class="muted tiny">'+(t.price_cents?R(t.price_cents):'FREE')+'</span></div>').join('');
  p.querySelectorAll('.pill').forEach(el=>{
    el.onclick = ()=>{
      const id = Number(el.getAttribute('data-id'));
      state.mode = 'new';
      state.recalledOrder = null;
      state.cart.set(id, (state.cart.get(id)||0)+1);
      renderCart();
    };
  });
}

function gotoSell(){
  document.getElementById('screen-start').style.display='none';
  document.getElementById('screen-pay').style.display='none';
  document.getElementById('screen-end').style.display='none';
  document.getElementById('screen-sell').style.display='block';
  document.getElementById('who').textContent = 'Kassier: '+state.session.cashier_name+' · Ingang: '+document.getElementById('iGate').selectedOptions[0].textContent;
  document.getElementById('evName').textContent = state.event?state.event.name:'';
  document.getElementById('evMeta').textContent = state.event ? new Date(state.event.starts_at*1000).toLocaleDateString() : '';
  renderPills(); renderCart();
}

document.getElementById('btnStart').onclick = async ()=>{
  const cashier = document.getElementById('iCashier').value.trim();
  const gate_id = Number(document.getElementById('iGate').value||0);
  const opening = Number(document.getElementById('iFloat').value||0);
  const msg = document.getElementById('startMsg');
  if (!cashier || !gate_id){ msg.textContent='Vul naam en ingang in.'; return; }
  const r = await fetch('/api/pos/sessions/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cashier_name:cashier,gate_id,opening_float_rands:opening})}).then(r=>r.json());
  if (!r.ok){ msg.textContent = r.error||'Kon nie begin nie'; return; }
  state.session = { id:r.session_id, cashier_name:cashier, gate_id };
  state.gateId = gate_id;
  gotoSell();
};

document.getElementById('btnClear').onclick = ()=>{ state.cart.clear(); renderCart(); };

document.getElementById('btnProcess').onclick = ()=>{
  if (!state.cart.size && !state.recalledOrder){ alert('Geen items nie.'); return; }
  document.getElementById('screen-sell').style.display='none';
  document.getElementById('screen-pay').style.display='block';
};

document.getElementById('btnBackSell').onclick = ()=>{ document.getElementById('screen-pay').style.display='none'; document.getElementById('screen-sell').style.display='block'; };

let _payMethod = 'pos_cash';
document.getElementById('payCash').onclick = ()=>{ _payMethod='pos_cash'; };
document.getElementById('payCard').onclick = ()=>{ _payMethod='pos_card'; };

document.getElementById('btnComplete').onclick = async ()=>{
  const payMsg = document.getElementById('payMsg');
  payMsg.textContent = 'Besig…';

  // If we recalled an order: update items (if cart changed), then settle.
  if (state.recalledOrder) {
    const id = state.recalledOrder.order.id;
    // update items to match cart
    const items = Array.from(state.cart.entries()).map(([ticket_type_id, qty])=>({ticket_type_id, qty}));
    await fetch('/api/pos/orders/'+id+'/update-items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items})}).then(r=>r.json()).catch(()=>({ok:false}));
    const settle = await fetch('/api/pos/orders/'+id+'/settle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:_payMethod, session_id: state.session.id})}).then(r=>r.json());
    if (!settle.ok){ payMsg.textContent = settle.error||'Kon nie afhandel nie'; return; }
    payMsg.textContent='Klaar!'; state.cart.clear(); state.recalledOrder=null; gotoSell(); return;
  }

  // New walk-up order: create a "pay at event" order and immediately settle under the POS session
  // 1) create temporary order via public checkout pay_later
  const items = Array.from(state.cart.entries()).map(([ticket_type_id, qty])=>({ticket_type_id, qty}));
  if (!items.length){ payMsg.textContent='Geen items.'; return; }
  const create = await fetch('/api/public/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id: state.event.id, items, contact:{ name:document.getElementById('cName').value||'', phone:document.getElementById('cPhone').value||'' }, mode:'pay_later'})}).then(r=>r.json());
  if (!create.ok){ payMsg.textContent=create.error||'Kon nie order skep nie'; return; }

  // 2) settle it
  const settle = await fetch('/api/pos/orders/'+create.order_id+'/settle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:_payMethod, session_id: state.session.id})}).then(r=>r.json());
  if (!settle.ok){ payMsg.textContent = settle.error||'Kon nie afhandel nie'; return; }

  payMsg.textContent='Klaar!'; state.cart.clear(); gotoSell();
};

document.getElementById('btnRecall').onclick = async ()=>{
  const code = document.getElementById('code').value.trim();
  const m = document.getElementById('recallMsg');
  if (!code){ m.textContent='Voer kode in'; return; }
  m.textContent='…';
  const r = await fetch('/api/pos/orders/lookup/'+encodeURIComponent(code)).then(r=>r.json());
  if (!r.ok){ m.textContent=r.error||'Nie gevind nie'; return; }
  // move items into cart for editing
  state.cart.clear();
  for (const it of (r.items||[])) state.cart.set(Number(it.ticket_type_id), Number(it.qty)||0);
  state.recalledOrder = r;
  state.mode = 'recall';
  m.textContent = 'Bestelling gelaai';
  renderCart();
};

document.getElementById('btnEnd').onclick = ()=>{
  document.getElementById('screen-end').style.display='block';
  document.getElementById('screen-sell').style.display='none';
};

document.getElementById('btnCancelEnd').onclick = ()=>{
  document.getElementById('screen-end').style.display='none';
  document.getElementById('screen-sell').style.display='block';
};

document.getElementById('btnRealEnd').onclick = async ()=>{
  const m = document.getElementById('endMsg');
  const name = document.getElementById('mName').value.trim();
  m.textContent='…';
  const r = await fetch('/api/pos/sessions/'+state.session.id+'/end',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({manager_name:name})}).then(r=>r.json());
  if (!r.ok){ m.textContent = r.error||'Kon nie beëindig nie'; return; }
  m.textContent='Skof klaar.';
  // Return to start
  state.session=null; state.cart.clear();
  document.getElementById('screen-end').style.display='none';
  document.getElementById('screen-start').style.display='block';
};
</script>
</body></html>`;
