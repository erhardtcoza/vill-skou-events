export const landingHTML = () => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Villiersdorp Skou Tickets</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f7faf7;margin:0;color:#123}
  .wrap{max-width:920px;margin:40px auto;padding:24px}
  a.btn{display:inline-block;margin:8px 8px 0 0;padding:12px 16px;border-radius:10px;background:#0a7d2b;color:#fff;text-decoration:none}
  header h1{margin:0 0 6px} header small{color:#456}
</style></head>
<body><div class="wrap">
  <header><h1>Villiersdorp Skou — Tickets</h1><small>Online sales · POS · Gate scanning</small></header>
  <p>Choose a console:</p>
  <p>
    <a class="btn" href="/admin">Admin</a>
    <a class="btn" href="/pos">POS</a>
    <a class="btn" href="/scan">Scanner</a>
  </p>
</div></body></html>`;
