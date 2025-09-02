// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  body{font-family:system-ui;margin:0;background:#fff}
  .wrap{max-width:1000px;margin:20px auto;padding:16px}
  h2{margin-top:28px}
  input,button,select,textarea{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}
  table{width:100%;border-collapse:collapse} td,th{padding:8px;border-bottom:1px solid #eee;vertical-align:top}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .muted{color:#6b7280}
  .err{color:#b00020}
  .ok{color:#0a7d2b}
  .actions button{padding:6px 10px}
  .panel{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:8px 0}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  @media (max-width:800px){ .grid2{grid-template-columns:1fr} }
</style></head><body><div class="wrap">
<h1>Admin</h1>

<section>
  <h2>Create Event</h2>
  <div class="row">
    <input id="slug" placeholder="slug (e.g. skou-2025)"/>
    <input id="name" placeholder="Event name" />
    <input id="venue" placeholder="Venue" />
    <label>Start date <input id="startDate" type="date"/></label>
    <label>End date <input id="endDate" type="date"/></label>
    <button onclick="createEvt()">Create</button>
  </div>
  <pre id="evmsg"></pre>
</section>

<section>
  <h2>Events</h2>
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
      <input id="ed_hero" placeholder="Hero image URL (wide banner)"/>
      <input id="ed_poster" placeholder="Poster image URL (card/cover)"/>
    </div>
    <label class="muted">Gallery URLs (max 8, one per line)
      <textarea id="ed_gallery" rows="4" placeholder="https://.../img1.jpg
https://.../img2.jpg"></textarea>
    </label>
    <div class="row">
      <button onclick="saveEdit()">Save</button>
      <button onclick="cancelEdit()">Cancel</button>
      <span id="edmsg" class="muted"></span>
    </div>
  </div>

  <table id="events"></table>
</section>

<section>
  <h2>Gates</h2>
  <div class="row">
    <input id="gatename" placeholder="New gate name"/>
    <button onclick="addGate()">Add gate</button>
  </div>
  <ul id="gates"></ul>
</section>

<section>
  <h2>Add Ticket Type</h2>
  <div class="row">
    <label class="muted">Event
      <select id="evSelect"></select>
    </label>
    <input id="ttName" placeholder="name (e.g. Algemene Toegang)"/>
    <input id="ttPriceRand" type="number" step="0.01" placeholder="price (R) — leave blank for FREE"/>
    <label>Gender?
      <input id="ttGen" type="checkbox"/>
    </label>
    <button onclick="addTT()">Add</button>
  </div>
  <p class="muted" id="ttmsg"></p>
</section>

<script>
let _events = [];

function parseLocalDateToMs(dateStr, endOfDay=false){
  if (!dateStr) return NaN;
  const [y,m,d] = dateStr.split('-').map(n=>parseInt(n,10));
  if (!y || !m || !d) return NaN;
  const dt = endOfDay ? new Date(y, m-1, d, 23, 59, 0, 0) : new Date(y, m-1, d, 0, 0, 0, 0);
  return dt.getTime();
}
function msToLocalDateInput(ms){
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return \`\${y}-\${m}-\${da}\`;
}

async function load() {
  const ev = await fetch('/api/admin/events').then(r=>r.json());
  _events = ev.events || [];
  renderEventsTable();

  setEventSelect();

  const gs = await fetch('/api/admin/gates').then(r=>r.json());
  document.getElementById('gates').innerHTML = gs.gates.map(g=>\`<li>\${g.id}. \${g.name}</li>\`).join('');
}

function renderEventsTable(){
  const rows = _events.map(e=>\`
    <tr>
      <td>\${e.id}</td>
      <td>\${e.slug}</td>
      <td>\${e.name}<div class="muted">\${e.venue||''}</div></td>
      <td>\${new Date(e.starts_at*1000).toLocaleDateString()}</td>
      <td>\${new Date(e.ends_at*1000).toLocaleDateString()}</td>
      <td class="actions">
        <button onclick="editEvent(\${e.id})">Edit</button>
        <button onclick="deleteEvent(\${e.id})">Delete</button>
      </td>
    </tr>\`).join('');
  document.getElementById('events').innerHTML =
    '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th><th></th></tr>' + rows;
}

function setEventSelect(preferId){
  const sel = document.getElementById('evSelect');
  const eventsSorted = [..._events].sort((a,b)=> (b.starts_at||0) - (a.starts_at||0));
  sel.innerHTML = eventsSorted.map(e=>\`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`).join('') || '<option value="">No events</option>';
  if (preferId) sel.value = String(preferId);
  if (!sel.value && eventsSorted.length) sel.value = String(eventsSorted[0].id);
}

// Create
async function createEvt(){
  const startMs = parseLocalDateToMs(document.getElementById('startDate').value, false);
  const endMs   = parseLocalDateToMs(document.getElementById('endDate').value, true);

  if (!isFinite(startMs) || !isFinite(endMs)) { msg('evmsg', { ok:false, error:'Please select valid start and end dates' }); return; }
  if (endMs < startMs) { msg('evmsg', { ok:false, error:'End date cannot be before start date' }); return; }

  const b = {
    slug: v('slug'),
    name: v('name'),
    venue: v('venue'),
    starts_at: Math.floor(startMs / 1000),
    ends_at:   Math.floor(endMs   / 1000),
    status: 'active'
  };

  const r = await post('/api/admin/events', b);
  msg('evmsg', r);
  if (r.ok) {
    await load();
    setEventSelect(r.id);
    ['slug','name','venue','startDate','endDate'].forEach(id=>document.getElementById(id).value='');
  }
}

// Edit
async function editEvent(id){
  const res = await fetch('/api/admin/events/'+id).then(r=>r.json());
  if (!res.ok) return alert('Event not found');
  const e = res.event;
  document.getElementById('ed_id').value = e.id;
  document.getElementById('ed_slug').value = e.slug||'';
  document.getElementById('ed_name').value = e.name||'';
  document.getElementById('ed_venue').value = e.venue||'';
  document.getElementById('ed_start').value = msToLocalDateInput((e.starts_at||0)*1000);
  document.getElementById('ed_end').value   = msToLocalDateInput((e.ends_at||0)*1000);
  document.getElementById('ed_hero').value  = e.hero_url||'';
  document.getElementById('ed_poster').value= e.poster_url||'';
  const gallery = (e.gallery_urls ? tryParseJSON(e.gallery_urls) : []) || [];
  document.getElementById('ed_gallery').value = (gallery||[]).slice(0,8).join('\\n');
  document.getElementById('editPanel').style.display='block';
  document.getElementById('edmsg').textContent='';
}
function cancelEdit(){ document.getElementById('editPanel').style.display='none'; }

async function saveEdit(){
  const id = Number(document.getElementById('ed_id').value||0);
  if (!id) return;

  const startMs
