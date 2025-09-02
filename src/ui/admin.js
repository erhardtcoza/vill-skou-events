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
</style></head><body><div class="wrap">
<h1>Admin</h1>

<section>
  <h2>Create Event</h2>
  <div class="row">
    <input id="slug" placeholder="slug (e.g. skou-2025)"/>
    <input id="name" placeholder="Event name" />
    <input id="venue" placeholder="Venue" />
    <input id="starts" type="datetime-local"/>
    <input id="ends" type="datetime-local"/>
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
    <input id="evId" placeholder="event_id"/>
    <input id="ttName" placeholder="name"/>
    <input id="ttPrice" type="number" placeholder="price cents"/>
    <input id="ttCap" type="number" placeholder="capacity"/>
    <label>Gender?<input id="ttGen" type="checkbox"/></label>
    <button onclick="addTT()">Add</button>
  </div>
</section>

<script>
async function load() {
  const ev = await fetch('/api/admin/events').then(r=>r.json());
  document.getElementById('events').innerHTML =
    '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th></tr>' +
    ev.events.map(e=>\`<tr><td>\${e.id}</td><td>\${e.slug}</td><td>\${e.name}</td>
    <td>\${new Date(e.starts_at*1000).toLocaleString()}</td>
    <td>\${new Date(e.ends_at*1000).toLocaleString()}</td></tr>\`).join('');
  const gs = await fetch('/api/admin/gates').then(r=>r.json());
  document.getElementById('gates').innerHTML = gs.gates.map(g=>\`<li>\${g.id}. \${g.name}</li>\`).join('');
}

async function createEvent(){
  const elStarts = document.getElementById('starts');
  const elEnds   = document.getElementById('ends');
  const startsMs = elStarts.valueAsNumber || Date.parse(elStarts.value || '');
  const endsMs   = elEnds.valueAsNumber   || Date.parse(elEnds.value || '');

  if (!isFinite(startsMs) || !isFinite(endsMs)) {
    msg('evmsg', { ok:false, error:'Please select valid start and end date/times' });
    return;
  }

  const b = {
    slug: v('slug'),
    name: v('name'),
    venue: v('venue'),
    starts_at: Math.floor(startsMs / 1000),
    ends_at:   Math.floor(endsMs   / 1000),
    status: 'active'
  };

  const r = await post('/api/admin/events', b);
  msg('evmsg', r);
  if (r.ok) load();
}

async function addTT(){
  const b = { 
    name: v('ttName'), 
    price_cents: +v('ttPrice'), 
    capacity: +v('ttCap'), 
    requires_gender: document.getElementById('ttGen').checked 
  };
  const r = await post('/api/admin/events/'+v('evId')+'/ticket-types', b);
  alert(JSON.stringify(r));
}

async function addGate(){ 
  const r = await post('/api/admin/gates', {name:v('gatename')}); 
  alert(JSON.stringify(r)); 
  load(); 
}

function v(id){return document.getElementById(id).value}
function msg(id, o){ document.getElementById(id).textContent = JSON.stringify(o,null,2) }
async function post(url, body){ 
  return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.json()) 
}

load();
</script>
</div></body></html>`;
