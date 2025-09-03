// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{
    --green:#0a7d2b; --muted:#667085; --bg:#f6f7f8;
    --line:#e5e7eb; --card:#fff; --bad:#b00020; --ok:#0a7d2b;
  }
  *{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:var(--bg);color:#111}
  .wrap{max-width:1200px;margin:0 auto;padding:16px}
  .nav{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:1}
  .pill{border:1px solid var(--line);background:var(--card);padding:8px 12px;border-radius:999px;cursor:pointer}
  .pill.active{background:var(--green);border-color:var(--green);color:#fff}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 24px rgba(0,0,0,.05);padding:14px;margin:10px 0}
  h1{margin:6px 0 12px}
  h2{margin:0 0 10px}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  input,select,textarea,button{padding:10px;border:1px solid var(--line);border-radius:12px}
  textarea{width:100%}
  button{cursor:pointer}
  .primary{background:var(--green);border-color:var(--green);color:#fff}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
  .muted{color:var(--muted)}
  .err{color:var(--bad)} .ok{color:var(--ok)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:900px){ .grid2{grid-template-columns:1fr} }
  .hidden{display:none}
</style>
</head><body><div class="wrap">
  <h1>Admin</h1>

  <!-- Tabs -->
  <div class="nav" id="tabs">
    <div class="pill active" data-tab="settings">Site settings</div>
    <div class="pill" data-tab="events">Events</div>
    <div class="pill" data-tab="pos">POS Admin</div>
    <div class="pill" data-tab="users">Users</div>
    <!-- Future:
    <div class="pill" data-tab="vendors">Vendors</div>
    <div class="pill" data-tab="visitors">Visitors</div>
    -->
  </div>

  <!-- Site settings -->
  <section id="settings" class="card">
    <h2>Site settings</h2>
    <div class="grid2">
      <input id="st_title" placeholder="Site title (e.g. Villiersdorp Skou — Tickets)" />
      <input id="st_logo" placeholder="Logo URL" />
      <input id="st_favicon" placeholder="Favicon URL" />
      <input id="st_banner" placeholder="Header banner URL" />
    </div>
    <div class="row" style="margin-top:8px">
      <button class="primary" id="st_save">Save settings</button>
      <span id="st_msg" class="muted"></span>
    </div>
  </section>

  <!-- Events -->
  <section id="events" class="card hidden">
    <div class="row" style="justify-content:space-between">
      <h2>Events</h2>
      <button class="primary" id="ev_new_btn">Create event</button>
    </div>

    <!-- Create Event panel -->
    <div id="ev_new" class="card hidden" style="background:#fafafa">
      <h3>Create Event</h3>
      <div class="grid2">
        <input id="new_slug" placeholder="slug (e.g. skou-2025)"/>
        <input id="new_name" placeholder="Event name"/>
        <input id="new_venue" placeholder="Venue"/>
        <label>Start date <input id="new_start" type="date"/></label>
        <label>End date <input id="new_end" type="date"/></label>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="primary" id="new_create">Create</button>
        <button id="new_cancel">Cancel</button>
        <span id="new_msg" class="muted"></span>
      </div>
    </div>

    <!-- Events table -->
    <table id="ev_table"></table>

    <!-- Edit Event panel -->
    <div id="ev_edit" class="card hidden" style="background:#fafafa">
      <h3>Edit Event</h3>
      <input type="hidden" id="ed_id"/>
      <div class="grid2">
        <input id="ed_slug" placeholder="slug"/>
        <input id="ed_name" placeholder="name"/>
        <input id="ed_venue" placeholder="venue"/>
        <label>Start date <input id="ed_start" type="date"/></label>
        <label>End date <input id="ed_end" type="date"/></label>
      </div>
      <div class="grid2" style="margin-top:6px">
        <input id="ed_hero" placeholder="Hero image URL (wide banner)"/>
        <input id="ed_poster" placeholder="Poster image URL (card/cover)"/>
      </div>
      <label class="muted" style="display:block;margin-top:6px">Gallery URLs (max 8, one per line)
        <textarea id="ed_gallery" rows="3" placeholder="https://.../img1.jpg
https://.../img2.jpg"></textarea>
      </label>

      <!-- Ticket Types (within event edit) -->
      <div class="card" style="margin-top:10px">
        <h4>Ticket types</h4>
        <div id="tt_list" class="muted">Loading…</div>
        <div class="row" style="margin-top:8px">
          <input id="tt_name" placeholder="name (e.g. Algemene Toegang)"/>
          <input id="tt_price_r" type="number" step="0.01" placeholder="price (R) — leave blank for FREE"/>
          <label class="row" style="gap:6px"><input id="tt_gender" type="checkbox"/> requires gender</label>
          <button id="tt_add">Add</button>
          <span id="tt_msg" class="muted"></span>
        </div>
      </div>

      <!-- Gates quick list (global) -->
      <div class="card" style="margin-top:10px">
        <h4>Gates</h4>
        <div class="row">
          <input id="gate_new" placeholder="New gate name"/>
          <button id="gate_add">Add gate</button>
        </div>
        <ul id="gate_list" class="muted" style="margin-top:6px"></ul>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="primary" id="ed_save">Save changes</button>
        <button id="ed_cancel">Close</button>
        <button id="ed_delete" style="margin-left:auto;color:#b00020;border-color:#ffd2d2;background:#ffecec">Delete event</button>
        <span id="ed_msg" class="muted"></span>
      </div>
    </div>
  </section>

  <!-- POS Admin -->
  <section id="pos" class="card hidden">
    <h2>POS Admin</h2>
    <div class="row">
      <label>From <input type="date" id="pos_from"/></label>
      <label>To <input type="date" id="pos_to"/></label>
      <button id="pos_refresh">Refresh</button>
      <span id="pos_msg" class="muted"></span>
    </div>

    <div class="card" style="margin-top:10px">
      <h4>Totals</h4>
      <div id="pos_totals" class="muted">Loading…</div>
    </div>

    <div class="card" style="margin-top:10px">
      <h4>Cashier Sessions</h4>
      <table id="pos_sessions"></table>
    </div>
  </section>

  <!-- Users -->
  <section id="users" class="card hidden">
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
      <button id="nu_create">Create</button>
      <span id="u_msg" class="muted"></span>
    </div>
    <table id="u_table" style="margin-top:10px"></table>
  </section>

</div>

<script>
/* Helpers */
function byId(id){ return document.getElementById(id); }
function show(id, on){ byId(id).classList.toggle('hidden', !on); }
function msg(id, t, ok){ var el=byId(id); el.textContent=t||''; el.className = ok?'ok':'muted'; }
function rands(c){ return 'R'+((c||0)/100).toFixed(2); }
function parseLocalDateToMs(dateStr, endOfDay){
  if (!dateStr) return NaN;
  var parts = dateStr.split('-'); if (parts.length<3) return NaN;
  var y=+parts[0], m=+parts[1]-1, d=+parts[2];
  var dt = endOfDay ? new Date(y,m,d,23,59,0,0) : new Date(y,m,d,0,0,0,0);
  return dt.getTime();
}
function msToInput(ms){
  var d=new Date(ms); var y=d.getFullYear(); var m=String(d.getMonth()+1).padStart(2,'0'); var da=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+da;
}
async function jget(u){ return fetch(u).then(function(r){return r.json()}); }
async function jpost(u,b){ return fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()}); }
async function jput(u,b){ return fetch(u,{method:'PUT', headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()}); }
async function jdel(u){ return fetch(u,{method:'DELETE'}).then(function(r){return r.json()}); }

/* Tabs */
(function tabsInit(){
  var tabs = document.querySelectorAll('#tabs .pill');
  tabs.forEach(function(t){
    t.onclick = function(){
      tabs.forEach(function(x){ x.classList.remove('active'); });
      t.classList.add('active');
      var name = t.getAttribute('data-tab');
      ['settings','events','pos','users'].forEach(function(k){ show(k, k===name); });
    };
  });
})();

/* Site settings */
async function loadSettings(){
  var r = await jget('/api/admin/settings').catch(function(){return {ok:false}});
  if(!r.ok){ msg('st_msg','Could not load settings'); return; }
  byId('st_title').value = r.settings?.site_title || '';
  byId('st_logo').value = r.settings?.logo_url || '';
  byId('st_favicon').value = r.settings?.favicon_url || '';
  byId('st_banner').value = r.settings?.banner_url || '';
}
async function saveSettings(){
  var b = {
    site_title: byId('st_title').value.trim(),
    logo_url: byId('st_logo').value.trim(),
    favicon_url: byId('st_favicon').value.trim(),
    banner_url: byId('st_banner').value.trim()
  };
  var r = await jpost('/api/admin/settings', b).catch(function(){return {ok:false}});
  if(r.ok) msg('st_msg','Saved',true); else msg('st_msg', r.error||'Failed');
}
byId('st_save').onclick = saveSettings;

/* Events */
var _events = [];
function renderEvents(){
  var rows = _events.map(function(e){
    return '<tr>'
      + '<td>'+e.id+'</td>'
      + '<td>'+e.slug+'</td>'
      + '<td>'+e.name+'<div class="muted">'+(e.venue||'')+'</div></td>'
      + '<td>'+ new Date((e.starts_at||0)*1000).toLocaleDateString() +'</td>'
      + '<td>'+ new Date((e.ends_at||0)*1000).toLocaleDateString() +'</td>'
      + '<td>'
        + '<button onclick="editEvent('+e.id+')">Edit</button> '
        + '<button onclick="deleteEvent('+e.id+')">Delete</button>'
      + '</td>'
    + '</tr>';
  }).join('');
  byId('ev_table').innerHTML =
    '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th></th></tr>' + (rows||'');
}
async function loadEvents(){
  var r = await jget('/api/admin/events').catch(function(){return {ok:false,events:[]}});
  _events = r.events||[];
  renderEvents();
}

/* Create Event panel */
byId('ev_new_btn').onclick = function(){ show('ev_new', true); };
byId('new_cancel').onclick = function(){ show('ev_new', false); byId('new_msg').textContent=''; };
byId('new_create').onclick = async function(){
  var start = parseLocalDateToMs(byId('new_start').value,false);
  var end   = parseLocalDateToMs(byId('new_end').value,true);
  if(!isFinite(start)||!isFinite(end)||end<start){ msg('new_msg','Select valid date range'); return; }
  var b = {
    slug: byId('new_slug').value.trim(),
    name: byId('new_name').value.trim(),
    venue: byId('new_venue').value.trim(),
    starts_at: Math.floor(start/1000),
    ends_at: Math.floor(end/1000),
    status: 'active'
  };
  var r = await jpost('/api/admin/events', b).catch(function(){return {ok:false}});
  if(r.ok){ msg('new_msg','Created',true); show('ev_new', false); await loadEvents(); }
  else msg('new_msg', r.error||'Failed');
};

/* Edit Event panel */
async function populateGates(){
  var g = await jget('/api/admin/gates').catch(function(){return {gates:[]}});
  var list = (g.gates||[]).map(function(x){ return '<li>'+x.name+'</li>'; }).join('');
  byId('gate_list').innerHTML = list || '<li class="muted">No gates yet</li>';
}
async function loadTT(eventId){
  // reuse public catalog for current event ticket types
  var slug = (_events.find(function(e){return e.id===eventId})||{}).slug;
  var listEl = byId('tt_list');
  if(!slug){ listEl.textContent='—'; return; }
  var r = await jget('/api/public/events/'+encodeURIComponent(slug)).catch(function(){return {ok:false}});
  if(!r.ok){ listEl.textContent='Could not load ticket types'; return; }
  var rows = (r.ticket_types||[]).map(function(tt){
    var price = (tt.price_cents ? ' — '+ (tt.price_cents/100).toFixed(2) : ' — FREE');
    var gen = (tt.requires_gender ? ' · gender' : '');
    return '<div>'+tt.name+ price + gen +'</div>';
  }).join('');
  listEl.innerHTML = rows || '<div class="muted">None</div>';
}
window.editEvent = async function(id){
  var r = await jget('/api/admin/events/'+id).catch(function(){return {ok:false}});
  if(!r.ok){ alert('Event not found'); return; }
  var e = r.event;
  byId('ed_id').value = e.id;
  byId('ed_slug').value = e.slug||'';
  byId('ed_name').value = e.name||'';
  byId('ed_venue').value = e.venue||'';
  byId('ed_start').value = msToInput((e.starts_at||0)*1000);
  byId('ed_end').value   = msToInput((e.ends_at||0)*1000);
  byId('ed_hero').value  = e.hero_url||'';
  byId('ed_poster').value= e.poster_url||'';
  var gallery = [];
  try { gallery = e.gallery_urls ? JSON.parse(e.gallery_urls) : []; } catch(_){}
  byId('ed_gallery').value = (gallery||[]).slice(0,8).join('\\n');
  show('ev_edit', true);
  byId('ed_msg').textContent = '';
  await populateGates();
  await loadTT(e.id);
};
byId('ed_cancel').onclick = function(){ show('ev_edit', false); };
byId('ed_save').onclick = async function(){
  var id = +byId('ed_id').value;
  if(!id) return;
  var start = parseLocalDateToMs(byId('ed_start').value,false);
  var end   = parseLocalDateToMs(byId('ed_end').value,true);
  if(!isFinite(start)||!isFinite(end)||end<start){ msg('ed_msg','Invalid date range'); return; }
  var gallery = byId('ed_gallery').value.split('\\n').map(function(s){return s.trim();}).filter(Boolean).slice(0,8);
  var b = {
    slug: byId('ed_slug').value.trim(),
    name: byId('ed_name').value.trim(),
    venue: byId('ed_venue').value.trim(),
    starts_at: Math.floor(start/1000),
    ends_at: Math.floor(end/1000),
    hero_url: byId('ed_hero').value.trim(),
    poster_url: byId('ed_poster').value.trim(),
    gallery_urls: gallery
  };
  var r = await jput('/api/admin/events/'+id, b).catch(function(){return {ok:false}});
  if(r.ok){ msg('ed_msg','Saved',true); await loadEvents(); await loadTT(id); }
  else msg('ed_msg', r.error||'Failed');
};
byId('ed_delete').onclick = async function(){
  var id = +byId('ed_id').value; if(!id) return;
  if(!confirm('Delete this event?')) return;
  var r = await jdel('/api/admin/events/'+id).catch(function(){return {ok:false}});
  if(r.ok){ show('ev_edit', false); await loadEvents(); }
  else alert(r.error||'Failed');
};

/* Ticket type add (Rands; blank => FREE) */
byId('tt_add').onclick = async function(){
  var id = +byId('ed_id').value; if(!id){ byId('tt_msg').textContent='Open an event first'; return; }
  var name = byId('tt_name').value.trim();
  var rands = byId('tt_price_r').value.trim();
  var requires_gender = byId('tt_gender').checked ? 1 : 0;
  if(!name){ byId('tt_msg').textContent='Name required'; return; }
  var price_cents = 0;
  if(rands){ var n = Math.round(parseFloat(rands)*100); if(isFinite(n)&&n>0) price_cents = n; }
  var b = { name:name, price_cents:price_cents, requires_gender:requires_gender };
  var res = await jpost('/api/admin/events/'+id+'/ticket-types', b).catch(function(){return {ok:false}});
  byId('tt_msg').textContent = res.ok ? 'Added' : (res.error||'Failed');
  if(res.ok){ byId('tt_name').value=''; byId('tt_price_r').value=''; byId('tt_gender').checked=false; await loadTT(id); }
};

/* Gates (global quick add) */
byId('gate_add').onclick = async function(){
  var nm = byId('gate_new').value.trim(); if(!nm) return;
  var r = await jpost('/api/admin/gates', {name:nm}).catch(function(){return {ok:false}});
  if(r.ok){ byId('gate_new').value=''; populateGates(); }
};

/* Delete event (table button) */
window.deleteEvent = async function(id){
  if(!confirm('Delete this event?')) return;
  var r = await jdel('/api/admin/events/'+id).catch(function(){return {ok:false}});
  if(r.ok) loadEvents();
};

/* POS Admin */
function setDefaultPosRange(){
  // default to this week
  var d = new Date();
  var day = d.getDay(); // 0..6
  var monday = new Date(d); monday.setDate(d.getDate() - ((day+6)%7));
  var sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  byId('pos_from').value = msToInput(monday.getTime());
  byId('pos_to').value   = msToInput(sunday.getTime());
}
async function loadPOS(){
  if(!byId('pos_from').value) setDefaultPosRange();
  await refreshPOS();
}
async function refreshPOS(){
  var f = byId('pos_from').value, t = byId('pos_to').value;
  var q = '?from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t);
  var r = await jget('/api/admin/pos/summary'+q).catch(function(){return {ok:false}});
  if(!r.ok){ msg('pos_msg','Could not load'); return; }
  var tot = r.totals||{};
  byId('pos_totals').innerHTML =
    '<div><strong>Orders:</strong> '+(tot.orders||0)+'</div>'
    + '<div><strong>Tickets:</strong> '+(tot.tickets||0)+'</div>'
    + '<div><strong>Cash:</strong> '+ (tot.cash_cents!=null ? rands(tot.cash_cents) : 'R0.00') +'</div>'
    + '<div><strong>Card:</strong> '+ (tot.card_cents!=null ? rands(tot.card_cents) : 'R0.00') +'</div>'
    + '<div><strong>Total:</strong> '+ (tot.total_cents!=null ? rands(tot.total_cents) : 'R0.00') +'</div>';

  var sess = (r.sessions||[]).map(function(s){
    return '<tr>'
      + '<td>'+s.id+'</td>'
      + '<td>'+ (s.cashier_name||'') +'</td>'
      + '<td>'+ (s.gate_name||'') +'</td>'
      + '<td>'+ new Date((s.opened_at||0)*1000).toLocaleString() +'</td>'
      + '<td>'+ (s.closed_at ? new Date(s.closed_at*1000).toLocaleString() : '<span class="muted">open</span>') +'</td>'
      + '<td>'+ rands(s.opening_float_cents||0) +'</td>'
      + '<td>'+ rands(s.cash_total_cents||0) +'</td>'
      + '<td>'+ rands(s.card_total_cents||0) +'</td>'
      + '<td>'+ rands((s.cash_total_cents||0)+(s.card_total_cents||0)) +'</td>'
    + '</tr>';
  }).join('');
  byId('pos_sessions').innerHTML =
    '<tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Float</th><th>Cash</th><th>Card</th><th>Total</th></tr>' + (sess||'');
}
byId('pos_refresh').onclick = refreshPOS;

/* Users */
async function loadUsers(){
  var r = await jget('/api/admin/users').catch(function(){return {ok:false}});
  if(!r.ok){
    byId('u_table').innerHTML = '<tr><td>Failed to load users</td></tr>';
    return;
  }
  var rows = (r.users||[]).map(function(u){
    return '<tr>'
      + '<td>'+u.id+'</td>'
      + '<td>'+u.username+'</td>'
      + '<td>'+(u.display_name||'')+'</td>'
      + '<td>'+u.role+'</td>'
      + '<td>'+(u.is_active? 'active':'inactive')+'</td>'
      + '<td>'
        + '<button onclick="resetPw('+u.id+')">Reset PW</button> '
        + '<button onclick="toggleUser('+u.id+','+(u.is_active?0:1)+')">'+(u.is_active?'Deactivate':'Activate')+'</button>'
      + '</td>'
    + '</tr>';
  }).join('');
  byId('u_table').innerHTML =
    '<tr><th>ID</th><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr>' + rows;
}
async function createUser(){
  var b = {
    username: byId('nu_username').value.trim(),
    display_name: byId('nu_name').value.trim(),
    role: byId('nu_role').value,
    password: byId('nu_password').value
  };
  var r = await jpost('/api/admin/users', b).catch(function(){return {ok:false}});
  byId('u_msg').textContent = r.ok? 'Created' : (r.error||'Failed');
  if(r.ok){
    ['nu_username','nu_name','nu_password'].forEach(function(id){ byId(id).value=''; });
    loadUsers();
  }
}
async function resetPw(id){
  var p = prompt('New password for user #'+id+':'); if(!p) return;
  await jput('/api/admin/users/'+id, {password:p});
  loadUsers();
}
async function toggleUser(id, active){
  await jput('/api/admin/users/'+id, {is_active: active});
  loadUsers();
}
byId('nu_create').onclick = createUser;

/* Init */
(async function init(){
  await loadSettings();
  await loadEvents();
  await loadPOS();
  await loadUsers();
})();
</script>
</body></html>`;
