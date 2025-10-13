// /src/ui/cashbar_cashier.js
export function cashierHTML() {
return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cashier · Cashless Bar</title>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/cashbar-sw.js')}</script>
<style>
  body{font-family:system-ui;margin:0;background:#0b1320;color:#fff}
  header{padding:12px 16px;font-weight:600}
  main{padding:16px;max-width:820px;margin:0 auto}
  button{font-size:16px;padding:12px 14px;margin:6px;border-radius:10px;border:0;background:#1b2a59;color:#fff;cursor:pointer}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  input,select{padding:10px;border-radius:8px;border:0;width:100%;margin:6px 0;background:#0d1630;color:#fff}
  .quick button{min-width:96px}
  .card{background:#111b33;border-radius:12px;padding:12px;margin:10px 0}
</style></head><body>
<header>Kasregister</header>
<main>
<div class="card">
  <h3>Registrasie</h3>
  <div class="row">
    <button onclick="scanTicket()">Skandeer kaartjie</button>
    <button onclick="showManual()">Nuwe gebruiker</button>
  </div>
  <div id="manual" style="display:none">
    <input id="name" placeholder="Naam en Van"/>
    <input id="mobile" placeholder="Selfoon (+27...)"/>
    <button onclick="registerManual()">Skep Wallet</button>
  </div>
  <div id="reg_out" style="opacity:.9"></div>
</div>

<div class="card">
  <h3>Top-up / Balans / Oordrag</h3>
  <input id="wallet" placeholder="Wallet ID (of skandeer)"/>
  <div class="row">
    <button onclick="balance()">Balans</button>
  </div>
  <div class="row quick">
    <button onclick="topup(5000)">R50</button>
    <button onclick="topup(10000)">R100</button>
    <button onclick="topup(25000)">R250</button>
    <button onclick="topup(50000)">R500</button>
  </div>
  <div class="row">
    <button onclick="startTransfer()">Oordra krediet</button>
  </div>
  <div id="out"></div>
</div>

<script>
async function scanTicket(){
  const code = prompt('Voer kaartjie QR of bestelling se short_code in');
  if(!code) return;
  const r = await fetch('/api/wallets/register',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({source:'ticket', ticket_code: code})});
  const j = await r.json();
  document.getElementById('reg_out').innerHTML = r.ok
    ? ('Wallet: <b>'+j.wallet_id+'</b> · <a href="'+j.wallet_url+'">open</a>')
    : (j.error || 'Misluk');
  if (j.wallet_id) document.getElementById('wallet').value = j.wallet_id;
}
function showManual(){ document.getElementById('manual').style.display='block'; }
async function registerManual(){
  const name=document.getElementById('name').value.trim();
  const mobile=document.getElementById('mobile').value.trim();
  const r=await fetch('/api/wallets/register',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({source:'manual', name, mobile})});
  const j= await r.json();
  document.getElementById('reg_out').innerHTML = r.ok
    ? ('Wallet: <b>'+j.wallet_id+'</b> · <a href="'+j.wallet_url+'">open</a>')
    : (j.error || 'Misluk');
  if (j.wallet_id) document.getElementById('wallet').value = j.wallet_id;
}
async function balance(){
  const id = cur(); if(!id) return;
  const r = await fetch('/api/wallets/'+id); const j=await r.json();
  document.getElementById('out').textContent = r.ok ? ('Balans: R '+(j.balance_cents/100).toFixed(2)) : (j.error||'Misluk');
}
async function topup(c){
  const id = cur(); if(!id) return;
  const ref = prompt('Yoco verwysing (opsioneel)') || '';
  const r = await fetch('/api/wallets/'+id+'/topup',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({ amount_cents:c, source:'yoco', ref })});
  const j=await r.json();
  document.getElementById('out').textContent = r.ok ? ('Nuwe balans: R '+(j.new_balance_cents/100).toFixed(2)) : (j.error||'Misluk');
}
function startTransfer(){
  const from = prompt('Donor wallet ID:'); if(!from) return;
  const to   = prompt('Ontvanger wallet ID:'); if(!to) return;
  const amtR = prompt('Bedrag (R):'); const amount_cents = Math.round(parseFloat(amtR||'0')*100);
  doTransfer(from,to,amount_cents);
}
async function doTransfer(from,to,amount_cents){
  const r=await fetch('/api/wallets/transfer',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({from,to,amount_cents})});
  const j=await r.json();
  document.getElementById('out').textContent = r.ok
    ? ('Donor: R '+(j.from_balance_cents/100).toFixed(2)+' • Ontv: R '+(j.to_balance_cents/100).toFixed(2))
    : (j.error||'Misluk');
}
function cur(){ const v=document.getElementById('wallet').value.trim(); if(!v) alert('Voer wallet ID in'); return v; }
</script>
</main></body></html>`;
}
