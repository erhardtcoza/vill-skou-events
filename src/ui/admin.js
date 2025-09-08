// /src/ui/admin.js
export function adminHTML(){
  const css = `
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{margin:0;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:#111}
  .wrap{max-width:1100px;margin:18px auto;padding:0 14px}
  .nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .tab{padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;background:#fff}
  .tab.active{background:var(--green);color:#fff;border-color:transparent}
  .card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.08);padding:16px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #f1f3f5;text-align:left;font-size:14px}
  h1{margin:0 0 10px}
  input,select,button{font:inherit}
  input,select{padding:9px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
  .btn{padding:9px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;cursor:pointer}
  .btn.primary{background:var(--green);color:#fff;border-color:transparent}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .muted{color:var(--muted)}
  .pill{display:inline-block;border:1px solid #e5e7eb;border-radius:999px;padding:3px 8px;font-size:12px}
  `;

  // tiny helpers without nested template strings
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }
  function rands(c){ return "R"+((Number(c)||0)/100).toFixed(2); }
  function rowEvent(ev){
    return "<tr>"
      + "<td>"+ev.id+"</td>"
      + "<td>"+esc(ev.slug)+"</td>"
      + "<td>"+esc(ev.name)+"</td>"
      + "<td>"+esc(ev.venue||"")+"</td>"
      + "<td><span class='pill'>"+esc(ev.status)+"</span></td>"
      + "<td>"+new Date((ev.starts_at||0)*1000).toLocaleDateString()+"</td>"
      + "<td><button class='btn' data-tt='"+ev.id+"'>Ticket types</button></td>"
      + "</tr>";
  }
  function rowTicketType(tt){
    return "<tr>"
      + "<td>"+tt.id+"</td>"
      + "<td>"+esc(tt.name)+"</td>"
      + "<td>"+esc(tt.code||"")+"</td>"
      + "<td>"+rands(tt.price_cents||0)+"</td>"
      + "<td>"+(tt.capacity||0)+"</td>"
      + "<td>"+(tt.per_order_limit||0)+"</td>"
      + "<td>"+(tt.requires_gender? "Yes":"No")+"</td>"
      + "</tr>";
  }
  function rowUser(u){
    return "<tr>"
      + "<td>"+u.id+"</td>"
      + "<td>"+esc(u.username)+"</td>"
      + "<td>"+esc(u.role)+"</td>"
      + "</tr>";
  }
  function rowSession(s){
    const open = new Date((s.opened_at||0)*1000).toLocaleString();
    const closed = s.closed_at ? new Date(s.closed_at*1000).toLocaleString() : "—";
    return "<tr>"
      + "<td>"+s.id+"</td>"
      + "<td>"+(s.event_id||"")+"</td>"
      + "<td>"+esc(s.cashier_name||"")+"</td>"
      + "<td>"+(s.gate_id||"")+"</td>"
      + "<td>"+rands(s.opening_float_cents||0)+"</td>"
      + "<td>"+rands(s.cash_cents||0)+"</td>"
      + "<td>"+rands(s.card_cents||0)+"</td>"
      + "<td>"+(esc(s.closing_manager||""))+"</td>"
      + "<td>"+open+"</td>"
      + "<td>"+closed+"</td>"
      + "</tr>";
  }
  function rowVendor(v){
    return "<tr>"
      + "<td>"+v.id+"</td>"
      + "<td>"+esc(v.name)+"</td>"
      + "<td>"+esc(v.contact_name||"")+"</td>"
      + "<td>"+esc(v.phone||"")+"</td>"
      + "<td>"+esc(v.email||"")+"</td>"
      + "<td>"+esc(v.stand_number||"")+"</td>"
      + "<td>"+(v.staff_quota||0)+" / "+(v.vehicle_quota||0)+"</td>"
      + "<td><button class='btn' data-v-edit='"+v.id+"'>Edit</button></td>"
      + "</tr>";
  }

  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>${css}</style>
