// /src/ui/thankyou.js
export function thankYouHTML(code) {
  const safe = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bestelling ontvang - Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --border:#e5e7eb }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:720px; margin:24px auto; padding:0 14px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 10px } .muted{ color:var(--muted) }
  .code{ display:inline-block; font-weight:800; font-size:22px; padding:10px 14px; border-radius:12px; background:#f1f5f3; letter-spacing:1px }
  .btn{ display:inline-block; padding:12px 14px; border-radius:10px; border:1px solid var(--border); background:#fff; cursor:pointer; font-weight:700; text-decoration:none; color:#111 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .row{ display:flex; gap:10px; flex-wrap:wrap }
  .spinner{ width:14px; height:14px; border:2px solid #cbd5d1; border-top-color:#4caf50; border-radius:50%; display:inline-block; animation:spin 1s linear infinite; vertical-align:middle }
  @keyframes spin{ to{ transform:rotate(360deg) } }
  .success{ background:#e9f7ef; border:1px solid #cdebd9; color:#0a5c28; padding:10px 12px; border-radius:10px; margin-top:10px; display:none }
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>Dankie! 🎟️</h1>
    <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
    <div class="code" id="orderCode">${safe}</div>

    <div id="waiting" class="muted" style="margin-top:10px">
      <span class="spinner"></span>
      <span>Wag vir betaalbevestiging…</span>
    </div>

    <div id="paidBanner" class="success">Betaling bevestig! Jou kaartjies word nou via WhatsApp en e-pos gestuur.</div>

    <div class="row" style="margin-top:14px">
      <a id="ticketsBtn" class="btn primary" href="/t/${safe}">Wys my kaartjies</a>
      <a class="btn" href="/">Terug na tuisblad</a>
    </div>
  </div>
</div>

<script>
(async function(){
  const code = ${JSON.stringify(safe)};
  const params = new URLSearchParams(location.search);
  const next = params.get("next"); // set by payments redirect
  const statusUrl = "/api/public/orders/status/" + encodeURIComponent(code);
  const btn = document.getElementById("ticketsBtn");
  const wait = document.getElementById("waiting");
  const banner = document.getElementById("paidBanner");

  async function getStatus(){
    try{
      const r = await fetch(statusUrl, { cache:"no-store" });
      if (!r.ok) return null;
      const j = await r.json().catch(()=>null);
      return j?.status || null;
    }catch{ return null; }
  }

  function onPaid(){
    wait.style.display = "none";
    banner.style.display = "block";
    // If Yoco showed their "click here if not redirected" link → this page loads,
    // we automatically forward to the ticket page so the user lands on their tickets.
    if (next) location.href = next;
    else btn.style.display = "inline-block";
  }

  // First check
  let s = await getStatus();
  if (s === "paid"){ onPaid(); return; }

  // Poll up to ~3 minutes
  let tries = 0, max = 90;     // every 2s
  const t = setInterval(async ()=>{
    tries++;
    const st = await getStatus();
    if (st === "paid"){ clearInterval(t); onPaid(); }
    if (st === "payment_failed"){ clearInterval(t); wait.innerHTML = "<span>Betaling het misluk. Probeer asseblief weer.</span>"; }
    if (tries >= max){ clearInterval(t); } // stop silently
  }, 2000);
})();
</script>
</body></html>`;
}