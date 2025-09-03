// /src/ui/admin.js
export const adminHTML = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{--green:#176d2b;--bg:#f6f7f9;--card:#fff;--muted:#6b7280}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:24px auto;padding:16px}
  h1{margin:0 0 16px}
  .tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
  .pill{border:1px solid #d1d5db;border-radius:999px;padding:8px 12px;background:#fff;cursor:pointer}
  .pill.active{background:var(--green);border-color:#0e571f;color:#fff}
  .card{background:var(--card);border:1px solid #e5e7eb;border-radius:14px;padding:16px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:10px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
  .muted{color:var(--muted)}
  input,select,button,textarea{padding:8px 10px;border:1px solid #d1d5db;border-radius:10px;background:#fff}
  textarea{width:100%;min-height:90px}
  button.primary{background:var(--green);border-color:#0e571f;color:#fff}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:900px){ .grid2{grid-template-columns:1fr} }
  .statgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .stat{background:#f8faf9;border:1px solid #e5e7eb;border-radius:12px;padding:12px}
</style>
</head>
<body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <button class="pill active" id="tab_events_btn" onclick="showTab('events')">Events</button>
    <button class="pill" id="tab_pos_btn" onclick="showTab('pos')">POS Admin</button>
    <button class="pill" id="tab_site_btn" onclick="showTab('site')">Site settings</button>
    <button class="pill" id="tab_users_btn" onclick="showTab('users')">Users</button>
  </div>

  <section id="tab_events" class="card"></section>
  <section id="tab_pos" class="card" style="display:none"></section>
  <section id="tab_site" class="card" style="display:none"></section>
  <section id="tab_users" class="card" style="display:none"></section>
</div>

<script>
let EVENTS = [];
function fmtR(c){ return (Number(c||0)/100).toLocaleString('en-ZA',{style:'currency',currency:'ZAR'}); }

function activate(btnId){
  ['tab_events_btn','tab_pos_btn','tab_site_btn','tab_users_btn'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.classList.toggle('active', id===btnId);
  });
}
function showTab(which){
  ['events','pos','site','users'].forEach(k=>{
    const sec=document.getElementById('tab_'+k);
    sec.style.display = (k===which)?'block':'none';
  });
  activate('tab_'+which+'_btn');
  if (which==='events') renderEvents();
  if (which==='pos') renderPOS();
  if (which==='site') renderSite();
  if (which==='users') renderUsers();
}

// ========== Events ==========
async function loadEvents(){
  const r = await fetch('/api/admin/events');
  const j = await r.json().catch(()=>({}));
  if (j.ok) EVENTS = j.events || [];
}
async function renderEvents(){
  if (!EVENTS.length) await loadEvents();
  const el = document.getElementById('tab_events');
  const rows = (EVENTS||[]).map(e=>{
    const s = e.starts_at ? new Date(e.starts_at*1000).toLocaleDateString('af-ZA') : '';
    const en= e.ends_at   ? new Date(e.ends_at*1000).toLocaleDateString('af-ZA') : '';
    return '<tr>'
      + '<td>'+e.id+'</td>'
      + '<td>'+e.slug+'</td>'
      + '<td>'+e.name+'<div class="muted">'+(e.venue||'')+'</div></td>'
      + '<td>'+s+'</td>'
      + '<td>'+en+'</td>'
      + '<td>'+(e.status||'')+'</td>'
      + '</tr>';
  }).join('');
  el.innerHTML =
    '<h2 style="margin:0 0 10px">Events</h2>'
  + '<table><thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th></tr></thead>'
  + '<tbody>'+rows+'</tbody></table>';
}

// ========== POS Admin ==========
async function renderPOS(){
  if (!EVENTS.length) await loadEvents();
  const el = document.getElementById('tab_pos');
  const evOpts = (EVENTS||[]).map(e => '<option value="'+e.id+'">'+e.name+' ('+e.slug+')</option>').join('');
  el.innerHTML =
    '<h2 style="margin:0 0 10px">POS Admin</h2>'
  + '<div class="row" style="margin-bottom:10px">'
    + '<select id="pos_ev">'+evOpts+'</select>'
    + '<button class="primary" onclick="loadPosSummary()">Load</button>'
  + '</div>'
  + '<div id="pos_summary" class="muted">Choose an event and click Load.</div>';
}
async function loadPosSummary(){
  const evId = Number(document.getElementById('pos_ev').value||0);
  const tgt = document.getElementById('pos_summary');
  if (!evId){ tgt.textContent = 'Select an event.'; return; }
  tgt.textContent = 'Loading…';
  const r = await fetch('/api/admin/pos/summary?event_id='+evId);
  const j = await r.json().catch(()=>({}));
  if (!j.ok){ tgt.textContent = 'Failed: '+(j.error||'unknown'); return; }

  const totals =
    '<div class="statgrid" style="margin:8px 0 12px">'
      + '<div class="stat"><div class="muted">Cash</div><div><strong>'+fmtR(j.totals.cash_cents||0)+'</strong></div></div>'
      + '<div class="stat"><div class="muted">Card</div><div><strong>'+fmtR(j.totals.card_cents||0)+'</strong></div></div>'
      + '<div class="stat"><div class="muted">Total (paid)</div><div><strong>'+fmtR(j.totals.grand_cents||0)+'</strong></div></div>'
    + '</div>';

  const byTypeHead = '<tr><th>Ticket</th><th>Qty cash</th><th>Qty card</th><th>Total qty</th><th>Revenue</th></tr>';
  const byTypeRows = (j.byType||[]).map(r =>
    '<tr>'
    + '<td>'+r.name+'</td>'
    + '<td>'+ (r.qty_cash||0) +'</td>'
    + '<td>'+ (r.qty_card||0) +'</td>'
    + '<td><strong>'+ (r.qty_total||0) +'</strong></td>'
    + '<td>'+ fmtR(r.cents_total||0) +'</td>'
    + '</tr>'
  ).join('');

  const sessHead = '<tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Float</th><th>Cash</th><th>Card</th><th>Notes</th></tr>';
  const sessRows = (j.sessions||[]).map(s=>{
    const op = s.opened_at ? new Date(s.opened_at*1000).toLocaleString() : '';
    const cl = s.closed_at ? new Date(s.closed_at*1000).toLocaleString() : '';
    return '<tr>'
      + '<td>'+s.id+'</td>'
      + '<td>'+s.cashier_name+'</td>'
      + '<td>'+s.gate_name+'</td>'
      + '<td>'+op+'</td>'
      + '<td>'+cl+'</td>'
      + '<td>'+fmtR(s.opening_float_cents||0)+'</td>'
      + '<td>'+fmtR(s.cash_total_cents||0)+'</td>'
      + '<td>'+fmtR(s.card_total_cents||0)+'</td>'
      + '<td>'+(s.notes||'')+'</td>'
      + '</tr>';
  }).join('');

  tgt.innerHTML =
    totals
    + '<h3>Sales by ticket type</h3>'
    + '<div class="card" style="padding:0"><table><thead>'+byTypeHead+'</thead><tbody>'+byTypeRows+'</tbody></table></div>'
    + '<h3 style="margin-top:16px">Shifts</h3>'
    + '<div class="card" style="padding:0"><table><thead>'+sessHead+'</thead><tbody>'+sessRows+'</tbody></table></div>';
}

// ========== Site settings ==========
async function renderSite(){
  const el = document.getElementById('tab_site');
  el.innerHTML = '<h2 style="margin:0 0 10px">Site settings</h2><div>Loading…</div>';
  const r = await fetch('/api/admin/settings');
  const j = await r.json().catch(()=>({}));
  const s = j.settings || {};
  el.innerHTML =
    '<h2 style="margin:0 0 10px">Site settings</h2>'
  + '<div class="grid2">'
    + '<label>Site title<input id="s_title" value="'+(s.title||'Villiersdorp Skou Tickets')+'"></label>'
    + '<label>Primary color<input id="s_color" value="'+(s.color||'#176d2b')+'"></label>'
    + '<label>Logo URL<input id="s_logo" value="'+(s.logo_url||'')+'"></label>'
    + '<label>Favicon URL<input id="s_fav" value="'+(s.favicon_url||'')+'"></label>'
  + '</div>'
  + '<div class="row" style="margin-top:10px">'
    + '<button class="primary" onclick="saveSite()">Save</button>'
    + '<span id="site_msg" class="muted"></span>'
  + '</div>';
}
async function saveSite(){
  const body = {
    title: document.getElementById('s_title').value || '',
    color: document.getElementById('s_color').value || '',
    logo_url: document.getElementById('s_logo').value || '',
    favicon_url: document.getElementById('s_fav').value || ''
  };
  const msg = document.getElementById('site_msg'); msg.textContent = 'Saving…';
  const r = await fetch('/api/admin/settings', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  const j = await r.json().catch(()=>({}));
  msg.textContent = j.ok ? 'Saved.' : ('Error: '+(j.error||'unknown'));
}

// ========== Users ==========
async function renderUsers(){
  const el = document.getElementById('tab_users');
  el.innerHTML = '<h2 style="margin:0 0 10px">Users</h2><div>Loading…</div>';
  const r = await fetch('/api/admin/users');
  const j = await r.json().catch(()=>({}));
  const rows = (j.users||[]).map(u=>{
    const when = u.created_at ? new Date(u.created_at*1000).toLocaleString() : '';
    return '<tr>'
      + '<td>'+u.id+'</td>'
      + '<td>'+u.username+'</td>'
      + '<td>'+u.role+'</td>'
      + '<td>'+when+'</td>'
      + '<td><button onclick="delUser('+u.id+')">Delete</button></td>'
      + '</tr>';
  }).join('');
  el.innerHTML =
    '<h2 style="margin:0 0 10px">Users</h2>'
  + '<div class="row" style="margin-bottom:10px">'
    + '<input id="u_name" placeholder="username">'
    + '<input id="u_pass" placeholder="password">'
    + '<select id="u_role"><option value="admin">admin</option><option value="pos">pos</option><option value="scan">scan</option></select>'
    + '<button class="primary" onclick="addUser()">Add</button>'
    + '<span id="u_msg" class="muted"></span>'
  + '</div>'
  + '<div class="card" style="padding:0"><table>'
    + '<thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Created</th><th></th></tr></thead>'
    + '<tbody>'+rows+'</tbody></table></div>';
}
async function addUser(){
  const username = document.getElementById('u_name').value.trim();
  const password = document.getElementById('u_pass').value.trim();
  const role     = document.getElementById('u_role').value;
  const msg = document.getElementById('u_msg'); msg.textContent = '';
  if (!username || !password){ msg.textContent='Enter username & password'; return; }
  const r = await fetch('/api/admin/users', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ username, password, role }) });
  const j = await r.json().catch(()=>({}));
  if (!j.ok){ msg.textContent = 'Error: '+(j.error||'unknown'); return; }
  document.getElementById('u_name').value=''; document.getElementById('u_pass').value='';
  renderUsers();
}
async function delUser(id){
  if (!confirm('Delete user '+id+'?')) return;
  await fetch('/api/admin/users/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id }) });
  renderUsers();
}

// Initial
showTab('events');
</script>
</body>
</html>`;
