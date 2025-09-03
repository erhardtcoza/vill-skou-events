// /src/ui/login.js
export const loginHTML = (role) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${role.toUpperCase()} Login · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --bg:#f6f7f8 }
  body{margin:0;font-family:system-ui;background:var(--bg);display:grid;place-items:center;height:100svh;}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px; width:min(440px,92vw)}
  h1{margin:0 0 8px}
  label{display:block;margin:10px 0 4px;color:#6b7280}
  input,select{width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px}
  button{margin-top:12px;width:100%;padding:12px;border:none;border-radius:12px;background:var(--green);color:#fff;font-weight:700;cursor:pointer}
  small{color:#6b7280}
</style></head><body>
<div class="card">
  <h1>${role.toUpperCase()} Login</h1>
  <label>Name (optional)</label>
  <input id="name" placeholder="Your name"/>
  ${role === 'scan' ? `
    <label>Gate</label>
    <input id="gate" list="gates" placeholder="Select or type gate name"/>
    <datalist id="gates"></datalist>
  ` : ``}
  <label>Access token</label>
  <input id="token" placeholder="${role.toUpperCase()}_TOKEN" />
  <button id="go">Sign In</button>
  <small>Need help? Ask an admin for the ${role.toUpperCase()} token.</small>
</div>
<script>
async function loadGates(){
  if ('${role}'!=='scan') return;
  try{
    const r = await fetch('/api/public/gates').then(r=>r.json());
    const list = (r.gates||[]).map(g=>'<option value="'+g.name+'">').join('');
    document.getElementById('gates').innerHTML = list;
  }catch{}
}
document.getElementById('go').onclick = async () => {
  const token = document.getElementById('token').value.trim();
  const name  = document.getElementById('name').value.trim();
  const gate  = '${role}'==='scan' ? (document.getElementById('gate').value.trim()) : '';
  if ('${role}'==='scan' && !gate) { alert('Please choose a gate'); return; }
  const res = await fetch('/api/auth/login', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ role: '${role}', token, name, gate_name: gate })
  }).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok) return alert(res.error||'Login failed');
  location.href = ${role === 'admin' ? '"/admin"' : role === 'pos' ? '"/pos"' : '"/scan"'};
};
loadGates();
</script>
</body></html>`;
