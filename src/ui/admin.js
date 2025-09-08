// /src/ui/admin.js

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const centsToRand = (c) => `R${(Number(c || 0) / 100).toFixed(2)}`;

const money = (c) => `R${(Number(c || 0) / 100).toFixed(2)}`;
const dt = (s) => {
  if (!s) return "-";
  const d = new Date(Number(s) * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

const cardCSS = `
  .tabs{display:flex;gap:10px;margin:6px 0 16px}
  .tabs a{padding:6px 10px;border-radius:8px;background:#eef}
  .card{background:#fff;border-radius:14px;padding:14px;margin:10px 0;box-shadow:0 1px 0 rgba(0,0,0,.04)}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #eee;vertical-align:middle}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .w-sm{width:160px}
  .w-md{width:220px}
  .right{float:right}
  .muted{color:#666}
  .btn{background:#0a7d2b;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer}
  .btn.gray{background:#111;color:#fff;opacity:.85}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input,select{padding:8px;border:1px solid #ddd;border-radius:8px}
  .nowrap{white-space:nowrap}
`;

export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  body{font-family:system-ui;background:#f6f7f8;color:#111;margin:0}
  header{padding:22px 18px 6px;font-weight:800;font-size:28px}
  ${cardCSS}
</style>
</head><body>
  <header>Admin dashboard</header>

  <div class="tabs" id="tabs">
    <a href="#tickets" id="tab-tickets">Tickets</a>
    <a href="#vendors" id="tab-vendors">Vendors</a>
    <a href="#users" id="tab-users">Users</a>
  </div>

  <main id="view"></main>

<script>
const money = ${money.toString()};
const dt = ${dt.toString()};

function qs(s, el=document){ return el.querySelector(s); }
function qsa(s, el=document){ return Array.from(el.querySelectorAll(s)); }
async function j(url, opt){ const r = await fetch(url, opt); if(!r.ok) throw new Error(await r.text()); return r.json(); }

/* -------- Tabs -------- */
function show(hash){
  if(hash==="#vendors") renderVendors();
  else if(hash==="#users") renderUsers();
  else renderTickets();
}
window.addEventListener("hashchange", ()=>show(location.hash||"#tickets"));
show(location.hash||"#tickets");

/* -------- Common: event picker -------- */
async function loadEvents(){
  const r = await j("/api/admin/events");
  return r.events||[];
}
function eventPickerHtml(id="evSel"){
  return '<select id="'+id+'" class="w-md"></select> <button class="btn" id="btnLoad">Load</button>';
}
async function fillEventPicker(selId){
  const sel = qs("#"+selId);
  const evs = await loadEvents();
  sel.innerHTML = evs.map(e => '<option value="'+e.id+'">'+esc(e.name)+" ("+esc(e.slug)+")</option>").join("");
}

/* ====================== TICKETS TAB ====================== */
async function renderTickets(){
  const root = qs("#view");
  root.innerHTML = \`
    <div class="card">
      \${eventPickerHtml("tEv")}
    </div>
    <div class="card" id="tSummary"><em>Pick an event and Load.</em></div>
    <div class="card">
      <div><strong>Order lookup</strong></div>
      <div class="row" style="margin-top:8px;">
        <input id="olCode" class="w-md" placeholder="Order code (e.g. 3VLNT5)"/>
        <button class="btn" id="olBtn">Lookup</button>
      </div>
      <div id="olResult" style="margin-top:12px;"></div>
    </div>
  \`;
  await fillEventPicker("tEv");

  qs("#btnLoad").onclick = async ()=>{
    const evId = Number(qs("#tEv").value);
    const r = await j("/api/admin/tickets/summary/"+evId);
    const totals = r.totals||{total:0,unused:0,in:0,out:0,void:0};
    const rows = (r.rows||[]).map(x => \`
      <tr>
        <td>\${esc(x.name)}</td>
        <td class="nowrap">\${money(x.price_cents)}</td>
        <td>\${x.total||0}</td>
        <td>\${x.unused||0}</td>
        <td>\${x.in_count||0}</td>
        <td>\${x.out_count||0}</td>
        <td>\${x.void_count||0}</td>
      </tr>\`).join("");
    qs("#tSummary").innerHTML = \`
      <div class="muted">Total: \${totals.total} · Unused: \${totals.unused} · In: \${totals.in} · Out: \${totals.out} · Void: \${totals.void}</div>
      <table style="margin-top:8px">
        <thead><tr><th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table>\`;
  };

  qs("#olBtn").onclick = async ()=>{
    const code = (qs("#olCode").value||"").trim();
    if(!code) return alert("Enter code");
    try{
      const r = await j("/api/admin/orders/by-code/"+encodeURIComponent(code));
      const base = (r && r.order && r.order.short_code) ? "/t/"+r.order.short_code : "#";
      const list = (r.tickets||[]).map(t => \`
        <tr>
          <td>\${t.id}</td>
          <td>\${esc(t.type_name)}</td>
          <td>\${esc(t.attendee_first||"")} \${esc(t.attendee_last||"")}</td>
          <td>\${esc(t.state)}</td>
          <td class="muted">\${esc(t.qr)}</td>
        </tr>\`).join("");
      qs("#olResult").innerHTML = \`
        <div class="row" style="margin-bottom:8px;">
          <div>Ticket link: <a href="\${base}" target="_blank">\${base}</a></div>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Name</th><th>State</th><th>QR</th></tr></thead>
          <tbody>\${list}</tbody>
        </table>
        <div class="row" style="margin-top:10px;">
          <input id="waTo" class="w-md" placeholder="WhatsApp (e.g. 071… or 2771…)"/>
          <button class="btn" id="waSend">Send via WhatsApp</button>
        </div>\`;
      qs("#waSend").onclick = async ()=>{
        const to = qs("#waTo").value||"";
        const rr = await fetch("/api/admin/whatsapp/send-order", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ code: r.order.short_code, to })
        });
        const txt = await rr.text();
        if(!rr.ok) return alert("Failed: "+txt);
        alert("Sent!");
      };
    }catch(e){ qs("#olResult").innerHTML = '<div class="muted">Not found</div>'; }
  };
}

/* ====================== VENDORS TAB ====================== */
async function renderVendors(){
  const root = qs("#view");
  root.innerHTML = \`
    <div class="card">
      \${eventPickerHtml("vEv")}
    </div>
    <div class="card" id="vList"><em>Pick an event and Load.</em></div>
    <div class="card">
      <div><strong>New vendor</strong></div>
      <div class="grid2" style="margin-top:8px;">
        <input id="vn_name" placeholder="Vendor name"/>
        <input id="vn_contact" placeholder="Contact name"/>
        <input id="vn_phone" placeholder="Phone"/>
        <input id="vn_email" placeholder="Email"/>
        <input id="vn_stand" class="w-sm" placeholder="Stand #"/>
        <div class="row">
          <input id="vn_staff" class="w-sm" type="number" placeholder="Staff quota"/>
          <input id="vn_vehicle" class="w-sm" type="number" placeholder="Vehicle quota"/>
        </div>
      </div>
      <div class="row" style="margin-top:8px;"><button class="btn" id="vnAdd">Add</button></div>
    </div>
  \`;
  await fillEventPicker("vEv");

  async function loadVendors(){
    const evId = Number(qs("#vEv").value);
    const r = await j("/api/admin/vendors/"+evId);
    const rows = (r.rows||[]).map(v => {
      const rowId = "vrow"+v.id;
      return \`
      <tr id="\${rowId}">
        <td><input class="w-md" value="\${esc(v.name)}" data-k="name"/></td>
        <td><input class="w-md" value="\${esc(v.contact_name||'')}" data-k="contact_name"/></td>
        <td><input class="w-sm" value="\${esc(v.phone||'')}" data-k="phone"/></td>
        <td><input class="w-md" value="\${esc(v.email||'')}" data-k="email"/></td>
        <td><input class="w-sm" value="\${esc(v.stand_number||'')}" data-k="stand_number"/></td>
        <td class="nowrap">
          Staff <input class="w-sm" type="number" value="\${v.staff_quota||0}" data-k="staff_quota"/>
          &nbsp;Veh <input class="w-sm" type="number" value="\${v.vehicle_quota||0}" data-k="vehicle_quota"/>
        </td>
        <td class="nowrap">
          <button class="btn gray" data-act="save" data-id="\${v.id}">Save</button>
        </td>
      </tr>
      <tr><td colspan="7" class="muted">
        <div id="passes-\${v.id}">Loading passes…</div>
      </td></tr>\`;
    }).join("");

    qs("#vList").innerHTML = \`
      <table>
        <thead>
          <tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Quotas</th><th></th></tr>
        </thead>
        <tbody>\${rows || '<tr><td colspan="7">No vendors</td></tr>'}</tbody>
      </table>\`;

    // Wire save buttons
    qsa('[data-act="save"]', qs("#vList")).forEach(btn=>{
      btn.onclick = async ()=>{
        const id = Number(btn.dataset.id);
        const row = qs("#vrow"+id);
        const get = k => row.querySelector('[data-k="'+k+'"]').value;
        const body = {
          name: get("name"), contact_name: get("contact_name"),
          phone: get("phone"), email: get("email"),
          stand_number: get("stand_number"),
          staff_quota: Number(get("staff_quota")||0),
          vehicle_quota: Number(get("vehicle_quota")||0)
        };
        const r = await fetch("/api/admin/vendors/"+id, {
          method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
        });
        if(!r.ok) return alert("Save failed: "+await r.text());
        alert("Saved");
      };
    });

    // Load passes per vendor
    for (const v of (r.rows||[])) {
      const box = qs("#passes-"+v.id);
      try{
        const pr = await j("/api/admin/vendor-passes/"+v.id);
        const items = (pr.rows||[]).map(p => \`
          <div class="row" style="margin:6px 0;">
            <strong>\${p.type.toUpperCase()}</strong> · \${esc(p.label||'')}\${p.type==='vehicle' ? ' · '+esc(p.vehicle_reg||'') : ''}
            <span class="muted">· \${esc(p.qr)}</span>
            <a class="btn gray" href="/admin/vendor-pass/\${p.id}" target="_blank">Print badge</a>
          </div>\`).join("") || "<div class='muted'>No passes</div>";
        box.innerHTML = \`
          \${items}
          <div class="row" style="margin-top:6px;">
            <input id="np-\${v.id}-label" class="w-md" placeholder="Name/Label"/>
            <input id="np-\${v.id}-reg" class="w-sm" placeholder="Vehicle reg (if vehicle)"/>
            <select id="np-\${v.id}-type" class="w-sm">
              <option value="staff">Staff</option>
              <option value="vehicle">Vehicle</option>
            </select>
            <button class="btn" id="np-\${v.id}-add">Add pass</button>
          </div>\`;
        qs("#np-"+v.id+"-add").onclick = async ()=>{
          const body = {
            type: qs("#np-"+v.id+"-type").value,
            label: qs("#np-"+v.id+"-label").value,
            vehicle_reg: qs("#np-"+v.id+"-reg").value
          };
          const rr = await fetch("/api/admin/vendor-passes/"+v.id, {
            method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
          });
          if(!rr.ok) return alert("Add pass failed: "+await rr.text());
          loadVendors(); // refresh
        };
      }catch(e){ box.innerHTML = "<div class='muted'>Failed to load passes</div>"; }
    }
  }

  qs("#btnLoad").onclick = loadVendors;

  qs("#vnAdd").onclick = async ()=>{
    const evId = Number(qs("#vEv").value);
    const body = {
      name: qs("#vn_name").value,
      contact_name: qs("#vn_contact").value,
      phone: qs("#vn_phone").value,
      email: qs("#vn_email").value,
      stand_number: qs("#vn_stand").value,
      staff_quota: Number(qs("#vn_staff").value||0),
      vehicle_quota: Number(qs("#vn_vehicle").value||0)
    };
    const r = await fetch("/api/admin/vendors/"+evId, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
    });
    if(!r.ok) return alert("Add failed: "+await r.text());
    loadVendors();
  };
}

/* ====================== USERS TAB (read-only for now) ====================== */
async function renderUsers(){
  const root = qs("#view");
  root.innerHTML = '<div class="card" id="uBox"><em>Loading…</em></div>';
  try{
    const r = await j("/api/admin/users");
    const rows = (r.rows||[]).map(u => \`
      <tr><td>\${u.id}</td><td>\${esc(u.username)}</td><td>\${esc(u.role)}</td></tr>\`).join("");
    qs("#uBox").innerHTML = \`
      <div><strong>Users</strong></div>
      <table style="margin-top:8px">
        <thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
        <tbody>\${rows||'<tr><td colspan=3>No users</td></tr>'}</tbody>
      </table>\`;
  }catch(e){ qs("#uBox").innerHTML = "<div class='muted'>Failed to load</div>"; }
}
</script>
</body></html>`;
}
