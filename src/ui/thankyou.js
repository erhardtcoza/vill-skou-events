// src/ui/thankyou.js
// Server-safe: exports a pure HTML function (no window references at import).
// Browser behavior is in the inline <script> that runs after load.

export function thankYouHTML(code) {
  const safeCode = String(code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `<!doctype html>
<html lang="af">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bestelling ontvang – Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:900px; margin:24px auto; padding:0 14px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 10px } .muted{ color:var(--muted) }
  .code{ display:inline-block; font-weight:800; font-size:20px; letter-spacing:1px; background:#f3f4f6; border:1px solid #e5e7eb; padding:8px 12px; border-radius:10px }
  .row{ display:flex; gap:10px; flex-wrap:wrap; margin-top:12px }
  .btn{ padding:12px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; font-weight:700; cursor:pointer }
  .btn.secondary{ background:#fff; color:#111; border:1px solid #e5e7eb }
  .btn.is-disabled{ opacity:.55; cursor:not-allowed }
  .dot{ display:inline-block; padding:6px 10px; border-radius:999px; font-size:13px; border:1px solid #e5e7eb }
  .dot--waiting{ background:#fff; color:#444 }
  .dot--green{ background:#eaf6ee; color:#0a7d2b; border-color:#cfe9d6 }
  .hint{ font-size:13px; color:#555; margin-top:8px }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Dankie! <span aria-hidden="true">🎟️</span></h1>
      <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
      <div class="code" id="code">${safeCode}</div>

      <div style="margin-top:12px">
        <span class="dot dot--waiting" id="statusDot">Wag vir betaalbevestiging…</span>
      </div>

      <div class="row">
        <button class="btn is-disabled" id="showBtn" disabled>Wys my kaartjies</button>
        <a class="btn secondary" href="/" id="homeBtn">Terug na tuisblad</a>
        <button class="btn" id="payBtn">Gaan betaal</button>
      </div>
      <div class="hint" id="payHint">As jy nie die betaalblad gesien het nie, klik “Gaan betaal”.</div>
    </div>
  </div>

<script>
(function(){
  const code = document.getElementById('code').textContent.trim();
  const statusDot = document.getElementById('statusDot');
  const showBtn   = document.getElementById('showBtn');
  const payBtn    = document.getElementById('payBtn');
  const payHint   = document.getElementById('payHint');

  function gateTickets(isPaid){
    if (statusDot){
      statusDot.className = isPaid ? 'dot dot--green' : 'dot dot--waiting';
      statusDot.textContent = isPaid ? 'Betaalbevestig ✔' : 'Wag vir betaalbevestiging…';
    }
    if (showBtn){
      showBtn.disabled = !isPaid;
      showBtn.classList.toggle('is-disabled', !isPaid);
    }
    if (payBtn && payHint){
      const on = !isPaid;
      payBtn.style.display = on ? '' : 'none';
      payHint.style.display = on ? '' : 'none';
    }
  }

  async function getJSON(url){
    const r = await fetch(url, { credentials:'same-origin' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }

  async function postJSON(url, body){
    const r = await fetch(url, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      credentials:'same-origin',
      body: JSON.stringify(body||{})
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j && j.error || ('HTTP '+r.status));
    return j;
  }

  // Wire buttons
  showBtn.addEventListener('click', ()=>{
    if (showBtn.disabled) return;
    location.href = '/t/' + encodeURIComponent(code);
  });

  payBtn.addEventListener('click', async ()=>{
    try{
      const j = await postJSON('/api/payments/yoco/intent', { code });
      const url = j && j.redirect_url || '';
      if (!url) throw new Error('no redirect url');
      // Open in new tab; if blocked, same-tab
      const w = window.open(url, '_blank');
      if (!w) location.assign(url);
    }catch(e){
      alert('Kon nie die betaalblad oopmaak nie. Probeer asseblief weer.');
    }
  });

  // If the URL contains ?pay=err we leave the pay button visible.

  // Poll for status
  let tries = 0;
  const iv = setInterval(async ()=>{
    tries++;
    try{
      const j = await getJSON('/api/public/orders/status/' + encodeURIComponent(code));
      const st = String(j && j.status || '').toLowerCase();
      const paid = (st === 'paid');
      gateTickets(paid);
      if (paid) clearInterval(iv);
    }catch(_e){}
    if (tries > 200) clearInterval(iv); // ~10 min @3s
  }, 3000);

  // Initial gate
  gateTickets(false);
})();
</script>
</body></html>`;
}

export default thankYouHTML;
