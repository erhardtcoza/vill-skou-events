// /src/ui/admin.js
export function adminHTML() {
  const css = String.raw;
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
${css`
:root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8 }
*{ box-sizing:border-box }
body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
.wrap{ max-width:1100px; margin:18px auto; padding:0 16px }
.card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px; margin-top:14px }
h1{ margin:6px 0 12px } h2{ margin:0 0 12px }
.tabs{ display:flex; gap:10px; margin:8px 0 8px }
.tab{ background:#e9f5ee; color:#064e1c; padding:6px 10px; border-radius:999px; cursor:pointer; font-weight:600; user-select:none }
.row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
input,select,button{ font:inherit } input,select{ padding:9px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#fff }
.btn{ padding:10px 14px; border-radius:10px; border:0; background:var(--green); color:#fff; cursor:pointer; font-weight:700 }
.table{ width:100%; border-collapse:collapse; font-size:14px }
.table th,.table td{ padding:8px 10px; border-bottom:1px solid #eee; text-align:left; vertical-align:top }
.muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 }
.kpi{ font-weight:700 }
a{ color:#0a7d2b; text-decoration:underline }
small.badge{ display:inline-block; padding:2px 6px; border-radius:999px; background:#eef4ff; color:#1f4fd6; font-weight:600 }
`}
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>

  <div class="tabs">
    <div class="tab" data-tab="events">Events</div>
    <div class="tab" data-tab="tickets">Tickets</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="site">Site settings</div>
  </div>

  <!-- Events (default visible even if JS fails) -->
  <div id="tab-events" class="card">
    <h2>Events</h2>
    <div class="muted">Click “Ticket Types” on an event to view/add types.</div>
    <table class="table" id="evTbl">
      <thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
      <tbody><tr><td colspan="7" class="muted">Loading…</td></tr></tbody>
    </table>

    <div id="ttBox" class="card" style="margin-top:14px">
      <h3>Ticket types for <span id="ttEvName" class="kpi">—</span></h3>
      <div class="row" style="margin:8px 0 6px">
        <input id="ttName" placeholder="Name" style="min-width:220px"/>
        <input id="ttPrice" type="number" min="0" step="1" placeholder="Price (R)" style="width:120px"/>
        <input id="ttCap" type="number" min="0" step="1" placeholder="Capacity" style="width:120px"/>
        <input id="ttCode" placeholder="Code (opt.)" style="width:120px"/>
        <select id="ttReqG" style="width:140px">
          <option value="0">Gender req: No</option>
          <option value="1">Gender req: Yes</option>
        </select>
        <button class="btn" id="ttAdd">Add ticket type</button>
        <div id="ttErr" class="error"></div>
      </div>
      <table class="table" id="ttTbl">
        <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Capacity</th><th>Per-order</th><th>Gender</th></tr></thead>
        <tbody><tr><td colspan="6" class="muted">Pick an event.</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Tickets -->
  <div id="tab-tickets" class="card" style="display:none">
    <h2>Tickets</h2>
    <div class="row" style="margin-bottom:8px">
      <select id="tEv"></select>
      <button class="btn" id="tLoad">Load</button>
      <div id="tMsg" class="error"></div>
    </div>
    <div class="row muted" id="tTotals" style="margin:6px 0"></div>
    <table class="table" id="tTbl">
      <thead><tr><th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th></tr></thead>
      <tbody></tbody>
    </table>

    <div class="card" style="margin-top:16px">
      <h3>Order lookup</h3>
      <div class="row">
        <input id="olCode" placeholder="e.g. C056B6" style="width:140px"/>
        <button id="olBtn" class="btn">Find</button>
        <div id="olStatus" class="muted"></div>
      </div>
      <div id="olLink" style="margin-top:8px"></div>
    </div>
  </div>

  <!-- POS Admin -->
  <div id="tab-pos" class="card" style="display:none">
    <h2>POS Sessions</h2>
    <div class="row" style="margin-bottom:8px"><button id="posReload" class="btn">Reload</button></div>
    <table class="table" id="posTbl">
      <thead><tr>
        <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Closed by</th><th>Cash (R)</th><th>Card (R)</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <!-- Vendors -->
  <div id="tab-vendors" class="card" style="display:none">
    <h2>Vendors</h2>
    <div class="row">
      <select id="vEv"></select>
      <button id="vLoad" class="btn">Load</button>
      <div id="vMsg" class="error"></div>
    </div>

    <div class="row" style="margin:10px 0">
      <input id="vName" placeholder="Vendor name" style="min-width:220px"/>
      <input id="vContact" placeholder="Contact"/>
      <input id="vPhone" placeholder="Phone"/>
      <input id="vEmail" placeholder="Email"/>
      <input id="vStand" placeholder="Stand #"/>
      <input id="vStaffQ" type="number" min="0" step="1" value="0" style="width:120px" placeholder="Staff quota"/>
      <input id="vVehQ" type="number" min="0" step="1" value="0" style="width:120px" placeholder="Vehicle quota"/>
      <button id="vAdd" class="btn">Add vendor</button>
    </div>

    <table class="table" id="vTbl">
      <thead><tr>
        <th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>StaffQ</th><th>VehQ</th><th>Passes</th>
      </tr></thead>
      <tbody></tbody>
    </table>

    <div id="vPassBox" style="display:none; margin-top:16px">
      <h3>Passes for <span id="vpName" class="kpi"></span></h3>
      <div class="row" style="margin:8px 0">
        <select id="vpType" style="width:120px"><option value="staff">staff</option><option value="vehicle">vehicle</option></select>
        <input id="vpLabel" placeholder="Label / Holder"/>
        <input id="vpReg" placeholder="Vehicle reg (if vehicle)"/>
        <button id="vpAdd" class="btn">Add pass</button>
        <div id="vpMsg" class="error"></div>
      </div>
      <table class="table" id="vpTbl">
        <thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Vehicle</th><th>QR</th><th>State</th><th>View</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <!-- Users -->
  <div id="tab-users" class="card" style="display:none">
    <h2>Users</h2>
    <div class="row" style="margin-bottom:8px">
      <input id="uName" placeholder="username"/>
      <select id="uRole"><option>admin</option><option>pos</option><option>scan</option></select>
      <button id="uAdd" class="btn">Add</button>
      <div id="uMsg" class="error"></div>
    </div>
    <table class="table" id="uTbl">
      <thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div id="tab-site" class="card" style="display:none">
    <h2>Site settings</h2>
    <div class="muted">Settings UI coming soon.</div>
  </div>
</div>

<script>
(function(){
  "use strict";
  // helpers
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function fmtR(c){ return 'R' + (Number(c||0)/100).toFixed(2); }
  function dt(s){ return s ? new Date((Number(s)||0)*1000).toISOString().replace('T',' ').slice(0,19) : '-'; }

  // tab switcher (safe even if some tabs missing)
  function activate(tab){
    var panes = document.querySelectorAll('[id^="tab-"]');
    for (var i=0;i<panes.length;i++) panes[i].style.display = 'none';
    var el = document.getElementById('tab-'+tab);
    if (el) el.style.display = 'block';
    var tabs = document.querySelectorAll('.tab');
    for (var j=0;j<tabs.length;j++) tabs[j].style.background = '#e9f5ee';
    var t = document.querySelector('.tab[data-tab="'+tab+'"]');
    if (t) t.style.background = '#cdeedd';
  }
  var tabs = document.querySelectorAll('.tab');
  for (var k=0;k<tabs.length;k++) tabs[k].onclick = function(){ activate(this.getAttribute('data-tab')); };
  activate('events');

  // ---------- Events & types ----------
  var currentEvent = null;

  function setEvOptions(events){
    var opts = '';
    for (var i=0;i<events.length;i++){
      var ev = events[i];
      opts += '<option value="'+ev.id+'">'+esc(ev.name)+' ('+esc(ev.slug)+')</option>';
    }
    var tEv = $('tEv'); if (tEv) tEv.innerHTML = opts;
    var vEv = $('vEv'); if (vEv) vEv.innerHTML = opts;
  }

  async function loadEvents(){
    try{
      const r = await fetch('/api/admin/events');
      const j = await r.json();
      const tb = $('evTbl').querySelector('tbody');
      tb.innerHTML = '';
      const events = j.events || [];
      setEvOptions(events);
      for (var i=0;i<events.length;i++){
        var ev = events[i];
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>'+ev.id+'</td>'+
          '<td>'+esc(ev.slug)+'</td>'+
          '<td>'+esc(ev.name)+'<div class="muted">'+esc(ev.venue||'')+'</div></td>'+
          '<td>'+dt(ev.starts_at)+'</td>'+
          '<td>'+dt(ev.ends_at)+'</td>'+
          '<td>'+esc(ev.status)+'</td>'+
          '<td><button class="btn" data-ev="'+ev.id+'" data-name="'+esc(ev.name)+'">Ticket Types</button></td>';
        tb.appendChild(tr);
      }
      var btns = tb.querySelectorAll('button');
      for (var b=0;b<btns.length;b++){
        btns[b].onclick = function(){
          currentEvent = { id: Number(this.getAttribute('data-ev')), name: this.getAttribute('data-name') };
          $('ttEvName').textContent = currentEvent.name;
          loadTypes();
        };
      }
    }catch(e){
      try{ $('evTbl').querySelector('tbody').innerHTML = '<tr><td colspan="7" class="error">Failed to load events</td></tr>'; }catch(_){}
      console.error(e);
    }
  }

  async function loadTypes(){
    if (!currentEvent) return;
    try{
      const r = await fetch('/api/admin/events/'+currentEvent.id+'/ticket-types');
      const j = await r.json();
      const tb = $('ttTbl').querySelector('tbody');
      tb.innerHTML = '';
      const types = j.types || [];
      for (var i=0;i<types.length;i++){
        var t = types[i];
        tb.insertAdjacentHTML('beforeend',
          '<tr><td>'+t.id+'</td><td>'+esc(t.name)+'</td><td>'+fmtR(t.price_cents)+'</td><td>'+t.capacity+'</td><td>'+t.per_order_limit+'</td><td>'+(t.requires_gender?'Yes':'No')+'</td></tr>');
      }
      if (!types.length){
        tb.innerHTML = '<tr><td colspan="6" class="muted">No ticket types yet.</td></tr>';
      }
    }catch(e){
      $('ttTbl').querySelector('tbody').innerHTML = '<tr><td colspan="6" class="error">Failed to load types</td></tr>';
      console.error(e);
    }
  }

  var ttAdd = $('ttAdd');
  if (ttAdd) ttAdd.onclick = async function(){
    $('ttErr').textContent = '';
    if (!currentEvent){ $('ttErr').textContent = 'Pick an event first'; return; }
    const body = {
      event_id: currentEvent.id,
      name: $('ttName').value.trim(),
      price_cents: Math.round(Number($('ttPrice').value||0)*100),
      capacity: Number($('ttCap').value||0),
      code: $('ttCode').value.trim() || null,
      per_order_limit: 10,
      requires_gender: $('ttReqG').value === '1'
    };
    try{
      const r = await fetch('/api/admin/ticket-types',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'failed');
      $('ttName').value=''; $('ttPrice').value=''; $('ttCap').value=''; $('ttCode').value=''; $('ttReqG').value='0';
      loadTypes();
    }catch(e){ $('ttErr').textContent = 'Error: '+(e.message||'unknown'); }
  };

  // ---------- Tickets summary + order lookup ----------
  var tLoad = $('tLoad');
  if (tLoad) tLoad.onclick = async function(){
    $('tMsg').textContent = '';
    const ev = Number(($('tEv').value||0));
    try{
      const r = await fetch('/api/admin/tickets/summary?event_id='+ev);
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'Not Found');
      const tb = $('tTbl').querySelector('tbody'); tb.innerHTML='';
      for (var i=0;i<(j.rows||[]).length;i++){
        var row = j.rows[i];
        tb.insertAdjacentHTML('beforeend',
          '<tr><td>'+esc(row.name)+'</td><td>'+fmtR(row.price_cents)+'</td><td>'+row.total+'</td><td>'+row.unused+'</td><td>'+row.in+'</td><td>'+row.out+'</td><td>'+row.void+'</td></tr>');
      }
      $('tTotals').textContent = 'Total: '+j.totals.total+' · In: '+j.totals.in+' · Out: '+j.totals.out+' · Unused: '+j.totals.unused+' · Void: '+j.totals.void;
    }catch(e){ $('tMsg').textContent = 'Error: '+(e.message||'unknown'); }
  };

  var olBtn = $('olBtn');
  if (olBtn) olBtn.onclick = async function(){
    $('olStatus').textContent=''; $('olLink').innerHTML='';
    const code = ($('olCode').value||'').trim();
    if(!code){ $('olStatus').textContent='Enter a code'; return; }
    try{
      const r = await fetch('/api/admin/order/by-code/'+encodeURIComponent(code));
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'Not Found');
      $('olStatus').textContent='Found';
      $('olLink').innerHTML = 'Ticket link: <a href="'+j.link+'" target="_blank">'+j.link+'</a>';
    }catch(e){ $('olStatus').textContent='Not Found'; }
  };

  // ---------- POS Admin ----------
  async function loadPos(){
    try{
      const r = await fetch('/api/admin/pos/sessions');
      const j = await r.json();
      const tb = $('posTbl').querySelector('tbody'); tb.innerHTML='';
      const rows = j.rows || [];
      for (var i=0;i<rows.length;i++){
        var s = rows[i];
        tb.insertAdjacentHTML('beforeend',
          '<tr><td>'+s.id+'</td><td>'+esc(s.cashier_name)+'</td><td>'+esc(s.gate_name)+'</td>'+
          '<td>'+dt(s.opened_at)+'</td><td>'+dt(s.closed_at)+'</td><td>'+esc(s.closing_manager||'-')+'</td>'+
          '<td>'+fmtR(s.cash_cents)+'</td><td>'+fmtR(s.card_cents)+'</td></tr>');
      }
    }catch(e){
      try{ $('posTbl').querySelector('tbody').innerHTML = '<tr><td colspan="8" class="error">Failed to load sessions</td></tr>'; }catch(_){}
      console.error(e);
    }
  }
  var posReload = $('posReload'); if (posReload) posReload.onclick = loadPos;

  // ---------- Vendors ----------
  var currentVendor = null;

  var vLoad = $('vLoad');
  if (vLoad) vLoad.onclick = async function(){
    $('vMsg').textContent='';
    const ev = Number(($('vEv').value||0));
    try{
      const r = await fetch('/api/admin/vendors?event_id='+ev);
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'Not Found');
      const tb = $('vTbl').querySelector('tbody'); tb.innerHTML='';
      const vendors = j.vendors || [];
      for (var i=0;i<vendors.length;i++){
        var v = vendors[i];
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>'+v.id+'</td><td>'+esc(v.name)+'</td><td>'+esc(v.contact_name||'')+'</td><td>'+esc(v.phone||'')+'</td><td>'+esc(v.email||'')+'</td>'+
                       '<td>'+esc(v.stand_number||'')+'</td><td>'+v.staff_quota+'</td><td>'+v.vehicle_quota+'</td>'+
                       '<td><button class="btn" data-id="'+v.id+'" data-name="'+esc(v.name)+'">Passes</button></td>';
        tb.appendChild(tr);
      }
      var ps = tb.querySelectorAll('button');
      for (var p=0;p<ps.length;p++){
        ps[p].onclick = function(){
          currentVendor = { id:Number(this.getAttribute('data-id')), name:this.getAttribute('data-name') };
          $('vpName').textContent = currentVendor.name;
          loadVendorPasses();
        };
      }
    }catch(e){ $('vMsg').textContent='Not Found'; }
  };

  var vAdd = $('vAdd');
  if (vAdd) vAdd.onclick = async function(){
    $('vMsg').textContent='';
    const ev = Number(($('vEv').value||0));
    const body = {
      event_id: ev, name: $('vName').value.trim(), contact_name: $('vContact').value.trim(),
      phone: $('vPhone').value.trim(), email: $('vEmail').value.trim(),
      stand_number: $('vStand').value.trim(), staff_quota: Number($('vStaffQ').value||0),
      vehicle_quota: Number($('vVehQ').value||0)
    };
    try{
      const r = await fetch('/api/admin/vendors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'failed');
      $('vName').value=''; $('vContact').value=''; $('vPhone').value=''; $('vEmail').value=''; $('vStand').value='';
      $('vStaffQ').value='0'; $('vVehQ').value='0'; $('vLoad').click();
    }catch(e){ $('vMsg').textContent='Error: '+(e.message||'unknown'); }
  };

  async function loadVendorPasses(){
    if (!currentVendor) return;
    $('vPassBox').style.display='block';
    try{
      const r = await fetch('/api/admin/vendor/'+currentVendor.id+'/passes');
      const j = await r.json();
      const tb = $('vpTbl').querySelector('tbody'); tb.innerHTML='';
      const passes = j.passes || [];
      for (var i=0;i<passes.length;i++){
        var p = passes[i];
        var link = '/t/'+encodeURIComponent(p.qr);
        tb.insertAdjacentHTML('beforeend',
          '<tr><td>'+p.id+'</td><td>'+p.type+'</td><td>'+esc(p.label||'')+'</td><td>'+esc(p.vehicle_reg||'')+'</td>'+
          '<td>'+esc(p.qr)+'</td><td>'+esc(p.state)+'</td>'+
          '<td><a target="_blank" href="'+link+'">Open</a></td></tr>');
      }
    }catch(e){
      $('vpTbl').querySelector('tbody').innerHTML = '<tr><td colspan="7" class="error">Failed to load passes</td></tr>';
    }
  }

  // ---------- Users ----------
  async function loadUsers(){
    try{
      const r = await fetch('/api/admin/users');
      const j = await r.json();
      const tb = $('uTbl').querySelector('tbody'); tb.innerHTML='';
      const users = j.users || [];
      for (var i=0;i<users.length;i++){
        var u = users[i];
        tb.insertAdjacentHTML('beforeend','<tr><td>'+u.id+'</td><td>'+esc(u.username)+'</td><td>'+esc(u.role)+'</td></tr>');
      }
    }catch(e){
      $('uTbl').querySelector('tbody').innerHTML = '<tr><td colspan="3" class="error">Failed to load users</td></tr>';
    }
  }
  var uAdd = $('uAdd'); if (uAdd) uAdd.onclick = async function(){
    $('uMsg').textContent='';
    const body = { username: $('uName').value.trim(), role: $('uRole').value };
    try{
      const r = await fetch('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j = await r.json(); if(!j.ok) throw new Error(j.error||'failed');
      $('uName').value=''; loadUsers();
    }catch(e){ $('uMsg').textContent='Error: '+(e.message||'unknown'); }
  };

  // initial loads
  loadEvents();
  loadPos();
  loadUsers();
})();
</script>
</body></html>`;
}
