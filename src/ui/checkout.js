// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout · ${slug}</title>
<style>
  :root{ --skou-green:#0a7d2b; --grey-1:#f7f7f8; --grey-2:#eef0f2; --text:#222; --muted:#666; }
  *{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--grey-1);margin:0;color:var(--text)}
  .wrap{max-width:1100px;margin:24px auto;display:grid;grid-template-columns:1.3fr .8fr;gap:20px;padding:0 16px}
  .card{background:#fff;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.06);padding:18px}
  h2{margin-top:0}
  label{display:block;margin:8px 0 4px;color:#333}
  input,select{width:100%;padding:12px;border:1px solid var(--grey-2);border-radius:10px}
  .btn{display:inline-block;background:var(--skou-green);color:#fff;text-decoration:none;border:none;border-radius:10px;padding:12px 16px;cursor:pointer}
  .muted{color:var(--muted)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .attendee{border:1px dashed var(--grey-2);border-radius:10px;padding:12px;margin:8px 0}
  .sum-row{display:flex;justify-content:space-between;margin:8px 0}
  .total{font-size:20px;font-weight:700}
  .timer{background:#fff5cc;border:1px solid #ffe08a;color:#7a5b00;padding:8px 12px;border-radius:8px;display:inline-block;margin-bottom:10px}
  @media (max-width:900px){ .wrap{grid-template-columns:1fr} }
</style>
</head><body>
  <div class="wrap">
    <div class="card">
      <div class="timer">Time remaining: <b id="tleft">20:00</b></div>
      <h2>1. Jou Besonderhede</h2>
      <div class="grid2">
        <div><label>Naam</label><input id="bfirst"></div>
        <div><label>Van</label><input id="blast"></div>
      </div>
      <div class="grid2">
        <div><label>E-pos</label><input id="bemail"></div>
        <div><label>Selfoon nommer</label><input id="bphone"></div>
      </div>

      <h2 style="margin-top:18px">2. Attendee Inligting</h2>
      <div id="attendees"></div>

      <h2 style="margin-top:18px">3. Betaling</h2>
      <p class="muted">Kaarttransaksies word via Yoco verwerk. Jy sal op die volgende blad bevestig en jou kaartjies ontvang per e-pos.</p>
      <button id="pay" class="btn">Gaan voort</button>
      <pre id="out" class="muted" style="white-space:pre-wrap"></pre>
    </div>

    <aside class="card">
      <h3>Jou bestelling</h3>
      <div id="sum"></div>
      <div class="sum-row total"><span>Totaal</span><span id="tot">R0.00</span></div>
    </aside>
  </div>

<script>
const slug=${JSON.stringify(slug)};
const cart = JSON.parse(sessionStorage.getItem('skou_cart')||'null');
if (!cart || cart.slug!==slug){ location.href='/shop/'+slug; }

function fmtR(c){ return 'R'+(c/100).toFixed(2); }

function renderSummary(){
  const s=document.getElementById('sum'); s.innerHTML='';
  let total=0;
  cart.items.forEach(it=>{
    const row=document.createElement('div'); row.className='sum-row';
    const line=it.name + ' × ' + it.qty;
    const amt = fmtR(it.price_cents*it.qty);
    row.innerHTML = '<span>'+line+'</span><span>'+amt+'</span>';
    s.appendChild(row);
    total += it.price_cents*it.qty;
  });
  document.getElementById('tot').textContent = fmtR(total);
}

function renderAttendees(){
  const wrap=document.getElementById('attendees'); wrap.innerHTML='';
  cart.items.forEach(it=>{
    for (let i=0;i<it.qty;i++){
      const div=document.createElement('div'); div.className='attendee';
      div.innerHTML = \`
        <div class="grid2">
          <div><label>Naam</label><input class="fn"></div>
          <div><label>Van</label><input class="ln"></div>
        </div>
        <div class="grid2">
          <div><label>E-pos</label><input class="em"></div>
          <div><label>Selfoon</label><input class="ph"></div>
        </div>
        \${it.requires_gender ? '<div><label>Gender</label><select class="gn"><option value="">Kies…</option><option>male</option><option>female</option><option>other</option></select></div>' : ''}\`;
      wrap.appendChild(div);
    }
  });
}

function gatherAttendees(){
  return [...document.querySelectorAll('.attendee')].map(el=>({
    first: el.querySelector('.fn')?.value||'',
    last:  el.querySelector('.ln')?.value||'',
    email: el.querySelector('.em')?.value||'',
    phone: el.querySelector('.ph')?.value||'',
    gender: (el.querySelector('.gn')?.value||'') || null
  }));
}

document.getElementById('pay').onclick = async ()=>{
  const buyer = {
    name: (document.getElementById('bfirst').value||'') + ' ' + (document.getElementById('blast').value||''),
    email: document.getElementById('bemail').value||'',
    phone: document.getElementById('bphone').value||'',
  };
  const attendees = gatherAttendees();
  const body = { event_id: cart.event_id, items: cart.items.map(x=>({ticket_type_id:x.ticket_type_id, qty:x.qty})), buyer, attendees, payment_ref: "YOCO-REF-PLACEHOLDER" };
  const res = await fetch('/api/public/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  document.getElementById('out').textContent = JSON.stringify(res, null, 2);
  if (res.ok){
    // (Later) show “Tickets sent to email”. For now keep JSON visible for testing.
    sessionStorage.removeItem('skou_cart');
  }
};

// soft 20-minute timer
let end = (cart.ts||Date.now()) + 20*60*1000;
function tick(){
  const left = Math.max(0, end - Date.now());
  const m = Math.floor(left/60000), s = Math.floor((left%60000)/1000);
  document.getElementById('tleft').textContent = (''+m).padStart(2,'0')+':'+(''+s).padStart(2,'0');
  if (left>0) requestAnimationFrame(tick);
}
renderSummary(); renderAttendees(); tick();
</script>
</body></html>`;
