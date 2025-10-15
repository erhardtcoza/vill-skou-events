// /src/ui/bar_sell.js
export function barSellHTML() {
  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar · Verkope</title>
<style>
  :root{
    --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:18px auto;padding:0 14px}
  h1{margin:0 0 12px}
  .grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}
  @media (max-width:900px){ .grid{grid-template-columns:1fr} }
  .card{background:var(--card);border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.08);padding:16px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input{padding:12px;border:1px solid var(--border);border-radius:12px;font:inherit;background:#fff}
  .btn{padding:12px 14px;border-radius:12px;border:0;cursor:pointer;font-weight:800}
  .btn.primary{background:var(--accent);color:#fff}
  .btn.alt{background:#111;color:#fff}
  .btn.ghost{background:#f2f4f7;border:1px solid var(--border);color:#111}
  .muted{color:var(--muted)}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
  .tab{padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:#f8fafc;cursor:pointer}
  .tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}
  .catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
  .item{border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;background:#fff}
  .item:hover{border-color:#cbd5e1}
  .item .name{font-weight:700;margin:0 0 4px}
  .item .meta{font-size:12px;color:#475467}
  .cart{min-height:130px;border:1px dashed var(--border);border-radius:12px;padding:10px;background:#fafafa}
  .cart-line{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eef2f6}
  .cart-line:last-child{border-bottom:0}
  .qty{display:flex;gap:6px;align-items:center}
  .total{font-size:22px;font-weight:900;text-align:right}
</style>
</head><body>
<div class="wrap">
  <h1>Bar verkope</h1>
  <div class="grid">
    <!-- LEFT: wallet + catalog -->
    <div class="card">
      <div class="row">
        <input id="wallet" placeholder="Scan / voer beursie-ID of selfoon in" style="flex:1;min-width:220px"/>
        <button id="scanBtn" class="btn ghost">Scan</button>
        <button id="loadBtn" class="btn">Laai</button>
      </div>
      <div id="cust" class="muted" style="margin:6px 0 10px">—</div>

      <div class="tabs" id="tabs"></div>
      <div class="catalog" id="items"></div>
      <div id="catalogMsg" class="muted" style="margin-top:8px"></div>
    </div>

    <!-- RIGHT: cart -->
    <div class="card">
      <h3 style="margin:0 0 6px">Mandjie</h3>
      <div id="cart" class="cart"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <span style="font-weight:700">Totaal</span>
        <span id="total" class="total">R0.00</span>
      </div>

      <div class="row" style="margin-top:12px">
        <button id="doneBtn" class="btn primary" style="flex:1">Afreken</button>
        <button id="clearBtn" class="btn" style="flex:1">Maak skoon</button>
      </div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const money = (c)=>'R'+((Number(c)||0)/100).toFixed(2);
const digits = (s)=>String(s||'').replace(/\\D+/g,'');

// DB categories → Afrikaans labels used in tabs
const CAT_LABEL = {
  'Beer':'Bier',
  'Cider':'Ciders',
  'Soft drink':'Koeldrank',
  'Wine':'Wyn',
  'Spirits':'Sterk drank',
  'Shots':'Shots',           // keep as per poster
  'Deposit':'Glas Deposito',
  'Specials':'Spesiale'
};

// preferred order for tabs if present
const PREFERRED = ['Beer','Cider','Soft drink','Wine','Spirits','Shots','Deposit','Specials'];

let wallet=null, version=0, balance=0;
let catalog=[], categories=[], activeCat=null;
let cart=new Map(); // id -> {id,name,unit_price_cents,qty}

function uniqueCategories(items){
  const got = Array.from(new Set(items.filter(i => i.active).map(i => String(i.category))));
  const ordered = PREFERRED.filter(x => got.includes(x));
  const rest = got.filter(x => !PREFERRED.includes(x)).sort((a,b)=>a.localeCompare(b));
  return [...ordered, ...rest];
}

function labelFor(cat){ return CAT_LABEL[cat] || cat; }

function renderTabs(){
  const box = $('tabs');
  box.innerHTML = categories.map(c =>
    \`<button class="tab\${c===activeCat?' active':''}" data-cat="\${c}">\${labelFor(c)}</button>\`
  ).join('');
  box.querySelectorAll('[data-cat]').forEach(b=>{
    b.onclick = ()=>{ activeCat = b.dataset.cat; renderTabs(); showCat(activeCat); };
  });
}

function showCat(cat){
  const items = catalog.filter(i => i.active && String(i.category)===String(cat));
  $('items').innerHTML = items.map(i => {
    const title = i.variant ? (i.name+' · '+i.variant) : i.name;
    const sub = i.unit ? i.unit : (i.size_ml ? (i.size_ml+' ml') : '');
    return \`<div class="item" data-id="\${i.id}">
      <div class="name">\${title}</div>
      <div class="meta">\${sub || '&nbsp;'}</div>
      <div class="meta">\${i.price_cents!=null ? money(i.price_cents) : ''}</div>
    </div>\`;
  }).join('');
  $('items').querySelectorAll('[data-id]').forEach(el=>{
    el.onclick = ()=> addItem(Number(el.dataset.id));
  });
  $('catalogMsg').textContent = items.length ? '' : 'Geen items in hierdie kategorie.';
}

function renderCart(){
  const arr = Array.from(cart.values());
  if (!arr.length){ $('cart').innerHTML = '<div class="muted">Mandjie is leeg.</div>'; $('total').textContent='R0.00'; return; }
  $('cart').innerHTML = arr.map(x =>
    \`<div class="cart-line">
       <div>\${x.qty}× \${x.name}</div>
       <div class="qty">
         <button class="btn ghost" data-dec="\${x.id}">−</button>
         <button class="btn ghost" data-inc="\${x.id}">+</button>
         <strong style="min-width:90px;text-align:right">\${money(x.qty * x.unit_price_cents)}</strong>
       </div>
     </div>\`
  ).join('');
  const total = arr.reduce((s,x)=>s + x.qty*x.unit_price_cents, 0);
  $('total').textContent = money(total);
  $('cart').querySelectorAll('[data-inc]').forEach(b=> b.onclick = ()=> changeQty(Number(b.dataset.inc), +1));
  $('cart').querySelectorAll('[data-dec]').forEach(b=> b.onclick = ()=> changeQty(Number(b.dataset.dec), -1));
}

function changeQty(id, d){
  const row = cart.get(id);
  if (!row) return;
  row.qty = Math.max(0, row.qty + d);
  if (row.qty === 0) cart.delete(id);
  renderCart();
}

function addItem(id){
  const it = catalog.find(x => Number(x.id)===Number(id));
  if (!it) return;
  const disp = it.variant ? (it.name+' · '+it.variant) : it.name;
  const row = cart.get(id) || { id, name: disp, unit_price_cents: Number(it.price_cents||0), qty: 0 };
  row.qty++;
  cart.set(id, row);
  renderCart();
}

async function scan(){
  const v = prompt('Voer / skandeer beursie-ID of selfoon:');
  if (!v) return;
  $('wallet').value = v.trim();
  await load();
}

async function load(){
  const raw = ($('wallet').value||'').trim();
  if (!raw){ alert('Voer ’n beursie-ID of selfoon in'); return; }

  // 1) fetch wallet by id, fall back to mobile digits
  let r = await fetch('/api/wallets/'+encodeURIComponent(raw));
  let j = await r.json().catch(()=>({}));
  if (!r.ok){
    const d = digits(raw);
    if (d){
      r = await fetch('/api/wallets/by-mobile/'+encodeURIComponent(d));
      j = await r.json().catch(()=>({}));
    }
  }
  if (!r.ok){ alert(j.error || 'Wallet nie gevind nie'); return; }

  const w = j.wallet || j;
  wallet = w.id;
  version = Number(w.version||0);
  balance = Number(w.balance_cents||0);
  $('cust').textContent = \`Balans \${money(balance)}\`;

  // 2) fetch catalog once
  if (!catalog.length){
    const ii = await (await fetch('/api/items')).json().catch(()=>({items:[]}));
    catalog = (ii.items||[]).map(x => ({
      id:Number(x.id), name:x.name, category:String(x.category),
      variant:(x.variant||''), unit:x.unit, size_ml:x.size_ml,
      active: !!(x.active===1 || x.active===true),
      price_cents: Number(x.price_cents ?? 0)
    }));
    categories = uniqueCategories(catalog);
    activeCat = categories[0] || null;
    renderTabs();
  }
  if (activeCat) showCat(activeCat);
}

async function done(){
  if (!wallet || !cart.size){ alert('Geen items in die mandjie nie.'); return; }
  const items = Array.from(cart.values()).map(x => ({
    id: x.id, name: x.name, qty: x.qty, unit_price_cents: x.unit_price_cents
  }));
  const total = items.reduce((s,x)=> s + x.qty*x.unit_price_cents, 0);
  if (total > balance){
    if (!confirm('Balans is onvoldoende. Gaan voort om af te trek?')) return;
  }

  const r = await fetch('/api/wallets/'+encodeURIComponent(wallet)+'/deduct', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ items, expected_version: version, bartender_id:'bar-ui', device_id:'web' })
  });
  const j = await r.json().catch(()=>({}));
  if (!r.ok){ alert(j.error || 'Transaksie het misluk'); return; }

  balance = Number(j.new_balance_cents||0);
  version  = Number(j.version||version);
  cart.clear();
  renderCart();
  $('cust').textContent = \`Balans \${money(balance)}\`;
  alert('Afgereken. Nuwe balans: ' + money(balance));
}

$('scanBtn').onclick = scan;
$('loadBtn').onclick = load;
$('doneBtn').onclick = done;
$('clearBtn').onclick = ()=>{ cart.clear(); renderCart(); };
</script>
</body></html>`;
}
