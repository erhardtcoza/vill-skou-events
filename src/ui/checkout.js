// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f5faf7; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:22px auto; padding:0 14px }
  h1{ font-size:44px; margin:0 0 18px }
  .grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:16px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .badge{ display:inline-block; background:#eaf6ee; color:#1a7a3a; padding:6px 10px; border-radius:999px; font-weight:700; font-size:14px }

  .form-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:12px }
  .form-grid .full{ grid-column: 1 / -1 }
  label{ display:block; font-size:13px; color:#374151; margin:8px 0 6px }
  input, select{ width:100%; padding:12px 14px; border:1px solid #e5e7eb; border-radius:12px; font-size:16px; background:#fff }
  .muted{ color:#667085 }
  .btn{ padding:12px 14px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:700 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn.ghost{ background:#2f2f2f; color:#fff; border-color:#2f2f2f; opacity:.75 }
  .actions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:8px }

  .summary-row{ display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #f1f3f5 }
  .summary-row:last-child{ border-bottom:0 }
  .total{ display:flex; justify-content:space-between; font-weight:800; font-size:20px; margin-top:12px }

  .att{ margin-top:14px; padding:12px; border:1px solid #eef2f7; border-radius:12px; background:#fafafa }
  .att h3{ margin:0 0 10px; font-size:16px }
  .att .two{ display:grid; grid-template-columns:1fr 170px; gap:10px }
  @media(max-width:560px){ .att .two{ grid-template-columns:1fr; } }

  .note{ margin-top:10px; color:#384454 }
</style>
</head><body>
<div class="wrap">
  <h1>Checkout</h1>
  <div id="app" class="card">Loading…</div>
</div>

<script>
const slug = ${JSON.stringify(slug)};

function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }
function esc(s){ return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

function normalizePhone(raw){
  let d = String(raw||'').replace(/\\D+/g,'');
  if (d.startsWith('27') && d.length===11) return d;
  if (d.startsWith('0') && d.length===10) return '27' + d.slice(1);
  if (d.startsWith('27') && d.length>11) d = d.slice(0,11);
  if (d.startsWith('0027')) d = '27' + d.slice(4);
  if (d.startsWith('+' )) { d = d.replace(/^\\+/, ''); if (d.startsWith('27')) return d; }
  return d;
}

function buildAttendeeBlocks(event, items, buyerPhone){
  // items: [{ticket_type_id, qty}]
  const tmap = new Map((event.ticket_types||[]).map(t=>[Number(t.id), t]));
  const blocks = [];
  items.forEach(it=>{
    const tt = tmap.get(Number(it.ticket_type_id));
    for (let i=0;i<it.qty;i++){
      const label = (tt ? tt.name : 'Ticket') + ' · #' + (i+1);
      blocks.push({ ticket_type_id: Number(it.ticket_type_id), label, first:'', last:'', gender:'', phone: buyerPhone });
    }
  });
  return blocks;
}

function render(state){
  const ev = state.event;
  const items = state.items;
  const tmap = new Map((ev.ticket_types||[]).map(t=>[Number(t.id), t]));

  const rightList = items.map(it=>{
    const tt = tmap.get(Number(it.ticket_type_id));
    const name = tt ? tt.name : 'Ticket';
    const price = (tt && tt.price_cents) ? (tt.price_cents * it.qty) : 0;
    return \`<div class="summary-row"><div>\${esc(name)}<div class="muted">× \${it.qty}</div></div><div>\${rands(price)}</div></div>\`;
  }).join('');

  const total = items.reduce((sum,it)=>{
    const tt = tmap.get(Number(it.ticket_type_id));
    return sum + ((tt && tt.price_cents) ? (tt.price_cents * it.qty) : 0);
  },0);

  const attHTML = state.attendees.map((a,idx)=>\`
    <div class="att">
      <h3>Besoeker \${idx+1}: <span class="muted">\${esc(a.label)}</span></h3>
      <div class="two">
        <div>
          <label>Naam & Van</label>
          <input data-att="\${idx}" data-k="name" placeholder="Naam en van" value="">
        </div>
        <div>
          <label>Geslag</label>
          <select data-att="\${idx}" data-k="gender">
            <option value="">Kies…</option>
            <option value="male">Manlik</option>
            <option value="female">Vroulik</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px">
        <label>Selfoon vir aflewering</label>
        <input data-att="\${idx}" data-k="phone" placeholder="bv. 2771…" value="\${esc(a.phone||'')}">
      </div>
    </div>\`).join('');

  document.getElementById('app').innerHTML = \`
    <div class="grid">
      <div class="card" style="padding:0">
        <div style="padding:16px 16px 0"><span class="badge">\${esc(ev.name||'')}}</span></div>
        <div style="padding:16px">
          <h3 style="margin:0 0 8px">Koper inligting</h3>
          <div class="form-grid">
            <div>
              <label>Naam</label>
              <input id="buyer_first" placeholder="Naam">
            </div>
            <div>
              <label>Van</label>
              <input id="buyer_last" placeholder="Van">
            </div>
            <div>
              <label>E-pos</label>
              <input id="buyer_email" placeholder="E-pos" type="email">
            </div>
            <div>
              <label>Selfoon</label>
              <input id="buyer_phone" placeholder="Selfoon (bv. 2771…)" inputmode="numeric">
            </div>
          </div>

          <div class="note">Jou kaartjies sal via WhatsApp en Epos eersdaags gestuur word sodra betaling ontvang was.</div>

          <div style="margin-top:14px">
            <h3 style="margin:0 0 6px">Besoeker inligting</h3>
            \${attHTML || '<div class="muted">Geen besoekers benodig nie.</div>'}
          </div>

          <div class="actions">
            <button class="btn primary" id="payNow">Pay now</button>
            <button class="btn ghost" id="payEvent">(Pay at event)</button>
          </div>
        </div>
      </div>

      <div class="card">
        \${rightList || '<div class="muted">Geen items in mandjie nie.</div>'}
        <div class="total"><div>Totaal</div><div>\${rands(total)}</div></div>
      </div>
    </div>
  \`;

  // Wire buyer phone normalization + copy into attendees when edited first time
  const buyerPhoneEl = document.getElementById('buyer_phone');
  buyerPhoneEl.addEventListener('blur', ()=>{
    const n = normalizePhone(buyerPhoneEl.value);
    buyerPhoneEl.value = n;
    // If attendee phones are empty, prefill
    document.querySelectorAll('input[data-k="phone"]').forEach((el)=>{
      if (!el.value) el.value = n;
    });
  });

  // Wire attendee inputs
  document.querySelectorAll('[data-att]').forEach(el=>{
    el.addEventListener('input', ()=>{
      const idx = Number(el.getAttribute('data-att'));
      const key = el.getAttribute('data-k');
      if (key === 'name'){
        const parts = String(el.value||'').trim().split(/\\s+/);
        state.attendees[idx].first = parts[0] || '';
        state.attendees[idx].last  = parts.slice(1).join(' ');
      } else if (key === 'gender'){
        state.attendees[idx].gender = el.value || '';
      } else if (key === 'phone'){
        state.attendees[idx].phone = el.value || '';
      }
    });
    if (el.getAttribute('data-k')==='phone'){
      el.addEventListener('blur', ()=>{
        el.value = normalizePhone(el.value);
        const idx = Number(el.getAttribute('data-att'));
        state.attendees[idx].phone = el.value;
      });
    }
  });

  // Submit handlers
  document.getElementById('payNow').onclick   = ()=> submitOrder(state,'pay_now');
  document.getElementById('payEvent').onclick = ()=> submitOrder(state,'pay_at_event');
}

async function submitOrder(state, method){
  const buyer_first = document.getElementById('buyer_first').value.trim();
  const buyer_last  = document.getElementById('buyer_last').value.trim();
  const buyer_name  = (buyer_first + ' ' + buyer_last).trim();
  const buyer_email = document.getElementById('buyer_email').value.trim();
  const buyer_phone = normalizePhone(document.getElementById('buyer_phone').value);

  if (!buyer_first || !buyer_last){ alert('Voer asseblief jou naam en van in.'); return; }
  if (!buyer_phone){ alert('Voer asseblief jou selfoon in.'); return; }

  // Build attendees payload
  const attendees = state.attendees.map(a=>({
    ticket_type_id: a.ticket_type_id,
    attendee_first: a.first || '',
    attendee_last:  a.last || '',
    gender: (a.gender||''),
    phone: normalizePhone(a.phone||'')
  }));

  const body = {
    event_id: state.event.id,
    items: state.items,
    attendees,
    buyer_name,
    email: buyer_email,
    phone: buyer_phone,
    method
  };

  try{
    const res = await fetch('/api/public/orders/create', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify(body)
    });
    const j = await res.json().catch(()=>({ok:false}));
    if (!j.ok) throw new Error(j.error || 'Failed to create order');

    // Success – clear cart and show code
    sessionStorage.removeItem('pending_cart');
    alert('Bestelling aangemaak: ' + j.order.short_code);
    // Optionally redirect to a confirmation or ticket lookup page:
    // location.href = '/t/' + encodeURIComponent(j.order.short_code);
  }catch(err){
    alert('Kon nie bestelling skep nie: ' + err.message);
  }
}

async function load(){
  const cartRaw = sessionStorage.getItem('pending_cart');
  let cart = null;
  try{ cart = JSON.parse(cartRaw||'null'); }catch{ cart = null; }
  if (!cart || !Array.isArray(cart.items) || !cart.items.length){
    document.getElementById('app').innerHTML = '<div class="muted">Geen items in mandjie nie.</div>';
    return;
  }

  // Load event (to resolve ticket names & prices)
  const evRes = await fetch('/api/public/events/'+encodeURIComponent(${JSON.stringify(slug)})).then(r=>r.json()).catch(()=>({ok:false}));
  if (!evRes.ok){ document.getElementById('app').innerHTML = '<div class="muted">Kon nie event laai nie.</div>'; return; }

  // Attach ticket types onto event for quick mapping
  evRes.event = evRes.event || {};
  evRes.event.ticket_types = evRes.ticket_types || [];

  // Build attendees array
  const firstBuyerPhone = '';
  const attendees = buildAttendeeBlocks(evRes.event, cart.items, firstBuyerPhone);

  const state = {
    event: evRes.event,
    items: cart.items.map(x=>({ ticket_type_id:Number(x.ticket_type_id), qty:Number(x.qty) })),
    attendees
  };

  render(state);
}

load();
</script>
</body></html>`;
