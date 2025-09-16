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
  .notice{ background:#fff3cd; border:1px solid #ffe69c; color:#7a5a00; padding:12px 14px; border-radius:10px; margin:0 0 12px 0; font-size:14px; line-height:1.35 }

  /* overlay spinner during redirect */
  .overlay{ position:fixed; inset:0; background:rgba(255,255,255,.8); display:none; align-items:center; justify-content:center; z-index:9999 }
  .overlay.show{ display:flex }
  .spinner{ width:34px; height:34px; border-radius:50%; border:3px solid #cbd5e1; border-top-color:#0a7d2b; animation:spin 1s linear infinite; margin-right:10px }
  @keyframes spin{ to{ transform:rotate(360deg) } }
</style>
</head><body>
<div class="wrap">
  <h1>Betaal en Voltooi</h1>
  <div id="status" class="muted" style="margin-bottom:10px"></div>
  <div class="grid">
    <div class="card">
      <div id="eventMeta" class="muted" style="margin-bottom:10px"></div>

      <!-- Notice -->
      <div class="notice">
        <strong>Let wel:</strong>
        Vul asb die besoekker(s) se inligting in sodat ons die toegangs kaartjie direk aan die besoeker kan stuur.
        Indien jy slegs jou inligting gee, gaan al die kaartjies na jou toe gestuur word.
      </div>

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
          <button id="submitBtn" class="btn">Gaan voort</button>
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

<!-- redirect overlay -->
<div id="overlay" class="overlay" aria-live="polite" aria-busy="true">
  <div class="spinner" aria-hidden="true"></div>
  <div>Skakel oor na betaalportaal…</div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
const $ = (id)=>document.getElementById(id);

function rands(cents){ return 'R' + ((cents||0)/100).toFixed(2); }
function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

// Normalize ZA phone -> 27XXXXXXXXX (drop leading 0)
function normPhone(raw){
  const s = String(raw||'').replace(/\\D+/g,'');
  if (s.startsWith('27')) return s;
  if (s.length===10 && s.startsWith('0')) return '27'+s.slice(1);
  return s;
}

let catalog = null;
let cart = null;

// ---------- Attendee UI -----------------------------------------------------
function buildAttendeeForms(){
  const wrap = $('attWrap');
  wrap.innerHTML = '';

  const seedPhone = normPhone($('buyer_phone').value);
  const seedName  = getBuyerFullName();

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
            <input class="att_name" data-tid="\${tt.id}" placeholder="Naam en Van" value="\${esc(seedName)}"/>
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
            <input class="att_phone" data-tid="\${tt.id}" type="tel" inputmode="tel" value="\${esc(seedPhone)}" />
          </div>
          <div></div>
        </div>\`;
      wrap.appendChild(block);
    }
  });

  // Mark attendee fields "manual" once edited so we don't overwrite later
  wrap.querySelectorAll('.att_name, .att_phone').forEach(el=>{
    el.addEventListener('input', ()=>{ el.dataset.manual = '1'; });
  });
}

// ---------- Summary ---------------------------------------------------------
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

// ---------- Collect/Validate ------------------------------------------------
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

      const nameParts = nm.split(/\\s+/);
      const first = nameParts.shift() || '';
      const last  = nameParts.join(' ') || '';

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

// ---------- Sync logic (buyer -> attendees) ---------------------------------
function getBuyerFullName(){
  const f = String($('buyer_first').value||'').trim();
  const l = String($('buyer_last').value||'').trim();
  return (f + ' ' + l).trim();
}

function syncAttendeeNamesFromBuyer(){
  const full = getBuyerFullName();
  if (!full) return;
  document.querySelectorAll('.att_name').forEach(n=>{
    if (!n.dataset.manual) n.value = full;
  });
}

function syncAttendeePhonesFromBuyer(){
  const norm = normPhone($('buyer_phone').value);
  // write back normalised value to buyer field (e.g., 071… -> 2771…)
  if (norm && norm !== $('buyer_phone').value) $('buyer_phone').value = norm;
  document.querySelectorAll('.att_phone').forEach(n=>{
    if (!n.dataset.manual) n.value = norm;
  });
}

function wireBuyerSync(){
  const bf = $('buyer_first');
  const bl = $('buyer_last');
  const bp = $('buyer_phone');

  if (bf) bf.addEventListener('input', syncAttendeeNamesFromBuyer);
  if (bl) bl.addEventListener('input', syncAttendeeNamesFromBuyer);

  if (bp){
    // live propagate as user types
    bp.addEventListener('input', ()=>{
      const val = $('buyer_phone').value;
      document.querySelectorAll('.att_phone').forEach(n=>{
        if (!n.dataset.manual) n.value = val;
      });
    });
    // normalize + sync on blur
    bp.addEventListener('blur', syncAttendeePhonesFromBuyer);
  }
}

// ---------- Overlay ---------------------------------------------------------
function setOverlay(on){
  const ov = $('overlay');
  if (!ov) return;
  if (on) ov.classList.add('show'); else ov.classList.remove('show');
}

// ---------- Submit ----------------------------------------------------------
async function submit(){
  showMsg('', '');
  const btn = $('submitBtn');
  const methodSel = $('pay_method').value;
  const { buyer, attendees } = collectPayload();
  const err = validateBuyer(buyer);
  if (err){ showMsg('err', err); return; }

  btn.disabled = true;

  try{
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

    if (methodSel === 'pay_now'){
      setOverlay(true);
      const y = await fetch('/api/payments/yoco/intent', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ code })
      }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));

      const link = y?.redirect_url || y?.url || '';
      if (!y.ok || !link){
        setOverlay(false);
        location.href = '/thanks/' + encodeURIComponent(code) + '?pay=err';
        return;
      }
      try{ sessionStorage.setItem('last_yoco', JSON.stringify({ code, url: link, ts: Date.now() })); }catch{}
      location.href = link;
      return;
    }

    location.href = '/thanks/' + encodeURIComponent(code);
  }catch(e){
    showMsg('err', e.message||'Fout');
    setOverlay(false);
    btn.disabled = false;
  }
}

// ---------- Load ------------------------------------------------------------
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
  wireBuyerSync();

  // Initial sync pass (if buyer fields already prefilled by the browser)
  syncAttendeeNamesFromBuyer();
  syncAttendeePhonesFromBuyer();

  $('submitBtn').onclick = submit;
}

load();
</script>
</body></html>`;
