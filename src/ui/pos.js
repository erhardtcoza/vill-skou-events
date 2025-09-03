// /src/ui/pos.js
export const posHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{--bg:#f6f7f8;--card:#fff;--line:#e5e7eb;--muted:#6b7280;--brand:#0a7d2b}
  html,body{margin:0;background:var(--bg);font:15px/1.45 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1000px;margin:20px auto;padding:0 16px}
  h1{margin:0 0 12px}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  input,button,select{padding:10px;border:1px solid #d1d5db;border-radius:10px}
  button.primary{background:var(--brand);border-color:var(--brand);color:#fff;cursor:pointer}
  .muted{color:var(--muted)}
  .panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin:10px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:800px){ .grid{grid-template-columns:1fr} }
  /* modal */
  dialog{border:0;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
  dialog::backdrop{background:rgba(0,0,0,.45)}
</style>
</head><body><div class="wrap">
  <h1>POS</h1>

  <!-- Bootstrap -->
  <section id="bootstrap" class="panel">
    <h3 style="margin-top:0">Start shift</h3>
    <div class="grid">
      <input id="cs_name" placeholder="Cashier name"/>
      <input id="cs_gate" placeholder="Entrance / gate"/>
      <input id="cs_float" type="number" step="0.01" placeholder="Opening float (R)"/>
      <div class="row">
        <button id="startBtn" class="primary">Start</button>
        <span id="bootMsg" class="muted"></span>
      </div>
    </div>
  </section>

  <!-- Main POS (hidden until bootstrap complete) -->
  <section id="pos" class="panel" style="display:none">
    <div class="row" style="justify-content:space-between;align-items:center">
      <div class="muted" id="shiftMeta">–</div>
      <div class="row">
        <button id="btnRecall">Recall order</button>
        <button id="btnEnd" class="primary" style="background:#374151;border-color:#374151">End shift</button>
      </div>
    </div>

    <div class="panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <div class="muted">Total</div>
          <div style="font-size:34px;font-weight:700" id="totalTxt">R0.00</div>
        </div>
        <div class="row">
          <select id="payMethod">
            <option value="">Select payment</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
          </select>
          <input id="custName" placeholder="Customer name"/>
          <input id="custPhone" placeholder="Phone (WhatsApp)"/>
          <button id="btnProcess" class="primary">Finish order</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3 style="margin-top:0">Tickets</h3>
      <div id="buttons" class="row"></div>
      <div id="msg" class="muted" style="margin-top:8px"></div>
    </div>
  </section>
</div>

<!-- Recall modal (hidden by default) -->
<dialog id="recallDlg">
  <form method="dialog" style="min-width:320px">
    <h3 style="margin:0 0 10px">Recall Order</h3>
    <p class="muted" style="margin:0 0 8px">Enter order code for “Pay at event”.</p>
    <input id="recallCode" placeholder="Order code e.g. ABC123" autofocus/>
    <div class="row" style="margin-top:10px;justify-content:flex-end">
      <button value="close">Close</button>
      <button id="recallGo" class="primary" value="default">Lookup</button>
    </div>
    <div id="recallMsg" class="muted" style="margin-top:8px"></div>
  </form>
</dialog>

<script>
  // state
  let shift = null;
  let cart = {}; // { ticket_type_id: qty }
  let prices = {}; // { ticket_type_id: cents }

  const $ = id => document.getElementById(id);
  const fmtR = c => 'R' + (Math.round(c)/100).toFixed(2);

  // ---- bootstrap
  $('startBtn').onclick = async () => {
    const name = $('cs_name').value.trim();
    const gate = $('cs_gate').value.trim();
    const opening = Math.round(parseFloat($('cs_float').value||'0')*100);
    if (!name || !gate) { $('bootMsg').textContent = 'Enter cashier and gate.'; return; }
    $('bootMsg').textContent = '';
    const j = await fetch('/api/pos/bootstrap', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ cashier_name:name, gate_name:gate, opening_float_cents:opening })
    }).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));
    if(!j.ok){ $('bootMsg').textContent = j.error||'Failed'; return; }
    shift = j.shift;
    $('shiftMeta').textContent = name+' · '+gate+' · opened '+new Date(shift.opened_at*1000).toLocaleString();
    $('bootstrap').style.display='none';
    $('pos').style.display='block';
    await loadButtons();
  };

  // ---- ticket buttons
  async function loadButtons(){
    const ev = await fetch('/api/pos/catalog').then(r=>r.json()).catch(()=>({ok:false}));
    if(!ev.ok){ $('msg').textContent = ev.error||'Failed to load catalog'; return; }
    const types = ev.ticket_types||[];
    const btns = types.map(t=>{
      prices[t.id] = t.price_cents||0;
      return \`<button data-id="\${t.id}" class="tBtn">\${t.name}</button>\`;
    }).join('');
    $('buttons').innerHTML = btns || '<span class="muted">No ticket types.</span>';
    document.querySelectorAll('.tBtn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = Number(b.dataset.id);
        cart[id] = (cart[id]||0)+1;
        renderTotals();
      });
    });
  }

  function cartTotal(){
    let c=0; Object.entries(cart).forEach(([id,qty])=>{ c += (prices[id]||0)*qty; });
    return c;
  }
  function renderTotals(){
    $('totalTxt').textContent = fmtR(cartTotal());
  }

  // ---- recall (OPEN ONLY WHEN BUTTON CLICKED)
  const dlg = $('recallDlg');
  $('btnRecall').onclick = () => { $('recallMsg').textContent=''; $('recallCode').value=''; dlg.showModal(); };
  $('recallGo').onclick = async (e)=>{
    e.preventDefault();
    const code = $('recallCode').value.trim();
    if(!code){ $('recallMsg').textContent='Enter a code.'; return; }
    const j = await fetch('/api/pos/recall/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));
    if(!j.ok){ $('recallMsg').textContent = j.error||'Not found'; return; }
    cart = {};
    (j.items||[]).forEach(it=>{ cart[it.ticket_type_id]=it.qty; prices[it.ticket_type_id]=it.price_cents||0; });
    renderTotals();
    dlg.close();
    $('msg').textContent = 'Loaded order '+code+'. You can adjust items and finish with cash/card.';
  };

  // ---- process
  $('btnProcess').onclick = async ()=>{
    const method = $('payMethod').value;
    if(!method){ $('msg').textContent='Select payment method.'; return; }
    const items = Object.entries(cart).map(([id,qty])=>({ticket_type_id:Number(id), qty:Number(qty)})).filter(it=>it.qty>0);
    if(!items.length){ $('msg').textContent='Add at least one ticket.'; return; }

    const j = await fetch('/api/pos/sale', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({
        payment_method: method,
        customer_name: $('custName').value.trim(),
        customer_phone: $('custPhone').value.trim(),
        items
      })
    }).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));

    if(!j.ok){ $('msg').textContent=j.error||'Failed'; return; }
    cart={}; renderTotals();
    $('payMethod').value=''; $('custName').value=''; $('custPhone').value='';
    $('msg').textContent='Order #'+j.order_id+' completed.';
  };

  // ---- end shift
  $('btnEnd').onclick = async ()=>{
    if(!shift){ return; }
    const j = await fetch('/api/pos/close-shift', {method:'POST'}).then(r=>r.json()).catch(()=>({ok:false}));
    if(j.ok){
      $('pos').style.display='none'; $('bootstrap').style.display='block';
      $('cs_name').value=''; $('cs_gate').value=''; $('cs_float').value='';
      shift=null; cart={}; renderTotals(); $('msg').textContent='';
    }else{
      alert(j.error||'Failed to close');
    }
  };

  // IMPORTANT: we do NOT open the recall dialog on page load.
  // If you want a debug shortcut, you can add ?recall=CODE in URL:
  try{
    const q = new URLSearchParams(location.search);
    const debug = q.get('recall');
    if(debug){ $('recallCode').value = debug; dlg.showModal(); }
  }catch{}
</script>
</body></html>`;
