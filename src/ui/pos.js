// /src/ui/pos.js

/* POS landing */
export function posHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --accent-ink:#fff; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  a.btn{ display:inline-block; background:var(--accent); color:var(--accent-ink); padding:12px 16px; border-radius:10px; text-decoration:none; font-weight:800 }
  .muted{ color:var(--muted) }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div class="card">
    <p class="muted" style="margin-top:0">Begin 'n nuwe sessie om kaartjies te verkoop.</p>
    <a class="btn" href="/pos/sell">Begin verkoop</a>
  </div>
</div>
</body></html>`;
}

/* POS sell screen – wrapper that injects the full page (legacy helper) */
export function posSellHTML(session_id = 0) {
  // Prefer using src/ui/pos_sell.js export if you import it elsewhere;
  // keeping this here for backwards compatibility.
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>POS · Sell</title>
</head><body>
<div style="padding:16px;font-family:system-ui">This wrapper is deprecated. Please import and serve /src/ui/pos_sell.js instead.</div>
</body></html>`;
}
