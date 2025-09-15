// /src/ui/thankyou.js
export const thankYouHTML = (code) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bestelling ontvang – Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:760px; margin:24px auto; padding:0 14px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 10px }
  .muted{ color:var(--muted) }
  .code{ display:inline-block; font-weight:800; background:#f4f6f8; border-radius:12px; padding:10px 14px; letter-spacing:1px }
  .row{ display:flex; gap:10px; flex-wrap:wrap; margin-top:14px }
  .btn{ padding:12px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; font-weight:700; cursor:pointer }
  .btn.secondary{ background:#fff; color:#111; border:1px solid #e5e7eb }
  .btn.disabled{ opacity:.55; pointer-events:none }
  .dot{ display:inline-block; width:10px; height:10px; border-radius:50%; vertical-align:middle; margin-right:6px; }
  .dot--waiting{ background:#f59e0b }
  .dot--green{ background:#16a34a }
  .hint{ font-size:13px; color:var(--muted); margin-top:8px }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>Dankie! <span class="muted">🎟️</span></h1>
    <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
    <div class="code" id="code">${code ? code : ""}</div>
    <div class="hint"><span class="dot dot--waiting" id="statusDot"></span><span id="statusTxt">Wag vir betaalbevestiging…</span></div>

    <div class="row">
      <button id="showBtn" class="btn disabled">Wys my kaartjies</button>
      <button id="homeBtn" class="btn secondary">Terug na tuisblad</button>
      <button id="payBtn" class="btn" style="display:none">Gaan betaal</button>
    </div>
    <div id="payHint" class="hint" style="display:none">As jy nie die betaalblad gesien het nie, klik “Gaan betaal”.</div>
  </div>
</div>

<script>
(function(){
  const codeFromPath = (function(){
    try{
      const m = location.pathname.match(/\\/thanks\\/([^/?#]+)/i);
      return m ? decodeURIComponent(m[1]) : "${code || ""}";
    }catch{ return "${code || ""}"; }
  })();
  const CODE = codeFromPath || "${code || ""}";

  const $ = (id)=>document.getElementById(id);
  const statusDot = $('statusDot'), statusTxt = $('statusTxt');
  const showBtn = $('showBtn'), homeBtn = $('homeBtn'), payBtn = $('payBtn'), payHint = $('payHint');

  homeBtn.onclick = ()=> location.href = '/';

  showBtn.onclick = ()=>{
    if (showBtn.classList.contains('disabled')) return;
    location.href = '/t/' + encodeURIComponent(CODE);
  };

  // Try pull last saved Yoco link from checkout
  function getSavedYoco(){
    try{
      const raw = sessionStorage.getItem('last_yoco');
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (!j || j.code !== CODE) return null;
      return j.url || null;
    }catch{ return null; }
  }

  async function createIntent(){
    try{
      const r = await fetch('/api/payments/yoco/intent', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ code: CODE })
      });
      const j = await r.json().catch(()=>({}));
      return j.redirect_url || j.url || null;
    }catch{ return null; }
  }

  async function goPay(){
    let link = getSavedYoco();
    if (!link) link = await createIntent();
    if (link){
      try{
        sessionStorage.setItem('last_yoco', JSON.stringify({ code: CODE, url: link, ts: Date.now() }));
      }catch{}
      const w = window.open(link, '_blank');
      if (!w) location.assign(link);
    }else{
      alert('Kon nie die betaalblad oopmaak nie. Probeer asseblief weer.');
    }
  }

  payBtn.onclick = goPay;

  // Decide if we should surface the “pay” button immediately
  const hadErr = (new URL(location.href)).searchParams.get('pay') === 'err';
  const saved = getSavedYoco();
  if (hadErr || saved){
    payBtn.style.display = '';
    payHint.style.display = '';
  }

  // Poll order status
  let tries = 0;
  const iv = setInterval(async ()=>{
    tries++;
    try{
      const r = await fetch('/api/public/orders/status/'+encodeURIComponent(CODE), { credentials:'same-origin' });
      const j = await r.json().catch(()=>({}));
      const st = String(j?.status||'').toLowerCase();
      const paid = (st === 'paid');
      if (paid){
        clearInterval(iv);
        statusDot.className = 'dot dot--green';
        statusTxt.textContent = 'Betaalbevestig ✔';
        showBtn.classList.remove('disabled');
        payBtn.style.display = 'none';
        payHint.style.display = 'none';
      }else{
        statusDot.className = 'dot dot--waiting';
        statusTxt.textContent = 'Wag vir betaalbevestiging…';
        showBtn.classList.add('disabled');
        if (hadErr || saved){ payBtn.style.display = ''; payHint.style.display = ''; }
      }
    }catch{}
    if (tries > 120) clearInterval(iv); // ~6 min
  }, 3000);
})();
</script>
</body></html>`;
