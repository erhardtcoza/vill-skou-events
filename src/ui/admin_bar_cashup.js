// /src/ui/admin_bar_cashup.js
export async function barCashupHTML(){
return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Cashups</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --border:#e5e7eb }
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:20px auto;padding:0 16px}
  .tabs{display:flex;gap:10px;margin:10px 0 18px}
  .tab{display:inline-block;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:#fff;text-decoration:none;font-weight:800}
  .tab.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media (max-width:900px){ .grid{grid-template-columns:1fr} }
  .card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.06);padding:18px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid var(--border);padding:10px 8px;text-align:left}
</style>
</head><body>
<div class="wrap">
  <h1 style="margin:0 0 8px">Bar · Cashups</h1>
  <div class="tabs">
    <a class="tab" href="/admin/bar/menu">Menu</a>
    <a class="tab" href="/admin/bar/wallets">Wallets</a>
    <a class="tab primary" href="/admin/bar/cashup">Cashups</a>
  </div>

  <div class="grid">
    <div class="card">
      <h3 style="margin:0 0 10px">Wallet cashup (Top-ups)</h3>
      <table id="tTop"><thead><tr><th>Day</th><th>Cash</th><th>Card</th><th>Total</th></tr></thead><tbody></tbody></table>
    </div>
    <div class="card">
      <h3 style="margin:0 0 10px">Bar cashup (Sales by item)</h3>
      <table id="tItems"><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody></tbody></table>
    </div>
  </div>
</div>

<script>
const rands=c=>'R'+((Number(c)||0)/100).toFixed(2);

async function load(){
  const top = await fetch('/api/admin/bar/cashup/wallet').then(r=>r.json());
  const tb1 = document.querySelector('#tTop tbody'); tb1.innerHTML='';
  (top.days||[]).forEach(d=>{
    const tr=document.createElement('tr');
    tr.innerHTML=\`<td>\${d.day}</td><td>\${rands(d.cash_cents)}</td><td>\${rands(d.card_cents)}</td><td>\${rands(d.total_cents)}</td>\`;
    tb1.appendChild(tr);
  });

  const sales = await fetch('/api/admin/bar/cashup/sales').then(r=>r.json());
  const tb2 = document.querySelector('#tItems tbody'); tb2.innerHTML='';
  (sales.items||[]).forEach(it=>{
    const tr=document.createElement('tr');
    tr.innerHTML=\`<td>\${it.item_name||('Item '+it.item_id)}</td><td>\${it.qty||0}</td><td>\${rands(it.cents||0)}</td>\`;
    tb2.appendChild(tr);
  });
}
load();
</script>
</body></html>`;
}
