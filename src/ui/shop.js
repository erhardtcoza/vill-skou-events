// /src/ui/shop.js
export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${slug} · Villiersdorp Skou</title>
<style>
  :root{
    --skou-green:#0a7d2b; --skou-yellow:#ffd900; --grey-1:#f7f7f8; --grey-2:#eef0f2; --text:#222; --muted:#666;
  }
  *{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--grey-1);margin:0;color:var(--text)}
  .hero{background:linear-gradient(90deg,var(--skou-green),var(--skou-yellow));color:#fff;padding:28px 16px}
  .hero .wrap{max-width:1100px;margin:0 auto;display:flex;gap:24px;align-items:center}
  .poster{width:220px;height:140px;background:#ffffff22;border-radius:12px;display:flex;align-items:center;justify-content:center}
  .meta h1{margin:0 0 6px;font-size:28px}
  .meta small{opacity:.9}
  .page{max-width:1100px;margin:18px auto;padding:0 16px;display:grid;grid-template-columns:1.5fr .9fr;gap:20px}
  .card{background:#fff;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.06);padding:18px}
  .ticket{display:grid;grid-template-columns:1fr 120px 120px;gap:10px;align-items:center;border-bottom:1px solid var(--grey-2);padding:12px 0}
  .ticket:last-child{border-bottom:none}
  .name{font-weight:600}
  .price{font-variant-numeric:tabular-nums;color:#000}
  .qty{display:flex;align-items:center;gap:6px;justify-content:flex-end}
  .qty button{width:32px;height:32px;border:none;border-radius:8px;background:var(--grey-2);cursor:pointer}
  .qty input{width:56px;text-align:center;padding:8px;border:1px solid var(--grey-2);border-radius:8px}
  .summary .row{display:flex;justify-content:space-between;margin:8px 0}
  .summary .total{font-size:20px;font-weight:700}
  .btn{display:inline-block;background:var(--skou-green);color:#fff;text-decoration:none;border:none;border-radius:10px;padding:12px 16px;cursor:pointer}
  .btn[disabled]{opacity:.4;cursor:not-allowed}
  .sticky{position:sticky;top:16px}
  .muted{color:var(--muted);font-size:14px}
  @media (max-width:900px){ .page{grid-template-columns:1fr} .poster{display:none} }
</style>
</head><body>
  <div class="hero">
    <div class="wrap">
      <div class="poster" id="poster">Villiersdorp Skou</div>
      <div class="meta">
        <h1 id="ev-name">Loading…</h1>
        <small id="ev-when"></small><br/>
        <small id="ev-venue"></small>
      </div>
    </div>
  </div>

  <div class="page">
    <div class="card">
      <h2 style="margin-top:0">Kaartjies</h2>
      <div id="tickets"></div>
      <p class="muted">Kies hoeveel kaartjies jy wil koop. Jy sal jou besonderhede op die volgende blad invoer.</p>
    </div>

    <div class="card sticky summary">
      <h3 style="margin-top:0">Jou keuse</h3>
      <div id="summary-list" class="muted">Geen kaartjies gekies</div>
      <div class="row"><span>Subtotaal</span><span id="subtotal">R0.00</span></div>
      <div class="row total"><span>Totaal</span><span id="total">R0.00</span></div>
      <button id="checkout" class="btn" disabled>Checkout</button>
    </div>
  </div>

<script>
const slug=${JSON.stringify(slug)};
let catalog=null, selections=new Map(); // ticket_type_id -> {name, price_cents, qty}

function fmtR(c){ return 'R'+(c/100).toFixed(2); }

async function load(){
  const res = await fetch('/api/public/events/'+slug).then(r=>r.json());
  catalog = res; const ev=res.event, types=res.types;
  document.getElementById('ev-name').textContent = ev.name;
  document.getElementById('ev-when').textContent = new Date(ev.starts_at*1000).toLocaleString() + ' – ' + new Date(ev.ends_at*1000).toLocaleString();
  document.getElementById('ev-venue').textContent = ev.venue || '';
  renderTickets(types); updateSummary();
}

function renderTickets(types){
  const wrap = document.getElementById('tickets'); wrap.innerHTML='';
  types.forEach(t=>{
    const row=document.createElement('div'); row.className='ticket';
    row.innerHTML = \`
      <div><div class="name">\${t.name}</div><div class="muted">Max per order: \${t.per_order_limit||10}</div></div>
      <div class="price">\${fmtR(t.price_cents)}</div>
      <div class="qty">
        <button aria-label="decrease">-</button>
        <input type="number" min="0" value="0">
        <button aria-label="increase">+</button>
      </div>\`;
    const [dec,input,inc]=row.querySelectorAll('.qty *');
    function set(v){
      v = Math.max(0, Math.min(v, t.per_order_limit||10));
      input.value=v;
      if (v>0) selections.set(t.id, { name:t.name, price_cents:t.price_cents, qty:v, requires_gender: !!t.requires_gender, ticket_type_id:t.id });
      else selections.delete(t.id);
      updateSummary();
    }
    dec.onclick=()=>set(+input.value-1);
    inc.onclick=()=>set(+input.value+1);
    input.oninput=()=>set(+input.value||0);
    wrap.appendChild(row);
  });
}

function updateSummary(){
  const list=document.getElementById('summary-list');
  if (!selections.size){ list.textContent='Geen kaartjies gekies'; }
  else {
    list.innerHTML = [...selections.values()].map(s=>\`<div class="row"><span>\${s.name} × \${s.qty}</span><span>\${fmtR(s.price_cents*s.qty)}</span></div>\`).join('');
  }
  let total = 0; selections.forEach(s=> total += s.price_cents*s.qty );
  document.getElementById('subtotal').textContent = fmtR(total);
  document.getElementById('total').textContent = fmtR(total);
  document.getElementById('checkout').disabled = total===0;
}

// move to checkout (store cart in sessionStorage)
document.getElementById('checkout').onclick = ()=>{
  const items = [...selections.values()].map(s=>({ ticket_type_id:s.ticket_type_id, qty:s.qty, requires_gender:s.requires_gender, name:s.name, price_cents:s.price_cents }));
  sessionStorage.setItem('skou_cart', JSON.stringify({ slug, event_id: catalog.event.id, items, ts: Date.now() }));
  location.href = '/shop/'+slug+'/checkout';
};

load();
</script>
</body></html>`;
