// /src/ui/pos.js
export function posHTML() { return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --danger:#b42318; --ink:#111 }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink) }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 12px }
  h2{ margin:0 0 10px }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; cursor:pointer; font-weight:600 }
  .btn.ghost{ background:#fff; color:var(--ink); border:1px solid #e5e7eb }
  .btn.warn{ background:var(--danger) }
  .muted{ color:var(--muted) }
  .error{ color:var(--danger); font-weight:600 }
  .grid{ display:grid; grid-template-columns:1fr 360px; gap:16px; }
  @media (max-width:1000px){ .grid{ grid-template-columns:1fr; } }
  .pill{ display:inline-block; padding:4px 8px; font-size:12px; border-radius:999px; border:1px solid #e5e7eb; }
  .kbd{ font-family:ui-monospace, SFMono-Regular, Menlo, monospace; background:#f2f4f7; padding:2px 6px; border-radius:6px; border:1px solid #e5e7eb }
  .rack{ display:flex; flex-wrap:wrap; gap:8px }
  .ticket-pill{ padding:14px 16px; border:1px solid #e5e7eb; border-radius:12px; background:#fff; cursor:pointer; min-width:160px; text-align:left }
  .ticket-pill:hover{ border-color:#d1d5db }
  .amount{ font-weight:700; }
  .totalBox{ font-size:22px; font-weight:800; }
  .toolbar{ display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:10px }
  .spacer{ flex:1 }
  .line{ display:flex; justify-content:space-between; align-items:center; margin:8px 0 }
  .qtybtn{ width:32px; height:32px; border-radius:8px; border:1px solid #e5e7eb; background:#fff; font-weight:700; }
  .toast{ position:fixed; left:50%; transform:translateX(-50%); bottom:18px; background:#0a7d2b; color:#fff; padding:10px 14px; border-radius:10px; box-shadow:0 8px 18px rgba(0,0,0,.18); display:none; }
</style>
</head><body>
<div class="wrap" id="app">Loading…</div>
<div class="toast" id="toast">WhatsApp gestuur ✅</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (rands)=> Math.max(0, Math.round(Number(rands||0) * 100));
const fmtR = (c)=> 'R' + ( (c||0)/100 ).toFixed(2);

function save(k,v){ sessionStorage.setItem(k, JSON.stringify(v)); }
function load(k){ try{ return JSON.parse(sessionStorage.getItem(k)||'null'); }catch{ return null; } }
function clearShift(){ ['pos_session','pos_event','pos_gate','pos_cashier_phone'].forEach(k=>sessionStorage.removeItem(k)); }

async function bootstrap(){
  const r = await fetch('/api/pos/bootstrap');
  const j = await r.json();
  if (!j.ok) throw new Error(j.error||'bootstrap failed');
  return j;
}

function screenStart(data){
  const { events, gates } = data;
  const savedEvent = load('pos_event');
  const savedGate  = load('pos_gate');
  const savedPhone = load('pos_cashier_phone') || '';

  $('app').innerHTML = \`
    <h1>POS</h1>
    <div class="card">
      <h2>Start shift</h2>
      <div class="row" style="margin-bottom:10px">
        <input id="cashier" placeholder="Cashier name" style="min-width:220px"/>
        <select id="event" style="min-width:280px">\${events.map(e=>\`<option value="\${e.id}" data-slug="\${e.slug}">\${e.name} (\${e.slug})</option>\`).join('')}</select>
        <select id="gate" style="min-width:180px">\${gates.map(g=>\`<option value="\${g.id}">\${g.name}</option>\`).join('')}</select>
      </div>
      <div class="row">
        <div>
          <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
          <input id="float" type="number" min="0" step="1" value="0" style="width:120px"/>
        </div>
        <div>
          <div class="muted" style="margin-bottom:4px">Cashier phone (optional)</div>
          <input id="cphone" type="tel" placeholder="+27…" value="\${savedPhone||''}" style="width:180px"/>
        </div>
        <button id="startBtn" class="btn">Start</button>
        <div id="err" class="error"></div>
      </div>
    </div>\`;

  if (savedEvent) $('event').value = String(savedEvent.id);
  if (savedGate)  $('gate').value  = String(savedGate.id);

  $('startBtn').onclick = async ()=>{
    $('err').textContent = '';
    const cashier_name = ($('cashier').value||'').trim();
    const eventSel = $('event');
    const event_id = Number(eventSel.value||0);
    const event_slug = eventSel.options[eventSel.selectedIndex]?.dataset?.slug || '';
    const gate_id = Number(($('gate').value||0));
    const opening_float_cents = cents($('float').value);
    const cashier_phone = ($('cphone').value||'').trim();

    if (!cashier_name) return $('err').textContent = 'cashier name required';
    if (!event_id) return $('err').textContent = 'event required';
    if (!gate_id) return $('err').textContent = 'gate required';

    try{
      const r = await fetch('/api/pos/session/open', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents, cashier_phone })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'failed');
      save('pos_session', { id: j.session_id, event_id, gate_id });
      save('pos_event',   { id: event_id, slug: event_slug });
      save('pos_gate',    { id: gate_id });
      save('pos_cashier_phone', cashier_phone || '');
      // proceed to sell screen
      await goSell();
    }catch(e){
      $('err').textContent = 'Error: ' + (e.message||'unknown');
    }
  };
}

async function loadTicketTypesForEventSlug(slug){
  const r = await fetch('/api/public/events/'+encodeURIComponent(slug));
  const j = await r.json();
  if (!j.ok) throw new Error(j.error||'catalog failed');
  return (j.ticket_types||[]).map(t=>({ id:t.id, name:t.name, price_cents: t.price_cents||0 }));
}

function screenSell(model){
  const { event, gate, ttypes } = model;

  $('app').innerHTML = \`
    <div class="toolbar">
      <div style="display:flex; gap:8px; align-items:center">
        <div class="pill">\${new Date().toLocaleString()}</div>
        <div class="pill">Event: <span class="kbd" style="margin-left:6px">\${event.slug}</span></div>
        <div class="pill">Gate: <span class="kbd" style="margin-left:6px">\${gate.id}</span></div>
      </div>
      <div class="spacer"></div>
      <button id="btnRecall" class="btn ghost">Recall order</button>
      <button id="btnCashout" class="btn warn">Cash-out</button>
    </div>

    <div class="grid">
      <div class="card">
        <div class="totalBox">Totaal: <span id="grand">R0.00</span></div>
        <h2 style="margin-top:12px">Kaartjies</h2>
        <div class="rack" id="rack">
          \${ttypes.map(t=>\`
            <button class="ticket-pill" data-tid="\${t.id}">
              <div style="font-weight:700">\${escapeHtml(t.name)}</div>
              <div class="muted">\${t.price_cents ? fmtR(t.price_cents) : 'FREE'}</div>
            </button>\`).join('')}
        </div>
      </div>

      <div class="card">
        <h2>Jou mandjie</h2>
        <div id="lines" class="muted">Geen kaartjies gekies</div>
        <div class="row" style="margin-top:12px">
          <label style="flex:1">
            <div class="muted" style="margin-bottom:4px">Naam</div>
            <input id="buyerName" placeholder="Koper naam" style="width:100%"/>
          </label>
          <label style="flex:1">
            <div class="muted" style="margin-bottom:4px">Selfoon</div>
            <input id="buyerPhone" type="tel" placeholder="+27…" style="width:100%"/>
          </label>
        </div>
        <div style="margin-top:10px">
          <label style="margin-right:14px;"><input type="radio" name="pm" value="cash"> Kontant</label>
          <label><input type="radio" name="pm" value="card"> Kaart</label>
        </div>
        <div id="err" class="error" style="margin-top:6px"></div>
        <div style="margin-top:12px; display:flex; gap:10px">
          <button id="btnFinish" class="btn" disabled>Voltooi verkoop</button>
          <button id="btnClear"  class="btn ghost">Clear</button>
        </div>
      </div>
    </div>\`;

  const cart = new Map(); // ticket_type_id -> qty

  function renderCart(){
    const container = $('lines');
    const arr = Array.from(cart.entries());
    if (!arr.length){ container.classList.add('muted'); container.innerHTML = 'Geen kaartjies gekies'; }
    else {
      container.classList.remove('muted');
      container.innerHTML = arr.map(([tid,qty])=>{
        const tt = ttypes.find(x=>x.id===tid) || {name:'',price_cents:0};
        const line = (tt.price_cents||0)*qty;
        return \`<div class="line">
          <div>\${escapeHtml(tt.name)} × \${qty}</div>
          <div style="display:flex; align-items:center; gap:6px">
            <button class="qtybtn" data-dec="\${tid}">−</button>
            <span class="kbd">\${qty}</span>
            <button class="qtybtn" data-inc="\${tid}">+</button>
            <div style="width:80px; text-align:right">\${tt.price_cents ? fmtR(line) : 'FREE'}</div>
          </div>
        </div>\`;
      }).join('');
    }

    // total + buttons
    let total = 0;
    arr.forEach(([tid,qty])=>{
      const tt = ttypes.find(x=>x.id===tid) || {price_cents:0};
      total += (tt.price_cents||0)*qty;
    });
    $('grand').textContent = fmtR(total);

    // enable finish only when we have items
    $('btnFinish').disabled = arr.length === 0;

    // bind qty buttons
    document.querySelectorAll('[data-inc]').forEach(b=>{
      b.onclick = ()=> { const id=Number(b.dataset.inc); cart.set(id,(cart.get(id)||0)+1); renderCart(); };
    });
    document.querySelectorAll('[data-dec]').forEach(b=>{
      b.onclick = ()=> {
        const id=Number(b.dataset.dec);
        const n=(cart.get(id)||0)-1;
        if (n<=0) cart.delete(id); else cart.set(id,n);
        renderCart();
      };
    });
  }

  // quick taps
  document.querySelectorAll('[data-tid]').forEach(btn=>{
    btn.onclick = ()=>{ const id=Number(btn.dataset.tid); cart.set(id,(cart.get(id)||0)+1); renderCart(); };
  });

  $('btnClear').onclick = ()=>{ cart.clear(); renderCart(); };

  $('btnFinish').onclick = async ()=>{
    $('err').textContent = '';
    const pm = document.querySelector('input[name="pm"]:checked')?.value || '';
    if (!pm) { $('err').textContent = 'Kies kontant of kaart'; return; }

    const items = Array.from(cart.entries()).map(([ticket_type_id, qty])=>({ ticket_type_id, qty }));
    if (!items.length) { $('err').textContent = 'Geen kaartjies gekies'; return; }

    const sess  = load('pos_session') || {};
    const cph   = load('pos_cashier_phone') || '';
    const body  = {
      session_id: sess.id,
      event_id: event.id,
      gate_id: gate.id,
      items,
      payment_method: pm,
      buyer_name: ($('buyerName').value||'').trim(),
      buyer_phone: ($('buyerPhone').value||'').trim(),
      cashier_phone: cph || ''
    };

    try{
      const r = await fetch('/api/pos/order/sale', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'verkoop het misluk');

      // Success: clear cart, toast WA sent (server sends best-effort)
      cart.clear(); renderCart();
      toast('Verkoop voltooi. Kaartjies gestuur via WhatsApp ✅');
    }catch(e){
      $('err').textContent = 'Fout: ' + (e.message||'unknown');
    }
  };

  $('btnRecall').onclick = async ()=>{
    const code = prompt('Order nommer (bv. 3VLNT5)');
    if (!code) return;
    try{
      const r = await fetch('/api/pos/order/lookup/'+encodeURIComponent(code.trim()));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'not found');

      cart.clear();
      (j.order.items||[]).forEach(row=>{
        const tid = Number(row.id || row.ticket_type_id);
        const qty = Number(row.qty||0);
        if (tid && qty>0) cart.set(tid, qty);
      });
      renderCart();
    }catch(e){
      alert('Kon nie bestelling laai: ' + (e.message||'unknown'));
    }
  };

  $('btnCashout').onclick = async ()=>{
    const sess = load('pos_session');
    if (!sess?.id) return alert('Geen sessie');
    const mgr = prompt('Bestuurder naam vir cash-up?')||'';
    try{
      const r = await fetch('/api/pos/session/close', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ session_id: sess.id, closing_manager: mgr })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'close failed');
      clearShift();
      alert('Sessie afgesluit.');
      location.reload();
    }catch(e){
      alert('Kon nie afsluit: ' + (e.message||'unknown'));
    }
  };

  renderCart();
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function toast(msg){
  const t = $('toast');
  t.textContent = msg || 'Gedoen';
  t.style.display = 'block';
  setTimeout(()=>{ t.style.display = 'none'; }, 2500);
}

async function goSell(){
  const sess = load('pos_session'); if (!sess?.id) return;
  const event = load('pos_event');  if (!event?.slug) return;
  const gate  = load('pos_gate');   if (!gate?.id) return;
  const ttypes = await loadTicketTypesForEventSlug(event.slug);
  screenSell({ event, gate, ttypes });
}

(async function init(){
  try{
    const data = await bootstrap();
    const sess = load('pos_session');
    if (sess?.id) { await goSell(); } else { screenStart(data); }
  }catch(e){
    $('app').innerHTML = '<div class="card"><div class="error">Kon nie laai nie: '+(e.message||'network')+'</div></div>';
  }
})();
</script>
</body></html>`; }
