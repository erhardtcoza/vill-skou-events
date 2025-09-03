// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#fff;color:#111}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  h1{margin:0 0 16px}
  .tabs{display:flex;gap:8px;margin-bottom:16px}
  .tab{padding:8px 12px;border-radius:999px;border:1px solid #e5e7eb;background:#f3f4f6;cursor:pointer}
  .tab.active{background:#0a7d2b;color:#fff;border-color:#0a7d2b}
  .card{border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:12px 0;background:#fff}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #f1f5f9;text-align:left}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  input,button,select{padding:10px;border:1px solid #cbd5e1;border-radius:8px}
  button.primary{background:#0a7d2b;color:#fff;border-color:#0a7d2b}
  .muted{color:#6b7280}
  .err{color:#b00020;white-space:pre-wrap}
</style>
</head><body><div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <button class="tab active" data-tab="events">Events</button>
    <button class="tab" data-tab="pos">POS Admin</button>
    <button class="tab" data-tab="site">Site settings</button>
  </div>

  <div id="content"></div>
  <div id="msg" class="err"></div>
</div>

<script>
let state = { tab: 'events', events: [], gates: [], error: '' };

function setTab(t){
  state.tab = t;
  document.querySelectorAll('.tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===t);
  });
  render();
}

async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const txt = await r.text();
    throw new Error('Non-JSON response\\n' + txt.slice(0,500));
  }
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}

async function load(){
  try{
    const ev = await fetchJSON('/api/admin/events');
    state.events = ev.events || [];
    const gs = await fetchJSON('/api/admin/gates');
    state.gates = gs.gates || [];
    state.error = '';
  }catch(e){
    state.error = String(e.message || e);
  }
  render();
}

function render(){
  document.getElementById('msg').textContent = state.error ? ('Error: ' + state.error) : '';
  if (state.tab === 'events') renderEvents();
  else if (state.tab === 'pos') renderPOS();
  else renderSite();
}

function renderEvents(){
  const rows = (state.events||[]).map(e=>\`
    <tr>
      <td>\${e.id}</td>
      <td>\${e.slug}</td>
      <td>\${e.name}<div class="muted">\${e.venue||''}</div></td>
      <td>\${fmtDate(e.starts_at)}</td>
      <td>\${fmtDate(e.ends_at)}</td>
      <td><button onclick="editEvent(\${e.id})">Edit</button>
          <button onclick="delEvent(\${e.id})">Delete</button></td>
    </tr>\`).join('');
  document.getElementById('content').innerHTML = \`
    <div class="card">
      <h2>Events</h2>
      <table>
        <thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th></th></tr></thead>
        <tbody>\${rows || ''}</tbody>
      </table>
      <div class="row" style="margin-top:12px">
        <input id="slug" placeholder="slug (e.g. skou-2025)"/>
        <input id="name" placeholder="Event name"/>
        <input id="venue" placeholder="Venue"/>
        <input id="start" type="date"/>
        <input id="end" type="date"/>
        <button class="primary" onclick="createEvent()">Create</button>
      </div>
    </div>\`;
}

function renderPOS(){
  document.getElementById('content').innerHTML = \`
    <div class="card"><h2>POS Admin</h2>
      <p class="muted">Cashups & reports coming here.</p>
    </div>\`;
}

function renderSite(){
  document.getElementById('content').innerHTML = \`
    <div class="card"><h2>Site settings</h2>
      <p class="muted">Placeholder.</p>
    </div>\`;
}

function fmtDate(sec){
  if (!sec) return '';
  const d = new Date(sec*1000);
  return d.toLocaleDateString();
}

async function createEvent(){
  const start = document.getElementById('start').value;
  const end = document.getElementById('end').value;
  const starts_at = start ? Math.floor(new Date(start+'T00:00:00').getTime()/1000) : 0;
  const ends_at = end ? Math.floor(new Date(end+'T23:59:00').getTime()/1000) : 0;
  try{
    await fetchJSON('/api/admin/events', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        slug: document.getElementById('slug').value.trim(),
        name: document.getElementById('name').value.trim(),
        venue: document.getElementById('venue').value.trim(),
        starts_at, ends_at
      })
    });
    await load();
  }catch(e){ state.error = String(e.message||e); render(); }
}

async function delEvent(id){
  if (!confirm('Delete event '+id+'?')) return;
  try{
    await fetchJSON('/api/admin/events/'+id, { method:'DELETE' });
    await load();
  }catch(e){ state.error = String(e.message||e); render(); }
}

function editEvent(id){
  // minimal for now – could open a modal
  alert('Edit UI coming soon (event id '+id+')');
}

document.addEventListener('click', (e)=>{
  const b = e.target.closest('.tab'); if (!b) return;
  setTab(b.dataset.tab);
});

load();
</script>
</body></html>`;