</head><body>
<div class="wrap">
  <h1>Admin dashboard</h1>
  <div class="nav">
    <button class="tab active" data-tab="events">Events</button>
    <button class="tab" data-tab="tickets">Tickets</button>
    <button class="tab" data-tab="pos">POS Admin</button>
    <button class="tab" data-tab="vendors">Vendors</button>
    <button class="tab" data-tab="users">Users</button>
    <button class="tab" data-tab="settings">Site settings</button>
  </div>

  <!-- Events -->
  <div id="tab-events" class="card">
    <h2 style="margin:0 0 10px">Events</h2>
    <div id="evTableWrap" class="muted">Loading…</div>
    <div id="ttWrap" style="margin-top:12px;display:none">
      <h3 style="margin:0 0 8px">Ticket types</h3>
      <div id="ttTableWrap" class="muted">Loading…</div>
    </div>
  </div>

  <!-- Tickets -->
  <div id="tab-tickets" class="card" style="display:none">
    <h2 style="margin:0 0 10px">Tickets</h2>
    <div class="row">
      <input id="tCode" placeholder="Order code (e.g. 3VLNT5)"/>
      <button id="tLookup" class="btn">Lookup</button>
      <span id="tErr" class="muted"></span>
    </div>
    <div id="tRes" style="margin-top:12px"></div>
  </div>

  <!-- POS Admin -->
  <div id="tab-pos" class="card" style="display:none">
    <h2 style="margin:0 0 10px">POS sessions</h2>
    <div id="posTableWrap" class="muted">Loading…</div>
  </div>

  <!-- Vendors -->
  <div id="tab-vendors" class="card" style="display:none">
    <h2 style="margin:0 0 10px">Vendors</h2>
    <div class="row">
      <input id="vEventId" type="number" placeholder="Event ID"/>
      <button id="vLoad" class="btn">Load</button>
      <button id="vNew" class="btn">New vendor</button>
      <span id="vMsg" class="muted"></span>
    </div>
    <div id="vWrap" style="margin-top:10px" class="muted">—</div>
  </div>

  <!-- Users -->
  <div id="tab-users" class="card" style="display:none">
    <h2 style="margin:0 0 10px">Users</h2>
    <div id="uWrap" class="muted">Loading…</div>
  </div>

  <!-- Settings -->
  <div id="tab-settings" class="card" style="display:none">
    <h2>Site settings</h2>
    <div class="muted">Coming soon</div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
function activate(tab){
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-tab="'+tab+'"]').classList.add('active');
  ['events','tickets','pos','vendors','users','settings'].forEach(t=>{
    $('tab-'+t).style.display = (t===tab?'block':'none');
  });
}
document.querySelectorAll('.tab').forEach(b=>{
  b.onclick = ()=> activate(b.dataset.tab);
});

