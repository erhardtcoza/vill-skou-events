// /src/ui/admin_bar.js
export async function barRootHTML(){
return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Bar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --border:#e5e7eb }
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:20px auto;padding:0 16px}
  .tabs{display:flex;gap:10px;margin:10px 0 18px}
  .tab{display:inline-block;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:#fff;text-decoration:none;font-weight:800}
  .tab.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.06);padding:18px}
</style>
</head><body>
<div class="wrap">
  <h1 style="margin:0 0 8px">Bar</h1>
  <div class="tabs">
    <a class="tab primary" href="/admin/bar/menu">Menu</a>
    <a class="tab" href="/admin/bar/wallets">Wallets</a>
    <a class="tab" href="/admin/bar/cashup">Cashups</a>
  </div>
  <div class="card">Kies ‘n afdeling hierbo.</div>
</div>
</body></html>`;
}
