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
  .wrap{ max-width:1100px; margin:12px auto; padding:0 12px }
  h1{ margin:6px 0 12px }
  /* Layout: cart on the right; on mobile it comes FIRST (above items) */
  .grid{ display:grid; grid-template-columns: 1.05fr .95fr; gap:12px }
  @media (max-width:980px){ .grid{ grid-template-columns:1fr } .left{ order:2 } .right{ order:1 } }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 10px 22px rgba(0,0,0,.06); padding:12px }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  input{ padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .chip{ display:inline-flex; align-items:center; padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:#f9fafb; cursor:pointer; }
  .chip.active{ background:var(--accent); color:#fff; border-color:var(--accent) }
  .muted{ color:var(--muted) }
  .items{ display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px; margin-top:8px; }
  .item{ border:1px solid var(--border); border-radius:12px; padding:10px; cursor:pointer; background:#fff }
  .item:hover{ border-color:#cbd5e1 }
  .item .name{ font-weight:800; margin:0 0 6px }
  .item .price{ color:#444 }
  /* Cart becomes compact and scrollable if tall */
  .cart{ min-height:96px; max-height: 38vh; overflow:auto; background:#fafafa; border:1px dashed var(--border); border-radius:12px; padding:8px }
  @media (max-width:980px){ .cart{ max-height: 34vh } }
  .cart-line{ display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f1f3f5; font-size:15px }
  .cart-line:last-child{ border-bottom:0 }
  .btn{ padding:12px 16px; border-radius:12px; border:0; cursor:pointer; font-weight:800 }
  .btn.primary{ background:var(--accent); color:#fff }
  .btn.alt{ background:#111; color:#fff }
  .btn.light{ background:#e5e7eb; color:#111 }
  .btn[disabled]{ opacity:.6; cursor:not-allowed }
  .total{ font-size:20px; font-weight:900 }
  /* Make the left panel fill height and allow item list to scroll on small screens */
  .panel-body{ display:flex; flex-direction:column; gap:8px }
  .items-wrap{ min-height:200px; max-height: 56vh; overflow:auto }
  @media (min-width:981px){ .items-wrap{ max-height: 62vh } }

  /* Processing overlay */
  .overlay{ position:fixed; inset:0; background:rgba(0,0,0,.4); display:none; align-items:center; justify-content:center; z-index:9999 }
  .overlay .box{ background:#fff; padding:16px 18px; border-radius:12px; box-shadow:0 10px 24px rgba(0,0,0,.18); font-weight:800 }
</style>
</head><body>
<div class="wrap">
  <h1>Bar verkope</h1>

  <div class="grid">
    <!-- LEFT -->
    <div class="card left">
      <div class="panel-body">
        <div class="row" style="justify-content:space-between">
          <input id="wallet" placeholder="Wallet ID of selfoon" style="flex:1; min-width:200px"/>
          <button id="scanBtn" class="btn light">Scan</button>
          <button id="loadBtn" class="btn light">Laai</button>
        </div>
        <div id="cust" class="muted">—</div>

        <div id="cats" class="row" style="margin:4px 0 0"></div>
        <div class="items-wrap">
          <div id="items" class="items"></div>
        </div>
        <div id="leftMsg" class="muted"></div>
      </div>
    </div>

    <!-- RIGHT (Cart) -->
    <div class="card right">
      <h3 style="margin:0 0 8px">Mandjie</h3>
      <div id="cart" class="cart"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px">
        <div><span class="muted">Totaal</span> • <span id="total" class="total">R0.00</span></div>
        <div class="row">
          <button id="checkoutBtn" class="btn primary">Klaar</button>
          <button id="clearBtn" class="btn light">Maak skoon</button>
        </div>
      </div>
      <div id="rightMsg" class="muted" style="margin-top:6px"></div>
    </div>
  </div>
</div>

<div class="overlay" id="overlay"><div class="box">Verwerking…</div></div>

<script>
const $ = id => document.getElementById(id);
const money = c => 'R'+((Number(c)||0)/100).toFixed(2);
const cents = n => Number(n||0)|0;

const LS_ITEMS = 'bar_items_v1';
const LS_WALLET = 'bar_last_wallet_v1';

let walletId = null, version = 0, balance = 0;
let allItems = [];     // API payload
let cart = new Map();  // id -> { name, price_cents, qty }
let currentCat = null;
let processing = false;

const afrMap = {
  "Beer":"Bier",
  "Wine":"Wyn",
  "Spirits":"Sterk drank",
  "Soft drink":"Koeldrank",
  "Cider":"Ciders",
  "Shots":"Shooters",
  "Deposit":"Glas Deposito"
};

function setProcessing(on){
  processing = !!on;
  $('overlay').style.display = on ? 'flex' : 'none';
  $('checkoutBtn').disabled = on;
}

function uniqueCats(items){
  const set = new Set(items.map(i => String(i.category||'')));
  return Array.from(set).filter(Boolean);
}

function displayName(it){
  const base = it.name || '';
  const v = (it.variant||'').trim();
  return v ? \`\${base} · \${v}\` : base;
}

function renderCats(){
  const cats = uniqueCats(allItems);
  if (!currentCat) currentCat = cats[0] || null;
  const html = cats.map(c => \`<span class="chip \${c===currentCat?'active':''}" data-cat="\${c}">\${afrMap[c]||c}</span>\`).join('');
  $('cats').innerHTML = html || '<span class="muted">Geen kategorieë</span>';
  $('cats').querySelectorAll('[data-cat]').forEach(el=>{
    el.onclick = ()=> { currentCat = el.getAttribute('data-cat'); renderCats(); renderItems(); };
  });
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

function recomputeButtons(){
  const rows = Array.from(cart.values());
  const total = rows.reduce((s,r)=> s + r.qty*(r.price_cents||0), 0);
  const insufficient = total > balance;
  $('checkoutBtn').disabled = processing || insufficient || !rows.length;
  $('rightMsg').textContent = balance
    ? (insufficient ? 'Onvoldoende balans' : ('Oorblyf: '+money(balance-total)))
    : '';
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
  recomputeButtons();
}

function addToCart(id){
  const it = allItems.find(x => Number(x.id)===Number(id));
  if (!it) return;
  const key = String(id);
  const cur = cart.get(key) || { id, name: displayName(it), price_cents: cents(it.price_cents), qty: 0 };
  cur.qty++;
  cart.set(key, cur);
  renderCart();
}

function clearCart(){ cart.clear(); renderCart(); }

// ----- Fast-load cache -----
(function bootFromCache(){
  try{
    const j = JSON.parse(localStorage.getItem(LS_ITEMS)||'null');
    if (j && Array.isArray(j.items)){ allItems = j.items; renderCats(); renderItems(); }
  }catch{}
  try{
    const w = JSON.parse(localStorage.getItem(LS_WALLET)||'null');
    if (w && w.id){
      walletId = w.id; version = Number(w.version||0); balance = cents(w.balance_cents||0);
      $('wallet').value = w.id;
      $('cust').textContent = (w.mobile || w.name || 'Wallet') + ' • Balans ' + money(balance);
      recomputeButtons();
    }
  }catch{}
})();

// Always refresh items in background
(async function refreshItems(){
  try{
    const j = await fetch('/api/items').then(r=>r.json());
    if (j && Array.isArray(j.items)){
      allItems = j.items || [];
      localStorage.setItem(LS_ITEMS, JSON.stringify({ items: allItems, ts: Date.now() }));
      renderCats(); renderItems();
    }
  }catch(_e){}
})();

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

  const onlyDigits = raw.replace(/\\D+/g,'');
  let w = null;

  try{
    if (onlyDigits.length >= 7 && onlyDigits.length >= raw.length-2) {
      const j = await fetch('/api/wallets/by-mobile/'+onlyDigits).then(r=>r.json());
      if (j?.ok) w = j.wallet;
    } else {
      const j = await fetch('/api/wallets/'+encodeURIComponent(raw)).then(r=>r.json());
      if (j?.ok) w = j.wallet;
    }
  }catch(_e){}

  if (!w){ alert('Wallet nie gevind'); return; }

  walletId = w.id;
  version  = Number(w.version||0);
  balance  = cents(w.balance_cents);
  $('cust').textContent = (w.mobile || w.name || 'Wallet') + ' • Balans ' + money(balance);

  try{ localStorage.setItem(LS_WALLET, JSON.stringify(w)); }catch{}
  renderCart();
};

$('checkoutBtn').onclick = async () => {
  const rows = Array.from(cart.values());
  if (!walletId || !rows.length) { alert('Leë mandjie.'); return; }
  const total = rows.reduce((s,r)=> s + r.qty*(r.price_cents||0), 0);
  if (total > balance) { alert('Onvoldoende balans.'); return; } // hard block (no negatives)

  setProcessing(true);

  try{
    const r = await fetch('/api/wallets/'+encodeURIComponent(walletId)+'/deduct',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({
        items: rows.map(r => ({
          id: r.id,
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

    // success: update local balance/version from server
    balance = cents(j.new_balance_cents);
    version = Number(j.version||version);
    clearCart();
    $('cust').textContent = 'Balans ' + money(balance);
    try{
      const lw = JSON.parse(localStorage.getItem(LS_WALLET)||'{}');
      lw.balance_cents = balance; lw.version = version;
      localStorage.setItem(LS_WALLET, JSON.stringify(lw));
    }catch{}
  }catch(e){
    alert(e.message || 'Fout met afrekening.');
  } finally {
    setProcessing(false);
  }
};

$('clearBtn').onclick = clearCart;
</script>
</body></html>`;
}
