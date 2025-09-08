// /src/ui/admin.js
// Basic admin dashboard UI (no framework)
function esc(s){ return String(s ?? "").replace(/[&<>"]/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m])); }
function centsToR(c){ return "R" + (Number(c||0)/100).toFixed(2); }
function tsToLocal(ts){ if(!ts) return "-"; try { return new Date(ts*1000).toISOString().replace("T"," ").slice(0,19); } catch { return "-"; } }

export function adminHTML(){
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Admin · Villiersdorp Skou</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body{font:16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin:0; background:#fafafa; color:#111;}
    .wrap{max-width:1100px; margin:24px auto; padding:0 16px;}
    h1{margin:0 0 18px;}
    .tabs{display:flex; gap:16px; margin:10px 0 22px;}
    .tab{padding:6px 12px; border-radius:999px; background:#eaf5ea; color:#145a14; text-decoration:none;}
    .pane{background:#fff; border:1px solid #e6e6e6; border-radius:12px; padding:16px; margin-bottom:18px;}
    .row{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
    .btn{background:#167c2f; color:#fff; border:none; border-radius:8px; padding:8px 14px; cursor:pointer; text-decoration:none; display:inline-block}
    .btn.secondary{background:#111}
    .btn:disabled{opacity:.6; cursor:default}
    .table-wrap{overflow:auto}
    table{width:100%; border-collapse:collapse}
    th,td{padding:8px 10px; border-bottom:1px solid #eee; text-align:left; white-space:nowrap}
    tfoot td{border-top:2px solid #ddd; font-weight:600}
    input,select{padding:8px 10px; border:1px solid #ddd; border-radius:8px}
    .error{color:#b00020}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Admin</h1>
    <div class="tabs">
      <a class="tab" href="#events">Events</a>
      <a class="tab" href="#tickets">Tickets</a>
      <a class="tab" href="#pos">POS Admin</a>
      <a class="tab" href="#vendors">Vendors</a>
      <a class="tab" href="#users">Users</a>
      <a class="tab" href="#settings">Site settings</a>
    </div>

    <div id="pane"></div>
  </div>

<script>
const $ = (sel, el=document) => el.querySelector(sel);

function centsToR(c){ return "R" + (Number(c||0)/100).toFixed(2); }
function tsToLocal(ts){ if(!ts) return "-"; try { return new Date(ts*1000).toISOString().replace("T"," ").slice(0,19); } catch { return "-"; } }

/* -------- Pane renderers ---------- */

async function renderEvents(){
  const pane = document.getElementById("pane");
  pane.innerHTML = \`
    <div class="pane">
      <h2>Events</h2>
      <div class="row" style="margin-bottom:12px;">
        <input id="eSlug" placeholder="slug (e.g. skou-2025)" />
        <input id="eName" placeholder="name" />
        <input id="eVenue" placeholder="venue" />
        <input id="eStart" type="datetime-local" />
        <input id="eEnd" type="datetime-local" />
        <select id="eStatus"><option value="active">active</option><option value="draft">draft</option><option value="archived">archived</option></select>
        <button class="btn" id="eCreate">Create</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th>Ticket Types</th>
        </tr></thead><tbody id="eRows"><tr><td colspan="7">Loading…</td></tr></tbody></table>
      </div>
    </div>
    <div class="pane">
      <h3>Ticket types for <span id="ttEventName">—</span></h3>
      <div class="row" style="margin-bottom:10px;">
        <input id="ttName" placeholder="Name" />
        <input id="ttPrice" type="number" placeholder="Price (R)" />
        <input id="ttCap" type="number" placeholder="Capacity" />
        <input id="ttLimit" type="number" placeholder="Per-order limit" value="10" />
        <select id="ttGender"><option value="0">Gender req: No</option><option value="1">Gender req: Yes</option></select>
        <button class="btn" id="ttAdd">Add ticket type</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Capacity</th><th>Per-order</th><th>Gender req</th></tr></thead>
        <tbody id="ttRows"><tr><td colspan="6">Select an event above</td></tr></tbody>
      </table></div>
    </div>\`;

  const load = async () => {
    const res = await fetch("/api/admin/events", { credentials:"include" });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error||"load failed");
    const rows = j.events.map(ev => \`
      <tr data-ev="\${ev.id}" data-evname="\${esc(ev.name)}">
        <td>\${ev.id}</td>
        <td>\${esc(ev.slug)}</td>
        <td>\${esc(ev.name)}</td>
        <td>\${tsToLocal(ev.starts_at)}</td>
        <td>\${tsToLocal(ev.ends_at)}</td>
        <td>\${esc(ev.status)}</td>
        <td><button class="btn secondary small ttBtn" data-id="\${ev.id}" data-name="\${esc(ev.name)}">Ticket Types</button></td>
      </tr>\`).join("");
    $("#eRows").innerHTML = rows || '<tr><td colspan="7">None</td></tr>';
    [...document.querySelectorAll(".ttBtn")].forEach(btn => btn.onclick = () => showTypes(btn.dataset.id, btn.dataset.name));
  };

  $("#eCreate").onclick = async () => {
    const body = {
      slug: $("#eSlug").value.trim(),
      name: $("#eName").value.trim(),
      venue: $("#eVenue").value.trim(),
      starts_at: $("#eStart").value ? Math.floor(new Date($("#eStart").value)/1000) : 0,
      ends_at: $("#eEnd").value ? Math.floor(new Date($("#eEnd").value)/1000) : 0,
      status: $("#eStatus").value
    };
    const r = await fetch("/api/admin/events", { method:"POST", credentials:"include",
      headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!j.ok) return alert(j.error||"Create failed");
    load();
  };

  async function showTypes(eventId, eventName){
    $("#ttEventName").textContent = eventName;
    const res = await fetch(\`/api/admin/events/\${eventId}/ticket_types\`, { credentials:"include" });
    const j = await res.json();
    const rows = (j.ticket_types||[]).map(t => \`
      <tr><td>\${t.id}</td><td>\${esc(t.name)}</td><td>\${(t.price_cents/100).toFixed(2)}</td>
          <td>\${t.capacity}</td><td>\${t.per_order_limit}</td><td>\${t.requires_gender ? "Yes":"No"}</td></tr>\`).join("");
    $("#ttRows").innerHTML = rows || '<tr><td colspan="6">None</td></tr>';

    $("#ttAdd").onclick = async () => {
      const body = {
        name: $("#ttName").value.trim(),
        price_cents: Math.round(Number($("#ttPrice").value||0)*100),
        capacity: Number($("#ttCap").value||0),
        per_order_limit: Number($("#ttLimit").value||10),
        requires_gender: Number($("#ttGender").value||0)
      };
      const r = await fetch(\`/api/admin/events/\${eventId}/ticket_types\`, {
        method:"POST", credentials:"include", headers:{ "content-type":"application/json" }, body: JSON.stringify(body)
      });
      const j = await r.json(); if (!j.ok) return alert(j.error||"Add failed");
      showTypes(eventId, eventName);
    };
  }

  load();
}

async function renderTickets(){
  const pane = document.getElementById("pane");
  pane.innerHTML = \`
    <div class="pane">
      <h2>Tickets</h2>
      <div class="row" style="margin-bottom:10px;">
        <select id="tEvent"></select>
        <button class="btn" id="tLoad">Load</button>
        <span id="tErr" class="error"></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th></tr>
          </thead>
          <tbody id="tRows"><tr><td colspan="7">—</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="pane">
      <h3>Order lookup</h3>
      <div class="row">
        <input id="olCode" placeholder="e.g. C056B6" />
        <button class="btn" id="olFind">Find</button>
        <span id="olResult"></span>
      </div>
    </div>\`;

  // event dropdown
  const evRes = await fetch("/api/admin/events", { credentials:"include" });
  const ev = await evRes.json(); const sel = $("#tEvent");
  sel.innerHTML = (ev.events||[]).map(e => \`<option value="\${e.id}">\${esc(e.name)} (\${esc(e.slug)})</option>\`).join("");

  async function loadSummary(){
    const event_id = Number($("#tEvent").value||0);
    if (!event_id) return;
    $("#tErr").textContent = "";
    const r = await fetch(\`/api/admin/tickets/summary?event_id=\${event_id}\`, { credentials:"include" });
    const j = await r.json().catch(()=>({}));
    if (!j.ok) { $("#tErr").textContent = j.error||"Load failed"; return; }
    const rows = (j.rows||[]).map(r =>
      \`<tr><td>\${esc(r.name)}</td><td>\${(r.price_cents/100).toFixed(2)}</td>
         <td>\${r.total}</td><td>\${r.unused}</td><td>\${r.in_cnt}</td><td>\${r.out_cnt}</td><td>\${r.void_cnt}</td></tr>\`
    ).join("");
    $("#tRows").innerHTML = rows || '<tr><td colspan="7">None</td></tr>';
  }

  $("#tLoad").onclick = loadSummary;
  loadSummary();

  // order lookup
  $("#olFind").onclick = async () => {
    $("#olResult").textContent = "";
    const code = ($("#olCode").value||"").trim();
    if (!code) return;
    const r = await fetch(\`/api/admin/orders/lookup?code=\${encodeURIComponent(code)}\`, { credentials:"include" });
    const j = await r.json();
    if (!j.ok || !j.found) { $("#olResult").textContent = "Not found"; return; }
    $("#olResult").innerHTML = \`Found · <a href="\${j.ticket_url}" target="_blank">Open tickets</a>\`;
  };
}

async function renderPosAdmin(){
  const pane = document.getElementById("pane");
  pane.innerHTML = \`
    <div class="pane">
      <h2>POS Sessions</h2>
      <div class="row" style="margin-bottom:10px;">
        <button id="posReload" class="btn">Reload</button>
        <a class="btn" href="/api/admin/pos/sessions/export.csv">Export CSV</a>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th><th>Cashier</th><th>Gate</th>
              <th>Opened</th><th>Closed</th><th>Closed by</th>
              <th>Opening float (R)</th>
              <th>Cash (R)</th><th>Card (R)</th><th>Expected cash (R)</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody id="posRows"><tr><td colspan="11">Loading…</td></tr></tbody>
          <tfoot><tr id="posTotals"><td colspan="11"></td></tr></tfoot>
        </table>
      </div>
    </div>\`;

  async function fill(){
    const tbody = document.getElementById("posRows");
    const tfoot = document.getElementById("posTotals");
    try{
      const r = await fetch("/api/admin/pos/sessions", { credentials:"include" });
      const { ok, sessions=[], totals={} } = await r.json();
      if (!ok) throw new Error("Load fail");
      if (!sessions.length){ tbody.innerHTML = '<tr><td colspan="11">None</td></tr>'; tfoot.innerHTML=""; return; }
      tbody.innerHTML = sessions.map(s => \`
        <tr>
          <td>\${s.id}</td>
          <td>\${esc(s.cashier_name||"-")}</td>
          <td>\${esc(s.gate_name||"-")}</td>
          <td>\${tsToLocal(s.opened_at)}</td>
          <td>\${tsToLocal(s.closed_at)}</td>
          <td>\${esc(s.closing_manager||"-")}</td>
          <td>\${centsToR(s.opening_float_cents)}</td>
          <td>\${centsToR(s.cash_cents)}</td>
          <td>\${centsToR(s.card_cents)}</td>
          <td>\${centsToR(s.expected_cash_cents)}</td>
          <td>\${s.orders_count}</td>
        </tr>\`).join("");

      tfoot.innerHTML = \`
        <td colspan="6" style="text-align:right;"><strong>TOTALS</strong></td>
        <td><strong>\${centsToR(totals.opening_float_cents||0)}</strong></td>
        <td><strong>\${centsToR(totals.cash_cents||0)}</strong></td>
        <td><strong>\${centsToR(totals.card_cents||0)}</strong></td>
        <td><strong>\${centsToR(totals.expected_cash_cents||0)}</strong></td>
        <td><strong>\${totals.orders_count||0}</strong></td>\`;
    }catch(e){
      tbody.innerHTML = \`<tr><td colspan="11" class="error">\${e.message||e}</td></tr>\`;
      tfoot.innerHTML = "";
    }
  }
  $("#posReload").onclick = fill;
  fill();
}

async function renderVendors(){
  const pane = document.getElementById("pane");
  pane.innerHTML = \`
    <div class="pane">
      <h2>Vendors</h2>
      <div class="row" style="margin-bottom:10px;">
        <select id="vEvent"></select>
        <button class="btn" id="vLoad">Load</button>
      </div>
      <div class="row" style="margin-bottom:10px;">
        <input id="vName" placeholder="Vendor name" />
        <input id="vContact" placeholder="Contact name" />
        <input id="vPhone" placeholder="Phone" />
        <input id="vEmail" placeholder="Email" />
        <input id="vStand" placeholder="Stand #" />
        <input id="vStaff" type="number" placeholder="Staff quota" style="width:120px;" />
        <input id="vVeh" type="number" placeholder="Vehicle quota" style="width:140px;" />
        <button class="btn" id="vAdd">Add vendor</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Staff</th><th>Vehicle</th></tr></thead>
          <tbody id="vRows"><tr><td colspan="8">—</td></tr></tbody>
        </table>
      </div>
    </div>\`;

  const evRes = await fetch("/api/admin/events", { credentials:"include" });
  const ev = await evRes.json(); const sel = $("#vEvent");
  sel.innerHTML = (ev.events||[]).map(e => \`<option value="\${e.id}">\${esc(e.name)} (\${esc(e.slug)})</option>\`).join("");

  async function loadV(){
    const event_id = Number($("#vEvent").value||0);
    const r = await fetch(\`/api/admin/vendors?event_id=\${event_id}\`, { credentials:"include" });
    const j = await r.json();
    $("#vRows").innerHTML = (j.vendors||[]).map(v =>
      \`<tr><td>\${v.id}</td><td>\${esc(v.name)}</td><td>\${esc(v.contact_name||"")}</td>
        <td>\${esc(v.phone||"")}</td><td>\${esc(v.email||"")}</td><td>\${esc(v.stand_number||"")}</td>
        <td>\${v.staff_quota||0}</td><td>\${v.vehicle_quota||0}</td></tr>\`).join("") || '<tr><td colspan="8">None</td></tr>';
  }

  $("#vLoad").onclick = loadV;
  $("#vAdd").onclick = async () => {
    const body = {
      event_id: Number($("#vEvent").value||0),
      name: $("#vName").value.trim(),
      contact_name: $("#vContact").value.trim(),
      phone: $("#vPhone").value.trim(),
      email: $("#vEmail").value.trim(),
      stand_number: $("#vStand").value.trim(),
      staff_quota: Number($("#vStaff").value||0),
      vehicle_quota: Number($("#vVeh").value||0),
    };
    const r = await fetch("/api/admin/vendors", { method:"POST", credentials:"include",
      headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!j.ok) return alert(j.error||"Add failed");
    loadV();
  };

  loadV();
}

async function renderUsers(){
  const pane = document.getElementById("pane");
  pane.innerHTML = \`
    <div class="pane">
      <h2>Users</h2>
      <div class="row" style="margin-bottom:10px;">
        <input id="uName" placeholder="username" />
        <select id="uRole"><option value="admin">admin</option><option value="pos">pos</option><option value="scan">scan</option></select>
        <button class="btn" id="uAdd">Add</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
          <tbody id="uRows"><tr><td colspan="3">Loading…</td></tr></tbody></table>
      </div>
    </div>\`;

  async function loadU(){
    const r = await fetch("/api/admin/users", { credentials:"include" });
    const j = await r.json();
    $("#uRows").innerHTML = (j.users||[]).map(u => \`<tr><td>\${u.id}</td><td>\${esc(u.username)}</td><td>\${esc(u.role)}</td></tr>\`).join("") || '<tr><td colspan="3">None</td></tr>';
  }
  $("#uAdd").onclick = async () => {
    const body = { username: $("#uName").value.trim(), role: $("#uRole").value };
    const r = await fetch("/api/admin/users", { method:"POST", credentials:"include",
      headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!j.ok) return alert(j.error||"Add failed");
    loadU();
  };
  loadU();
}

/* -------- Router ---------- */
function route(){
  const pane = document.getElementById("pane");
  const h = location.hash || "#pos";
  document.querySelectorAll(".tab").forEach(a => a.style.background = (a.getAttribute("href")===h) ? "#0f5e22" : "#eaf5ea");
  document.querySelectorAll(".tab").forEach(a => a.style.color = (a.getAttribute("href")===h) ? "#fff" : "#145a14");

  if (h==="#events") return renderEvents();
  if (h==="#tickets") return renderTickets();
  if (h==="#vendors") return renderVendors();
  if (h==="#users") return renderUsers();
  if (h==="#settings") { pane.innerHTML = '<div class="pane"><h2>Site settings</h2><p>Coming soon.</p></div>'; return; }
  return renderPosAdmin();
}
window.addEventListener("hashchange", route);
route();
</script>
</body>
</html>`;
}
