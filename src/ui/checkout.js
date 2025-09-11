// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  h1{ margin:0 0 12px }
  .grid{ display:grid; grid-template-columns: 1.25fr .85fr; gap:16px; }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .muted{ color:var(--muted) }
  .row{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  @media (max-width:700px){ .row{ grid-template-columns:1fr; } }
  label{ display:block; font-size:13px; color:#444; margin:8px 0 6px }
  input, select{ width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:12px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; cursor:pointer; font-weight:600 }
  .btn.secondary{ background:#111 }
  .right{ text-align:right }
  .line{ display:flex; justify-content:space-between; align-items:center; margin:8px 0 }
  .total{ font-weight:800; font-size:20px }
  .att{ border:1px solid #eef0f2; border-radius:12px; padding:12px; margin:12px 0 }
  .att h3{ margin:0 0 8px; font-size:15px }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
  .err{ color:#b42318; font-weight:600; margin-top:8px }
  .hr{ height:1px; background:#f0f2f4; margin:12px 0 }
</style>
</head><body>
<div class="wrap">
  <h1>Betaal</h1>
  <div id="app" class="grid">
    <div class="card">Laai…</div>
    <div class="card">Laai…</div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};

function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
function rands(c){ return 'R' + ((c||0)/100).toFixed(2); }
function normPhoneZA(raw){
  let p = String(raw||'').replace(/\\D+/g,''); // keep digits
  if (p.startsWith('0') && p.length === 10) p = '27' + p.slice(1);
  if (p.startsWith('+27')) p = '27' + p.slice(3);
  return p;
}

async function load(){
  const cart = sessionStorage.getItem('pending_cart');
  let pending = null;
  try{ pending = cart ? JSON.parse(cart) : null; }catch{}
  if (!pending || !Array.isArray(pending.items) || !pending.items.length){
    document.getElementById('app').innerHTML = '<div class="card">Geen items in mandjie.</div>';
    return;
  }

  // Load event + ticket types by slug
  const evRes = await fetch('/api/public/events/' + encodeURIComponent(slug)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!evRes.ok){ document.getElementById('app').innerHTML = '<div class="card">Kon nie laai nie.</div>'; return; }

  const event = evRes.event || {};
  const types = new Map((evRes.ticket_types||[]).map(t=>[Number(t.id), t]));

  // Expand items → lines & total
  let total = 0;
  const expanded = [];
  for (const it of pending.items){
    const tid = Number(it.ticket_type_id||0);
    const qty = Number(it.qty||0);
    if (!tid || !qty) continue;
    const tt = types.get(tid);
    if (!tt) continue;
    const line = qty * (tt.price_cents||0);
    total += line;
    expanded.push({ tid, qty, name: tt.name, unit: tt.price_cents||0, requires_gender: !!Number(tt.requires_gender||0) });
  }

  // Left column: forms
  const leftEl = document.createElement('div');
  leftEl.className = 'card';
  leftEl.innerHTML = \`
    <h2 style="margin:0 0 6px">Koper Inligting</h2>
    <div class="row">
      <div>
        <label>Naam</label>
        <input id="buyerFirst" autocomplete="given-name" />
      </div>
      <div>
        <label>Van</label>
        <input id="buyerLast" autocomplete="family-name" />
      </div>
      <div>
        <label>E-pos</label>
        <input id="buyerEmail" type="email" autocomplete="email" />
      </div>
      <div>
        <label>Selfoon</label>
        <input id="buyerPhone" inputmode="tel" placeholder="27XXXXXXXXXX" />
      </div>
    </div>

    <div class="hr"></div>
    <h2 style="margin:10px 0 6px">Besoeker Inligting</h2>
    <div id="attWrap"></div>

    <div class="hr"></div>
    <h2 style="margin:10px 0 6px">Betaling</h2>
    <div class="row">
      <label style="display:flex;align-items:center;gap:8px"><input type="radio" name="pay" value="pay_now" /> Betaal nou (aanlyn)</label>
      <label style="display:flex;align-items:center;gap:8px"><input type="radio" name="pay" value="pay_at_event" checked /> Betaal by die skou (POS)</label>
    </div>
    <div class="muted" style="margin-top:8px">
      Jou kaartjies sal via WhatsApp en Epos eersdaags gestuur word sodra betaling ontvang was.
    </div>
    <div id="err" class="err"></div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="backBtn" class="btn secondary" type="button">← Terug</button>
      <button id="submitBtn" class="btn" type="button">Voltooi bestelling</button>
    </div>
  \`;

  // Build attendee blocks
  const attWrap = leftEl.querySelector('#attWrap');
  const buyerPhoneEl = leftEl.querySelector('#buyerPhone');

  function addAttBlock(idx, label, requiresGender, defaultPhone){
    const div = document.createElement('div');
    div.className = 'att';
    div.innerHTML = \`
      <h3>\${esc(label)}</h3>
      <div class="row">
        <div>
          <label>Naam</label>
          <input data-att="first" />
        </div>
        <div>
          <label>Van</label>
          <input data-att="last" />
        </div>
        <div>
          <label>Selfoon</label>
          <input data-att="phone" inputmode="tel" value="\${esc(defaultPhone||'')}" />
        </div>
        <div>
          <label>Geslag</label>
          <select data-att="gender">
            <option value="">— kies —</option>
            <option value="male">Manlik</option>
            <option value="female">Vroulik</option>
            <option value="other">Ander</option>
          </select>
        </div>
      </div>
    \`;
    // Tag the block for collection later
    div.dataset.idx = String(idx);
    attWrap.appendChild(div);
  }

  // Create one attendee row per ticket
  let idx = 0;
  expanded.forEach(line=>{
    for (let i=0;i<line.qty;i++){
      idx++;
      addAttBlock(idx, \`\${line.name} · Kaartjie #\${i+1}\`, line.requires_gender, '');
    }
  });

  // When buyer phone changes, prefill any empty attendee phones
  buyerPhoneEl.addEventListener('input', ()=>{
    const p = normPhoneZA(buyerPhoneEl.value);
    attWrap.querySelectorAll('input[data-att="phone"]').forEach(inp=>{
      if (!inp.value.trim()) inp.value = p;
    });
  });

  // Right column: summary
  const rightEl = document.createElement('div');
  rightEl.className = 'card';
  rightEl.innerHTML = \`
    <h2 style="margin:0 0 6px">Opsomming</h2>
    <div id="sumLines"></div>
    <div class="hr"></div>
    <div class="line"><div style="font-weight:700">Totaal</div><div class="total">\${rands(total)}</div></div>
    <div style="margin-top:8px"><span class="pill">\${esc(event.name||'Event')}</span></div>
  \`;
  const sum = rightEl.querySelector('#sumLines');
  sum.innerHTML = expanded.map(l => \`
    <div class="line"><div>\${esc(l.name)} × \${l.qty}</div><div>\${rands(l.unit*l.qty)}</div></div>
  \`).join('');

  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(leftEl);
  app.appendChild(rightEl);

  // Wire buttons
  leftEl.querySelector('#backBtn').onclick = ()=> {
    location.href = '/shop/' + encodeURIComponent(slug);
  };

  leftEl.querySelector('#submitBtn').onclick = async () => {
    const err = leftEl.querySelector('#err'); err.textContent = '';

    const first = leftEl.querySelector('#buyerFirst').value.trim();
    const last  = leftEl.querySelector('#buyerLast').value.trim();
    const email = leftEl.querySelector('#buyerEmail').value.trim();
    const phone = normPhoneZA(leftEl.querySelector('#buyerPhone').value);

    if (!first || !last){ err.textContent = 'Vul asseblief koper se naam en van in.'; return; }
    if (!phone || phone.length !== 11){ err.textContent = 'Voer asseblief ’n geldige selfoonnommer in (bv. 27XXXXXXXXXX).'; return; }

    const payVal = leftEl.querySelector('input[name="pay"]:checked')?.value || 'pay_at_event';

    // Collect attendees in FIFO per ticket_type
    const attendees = [];
    const blocks = Array.from(attWrap.querySelectorAll('.att'));
    let cursor = 0;
    expanded.forEach(line=>{
      for (let i=0;i<line.qty;i++){
        const b = blocks[cursor++];
        const a = {
          ticket_type_id: line.tid,
          attendee_first: b.querySelector('[data-att="first"]').value.trim(),
          attendee_last:  b.querySelector('[data-att="last"]').value.trim(),
          gender: (b.querySelector('[data-att="gender"]').value || '').toLowerCase() || null,
          phone: normPhoneZA(b.querySelector('[data-att="phone"]').value || phone) || null
        };
        attendees.push(a);
      }
    });

    const payload = {
      event_id: Number(event.id),
      items: pending.items,
      attendees,
      buyer_name: first + ' ' + last,
      email,
      phone,
      method: payVal
    };

    try{
      const res = await fetch('/api/public/orders/create', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await res.json().catch(()=>({ok:false,error:'bad json'}));
      if (!j.ok) throw new Error(j.error || 'Kon nie bestelling skep nie');
      // Clear cart, go to thank-you
      try{ sessionStorage.removeItem('pending_cart'); }catch{}
      const code = j?.order?.short_code || '';
      location.href = code ? ('/thanks/' + encodeURIComponent(code)) : ('/thanks/OK');
    }catch(e){
      err.textContent = 'Fout: ' + (e.message||'onbekend');
    }
  };
}

load();
</script>
</body></html>`;
