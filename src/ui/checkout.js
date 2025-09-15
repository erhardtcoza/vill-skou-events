// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  .grid{ display:grid; grid-template-columns:1.25fr .9fr; gap:16px; align-items:start }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 10px } h2{ margin:14px 0 10px } .muted{ color:var(--muted) }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:start }
  @media (max-width:680px){ .row{ grid-template-columns:1fr; } }
  label{ display:block; font-size:13px; color:#444; margin:10px 0 6px }
  input, select, textarea{ width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff; min-height:40px }
  .btn{ padding:12px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; font-weight:700; cursor:pointer }
  .btn.secondary{ background:#fff; color:#111; border:1px solid #e5e7eb }
  .att{ border:1px solid #eef0f2; border-radius:12px; padding:12px; margin:10px 0 }
  .att h3{ margin:0 0 8px; font-size:16px }
  .right h2{ margin-top:0 } .line{ display:flex; justify-content:space-between; margin:6px 0 }
  .total{ font-weight:800; font-size:18px }
  .err{ color:#b42318; margin-top:8px; font-weight:600 }
  .ok{ color:#0a7d2b; margin-top:8px; font-weight:600 }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
</style>
</head><body>
<div class="wrap">
  <h1>Betaal en Voltooi</h1>
  <div id="status" class="muted" style="margin-bottom:10px"></div>
  <div class="grid">
    <div class="card">
      <div id="eventMeta" class="muted" style="margin-bottom:10px"></div>

      <h2>Koper Inligting</h2>
      <div class="row">
        <div>
          <label>Naam</label>
          <input id="buyer_first" autocomplete="given-name" />
        </div>
        <div>
          <label>Van</label>
          <input id="buyer_last" autocomplete="family-name" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>E-pos</label>
          <input id="buyer_email" type="email" autocomplete="email" />
        </div>
        <div>
          <label>Selfoon</label>
          <input id="buyer_phone" type="tel" inputmode="tel" placeholder="2771… of 0…"/>
        </div>
      </div>

      <div id="attWrap"></div>

      <h2>Betaling</h2>
      <div class="row">
        <div>
          <label>Metode</label>
          <select id="pay_method">
            <option value="pay_now">Betaal nou (aanlyn)</option>
            <option value="pay_at_event">Betaal by hek</option>
          </select>
        </div>
        <div style="display:flex; align-items:flex-end; gap:8px">
          <button id="submitBtn" class="btn">Voltooi</button>
          <span id="msg" class="muted"></span>
        </div>
      </div>
    </div>

    <div class="card right">
      <h2>Jou Keuse</h2>
      <div id="cartList" class="muted">Geen items</div>
      <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center">
        <span style="font-weight:700">Totaal</span>
        <span id="total" class="total">R0.00</span>
      </div>
      <div style="margin-top:12px">
        <span id="statusPill" class="pill" style="display:none"></span>
      </div>
    </div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
const $ = (id)=>document.getElementById(id);

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

// Normalize ZA phone
function normPhone(raw){
  const s = String(raw||'').replace(/\\D+/g,'');
  if (s.length===10 && s.startsWith('0')) return '27'+s.slice(1);
  return s;
}

let catalog = null;
let cart = null;

function buildAttendeeForms(){
  const wrap = $('attWrap');
  wrap.innerHTML = '';
  const phoneSeed = normPhone($('buyer_phone').value);
  const ttypesById = new Map((catalog.ticket_types||[]).map(t=>[t.id, t]));
  let idx = 1;
  (cart.items||[]).forEach(it=>{
    const tt = ttypesById.get(it.ticket_type_id);
    if (!tt) return;
    for (let i=0;i<it.qty;i++){
      const block = document.createElement('div');
      block.className = 'att';
      block.innerHTML = \`
        <h3>Besoeker \${idx++} · <span class="muted">\${esc(tt.name)}</span></h3>
        <div class="row">
          <div>
            <label>Volle naam</label>
            <input class="att_name" data-tid="\${tt.id}" placeholder="Naam en Van"/>
          </div>
          <div>
            <label>Geslag</label>
            <select class="att_gender" data-tid="\${tt.id}">
              <option value="">—</option>
              <option value="male">Manlik</option>
              <option value="female">Vroulik</option>
              <option value="other">Ander</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div>
            <label>Selfoon (vir aflewering)</label>
            <input class="att_phone" data-tid="\${tt.id}" type="tel" inputmode="tel" value="\${esc(phoneSeed)}" />
          </div>
          <div></div>
        </div>\`;
      wrap.appendChild(block);
    }
  });

  wrap.addEventListener('focusin', (e)=>{
    if (e.target && e.target.classList.contains('att_phone')) {
      if (!e.target.value) e.target.value = normPhone($('buyer_phone').value);
    }
  });
}

function renderSummary(){
  const list = $('cartList');
  if (!cart || !(cart.items||[]).length){ list.textContent = 'Geen items'; $('total').textContent='R0.00'; return; }
  const ttypesById = new Map((catalog.ticket_types||[]).map(t=>[t.id, t]));
  let total = 0;
  list.innerHTML = (cart.items||[]).map(it=>{
    const tt = ttypesById.get(it.ticket_type_id)||{name:'', price_cents:0};
    const line = (tt.price_cents||0) * (it.qty||0);
    total += line;
    return \`<div class="line"><div>\${esc(tt.name)} × \${it.qty}</div><div>\${rands(line)}</div></div>\`;
  }).join('');
  $('total').textContent = rands(total);
}

function collectPayload(){
  const buyer = {
    first: String($('buyer_first').value||'').trim(),
    last:  String($('buyer_last').value||'').trim(),
    email: String($('buyer_email').value||'').trim(),
    phone: normPhone($('buyer_phone').value||'')
  };

  const attendees = [];
  const attNames = document.querySelectorAll('.att_name');
  const attPhones = document.querySelectorAll('.att_phone');
  const attGenders = document.querySelectorAll('.att_gender');

  let pointer = 0;
  (cart.items||[]).forEach(it=>{
    for (let i=0;i<it.qty;i++){
      const nm = String(attNames[pointer]?.value||'').trim();
      const ph = normPhone(attPhones[pointer]?.value||'');
      const gd = String(attGenders[pointer]?.value||'').trim() || null;

      const firstLast = nm.split(/\\s+/);
      const first = firstLast.shift() || '';
      const last  = firstLast.join(' ') || '';

      attendees.push({
        ticket_type_id: it.ticket_type_id,
        attendee_first: first,
        attendee_last: last,
        gender: gd,
        phone: ph
      });
      pointer++;
    }
  });

  return { buyer, attendees };
}

function validateBuyer(b){
  if (!b.first) return 'Vul asseblief jou naam in.';
  if (!b.last)  return 'Vul asseblief jou van in.';
  if (!b.phone) return 'Vul asseblief jou selfoon in.';
  return null;
}

function showMsg(kind, text){
  const el = $('msg');
  el.className = kind==='err' ? 'err' : 'ok';
  el.textContent = text;
}

async function submit(){
  showMsg('', '');
  const methodSel = $('pay_method').value; // 'pay_now' | 'pay_at_event'
  const { buyer, attendees } = collectPayload();
  const err = validateBuyer(buyer);
  if (err){ showMsg('err', err); return; }

  try{
    // 1) Create order
    const orderPayload = {
      event_id: cart.event_id,
      items: cart.items,
      attendees,
      buyer_name: (buyer.first + ' ' + buyer.last).trim(),
      email: buyer.email || '',
      phone: buyer.phone || '',
      method: methodSel
    };
    const r = await fetch('/api/public/orders/create', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(orderPayload)
    });
    const j = await r.json().catch(()=>({ok:false,error:'network'}));
    if (!j.ok) throw new Error(j.error||'Kon nie bestelling skep nie');

    const code = j.order?.short_code || 'THANKS';

    // 2) Pay now → request Yoco checkout and redirect to it
    if (methodSel === 'pay_now'){
      const y = await fetch('/api/payments/yoco/intent', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ code })
      }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));

      const link = y?.redirect_url || y?.url || '';
      if (!y.ok || !link){
        // fall back to thanks with hint to recover
        location.href = '/thanks/' + encodeURIComponent(code) + '?pay=err';
        return;
      }

      // Save so the Thanks page can recover (and open in a new tab)
      try{
        sessionStorage.setItem('last_yoco', JSON.stringify({ code, url: link, ts: Date.now() }));
      }catch{}

      location.href = link;   // ✅ Go to Yoco
      return;
    }

    // 3) Pay at event → go to thanks
    location.href = '/thanks/' + encodeURIComponent(code);
  }catch(e){
    showMsg('err', e.message||'Fout');
  }
}

function attachBuyerPhonePropagation(){
  let lastValue = normPhone($('buyer_phone').value);
  $('buyer_phone').addEventListener('input', ()=>{
    const v = normPhone($('buyer_phone').value);
    const nodes = document.querySelectorAll('.att_phone');
    nodes.forEach(n=>{
      if (!n.value || normPhone(n.value)===lastValue) n.value = v;
    });
    lastValue = v;
  });
}

async function load(){
  try{
    cart = JSON.parse(sessionStorage.getItem('pending_cart') || 'null');
  }catch{ cart = null; }
  if (!cart || !(cart.items||[]).length){
    $('status').textContent = 'Geen items in mandjie nie.';
    return;
  }

  const res = await fetch('/api/public/events/'+encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ $('status').textContent = 'Kon nie event laai nie.'; return; }
  catalog = res;
  catalog.event = catalog.event || {};
  catalog.ticket_types = catalog.ticket_types || [];
  catalog.event.ticket_types = catalog.ticket_types;

  $('eventMeta').textContent = (catalog.event?.name||'') + (catalog.event?.venue ? ' · '+catalog.event.venue : '');

  renderSummary();
  buildAttendeeForms();
  attachBuyerPhonePropagation();

  $('submitBtn').onclick = submit;
}

load();
</script>
</body></html>`;
