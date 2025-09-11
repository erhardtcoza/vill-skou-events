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
  .btn{ padding:12px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .code{ font-weight:800; font-size:20px; letter-spacing:.5px; padding:8px 10px; border-radius:10px; background:#f1f5f9; display:inline-block }
  .spinner{ display:inline-block; width:14px; height:14px; border:2px solid #cbd5e1; border-top-color:#0a7d2b; border-radius:50%; animation:spin 1s linear infinite; vertical-align:-2px; margin-right:6px }
  @keyframes spin{ to{ transform:rotate(360deg) } }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>Dankie! 🎟️</h1>
    <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
    <div class="code" id="thecode"></div>

    <p class="muted" id="statusline" style="margin-top:12px">
      <span class="spinner"></span> Wag vir betaalbevestiging…
    </p>

    <div class="row" style="margin-top:18px">
      <a class="btn" id="ticketsBtn" href="#" style="display:none">Wys my kaartjies</a>
      <a class="btn" href="/">Terug na tuisblad</a>
    </div>
  </div>
</div>
<script>
(function(){
  const code = ${JSON.stringify(code||"")};
  document.getElementById('thecode').textContent = code;
  const btn = document.getElementById('ticketsBtn');
  const status = document.getElementById('statusline');

  async function poll(){
    try{
      const r = await fetch('/api/public/orders/status/'+encodeURIComponent(code));
      if (!r.ok) throw 0;
      const j = await r.json();
      const s = String(j.status||'').toLowerCase();
      if (s === 'paid'){
        status.innerHTML = 'Betaling bevestig. Stuur jou kaartjies…';
        // show button AND auto-redirect to ticket view:
        btn.href = '/t/'+encodeURIComponent(code);
        btn.style.display = '';
        setTimeout(()=>{ location.href = btn.href; }, 800);
        return; // stop polling
      }
      if (s === 'payment_failed'){
        status.innerHTML = 'Betaling het misluk. Probeer asseblief weer.';
        return;
      }
    }catch{}
    setTimeout(poll, 2000);
  }
  poll();
})();
</script>
</body></html>`;
