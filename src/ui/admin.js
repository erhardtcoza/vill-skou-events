// /src/ui/admin.js
const esc = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;");
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const api = (p, opt={}) => fetch(p, opt).then(r => r.json());
const moneyZAR = c => "R" + (Number(c||0)/100).toFixed(2);

export function adminHTML() {
return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin dashboard</title>
<style>
  :root{--bg:#f6f7f8;--card:#fff;--ink:#101418;--muted:#6b7280;--brand:#0b7d2b;--chip:#eaf7ee}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui;background:var(--bg);color:var(--ink)}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  h1{font-size:34px;margin:12px 0 18px}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 16px}
  .tab{padding:10px 14px;border-radius:22px;background:#eef1f3;border:1px solid #e5e7eb;cursor:pointer}
  .tab.active{background:var(--chip);color:#0b5c21;border-color:#cfe9d6}
  .card{background:var(--card);border-radius:14px;padding:14px;border:1px solid #eceff1;box-shadow:0 1px 0 rgba(0,0,0,.04)}
  .grid{display:grid;gap:12px} @media(min-width:860px){.grid-2{grid-template-columns:1fr 1fr}}
  label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
  input,select,button{font:inherit} input,select{width:100%;padding:10px 12px;border:1px solid #dde3e7;border-radius:10px}
  button.btn{background:var(--brand);color:#fff;border:none;border-radius:10px;padding:10px 14px;cursor:pointer}
  table{width:100%;border-collapse:collapse} th,td{padding:8px 10px;border-bottom:1px solid #eef1f3;text-align:left}
  th{font-weight:600;color:#374151} .mini{font-size:12px} .muted{color:var(--muted)}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap} .mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
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
const money = c => "R" + (Number(c||0)/100).toFixed(2);

async function loadEventsSel(sel){
  const q = await api("/api/admin/events");
  sel.innerHTML = "";
  for (const ev of (q.events||[])) {
    const o = document.createElement("option");
    o.value = ev.id; o.textContent = ev.name + " (" + ev.slug + ")";
    sel.appendChild(o);
  }
  if (sel.options.length) sel.selectedIndex = 0;
}

function ticketsHTML(){
  return \`
  <div class="grid grid-2">
    <div>
      <label>Event</label>
      <div class="row">
        <select id="t_ev"></select>
        <button class="btn" id="t_load">Load</button>
      </div>
      <div class="mt12">
        <div id="t_head" class="mini muted">Pick an event and Load.</div>
        <table id="t_tbl" class="mt8" style="display:none"><thead><tr>
          <th>Type</th><th>Price</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th>
        </tr></thead><tbody></tbody></table>
      </div>
      <div class="card mt16">
        <label>Order lookup</label>
        <div class="row">
          <input id="t_code" placeholder="Order code (e.g. 3VLNT5)"/>
          <button class="btn" id="t_lookup">Lookup</button>
        </div>
        <div id="t_res" class="mt12"></div>
      </div>
    </div>
  </div>\`;
}
async function ticketsBind(root){
  const sel = $("#t_ev", root);
  await loadEventsSel(sel);

  async function doLoad(){
    const id = Number(sel.value||0); if(!id) return;
    const r = await api("/api/admin/tickets/summary?event_id="+id);
    const head = $("#t_head", root), tbl=$("#t_tbl", root), body=$("#t_tbl tbody", root);
    if(!r.ok){ head.textContent = r.error||"Failed"; return; }
    tbl.style.display="";
    const t=r.totals||{total:0,unused:0,in:0,out:0,void:0};
    head.textContent = \`Total: \${t.total} · In: \${t.in} · Out: \${t.out} · Unused: \${t.unused} · Void: \${t.void}\`;
    body.innerHTML = "";
    for(const row of (r.rows||[])){
      const tr = document.createElement("tr");
      tr.innerHTML = \`<td>\${row.name}</td><td>\${money(row.price_cents)}</td>
                       <td>\${row.total}</td><td>\${row.unused}</td>
                       <td>\${row.in}</td><td>\${row.out}</td><td>\${row.void}</td>\`;
      body.appendChild(tr);
    }
  }
  $("#t_load", root).onclick = doLoad;
  if (sel.options.length) doLoad();

  $("#t_lookup", root).onclick = async () => {
    const code = $("#t_code", root).value.trim().toUpperCase(); if(!code) return;
    const r = await api("/api/admin/orders/"+encodeURIComponent(code));
    if(!r.ok){ alert(r.error||"Not found"); return; }
    const box = $("#t_res", root);
    const rows = (r.tickets||[]).map(t => \`<tr><td>\${t.id}</td><td>\${t.ticket_type_id}</td><td class="mini muted">\${t.qr}</td><td>\${t.state}</td></tr>\`).join("");
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
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ to, code })
      });
      if(!r2.ok) alert(r2.error||"Failed"); else alert("Sent!");
    };
  };
}

function posHTML(){
  return \`
  <div>
    <table><thead><tr>
      <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Closed by</th><th>Cash</th><th>Card</th>
    </tr></thead><tbody id="p_body"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table>
  </div>\`;
}
async function posBind(root){
  const b=$("#p_body", root);
  const r = await api("/api/admin/pos/sessions");
  b.innerHTML = "";
  const fmt = v => v? new Date(v*1000).toISOString().replace("T"," ").slice(0,19) : "-";
  for(const s of (r.sessions||[])){
    const tr = document.createElement("tr");
    tr.innerHTML = \`<td>\${s.id}</td><td>\${s.cashier||""}</td><td>\${s.gate||""}</td>
                    <td>\${fmt(s.opened_at)}</td><td>\${fmt(s.closed_at)}</td><td>\${s.manager||""}</td>
                    <td>\${money(s.cash_cents)}</td><td>\${money(s.card_cents)}</td>\`;
    b.appendChild(tr);
  }
}

function vendorsHTML(){
  return \`
  <div>
    <div class="row">
      <select id="v_ev"></select>
      <button class="btn" id="v_load">Load</button>
    </div>
    <div id="v_list" class="mt12"></div>
    <div class="card mt16">
      <div class="grid grid-2">
        <div><label>Vendor name</label><input id="vn"/></div>
        <div><label>Contact name</label><input id="vc"/></div>
        <div><label>Phone</label><input id="vp"/></div>
        <div><label>Email</label><input id="ve"/></div>
        <div><label>Stand #</label><input id="vs"/></div>
        <div><label>Staff quota</label><input id="vqs" type="number"/></div>
        <div><label>Vehicle quota</label><input id="vqv" type="number"/></div>
      </div>
      <button class="btn mt12" id="v_add">Add vendor</button>
    </div>
  </div>\`;
}
async function vendorsBind(root){
  const sel = $("#v_ev", root);
  await loadEventsSel(sel);

  async function doLoad(){
    const id = Number(sel.value||0); if(!id) return;
    const r = await api("/api/admin/vendors?event_id="+id);
    const list = $("#v_list", root);
    list.innerHTML = \`<table><thead><tr>
      <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Quotas</th><th>Save</th>
    </tr></thead><tbody></tbody></table>\`;
    const tb = $("tbody", list);
    for(const v of (r.vendors||[])){
      const tr = document.createElement("tr");
      tr.innerHTML = \`
        <td><input value="\${esc(v.name)}" data-k="name"/></td>
        <td><input value="\${esc(v.contact_name||"")}" data-k="contact_name"/></td>
        <td><input value="\${esc(v.phone||"")}" data-k="phone"/></td>
        <td><input value="\${esc(v.email||"")}" data-k="email"/></td>
        <td><input value="\${esc(v.stand_number||"")}" data-k="stand_number"/></td>
        <td class="mini">Staff \${v.staff_quota||0} · Vehicle \${v.vehicle_quota||0}</td>
        <td><button class="btn mini" data-id="\${v.id}">Save</button></td>\`;
      tb.appendChild(tr);
      $("button", tr).onclick = async () => {
        const payload = { id: v.id };
        $$("input", tr).forEach(i => payload[i.dataset.k] = i.value);
        const r2 = await api("/api/admin/vendors/update", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify(payload)
        });
        if(!r2.ok) alert(r2.error||"Failed"); else alert("Saved");
      };
    }
  }
  $("#v_load", root).onclick = doLoad;
  if (sel.options.length) doLoad();

  $("#v_add", root).onclick = async () => {
    const payload = {
      event_id: Number(sel.value||0),
      name: $("#vn", root).value, contact_name: $("#vc", root).value,
      phone: $("#vp", root).value, email: $("#ve", root).value,
      stand_number: $("#vs", root).value,
      staff_quota: Number($("#vqs", root).value||0),
      vehicle_quota: Number($("#vqv", root).value||0),
    };
    if(!payload.event_id || !payload.name){ alert("Pick event & name"); return; }
    const r = await api("/api/admin/vendors/add", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!r.ok) alert(r.error||"Failed"); else { alert("Added"); doLoad(); }
  };
}

function usersHTML(){
  return \`
  <div>
    <div class="row">
      <input id="un" placeholder="username"/>
      <select id="ur"><option value="admin">admin</option><option value="pos">pos</option><option value="scan">scan</option></select>
      <button class="btn" id="ua">Add</button>
    </div>
    <table class="mt12"><thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Actions</th></tr></thead><tbody id="ub"></tbody></table>
  </div>\`;
}
async function usersBind(root){
  async function refresh(){
    const r = await api("/api/admin/users");
    const b=$("#ub", root); b.innerHTML="";
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
  $("#ua", root).onclick = async () => {
    const username=$("#un", root).value.trim(), role=$("#ur", root).value;
    if(!username) return;
    await api("/api/admin/users/add", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ username, role })
    });
    $("#un", root).value=""; refresh();
  };
  refresh();
}

function eventsHTML(){
  return \`
  <div>
    <div class="row">
      <select id="e_ev"></select>
      <button class="btn" id="e_load">Load ticket types</button>
    </div>
    <div id="e_box" class="mt12"></div>
    <div class="card mt16">
      <div class="grid grid-2">
        <div><label>Name</label><input id="tt_n"/></div>
        <div><label>Price (cents)</label><input id="tt_p" type="number"/></div>
        <div><label>Capacity</label><input id="tt_c" type="number"/></div>
        <div><label>Per order limit</label><input id="tt_l" type="number" value="10"/></div>
        <div><label>Gender required?</label><select id="tt_g"><option value="0">No</option><option value="1">Yes</option></select></div>
      </div>
      <button class="btn mt12" id="tt_add">Add ticket type</button>
    </div>
  </div>\`;
}
async function eventsBind(root){
  const sel = $("#e_ev", root);
  await loadEventsSel(sel);

  async function doLoad(){
    const id = Number(sel.value||0); if(!id) return;
    const r = await api("/api/admin/ticket-types?event_id="+id);
    const box = $("#e_box", root);
    const rows = (r.ticket_types||[]).map(t =>
      \`<tr><td>\${t.id}</td><td>\${esc(t.name)}</td><td>\${money(t.price_cents)}</td>
         <td>\${t.capacity}</td><td>\${t.per_order_limit}</td><td>\${t.requires_gender? "Yes":"No"}</td></tr>\`).join("");
    box.innerHTML = \`<table><thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Capacity</th><th>Per-order</th><th>Gender req</th></tr></thead><tbody>\${rows}</tbody></table>\`;
  }
  $("#e_load", root).onclick = doLoad;
  if (sel.options.length) doLoad();

  $("#tt_add", root).onclick = async () => {
    const payload = {
      event_id:Number(sel.value||0),
      name:$("#tt_n", root).value,
      price_cents:Number($("#tt_p", root).value||0),
      capacity:Number($("#tt_c", root).value||0),
      per_order_limit:Number($("#tt_l", root).value||0),
      requires_gender:Number($("#tt_g", root).value||0),
    };
    if(!payload.event_id || !payload.name){ alert("Pick event & name"); return; }
    const r = await api("/api/admin/ticket-types/add", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!r.ok) alert(r.error||"Failed"); else { alert("Added"); doLoad(); }
  };
}

function settingsHTML(){
  return \`
  <div>
    <div id="s_info" class="mini muted">Loading…</div>
    <div class="card mt12">
      <div class="grid grid-2">
        <div><label>Public base URL</label><input id="s_base" placeholder="https://tickets.example.com"/></div>
        <div><label>WhatsApp Phone Number ID</label><input id="s_pnid" placeholder="7802..."/></div>
        <div><label>WhatsApp Template name</label><input id="s_tname" placeholder="ticket_delivery"/></div>
        <div><label>WhatsApp Template language</label><input id="s_tlang" placeholder="af or en_US"/></div>
        <div><label>WhatsApp Token</label><input id="s_token" placeholder="EAAG..."/></div>
      </div>
      <button class="btn mt12" id="s_save">Save settings</button>
    </div>
  </div>\`;
}
async function settingsBind(root){
  async function refresh(){
    const r = await api("/api/admin/settings");
    const s = r.settings||{};
    $("#s_info", root).innerHTML = \`WhatsApp: <b>\${s.configured? "configured":"not configured"}</b>\`;
    $("#s_base", root).value = s.public_base_url||"";
    $("#s_pnid", root).value = s.whatsapp_phone_number_id||"";
    $("#s_tname", root).value = s.whatsapp_template_name||"";
    $("#s_tlang", root).value = s.whatsapp_template_lang||"";
    $("#s_token", root).value = ""; // never echo token back; set when saving
  }
  $("#s_save", root).onclick = async () => {
    const payload = {
      public_base_url: $("#s_base", root).value.trim(),
      whatsapp_phone_number_id: $("#s_pnid", root).value.trim(),
      whatsapp_template_name: $("#s_tname", root).value.trim(),
      whatsapp_template_lang: $("#s_tlang", root).value.trim(),
    };
    const token = $("#s_token", root).value.trim();
    if (token) payload.whatsapp_token = token;
    const r = await api("/api/admin/settings/update", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!r.ok) alert(r.error||"Failed"); else { alert("Saved"); refresh(); }
  };
  refresh();
}

/* Tab router */
const pane = document.getElementById("pane");
function mount(tab){
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab===tab));
  if(tab==="tickets"){ pane.innerHTML = ticketsHTML(); ticketsBind(pane); }
  else if(tab==="pos"){ pane.innerHTML = posHTML(); posBind(pane); }
  else if(tab==="vendors"){ pane.innerHTML = vendorsHTML(); vendorsBind(pane); }
  else if(tab==="users"){ pane.innerHTML = usersHTML(); usersBind(pane); }
  else if(tab==="events"){ pane.innerHTML = eventsHTML(); eventsBind(pane); }
  else if(tab==="settings"){ pane.innerHTML = settingsHTML(); settingsBind(pane); }
}
$$(".tab").forEach(t => t.addEventListener("click", () => mount(t.dataset.tab)));
mount("tickets");
</script>
</body></html>`;
}
