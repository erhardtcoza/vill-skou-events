// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  body{font-family:system-ui;margin:0;background:#fff}
  .wrap{max-width:1000px;margin:20px auto;padding:16px}
  h2{margin-top:28px}
  input,button,select{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}
  table{width:100%;border-collapse:collapse} td,th{padding:8px;border-bottom:1px solid #eee}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .muted{color:#6b7280}
  .err{color:#b00020}
  .ok{color:#0a7d2b}
</style></head><body><div class="wrap">
<h1>Admin</h1>

<section>
  <h2>Create Event</h2>
  <div class="row">
    <input id="slug" placeholder="slug (e.g. skou-2025)"/>
    <input id="name" placeholder="Event name" />
    <input id="venue" placeholder="Venue" />
    <!-- Dates only -->
    <label>Start date <input id="startDate" type="date"/></label>
    <label>End date <input id="endDate" type="date"/></label>
    <button onclick="createEvent()">Create</button>
  </div>
  <pre id="evmsg"></pre>
</section>

<section>
  <h2>Events</h2>
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
    <input id="ttName" placeholder="name"/>
    <input id="ttPrice" type="number" placeholder="price cents"/>
    <input id="ttCap" type="number" placeholder="capacity"/>
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
  // dateStr is "YYYY-MM-DD". Build a local Date (not UTC) to avoid Safari quirks.
  if (!dateStr) return NaN;
  const [y,m,d] = dateStr.split('-').map(n=>parseInt(n,10));
  if (!y || !m || !d) return NaN;
  const dt = endOfDay ? new Date(y, m-1, d, 23, 59, 0, 0) : new Date(y, m-1, d, 0, 0, 0, 0);
  return dt.getTime();
}

async function load() {
  // Load events
  const ev = await fetch('/api/admin/events').then(r=>r.json());
  _events = ev.events || [];
  document.getElementById('events').innerHTML =
    '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th></tr>' +
    _events.map(e=>\`<tr><td>\${e.id}</td><td>\${e.slug}</td><td>\${e.name}</td>
    <td>\${new Date(e.starts_at*1000).toLocaleString()}</td>
    <td>\${new Date(e.ends_at*1000).toLocaleString()}</td></tr>\`).join('');

  setEventSelect();

  // Load gates
  const gs = await fetch('/api/admin/gates').then(r=>r.json());
  document.getElementById('gates').innerHTML = gs.gates.map(g=>\`<li>\${g.id}. \${g.name}</li>\`).join('');
}

function setEventSelect(preferId){
  const sel = document.getElementById('evSelect');
  const eventsSorted = [..._events].sort((a,b)=> (b.starts_at||0) - (a.starts_at||0));
  sel.innerHTML = eventsSorted.map(e=>\`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`).join('') || '<option value="">No events</option>';
  if (preferId) sel.value = String(preferId);
  if (!sel.value && eventsSorted.length) sel.value = String(eventsSorted[0].id);
}

async function createEvent(){
  const startMs = parseLocalDateToMs(document.getElementById('startDate').value, false);
  const endMs   = parseLocalDateToMs(document.getElementById('endDate').value, true);

  if (!isFinite(startMs) || !isFinite(endMs)) {
    msg('evmsg', { ok:false, error:'Please select valid start and end dates (YYYY-MM-DD)' });
    return;
  }
  if (endMs < startMs) {
    msg('evmsg', { ok:false, error:'End date cannot be before start date' });
    return;
  }

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
    // reset fields lightly
    document.getElementById('slug').value = '';
    document.getElementById('name').value = '';
    document.getElementById('venue').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
  }
}

async function addTT(){
  const eventId = Number(document.getElementById('evSelect').value || 0);
  if (!eventId) { document.getElementById('ttmsg').textContent = 'Please create/select an event first.'; return; }

  const b = { 
    name: v('ttName'), 
    price_cents: +v('ttPrice'), 
    capacity: +v('ttCap'), 
    requires_gender: document.getElementById('ttGen').checked 
  };
  if (!b.name || !b.price_cents || !b.capacity) {
    document.getElementById('ttmsg').textContent = 'Name, price, and capacity are required.';
    return;
  }

  const r = await post('/api/admin/events/'+eventId+'/ticket-types', b);
  document.getElementById('ttmsg').textContent = JSON.stringify(r);
  if (r.ok) {
    document.getElementById('ttName').value = '';
    document.getElementById('ttPrice').value = '';
    document.getElementById('ttCap').value = '';
    document.getElementById('ttGen').checked = false;
  }
}

async function addGate(){ 
  const r = await post('/api/admin/gates', {name:v('gatename')}); 
  alert(JSON.stringify(r)); 
  load(); 
}

function v(id){return document.getElementById(id).value}
function msg(id, o){ 
  const el = document.getElementById(id);
  el.textContent = JSON.stringify(o,null,2);
  el.className = o.ok ? 'ok' : 'err';
}
async function post(url, body){ 
  return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.json()) 
}

load();
</script>
</div></body></html>`;
