// /src/ui/bar_wallet.js
export function barWalletHTML(w) {
  const rands = (c)=>'R'+((c||0)/100).toFixed(2);
  // accept either {wallet:{...}} or flat wallet object
  const wallet = w?.wallet ? w.wallet : w || {};
  const id = Number(wallet.id||0);
  const name = String(wallet.name||'Wallet');
  const bal = Number(wallet.balance_cents||0);

  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${name} · Wallet</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --border:#e5e7eb }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:720px; margin:18px auto; padding:0 14px }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px; text-align:center }
  .balance{ font-size:34px; font-weight:900; margin:10px 0 }
  .qr{ margin:12px auto; width:220px; height:220px; border:1px solid var(--border); border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center }
  .btn{ display:inline-block; background:var(--accent); color:#fff; padding:10px 14px; border-radius:10px; text-decoration:none; font-weight:800; border:0; cursor:pointer; }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1 style="margin:0">${name}</h1>
    <div id="bal" class="balance">${rands(bal)}</div>
    <div class="qr"><img src="/api/qr/svg/WALLET-${id}" width="220" height="220" alt="QR"/></div>
    <div style="margin-top:8px; color:#667085">Wallet ID: ${id}</div>
    <div style="margin-top:14px"><button id="refresh" class="btn">Refresh balance</button></div>
  </div>
</div>
<script>
const $ = (id)=>document.getElementById(id);
const rands = (c)=>'R'+((c||0)/100).toFixed(2);
async function refresh(){
  try{
    const r = await fetch('/api/wallets/${id}');
    const j = await r.json().catch(()=>({}));
    if (r.ok && j && (j.ok!==false)) {
      const w = j.wallet ? j.wallet : j;
      $('bal').textContent = rands(w.balance_cents||0);
    }
  }catch{}
}
$('refresh').onclick = refresh;
</script>
</body></html>`;
}
