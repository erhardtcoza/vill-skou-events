// /src/ui/admin.js
// Standalone admin dashboard UI (Tickets, Vendors, Users)

function esc(s=""){ return String(s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function shellCSS(){ return `
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif;margin:0;background:#f6f7f8;color:#0b1d14}
  a{color:#0a7d2b;text-decoration:none} a:hover{text-decoration:underline}
  .wrap{max-width:980px;margin:28px auto;padding:0 16px}
  h1{font-size:34px;margin:18px 0 16px}
  .tabs{display:flex;gap:10px;margin-bottom:18px}
  .tab{padding:10px 18px;border-radius:999px;background:#eef3ef;color:#0a7d2b}
  .tab.active{background:#cfe8d6;font-weight:700}
  .card{background:#fff;border:1px solid #e4e6e8;border-radius:14px;padding:14px 16px;box-shadow:0 1px 0 #e7e9ea}
  .grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-bottom:12px}
  .btn{background:#0a7d2b;color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:700}
  .btn.secondary{background:#1f2937}
  input,select{border:1px solid #d8dcdf;border-radius:10px;padding:10px 12px;background:#fff}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border-top:1px solid #eceff1;padding:10px 8px;text-align:left}
  th{color:#4b5563;font-weight:600}
  .muted{color:#6b7280}
`; }

function pageJS(){ return `
(async () => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
  const fmtR = (c) => "R" + (Number(c||0)/100).toFixed(2);

  async function getEvents(){
    const r = await fetch('/api/admin/events/basic');
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'Failed events');
    return j.events;
  }

  function fillEventSelect(sel, events){
    sel.innerHTML = events.map(e =>
      '<option value="'+e.id+'">'+
      esc(e.name)+' ('+esc(e.slug)+')</option>').join('');
  }

  /* ---------------- TICKETS TAB ---------------- */
  async function loadTickets(evId){
    const box = $('#tickets-box');
    box.innerHTML = '<div class="muted">Loading…</div>';
    const r = await fetch('/api/admin/tickets/summary?event_id='+encodeURIComponent(evId));
    const j = await r.json();
    if(!j.ok){ box.innerHTML = '<div class="muted">Not Found</div>'; return; }

    const totals = j.totals;
    const header =
      '<div class="muted">Total: '+totals.total+
      ' · In: '+totals.in+' · Out: '+totals.out+
      ' · Unused: '+totals.unused+' · Void: '+totals.void+'</div>';

    const rows = j.rows.map(r =>
      '<tr>'+
        '<td>'+esc(r.name)+'</td>'+
        '<td>'+fmtR(r.price_cents)+'</td>'+
        '<td>'+r.total+'</td>'+
        '<td>'+r.unused+'</td>'+
        '<td>'+r.in+'</td>'+
        '<td>'+r.out+'</td>'+
        '<td>'+r.void+'</td>'+
      '</tr>').join('');

    box.innerHTML =
      header +
      '<table><thead><tr>'+
        '<th>Type</th><th>Price (R)</th><th>Total</th>'+
        '<th>Unused</th><th>In</th><th>Out</th><th>Void</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>' +
      orderLookupHTML();
    bindOrderLookup();
  }

  function orderLookupHTML(){
    return '<div class="card" style="margin-top:14px">'+
      '<div class="grid">'+
      '<input id="ol-code" placeholder="Order code (e.g. 3VLNT5)"/>'+
      '<button class="btn" id="ol-btn">Lookup</button>'+
      '</div>'+
      '<div id="ol-result"></div>'+
      '</div>';
  }

  function bindOrderLookup(){
    $('#ol-btn')?.addEventListener('click', async () => {
      const code = $('#ol-code').value.trim();
      if(!code) return;
      const out = $('#ol-result');
      out.innerHTML = '<div class="muted">Loading…</div>';
      const r = await fetch('/api/admin/order/by-code/'+encodeURIComponent(code));
      const j = await r.json();
      if(!j.ok){ out.innerHTML = '<div class="muted">Not found</div>'; return; }

      const trows = (j.tickets||[]).map(t =>
        '<tr><td>'+t.id+'</td><td>'+esc(t.type_name)+'</td>'+
        '<td class="muted">'+esc(t.qr)+'</td><td>'+esc(t.state)+'</td></tr>').join('');

      const ticketLink = '/t/'+encodeURIComponent(j.order.short_code);
      out.innerHTML =
        '<div class="grid" style="grid-template-columns:auto 1fr">'+
        '<div class="muted">Ticket link:</div>'+
        '<div><a href="'+ticketLink+'" target="_blank">'+ticketLink+'</a></div>'+
        '</div>'+
        '<table><thead><tr><th>ID</th><th>Type</th><th>QR</th><th>State</th></tr></thead>'+
        '<tbody>'+trows+'</tbody></table>'+
        '<div class="grid" style="margin-top:10px">'+
          '<input id="wa-phone" placeholder="e.g. 2771xxxxxxx" value="'+esc(j.order.buyer_phone||'')+'"/>'+
          '<button class="btn" id="wa-send">Send via WhatsApp</button>'+
        '</div>';

      $('#wa-send').addEventListener('click', async () => {
        const phone = $('#wa-phone').value.trim().replace(/\\D/g,'');
        if(!phone) { alert('Enter phone in international format'); return; }
        const rs = await fetch('/api/admin/order/send-wa', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ phone, code: j.order.short_code })
        });
        const js = await rs.json().catch(()=>({}));
        if(!rs.ok || js.ok===false){ alert('Failed: '+(js.error||'Failed to send')); }
        else { alert('Sent'); }
      });
    });
  }

  /* ---------------- VENDORS TAB ---------------- */
  async function loadVendors(evId){
    const box = $('#vendors-box');
    box.innerHTML = '<div class="muted">Loading…</div>';
    const r = await fetch('/api/admin/vendors/list?event_id='+encodeURIComponent(evId));
    const j = await r.json();
    if(!j.ok){ box.innerHTML = '<div class="muted">Not Found</div>'; return; }

    const rows = (j.vendors||[]).map(v =>
      '<tr data-id="'+v.id+'">'+
      '<td><input value="'+esc(v.name||'')+'" class="v-name"/></td>'+
      '<td><input value="'+esc(v.contact_name||'')+'" class="v-contact"/></td>'+
      '<td><input value="'+esc(v.phone||'')+'" class="v-phone"/></td>'+
      '<td><input value="'+esc(v.email||'')+'" class="v-email"/></td>'+
      '<td style="width:90px"><input value="'+esc(v.stand_number||'')+'" class="v-stand"/></td>'+
      '<td style="width:90px"><input type="number" value="'+(v.staff_quota||0)+'" class="v-staff"/></td>'+
      '<td style="width:90px"><input type="number" value="'+(v.vehicle_quota||0)+'" class="v-vehicle"/></td>'+
      '<td><button class="btn v-save">Save</button></td>'+
      '</tr>').join('');

    box.innerHTML =
      '<table><thead><tr>'+
      '<th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>'+
      '<th>Stand #</th><th>Staff quota</th><th>Vehicle quota</th><th></th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>'+
      '<h3 class="muted" style="margin-top:16px">New vendor</h3>'+
      '<div class="grid" style="grid-template-columns:repeat(7,1fr) auto">'+
      '<input id="nv-name" placeholder="Vendor name"/>'+
      '<input id="nv-contact" placeholder="Contact name"/>'+
      '<input id="nv-phone" placeholder="Phone"/>'+
      '<input id="nv-email" placeholder="Email"/>'+
      '<input id="nv-stand" placeholder="Stand #"/>'+
      '<input id="nv-staff" type="number" placeholder="Staff"/>'+
      '<input id="nv-vehicle" type="number" placeholder="Vehicles"/>'+
      '<button class="btn" id="nv-add">Add</button>'+
      '</div>';

    // save buttons
    $$('#vendors-box .v-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const payload = {
          id: Number(tr.dataset.id),
          name: $('.v-name', tr).value,
          contact_name: $('.v-contact', tr).value,
          phone: $('.v-phone', tr).value,
          email: $('.v-email', tr).value,
          stand_number: $('.v-stand', tr).value,
          staff_quota: Number($('.v-staff', tr).value||0),
          vehicle_quota: Number($('.v-vehicle', tr).value||0),
        };
        const rs = await fetch('/api/admin/vendors/update', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        const js = await rs.json().catch(()=>({}));
        if(!rs.ok || js.ok===false) alert('Save failed');
        else alert('Saved');
      });
    });

    $('#nv-add').addEventListener('click', async ()=>{
      const payload = {
        event_id: Number($('#events-v').value),
        name: $('#nv-name').value,
        contact_name: $('#nv-contact').value,
        phone: $('#nv-phone').value,
        email: $('#nv-email').value,
        stand_number: $('#nv-stand').value,
        staff_quota: Number($('#nv-staff').value||0),
        vehicle_quota: Number($('#nv-vehicle').value||0)
      };
      const rs = await fetch('/api/admin/vendors/create', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const js = await rs.json().catch(()=>({}));
      if(!rs.ok || js.ok===false) alert('Create failed');
      else { alert('Added'); loadVendors(payload.event_id); }
    });
  }

  /* ---------------- USERS TAB ---------------- */
  async function refreshUsers(){
    const box = $('#users-box');
    const r = await fetch('/api/admin/users/list');
    const j = await r.json();
    if(!j.ok){ box.innerHTML = '<div class="muted">Failed</div>'; return; }
    const rows = (j.users||[]).map(u =>
      '<tr><td>'+u.id+'</td><td>'+esc(u.username)+'</td>'+
      '<td>'+esc(u.role)+'</td>'+
      '<td><button class="btn secondary u-del" data-id="'+u.id+'">Delete</button></td></tr>'
    ).join('');
    box.innerHTML = '<table><thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Actions</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>';
    $$('#users-box .u-del').forEach(b => b.addEventListener('click', async ()=>{
      if(!confirm('Delete user?')) return;
      const rs = await fetch('/api/admin/users/delete', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:Number(b.dataset.id) })
      });
      await rs.json().catch(()=>{});
      refreshUsers();
    }));
  }

  $('#user-add').addEventListener('click', async ()=>{
    const username = $('#user-new').value.trim();
    const role = $('#user-role').value;
    if(!username) return;
    const rs = await fetch('/api/admin/users/create', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, role })
    });
    await rs.json().catch(()=>{});
    $('#user-new').value = '';
    refreshUsers();
  });

  /* ---------------- Boot ---------------- */
  const events = await getEvents().catch(()=>[]);
  fillEventSelect($('#events-t'), events);
  fillEventSelect($('#events-v'), events);

  $('#btn-load-t').addEventListener('click', ()=> loadTickets($('#events-t').value));
  $('#btn-load-v').addEventListener('click', ()=> loadVendors($('#events-v').value));

  refreshUsers();
})();
`; }

export function adminHTML(){
  return `<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Admin · Villiersdorp Skou</title>
  <style>${shellCSS()}</style>
</head>
<body>
  <div class="wrap">
    <h1>Admin dashboard</h1>

    <div class="tabs">
      <a class="tab active" href="#tickets">Tickets</a>
      <a class="tab" href="#vendors">Vendors</a>
      <a class="tab" href="#users">Users</a>
    </div>

    <!-- Tickets -->
    <section id="sec-tickets" class="card">
      <div class="grid">
        <select id="events-t"></select>
        <button class="btn" id="btn-load-t">Load</button>
      </div>
      <div id="tickets-box" class="muted">Pick an event and Load.</div>
    </section>

    <!-- Vendors -->
    <section id="sec-vendors" class="card" style="margin-top:14px">
      <div class="grid">
        <select id="events-v"></select>
        <button class="btn" id="btn-load-v">Load</button>
      </div>
      <div id="vendors-box" class="muted">Pick an event and Load.</div>
    </section>

    <!-- Users -->
    <section id="sec-users" class="card" style="margin-top:14px">
      <div class="grid" style="grid-template-columns:auto 130px 110px">
        <input id="user-new" placeholder="username"/>
        <select id="user-role">
          <option value="admin">admin</option>
          <option value="pos">pos</option>
          <option value="scan">scan</option>
        </select>
        <button class="btn" id="user-add">Add</button>
      </div>
      <div id="users-box"></div>
    </section>
  </div>

  <script>
    ${esc.toString()}
  </script>
  <script>${pageJS()}</script>
</body></html>`;
}