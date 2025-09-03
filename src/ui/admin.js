// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8 }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  .tabs{ display:flex; gap:8px; margin-bottom:16px }
  .tab{ padding:8px 12px; border-radius:999px; background:#e7f0ea; color:#0a7d2b; cursor:pointer; font-weight:600 }
  .tab.active{ background:#0a7d2b; color:#fff }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:16px }
  table{ width:100%; border-collapse:collapse } th,td{ padding:8px 10px; border-bottom:1px solid #f1f3f5; text-align:left; }
  th{ font-weight:700; color:#333 }
  input,select,button{ font:inherit }
  input,select{ padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#fff }
  .btn{ padding:8px 12px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.secondary{ background:#eef2f7; color:#111; border:1px solid #e5e7eb }
  .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 }
  .right{ text-align:right }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>

  <div class="tabs">
    <div class="tab active" data-tab="events">Events</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="site">Site settings</div>
  </div>

  <div id="events" class="tabpanes"></div>
  <div id="pos" class="tabpanes" style="display:none"></div>
  <div id="vendors" class="tabpanes" style="display:none"></div>
  <div id="users" class="tabpanes" style="display:none"></div>
  <div id="site" class="tabpanes" style="display:none"><div class="card">Coming soon</div></div>
</div>

<script>
const $ = (s)=>document.querySelector(s);
const esc = (s)=>String(s??"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
const rands = (c)=>"R"+((c||0)/100).toFixed(2);

document.querySelectorAll(".tab").forEach(t=>{
  t.onclick = ()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".tabpanes").forEach(x=>x.style.display="none");
    $("#"+t.dataset.tab).style.display = "block";
    if (t.dataset.tab==="events") loadEvents();
    if (t.dataset.tab==="pos") loadPOS();
    if (t.dataset.tab==="users") loadUsers();
    if (t.dataset.tab==="vendors") loadVendors();
  };
});

/* ========== EVENTS (existing list + ticket types) ========== */

async function loadEvents(){
  const wrap = $("#events");
  wrap.innerHTML = '<div class="card">Loading…</div>';
  try{
    const res = await fetch('/api/admin/events').then(r=>r.json());
    if(!res.ok) throw new Error(res.error||'load failed');

    const rows = (res.events||[]).map(ev=>`
      <tr>
        <td>${ev.id}</td>
        <td>${esc(ev.slug)}</td>
        <td>
          <div>${esc(ev.name)}</div>
          <div class="muted">${esc(ev.venue||"")}</div>
        </td>
        <td>${fmtDate(ev.starts_at)}</td>
        <td>${fmtDate(ev.ends_at)}</td>
        <td>${esc(ev.status)}</td>
        <td class="right">
          <button class="btn secondary" data-show-tt="${ev.id}" data-slug="${esc(ev.slug)}" data-name="${esc(ev.name)}">Ticket Types</button>
        </td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <div class="card">
        <h2>Events</h2>
        <div class="row" style="margin:8px 0 12px">
          <input id="evSlug" placeholder="slug (e.g. skou-2025)"/>
          <input id="evName" placeholder="name"/>
          <input id="evVenue" placeholder="venue"/>
          <input id="evStart" type="datetime-local"/>
          <input id="evEnd" type="datetime-local"/>
          <select id="evStatus">
            <option value="draft">draft</option>
            <option value="active" selected>active</option>
            <option value="archived">archived</option>
          </select>
          <button class="btn" id="evCreate">Create</button>
          <span id="evErr" class="error"></span>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No events</td></tr>'}</tbody>
        </table>
      </div>
      <div id="ttPane"></div>
    `;

    $("#evCreate").onclick = async ()=>{
      $("#evErr").textContent = "";
      try{
        const body = {
          slug: $("#evSlug").value.trim(),
          name: $("#evName").value.trim(),
          venue: $("#evVenue").value.trim(),
          starts_at: toEpoch($("#evStart").value),
          ends_at: toEpoch($("#evEnd").value),
          status: $("#evStatus").value
        };
        const r = await fetch('/api/admin/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        const j = await r.json();
        if(!j.ok) throw new Error(j.error||'create failed');
        loadEvents();
      }catch(e){ $("#evErr").textContent = e.message||'error'; }
    };

    document.querySelectorAll("[data-show-tt]").forEach(b=>{
      b.onclick = ()=> showTicketTypes(b.dataset.showTt, b.dataset.slug, b.dataset.name);
    });
  }catch(e){
    wrap.innerHTML = `<div class="card"><div class="error">Error: ${esc(e.message||'load')}</div></div>`;
  }
}

async function showTicketTypes(eventId, slug, name){
  const pane = $("#ttPane");
  pane.innerHTML = '<div class="card">Loading ticket types…</div>';
  try{
    const r = await fetch(`/api/admin/event/${eventId}/ticket-types`).then(r=>r.json());
    if(!r.ok) throw new Error(r.error||'load failed');

    const rows = (r.ticket_types||[]).map(t=>`
      <tr>
        <td>${t.id}</td>
        <td>${esc(t.name)}</td>
        <td>${rands(t.price_cents)}</td>
        <td>${t.capacity}</td>
        <td>${t.per_order_limit}</td>
        <td>${esc(t.code||'')}</td>
        <td>${t.requires_gender? 'Yes':'No'}</td>
      </tr>
    `).join("");

    pane.innerHTML = `
      <div class="card">
        <h3>Ticket types for ${esc(name)} (${esc(slug)})</h3>
        <div class="row" style="margin:8px 0 12px">
          <input id="ttName" placeholder="Name"/>
          <input id="ttPrice" type="number" min="0" step="1" placeholder="Price (R)"/>
          <select id="ttGenderReq"><option value="0">Gender req: No</option><option value="1">Gender req: Yes</option></select>
          <input id="ttCap" type="number" min="0" step="1" placeholder="Capacity"/>
          <input id="ttLimit" type="number" min="1" step="1" value="10" placeholder="Per-order"/>
          <input id="ttCode" placeholder="Code (optional)"/>
          <button class="btn" id="ttAdd">Add ticket type</button>
          <span id="ttErr" class="error"></span>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Capacity</th><th>Per-order</th><th>Code</th><th>Gender req</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No ticket types</td></tr>'}</tbody>
        </table>
      </div>
    `;

    $("#ttAdd").onclick = async ()=>{
      $("#ttErr").textContent = "";
      try{
        const body = {
          name: $("#ttName").value.trim(),
          price_cents: Math.round(Number($("#ttPrice").value||0)*100),
          capacity: Number($("#ttCap").value||0),
          per_order_limit: Number($("#ttLimit").value||10),
          code: $("#ttCode").value.trim() || null,
          requires_gender: $("#ttGenderReq").value === "1"
        };
        const r2 = await fetch(`/api/admin/event/${eventId}/ticket-type`,{
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
        }).then(r=>r.json());
        if(!r2.ok) throw new Error(r2.error||'add failed');
        showTicketTypes(eventId, slug, name);
      }catch(e){ $("#ttErr").textContent = e.message||'error'; }
    };

  }catch(e){
    pane.innerHTML = `<div class="card"><div class="error">Error: ${esc(e.message||'load')}</div></div>`;
  }
}

/* ========== POS SESSIONS (existing summary) ========== */
async function loadPOS(){
  const wrap = $("#pos");
  wrap.innerHTML = '<div class="card">Loading…</div>';
  try{
    const r = await fetch('/api/admin/pos/sessions').then(r=>r.json());
    if(!r.ok) throw new Error(r.error||'load failed');
    const rows = (r.sessions||[]).map(s=>`
      <tr>
        <td>${s.id}</td>
        <td>${esc(s.cashier_name||'')}</td>
        <td>${esc(s.gate_name||'')}</td>
        <td>${fmtDT(s.opened_at)}</td>
        <td>${s.closed_at? fmtDT(s.closed_at) : '-'}</td>
        <td>${rands(s.cash_cents||0)}</td>
        <td>${rands(s.card_cents||0)}</td>
      </tr>
    `).join("");
    wrap.innerHTML = `
      <div class="card">
        <h2>POS Sessions</h2>
        <div class="row" style="margin:8px 0 12px">
          <button class="btn" id="psReload">Reload</button>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Cash (R)</th><th>Card (R)</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No sessions</td></tr>'}</tbody>
        </table>
      </div>`;
    $("#psReload").onclick = loadPOS;
  }catch(e){
    wrap.innerHTML = `<div class="card"><div class="error">Error: ${esc(e.message||'load')}</div></div>`;
  }
}

/* ========== USERS (NEW) ========== */
async function loadUsers(){
  const wrap = $("#users");
  wrap.innerHTML = '<div class="card">Loading…</div>';
  try{
    const r = await fetch('/api/admin/users').then(r=>r.json());
    if(!r.ok) throw new Error(r.error||'load failed');
    const rows = (r.users||[]).map(u=>`
      <tr>
        <td>${u.id}</td>
        <td>${esc(u.username)}</td>
        <td>${esc(u.role)}</td>
        <td class="right"><button class="btn secondary" data-del-user="${u.id}">Delete</button></td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <div class="card">
        <h2>Users</h2>
        <div class="row" style="margin:8px 0 12px">
          <input id="uName" placeholder="username"/>
          <select id="uRole">
            <option value="admin">admin</option>
            <option value="pos">pos</option>
            <option value="scan">scan</option>
          </select>
          <input id="uHash" placeholder="password hash (optional)"/>
          <button class="btn" id="uAdd">Add user</button>
          <span id="uErr" class="error"></span>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Username</th><th>Role</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="muted">No users</td></tr>'}</tbody>
        </table>
      </div>
    `;

    $("#uAdd").onclick = async ()=>{
      $("#uErr").textContent = "";
      try{
        const body = {
          username: $("#uName").value.trim(),
          role: $("#uRole").value,
          password_hash: $("#uHash").value.trim() || null
        };
        const j = await fetch('/api/admin/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
        if(!j.ok) throw new Error(j.error||'add failed');
        loadUsers();
      }catch(e){ $("#uErr").textContent = e.message||'error'; }
    };

    document.querySelectorAll("[data-del-user]").forEach(b=>{
      b.onclick = async ()=>{
        if(!confirm("Delete user #"+b.dataset.delUser+"?")) return;
        await fetch(`/api/admin/users/${b.dataset.delUser}`,{method:'DELETE'});
        loadUsers();
      };
    });

  }catch(e){
    wrap.innerHTML = `<div class="card"><div class="error">Error: ${esc(e.message||'load')}</div></div>`;
  }
}

/* ========== VENDORS (NEW) ========== */
async function loadVendors(){
  const wrap = $("#vendors");
  wrap.innerHTML = '<div class="card">Loading…</div>';
  try{
    // load events for selector
    const evs = await fetch('/api/admin/events').then(r=>r.json());
    if(!evs.ok) throw new Error('events load failed');
    const options = (evs.events||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join("");

    wrap.innerHTML = `
      <div class="card">
        <h2>Vendors</h2>
        <div class="row" style="margin:8px 0 12px">
          <select id="vEvent">${options}</select>
          <button class="btn" id="vLoad">Load vendors</button>
          <span id="vErr" class="error"></span>
        </div>
        <div id="vList"></div>
      </div>
    `;

    $("#vLoad").onclick = ()=> loadVendorList(Number($("#vEvent").value||0));
  }catch(e){
    wrap.innerHTML = `<div class="card"><div class="error">Error: ${esc(e.message||'load')}</div></div>`;
  }
}

async function loadVendorList(eventId){
  const box = $("#vList");
  box.innerHTML = 'Loading…';
  try{
    const r = await fetch(`/api/admin/vendors?event_id=${eventId}`).then(r=>r.json());
    if(!r.ok) throw new Error(r.error||'load failed');

    const rows = (r.vendors||[]).map(v=>`
      <tr>
        <td>${v.id}</td>
        <td>
          <div>${esc(v.name)}</div>
          <div class="muted">${esc(v.stand_number||'')}</div>
        </td>
        <td>${esc(v.contact_name||'')}</td>
        <td>${esc(v.phone||'')}</td>
        <td>${esc(v.email||'')}</td>
        <td>${v.staff_quota||0} / ${v.vehicle_quota||0}</td>
        <td class="right">
          <button class="btn secondary" data-pass="${v.id}">Passes</button>
          <button class="btn secondary" data-del-v="${v.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    box.innerHTML = `
      <div class="row" style="margin:8px 0 12px">
        <input id="vnName" placeholder="Vendor name"/>
        <input id="vnContact" placeholder="Contact name"/>
        <input id="vnPhone" placeholder="Phone"/>
        <input id="vnEmail" placeholder="Email"/>
        <input id="vnStand" placeholder="Stand #"/>
        <input id="vnStaff" type="number" min="0" step="1" placeholder="Staff quota"/>
        <input id="vnVeh" type="number" min="0" step="1" placeholder="Vehicle quota"/>
        <button class="btn" id="vnAdd">Add vendor</button>
        <span id="vnErr" class="error"></span>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Quotas S/V</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No vendors</td></tr>'}</tbody>
      </table>
      <div id="vPassPane" style="margin-top:12px"></div>
    `;

    $("#vnAdd").onclick = async ()=>{
      $("#vnErr").textContent = "";
      try{
        const body = {
          event_id: eventId,
          name: $("#vnName").value.trim(),
          contact_name: $("#vnContact").value.trim() || null,
          phone: $("#vnPhone").value.trim() || null,
          email: $("#vnEmail").value.trim() || null,
          stand_number: $("#vnStand").value.trim() || null,
          staff_quota: Number($("#vnStaff").value||0),
          vehicle_quota: Number($("#vnVeh").value||0)
        };
        const j = await fetch('/api/admin/vendors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
        if(!j.ok) throw new Error(j.error||'add failed');
        loadVendorList(eventId);
      }catch(e){ $("#vnErr").textContent = e.message||'error'; }
    };

    document.querySelectorAll("[data-del-v]").forEach(b=>{
      b.onclick = async ()=>{
        if(!confirm("Delete vendor #"+b.dataset.delV+"?")) return;
        await fetch(`/api/admin/vendors/${b.dataset.delV}`,{method:'DELETE'});
        loadVendorList(eventId);
      };
    });
    document.querySelectorAll("[data-pass]").forEach(b=>{
      b.onclick = ()=> loadVendorPasses(Number(b.dataset.pass), eventId);
    });

  }catch(e){
    box.innerHTML = `<div class="error">Error: ${esc(e.message||'load')}</div>`;
  }
}

async function loadVendorPasses(vendorId, eventId){
  const pane = $("#vPassPane");
  pane.innerHTML = 'Loading passes…';
  try{
    const r = await fetch(`/api/admin/vendor-passes?vendor_id=${vendorId}`).then(r=>r.json());
    if(!r.ok) throw new Error(r.error||'load failed');

    const rows = (r.passes||[]).map(p=>`
      <tr>
        <td>${p.id}</td>
        <td>${esc(p.type)}</td>
        <td>${esc(p.label||'')}</td>
        <td>${esc(p.vehicle_reg||'')}</td>
        <td>${esc(p.qr)}</td>
        <td>${esc(p.state)}</td>
        <td class="right"><button class="btn secondary" data-del-pass="${p.id}" data-vid="${vendorId}">Delete</button></td>
      </tr>
    `).join("");

    pane.innerHTML = `
      <div class="card">
        <h3>Vendor #${vendorId} passes</h3>
        <div class="row" style="margin:8px 0 12px">
          <select id="vpType"><option value="staff">staff</option><option value="vehicle">vehicle</option></select>
          <input id="vpLabel" placeholder="Label (e.g. John D.)"/>
          <input id="vpReg" placeholder="Vehicle reg (if vehicle)"/>
          <input id="vpQR" placeholder="QR text"/>
          <button class="btn" id="vpAdd">Add pass</button>
          <span id="vpErr" class="error"></span>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Reg</th><th>QR</th><th>State</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No passes</td></tr>'}</tbody>
        </table>
      </div>
    `;

    $("#vpAdd").onclick = async ()=>{
      $("#vpErr").textContent = "";
      try{
        const body = {
          vendor_id: vendorId,
          type: $("#vpType").value,
          label: $("#vpLabel").value.trim() || null,
          vehicle_reg: $("#vpReg").value.trim() || null,
          qr: $("#vpQR").value.trim()
        };
        const j = await fetch('/api/admin/vendor-passes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
        if(!j.ok) throw new Error(j.error||'add failed');
        loadVendorPasses(vendorId, eventId);
      }catch(e){ $("#vpErr").textContent = e.message||'error'; }
    };

    document.querySelectorAll("[data-del-pass]").forEach(b=>{
      b.onclick = async ()=>{
        if(!confirm("Delete pass #"+b.dataset.delPass+"?")) return;
        await fetch(`/api/admin/vendor-passes/${b.dataset.delPass}`,{method:'DELETE'});
        loadVendorPasses(Number(b.dataset.vid), eventId);
      };
    });

  }catch(e){
    pane.innerHTML = `<div class="error">Error: ${esc(e.message||'load')}</div>`;
  }
}

/* ========== helpers ========== */
function toEpoch(s){ if(!s) return 0; const d = new Date(s); return Math.floor(d.getTime()/1000); }
function fmtDate(ts){ if(!ts) return "-"; const d = new Date(ts*1000); return d.toISOString().slice(0,10); }
function fmtDT(ts){ if(!ts) return "-"; const d = new Date(ts*1000); return d.toISOString().replace('T',' ').slice(0,16); }

// initial load
loadEvents();
</script>
</body></html>`;
