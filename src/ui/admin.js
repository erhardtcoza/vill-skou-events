// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{--green:#0a7d2b;--muted:#667085;--bg:#f7f7f8}
  *{box-sizing:border-box} body{font-family:system-ui;margin:0;background:#fff}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  h1{margin:0 0 16px}
  .tabs{display:flex;gap:8px;margin:8px 0 20px;flex-wrap:wrap}
  .tab{padding:8px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#f3f4f6;cursor:pointer}
  .tab.active{background:#e7f7ec;border-color:#bfe5c8;color:#064d1a;font-weight:600}
  .panel{display:none} .panel.active{display:block}
  input,button,select,textarea{padding:10px;border:1px solid #d1d5db;border-radius:10px;margin:4px}
  button.primary{background:var(--green);color:#fff;border-color:var(--green)}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:10px;border-bottom:1px solid #eee;vertical-align:top}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .muted{color:var(--muted)} .right{float:right}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  @media (max-width:800px){.grid2{grid-template-columns:1fr}}
</style>
</head><body><div class="wrap">
<h1>Admin</h1>

<div class="tabs">
  <div class="tab active" data-tab="site">Site Settings</div>
  <div class="tab" data-tab="events">Events</div>
  <div class="tab" data-tab="pos">POS Admin</div>
  <div class="tab" data-tab="visitors">Visitors</div>
  <div class="tab" data-tab="yoco">Yoco</div>
  <div class="tab" data-tab="tickets">Tickets</div>
  <div class="tab" data-tab="vendors">Vendors</div>
  <div class="tab" data-tab="users">Users</div>
</div>

<!-- SITE SETTINGS -->
<section id="site" class="panel active">
  <h2>Site Settings</h2>
  <div class="row">
    <input id="site_name" placeholder="Site name"/>
    <input id="logo_url" placeholder="Logo URL"/>
  </div>
  <div class="row">
    <input id="banner_url" placeholder="Banner URL"/>
    <button class="primary" onclick="saveSettings()">Save</button>
    <span id="sitestatus" class="muted"></span>
  </div>
</section>

<!-- EVENTS -->
<section id="events" class="panel">
  <h2 class="row">Events <small class="muted">Create & edit</small></h2>

  <details style="margin:6px 0;">
    <summary><strong>Create Event</strong></summary>
    <div class="row">
      <input id="slug" placeholder="slug (e.g. skou-2025)"/>
      <input id="name" placeholder="Event name"/>
      <input id="venue" placeholder="Venue"/>
      <label>Start <input id="startDate" type="date"/></label>
      <label>End <input id="endDate" type="date"/></label>
      <button onclick="createEvt()">Create</button>
    </div>
    <pre id="evmsg" class="muted"></pre>
  </details>

  <div id="editPanel" class="panel" style="display:none;padding:12px;border:1px solid #eee;border-radius:12px;background:#fafafa">
    <h3>Edit Event</h3>
    <input id="ed_id" type="hidden"/>
    <div class="grid2">
      <input id="ed_slug" placeholder="slug"/>
      <input id="ed_name" placeholder="name"/>
      <input id="ed_venue" placeholder="venue"/>
      <label>Start <input id="ed_start" type="date"/></label>
      <label>End <input id="ed_end" type="date"/></label>
    </div>
    <div class="grid2">
      <input id="ed_hero" placeholder="Hero image URL"/>
      <input id="ed_poster" placeholder="Poster image URL"/>
    </div>
    <label class="muted">Gallery URLs (max 8, one per line)
      <textarea id="ed_gallery" rows="4" placeholder="https://.../img1.jpg\nhttps://.../img2.jpg"></textarea>
    </label>
    <div class="row">
      <button class="primary" onclick="saveEdit()">Save</button>
      <button onclick="cancelEdit()">Cancel</button>
      <span id="edmsg" class="muted"></span>
    </div>

<section id="users" class="panel">
  <h2>Users</h2>
  <div class="row">
    <input id="nu_username" placeholder="username">
    <input id="nu_name" placeholder="display name">
    <select id="nu_role">
      <option value="admin">admin</option>
      <option value="pos">pos</option>
      <option value="scan">scan</option>
    </select>
    <input id="nu_password" placeholder="password" type="password">
    <button onclick="createUser()">Create</button>
    <span id="u_msg" class="muted"></span>
  </div>
  <table id="u_table"></table>
</section>

    <hr/>
    <h4>Gates</h4>
    <div class="row">
      <input id="gatename" placeholder="New gate name"/>
      <button onclick="addGate()">Add gate</button>
    </div>
    <ul id="gates" class="muted"></ul>

    <h4>Add Ticket Type</h4>
    <div class="row">
      <input id="ttName" placeholder="name (e.g. Vrydag – Laerskool)"/>
      <input id="ttPriceRand" type="number" step="0.01" placeholder="price (R) — blank = FREE"/>
      <label>Gender? <input id="ttGen" type="checkbox"/></label>
      <button onclick="addTT()">Add</button>
      <span id="ttmsg" class="muted"></span>
    </div>
  </div>

  <table id="evtable"></table>
</section>

<!-- POS ADMIN -->
<section id="pos" class="panel">
  <h2>POS Admin</h2>
  <div class="row">
    <label>From <input id="posFrom" type="date"/></label>
    <label>To <input id="posTo" type="date"/></label>
    <button onclick="loadPOS()">Reload</button>
  </div>
  <div id="posTotals" class="muted"></div>
  <table id="posShifts"></table>
</section>

<!-- PLACEHOLDERS -->
<section id="visitors" class="panel"><h2>Visitors</h2><p class="muted">Live in/out dashboard (coming soon).</p></section>
<section id="yoco" class="panel"><h2>Yoco</h2><p class="muted">Hosted payments + settlement logs (coming soon).</p></section>
<section id="tickets" class="panel"><h2>Tickets</h2><p class="muted">Search tickets, resend, revoke (coming soon).</p></section>
<section id="vendors" class="panel"><h2>Vendors</h2><p class="muted">Vendor onboarding and passes (phase 1 next).</p></section>

<script>
let _events = [];

function pick(id){return document.getElementById(id)}
function msg(id, o){ pick(id).textContent = (typeof o==='string')?o:JSON.stringify(o,null,2) }

function parseDateToMs(v, end=false){
  if(!v) return NaN;
  const [y,m,d] = v.split('-').map(n=>+n);
  const dt = end? new Date(y,m-1,d,23,59,0) : new Date(y,m-1,d,0,0,0);
  return dt.getTime();
}
function msToDate(ms){
  const d = new Date(ms); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return \`\${y}-\${m}-\${da}\`;
}

async function getJSON(u){ return fetch(u).then(r=>r.json()) }
async function post(u,b){ return fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()) }
async function put(u,b){ return fetch(u,{method:'PUT', headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()) }
async function del(u){ return fetch(u,{method:'DELETE'}).then(r=>r.json()) }

async function loadSettings(){
  const res = await getJSON('/api/admin/settings');
  if(res.ok){
    pick('site_name').value = res.settings.site_name||'';
    pick('logo_url').value = res.settings.logo_url||'';
    pick('banner_url').value = res.settings.banner_url||'';
  } else msg('sitestatus','Could not load settings');
}
async function saveSettings(){
  const res = await post('/api/admin/settings',{
    site_name: pick('site_name').value,
    logo_url: pick('logo_url').value,
    banner_url: pick('banner_url').value
  });
  msg('sitestatus', res.ok ? 'Saved' : 'Failed to save');
}

async function loadEvents(){
  const res = await getJSON('/api/admin/events');
  if(!res.ok) return;
  _events = res.events||[];
  renderEvents();
  // also preload gates list
  const gs = await getJSON('/api/admin/gates');
  pick('gates').innerHTML = (gs.gates||[]).map(g=>\`<li>\${g.id}. \${g.name}</li>\`).join('');
}
function renderEvents(){
  const rows = _events.map(e=>\`
    <tr>
      <td>\${e.id}</td>
      <td>\${e.slug}</td>
      <td>\${e.name}<div class="muted">\${e.venue||''}</div></td>
      <td>\${new Date(e.starts_at*1000).toLocaleDateString()}</td>
      <td>\${new Date(e.ends_at*1000).toLocaleDateString()}</td>
      <td><button onclick="editEvent(\${e.id})">Edit</button>
          <button onclick="deleteEvent(\${e.id})">Delete</button></td>
    </tr>\`).join('');
  pick('evtable').innerHTML = '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th><th></th></tr>'+rows;
}

async function createEvt(){
  const b = {
    slug: pick('slug').value,
    name: pick('name').value,
    venue: pick('venue').value,
    starts_at: Math.floor(parseDateToMs(pick('startDate').value,false)/1000),
    ends_at: Math.floor(parseDateToMs(pick('endDate').value,true)/1000),
    status: 'active'
  };
  const r = await post('/api/admin/events', b); msg('evmsg', r);
  if(r.ok){ await loadEvents(); ['slug','name','venue','startDate','endDate'].forEach(i=>pick(i).value=''); }
}

async function editEvent(id){
  const res = await getJSON('/api/admin/events/'+id);
  if(!res.ok) return alert('Not found');
  const e = res.event;
  pick('ed_id').value=e.id; pick('ed_slug').value=e.slug||''; pick('ed_name').value=e.name||'';
  pick('ed_venue').value=e.venue||''; pick('ed_start').value=msToDate(e.starts_at*1000); pick('ed_end').value=msToDate(e.ends_at*1000);
  pick('ed_hero').value=e.hero_url||''; pick('ed_poster').value=e.poster_url||'';
  const g = e.gallery_urls ? (Array.isArray(e.gallery_urls)?e.gallery_urls:JSON.parse(e.gallery_urls||'[]')) : [];
  pick('ed_gallery').value=(g||[]).slice(0,8).join('\\n');
  pick('editPanel').style.display='block';
}
function cancelEdit(){ pick('editPanel').style.display='none'; pick('edmsg').textContent=''; }

async function loadUsers(){
  const r = await fetch('/api/admin/users').then(r=>r.json()).catch(()=>({ok:false}));
  if(!r.ok){ document.getElementById('u_table').innerHTML = '<tr><td>Failed to load users</td></tr>'; return; }
  const rows = (r.users||[]).map(u=>`
    <tr>
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.display_name||''}</td>
      <td>${u.role}</td>
      <td>${u.is_active? 'active':'inactive'}</td>
      <td>
        <button onclick="resetPw(${u.id})">Reset PW</button>
        <button onclick="toggleUser(${u.id}, ${u.is_active?0:1})">${u.is_active?'Deactivate':'Activate'}</button>
      </td>
    </tr>`).join('');
  document.getElementById('u_table').innerHTML =
    '<tr><th>ID</th><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr>'+rows;
}
async function createUser(){
  const b = {
    username: document.getElementById('nu_username').value.trim(),
    display_name: document.getElementById('nu_name').value.trim(),
    role: document.getElementById('nu_role').value,
    password: document.getElementById('nu_password').value
  };
  const r = await fetch('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
  document.getElementById('u_msg').textContent = r.ok? 'Created' : (r.error||'Failed');
  if(r.ok){ ['nu_username','nu_name','nu_password'].forEach(id=>document.getElementById(id).value=''); loadUsers(); }
}
async function resetPw(id){
  const p = prompt('New password for user #'+id+':'); if(!p) return;
  await fetch('/api/admin/users/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({password:p})});
  loadUsers();
}
async function toggleUser(id, active){
  await fetch('/api/admin/users/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({is_active: active})});
  loadUsers();
}

async function saveEdit(){
  const id = Number(pick('ed_id').value||0); if(!id) return;
  const b = {
    slug: pick('ed_slug').value, name: pick('ed_name').value, venue: pick('ed_venue').value,
    starts_at: Math.floor(parseDateToMs(pick('ed_start').value,false)/1000),
    ends_at: Math.floor(parseDateToMs(pick('ed_end').value,true)/1000),
    hero_url: pick('ed_hero').value, poster_url: pick('ed_poster').value,
    gallery_urls: pick('ed_gallery').value.split(/\\n+/).map(s=>s.trim()).filter(Boolean)
  };
  const r = await put('/api/admin/events/'+id, b);
  pick('edmsg').textContent = r.ok ? 'Saved' : 'Failed to save';
  if(r.ok){ await loadEvents(); }
}
async function deleteEvent(id){
  if(!confirm('Delete event?')) return;
  const r = await del('/api/admin/events/'+id);
  if(r.ok){ await loadEvents(); cancelEdit(); }
}

async function addGate(){
  const name = pick('gatename').value.trim(); if(!name) return;
  const r = await post('/api/admin/gates',{name}); if(r.ok){ pick('gatename').value=''; const gs=await getJSON('/api/admin/gates'); pick('gates').innerHTML=(gs.gates||[]).map(g=>\`<li>\${g.id}. \${g.name}</li>\`).join(''); }
}

async function addTT(){
  const id = Number(pick('ed_id').value||0); if(!id) return alert('Open an event to edit first');
  const name = pick('ttName').value.trim(); const price = pick('ttPriceRand').value; const gender = document.getElementById('ttGen').checked;
  const b = { name, price_rands: price===''? '': Number(price), requires_gender: gender };
  const r = await post('/api/admin/events/'+id+'/ticket-types', b);
  msg('ttmsg', r.ok? 'Added' : 'Failed'); if(r.ok){ pick('ttName').value=''; pick('ttPriceRand').value=''; document.getElementById('ttGen').checked=false; }
}

function dateToUnix(d){ return Math.floor(new Date(d).getTime()/1000) }
async function loadPOS(){
  const from = pick('posFrom').value? dateToUnix(pick('posFrom').value): 0;
  const to = pick('posTo').value? dateToUnix(pick('posTo').value) + 86399 : 4102444800;
  const r = await getJSON(\`/api/admin/pos/cashups?from=\${from}&to=\${to}\`);
  if(!r.ok){ pick('posTotals').textContent = 'Failed to load'; return; }
  const t = r.totals||{};
  pick('posTotals').innerHTML = \`
    <div><strong>Totaal (POS):</strong> R\${((t.grand_cents||0)/100).toFixed(2)}
      · Kontant: R\${((t.cash_cents||0)/100).toFixed(2)}
      · Kaart: R\${((t.card_cents||0)/100).toFixed(2)}
      · Orders: \${t.orders_count||0}
    </div>\`;

  const rows = (r.shifts||[]).map(s=>\`
    <tr>
      <td>\${s.id}</td>
      <td>\${s.cashier_name}</td>
      <td>\${s.gate_name}</td>
      <td>\${new Date((s.opened_at||0)*1000).toLocaleString()}</td>
      <td>\${s.closed_at? new Date(s.closed_at*1000).toLocaleString() : '<span class="muted">open</span>'}</td>
      <td>R\${((s.opening_float_cents||0)/100).toFixed(2)}</td>
      <td class="muted">\${s.notes||''}</td>
    </tr>\`).join('');
  pick('posShifts').innerHTML = '<tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Float</th><th>Notes</th></tr>'+rows;
}

// Tabs
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

(async function init(){
  await loadSettings();
  await loadEvents();
  loadPOS();
  loadUsers(); // NEW
})();
</script>

</div></body></html>`;
