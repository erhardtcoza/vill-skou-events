// /src/ui/login.js
export function loginHTML(role) {
  const title = role === 'admin' ? 'Admin' : role === 'pos' ? 'POS' : 'Scanner';
  const redirect = role === 'admin' ? '/admin' : role === 'pos' ? '/pos' : '/scan';
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · Sign in</title>
<style>
  :root{--green:#0a7d2b;--muted:#667085;--bg:#f7f7f8}
  body{font-family:system-ui;margin:0;background:var(--bg)} .wrap{max-width:420px;margin:18vh auto;padding:0 16px}
  .card{background:#fff;border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.08);padding:16px}
  input,button{padding:12px;border:1px solid #d1d5db;border-radius:12px;width:100%;margin:6px 0}
  button{background:var(--green);color:#fff;border-color:var(--green);cursor:pointer}
  .muted{color:var(--muted)}
</style></head><body><div class="wrap">
  <div class="card">
    <h2>Sign in — ${title}</h2>
    <input id="u" placeholder="Username" autocomplete="username"/>
    <input id="p" placeholder="Password" type="password" autocomplete="current-password"/>
    <button id="go">Sign in</button>
    <div id="msg" class="muted"></div>
  </div>
</div>
<script>
document.getElementById('go').onclick = async function(){
  const username = document.getElementById('u').value.trim();
  const password = document.getElementById('p').value.trim();
  document.getElementById('msg').textContent = 'Signing in…';
  const r = await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})})
    .then(r=>r.json()).catch(()=>({ok:false}));
  if (r.ok) { location.href = '${redirect}'; }
  else document.getElementById('msg').textContent = 'Invalid login';
};
</script>
</body></html>`;
}
