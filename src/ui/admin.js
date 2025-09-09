// /src/ui/admin.js

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
const rands = () => Math.random().toString(36).slice(2);

function moneyZAR(cents = 0) {
  const r = (Number(cents) / 100).toFixed(2);
  return "R" + r;
}

export function adminHTML() {
  // One-page app with tabs; tiny inline JS
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin dashboard</title>
<style>
  :root{
    --bg:#f6f7f8; --card:#ffffff; --ink:#101418; --muted:#6b7280;
    --brand:#0b7d2b; --brand-ink:#fff; --chip:#eaf7ee;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; background:var(--bg); color:var(--ink)}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  h1{font-size:34px; margin:12px 0 18px}
  .tabs{display:flex; gap:8px; flex-wrap:wrap; margin:6px 0 16px}
  .tab{padding:10px 14px;border-radius:22px;background:#eef1f3;color:#111; cursor:pointer; border:1px solid #e5e7eb}
  .tab.active{background:var(--chip); color:#0b5c21; border-color:#cfe9d6}
  .card{background:var(--card); border-radius:14px; padding:14px; box-shadow:0 1px 0 rgba(0,0,0,.04); border:1px solid #eceff1}
  .grid{display:grid; gap:12px}
  @media (min-width: 860px){ .grid-2{grid-template-columns:1fr 1fr} }
  label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
  input,select,button{font:inherit}
  input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #dde3e7;background:#fff}
  button.btn{background:var(--brand); color:var(--brand-ink); padding:10px 14px; border:none; border-radius:10px; cursor:pointer}
  table{width:100%; border-collapse:collapse}
  th,td{padding:8px 10px;border-bottom:1px solid #eef1f3; font-size:14px; text-align:left}
  th{color:#374151;font-weight:600}
  .muted{color:var(--muted)}
  .row{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .mini{font-size:12px}
  .right{justify-content:flex-end}
  .mt8{margin-top:8px} .mt12{margin-top:12px} .mt16{margin-top:16px}
  .mb8{margin-bottom:8px}
  .pill{display:inline-block; padding:2px 8px; border-radius:999px; background:#eef2f7; font-size:12px}
  a{color:#0b6bc2; text-decoration:none}
</style>
</head><body>
<div class="wrap">
  <h1>Admin dashboard</h1>

  <div class="tabs">
    <div class="tab active" data-tab="tickets">Tickets</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="events">Events</div>
    <div class="tab" data-tab="settings">Site settings</div>
  </div>

  <div id="pane" class="card">Loading...</div>
</div>

<script>
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const api = (p, opt={}) => fetch(p, opt).then(r => r.json());

function moneyZAR(c){ return "R" + (Number(c||0)/100).toFixed(2); }

async function loadEventsSel(sel){
  const q = await api("/api/admin/events");
  sel.innerHTML = "";
  for (const ev of (q.events||[])) {
    const o = document.createElement("option");
    o.value = ev.id; o.textContent = ev.name + " (" + ev.slug + ")";
    sel.appendChild(o);
  }
}

function tabHTMLTickets(){
  const eid = "evsel_"+Math.random().toString(36).slice(2);
  const oid = "order_"+Math.random().toString(36).slice(2);
  return \`
  <div class="grid grid-2">
    <div>
      <label>Event</label>
      <div class="row">
        <select id="\${eid}"></select>
        <button class="btn" id="btnLoad">Load</button>
      </div>
      <div class="mt12">
        <div id="sumHead" class="mini muted">Pick an event and Load.</div>
        <div class="mt8">
          <table id="sumTbl" style="display:none">
            <thead><tr>
              <th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th>
            </tr></thead><tbody></tbody>
          </table>
        </div>
      </div>

      <div class="mt16 card">
        <label>Order lookup</label>
        <div class="row">
          <input id="\${oid}" placeholder="Order code (e.g. 3VLNT5)"/>
          <button class="btn" id="btnLookup">Lookup</button>
        </div>
        <div id="lookupRes" class="mt12"></div>
      </div>
    </div>
    <div>
      <div class="mini muted">Tips</div>
      <ul class="mini">
        <li>Use the order lookup to resend tickets via WhatsApp.</li>
        <li>Ticket link opens at <code>/t/CODE</code>.</li>
      </ul>
    </div>
  </div>\`;
}

async function bindTickets(pane){
  const sel = $("select", pane);
  await loadEventsSel(sel);

  const sumHead = $("#sumHead", pane);
  const sumTbl = $("#sumTbl", pane);
  const sumBody = $("#sumTbl tbody", pane);

  $("#btnLoad", pane).onclick = async () => {
    const id = Number(sel.value||0);
    if(!id) return;
    const r = await api("/api/admin/tickets/summary?event_id="+id);
    if(!r.ok){ sumHead.textContent = r.error||"Failed"; return; }
    sumTbl.style.display = "";
    sumBody.innerHTML = "";
    const t = r.totals||{total:0,unused:0,in:0,out:0,void:0};
    sumHead.textContent = \`Total: \${t.total} · In: \${t.in} · Out: \${t.out} · Unused: \${t.unused} · Void: \${t.void}\`;
    for(const row of (r.rows||[])){
      const tr = document.createElement("tr");
      tr.innerHTML = \`
        <td>\${row.name||""}</td>
        <td>\${moneyZAR(row.price_cents||0)}</td>
        <td>\${row.total||0}</td>
        <td>\${row.unused||0}</td>
        <td>\${row.in||0}</td>
        <td>\${row.out||0}</td>
        <td>\${row.void||0}</td>\`;
      sumBody.appendChild(tr);
    }
  };

  // Lookup / resend WA
  $("#btnLookup", pane).onclick = async () => {
    const code = $("#"+pane.querySelector("input[id^='order_']").id, pane).value.trim().toUpperCase();
    if(!code) return;
    const host = location.origin;
    const link = host + "/t/" + encodeURIComponent(code);
    try{
      const r = await api("/api/admin/orders/"+encodeURIComponent(code));
      if(!r.ok){ throw new Error(r.error||"Not found"); }
      // Render order
      const box = $("#lookupRes", pane);
      const rows = (r.tickets||[]).map(t => \`<tr><td>\${t.id}</td><td>\${t.ticket_type_id}</td><td class="muted mini">\${t.qr}</td><td>\${t.state}</td></tr>\`).join("");
      box.innerHTML = \`
        <div class="mini">Ticket link: <a href="/t/\${code}" target="_blank">/t/\${code}</a></div>
        <table class="mt8"><thead><tr><th>ID</th><th>Type</th><th>QR</th><th>State</th></tr></thead><tbody>\${rows}</tbody></table>
        <div class="row mt12">
          <input id="wa_to" placeholder="2771... WhatsApp"/>
          <button class="btn" id="wa_send">Send via WhatsApp</button>
        </div>\`;
      $("#wa_send", box).onclick = async () => {
        const to = $("#wa_to", box).value.trim();
        const r2 = await api("/api/admin/orders/send-whatsapp", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ to, code })
        });
        if (!r2.ok) alert("Failed: " + (r2.error||"WhatsApp not configured"));
        else alert("Sent!");
      };
    }catch(e){
      alert("Lookup failed: "+e.message);
    }
  };
}

function tabHTMLPOS(){
  return \`
  <div>
    <div class="row right mini muted mb8">Most recent 200 sessions</div>
    <table>
      <thead><tr>
        <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Closed by</th><th>Cash (R)</th><th>Card (R)</th>
      </tr></thead><tbody id="posBody"></tbody>
    </table>
  </div>\`;
}
async function bindPOS(pane){
  const b = $("#posBody", pane);
  b.innerHTML = "<tr><td colspan='8' class='muted'>Loading…</td></tr>";
  const r = await api("/api/admin/pos/sessions");
  b.innerHTML = "";
  for(const s of (r.sessions||[])){
    const tr = document.createElement("tr");
    const dt = v => v ? new Date(v*1000).toISOString().slice(0,19).replace("T"," ") : "-";
    tr.innerHTML = \`
      <td>\${s.id}</td>
      <td>\${s.cashier||""}</td>
      <td>\${s.gate||""}</td>
      <td>\${dt(s.opened_at)}</td>
      <td>\${dt(s.closed_at)}</td>
      <td>\${s.manager||""}</td>
      <td>\${moneyZAR(s.cash_cents||0)}</td>
      <td>\${moneyZAR(s.card_cents||0)}</td>\`;
    b.appendChild(tr);
  }
}

function tabHTMLVendors(){
  const eid = "evsel_"+rands();
  return \`
  <div>
    <div class="row">
      <select id="\${eid}"></select>
      <button class="btn" id="btnLoadV">Load</button>
    </div>

    <div id="vList" class="mt12"></div>

    <div class="card mt16">
      <div class="grid grid-2">
        <div><label>Vendor name</label><input id="vname"/></div>
        <div><label>Contact name</label><input id="vcname"/></div>
        <div><label>Phone</label><input id="vphone"/></div>
        <div><label>Email</label><input id="vemail"/></div>
        <div><label>Stand #</label><input id="vstand"/></div>
        <div><label>Staff quota</label><input id="vstaff" type="number"/></div>
        <div><label>Vehicle quota</label><input id="vveh" type="number"/></div>
      </div>
      <button class="btn mt12" id="vadd">Add vendor</button>
    </div>
  </div>\`;
}
async function bindVendors(p){
  const sel = $("select", p);
  await loadEventsSel(sel);

  $("#btnLoadV", p).onclick = async () => {
    const id = Number(sel.value||0); if(!id) return;
    const r = await api("/api/admin/vendors?event_id="+id);
    const host = location.origin;
    const list = $("#vList", p);
    list.innerHTML = \`
      <table><thead><tr>
        <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Quotas</th><th>Passes</th><th>Save</th>
      </tr></thead><tbody></tbody></table>\`;
    const tbody = $("tbody", list);
    for(const v of (r.vendors||[])){
      const tr = document.createElement("tr");
      tr.innerHTML = \`
        <td><input value="\${esc(v.name)}" data-k="name"/></td>
        <td><input value="\${esc(v.contact_name||"")}" data-k="contact_name"/></td>
        <td><input value="\${esc(v.phone||"")}" data-k="phone"/></td>
        <td><input value="\${esc(v.email||"")}" data-k="email"/></td>
        <td><input value="\${esc(v.stand_number||"")}" data-k="stand_number"/></td>
        <td class="mini">Staff \${v.staff_quota||0} · Vehicle \${v.vehicle_quota||0}</td>
        <td class="mini"><a href="/badge/DEMO" onclick="event.preventDefault()">View badge</a></td>
        <td><button class="btn mini" data-id="\${v.id}">Save</button></td>\`;
      tbody.appendChild(tr);
      $("button", tr).onclick = async () => {
        const payload = { id: v.id };
        $$("input", tr).forEach(i => payload[i.dataset.k] = i.value);
        await api("/api/admin/vendors/update", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify(payload)
        });
        alert("Saved");
      };
    }
  };

  $("#vadd", p).onclick = async () => {
    const payload = {
      event_id: Number(sel.value||0),
      name: $("#vname", p).value,
      contact_name: $("#vcname", p).value,
      phone: $("#vphone", p).value,
      email: $("#vemail", p).value,
      stand_number: $("#vstand", p).value,
      staff_quota: Number($("#vstaff", p).value||0),
      vehicle_quota: Number($("#vveh", p).value||0),
    };
    if(!payload.event_id || !payload.name){ alert("Pick event & name"); return; }
    const r = await api("/api/admin/vendors/add", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!r.ok) alert(r.error||"Failed"); else { alert("Added"); $("#btnLoadV", p).click(); }
  };
}

function tabHTMLUsers(){
  return \`
  <div>
    <div class="row mb8">
      <input id="uname" placeholder="username"/>
      <select id="urole">
        <option value="admin">admin</option>
        <option value="pos">pos</option>
        <option value="scan">scan</option>
      </select>
      <button class="btn" id="uadd">Add</button>
    </div>
    <table><thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
    <tbody id="ubody"></tbody></table>
  </div>\`;
}
async function bindUsers(p){
  async function refresh(){
    const r = await api("/api/admin/users");
    const b = $("#ubody", p); b.innerHTML = "";
    for(const u of (r.users||[])){
      const tr = document.createElement("tr");
      tr.innerHTML = \`<td>\${u.id}</td><td>\${u.username}</td><td>\${u.role}</td>
        <td><button class="btn mini" data-id="\${u.id}">Delete</button></td>\`;
      b.appendChild(tr);
      $("button", tr).onclick = async () => {
        if(!confirm("Delete "+u.username+"?")) return;
        await api("/api/admin/users/delete", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ id: u.id })
        });
        refresh();
      };
    }
  }
  $("#uadd", p).onclick = async () => {
    const username = $("#uname", p).value.trim();
    const role = $("#urole", p).value;
    if(!username) return;
    await api("/api/admin/users/add", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ username, role })
    });
    $("#uname", p).value = "";
    refresh();
  };
  refresh();
}

function tabHTMLEvents(){
  const eid = "evsel_"+rands();
  return \`
  <div>
    <div class="row">
      <select id="\${eid}"></select>
      <button class="btn" id="eLoad">Load ticket types</button>
    </div>
    <div id="eBox" class="mt12"></div>

    <div class="card mt16">
      <div class="grid grid-2">
        <div><label>Name</label><input id="tt_name"/></div>
        <div><label>Price (cents)</label><input id="tt_price" type="number"/></div>
        <div><label>Capacity</label><input id="tt_cap" type="number"/></div>
        <div><label>Per order limit</label><input id="tt_lim" type="number" value="10"/></div>
        <div><label>Gender required?</label>
          <select id="tt_gender"><option value="0">No</option><option value="1">Yes</option></select>
        </div>
      </div>
      <button class="btn mt12" id="tt_add">Add ticket type</button>
    </div>
  </div>\`;
}
async function bindEvents(p){
  const sel = $("select", p);
  await loadEventsSel(sel);
  $("#eLoad", p).onclick = async () => {
    const id = Number(sel.value||0); if(!id) return;
    const r = await api("/api/admin/ticket-types?event_id="+id);
    const box = $("#eBox", p);
    const rows = (r.ticket_types||[]).map(t =>
      \`<tr><td>\${t.id}</td><td>\${t.name}</td><td>\${moneyZAR(t.price_cents)}</td>
         <td>\${t.capacity}</td><td>\${t.per_order_limit}</td>
         <td>\${t.requires_gender? "Yes":"No"}</td></tr>\`).join("");
    box.innerHTML = \`
      <table><thead><tr><th>ID</th><th>Name</th><th>Price</th>
        <th>Capacity</th><th>Per-order</th><th>Gender req</th></tr></thead>
        <tbody>\${rows}</tbody></table>\`;
  };
  $("#tt_add", p).onclick = async () => {
    const payload = {
      event_id: Number(sel.value||0),
      name: $("#tt_name", p).value,
      price_cents: Number($("#tt_price", p).value||0),
      capacity: Number($("#tt_cap", p).value||0),
      per_order_limit: Number($("#tt_lim", p).value||0),
      requires_gender: Number($("#tt_gender", p).value||0)
    };
    if(!payload.event_id || !payload.name){ alert("Pick event & name"); return; }
    const r = await api("/api/admin/ticket-types/add", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!r.ok) alert(r.error||"Failed"); else { alert("Added"); $("#eLoad", p).click(); }
  };
}

function tabHTMLSettings(){
  return \`
  <div>
    <div id="sBox" class="mini muted">Loading…</div>
    <div class="mt12 mini">Note: settings are read from environment for now.</div>
  </div>\`;
}
async function bindSettings(p){
  const r = await api("/api/admin/settings");
  const s = r.settings||{};
  $("#sBox", p).innerHTML = \`
    <div>Public base URL: <b>\${s.public_base||""}</b></div>
    <div>WhatsApp: <span class="pill">\${s.whatsapp_configured? "configured":"not configured"}</span></div>
    <div>Template: <code>\${s.whatsapp_template||"-"}</code> · Lang: <code>\${s.whatsapp_lang||"-"}</code></div>\`;
}

/* ------------ Tab router ------------ */
const pane = document.getElementById("pane");

function mount(tab){
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab===tab));
  if(tab==="tickets"){ pane.innerHTML = tabHTMLTickets(); bindTickets(pane); }
  else if(tab==="pos"){ pane.innerHTML = tabHTMLPOS(); bindPOS(pane); }
  else if(tab==="vendors"){ pane.innerHTML = tabHTMLVendors(); bindVendors(pane); }
  else if(tab==="users"){ pane.innerHTML = tabHTMLUsers(); bindUsers(pane); }
  else if(tab==="events"){ pane.innerHTML = tabHTMLEvents(); bindEvents(pane); }
  else if(tab==="settings"){ pane.innerHTML = tabHTMLSettings(); bindSettings(pane); }
}

$$(".tab").forEach(t => t.addEventListener("click", () => mount(t.dataset.tab)));
mount("tickets"); // default tab
</script>
</body></html>`;
}
