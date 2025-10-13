// /src/ui/cashbar_bar.js
export function barHTML() {
return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar</title>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/cashbar-sw.js')}</script>
<style>
  body{font-family:system-ui;margin:0;background:#0b1320;color:#fff}
  header{padding:12px 16px;font-weight:600}
  main{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .panel{background:#111b33;border-radius:12px;padding:12px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  button{padding:12px;border-radius:10px;border:0}
  .cart{min-height:140px}
  .row{display:flex;justify-content:space-between;margin:4px 0}
</style></head><body>
<header>Bar</header>
<main>
  <div class="panel">
    <div style="display:flex;gap:8px;align-items:center">
      <input id="wallet" placeholder="Scan/enter Wallet ID" style="flex:1;padding:10px;border-radius:8px;border:0"/>
      <button onclick="scan()">Scan</button>
    </div>
    <div id="cust" style="margin-top:8px;opacity:.9"></div>
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
      <button onclick="done()">Done</button>
    </div>
  </div>
</main>
<script>
let wallet=null, version=0, balance=0, cart=[]; let allItems=[];
const cats=['Beer','Wine','Shooters','Spirits','Specials'];
document.getElementById('cats').innerHTML = cats.map(c=>\`<button onclick="showCat('\${c}')">\${c}</button>\`).join('');

async function scan(){
  const id = prompt('Voer/scan wallet ID:');
  if(!id) return;
  wallet = id;
  const r = await fetch('/api/wallets/'+id); const j=await r.json();
  if(!r.ok) { alert(j.error); return; }
  version=j.version; balance=j.balance_cents;
  document.getElementById('cust').textContent = \`\${j.name} • Balans R \${(balance/100).toFixed(2)}\`;
  if(!allItems.length){ const ii=await (await fetch('/api/items')).json(); allItems=ii.items||[]; }
}

function showCat(cat){
  const list = allItems.filter(i=>i.category===cat && i.active);
  document.getElementById('items').innerHTML = list.map(i=>\`<button onclick='addItem("\${i.id}")'>\${i.name}<br>R \${(i.price_cents/100).toFixed(2)}</button>\`).join('');
}
function addItem(id){
  const it = allItems.find(x=>x.id===id); if(!it) return;
  const row = cart.find(x=>x.id===id); if(row) row.qty++; else cart.push({id:it.id,name:it.name,qty:1,unit_price_cents:it.price_cents});
  renderCart();
}
function renderCart(){
  const cont = document.getElementById('cart');
  cont.innerHTML = cart.map(x=>\`<div class="row">\${x.qty}× \${x.name}<b>R \${((x.qty*x.unit_price_cents)/100).toFixed(2)}</b></div>\`).join('');
  const total = cart.reduce((s,x)=> s + x.qty*x.unit_price_cents, 0);
  document.getElementById('total').innerHTML = '<b>Totaal: R '+(total/100).toFixed(2)+'</b>  •  Oorblyf: R '+((balance-total)/100).toFixed(2);
}
async function done(){
  if(!wallet || !cart.length){ alert('Geen items'); return; }
  const total = cart.reduce((s,x)=> s + x.qty*x.unit_price_cents, 0);
  const r = await fetch('/api/wallets/'+wallet+'/deduct',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({ items: cart, expected_version: version, bartender_id:'bar-1', device_id:'dev-1' })});
  const j=await r.json();
  if(!r.ok){ alert(j.error || 'Misluk'); return; }
  balance=j.new_balance_cents; version=j.version; cart=[]; renderCart();
  document.getElementById('cust').textContent = 'Balans R '+(balance/100).toFixed(2);
  alert('Afgereken. Nuwe balans: R '+(balance/100).toFixed(2));
}
</script>
</body></html>`;
}
