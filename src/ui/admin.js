// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f6f7f8 }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:22px auto; padding:0 16px }
  .tabs{ display:flex; gap:10px; margin:0 0 14px }
  .tab{ padding:8px 12px; border-radius:999px; background:#e7f3eb; color:#0a7d2b; cursor:pointer; user-select:none }
  .tab.active{ background:#0a7d2b; color:#fff }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:16px }
  h1{ margin:0 0 14px } h2{ margin:0 0 12px }
  input, select, button{ font:inherit }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.gray{ background:#111; opacity:.8 }
  .muted{ color:var(--muted) }
  table{ width:100%; border-collapse:collapse } th,td{ padding:8px 10px; border-bottom:1px solid #f0f2f4; text-align:left; }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  .pill{ display:inline-block; padding:4px 8px; border-radius:999px; background:#eef2f7; color:#333; font-size:12px }
  a{ color:#0a7d2b; text-decoration:underline }
  .error{ color:#b42318; font-weight:600 }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <div class="tab active" data-t="events">Events</div>
    <div class="tab" data-t="tickets">Tickets</div>
    <div class="tab" data-t="pos">POS Admin</div>
    <div class="tab" data-t="vendors">Vendors</div>
    <div class="tab" data-t="users">Users</div>
    <div class="tab" data-t="site">Site settings</div>
  </div>

  <div id="out"></div>
</div>

<script>
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
const esc = (s)=>String(s??'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const rands = c => 'R' + ((c||0)/100).toFixed(2);

let state = { events:[], currentEventId:null };

async function getJSON(u,opts){ const r = await fetch(u,opts); const t=await r.text(); try{return JSON.parse(t);}catch{return {ok:false,error:t||'bad json'};} }
function setTab(name){ $$(".tab").forEach(t=>t.classList.toggle("active", t.dataset.t===name)); route(name); }

async function bootstrap(){
  const evs = await getJSON('/api/admin/events');
  state.events = evs.events||[];
  state.currentEventId = state.events[0]?.id || null;
  setTab('events');
}
function eventOptions(){
  return state.events.map(e=>\`<option value="\${e.id}">\${esc(e.name)} (\${esc(e.slug)})</option>\`).join('');
}

/* ---------------- Views ---------------- */

async function viewEvents(){
  const el = document.getElementById('out');
  const cur = state.events[0] || {};
  el.innerHTML = \`
    <div class="card">
      <h2>Events</h2>
      <div class="row muted" style="margin-bottom:8px">ID · Slug · Name · Start · End · Status</div>
      <table><tbody>
        \${state.events.map(ev => \`
          <tr>
            <td>\${ev.id}</td>
            <td>\${esc(ev.slug)}</td>
            <td>\${esc(ev.name)}<div class="muted" style="font-size:12px">\${esc(ev.venue||'')}</div></td>
            <td>\${fmt(ev.starts_at)}</td>
            <td>\${fmt(ev.ends_at)}</td>
            <td><span class="pill">\${esc(ev.status)}</span></td>
            <td><button class="btn gray" data-tt="\${ev.id}">Ticket Types</button></td>
          </tr>\`).join('')}
      </tbody></table>
    </div>
    <div id="types" class="card" style="display:none"></div>
  \`;

  $$('#out [data-tt]').forEach(b=>{
    b.onclick = async ()=>{
      const id = Number(b.dataset.tt);
      state.currentEventId = id;
      const j = await getJSON(\`/api/admin/events/\${id}/ticket-types\`);
      const rows = j.types||[];
      const box = document.getElementById('types');
      box.style.display = 'block';
      box.innerHTML = \`
        <h2>Ticket types for \${esc(state.events.find(e=>e.id===id)?.name||'')} </h2>
        <div class="row">
          <input id="ttName" placeholder="Name" style="min-width:220px"/>
          <input id="ttPrice" type="number" min="0" step="1" placeholder="Price (R)"/>
          <input id="ttCap" type="number" min="0" step="1" placeholder="Capacity"/>
          <select id="ttGender"><option value="0">Gender req: No</option><option value="1">Gender req: Yes</option></select>
          <button id="addTT" class="btn">Add ticket type</button>
          <span id="ttErr" class="error"></span>
        </div>
        <table style="margin-top:10px">
          <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Capacity</th><th>Per-order</th><th>Gender req</th></tr></thead>
          <tbody>\${rows.map(r=>\`
            <tr>
              <td>\${r.id}</td>
              <td>\${esc(r.name)}</td>
              <td>\${rands(r.price_cents)}</td>
              <td>\${r.capacity}</td>
              <td>\${r.per_order_limit}</td>
              <td>\${r.requires_gender? 'Yes':'No'}</td>
            </tr>\`).join('')}</tbody>
        </table>\`;

      $('#addTT').onclick = async ()=>{
        $('#ttErr').textContent = '';
        const b = {
          name: $('#ttName').value.trim(),
          price_cents: Math.round(Number($('#ttPrice').value||0)*100),
          capacity: Number($('#ttCap').value||0),
          per_order_limit: 10,
          requires_gender: Number($('#ttGender').value||0)
        };
        const r = await getJSON(\`/api/admin/events/\${id}/ticket-types\`, {
          method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)
        });
        if (!r.ok) { $('#ttErr').textContent = r.error||'error'; return; }
        viewEvents(); // refresh
      };
    };
  });
}

async function viewPOS(){
  const el = document.getElementById('out');
  const j = await getJSON('/api/admin/pos/sessions');
  const rows = j.sessions||[];

  el.innerHTML = \`
    <div class="card">
      <h2>POS Sessions</h2>
      <button id="reloadPOS" class="btn">Reload</button>
      <table style="margin-top:10px">
        <thead><tr>
          <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Closed by</th><th>Cash (R)</th><th>Card (R)</th>
        </tr></thead>
        <tbody>
          \${rows.map(r=>\`
            <tr>
              <td>\${r.id}</td>
              <td>\${esc(r.cashier_name)}</td>
              <td>\${esc(r.gate_name)}</td>
              <td>\${fmt(r.opened_at)}</td>
              <td>\${r.closed_at? fmt(r.closed_at): '-'}</td>
              <td>\${r.closing_manager? esc(r.closing_manager): '-'}</td>
              <td>\${rands(r.cash_cents)}</td>
              <td>\${rands(r.card_cents)}</td>
            </tr>\`).join('')}
        </tbody>
      </table>
    </div>\`;
  $('#reloadPOS').onclick = ()=>viewPOS();
}

async function viewTickets(){
  const el = document.getElementById('out');
  const evSel = \`<select id="tEvent">\${eventOptions()}</select>\`;
  el.innerHTML = \`
    <div class="card">
      <h2>Tickets</h2>
      <div class="row">
        \${evSel}
        <button id="tLoad" class="btn">Load</button>
        <span id="tErr" class="error"></span>
      </div>
      <div id="tSummary" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h3>Order lookup</h3>
      <div class="row">
        <input id="olCode" placeholder="e.g. C056B6" style="min-width:160px"/>
        <button id="olBtn" class="btn">Find</button>
        <span id="olOut" class="muted"></span>
      </div>
    </div>\`;

  $('#tEvent').value = String(state.currentEventId||'');
  $('#tLoad').onclick = async ()=>{
    $('#tErr').textContent = '';
    const id = Number($('#tEvent').value||0);
    state.currentEventId = id;
    const r = await getJSON(\`/api/admin/tickets/summary/\${id}\`);
    if (!r.ok) { $('#tErr').textContent = r.error||'error'; return; }
    const g = r.grand||{total:0,unused:0,in:0,out:0,void:0};
    $('#tSummary').innerHTML = \`
      <div class="muted" style="margin-bottom:6px">Total: \${g.total} · In: \${g.in} · Out: \${g.out} · Unused: \${g.unused} · Void: \${g.void}</div>
      <table>
        <thead><tr><th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th></tr></thead>
        <tbody>
          \${(r.rows||[]).map(x=>\`
            <tr>
              <td>\${esc(x.name)}</td>
              <td>\${rands(x.price_cents)}</td>
              <td>\${x.total||0}</td>
              <td>\${x.unused||0}</td>
              <td>\${x.in||0}</td>
              <td>\${x.out||0}</td>
              <td>\${x.void||0}</td>
            </tr>\`).join('')}
        </tbody>
      </table>\`;
  };

  $('#olBtn').onclick = async ()=>{
    $('#olOut').textContent = '';
    const c = ($('#olCode').value||'').trim();
    if (!c) return;
    const r = await getJSON(\`/api/admin/order/lookup/\${encodeURIComponent(c)}\`);
    if (!r.ok) { $('#olOut').textContent = 'Not found'; return; }
    $('#olOut').innerHTML = \`Found · Ticket link: <a href="\${r.link}" target="_blank">\${r.link}</a>\`;
  };
}

async function viewVendors(){
  const el = document.getElementById('out');
  const evSel = \`<select id="vEvent">\${eventOptions()}</select>\`;
  el.innerHTML = \`
    <div class="card">
      <h2>Vendors</h2>
      <div class="row" style="margin-bottom:8px">
        \${evSel}
        <button id="vLoad" class="btn">Load</button>
        <input id="vName" placeholder="Vendor name" style="min-width:220px"/>
        <input id="vContact" placeholder="Contact name"/>
        <input id="vPhone" placeholder="Phone"/>
        <input id="vEmail" placeholder="Email"/>
        <input id="vStand" placeholder="Stand #"/>
        <input id="vStaff" type="number" min="0" step="1" placeholder="Staff quota"/>
        <input id="vVeh" type="number" min="0" step="1" placeholder="Vehicle quota"/>
        <button id="vAdd" class="btn">Add vendor</button>
        <span id="vErr" class="error"></span>
      </div>
      <div id="vTable"></div>
    </div>\`;

  $('#vEvent').value = String(state.currentEventId||'');
  $('#vLoad').onclick = load;
  $('#vAdd').onclick = add;
  await load();

  async function load(){
    $('#vErr').textContent = '';
    const id = Number($('#vEvent').value||0);
    state.currentEventId = id;
    const r = await getJSON(\`/api/admin/vendors/\${id}\`);
    if (!r.ok) { $('#vErr').textContent = r.error||'error'; return; }
    $('#vTable').innerHTML = \`
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Stand</th><th>Staff</th><th>Vehicle</th><th>Passes</th></tr></thead>
        <tbody>\${(r.vendors||[]).map(v=>\`
          <tr>
            <td>\${v.id}</td>
            <td>\${esc(v.name)}</td>
            <td>\${esc(v.contact_name||'')}<div class="muted" style="font-size:12px">\${esc(v.phone||'')} · \${esc(v.email||'')}</div></td>
            <td>\${esc(v.stand_number||'-')}</td>
            <td>\${v.staff_quota}</td>
            <td>\${v.vehicle_quota}</td>
            <td><button class="btn gray" data-pass="\${v.id}">Manage</button></td>
          </tr>\`).join('')}</tbody>
      </table>\`;

    $$('#vTable [data-pass]').forEach(b=>{
      b.onclick = ()=> managePasses(Number(b.dataset.pass));
    });
  }

  async function add(){
    const id = Number($('#vEvent').value||0);
    const b = {
      name: $('#vName').value.trim(),
      contact_name: $('#vContact').value.trim(),
      phone: $('#vPhone').value.trim(),
      email: $('#vEmail').value.trim(),
      stand_number: $('#vStand').value.trim(),
      staff_quota: Number($('#vStaff').value||0),
      vehicle_quota: Number($('#vVeh').value||0),
    };
    const r = await getJSON(\`/api/admin/vendors/\${id}\`, {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)
    });
    if (!r.ok){ $('#vErr').textContent = r.error||'error'; return; }
    await load();
  }

  async function managePasses(vendorId){
    const r = await getJSON(\`/api/admin/vendor-passes/\${vendorId}\`);
    if (!r.ok){ alert(r.error||'error'); return; }
    const passes = r.passes||[];
    const dlg = document.createElement('div');
    dlg.className = 'card';
    dlg.style.position='fixed'; dlg.style.top='10%'; dlg.style.left='50%'; dlg.style.transform='translateX(-50%)'; dlg.style.width='min(900px, 96vw)';
    dlg.innerHTML = \`
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">Vendor passes (#\${vendorId})</h3>
        <button id="vpClose" class="btn gray">Close</button>
      </div>
      <div class="row" style="margin-top:8px">
        <select id="vpType"><option value="staff">Staff</option><option value="vehicle">Vehicle</option></select>
        <input id="vpLabel" placeholder="Label / Name"/>
        <input id="vpReg" placeholder="Vehicle reg (optional)"/>
        <input id="vpQR" placeholder="QR / code"/>
        <button id="vpAdd" class="btn">Add pass</button>
        <span id="vpErr" class="error"></span>
      </div>
      <table style="margin-top:10px">
        <thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Reg</th><th>QR</th><th>State</th><th>Link</th></tr></thead>
        <tbody>\${passes.map(p=>\`
          <tr>
            <td>\${p.id}</td>
            <td>\${p.type}</td>
            <td>\${esc(p.label||'')}</td>
            <td>\${esc(p.vehicle_reg||'')}</td>
            <td>\${esc(p.qr)}</td>
            <td>\${p.state}</td>
            <td><a href="/scan" target="_blank">Show</a></td>
          </tr>\`).join('')}</tbody>
      </table>\`;
    document.body.appendChild(dlg);
    $('#vpClose',dlg).onclick = ()=> dlg.remove();
    $('#vpAdd',dlg).onclick = async ()=>{
      $('#vpErr',dlg).textContent='';
      const b = {
        type: $('#vpType',dlg).value,
        label: $('#vpLabel',dlg).value.trim(),
        vehicle_reg: $('#vpReg',dlg).value.trim(),
        qr: $('#vpQR',dlg).value.trim(),
      };
      const rr = await getJSON(\`/api/admin/vendor-passes/\${vendorId}\`, {
        method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)
      });
      if (!rr.ok){ $('#vpErr',dlg).textContent = rr.error||'error'; return; }
      dlg.remove();
      managePasses(vendorId);
    };
  }
}

async function viewUsers(){
  const el = document.getElementById('out');
  const r = await getJSON('/api/admin/users');
  const rows = r.users||[];
  el.innerHTML = \`
    <div class="card">
      <h2>Users</h2>
      <div class="row" style="margin-bottom:8px">
        <input id="uName" placeholder="username"/>
        <select id="uRole"><option>admin</option><option>pos</option><option>scan</option></select>
        <button id="uAdd" class="btn">Add</button>
        <span id="uErr" class="error"></span>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Username</th><th>Role</th><th></th></tr></thead>
        <tbody>\${rows.map(u=>\`
          <tr>
            <td>\${u.id}</td>
            <td>\${esc(u.username)}</td>
            <td>\${u.role}</td>
            <td><button class="btn gray" data-del="\${u.id}">Delete</button></td>
          </tr>\`).join('')}</tbody>
      </table>
    </div>\`;

  $('#uAdd').onclick = async ()=>{
    $('#uErr').textContent='';
    const b = { username: $('#uName').value.trim(), role: $('#uRole').value };
    const rr = await getJSON('/api/admin/users', {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)
    });
    if (!rr.ok){ $('#uErr').textContent = rr.error||'error'; return; }
    viewUsers();
  };
  $$('#out [data-del]').forEach(btn=>{
    btn.onclick = async ()=>{
      const rr = await getJSON('/api/admin/users/delete', {
        method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id:Number(btn.dataset.del) })
      });
      if (!rr.ok){ alert(rr.error||'error'); return; }
      viewUsers();
    };
  });
}

/* ---------------- Router ---------------- */
function route(name){
  if (name==='events') return viewEvents();
  if (name==='pos') return viewPOS();
  if (name==='tickets') return viewTickets();
  if (name==='vendors') return viewVendors();
  if (name==='users') return viewUsers();
  document.getElementById('out').innerHTML = '<div class="card"><h2>Site settings</h2><div class="muted">Coming soon.</div></div>';
}

function fmt(sec){
  if (!sec) return '-';
  const d = new Date(sec*1000);
  return d.toLocaleString('af-ZA', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

$$('.tab').forEach(t => t.onclick = ()=> setTab(t.dataset.t));
bootstrap();
</script>
</body></html>`;
