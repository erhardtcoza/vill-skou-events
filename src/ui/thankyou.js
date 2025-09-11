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
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>Dankie! 🎟️</h1>
    <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
    <div class="code" id="code"></div>

    <p class="muted" style="margin-top:12px" id="explain">
      As jy aanlyn betaal het, finaliseer ons die betaling en laai ons jou kaartjies.
      Hierdie blad sal outomaties opdateer sodra jou betaling bevestig is.
    </p>

    <div class="row" style="margin-top:18px">
      <a id="viewBtn" class="btn primary" href="#" style="display:none">Wys my kaartjies</a>
      <span id="statusPill" class="pill">Wag vir betaling…</span>
      <button id="refreshBtn" class="btn">Verfris</button>
      <a class="btn" href="/">Terug na tuisblad</a>
    </div>
  </div>
</div>
<script>
const code = ${JSON.stringify(code||"")};
document.getElementById('code').textContent = code;

const viewBtn = document.getElementById('viewBtn');
const pill = document.getElementById('statusPill');
const refreshBtn = document.getElementById('refreshBtn');

function setPaid(){
  pill.textContent = 'Betaal — klaar!';
  viewBtn.href = '/t/' + encodeURIComponent(code);
  viewBtn.style.display = 'inline-block';
}

async function check(){
  try{
    const r = await fetch('/api/public/orders/status/' + encodeURIComponent(code));
    if (!r.ok) return;
    const j = await r.json().catch(()=>({}));
    if (j.ok && j.status === 'paid'){
      setPaid();
      return true;
    }
  }catch{}
  return false;
}

// Poll up to ~5 minutes
let tries = 0;
const maxTries = 100; // ~100 * 3s = 5 minutes
async function poll(){
  const ok = await check();
  if (ok) return;
  tries++;
  if (tries < maxTries) setTimeout(poll, 3000);
  else pill.textContent = 'Nog nie bevestig nie — probeer weer verfris.';
}
poll();

refreshBtn.onclick = ()=>{ tries = 0; pill.textContent = 'Wag vir betaling…'; poll(); };
</script>
</body></html>`;