function rands(c){ return "R"+((Number(c)||0)/100).toFixed(2); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;" }[c])); }

// ---------- Events ----------
async function loadEvents(){
  $('evTableWrap').textContent = 'Loading…';
  const j = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok) return $('evTableWrap').textContent = 'Failed to load';
  const rows = (j.events||[]).map(ev => ${
    // we can’t inline a function in a template safely; build in runtime:
    "''"
  }).join('');
}
// because we can’t embed rowEvent directly in HTML above, we’ll build table here:
async function renderEvents(){
  const j = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  const w = $('evTableWrap');
  if (!j.ok) { w.textContent = 'Failed to load'; return; }
  const rows = (j.events||[]).map(ev => (
    "<tr>"
    + "<td>"+ev.id+"</td>"
    + "<td>"+esc(ev.slug)+"</td>"
    + "<td>"+esc(ev.name)+"</td>"
    + "<td>"+esc(ev.venue||"")+"</td>"
    + "<td><span class='pill'>"+esc(ev.status)+"</span></td>"
    + "<td>"+new Date((ev.starts_at||0)*1000).toLocaleDateString()+"</td>"
    + "<td><button class='btn' data-tt='"+ev.id+"'>Ticket types</button></td>"
    + "</tr>"
  )).join('');
  w.innerHTML =
    "<table><thead><tr>"
    + "<th>ID</th><th>Slug</th><th>Name</th><th>Venue</th><th>Status</th><th>Starts</th><th></th>"
    + "</tr></thead><tbody>"+rows+"</tbody></table>";

  // wire ticket types
  w.querySelectorAll('[data-tt]').forEach(btn=>{
    btn.onclick = ()=> loadTicketTypes(btn.getAttribute('data-tt'));
  });
}
async function loadTicketTypes(eventId){
  $('ttWrap').style.display = 'block';
  $('ttTableWrap').textContent = 'Loading…';
  const j = await fetch('/api/admin/events/'+encodeURIComponent(eventId)+'/ticket-types').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok) { $('ttTableWrap').textContent='Failed'; return; }
  const rows = (j.ticket_types||[]).map(tt => (
    "<tr>"
    + "<td>"+tt.id+"</td>"
    + "<td>"+esc(tt.name)+"</td>"
    + "<td>"+esc(tt.code||"")+"</td>"
    + "<td>"+rands(tt.price_cents||0)+"</td>"
    + "<td>"+(tt.capacity||0)+"</td>"
    + "<td>"+(tt.per_order_limit||0)+"</td>"
    + "<td>"+(tt.requires_gender? "Yes":"No")+"</td>"
    + "</tr>"
  )).join('');
  $('ttTableWrap').innerHTML =
    "<table><thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Price</th><th>Capacity</th><th>Per-order</th><th>Gender?</th></tr></thead>"
    + "<tbody>"+rows+"</tbody></table>";
}

// ---------- Tickets lookup ----------
$('tLookup').onclick = async ()=>{
  $('tErr').textContent = '';
  $('tRes').innerHTML = '';
  const code = ($('tCode').value||'').trim();
  if (!code) { $('tErr').textContent = 'Enter a code'; return; }
  const j = await fetch('/api/admin/orders/lookup/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ $('tErr').textContent = j.error||'Not found'; return; }
  const o = j.order, t = j.tickets||[];
  const trows = t.map(x => (
    "<tr>"
    + "<td>"+x.id+"</td>"
    + "<td>"+esc(x.type_name||'')+"</td>"
    + "<td>"+esc(x.attendee_first||'')+" "+esc(x.attendee_last||'')+"</td>"
    + "<td>"+esc(x.state||'')+"</td>"
    + "<td><code>"+esc(x.qr||'')+"</code></td>"
    + "</tr>"
  )).join('');
  $('tRes').innerHTML =
    "<div class='card'>"
    + "<div><b>Order:</b> "+esc(o.short_code)+" · "+rands(o.total_cents||0)+" · "+esc(o.status)+"</div>"
    + "<div class='muted' style='margin:6px 0'>"+esc(o.buyer_name||'')+" · "+esc(o.buyer_phone||'')+"</div>"
    + "<table><thead><tr><th>ID</th><th>Type</th><th>Attendee</th><th>State</th><th>QR</th></tr></thead>"
    + "<tbody>"+trows+"</tbody></table>"
    + "</div>";
};

// ---------- POS sessions ----------
async function loadPOS(){
  const w = $('posTableWrap');
  w.textContent = 'Loading…';
  const j = await fetch('/api/admin/pos/sessions').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ w.textContent='Failed'; return; }
  const rows = (j.sessions||[]).map(s => (
    "<tr>"
    + "<td>"+s.id+"</td>"
    + "<td>"+(s.event_id||"")+"</td>"
    + "<td>"+esc(s.cashier_name||"")+"</td>"
    + "<td>"+(s.gate_id||"")+"</td>"
    + "<td>"+rands(s.opening_float_cents||0)+"</td>"
    + "<td>"+rands(s.cash_cents||0)+"</td>"
    + "<td>"+rands(s.card_cents||0)+"</td>"
    + "<td>"+esc(s.closing_manager||"")+"</td>"
    + "<td>"+new Date((s.opened_at||0)*1000).toLocaleString()+"</td>"
    + "<td>"+(s.closed_at? new Date(s.closed_at*1000).toLocaleString() : "—")+"</td>"
    + "</tr>"
  )).join('');
  w.innerHTML =
    "<table><thead><tr>"
    + "<th>ID</th><th>Event</th><th>Cashier</th><th>Gate</th><th>Float</th>"
    + "<th>Cash</th><th>Card</th><th>Closed by</th><th>Opened</th><th>Closed</th>"
    + "</tr></thead><tbody>"+rows+"</tbody></table>";
}

