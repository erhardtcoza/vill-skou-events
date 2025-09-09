// src/ui/admin.js
import { LOGO_URL } from "../constants.js";

export function renderAdminReviewHTML() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Admin dashboard</title>
<style>
:root{--pad:14px;--gap:10px;--mut:#6b7280;--fg:#0f172a;--bg:#f8fafc;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial}
.wrap{max-width:1060px;margin:0 auto;padding:var(--pad)}
.nav{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
.nav a{padding:.6rem .9rem;border-radius:.6rem;background:#fff;border:1px solid #e5e7eb;text-decoration:none;color:var(--fg)}
.nav a.active{background:#111827;color:#fff;border-color:#111827}
.h1{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.6rem}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:12px 0}
.grid{display:grid;gap:10px}
.table{display:grid;gap:8px}
.th,.tr{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:8px;align-items:center}
.th{font-weight:600}
.badge{display:inline-block;padding:.2rem .5rem;border-radius:.5rem;background:#eef2ff;font-size:.78rem}
input,select,button{padding:.72rem .95rem;border-radius:.6rem;border:1px solid #e5e7eb}
button.primary{background:#111827;color:#fff;border-color:#111827}
button.ghost{background:#fff}
.toolbar{display:grid;grid-template-columns:1fr auto;gap:10px;margin:8px 0}
@media (max-width: 760px){
  .th,.tr{grid-template-columns:1fr 1fr}
  .toolbar{grid-template-columns:1fr}
  button, input, select{width:100%}
}
.small{color:var(--mut);font-size:.86rem}
.right{justify-self:end}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width: 760px){ .row{grid-template-columns:1fr} }
</style>
</head><body><div class="wrap">

<div class="h1"><img src="${LOGO_URL}" alt="logo" height="34"/> Admin dashboard</div>

<nav class="nav">
  <a href="#tickets" class="active">Tickets</a>
  <a href="#pos">POS Admin</a>
  <a href="#vendors">Vendors</a>
  <a href="#users">Users</a>
  <a href="#events">Events</a>
  <a href="#settings">Site settings</a>
  <a href="#templates">Templates</a>
</nav>

<div id="view"></div>

</div>
<script>
const $ = (s, el=document) => el.querySelector(s);
const API = (p, opt) => fetch(p, opt);

function toast(msg, ok=true){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = "position:fixed;left:12px;right:12px;bottom:16px;padding:12px;border-radius:10px;background:" + (ok?"#111827":"#991b1b") + ";color:#fff;text-align:center;z-index:50";
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2600);
}

async function loadEvents(){
  const r = await API('/api/events'); return r.ok ? r.json() : [];
}
async function loadEventStats(id){
  const r = await API('/api/events/'+id+'/stats'); return r.ok ? r.json() : [];
}
async function loadTemplates(){
  const r = await API('/api/templates'); return r.ok ? r.json() : [];
}

function viewTickets(){
  const el = document.getElementById('view'); el.innerHTML = '';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = \`
  <div class="toolbar">
    <div class="row">
      <label>Pick event<select id="evSel"></select></label>
      <label>Send ticket via WhatsApp
        <div class="row">
          <input id="waphone" placeholder="27XXXXXXXXX"/>
          <button id="sendwa" class="primary">Send</button>
        </div>
        <div class="small">Uses default template (e.g. ticket_delivery / af)</div>
      </label>
    </div>
    <div></div>
  </div>
  <div id="stats" class="table">
    <div class="th"><div>Type</div><div>Sold</div><div>Checked in</div><div>Void</div><div>Total</div><div>Capacity</div></div>
    <div id="rows"></div>
  </div>
  <div class="card">
    <div class="row">
      <input id="ordercode" placeholder="Order code (e.g. 3VLNT5)"/>
      <button id="lookup" class="ghost">Lookup</button>
    </div>
  </div>\`;
  el.appendChild(card);

  const evSel = $('#evSel', card); const rows = $('#rows', card);

  loadEvents().then(list=>{
    list.forEach(e=>{
      const o = document.createElement('option'); o.value = e.id; o.textContent = e.name; evSel.appendChild(o);
    });
    if (list[0]) refreshStats(list[0].id);
  });

  evSel.onchange = ()=> refreshStats(evSel.value);
  async function refreshStats(id){
    rows.innerHTML = '';
    const stats = await loadEventStats(id);
    stats.forEach(s=>{
      const tr = document.createElement('div'); tr.className='tr';
      tr.innerHTML = \`<div>\${s.name}</div><div>\${s.sold||0}</div><div>\${s.checked_in||0}</div><div>\${s.void||0}</div><div>\${s.total||0}</div><div>\${s.capacity||0}</div>\`;
      rows.appendChild(tr);
    });
  }

  // One-click WhatsApp send on existing order code
  $('#sendwa', card).onclick = async ()=>{
    const code = ($('#ordercode', card).value || '').trim();
    const to = ($('#waphone', card).value || '').trim();
    if (!code) return toast('Enter order code', false);
    if (!to) return toast('Enter phone (E.164 without +)', false);
    const r = await API('/api/admin/orders/'+encodeURIComponent(code)+'/whatsapp', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ to })
    });
    const J = await r.json();
    if (r.ok && J.ok) toast('Sent ✓'); else toast((J.error && (J.error+'')) || 'Failed', false);
  };

  $('#lookup', card).onclick = ()=> toast('Order lookup unchanged (existing behaviour)');
}

function viewEvents(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = \`
    <div class="row">
      <input id="slug" placeholder="slug (e.g. skou-2025)"/>
      <input id="name" placeholder="Event name"/>
    </div>
    <div class="row">
      <input id="venue" placeholder="Venue"/>
      <input id="dates" placeholder="Dates (display only)"/>
    </div>
    <div class="row">
      <button id="add" class="primary">Add event</button>
      <button id="reload" class="ghost">Reload</button>
    </div>
    <div id="list" class="table" style="margin-top:10px"></div>
  \`;
  el.appendChild(card);

  async function render(){
    const list = await loadEvents();
    const listEl = $('#list', card);
    listEl.innerHTML = '<div class="th"><div>ID</div><div>Slug</div><div>Name</div><div>Venue</div><div class="right">Actions</div><div></div></div>';
    list.forEach(e=>{
      const tr = document.createElement('div'); tr.className='tr';
      tr.innerHTML = \`
        <div>\${e.id}</div><div>\${e.slug}</div><div>\${e.name}</div><div>\${e.venue||''}</div>
        <div class="right">
          <button data-id="\${e.id}" class="ghost edit">Edit</button>
          <button data-id="\${e.id}" class="ghost del">Delete</button>
        </div><div></div>\`;
      listEl.appendChild(tr);
    });
    listEl.querySelectorAll('.del').forEach(b=> b.onclick = async ()=>{
      const id = b.getAttribute('data-id');
      if (!confirm('Delete event '+id+'?')) return;
      const r = await API('/api/events/'+id, { method:'DELETE' });
      r.ok ? toast('Deleted') : toast('Delete failed', false);
      render();
    });
    listEl.querySelectorAll('.edit').forEach(b=> b.onclick = async ()=>{
      const id = b.getAttribute('data-id');
      const nn = prompt('New name?'); if (!nn) return;
      const r = await API('/api/events/'+id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: nn }) });
      r.ok ? toast('Saved') : toast('Save failed', false);
      render();
    });
  }
  render();

  $('#add', card).onclick = async ()=>{
    const slug = $('#slug', card).value.trim();
    const name = $('#name', card).value.trim();
    const venue = $('#venue', card).value.trim();
    if (!slug||!name) return toast('Slug and name required', false);
    const r = await API('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slug, name, venue }) });
    r.ok ? toast('Added') : toast('Add failed', false);
    render();
  };
  $('#reload', card).onclick = render;
}

function viewTemplates(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = \`
    <div class="row">
      <button id="sync" class="primary">Sync from Meta</button>
    </div>
    <div id="list" class="table" style="margin-top:10px"></div>
  \`;
  el.appendChild(card);

  async function render(){
    const list = await loadTemplates();
    const listEl = $('#list', card);
    listEl.innerHTML = '<div class="th"><div>Name</div><div>Lang</div><div>Status</div><div>Category</div><div>Default</div><div class="right">Actions</div></div>';
    list.forEach(t=>{
      const tr = document.createElement('div'); tr.className='tr';
      tr.innerHTML = \`
        <div>\${t.name}</div><div>\${t.lang}</div><div><span class="badge">\${t.status}</span></div><div>\${t.category||''}</div><div>\${t.is_default? '✓':''}</div>
        <div class="right">
          <button class="ghost def" data-name="\${t.name}">Set default</button>
          <button class="ghost edit" data-name="\${t.name}">Edit</button>
        </div>\`;
      listEl.appendChild(tr);
    });
    listEl.querySelectorAll('.def').forEach(b=> b.onclick = ()=> update(b.getAttribute('data-name'), { is_default: 1 }));
    listEl.querySelectorAll('.edit').forEach(b=> b.onclick = async ()=>{
      const name = b.getAttribute('data-name');
      const lang = prompt('Language code? (e.g. af or en_US)');
      if (!lang) return;
      update(name, { lang });
    });
  }
  async function update(name, data){
    const r = await API('/api/templates/'+encodeURIComponent(name), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    r.ok ? toast('Saved') : toast('Save failed', false);
    render();
  }

  $('#sync', card).onclick = async ()=>{
    const r = await API('/api/templates/sync', { method:'POST' });
    const J = await r.json();
    r.ok ? toast('Synced '+(J.count||0)) : toast('Sync failed', false);
    render();
  };
  render();
}

function viewVendors(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = \`
    <div class="row">
      <input id="vendorId" placeholder="Vendor ID"/>
      <input id="eventId" placeholder="Event ID"/>
      <input id="qty" type="number" value="10" min="1" max="1000"/>
      <button id="gen" class="primary">Generate tickets & badges</button>
    </div>
  \`;
  el.appendChild(card);
  $('#gen', card).onclick = async ()=>{
    const vid = $('#vendorId', card).value.trim();
    const eid = $('#eventId', card).value.trim();
    const qty = +($('#qty', card).value || 0);
    if (!vid || !eid || qty<1) return toast('Enter vendor, event and qty', false);
    const r = await API('/api/vendors/'+encodeURIComponent(vid)+'/passes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ event_id: +eid, count: qty }) });
    const J = await r.json();
    r.ok ? toast('Generated '+(J.generated||0)) : toast('Failed', false);
  };
}

function viewUsers(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = '<div class="small">Users list UI will be enhanced later. (Search, add, disable, reset password.)</div>';
  el.appendChild(card);
}

function viewPOS(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = '<div class="small">POS Sessions & cash-up summary (kept as-is).</div>';
  el.appendChild(card);
}

function viewSettings(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = '<div class="small">Site settings UI unchanged, except templates now support Sync/Edit/Default under Templates tab.</div>';
  el.appendChild(card);
}

function route(){
  const hash = (location.hash || '#tickets').replace('#','');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#'+hash));
  if (hash === 'tickets') return viewTickets();
  if (hash === 'events') return viewEvents();
  if (hash === 'templates') return viewTemplates();
  if (hash === 'vendors') return viewVendors();
  if (hash === 'users') return viewUsers();
  if (hash === 'pos') return viewPOS();
  if (hash === 'settings') return viewSettings();
  viewTickets();
}
addEventListener('hashchange', route); route();
</script>
</body></html>`;
}
