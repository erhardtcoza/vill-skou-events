// /src/ui/bar_sell.js
export function barSellHTML() {
  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar verkope</title>
<style>
  :root{
    --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb;
  }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  h1{ margin:0 0 16px }
  .grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:16px }
  @media (max-width:980px){ .grid{ grid-template-columns:1fr } }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  input{ padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .chip{ display:inline-flex; align-items:center; padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:#f9fafb; cursor:pointer; }
  .chip.active{ background:var(--accent); color:#fff; border-color:var(--accent) }
  .muted{ color:var(--muted) }
  .items{ display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; margin-top:10px }
  .item{ border:1px solid var(--border); border-radius:12px; padding:12px; cursor:pointer; background:#fff }
  .item:hover{ border-color:#cbd5e1 }
  .item .name{ font-weight:800; margin:0 0 6px }
  .item .price{ color:#444 }
  .cart{ min-height:160px; background:#fafafa; border:1px dashed var(--border); border-radius:12px; padding:10px }
  .cart-line{ display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f3f5 }
  .cart-line:last-child{ border-bottom:0 }
  .btn{ padding:12px 16px; border-radius:12px; border:0; cursor:pointer; font-weight:800 }
  .btn.primary{ background:var(--accent); color:#fff }
  .btn.alt{ background:#111; color:#fff }
  .btn.light{ background:#e5e7eb; color:#111 }
  .total{ font-size:20px; font-weight:900 }
</style>
</head><body>
<div class="wrap">
  <h1>Bar verkope</h1>

  <div class="grid">
    <!-- LEFT -->
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <input id="wallet" placeholder="Wallet ID of selfoon" style="flex:1; min-width:240px"/>
        <button id="scanBtn" class="btn light">Scan</button>
        <button id="loadBtn" class="btn light">Laai</button>
      </div>
      <div id="cust" class="muted" style="margin-top:8px">—</div>

      <div id="cats" class="row" style="margin:12px 0 6px"></div>
      <div id="items" class="items"></div>
      <div id="leftMsg" class="muted" style="margin-top:8px"></div>
    </div>

    <!-- RIGHT -->
    <div class="card">
      <h3 style="margin:0 0 10px">Mandjie</h3>
      <div id="cart" class="cart"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px">
        <div><span class="muted">Totaal</span> • <span id="total" class="total">R0.00</span></div>
        <div class="row">
          <button id="checkoutBtn" class="btn primary">Afreken</button>
          <button id="clearBtn" class="btn light">Maak skoon</button>
        </div>
      </div>
      <div id="rightMsg" class="muted" style="margin-top:8px"></div>
    </div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);

let walletId = null, version = 0, balance = 0;
let allItems = [];     // API payload
let cart = new Map();  // id -> { name, price_cents, qty }
let currentCat = null;

const afrMap = {
  "Beer":"Bier",
  "Wine":"Wyn",
  "Spirits":"Sterk drank",
  "Soft drink":"Koeldrank",
  "Cider":"Ciders",
  "Shots":"Shooters",
  "Deposit":"Glas Deposito"
};

function money(c){ return 'R'+((Number(c)||0)/100).toFixed(2); }
function cents(n){ return Number(n||0)|0; }

function uniqueCats(items){
  const set = new Set(items.map(i => String(i.category||'')));
  return Array.from(set).filter(Boolean);
}

function renderCats(){
  const cats = uniqueCats(allItems);
  const html = cats.map(c => \`<span class="chip \${c===currentCat?'active':''}" data-cat="\${c}">\${afrMap[c]||c}</span>\`).join('');
  $('cats').innerHTML = html || '<span class="muted">Geen kategorieë</span>';
  $('cats').querySelectorAll('[data-cat]').forEach(el=>{
    el.onclick = ()=> { currentCat = el.getAttribute('data-cat'); renderCats(); renderItems(); };
  });
}

function displayName(it){
  const base = it.name || '';
  const v = (it.variant||'').trim();
  return v ? \`\${base} · \${v}\` : base;
}

function renderItems(){
  const list = allItems.filter(it => it.category === currentCat);
  $('items').innerHTML = list.map(it => \`
    <div class="item" data-id="\${it.id}">
      <div class="name">\${displayName(it)}</div>
      <div class="price">\${it.price_cents==null ? '' : money(it.price_cents)}</div>
    </div>\`
  ).join('');
  $('leftMsg').textContent = list.length ? '' : 'Geen items in hierdie kategorie.';
  $('items').querySelectorAll('[data-id]').forEach(el=>{
    el.onclick = () => addToCart(Number(el.getAttribute('data-id')));
  });
}

function renderCart(){
  const rows = Array.from(cart.values());
  $('cart').innerHTML = rows.length ? rows.map(r => \`
    <div class="cart-line">
      <div>\${r.qty}× \${r.name}</div>
      <div>\${money(r.qty * (r.price_cents||0))}</div>
    </div>\`
  ).join('') : '<div class="muted">Leeg.</div>';

  const total = rows.reduce((s,r)=> s + r.qty*(r.price_cents||0), 0);
  $('total').textContent = money(total);
  $('rightMsg').textContent = balance ? ('Oorblyf: '+money(balance-total)) : '';
}

function addToCart(id){
  const it = allItems.find(x => Number(x.id)===Number(id));
  if (!it) return;
  const key = String(id);
  const name = displayName(it);
  const price = cents(it.price_cents);
  const cur = cart.get(key) || { name, price_cents: price, qty: 0 };
  cur.qty++;
  cart.set(key, cur);
  renderCart();
}

function clearCart(){ cart.clear(); renderCart(); }

// ----- Flow -----
$('scanBtn').onclick = () => {
  const v = prompt('Voer/scan wallet ID of selfoon:');
  if (!v) return;
  $('wallet').value = v.trim();
  $('loadBtn').click();
};

$('loadBtn').onclick = async () => {
  const raw = ($('wallet').value||'').trim();
  if (!raw){ alert('Voer wallet ID of selfoon in'); return; }

  // Decide lookup path: digits => by mobile; else treat as wallet id
  const digits = raw.replace(/\\D+/g,'');
  let w = null;

  try{
    if (digits.length >= 7 && digits.length >= raw.length-2) {
      // likely a phone number
      const j = await fetch('/api/wallets/by-mobile/'+digits).then(r=>r.json());
      if (j?.ok) w = j.wallet;
    } else {
      const j = await fetch('/api/wallets/'+encodeURIComponent(raw)).then(r=>r.json());
      if (j?.ok) w = j.wallet;
    }
  }catch(_e){}

  if (!w){ alert('Wallet nie gevind'); return; }

  walletId = w.id;
  version = Number(w.version||0);
  balance = cents(w.balance_cents);
  $('cust').textContent = (w.mobile || w.name || 'Wallet') + ' • Balans ' + money(balance);

  // Load items once
  if (!allItems.length) {
    try {
      const j = await fetch('/api/items').then(r=>r.json());
      allItems = j?.items || [];
    } catch(_e){}
  }
  // First category
  const cats = uniqueCats(allItems);
  currentCat = cats[0] || null;
  renderCats();
  renderItems();
  renderCart();
};

$('checkoutBtn').onclick = async () => {
  const rows = Array.from(cart.values());
  if (!walletId || !rows.length) { alert('Leë mandjie.'); return; }
  const total = rows.reduce((s,r)=> s + r.qty*(r.price_cents||0), 0);
  if (total > balance) {
    const go = confirm('Balans onvoldoende. Gaan voort?');
    if (!go) return;
  }
  try{
    const r = await fetch('/api/wallets/'+encodeURIComponent(walletId)+'/deduct',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({
        items: rows.map(r => ({
          id: r.id, // not required by API, but okay to send
          name: r.name,
          qty: r.qty,
          unit_price_cents: r.price_cents
        })),
        expected_version: version,
        bartender_id: 'bar-1',
        device_id: 'dev-1'
      })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok===false) throw new Error(j.error||'deduct_failed');
    balance = cents(j.new_balance_cents);
    version = Number(j.version||version);
    clearCart();
    $('cust').textContent = 'Balans ' + money(balance);
    alert('Afgereken. Nuwe balans: ' + money(balance));
  }catch(e){
    alert(e.message || 'Fout met afrekening.');
  }
};

$('clearBtn').onclick = clearCart;
</script>
</body></html>`;
}
