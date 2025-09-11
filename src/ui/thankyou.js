// /src/ui/thankyou.js
export const thankYouHTML = (code) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bestelling ontvang · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#111 }
  .wrap{ max-width:720px; margin:28px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:22px }
  h1{ margin:0 0 10px; font-size:26px }
  .muted{ color:var(--muted) }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:14px }
  .btn{ padding:12px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600; text-decoration:none; display:inline-block }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .code{ font-weight:800; font-size:20px; letter-spacing:.5px; padding:8px 10px; border-radius:10px; background:#f1f5f9; display:inline-block }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>Dankie! 🎟️</h1>
    <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
    <div class="code" id="orderCode"></div>

    <p id="payStatus" class="muted" style="margin-top:12px">Kontroleer betalingstatus…</p>

    <div class="row" style="margin-top:18px">
      <a id="viewBtn" class="btn primary" href="#" style="display:none">Wys my kaartjies</a>
      <a class="btn" href="/">Terug na tuisblad</a>
    </div>
  </div>
</div>
<script>
const code = ${JSON.stringify(code||"")};
document.getElementById('orderCode').textContent = code;

async function fetchStatus(){
  try{
    const j = await fetch('/api/public/orders/status/'+encodeURIComponent(code), { cache:'no-store' }).then(r=>r.json());
    return (j?.ok && (j.status||'').toLowerCase()) || null;
  }catch{ return null; }
}

function setPaid(){
  const payP = document.getElementById('payStatus');
  const btn  = document.getElementById('viewBtn');
  payP.textContent = 'Betaling ontvang. Jou kaartjies is gereed.';
  btn.href = '/t/'+encodeURIComponent(code);
  btn.style.display = 'inline-block';
}

// Initial check + poller
(async ()=>{
  const payP = document.getElementById('payStatus');
  const status = await fetchStatus();
  if (status === 'paid') { setPaid(); return; }

  if (status === 'cancelled' || status === 'failed') {
    payP.textContent = 'Betaling is nie voltooi nie. Jy kan weer probeer vanaf die betaalblad.';
    return;
  }
  // Default waiting text
  payP.textContent = 'Wag tans vir betaling. Hierdie blad sal outomaties opdateer.';

  // Poll every 4s for up to 3 minutes (45 tries)
  let tries = 45;
  const timer = setInterval(async ()=>{
    const st = await fetchStatus();
    if (!st){ if (--tries <= 0){ clearInterval(timer); } return; }
    if (st === 'paid'){
      clearInterval(timer);
      setPaid();
    } else if (st === 'cancelled' || st === 'failed'){
      clearInterval(timer);
      payP.textContent = 'Betaling is nie voltooi nie. Jy kan weer probeer vanaf die betaalblad.';
    } else if (--tries <= 0){
      clearInterval(timer);
      payP.textContent = 'Kon nie betaling bevestig nie. Verfris asb. of kontak ondersteuning.';
    }
  }, 4000);
})();
</script>
</body></html>`;
