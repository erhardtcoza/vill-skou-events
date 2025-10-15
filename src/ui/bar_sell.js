// /src/ui/bar_sell.js
export function barSellHTML() {
  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar</title>
<style>
  :root{
    --bg:#0b1320; --panel:#111b33; --ink:#fff;
    --accent:#0a7d2b; --muted:#9ca3af; --btn:#1b2a59;
  }
  body{font-family:system-ui;margin:0;background:var(--bg);color:var(--ink)}
  header{padding:14px 16px;font-weight:700;font-size:20px;text-align:center;background:#101a32}
  main{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1100px;margin:0 auto}
  .panel{background:var(--panel);border-radius:12px;padding:14px}
  input[type="text"]{padding:12px;border-radius:10px;border:0;width:100%;font:inherit}
  button{padding:12px;border-radius:10px;border:0;background:var(--btn);color:#fff;cursor:pointer;font-weight:600}
  button:hover{opacity:.9}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px}
  .cart{min-height:150px;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px;background:#0f1830}
  .row{display:flex;justify-content:space-between;margin:4px 0}
  .muted{color:var(--muted)}
  @media(max-width:900px){main{grid-template-columns:1fr}}
</style></head><body>
<header>Bar verkope</header>
<main>
  <div class="panel">
    <div style="display:flex;gap:8px;align-items:center">
      <input id="wallet" type="text" placeholder="Scan/enter Wallet ID" style="flex:1"/>
      <button id="scanBtn">Scan</button>
      <button id="loadBtn">Load</button>
    </div>
    <div id="cust" class="muted" style="margin-top:8px"></div>

    <div id="catWrap" style="margin-top:14px">
      <div class="grid" id="cats"></div>
    </div>
    <div id="itemWrap" style="margin-top:10px">
      <div class="grid" id="items"></div>
    </div>
  </div>

  <div class="panel">
    <h3 style="margin-top:0">Mandjie</h3>
    <div class="cart" id="cart"></div>
    <div style="margin-top:10px">
      <div id="total"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="doneBtn">Done</button>
        <button id="clearBtn">Clear</button>
      </div>
    </div>
  </div>
</main>
<script>
let wallet=null, version=0, balance=0, cart=[];
let allItems=[]; let categories=[];

const $ = (id)=>document.getElementById(id);
$('scanBtn').onclick = scan;
$('loadBtn').onclick = load;
$('doneBtn').onclick = done;
$('clearBtn').onclick = clearCart;

function cents(n){return Number(n||0)|0;}
function money(c){return 'R '+(cents(c)/100).toFixed(2);}
function uniqueCategories(items){
  const set=new Set(); items.forEach(i=>i.category&&set.add(i.category));
  const got=[...set]; const pref=['Beer','Wine','Shooters','Spirits','Specials'];
  return [...pref.filter(x=>got.includes(x)), ...got.filter(x=>!pref.includes(x))];
}

function renderCategories(){
  const box=$('cats');
  box.innerHTML=categories.map(c=>\`<button data-cat="\${c}">\${c}</button>\`).join('');
  box.querySelectorAll('[data-cat]').forEach(btn=>{
    btn.onclick=()=>showCat(btn.getAttribute('data-cat'));
  });
}

function renderItems(list){
  $('items').innerHTML=list.map(i=>\`
    <button data-id="\${i.id}">
      <b>\${i.name}</b><br>\${money(i.price_cents)}
    </button>\`).join('');
  $('items').querySelectorAll('[data-id]').forEach(btn=>{
    btn.onclick=()=>addItem(btn.getAttribute('data-id'));
  });
}

function showCat(cat){
  const list=allItems.filter(i=>String(i.category)===String(cat) && (i.active==1 || i.active==true));
  renderItems(list);
}

function renderCart(){
  const c=$('cart');
  c.innerHTML=cart.map(x=>\`<div class="row"><span>\${x.qty}× \${x.name}</span><b>\${money(x.qty*x.unit_price_cents)}</b></div>\`).join('');
  const total=cart.reduce((s,x)=>s+x.qty*x.unit_price_cents,0);
  $('total').innerHTML='<b>Totaal: '+money(total)+'</b>  •  Oorblyf: '+money(balance-total);
}

function clearCart(){cart=[];renderCart();}
function addItem(id){
  const it=allItems.find(x=>String(x.id)===String(id)); if(!it)return;
  const row=cart.find(x=>String(x.id)===String(id));
  if(row)row.qty++; else cart.push({id:it.id,name:it.name,qty:1,unit_price_cents:cents(it.price_cents)});
  renderCart();
}

async function scan(){const id=prompt('Voer/scan wallet ID:'); if(!id)return; $('wallet').value=id.trim(); await load();}
async function load(){
  const id=($('wallet').value||'').trim(); if(!id){alert('Voer wallet ID in');return;}
  wallet=id;
  const r=await fetch('/api/wallets/'+encodeURIComponent(id)); const j=await r.json().catch(()=>({}));
  if(!r.ok){alert(j.error||'Wallet nie gevind');return;}
  const w=j.wallet||j; version=Number(w.version||0); balance=cents(w.balance_cents);
  $('cust').textContent=\`\${w.name||'Kliënt'} • Balans \${money(balance)}\`;
  if(!allItems.length){
    const ii=await (await fetch('/api/items')).json().catch(()=>({items:[]}));
    allItems=ii.items||[]; categories=uniqueCategories(allItems); renderCategories();
  }
  if(categories.length)showCat(categories[0]);
  else $('items').innerHTML='<div class="muted">Geen items beskikbaar nie.</div>';
}

async function done(){
  if(!wallet||!cart.length){alert('Geen items');return;}
  const total=cart.reduce((s,x)=>s+x.qty*x.unit_price_cents,0);
  if(total>balance){if(!confirm('Balans onvoldoende. Gaan voort?'))return;}
  const r=await fetch('/api/wallets/'+encodeURIComponent(wallet)+'/deduct',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({items:cart,expected_version:version,bartender_id:'bar-1',device_id:'dev-1'})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok){alert(j.error||'Misluk');return;}
  balance=cents(j.new_balance_cents); version=Number(j.version||version);
  clearCart(); $('cust').textContent='Balans '+money(balance);
  alert('Afgereken. Nuwe balans: '+money(balance));
}
</script>
</body></html>`;
}
