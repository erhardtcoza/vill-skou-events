// /src/ui/thankyou.js
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]
  ));
}

export const thankYouHTML = (code) => {
  const safe = esc(code);
  const safeUrl = encodeURIComponent(code || "");
  return `<!doctype html><html><head>
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
</style>
</head><body>
<div class="wrap">
  <div class="card">
    <h1>Dankie! 🎟️</h1>
    <p>Ons het jou bestelling ontvang. Gebruik hierdie kode as verwysing:</p>
    <div class="code">${safe}</div>

    <p class="muted" style="margin-top:12px">
      Jou kaartjies sal via <strong>WhatsApp</strong> en <strong>E-pos</strong> eersdaags gestuur word sodra betaling ontvang was.
    </p>

    <div class="row" style="margin-top:18px">
      <a class="btn primary" href="/t/${safeUrl}">Wys my kaartjies</a>
      <a class="btn" href="/">Terug na tuisblad</a>
    </div>
  </div>
</div>
</body></html>`;
};
