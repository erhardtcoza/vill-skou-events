// /src/ui/admin.js
export function adminHTML() {
  return /*html*/ `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Admin · Villiersdorp Skou</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{--green:#1f7a37;--soft:#eef2f7;--line:#e5e7eb;--txt:#111827}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;color:var(--txt);background:#fff}
    .wrap{max-width:1100px;margin:32px auto;padding:0 16px}
    h1{margin:0 0 18px;font-size:32px}
    .tabs{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
    .tab{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer}
    .tab.active{background:#dff3e5;border-color:#b8e5c7}
    .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:16px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:10px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;vertical-align:top}
    label{display:block;font-size:12px;color:#6b7280;margin:6px 0}
    input,select{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;background:#fff}
    button{border:0;border-radius:10px;background:#e5e7eb;padding:9px 14px;font-weight:600;cursor:pointer}
    .primary{background:#1f7a37;color:#fff}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
    .row .span2{grid-column:span 2}
    .row .span4{grid-column:1/-1}
    .error{color:#b91c1c;margin-top:8px}
    .ok{color:#065f46;margin-top:8px}
    .right{display:flex;gap:8px;justify-content:flex-end}
    .muted{color:#6b7280}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Admin</h1>
    <div class="tabs">
      <button class="tab active" data-tab="events">Events</button>
      <button class="tab" data-tab="pos">POS Admin</button>
      <button class="tab" data-tab="site">Site settings</button>
      <button class="tab" data-tab="users">Users</button>
    </div>

    <!-- EVENTS -->
    <section id="tab-events" class="card">
      <h2 style="margin:0 0 10px">Events</h2>
      <div class="row">
        <div><label>Slug</label><input id="evSlug" placeholder="skou-2025"></div>
        <div class="span2"><label>Name</label><input id="evName" placeholder="Villiersdorp Skou 2025"></div>
        <div><label>Venue</label><input id="evVenue" placeholder="Skougrond"></div>
        <div><label>Start</label><input id="evStart" type="date"></div>
        <div><label>End</label><input id="evEnd" type="date"></div>
        <div class="span4 right"><button id="evCreate" class="primary">Create</button></div>
      </div>
      <div id="evMsg" class="error"></div>

      <table class="mt">
        <thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
        <tbody id="evTbody"><tr><td class="muted" colspan="7">Loading…</td></tr></tbody>
      </table>

      <div class="card" id="ttBlock" style="margin-top:18px;display:none">
        <h3 style="margin:0 0 8px">Ticket types for <span id="ttEventName"></span></h3>
        <div class="row">
          <div class="span2"><label>Name</label><input id="ttName" placeholder="Volwassenes"></div>
          <div><label>Price (R)</label><input id="ttPrice" type="number" step="1" min="0" placeholder="150"></div>
          <div><label>Gender req</label>
            <select id="ttGender"><option value="">No</option><option value="1">Yes</option></select>
          </div>
          <div class="span4 right"><button id="ttAdd" class="primary">Add ticket type</button></div>
        </div>
        <div id="ttMsg" class="error"></div>
        <table class="mt">
          <thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Gender</th></tr></thead>
          <tbody id="ttTbody"><tr><td class="muted" colspan="4">No items</td></tr></tbody>
        </table>
      </div>
    </section>

    <!-- POS ADMIN -->
    <section id="tab-pos" class="card" style="display:none">
      <h2 style="margin:0 0 10px">POS Sessions</h2>
      <div class="row">
        <div><label>From</label><input id="posFrom" type="date"></div>
        <div><label>To</label><input id="posTo" type="date"></div>
        <div class="span2 right"><button id="posReload" class="primary">Reload</button></div>
      </div>
      <table class="mt">
        <thead><tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Cash</th><th>Card</th></tr></thead>
        <tbody id="posTbody"><tr><td class="muted" colspan="7">Loading…</td></tr></tbody>
      </table>
    </section>

    <!-- SITE SETTINGS -->
    <section id="tab-site" class="card" style="display:none">
      <h2 style="margin:0 0 10px">Site settings</h2>
      <div class="row">
        <div class="span2"><label>Site name</label><input id="siteName" placeholder="Villiersdorp Skou Tickets"></div>
        <div class="span2"><label>Public base URL</label><input id="siteBase" placeholder="https://tickets.villiersdorpskou.co.za"></div>
        <div class="span4 right"><button id="siteSave" class="primary">Save</button></div>
      </div>
      <div id="siteMsg" class="ok"></div>
    </section>

    <!-- USERS -->
    <section id="tab-users" class="card" style="display:none">
      <h2 style="margin:0 0 10px">Users</h2>
      <div class="row">
        <div><label>Username</label><input id="uName" placeholder="cashier01"></div>
        <div><label>Role</label>
          <select id="uRole"><option value="pos">pos</option><option value="scan">scan</option><option value="admin">admin</option></select>
        </div>
        <div class="span2"><label>Password</label><input id="uPass" type="password" placeholder="********"></div>
        <div class="span4 right"><button id="uCreate" class="primary">Create</button></div>
      </div>
      <div id="uMsg" class="error"></div>
      <table class="mt">
        <thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
        <tbody id="uTbody"><tr><td class="muted" colspan="3">Loading…</td></tr></tbody>
      </table>
    </section>
  </div>

<script type="module">
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
let EVENTS = [];
let CURR = null;

// Tabs
$$('.tab').forEach(b=>{
  b.addEventListener('click', ()=>{
    $$('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const k = b.dataset.tab;
    ['events','pos','site','users'].forEach(id=>{
      const el = $('#tab-'+id);
      el.style.display = (id===k)?'block':'none';
    });
    if (k==='events') loadEvents();
    if (k==='pos') loadPOS();
    if (k==='users') loadUsers();
  });
});

// --- EVENTS
async function loadEvents() {
  const tb = $('#evTbody');
  tb.innerHTML = '<tr><td class="muted" colspan="7">Loading…</td></tr>';
  try{
    const r = await fetch('/api/admin/events', { credentials:'include' });
    if (r.status===401) { location.href='/admin/login'; return; }
    const d = await r.json();
    if (!d.ok) throw new Error(d.error||'Failed');
    EVENTS = d.events || [];
    tb.innerHTML = (EVENTS.length? '' : '<tr><td class="muted" colspan="7">No events</td></tr>');
    EVENTS.forEach(e=>{
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>'+e.id+'</td>'+
        '<td>'+e.slug+'</td>'+
        '<td><div>'+e.name+'</div><div class="muted">'+(e.venue||'')+'</div></td>'+
        '<td>'+fmtDate(e.starts_at)+'</td>'+
        '<td>'+fmtDate(e.ends_at)+'</td>'+
        '<td>'+(e.status||'')+'</td>'+
        '<td><button data-eid="'+e.id+'" class="ttBtn">Ticket types</button></td>';
      tb.appendChild(tr);
    });
    $$('.ttBtn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = Number(btn.dataset.eid);
        CURR = EVENTS.find(x=>x.id===id) || null;
        if (CURR) showTicketTypes();
      });
    });
  }catch(e){
    tb.innerHTML = '<tr><td class="muted" colspan="7">Error loading</td></tr>';
  }
}

function fmtDate(sec){ if(!sec) return ''; try{ return new Date(sec*1000).toISOString().slice(0,10);}catch{return ''} }

$('#evCreate').addEventListener('click', async ()=>{
  $('#evMsg').textContent='';
  const body = {
    slug: $('#evSlug').value.trim(),
    name: $('#evName').value.trim(),
    venue: $('#evVenue').value.trim(),
    starts_at: $('#evStart').value? Math.floor(new Date($('#evStart').value).getTime()/1000): null,
    ends_at: $('#evEnd').value? Math.floor(new Date($('#evEnd').value).getTime()/1000): null
  };
  if (!body.slug || !body.name) { $('#evMsg').textContent='Slug and name required'; return; }
  try{
    const r = await fetch('/api/admin/events', {
      method:'POST', credentials:'include',
      headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if(!r.ok || !d.ok) throw new Error(d.error||'Create failed');
    $('#evSlug').value=''; $('#evName').value=''; $('#evVenue').value=''; $('#evStart').value=''; $('#evEnd').value='';
    loadEvents();
  }catch(e){ $('#evMsg').textContent = e.message || 'Error'; }
});

async function showTicketTypes(){
  $('#ttBlock').style.display='block';
  $('#ttEventName').textContent = CURR.name + ' ('+CURR.slug+')';
  await refreshTT();
}

async function refreshTT(){
  const tb = $('#ttTbody');
  tb.innerHTML = '<tr><td class="muted" colspan="4">Loading…</td></tr>';
  try{
    const r = await fetch('/api/admin/events/'+CURR.id+'/ticket-types', { credentials:'include' });
    const d = await r.json();
    if(!d.ok) throw new Error(d.error||'Failed');
    const rows = d.ticket_types || [];
    tb.innerHTML = rows.length ? '' : '<tr><td class="muted" colspan="4">No items</td></tr>';
    rows.forEach(t=>{
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>'+t.id+'</td>'+
        '<td>'+t.name+'</td>'+
        '<td>R'+(t.price_cents/100).toFixed(2)+'</td>'+
        '<td>'+(t.requires_gender? 'Yes':'No')+'</td>';
      tb.appendChild(tr);
    });
  }catch(e){ tb.innerHTML = '<tr><td class="muted" colspan="4">Error</td></tr>'; }
}

$('#ttAdd').addEventListener('click', async ()=>{
  $('#ttMsg').textContent='';
  if (!CURR) { $('#ttMsg').textContent='Select an event first'; return; }
  const body = {
    name: $('#ttName').value.trim(),
    price_cents: Math.max(0, Math.round(Number($('#ttPrice').value||0)*100)),
    requires_gender: $('#ttGender').value==='1'
  };
  if (!body.name) { $('#ttMsg').textContent='Name required'; return; }
  try{
    const r = await fetch('/api/admin/events/'+CURR.id+'/ticket-types', {
      method:'POST', credentials:'include',
      headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if(!r.ok || !d.ok) throw new Error(d.error||'Failed');
    $('#ttName').value=''; $('#ttPrice').value=''; $('#ttGender').value='';
    refreshTT();
  }catch(e){ $('#ttMsg').textContent = e.message || 'Error'; }
});

// --- POS ADMIN
async function loadPOS(){
  const tb = $('#posTbody');
  tb.innerHTML = '<tr><td class="muted" colspan="7">Loading…</td></tr>';
  try{
    const r = await fetch('/api/admin/pos/sessions', { credentials:'include' });
    const d = await r.json();
    if(!d.ok) throw new Error(d.error||'Failed');
    const rows = d.sessions || [];
    tb.innerHTML = rows.length ? '' : '<tr><td class="muted" colspan="7">No sessions</td></tr>';
    rows.forEach(s=>{
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>'+s.id+'</td>'+
        '<td>'+s.cashier_name+'</td>'+
        '<td>'+s.gate_name+'</td>'+
        '<td>'+fmtTs(s.opened_at)+'</td>'+
        '<td>'+fmtTs(s.closed_at)+'</td>'+
        '<td>R'+(s.cash_total_cents/100).toFixed(2)+'</td>'+
        '<td>R'+(s.card_total_cents/100).toFixed(2)+'</td>';
      tb.appendChild(tr);
    });
  }catch(e){ tb.innerHTML = '<tr><td class="muted" colspan="7">Error</td></tr>'; }
}
$('#posReload').addEventListener('click', loadPOS);
function fmtTs(s){ if(!s) return ''; try{ const d=new Date(s*1000); return d.toISOString().replace('T',' ').slice(0,16);}catch{return ''} }

// --- SITE SETTINGS (very light demo; stores to KV via admin route if present)
$('#siteSave').addEventListener('click', async ()=>{
  const body = { site_name: $('#siteName').value.trim(), public_base_url: $('#siteBase').value.trim() };
  try{
    const r = await fetch('/api/admin/site', { method:'POST', credentials:'include',
      headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json(); if (!d.ok) throw new Error(d.error||'Failed');
    $('#siteMsg').textContent='Saved';
    setTimeout(()=>$('#siteMsg').textContent='', 2000);
  }catch(e){ $('#siteMsg').textContent='Error: '+(e.message||''); }
});

// --- USERS
async function loadUsers(){
  const tb = $('#uTbody');
  tb.innerHTML = '<tr><td class="muted" colspan="3">Loading…</td></tr>';
  try{
    const r = await fetch('/api/admin/users', { credentials:'include' });
    const d = await r.json(); if (!d.ok) throw new Error(d.error||'Failed');
    const rows = d.users || [];
    tb.innerHTML = rows.length ? '' : '<tr><td class="muted" colspan="3">No users</td></tr>';
    rows.forEach(u=>{
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>'+u.id+'</td><td>'+u.username+'</td><td>'+u.role+'</td>';
      tb.appendChild(tr);
    });
  }catch(e){ tb.innerHTML = '<tr><td class="muted" colspan="3">Error</td></tr>'; }
}
$('#uCreate').addEventListener('click', async ()=>{
  $('#uMsg').textContent='';
  const body = { username: $('#uName').value.trim(), role: $('#uRole').value, password: $('#uPass').value };
  if (!body.username || !body.password) { $('#uMsg').textContent='Username & password required'; return; }
  try{
    const r = await fetch('/api/admin/users', { method:'POST', credentials:'include',
      headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json(); if (!d.ok) throw new Error(d.error||'Failed');
    $('#uName').value=''; $('#uPass').value='';
    loadUsers();
  }catch(e){ $('#uMsg').textContent='Error: '+(e.message||''); }
});

// initial loads
loadEvents();
</script>
</body>
</html>
`;
}
