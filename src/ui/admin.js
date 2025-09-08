// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
:root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
*{ box-sizing:border-box }
body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
.wrap{ max-width:1100px; margin:20px auto; padding:0 14px }
h1{ margin:0 0 12px }
.tabs{ display:flex; gap:6px; margin:12px 0 }
.tab{ padding:10px 12px; border-radius:10px; background:#fff; border:1px solid #e5e7eb; cursor:pointer }
.tab.active{ background:var(--green); color:#fff; border-color:transparent }
.card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:12px }
.muted{ color:var(--muted) }
.btn{ padding:8px 12px; border-radius:10px; background:var(--green); color:#fff; border:0; cursor:pointer; font-weight:600 }
.btn.outline{ background:#fff; color:#111; border:1px solid #e5e7eb }
.row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
table{ width:100%; border-collapse:collapse }
th, td{ padding:8px 10px; border-bottom:1px solid #f1f3f5; text-align:left; vertical-align:top }
th{ font-weight:700; background:#fafafa }
input, select{ padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
.kv{ display:grid; grid-template-columns:160px 1fr; gap:8px; align-items:center }
.bad{ color:#b42318; font-weight:600 }
.good{ color:#067647; font-weight:700 }
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
    <button class="tab" data-tab="site">Site settings</button>
  </div>

  <div id="pane-events" class="card"></div>
  <div id="pane-tickets" class="card" style="display:none"></div>
  <div id="pane-pos" class="card" style="display:none"></div>
  <div id="pane-vendors" class="card" style="display:none"></div>
  <div id="pane-users" class="card" style="display:none"></div>
  <div id="pane-site" class="card" style="display:none"></div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const esc = (s)=> String(s ?? '').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
const rands = (c)=> 'R' + ((Number(c)||0)/100).toFixed(2);

let EVENTS = [];

function switchTab(name){
  document.querySelectorAll('.tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===name);
  });
  ['events','tickets','pos','vendors','users','site'].forEach(p=>{
    const el = $('pane-'+p);
    el.style.display = (p===name) ? 'block' : 'none';
  });
}

/* ---------------- Events Pane ---------------- */
async function loadEvents(){
  const r = await fetch('/api/admin/events');
  const j = await r.json().catch(()=>({ok:false}));
  if (!j.ok) { $('pane-events').innerHTML = '<div class="bad">Failed to load events</div>'; return; }
  EVENTS = j.events || [];
  renderEventsPane();
}
function renderEventsPane(){
  const rows = (EVENTS||[]).map(ev => `
    <tr>
      <td>#${ev.id}</td>
      <td>${esc(ev.name)}</td>
      <td>${esc(ev.slug)}</td>
      <td>${esc(ev.venue||'')}</td>
      <td>${fmtDate(ev.starts_at)} – ${fmtDate(ev.ends_at)}</td>
      <td>${esc(ev.status)}</td>
      <td class="row" style="gap:6px">
        <button class="btn outline" data-tt="${ev.id}">Ticket types</button>
      </td>
    </tr>
  `).join('');
  $('pane-events').innerHTML = `
    <h2 style="margin:0 0 10px">Events</h2>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Name</th><th>Slug</th><th>Venue</th><th>When</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No events</td></tr>'}</tbody>
      </table>
    </div>
    <div id="ttypes" class="card" style="display:none; margin-top:10px"></div>
  `;
  document.querySelectorAll('[data-tt]').forEach(b=>{
    b.onclick = ()=> loadTicketTypes(Number(b.dataset.tt));
  });
}
async function loadTicketTypes(eventId){
  const host = $('ttypes');
  host.style.display = 'block';
  host.innerHTML = '<p class="muted">Loading ticket types…</p>';
  const j = await fetch('/api/admin/events/'+eventId+'/ticket-types').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ host.innerHTML = '<p class="bad">Failed to load ticket types</p>'; return; }
  const rows = (j.ticket_types||[]).map(t=>`
    <tr>
      <td>#${t.id}</td>
      <td>${esc(t.name)}</td>
      <td>${rands(t.price_cents)}</td>
      <td>${t.capacity}</td>
      <td>${t.per_order_limit}</td>
      <td>${t.requires_gender? 'Yes' : 'No'}</td>
    </tr>
  `).join('');
  host.innerHTML = `
    <h3 style="margin:0 0 8px">Ticket types for event #${eventId}</h3>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Name</th><th>Price</th><th>Capacity</th><th>Per order</th><th>Needs gender</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted">None</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/* ---------------- Tickets Pane ---------------- */
function renderTicketsPane(){
  const evOpts = (EVENTS||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  $('pane-tickets').innerHTML = `
    <h2 style="margin:0 0 10px">Tickets</h2>
    <div class="row" style="margin-bottom:10px">
      <select id="t_ev"><option value="">Select event…</option>${evOpts}</select>
      <button class="btn" id="t_load">Load</button>
      <span class="muted">Quick lookup:</span>
      <input id="t_code" placeholder="Order code (e.g. C056B6)" style="width:160px"/>
      <button class="btn outline" id="t_go">Open</button>
    </div>
    <div id="t_out"></div>
  `;
  $('t_load').onclick = async ()=>{
    const id = Number(($('t_ev').value||0));
    if (!id) { $('t_out').innerHTML = '<p class="muted">Choose an event.</p>'; return; }
    $('t_out').innerHTML = '<p class="muted">Loading…</p>';
    const j = await fetch('/api/admin/tickets/summary?event_id='+id).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ $('t_out').innerHTML = '<p class="bad">Failed to load</p>'; return; }

    const rows = (j.by_type||[]).map(x=>`
      <tr><td>${esc(x.name||'')}</td><td>${x.issued||0}</td></tr>
    `).join('');
    const states = (j.by_state||[]).map(s=>`
      <div>${esc(s.state)}: <b>${s.n}</b></div>
    `).join('');

    $('t_out').innerHTML = `
      <div class="card">
        <h3 style="margin:0 0 8px">Sold by type</h3>
        <div style="overflow:auto">
          <table>
            <thead><tr><th>Type</th><th>Issued</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="2" class="muted">No tickets</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px">By state</h3>
        ${states || '<div class="muted">No tickets</div>'}
      </div>
    `;
  };
  $('t_go').onclick = ()=>{
    const code = String(($('t_code').value||'')).trim();
    if (!code) return;
    location.href = '/t/' + encodeURIComponent(code);
  };
}

/* ---------------- POS Admin Pane ---------------- */
async function loadPOSPane(){
  $('pane-pos').innerHTML = '<p class="muted">Loading sessions…</p>';
  const j = await fetch('/api/admin/pos/sessions').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ $('pane-pos').innerHTML = '<p class="bad">Failed to load</p>'; return; }

  const rows = (j.sessions||[]).map(s=>`
    <tr>
      <td>#${s.id}</td>
      <td>${esc(s.cashier_name||'')}</td>
      <td>${esc(s.cashier_msisdn||'')}</td>
      <td>${esc(s.gate_name||'')}</td>
      <td>${fmtDT(s.opened_at)}</td>
      <td>${s.closed_at? fmtDT(s.closed_at): '<span class="muted">open</span>'}</td>
      <td>${rands(s.opening_float_cents||0)}</td>
      <td>${rands(s.cash_cents||0)}</td>
      <td>${rands(s.card_cents||0)}</td>
      <td>${esc(s.closing_manager||'')}</td>
    </tr>
  `).join('');

  $('pane-pos').innerHTML = `
    <h2 style="margin:0 0 10px">POS Sessions</h2>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Cashier</th><th>MSISDN</th><th>Gate</th>
          <th>Opened</th><th>Closed</th>
          <th>Opening float</th><th>Cash</th><th>Card</th><th>Closed by</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="muted">No sessions</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/* ---------------- Vendors Pane ---------------- */
function renderVendorsPane(){
  const evOpts = (EVENTS||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  $('pane-vendors').innerHTML = `
    <h2 style="margin:0 0 10px">Vendors</h2>
    <div class="row" style="margin-bottom:10px">
      <select id="v_ev"><option value="">Select event…</option>${evOpts}</select>
      <button class="btn" id="v_load">Load</button>
    </div>
    <div id="v_out"></div>
    <div id="venPasses" class="card" style="display:none; margin-top:10px"></div>
  `;
  $('v_load').onclick = async ()=>{
    const id = Number(($('v_ev').value||0));
    if (!id) { $('v_out').innerHTML = '<p class="muted">Choose an event.</p>'; return; }
    $('v_out').innerHTML = '<p class="muted">Loading…</p>';
    const j = await fetch('/api/admin/vendors?event_id='+id).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ $('v_out').innerHTML = '<p class="bad">Failed to load</p>'; return; }

    const rows = (j.vendors||[]).map(v=>`
      <tr>
        <td>#${v.id}</td>
        <td>${esc(v.name||'')}</td>
        <td>${esc(v.stand_number||'')}</td>
        <td>${esc(v.contact_name||'')}</td>
        <td>${esc(v.phone||'')}</td>
        <td>${esc(v.email||'')}</td>
        <td>${v.staff_quota||0} staff / ${v.vehicle_quota||0} vehicles</td>
        <td class="row" style="gap:6px">
          <button class="btn outline" data-edit-v="${v.id}" data-ev="${v.event_id}">Edit</button>
          <button class="btn" data-send-wa="${v.id}">Send WA</button>
          <button class="btn outline" data-pass="${v.id}">Passes</button>
        </td>
      </tr>
    `).join('');

    $('v_out').innerHTML = `
      <div style="overflow:auto">
        <table>
          <thead><tr>
            <th>ID</th><th>Name</th><th>Stand</th><th>Contact</th><th>Phone</th><th>Email</th><th>Quota</th><th></th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="8" class="muted">No vendors</td></tr>'}</tbody>
        </table>
      </div>
    `;

    // wire "Passes"
    document.querySelectorAll('[data-pass]').forEach(b=>{
      b.onclick = ()=> loadVendorPasses(Number(b.dataset.pass));
    });
  };
}

async function loadVendorPasses(vendorId){
  const host = $('venPasses');
  host.style.display = 'block';
  host.innerHTML = '<p class="muted">Loading passes…</p>';

  const j = await fetch('/api/admin/vendor-passes?vendor_id='+vendorId)
    .then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ host.innerHTML = '<p class="muted bad">Failed to load passes</p>'; return; }

  const rows = (j.passes||[]).map(p=>`
    <tr>
      <td>#${p.id}</td>
      <td>${esc(p.type||'')}</td>
      <td>${esc(p.label||'')}</td>
      <td>${esc(p.vehicle_reg||'')}</td>
      <td>${esc(p.qr||'')}</td>
      <td>${esc(p.state||'')}</td>
      <td>
        <a class="btn outline" href="/badge/${encodeURIComponent(p.qr)}" target="_blank" rel="noopener">Badge</a>
      </td>
    </tr>
  `).join('');

  host.innerHTML = `
    <h3 style="margin:0 0 8px">Vendor passes</h3>
    <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Type</th><th>Label</th><th>Vehicle</th><th>QR</th><th>State</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No passes</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/* ---------------- Users Pane ---------------- */
async function loadUsersPane(){
  $('pane-users').innerHTML = '<p class="muted">Loading users…</p>';
  const j = await fetch('/api/admin/users').then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ $('pane-users').innerHTML = '<p class="bad">Failed to load</p>'; return; }
  const rows = (j.users||[]).map(u=>`
    <tr><td>#${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td></tr>
  `).join('');
  $('pane-users').innerHTML = `
    <h2 style="margin:0 0 10px">Users</h2>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" class="muted">No users</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/* ---------------- Site Pane ---------------- */
function renderSitePane(){
  $('pane-site').innerHTML = `
    <h2 style="margin:0 0 10px">Site settings</h2>
    <p class="muted">Coming soon.</p>
  `;
}

/* ---------------- Helpers ---------------- */
function fmtDate(ts){
  const d = new Date((Number(ts)||0)*1000);
  return d.toLocaleDateString('af-ZA', { day:'2-digit', month:'short' });
}
function fmtDT(ts){
  if (!ts) return '';
  const d = new Date((Number(ts)||0)*1000);
  return d.toLocaleString('af-ZA', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

/* ---------------- Init ---------------- */
document.querySelectorAll('.tab').forEach(b=>{
  b.onclick = ()=>{
    switchTab(b.dataset.tab);
    if (b.dataset.tab==='events') renderEventsPane();
    if (b.dataset.tab==='tickets') renderTicketsPane();
    if (b.dataset.tab==='pos') loadPOSPane();
    if (b.dataset.tab==='vendors') renderVendorsPane();
    if (b.dataset.tab==='users') loadUsersPane();
    if (b.dataset.tab==='site') renderSitePane();
  }
});

loadEvents(); // default
</script>
</body></html>`;
