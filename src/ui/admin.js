// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8 }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1200px; margin:18px auto; padding:0 14px }
  h1{ margin:0 0 12px }
  .tabs{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px }
  .tab{ padding:8px 12px; border-radius:10px; background:#fff; border:1px solid #e5e7eb; cursor:pointer }
  .tab.active{ background:var(--green); color:#fff; border-color:transparent }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:12px }
  table{ width:100%; border-collapse:collapse }
  th,td{ padding:8px 10px; border-bottom:1px solid #eef1f3; text-align:left; font-size:14px }
  th{ color:#475569; font-weight:700 }
  input,select,button,textarea{ font:inherit }
  input,select,textarea{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; background:#fff }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent; font-weight:700 }
  .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center }
  .muted{ color:#64748b }
  .hr{ height:1px; background:#eef1f3; margin:10px 0 }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <div class="tab active" data-tab="events">Events</div>
    <div class="tab" data-tab="tickets">Tickets</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="settings">Site Settings</div>
  </div>

  <div id="pane-events" class="card"></div>
  <div id="pane-tickets" class="card" style="display:none"></div>
  <div id="pane-pos" class="card" style="display:none"></div>
  <div id="pane-vendors" class="card" style="display:none"></div>
  <div id="pane-users" class="card" style="display:none"></div>
  <div id="pane-settings" class="card" style="display:none">
    <div class="muted">Coming soon…</div>
  </div>
</div>

<script>
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s)=>String(s??'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

/* ---------------- Tabs ---------------- */
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  const name = t.dataset.tab;
  ['events','tickets','pos','vendors','users','settings'].forEach(n=>{
    $('#pane-'+n).style.display = (n===name?'block':'none');
  });
  if (name==='events') loadEvents();
  if (name==='tickets') renderTicketsPane();
  if (name==='pos') loadPOS();
  if (name==='vendors') renderVendorsPane();
  if (name==='users') loadUsers();
});

/* ---------------- Events pane ---------------- */
async function loadEvents(){
  const pane = $('#pane-events');
  pane.innerHTML = '<div class="muted">Loading…</div>';
  const r = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok) { pane.innerHTML = '<div class="muted">Failed</div>'; return; }
  const rows = (r.events||[]).map(ev => `
    <tr>
      <td>${ev.id}</td>
      <td>${esc(ev.name)}</td>
      <td>${esc(ev.slug)}</td>
      <td>${new Date(ev.starts_at*1000).toLocaleDateString()}</td>
      <td>${new Date(ev.ends_at*1000).toLocaleDateString()}</td>
      <td>${esc(ev.status)}</td>
      <td><button class="btn" data-view-ev="${ev.id}">View</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No events</td></tr>';
  pane.innerHTML = `
    <h2>Events</h2>
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Slug</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div id="evDetail"></div>
  `;
  $$('#pane-events [data-view-ev]').forEach(b=>{
    b.onclick = ()=> viewEvent(Number(b.dataset.viewEv||0));
  });
}

async function viewEvent(id){
  const box = $('#evDetail');
  box.innerHTML = '<div class="hr"></div><div class="muted">Loading…</div>';
  const r = await fetch('/api/admin/events/'+id).then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok){ box.innerHTML = '<div class="hr"></div><div class="muted">Not found</div>'; return; }
  const ev = r.event||{}, tt = r.ticket_types||[];
  const ttRows = tt.map(t=>`
    <tr>
      <td>${t.id}</td><td>${esc(t.name)}</td>
      <td>${(t.price_cents||0)/100}</td>
      <td>${t.capacity}</td>
      <td>${t.per_order_limit}</td>
      <td>${t.requires_gender? 'Yes':'No'}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">No ticket types</td></tr>';
  box.innerHTML = `
    <div class="hr"></div>
    <div class="row" style="justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700">${esc(ev.name)}</div>
        <div class="muted">${esc(ev.slug)} · ${ev.venue||''}</div>
      </div>
      <button class="btn" data-open-tickets-summary="${ev.id}">Load ticket summary</button>
    </div>
    <div id="evSummary" class="muted" style="margin:8px 0 12px"></div>
    <h3>Ticket types</h3>
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Cap</th><th>Per Order</th><th>Gender</th></tr></thead>
      <tbody>${ttRows}</tbody>
    </table>
  `;
  $('[data-open-tickets-summary]').onclick = async () => {
    const s = await fetch('/api/admin/tickets/summary/'+id).then(r=>r.json()).catch(()=>({ok:false}));
    if (!s.ok) { $('#evSummary').textContent = 'Failed to load summary'; return; }
    const a = s.summary||{};
    $('#evSummary').innerHTML = \`Total: \${a.total} · Unused: \${a.unused} · In: \${a.in} · Out: \${a.out} · Void: \${a.void}\`;
  };
}

/* ---------------- Tickets pane ---------------- */
function renderTicketsPane(){
  const pane = $('#pane-tickets');
  pane.innerHTML = `
    <h2>Tickets</h2>
    <div class="row" style="margin-bottom:10px">
      <input id="tkCode" placeholder="Order code e.g. C056B6" style="min-width:220px"/>
      <button id="tkLookup" class="btn">Lookup</button>
    </div>
    <div id="tkResult" class="muted">Enter an order code to view tickets.</div>
  `;
  $('#tkLookup').onclick = doTicketLookup;
}

async function doTicketLookup(){
  const code = ($('#tkCode').value||'').trim();
  if (!code) return;
  const pane = $('#tkResult');
  pane.innerHTML = 'Loading…';
  const r = await fetch('/api/admin/orders/by-code/'+encodeURIComponent(code)).then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok){ pane.innerHTML = 'Not found'; return; }
  const o = r.order||{}, list = r.tickets||[];
  const rows = list.map(t=>`
    <tr>
      <td>${t.id}</td>
      <td>${esc(t.type_name||'')}</td>
      <td>${esc([t.attendee_first,t.attendee_last].filter(Boolean).join(' ') || '')}</td>
      <td>${esc(t.state||'')}</td>
      <td>${(t.price_cents||0)/100}</td>
      <td><a class="btn" href="/t/${encodeURIComponent(o.short_code)}" target="_blank">Open</a></td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">No tickets on this order</td></tr>';

  const phonePrefill = (o.buyer_phone||'').trim();
  pane.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700">Order ${esc(o.short_code||'')}</div>
        <div class="muted">Total R${((o.total_cents||0)/100).toFixed(2)}</div>
      </div>
      <div class="row">
        <input id="waTo" placeholder="E.164 phone e.g. 2771…" value="${esc(phonePrefill)}" style="min-width:200px"/>
        <button id="waSend" class="btn primary">Send via WhatsApp</button>
      </div>
    </div>
    <div class="hr"></div>
    <table>
      <thead><tr><th>ID</th><th>Type</th><th>Name</th><th>State</th><th>Price</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div id="waMsg" class="muted" style="margin-top:8px"></div>
  `;
  $('#waSend').onclick = async () => {
    $('#waMsg').textContent = 'Sending…';
    const to = ($('#waTo').value||'').trim();
    const res = await fetch('/api/admin/orders/send-wa', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ code: o.short_code, to })
    }).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));
    $('#waMsg').textContent = res.ok ? 'Sent ✅' : ('Error: '+(res.error||'failed'));
  };
}

/* ---------------- POS Admin pane ---------------- */
async function loadPOS(){
  const pane = $('#pane-pos');
  pane.innerHTML = '<div class="muted">Loading…</div>';
  const r = await fetch('/api/admin/pos/sessions').then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok){ pane.innerHTML = '<div class="muted">Failed</div>'; return; }
  const rows = (r.sessions||[]).map(s=>`
    <tr>
      <td>${s.id}</td>
      <td>${esc(s.cashier_name||'')}</td>
      <td>${s.gate_id||''}</td>
      <td>${new Date(s.opened_at*1000).toLocaleString()}</td>
      <td>${s.closed_at ? new Date(s.closed_at*1000).toLocaleString() : '—'}</td>
      <td>R${((s.opening_float_cents||0)/100).toFixed(2)}</td>
      <td>R${((s.cash_cents||0)/100).toFixed(2)}</td>
      <td>R${((s.card_cents||0)/100).toFixed(2)}</td>
      <td>${esc(s.closing_manager||'')}</td>
    </tr>`).join('') || '<tr><td colspan="9" class="muted">No sessions</td></tr>';
  pane.innerHTML = `
    <h2>POS Sessions</h2>
    <table>
      <thead><tr>
        <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th>
        <th>Float</th><th>Cash</th><th>Card</th><th>Closed by</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ---------------- Vendors pane (with edit) ---------------- */
function renderVendorsPane(){
  const pane = $('#pane-vendors');
  pane.innerHTML = `
    <h2>Vendors</h2>
    <div class="row" style="margin-bottom:10px">
      <select id="vEv"></select>
      <button id="vLoad" class="btn">Load</button>
      <button id="vNew" class="btn">+ New</button>
    </div>
    <div id="vList" class="muted">Select an event and click Load.</div>
    <div class="hr"></div>
    <div id="vEdit"></div>
  `;

  // fill events for selector
  (async ()=>{
    const ev = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
    const sel = $('#vEv');
    if (!ev.ok){ sel.innerHTML = '<option value="">(failed)</option>'; return; }
    sel.innerHTML = (ev.events||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  })();

  $('#vLoad').onclick = loadVendors;
  $('#vNew').onclick = ()=> showVendorEditor({ id:0, event_id: Number($('#vEv').value||0), name:'', contact_name:'', phone:'', email:'', stand_number:'', staff_quota:0, vehicle_quota:0 });
}

async function loadVendors(){
  const eventId = Number(($('#vEv').value)||0);
  const list = $('#vList');
  if (!eventId){ list.textContent = 'Pick an event.'; return; }
  list.textContent = 'Loading…';
  const r = await fetch('/api/admin/vendors/'+eventId).then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok){ list.textContent = 'Failed'; return; }
  const rows = (r.vendors||[]).map(v=>`
    <tr>
      <td>${v.id}</td>
      <td>${esc(v.name)}</td>
      <td>${esc(v.contact_name||'')}</td>
      <td>${esc(v.phone||'')}</td>
      <td>${esc(v.email||'')}</td>
      <td>${esc(v.stand_number||'')}</td>
      <td>${v.staff_quota||0}</td>
      <td>${v.vehicle_quota||0}</td>
      <td>
        <button class="btn" data-edit="${v.id}">Edit</button>
        <button class="btn" data-del="${v.id}">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9" class="muted">No vendors</td></tr>';
  list.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>
        <th>Stand</th><th>Staff quota</th><th>Vehicle quota</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  $$('#vList [data-edit]').forEach(b=>{
    b.onclick = ()=>{
      const id = Number(b.dataset.edit);
      const v = (r.vendors||[]).find(x=>x.id===id);
      showVendorEditor(v);
    };
  });
  $$('#vList [data-del]').forEach(b=>{
    b.onclick = async ()=>{
      if (!confirm('Delete this vendor?')) return;
      await fetch('/api/admin/vendors/delete',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id:Number(b.dataset.del) }) });
      loadVendors();
    };
  });
}

function showVendorEditor(v){
  const el = $('#vEdit');
  el.innerHTML = `
    <h3>${v.id? 'Edit Vendor':'New Vendor'}</h3>
    <div class="row" style="margin-bottom:8px">
      <input id="vnName" placeholder="Name" value="${esc(v.name||'')}" style="min-width:260px"/>
      <input id="vnContact" placeholder="Contact person" value="${esc(v.contact_name||'')}"/>
      <input id="vnPhone" placeholder="Phone (WhatsApp)" value="${esc(v.phone||'')}"/>
      <input id="vnEmail" placeholder="Email" value="${esc(v.email||'')}"/>
      <input id="vnStand" placeholder="Stand #" value="${esc(v.stand_number||'')}"/>
    </div>
    <div class="row" style="margin-bottom:8px">
      <input id="vnStaff" type="number" min="0" step="1" value="${Number(v.staff_quota||0)}" style="width:120px"/>
      <input id="vnVeh" type="number" min="0" step="1" value="${Number(v.vehicle_quota||0)}" style="width:140px"/>
      <button id="vnSave" class="btn primary">Save</button>
      <span id="vnMsg" class="muted"></span>
    </div>
  `;
  $('#vnSave').onclick = async ()=>{
    $('#vnMsg').textContent = 'Saving…';
    const payload = {
      id: v.id||0,
      event_id: v.event_id || Number(($('#vEv').value)||0),
      name: ($('#vnName').value||'').trim(),
      contact_name: ($('#vnContact').value||'').trim(),
      phone: ($('#vnPhone').value||'').trim(),
      email: ($('#vnEmail').value||'').trim(),
      stand_number: ($('#vnStand').value||'').trim(),
      staff_quota: Number($('#vnStaff').value||0),
      vehicle_quota: Number($('#vnVeh').value||0)
    };
    const r = await fetch('/api/admin/vendors/save', {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
    }).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));
    $('#vnMsg').textContent = r.ok ? 'Saved ✅' : ('Error: '+(r.error||''));
    loadVendors();
  };
}

/* ---------------- Users pane (read-only list) ---------------- */
async function loadUsers(){
  const pane = $('#pane-users');
  pane.innerHTML = '<div class="muted">Loading…</div>';
  const r = await fetch('/api/admin/users').then(r=>r.json()).catch(()=>({ok:false}));
  if (!r.ok){ pane.innerHTML = '<div class="muted">Failed</div>'; return; }
  const rows = (r.users||[]).map(u=>`
    <tr>
      <td>${u.id}</td>
      <td>${esc(u.username)}</td>
      <td>${esc(u.role)}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted">No users</td></tr>';
  pane.innerHTML = `
    <h2>Users</h2>
    <table>
      <thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* boot */
loadEvents();
</script>
</body></html>`;
