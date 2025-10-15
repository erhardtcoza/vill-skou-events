// /src/ui/admin_bar_wallets.js
export async function barWalletsHTML(){
return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Wallets</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --border:#e5e7eb }
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:20px auto;padding:0 16px}
  .tabs{display:flex;gap:10px;margin:10px 0 18px}
  .tab{display:inline-block;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:#fff;text-decoration:none;font-weight:800}
  .tab.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.06);padding:18px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid var(--border);padding:10px 8px;text-align:left}
  input{padding:10px;border:1px solid var(--border);border-radius:10px;font:inherit}
</style>
</head><body>
<div class="wrap">
  <h1 style="margin:0 0 8px">Bar · Wallets</h1>
  <div class="tabs">
    <a class="tab" href="/admin/bar/menu">Menu</a>
    <a class="tab primary" href="/admin/bar/wallets">Wallets</a>
    <a class="tab" href="/admin/bar/cashup">Cashups</a>
  </div>

  <div class="card" style="margin-bottom:16px">
    <input id="q" placeholder="Search (id, name, mobile)" style="min-width:260px">
    <button id="go" class="tab" style="font-weight:800">Search</button>
  </div>

  <div class="card">
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Status</th><th>Balance</th><th>Created</th></tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
</div>

<script>
const $=s=>document.querySelector(s);
const rands=c=>'R'+((Number(c)||0)/100).toFixed(2);
function time(t){ return t? new Date(t*1000).toLocaleString() : '—'; }
async function load(){
  const p = new URLSearchParams(); const q=$('#q').value.trim(); if(q) p.set('q',q);
  const r = await fetch('/api/admin/bar/wallets?'+p.toString());
  const j = await r.json(); const arr=j.wallets||[];
  const tb=$('#tb'); tb.innerHTML='';
  for (const w of arr){
    const tr=document.createElement('tr');
    tr.innerHTML=\`<td>\${w.id}</td><td>\${w.name||''}</td><td>\${w.mobile||''}</td><td>\${w.status}</td><td>\${rands(w.balance_cents)}</td><td>\${time(w.created_at)}</td>\`;
    tb.appendChild(tr);
  }
}
$('#go').onclick = load; load();
</script>
</body></html>`;
}
