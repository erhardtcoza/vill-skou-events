// /src/ui/bar_sell.js
export function barSellHTML() {
  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar</title>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/cashbar-sw.js')}</script>
<style>
  body{font-family:system-ui;margin:0;background:#0b1320;color:#fff}
  header{padding:12px 16px;font-weight:600}
  main{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:980px;margin:0 auto}
  .panel{background:#111b33;border-radius:12px;padding:12px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  button{padding:12px;border-radius:10px;border:0;background:#1b2a59;color:#fff;cursor:pointer}
  .cart{min-height:140px}
  .row{display:flex;justify-content:space-between;margin:4px 0}
  .muted{opacity:.85}
  @media(max-width:900px){main{grid-template-columns:1fr}}
  input[type="text"]{padding:10px;border-radius:8px;border:0;width:100%}
</style></head><body>
<header>Kroeg</header>
<main>
  <div class="panel">
    <div style="display:flex;gap:8px;align-items:center">
      <input id="wallet" type="text" placeholder="Scan/enter Wallet ID" style="flex:1"/>
      <button id="scanBtn">Scan</button>
      <button id="loadBtn">Load</button>
    </div>
    <div id="cust" class="muted" style="margin-top:8px"></div>
    <div style="margin:10px 0">
      <div class="grid" id="cats"></div>
      <div class="grid" id="items"></div>
    </div>
  </div>
  <div class="panel">
    <h3>Mandjie</h3>
    <div class="cart" id="cart"></div>
    <div style="margin-top:10px">
      <div id="total"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="doneBtn">Done</button>
        <button id="clearBtn">Clear</button>
      </div>
    </div>
  </div>
</main>
<script>
let wallet=null, version=0, balance=0, cart=[];
let allItems=[];       // full catalog from /api/items
let categories=[];     // computed unique categories

const $ = (id)=>document.getElementById(id);
$('scanBtn').onclick = scan;
$('loadBtn').onclick = load;
$('doneBtn').onclick = done;
$('clearBtn').onclick = clearCart;

// ---- Helpers ----
function cents(n){ return Number(n||0)|0; }
function money(c){ return 'R '+(cents(c)/100).toFixed(2); }

function uniqueCategories(items){
  const set = new Set();
  items.forEach(i => { if (i.category) set.add(String(i.category)); });
  const got = Array.from(set);
  // Friendly order if present
  const preferred = ['Beer','Wine','Shooters','Spirits','Specials'];
  const ordered = preferred.filter(x => got.includes(x));
  const rest = got.filter(x => !preferred.includes(x)).sort((a,b)=>a.localeCompare(b));
  return [...ordered, ...rest];
}

function renderCategories(){
  const box = $('cats');
  box.innerHTML = categories.map(c => 
    \`<button data-cat="\${c}">\${c}</button>\`
  ).join('');
  box.querySelectorAll('[data-cat]').forEach(b=>{
    b.addEventListener('click', ()=> showCat(b.getAttribute('data-cat')));
  });
}

function renderItems(list){
  $('items').innerHTML = list.map(i => 
    \`<button data-id="\${i.id}">\${i.name}<br>\${money(i.price_cents)}</button>\`
  ).join('');
  $('items').querySelectorAll('[data-id]').forEach(b=>{
    b.addEventListener('click', ()=> addItem(Number(b.getAttribute('data-id'))));
  });
}

function showCat(cat){
  const list = allItems.filter(i => String(i.category)===String(cat) && (i.active===1 || i.active===true));
  renderItems(list);
}

function renderCart(){
  const cont = $('cart');
  cont.innerHTML = cart.map(x =>
    \`<div class="row"><span>\${x.qty}× \${x.name}</span><b>\${money(x.qty * x.unit_price_cents)}</b></div>\`
  ).join('');
  const total = cart.reduce((s,x)=> s + x.qty * x.unit_price_cents, 0);
  $('total').innerHTML = '<b>Totaal: '+money(total)+'</b>  •  Oorblyf: '+money(balance - total);
}

function clearCart(){ cart=[]; renderCart(); }

function addItem(id){
  const it = allItems.find(x => Number(x.id)===Number(id)); 
  if(!it) return;
  const row = cart.find(x => Number(x.id)===Number(id));
  if(row) row.qty++;
  else cart.push({ id: Number(it.id), name: it.name, qty: 1, unit_price_cents: cents(it.price_cents) });
  renderCart();
}

// ---- Flow ----
async function scan(){
  const id = prompt('Voer/scan wallet ID:');
  if(!id) return;
  $('wallet').value = id.trim();
  await load();
}

async function load(){
  const id = ($('wallet').value||'').trim();
  if(!id){ alert('Voer wallet ID in'); return; }
  wallet = id;

  // 1) Fetch wallet
  const r = await fetch('/api/wallets/'+encodeURIComponent(id));
  let j = await r.json().catch(()=>({}));
  if(!r.ok){ alert(j.error || 'Wallet nie gevind'); return; }

  // tolerate both {wallet:{...}} or flat {...}
  const w = j.wallet || j;
  version = Number(w.version||0);
  balance = cents(w.balance_cents);
  $('cust').textContent = \`\${w.name||'Kliënt'} • Balans \${money(balance)}\`;

  // 2) Fetch items (only once)
  if(!allItems.length){
    const ii = await (await fetch('/api/items')).json().catch(()=>({items:[]}));
    allItems = ii.items || [];
    categories = uniqueCategories(allItems);
    renderCategories();
  }

  // 3) Show first category if available
  if(categories.length){ showCat(categories[0]); }
  else { $('items').innerHTML = '<div class="muted">Geen items beskikbaar nie.</div>'; }
}

async function done(){
  if(!wallet || !cart.length){ alert('Geen items'); return; }
  const total = cart.reduce((s,x)=> s + x.qty*x.unit_price_cents, 0);
  if (total > balance){
    if (!confirm('Balans onvoldoende. Gaan voort om nietemin af te trek?')) return;
  }
  const r = await fetch('/api/wallets/'+encodeURIComponent(wallet)+'/deduct',{
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({
      items: cart,
      expected_version: version,
      bartender_id: 'bar-1',
      device_id: 'dev-1'
    })
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok){ alert(j.error || 'Misluk'); return; }
  balance = cents(j.new_balance_cents);
  version  = Number(j.version||version);
  clearCart();
  $('cust').textContent = 'Balans '+money(balance);
  alert('Afgereken. Nuwe balans: '+money(balance));
}
</script>
</body></html>`;
}
