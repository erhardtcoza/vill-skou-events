// /src/ui/cashbar_wallet.js
export function walletHTML({ id, name, balance_cents }) {
  const R = (c)=>'R ' + (c/100).toFixed(2);
  return `
<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Jou kroegrekening</title>
<link rel="manifest" href="/cashbar.webmanifest">
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/cashbar-sw.js')}</script>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
<style>
  body{font-family:system-ui;margin:0;padding:16px;background:#111;color:#fff}
  .card{background:#1a1a1a;border-radius:12px;padding:16px;max-width:420px;margin:0 auto}
  .bal{font-size:28px;margin:8px 0}
  .name{opacity:.8}
  .qr{display:flex;justify-content:center;margin:12px 0}
  .btn{display:block;margin:8px auto;padding:10px 14px;border-radius:10px;border:0;background:#E10600;color:#fff}
  .hint{text-align:center;opacity:.7}
</style></head><body>
  <div class="card">
    <div class="name">${name}</div>
    <div class="bal">Balans: <b>${R(balance_cents)}</b></div>
    <div class="qr"><canvas id="qr"></canvas></div>
    <button class="btn" onclick="location.reload()">Verfris balans</button>
    <p class="hint">Wys hierdie QR by die kroeg om te betaal • Voeg by Tuis-skerm vir maklike toegang.</p>
  </div>
<script>QRCode.toCanvas(document.getElementById('qr'), ${JSON.stringify(id)}, { width: 220 });</script>
</body></html>`;
}
