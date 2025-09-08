// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8 }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  .tabs{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px }
  .tab{ padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .tab.active{ background:var(--green); color:#fff; border-color:transparent }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:14px }
  table{ width:100%; border-collapse:collapse }
  th,td{ padding:8px 10px; border-bottom:1px solid #f1f3f5; text-align:left }
  h1{ margin:0 0 10px } h2{ margin:0 0 8px }
  input,select,textarea{ width:100%; padding:9px 10px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  .btn{ padding:9px 12px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.outline{ background:#fff; color:#0a7d2b; border:1px solid #0a7d2b }
  .muted{ color:var(--muted) }
  .pill{ display:inline-block; border:1px solid #e5e7eb; border-radius:999px; padding:3px 8px; font-size:12px }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  @media (max-width:900px){ .grid2{ grid-template-columns:1fr } }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <button class="tab active" data-tab="events">Events</button>
    <button class="tab" data-tab="tickets">Tickets</button>
    <button class="tab" data-tab="pos">POS Admin</button>
    <button class="tab" data-tab="vendors">Vendors</button>
    <button class="tab" data-tab="users">Users</button>
    <button class="tab" data-tab="site">Site</button>
  </div>

  <div id="panel-events" class="card"></div>
  <div id="panel-tickets" class="card" style="display:none"></div>
  <div id="panel-pos" class="card" style="display:none"></div>
  <div id="panel-vendors" class="card" style="display:none"></div>
  <div id="panel-users" class="card" style="display:none"></div>
  <div id="panel-site" class="card" style="display:none">
    <h2>Site settings</h2>
    <p class="muted">Coming soon</p>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s??"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const rands = (c)=>'R'+((Number(c||0))/100).toFixed(2);
const fmt = (s)=> new Date((Number(s||0))*1000).toLocaleString();
const val = (id)=>{ const el=$(id); return el? el.value: '' };
const setVal = (id,v)=>{ const el=$(id); if (el) el.value=v };

document.querySelectorAll('.tab').forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    document.querySelectorAll('[id^="panel-"]').forEach(x=>x.style.display='none');
    $('panel-'+t).style.display='block';
    if (t==='events') loadEvents();
    if (t==='tickets') renderTicketsPanel();
    if (t==='pos') loadPOS();
    if (t==='vendors') renderVendorsPanel();
    if (t==='users') loadUsers();
  };
});

/* =============== EVENTS =============== */

async function loadEvents(){
  const r = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok) { $('panel-events').innerHTML = '<p class="muted">Failed to load events</p>'; return; }

  const rows = (r.events||[]).map(ev=>`
    <tr>
      <td>${esc(ev.name)}</td>
      <td>${esc(ev.slug)}</td>
      <td>${esc(ev.venue||'')}</td>
      <td>${fmt(ev.starts_at)} – ${fmt(ev.ends_at)}</td>
      <td><span class="pill">${esc(ev.status)}</span></td>
      <td>
        <button class="btn outline" data-edit="${ev.id}">Edit</button>
        <button class="btn outline" data-tt="${ev.id}">Ticket types</button>
      </td>
    </tr>`).join('');

  $('panel-events').innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h2 style="margin:0">Events</h2>
      <button class="btn" id="btnNewEvent">New event</button>
    </div>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>Name</th><th>Slug</th><th>Venue</th><th>When</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows || ''}</tbody>
      </table>
    </div>
    <div id="evForm" class="card" style="margin-top:12px; display:none"></div>
    <div id="ttList" class="card" style="margin-top:12px; display:none"></div>
  `;

  document.querySelectorAll('[data-edit]').forEach(b=>{
    b.onclick = ()=> showEventForm(Number(b.dataset.edit));
  });
  $('btnNewEvent').onclick = ()=> showEventForm(0);
  document.querySelectorAll('[data-tt]').forEach(b=>{
    b.onclick = ()=> loadTicketTypes(Number(b.dataset.tt));
  });
}

function showEventForm(id){
  const host = $('evForm');
  host.style.display = 'block';
  host.innerHTML = `
    <h3 style="margin:0 0 8px">${id? 'Edit event':'New event'}</h3>
    <div class="grid2">
      <div><label>Name<input id="ev_name"></label></div>
      <div><label>Slug<input id="ev_slug"></label></div>
      <div><label>Venue<input id="ev_venue"></label></div>
      <div><label>Status
        <select id="ev_status">
          <option value="active">active</option>
          <option value="draft">draft</option>
          <option value="archived">archived</option>
        </select>
      </label></div>
      <div><label>Starts (unix)<input id="ev_starts" type="number"></label></div>
      <div><label>Ends (unix)<input id="ev_ends" type="number"></label></div>
      <div><label>Hero URL<input id="ev_hero"></label></div>
      <div><label>Poster URL<input id="ev_poster"></label></div>
      <div style="grid-column:1/-1"><label>Gallery URLs (JSON array)<textarea id="ev_gallery" rows="2"></textarea></label></div>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="evSave">Save</button>
      <button class="btn outline" id="evCancel">Cancel</button>
      <div class="muted" id="evMsg"></div>
    </div>
  `;

  if (id){
    fetch('/api/admin/events').then(r=>r.json()).then(j=>{
      const found = (j.events||[]).find(x=>x.id===id);
      if (found){
        setVal('ev_name', found.name);
        setVal('ev_slug', found.slug);
        setVal('ev_venue', found.venue||'');
        setVal('ev_status', found.status||'active');
        setVal('ev_starts', found.starts_at||'');
        setVal('ev_ends', found.ends_at||'');
        setVal('ev_hero', found.hero_url||'');
        setVal('ev_poster', found.poster_url||'');
        setVal('ev_gallery', found.gallery_urls||'');
      }
    });
  }

  $('evCancel').onclick = ()=>{ host.style.display='none'; };
  $('evSave').onclick = async ()=>{
    const body = {
      name: val('ev_name'), slug: val('ev_slug'), venue: val('ev_venue'),
      status: val('ev_status'),
      starts_at: Number(val('ev_starts')), ends_at: Number(val('ev_ends')),
      hero_url: val('ev_hero'), poster_url: val('ev_poster'), gallery_urls: val('ev_gallery')
    };
    if (!body.name || !body.slug || !body.starts_at || !body.ends_at){
      $('evMsg').textContent = 'Please fill required fields';
      return;
    }
    try{
      const url = id ? '/api/admin/events/'+id : '/api/admin/events';
      const method = id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'failed');
      $('evMsg').textContent = 'Saved';
      loadEvents();
    }catch(e){ $('evMsg').textContent = 'Error: '+(e.message||'unknown'); }
  };
}

async function loadTicketTypes(eventId){
  const host = $('ttList');
  host.style.display='block';
  const j = await fetch('/api/admin/events/'+eventId+'/ticket-types').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ host.innerHTML = '<p class="muted">Failed to load ticket types</p>'; return; }

  const rows = (j.items||[]).map(t=>`
    <tr>
      <td>${esc(t.name)}</td>
      <td>${esc(t.code||'')}</td>
      <td>${rands(t.price_cents)}</td>
      <td>${Number(t.capacity||0)}</td>
      <td>${Number(t.per_order_limit||0)}</td>
      <td>${Number(t.requires_gender||0) ? 'Yes':'No'}</td>
      <td><button class="btn outline" data-edit-tt="${t.id}" data-ev="${eventId}">Edit</button></td>
    </tr>`).join('');

  host.innerHTML = `
    <h3 style="margin:0 0 8px">Ticket types</h3>
    <div class="row" style="justify-content:space-between">
      <div class="muted">Event #${eventId}</div>
      <button class="btn" id="btnNewTT" data-ev="${eventId}">Add type</button>
    </div>
    <div style="overflow:auto;margin-top:8px">
      <table>
        <thead><tr>
          <th>Name</th><th>Code</th><th>Price</th><th>Capacity</th><th>Limit</th><th>Req gender</th><th></th>
        </tr></thead>
        <tbody>${rows||''}</tbody>
      </table>
    </div>
    <div id="ttForm" class="card" style="margin-top:12px; display:none"></div>
  `;

  $('btnNewTT').onclick = (e)=> showTTForm(Number(e.target.dataset.ev), 0);
  document.querySelectorAll('[data-edit-tt]').forEach(b=>{
    b.onclick = ()=> showTTForm(Number(b.dataset.ev), Number(b.dataset.editTt));
  });
}

function showTTForm(eventId, id){
  const host = $('ttForm'); host.style.display='block';
  host.innerHTML = `
    <h4 style="margin:0 0 6px">${id?'Edit type':'New type'}</h4>
    <div class="grid2">
      <div><label>Name<input id="tt_name"></label></div>
      <div><label>Code<input id="tt_code"></label></div>
      <div><label>Price cents<input id="tt_price" type="number"></label></div>
      <div><label>Capacity<input id="tt_cap" type="number"></label></div>
      <div><label>Per-order limit<input id="tt_lim" type="number"></label></div>
      <div><label>Requires gender
        <select id="tt_gen"><option value="0">No</option><option value="1">Yes</option></select>
      </label></div>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="ttSave">Save</button>
      <button class="btn outline" id="ttCancel">Cancel</button>
      <div class="muted" id="ttMsg"></div>
    </div>
  `;

  if (id){
    fetch('/api/admin/events/'+eventId+'/ticket-types').then(r=>r.json()).then(j=>{
      const t = (j.items||[]).find(x=>x.id===id);
      if (t){
        setVal('tt_name', t.name||'');
        setVal('tt_code', t.code||'');
        setVal('tt_price', Number(t.price_cents||0));
        setVal('tt_cap', Number(t.capacity||0));
        setVal('tt_lim', Number(t.per_order_limit||0));
        setVal('tt_gen', Number(t.requires_gender||0));
      }
    });
  }

  $('ttCancel').onclick = ()=>{ host.style.display='none'; };
  $('ttSave').onclick = async ()=>{
    const body = {
      name: val('tt_name'),
      code: val('tt_code')||null,
      price_cents: Number(val('tt_price')||0),
      capacity: Number(val('tt_cap')||0),
      per_order_limit: Number(val('tt_lim')||10),
      requires_gender: Number(val('tt_gen')||0)
    };
    try{
      const url = id
        ? '/api/admin/ticket-types/'+id
        : '/api/admin/events/'+eventId+'/ticket-types';
      const method = id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'failed');
      $('ttMsg').textContent = 'Saved';
      loadTicketTypes(eventId);
    }catch(e){ $('ttMsg').textContent = 'Error: '+(e.message||'unknown'); }
  };
}

/* =============== TICKETS =============== */

async function renderTicketsPanel(){
  const evs = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (!evs.ok){ $('panel-tickets').innerHTML = '<p class="muted">Failed to load events</p>'; return; }
  const opts = (evs.events||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  $('panel-tickets').innerHTML = `
    <h2>Tickets</h2>
    <div class="row" style="margin-bottom:8px">
      <select id="tkEvent"><option value="">Select event…</option>${opts}</select>
      <button class="btn" id="btnLoadTk">Load</button>
      <div class="row" style="margin-left:auto">
        <input id="ordCode" placeholder="Order code (e.g. 3VLNT5)" style="min-width:180px">
        <button class="btn outline" id="btnFindOrder">Open</button>
      </div>
    </div>
    <div id="tkSummary" class="card" style="display:none"></div>
    <div id="tkRecent" class="card" style="display:none"></div>
    <div id="ordModal" class="card" style="display:none"></div>
  `;

  $('btnLoadTk').onclick = async ()=>{
    const evId = Number(val('tkEvent')||0);
    if (!evId) return;
    const j = await fetch('/api/admin/tickets/summary/'+evId).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ $('tkSummary').style.display='block'; $('tkSummary').innerHTML='<p class="muted">Failed to load</p>'; return; }

    const t = j.totals||{};
    const bt = (j.by_type||[]).map(x=>`<li>${esc(x.type_name)} — ${x.cnt}</li>`).join('') || '<li class="muted">No tickets</li>';
    $('tkSummary').style.display='block';
    $('tkSummary').innerHTML = `
      <h3 style="margin:0 0 6px">Summary</h3>
      <div class="row">
        <span class="pill">Total: ${t.total||0}</span>
        <span class="pill">Unused: ${t.unused||0}</span>
        <span class="pill">In: ${t.in_count||0}</span>
        <span class="pill">Out: ${t.out_count||0}</span>
        <span class="pill">Void: ${t.void_count||0}</span>
      </div>
      <div style="margin-top:8px"><strong>By type</strong><ul>${bt}</ul></div>
    `;

    const rec = (j.recent||[]).map(r=>`
      <tr>
        <td>#${r.id}</td>
        <td>${esc(r.type_name||'')}</td>
        <td>${esc(r.attendee_first||'')} ${esc(r.attendee_last||'')}</td>
        <td>${esc(r.qr||'')}</td>
        <td>${esc(r.state||'')}</td>
        <td>${esc(r.short_code||'')}</td>
      </tr>`).join('');
    $('tkRecent').style.display='block';
    $('tkRecent').innerHTML = `
      <h3 style="margin:0 0 6px">Recent tickets</h3>
      <div style="overflow:auto">
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Holder</th><th>QR</th><th>State</th><th>Order</th></tr></thead>
          <tbody>${rec||''}</tbody>
        </table>
      </div>
    `;
  };

  $('btnFindOrder').onclick = async ()=>{
    const code = (val('ordCode')||'').trim();
    if (!code) return;
    const j = await fetch('/api/admin/orders/by-code/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false}));
    const m = $('ordModal'); m.style.display='block';
    if (!j.ok){ m.innerHTML = \`<p class="muted">Kon nie kaartjies vind met kode \${esc(code)} nie.</p>\`; return; }
    const t = (j.tickets||[]).map(x=>\`<li>\${esc(x.type_name)} — QR: \${esc(x.qr)} — \${esc(x.state)}</li>\`).join('') || '<li class="muted">No tickets</li>';
    m.innerHTML = `
      <h3 style="margin:0 0 6px">Order ${esc(j.order.short_code)} (${esc(j.event?.name||'')})</h3>
      <div>Buyer: ${esc(j.order.buyer_name||'')} · ${esc(j.order.buyer_email||'')} · ${esc(j.order.buyer_phone||'')}</div>
      <div style="margin-top:6px"><strong>Tickets</strong><ul>${t}</ul></div>
    `;
  };
}

/* =============== POS ADMIN =============== */

async function loadPOS(){
  const j = await fetch('/api/admin/pos/sessions').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ $('panel-pos').innerHTML = '<p class="muted">Failed to load sessions</p>'; return; }
  const rows = (j.sessions||[]).map(s=>`
    <tr>
      <td>#${s.id}</td>
      <td>${esc(s.event_name||'')}</td>
      <td>${esc(s.gate_name||'')}</td>
      <td>${esc(s.cashier_name||'')}</td>
      <td>${s.opened_at? fmt(s.opened_at):''}</td>
      <td>${s.closed_at? fmt(s.closed_at):'<span class="pill">open</span>'}</td>
      <td>${rands(s.cash_cents||0)}</td>
      <td>${rands(s.card_cents||0)}</td>
      <td>${rands((s.opening_float_cents||0)+(s.cash_cents||0)+(s.card_cents||0))}</td>
      <td>${esc(s.closing_manager||'')}</td>
    </tr>`).join('');
  $('panel-pos').innerHTML = `
    <h2>POS Sessions</h2>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Event</th><th>Gate</th><th>Cashier</th>
          <th>Opened</th><th>Closed</th><th>Cash</th><th>Card</th><th>Total</th><th>Closed by</th>
        </tr></thead>
        <tbody>${rows||''}</tbody>
      </table>
    </div>
  `;
}

/* =============== VENDORS =============== */

async function renderVendorsPanel(){
  const evs = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (!evs.ok){ $('panel-vendors').innerHTML = '<p class="muted">Failed to load events</p>'; return; }
  const opts = (evs.events||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  $('panel-vendors').innerHTML = `
    <h2>Vendors</h2>
    <div class="row" style="margin-bottom:8px">
      <select id="venEvent"><option value="">Select event…</option>${opts}</select>
      <button class="btn" id="btnLoadV">Load</button>
      <button class="btn outline" id="btnNewVendor" disabled>New vendor</button>
    </div>
    <div id="venList"></div>
    <div id="venForm" class="card" style="display:none"></div>
  `;

  $('btnLoadV').onclick = async ()=>{
    const evId = Number(val('venEvent')||0);
    if (!evId) return;
    $('btnNewVendor').disabled = false;
    const j = await fetch('/api/admin/vendors?event_id='+evId).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ $('venList').innerHTML='<p class="muted">Failed</p>'; return; }
    const rows = (j.vendors||[]).map(v=>`
      <tr>
        <td>${esc(v.name)}</td>
        <td>${esc(v.contact_name||'')}</td>
        <td>${esc(v.phone||'')}</td>
        <td>${esc(v.email||'')}</td>
        <td>${esc(v.stand_number||'')}</td>
        <td>${Number(v.staff_quota||0)} / ${Number(v.vehicle_quota||0)}</td>
        <td class="row" style="gap:6px">
          <button class="btn outline" data-edit-v="${v.id}" data-ev="${v.event_id}">Edit</button>
          <button class="btn" data-send-wa="${v.id}">Send WA</button>
        </td>
      </tr>`).join('');
    $('venList').innerHTML = `
      <div style="overflow:auto">
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Quotas</th><th></th></tr></thead>
          <tbody>${rows||''}</tbody>
        </table>
      </div>`;
    document.querySelectorAll('[data-edit-v]').forEach(b=>{
      b.onclick = ()=> showVendorForm(Number(b.dataset.ev), Number(b.dataset.editV));
    });
    document.querySelectorAll('[data-send-wa]').forEach(b=>{
      b.onclick = ()=> sendVendorWA(Number(b.dataset.sendWa));
    });
    $('btnNewVendor').onclick = ()=> showVendorForm(evId, 0);
  };
}

function showVendorForm(eventId, id){
  const host = $('venForm'); host.style.display='block';
  host.innerHTML = `
    <h3 style="margin:0 0 6px">${id?'Edit vendor':'New vendor'}</h3>
    <div class="grid2">
      <div><label>Name<input id="v_name"></label></div>
      <div><label>Contact<input id="v_contact"></label></div>
      <div><label>Phone<input id="v_phone"></label></div>
      <div><label>Email<input id="v_email"></label></div>
      <div><label>Stand #<input id="v_stand"></label></div>
      <div><label>Staff quota<input id="v_staff" type="number"></label></div>
      <div><label>Vehicle quota<input id="v_vehicle" type="number"></label></div>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="vSave">Save</button>
      <button class="btn outline" id="vCancel">Cancel</button>
      <div class="muted" id="vMsg"></div>
    </div>
  `;

  if (id){
    fetch('/api/admin/vendors?event_id='+eventId).then(r=>r.json()).then(j=>{
      const v = (j.vendors||[]).find(x=>x.id===id);
      if (v){
        setVal('v_name', v.name||'');
        setVal('v_contact', v.contact_name||'');
        setVal('v_phone', v.phone||'');
        setVal('v_email', v.email||'');
        setVal('v_stand', v.stand_number||'');
        setVal('v_staff', Number(v.staff_quota||0));
        setVal('v_vehicle', Number(v.vehicle_quota||0));
      }
    });
  }

  $('vCancel').onclick = ()=>{ host.style.display='none'; };
  $('vSave').onclick = async ()=>{
    const body = {
      event_id: eventId,
      name: val('v_name'), contact_name: val('v_contact'),
      phone: val('v_phone'), email: val('v_email'),
      stand_number: val('v_stand'),
      staff_quota: Number(val('v_staff')||0),
      vehicle_quota: Number(val('v_vehicle')||0)
    };
    try{
      const url = id ? '/api/admin/vendors/'+id : '/api/admin/vendors';
      const method = id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'failed');
      $('vMsg').textContent = 'Saved';
      document.getElementById('btnLoadV').click();
    }catch(e){ $('vMsg').textContent = 'Error: '+(e.message||'unknown'); }
  };
}

async function sendVendorWA(id){
  const btn = document.querySelector(\`[data-send-wa="\${id}"]\`);
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try{
    const r = await fetch('/api/admin/vendors/'+id+'/send-wa', { method: 'POST' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error||'failed');
    if (btn) btn.textContent = 'Sent ('+(j.mode||'ok')+')';
  }catch(e){
    alert('WhatsApp send failed: '+(e.message||'unknown'));
    if (btn) btn.textContent = 'Send WA';
  }finally{
    if (btn) btn.disabled = false;
  }
}

/* =============== USERS =============== */

async function loadUsers(){
  const j = await fetch('/api/admin/users').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ $('panel-users').innerHTML='<p class="muted">Failed to load users</p>'; return; }
  const rows = (j.users||[]).map(u=>`
    <tr><td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td></tr>
  `).join('');
  $('panel-users').innerHTML = `
    <h2>Users</h2>
    <div style="overflow:auto">
      <table><thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
      <tbody>${rows||''}</tbody></table>
    </div>
  `;
}

/* boot */
loadEvents();
</script>
</body></html>`;