// ---------- Vendors ----------
$('vLoad').onclick = async ()=>{
  const evId = Number(($('vEventId').value||'0'));
  if (!evId) { $('vMsg').textContent = 'Enter event id'; return; }
  $('vMsg').textContent = ''; $('vWrap').textContent = 'Loading…';
  const j = await fetch('/api/admin/vendors/'+evId).then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ $('vWrap').textContent='Failed'; return; }
  const rows = (j.vendors||[]).map(v => (
    "<tr>"
    + "<td>"+v.id+"</td>"
    + "<td>"+esc(v.name)+"</td>"
    + "<td>"+esc(v.contact_name||"")+"</td>"
    + "<td>"+esc(v.phone||"")+"</td>"
    + "<td>"+esc(v.email||"")+"</td>"
    + "<td>"+esc(v.stand_number||"")+"</td>"
    + "<td>"+(v.staff_quota||0)+" / "+(v.vehicle_quota||0)+"</td>"
    + "<td><button class='btn' data-v-edit='"+v.id+"'>Edit</button></td>"
    + "</tr>"
  )).join('');
  $('vWrap').innerHTML =
    "<table><thead><tr>"
    + "<th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Quotas</th><th></th>"
    + "</tr></thead><tbody>"+rows+"</tbody></table>";

  // wire edit
  $('vWrap').querySelectorAll('[data-v-edit]').forEach(b=>{
    b.onclick = ()=> openVendorEdit(evId, Number(b.getAttribute('data-v-edit')));
  });
};
$('vNew').onclick = ()=> openVendorEdit(Number(($('vEventId').value||'0')), 0);

async function openVendorEdit(eventId, id){
  const name = prompt("Vendor name:");
  if (!name) return;
  const contact_name = prompt("Contact name:", "")||"";
  const phone = prompt("Phone:", "")||"";
  const email = prompt("Email:", "")||"";
  const stand_number = prompt("Stand number:", "")||"";
  const staff_quota = Number(prompt("Staff quota:", "0")||"0");
  const vehicle_quota = Number(prompt("Vehicle quota:", "0")||"0");
  const body = { id, event_id:eventId, name, contact_name, phone, email, stand_number, staff_quota, vehicle_quota };
  const r = await fetch('/api/admin/vendors/upsert', {
    method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
  });
  const j = await r.json().catch(()=>({ok:false}));
  if (!j.ok){ alert('Save failed: '+(j.error||'')); return; }
  $('vLoad').click();
}

// ---------- Users ----------
async function loadUsers(){
  const w = $('uWrap'); w.textContent='Loading…';
  const j = await fetch('/api/admin/users').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ w.textContent='Failed'; return; }
  const rows = (j.users||[]).map(u => (
    "<tr><td>"+u.id+"</td><td>"+esc(u.username)+"</td><td>"+esc(u.role)+"</td></tr>"
  )).join('');
  w.innerHTML = "<table><thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead><tbody>"+rows+"</tbody></table>";
}

// initial loads
renderEvents();
loadPOS();
loadUsers();
</script>
</body></html>`;
}
