// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --bg:#f8fafc; --pill:#eef2ff; --green:#0a7d2b; }
  *{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#fff;color:var(--ink)}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  h1{margin:0 0 16px}
  h2{margin:24px 0 12px}
  h3{margin:10px 0}
  .tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .tabbtn{border:1px solid var(--line);background:var(--pill);padding:10px 14px;border-radius:999px;cursor:pointer}
  .tabbtn[aria-selected="true"]{background:#fff;border-color:#c7d2fe;box-shadow:0 1px 0 rgba(0,0,0,.02)}
  .section{display:none}
  .section.active{display:block}
  input,button,select,textarea{padding:10px;border:1px solid #d1d5db;border-radius:10px;margin:4px;background:#fff}
  button.primary{background:var(--green);color:#fff;border:0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  td,th{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  .muted{color:var(--muted)}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .right{margin-left:auto}
  .panel{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  @media (max-width:820px){ .grid2{grid-template-columns:1fr} }
  /* Modal */
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;padding:18px}
  .modal.show{display:flex}
  .card{background:#fff;border-radius:14px;border:1px solid var(--line);padding:16px;max-width:640px;width:100%}
  .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>

  <!-- Tabs -->
  <div class="tabs" role="tablist">
    <button class="tabbtn" data-tab="site" aria-selected="true">Site Settings</button>
    <button class="tabbtn" data-tab="events">Events</button>
    <button class="tabbtn" data-tab="pos">POS Admin</button>
    <button class="tabbtn" data-tab="visitors">Visitors</button>
    <button class="tabbtn" data-tab="yoco">Yoco</button>
    <button class="tabbtn" data-tab="tickets">Tickets</button>
    <button class="tabbtn" data-tab="vendors">Vendors</button>
  </div>

  <!-- Site tab -->
  <section id="tab-site" class="section active">
    <h2>Site Settings</h2>
    <div class="row">
      <input id="site_name" placeholder="Site name"/>
      <input id="site_logo" placeholder="Logo URL"/>
      <input id="site_banner" placeholder="Banner URL"/>
      <button class="primary" onclick="saveSettings()">Save</button>
    </div>
    <pre id="sitemsg" class="muted"></pre>
  </section>

  <!-- Events tab -->
  <section id="tab-events" class="section">
    <div class="row">
      <h2 style="margin-right:auto">Events</h2>
      <button onclick="openCreateModal()">Create event</button>
    </div>

    <table id="events"></table>

    <!-- Edit Event + nested Ticket Types & Gates -->
    <div id="editPanel" class="panel" style="display:none">
      <h3>Edit Event</h3>
      <input id="ed_id" type="hidden"/>
      <div class="grid2">
        <input id="ed_slug" placeholder="slug"/>
        <input id="ed_name" placeholder="name"/>
        <input id="ed_venue" placeholder="venue"/>
        <label>Start date <input id="ed_start" type="date"/></label>
        <label>End date <input id="ed_end" type="date"/></label>
      </div>
      <div class="grid2">
        <input id="ed_hero" placeholder="Hero image URL"/>
        <input id="ed_poster" placeholder="Poster image URL"/>
      </div>
      <label class="muted">Gallery URLs (one per line, max 8)
        <textarea id="ed_gallery" rows="4"></textarea>
      </label>
      <div class="row actions">
        <span id="edmsg" class="muted" style="margin-right:auto"></span>
        <button onclick="cancelEdit()">Cancel</button>
        <button class="primary" onclick="saveEdit()">Save</button>
      </div>

      <div class="grid2">
        <div class="panel">
          <h3>Add Ticket Type</h3>
          <div class="row">
            <input id="ttName" placeholder="name (e.g. Algemene Toegang)"/>
            <input id="ttPriceRand" type="number" step="0.01" placeholder="price (R) — leave blank for FREE"/>
            <label>Gender? <input id="ttGen" type="checkbox"/></label>
            <button onclick="addTT()">Add</button>
          </div>
          <p class="muted" id="ttmsg"></p>
        </div>

        <div class="panel">
          <h3>Gates</h3>
          <div class="row">
            <input id="gatename" placeholder="New gate name"/>
            <button onclick="addGate()">Add gate</button>
          </div>
          <ul id="gates" class="muted" style="margin:6px 0 0 10px"></ul>
        </div>
      </div>
    </div>
  </section>

  <!-- POS Admin tab -->
  <section id="tab-pos" class="section">
    <div class="row">
      <h2>POS Admin</h2>
      <button class="right" onclick="loadCashups()">Reload</button>
    </div>
    <table id="cashups"></table>
  </section>

  <!-- Placeholders -->
  <section id="tab-visitors" class="section">
    <h2>Visitors</h2>
    <p class="muted">Live in/out dashboard coming next.</p>
  </section>
  <section id="tab-yoco" class="section">
    <h2>Yoco</h2>
    <p class="muted">Gateway keys & webhooks config (placeholder).</p>
  </section>
  <section id="tab-tickets" class="section">
    <h2>Tickets</h2>
    <p class="muted">Search & manage issued tickets (placeholder).</p>
  </section>
  <section id="tab-vendors" class="section">
    <h2>Vendors</h2>
    <p class="muted">Vendor onboarding & staff passes (placeholder).</p>
  </section>
</div>

<!-- Create Event Modal -->
<div id="createModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="createTitle">
  <div class="card">
    <h3 id="createTitle">Create Event</h3>
    <div class="grid2">
      <input id="slug" placeholder="slug (e.g. skou-2025)"/>
      <input id="name" placeholder="Event name"/>
      <input id="venue" placeholder="Venue"/>
      <label>Start date <input id="startDate" type="date"/></label>
      <label>End date <input id="endDate" type="date"/></label>
    </div>
    <div class="actions">
      <button onclick="closeCreateModal()">Cancel</button>
      <button class="primary" onclick="createEvt()">Create</button>
    </div>
    <pre id="evmsg" class="muted"></pre>
  </div>
</div>

<script>
/* ---------- Tabs ---------- */
const tabs = Array.from(document.querySelectorAll('.tabbtn'));
tabs.forEach(btn=>{
  btn.addEventListener('click',()=>{
    tabs.forEach(b=>b.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    const id = btn.dataset.tab;
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.getElementById('tab-'+id).classList.add('active');
    // lazy load on switch
    if(id==='pos') loadCashups();
    if(id==='site') loadSettings();
    if(id==='events') { loadEvents(); loadGates(); }
  });
});

/* ---------- Helpers ---------- */
function v(id){return document.getElementById(id).value}
function setv(id,val){document.getElementById(id).value = val ?? ''}
function msg(id,o){ document.getElementById(id).textContent = typeof o==='string' ? o : JSON.stringify(o,null,2) }
function parseLocalDateToMs(dateStr,endOfDay=false){
  if(!dateStr) return NaN;
  const [y,m,d] = dateStr.split('-').map(n=>parseInt(n,10));
  if(!y||!m||!d) return NaN;
  const dt = endOfDay ? new Date(y,m-1,d,23,59,0,0) : new Date(y,m-1,d,0,0,0,0);
  return dt.getTime();
}
function msToLocalDateInput(ms){
  const d=new Date(ms);
  return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`;
}
async function getJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function post(url,body){ return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()) }
async function put(url,body){ return fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()) }

/* ---------- Site Settings ---------- */
async function loadSettings(){
  try{
    const res = await fetch('/api/admin/settings').then(r=>r.json());
    if(!res.ok) return; // nothing saved yet
    setv('site_name', res.settings?.name||'');
    setv('site_logo', res.settings?.logo_url||'');
    setv('site_banner', res.settings?.banner_url||'');
  }catch(e){ /* ignore */ }
}
async function saveSettings(){
  const r = await post('/api/admin/settings', {
    name:v('site_name'), logo_url:v('site_logo'), banner_url:v('site_banner')
  });
  msg('sitemsg', r.ok ? 'Saved' : (r.error||'Failed'));
}

/* ---------- Events ---------- */
let _events = [];
async function loadEvents(){
  const res = await fetch('/api/admin/events').then(r=>r.json());
  _events = res.events || [];
  renderEvents();
}
function renderEvents(){
  const rows=_events.map(e=>\`
    <tr>
      <td>\${e.id}</td>
      <td>\${e.slug}</td>
      <td>\${e.name}<div class="muted">\${e.venue||''}</div></td>
      <td>\${new Date(e.starts_at*1000).toLocaleDateString()}</td>
      <td>\${new Date(e.ends_at*1000).toLocaleDateString()}</td>
      <td>
        <button onclick="editEvent(\${e.id})">Edit</button>
        <button onclick="deleteEvent(\${e.id})">Delete</button>
      </td>
    </tr>\`).join('');
  document.getElementById('events').innerHTML =
    '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th><th></th></tr>' + rows;
}
function openCreateModal(){ document.getElementById('createModal').classList.add('show'); }
function closeCreateModal(){ document.getElementById('createModal').classList.remove('show'); msg('evmsg',''); }
async function createEvt(){
  const startMs=parseLocalDateToMs(v('startDate')), endMs=parseLocalDateToMs(v('endDate'),true);
  if(!isFinite(startMs)||!isFinite(endMs)) return msg('evmsg','Please select valid start/end dates');
  if(endMs<startMs) return msg('evmsg','End date cannot be before start date');
  const body={ slug:v('slug'), name:v('name'), venue:v('venue'),
    starts_at:Math.floor(startMs/1000), ends_at:Math.floor(endMs/1000), status:'active' };
  const r=await post('/api/admin/events', body);
  msg('evmsg', r);
  if(r.ok){ closeCreateModal(); await loadEvents(); }
}
async function editEvent(id){
  const res = await fetch('/api/admin/events/'+id).then(r=>r.json());
  if(!res.ok) return alert('Event not found');
  const e=res.event;
  setv('ed_id', e.id); setv('ed_slug', e.slug||''); setv('ed_name', e.name||''); setv('ed_venue', e.venue||'');
  setv('ed_start', msToLocalDateInput((e.starts_at||0)*1000)); setv('ed_end', msToLocalDateInput((e.ends_at||0)*1000));
  setv('ed_hero', e.hero_url||''); setv('ed_poster', e.poster_url||'');
  const gallery = tryParseJSON(e.gallery_urls)||[];
  document.getElementById('ed_gallery').value = gallery.slice(0,8).join('\\n');
  document.getElementById('editPanel').style.display='block';
}
function cancelEdit(){ document.getElementById('editPanel').style.display='none'; }
async function saveEdit(){
  const id = +document.getElementById('ed_id').value; if(!id) return;
  const b = {
    slug:v('ed_slug'), name:v('ed_name'), venue:v('ed_venue'),
    starts_at:Math.floor(parseLocalDateToMs(v('ed_start'))/1000),
    ends_at:Math.floor(parseLocalDateToMs(v('ed_end'),true)/1000),
    hero_url:v('ed_hero'), poster_url:v('ed_poster'),
    gallery_urls: JSON.stringify(
      document.getElementById('ed_gallery').value.split('\\n').map(s=>s.trim()).filter(Boolean).slice(0,8)
    )
  };
  const r = await put('/api/admin/events/'+id, b);
  document.getElementById('edmsg').textContent = r.ok ? 'Saved' : (r.error||'Error');
  if(r.ok) loadEvents();
}
async function deleteEvent(id){
  if(!confirm('Delete event?')) return;
  await fetch('/api/admin/events/'+id, { method:'DELETE' });
  await loadEvents();
}

/* Ticket types (under Edit) */
async function addTT(){
  const id = +document.getElementById('ed_id').value; if(!id) return alert('Open an event to edit first.');
  const price = parseFloat(v('ttPriceRand')||'0');
  const body = { name:v('ttName'), price_cents:Math.round(price*100), requires_gender:document.getElementById('ttGen').checked };
  const r = await post('/api/admin/events/'+id+'/ticket-types', body);
  document.getElementById('ttmsg').textContent = r.ok ? 'Added' : (r.error||'Failed');
  if(r.ok){ setv('ttName',''); setv('ttPriceRand',''); document.getElementById('ttGen').checked=false; }
}

/* Gates (global; shown under Edit for convenience) */
async function loadGates(){
  try{
    const gs = await getJSON('/api/admin/gates');
    document.getElementById('gates').innerHTML = (gs.gates||[]).map(g=>\`<li>\${g.id}. \${g.name}</li>\`).join('');
  }catch(e){
    document.getElementById('gates').textContent='—';
  }
}
async function addGate(){
  const r = await post('/api/admin/gates', { name:v('gatename') });
  alert(r.ok ? 'Gate added' : (r.error||'Failed'));
  setv('gatename','');
  loadGates();
}

/* ---------- POS Admin ---------- */
async function loadCashups(){
  try{
    const res = await fetch('/api/admin/pos/cashups').then(r=>r.json());
    if(!res.ok) { document.getElementById('cashups').innerHTML = '<tr><td>Failed to load</td></tr>'; return; }
    const rows = res.cashups.map(c => \`
      <tr>
        <td>\${c.id}</td>
        <td>\${c.cashier_name}</td>
        <td>\${c.gate_name}</td>
        <td>\${new Date(c.opened_at*1000).toLocaleString()}</td>
        <td>\${c.closed_at ? new Date(c.closed_at*1000).toLocaleString() : '-'}</td>
        <td>R\${(c.total_cash/100).toFixed(2)}</td>
        <td>R\${(c.total_card/100).toFixed(2)}</td>
        <td>R\${((c.total_cash+c.total_card)/100).toFixed(2)}</td>
      </tr>\`).join('');
    document.getElementById('cashups').innerHTML =
      '<tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Cash</th><th>Card</th><th>Total</th></tr>' + rows;
  }catch(e){
    document.getElementById('cashups').innerHTML = '<tr><td>'+String(e)+'</td></tr>';
  }
}

/* ---------- Boot ---------- */
function tryParseJSON(s){try{return JSON.parse(s)}catch{return null}}
(async function boot(){
  // default: load Site + Events
  loadSettings();
  loadEvents();
  loadGates();
})();
</script>
</body></html>`;
