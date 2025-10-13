// /src/ui/cashbar_wallet.js
export function walletHTML({ id, name, balance_cents }) {
  const R = (c)=>'R ' + (c/100).toFixed(2);
  const qrURL = `/w/${id}.png`; // generate server-side or use JS QR on page
  return `
<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Jou kroegrekening</title>
<link rel="manifest" href="/cashbar.webmanifest">
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/cashbar-sw.js')}</script>
<style>
  body{font-family:system-ui;margin:0;padding:16px;background:#111;color:#fff}
  .card{background:#1a1a1a;border-radius:12px;padding:16px}
  .bal{font-size:28px;margin:8px 0}
  img.qr{width:220px;height:220px;display:block;margin:12px auto}
  .name{opacity:.8}
</style></head><body>
  <div class="card">
    <div class="name">${name}</div>
    <div class="bal">Balans: <b>${R(balance_cents)}</b></div>
    <p>Wys hierdie QR by die kroeg om te betaal:</p>
    <img class="qr" src="${qrURL}" alt="QR"/>
    <p style="text-align:center;opacity:.7">Voeg by Tuis-skerm vir maklike toegang.</p>
  </div>
</body></html>`;
}
