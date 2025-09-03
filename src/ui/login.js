// /src/ui/login.js
export const loginHTML = (kind = "Admin") => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${kind} · Sign in</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f7f8;margin:0}
  .wrap{max-width:440px;margin:6vh auto;padding:16px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 24px rgba(0,0,0,.06);padding:24px}
  h1{margin:0 0 16px;font-size:22px}
  input,button{width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;margin:6px 0}
  button{background:#0a7d2b;color:#fff;border-color:#0a7d2b;font-weight:600;cursor:pointer}
  .err{color:#b00020;margin-top:8px;min-height:1.2em}
  .muted{color:#6b7280;font-size:13px;margin-top:10px}
</style>
</head><body><div class="wrap">
  <div class="card">
    <h1>Sign in — ${kind}</h1>
    <input id="u" placeholder="username" autocomplete="username"/>
    <input id="p" type="password" placeholder="password" autocomplete="current-password"/>
    <button id="btn">Sign in</button>
    <div class="err" id="err"></div>
    <div class="muted">Tip: create users in the Admin → Users tab. For now you can add one directly in D1 with role “admin”.</div>
  </div>
</div>
<script>
  const btn = document.getElementById('btn');
  const err = document.getElementById('err');
  btn.onclick = async () => {
    err.textContent = '';
    const username = document.getElementById('u').value.trim();
    const password = document.getElementById('p').value.trim();
    if (!username || !password){ err.textContent = 'Enter username and password'; return; }
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ username, password })
    }).then(r=>r.json()).catch(()=>({ok:false,error:'Network'}));
    if (!res.ok){ err.textContent = res.error || 'Invalid login'; return; }
    // Decide where to send them based on role
    const role = res.role || '';
    const dest = role==='pos' ? '/pos' : role==='scan' ? '/scan' : '/admin';
    location.replace(dest);
  };
</script>
</body></html>`;
