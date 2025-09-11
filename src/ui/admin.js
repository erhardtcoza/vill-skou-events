// /src/ui/admin.js
import { LOGO_URL } from "../constants.js";

export const adminHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --border:#e5e7eb }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  .top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px }
  .brand{ display:flex; gap:10px; align-items:center }
  .brand img{ height:36px; width:auto }
  .tabs{ display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 }
  .tab{ padding:8px 12px; border:1px solid var(--border); border-radius:10px; cursor:pointer; background:#fff }
  .tab.active{ background:var(--green); color:#fff; border-color:transparent }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px; margin-top:10px }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
  @media (max-width:900px){ .row{ grid-template-columns:1fr } }
  label{ display:block; font-size:13px; color:#444; margin:8px 0 6px }
  input, select, textarea{ width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font:inherit; background:#fff }
  table{ width:100%; border-collapse:collapse; }
  th, td{ text-align:left; padding:8px 10px; border-bottom:1px solid #f1f3f5 }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:#fff; cursor:pointer; font-weight:600 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .muted{ color:var(--muted) }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid var(--border); color:#444 }
  .hide{ display:none }
  .split{ display:flex; gap:12px; flex-wrap:wrap; align-items:center }
</style>
</head><body>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <img src="${encodeURI(LOGO_URL || "https://placehold.co/160x36?text=Skou")}" alt="logo"/>
      <h1 style="margin:0">Admin</h1>
    </div>
    <a class="btn" href="/admin/login">Sign out</a>
  </div>

  <!-- Tabs -->
  <div class="tabs" id="tabs">
    <div class="tab active" data-tab="events">Events</div>
    <div class="tab" data-tab="tickets">Tickets</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="settings">Site Settings</div>
  </div>

  <!-- Panels -->
  <div id="panel-events" class="card"></div>
  <div id="panel-tickets" class="card hide"></div>
  <div id="panel-pos" class="card hide"></div>
  <div id="panel-vendors" class="card hide"></div>
  <div id="panel-users" class="card hide"></div>
  <div id="panel-settings" class="card hide"></div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const API = {
  events: "/api/admin/events",
  ticketTypes: (event_id)=> \`/api/admin/events/\${event_id}/ticket_types\`,
  sessions: "/api/admin/pos/sessions/summary",
  vendors: (event_id)=> \`/api/admin/vendors?event_id=\${event_id}\`,
  users: "/api/admin/users",
  settings_get: "/api/admin/settings",
  settings_set: "/api/admin/settings/update"
};

function esc(s){ return String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
function rands(c){ return "R"+((c||0)/100).toFixed(2); }

function switchTab(name){
  document.querySelectorAll(".tab").forEach(t=>{
    t.classList.toggle("active", t.dataset.tab===name);
  });
  document.querySelectorAll("[id^=panel-]").forEach(p=>p.classList.add("hide"));
  const p = $("panel-"+name); if (p) p.classList.remove("hide");
  // Initial render per tab
  if (name==="events") renderEvents();
  if (name==="tickets") renderTickets();
  if (name==="pos") renderPOS();
  if (name==="vendors") renderVendors();
  if (name==="users") renderUsers();
  if (name==="settings") renderSettings();
}
document.querySelectorAll(".tab").forEach(t=>{
  t.onclick = ()=> switchTab(t.dataset.tab);
});

// ---- Events
async function renderEvents(){
  const el = $("panel-events");
  el.innerHTML = "<div class='muted'>Loading events…</div>";
  const j = await fetch(API.events).then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ el.innerHTML = "<div class='muted'>Failed to load events</div>"; return; }

  el.innerHTML = [
    "<h2>Events</h2>",
    "<table><thead><tr><th>ID</th><th>Name</th><th>Slug</th><th>Venue</th><th>When</th></tr></thead><tbody>",
    ...(j.events||[]).map(ev=>[
      "<tr>",
      "<td>", String(ev.id), "</td>",
      "<td>", esc(ev.name), "</td>",
      "<td>", esc(ev.slug), "</td>",
      "<td>", esc(ev.venue||""), "</td>",
      "<td>", new Date(ev.starts_at*1000).toLocaleDateString(), "</td>",
      "</tr>"
    ].join("")),
    "</tbody></table>"
  ].join("");
}

// ---- Tickets
async function renderTickets(){
  const el = $("panel-tickets");
  el.innerHTML = "<h2>Tickets</h2><div class='muted'>Kies 'n event om opsomming te sien.</div>";
  // Minimal UI: event picker + summary call
  const evs = await fetch(API.events).then(r=>r.json()).catch(()=>({ok:false,events:[]}));
  if (!evs.ok || !evs.events?.length) return;

  const picker = document.createElement("div");
  picker.className = "split";
  picker.innerHTML = "<label>Event</label>";
  const sel = document.createElement("select");
  sel.innerHTML = evs.events.map(ev=>"<option value='"+ev.id+"'>"+esc(ev.name)+"</option>").join("");
  picker.appendChild(sel);
  el.appendChild(picker);

  const box = document.createElement("div");
  box.style.marginTop = "10px";
  el.appendChild(box);

  async function loadSum(){
    const id = Number(sel.value||0);
    const j = await fetch("/api/admin/tickets/summary?event_id="+id).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }
    box.innerHTML = [
      "<div class='split'>",
      "<span class='pill'>Sold: "+(j.summary?.sold||0)+"</span>",
      "<span class='pill'>Unused: "+(j.summary?.unused||0)+"</span>",
      "<span class='pill'>In: "+(j.summary?.in||0)+"</span>",
      "<span class='pill'>Out: "+(j.summary?.out||0)+"</span>",
      "<span class='pill'>Void: "+(j.summary?.void||0)+"</span>",
      "</div>"
    ].join("");
  }
  sel.onchange = loadSum;
  loadSum();
}

// ---- POS Admin
async function renderPOS(){
  const el = $("panel-pos");
  el.innerHTML = "<h2>POS Sessions</h2><div class='muted'>Loading…</div>";
  const j = await fetch(API.sessions).then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ el.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }

  el.innerHTML = [
    "<h2>POS Sessions</h2>",
    "<table><thead><tr>",
    "<th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th>",
    "<th>Cash</th><th>Card</th><th>Closed by</th>",
    "</tr></thead><tbody>",
    ...(j.sessions||[]).map(s=>[
      "<tr>",
      "<td>", String(s.id), "</td>",
      "<td>", esc(s.cashier_name||""), "</td>",
      "<td>", esc(s.gate_name||s.gate||""), "</td>",
      "<td>", s.opened_at ? new Date(s.opened_at*1000).toLocaleString() : "", "</td>",
      "<td>", s.closed_at ? new Date(s.closed_at*1000).toLocaleString() : "", "</td>",
      "<td>", rands(s.total_cash_cents||0), "</td>",
      "<td>", rands(s.total_card_cents||0), "</td>",
      "<td>", esc(s.closing_manager||s.manager_name||""), "</td>",
      "</tr>"
    ].join("")),
    "</tbody></table>"
  ].join("");
}

// ---- Vendors (list + very light editor launcher)
async function renderVendors(){
  const el = $("panel-vendors");
  el.innerHTML = "<h2>Vendors</h2><div class='muted'>Kies 'n event om vendors te sien.</div>";

  const evs = await fetch(API.events).then(r=>r.json()).catch(()=>({ok:false,events:[]}));
  if (!evs.ok || !evs.events?.length) return;

  const picker = document.createElement("div");
  picker.className = "split";
  picker.innerHTML = "<label>Event</label>";
  const sel = document.createElement("select");
  sel.innerHTML = evs.events.map(ev=>"<option value='"+ev.id+"'>"+esc(ev.name)+"</option>").join("");
  picker.appendChild(sel);
  el.appendChild(picker);

  const box = document.createElement("div");
  box.style.marginTop = "10px";
  el.appendChild(box);

  async function loadV(){
    const id = Number(sel.value||0);
    const j = await fetch(API.vendors(id)).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie vendors laai nie</div>"; return; }
    box.innerHTML = [
      "<table><thead><tr><th>Name</th><th>Contact</th><th>Stand</th></tr></thead><tbody>",
      ...(j.vendors||[]).map(v=>[
        "<tr>",
        "<td>", esc(v.name), "</td>",
        "<td>", esc(v.contact_name||""), " · ", esc(v.phone||""), "</td>",
        "<td>", esc(v.stand_number||""), "</td>",
        "</tr>"
      ].join("")),
      "</tbody></table>"
    ].join("");
  }
  sel.onchange = loadV;
  loadV();
}

// ---- Users
async function renderUsers(){
  const el = $("panel-users");
  el.innerHTML = "<h2>Users</h2><div class='muted'>Loading…</div>";
  const j = await fetch(API.users).then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ el.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }
  el.innerHTML = [
    "<h2>Users</h2>",
    "<table><thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead><tbody>",
    ...(j.users||[]).map(u=>[
      "<tr>",
      "<td>", String(u.id), "</td>",
      "<td>", esc(u.username), "</td>",
      "<td>", esc(u.role), "</td>",
      "</tr>"
    ].join("")),
    "</tbody></table>"
  ].join("");
}

// ---- Site Settings (WhatsApp + Yoco)
async function renderSettings(){
  const el = $("panel-settings");
  el.innerHTML = "<h2>Site Settings</h2><div class='muted'>Loading…</div>";
  const j = await fetch(API.settings_get).then(r=>r.json()).catch(()=>({ok:false,settings:{}}));
  const S = j.settings || {};

  const base = (S.PUBLIC_BASE_URL || "");
  const callbackUrl = (base || location.origin) + "/api/admin/yoco/oauth/callback";

  el.innerHTML = [
    "<h2>Site Settings</h2>",
    "<div class='tabs' style='margin-top:0'>",
    "<div class='tab active' data-sub='wa'>WhatsApp</div>",
    "<div class='tab' data-sub='yoco'>Yoco</div>",
    "</div>",

    // WhatsApp
    "<div id='sub-wa'>",
      "<div class='row'>",
        "<div>",
          "<label>PUBLIC_BASE_URL</label>",
          "<input id='PUBLIC_BASE_URL' value='"+esc(S.PUBLIC_BASE_URL||"")+"' />",
        "</div>",
        "<div>",
          "<label>VERIFY_TOKEN</label>",
          "<input id='VERIFY_TOKEN' value='"+esc(S.VERIFY_TOKEN||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>PHONE_NUMBER_ID</label>",
          "<input id='PHONE_NUMBER_ID' value='"+esc(S.PHONE_NUMBER_ID||"")+"' />",
        "</div>",
        "<div>",
          "<label>WHATSAPP_TOKEN</label>",
          "<input id='WHATSAPP_TOKEN' value='"+esc(S.WHATSAPP_TOKEN||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>WHATSAPP_TEMPLATE_NAME</label>",
          "<input id='WHATSAPP_TEMPLATE_NAME' value='"+esc(S.WHATSAPP_TEMPLATE_NAME||"")+"' />",
        "</div>",
        "<div>",
          "<label>WHATSAPP_TEMPLATE_LANG</label>",
          "<input id='WHATSAPP_TEMPLATE_LANG' value='"+esc(S.WHATSAPP_TEMPLATE_LANG||"af")+"' />",
        "</div>",
      "</div>",
      "<div style='margin-top:10px'><button class='btn primary' id='saveWA'>Save WhatsApp</button></div>",
      "<hr style='margin:16px 0'/>",
    "</div>",

    // Yoco
    "<div id='sub-yoco' class='hide'>",
      "<div class='row'>",
        "<div>",
          "<label>YOCO_MODE</label>",
          "<select id='YOCO_MODE'>",
            "<option value='sandbox' ", (S.YOCO_MODE!=='live'?"selected":""), ">Sandbox</option>",
            "<option value='live' ",   (S.YOCO_MODE==='live'?"selected":""),   ">Live</option>",
          "</select>",
        "</div>",
        "<div>",
          "<label>YOCO_PUBLIC_KEY</label>",
          "<input id='YOCO_PUBLIC_KEY' value='"+esc(S.YOCO_PUBLIC_KEY||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>YOCO_SECRET_KEY</label>",
          "<input id='YOCO_SECRET_KEY' value='"+esc(S.YOCO_SECRET_KEY||"")+"' />",
        "</div>",
        "<div>",
          "<label>YOCO_CLIENT_ID</label>",
          "<input id='YOCO_CLIENT_ID' value='"+esc(S.YOCO_CLIENT_ID||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>YOCO_REDIRECT_URI</label>",
          "<input id='YOCO_REDIRECT_URI' value='"+esc(S.YOCO_REDIRECT_URI||"")+"' />",
        "</div>",
        "<div>",
          "<label>YOCO_REQUIRED_SCOPES</label>",
          "<input id='YOCO_REQUIRED_SCOPES' value='"+esc(S.YOCO_REQUIRED_SCOPES||"CHECKOUT_PAYMENTS")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>YOCO_STATE</label>",
          "<input id='YOCO_STATE' value='"+esc(S.YOCO_STATE||"skou")+"' />",
        "</div>",
        "<div>",
          "<label>OAuth Callback URL</label>",
          "<input value='"+esc(callbackUrl)+"' readonly />",
        "</div>",
      "</div>",
      "<div class='split' style='margin-top:10px'>",
        "<button class='btn primary' id='saveYoco'>Save Yoco</button>",
        "<button class='btn' id='startOAuth'>Start OAuth</button>",
        "<span class='muted'>Use this callback in your Yoco app settings.</span>",
      "</div>",
    "</div>"
  ].join("");

  // sub-tabs
  const subTabs = el.querySelectorAll(".tabs .tab");
  const wa = el.querySelector("#sub-wa");
  const yo = el.querySelector("#sub-yoco");
  subTabs.forEach(t=>{
    t.onclick = ()=>{
      subTabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      (t.dataset.sub==="wa") ? (wa.classList.remove("hide"), yo.classList.add("hide"))
                             : (yo.classList.remove("hide"), wa.classList.add("hide"));
    };
  });

  $("saveWA").onclick = () => saveSettings({
    PUBLIC_BASE_URL: $("PUBLIC_BASE_URL").value,
    VERIFY_TOKEN: $("VERIFY_TOKEN").value,
    PHONE_NUMBER_ID: $("PHONE_NUMBER_ID").value,
    WHATSAPP_TOKEN: $("WHATSAPP_TOKEN").value,
    WHATSAPP_TEMPLATE_NAME: $("WHATSAPP_TEMPLATE_NAME").value,
    WHATSAPP_TEMPLATE_LANG: $("WHATSAPP_TEMPLATE_LANG").value
  });

  $("saveYoco").onclick = () => saveSettings({
    YOCO_MODE: $("YOCO_MODE").value,
    YOCO_PUBLIC_KEY: $("YOCO_PUBLIC_KEY").value,
    YOCO_SECRET_KEY: $("YOCO_SECRET_KEY").value,
    YOCO_CLIENT_ID: $("YOCO_CLIENT_ID").value,
    YOCO_REDIRECT_URI: $("YOCO_REDIRECT_URI").value,
    YOCO_REQUIRED_SCOPES: $("YOCO_REQUIRED_SCOPES").value,
    YOCO_STATE: $("YOCO_STATE").value
  });

  $("startOAuth").onclick = () => {
    const cid = $("YOCO_CLIENT_ID").value.trim();
    const red = $("YOCO_REDIRECT_URI").value.trim() || "${""}".slice(0); // keep template stable
    const scp = $("YOCO_REQUIRED_SCOPES").value.trim() || "CHECKOUT_PAYMENTS";
    const st  = $("YOCO_STATE").value.trim() || "skou";
    if (!cid || !callbackUrl){ alert("Please save Yoco Client ID and Redirect URI first."); return; }
    // Yoco OAuth authorize URL (docs)
    const auth = new URL("https://secure.yoco.com/oauth/authorize");
    auth.searchParams.set("client_id", cid);
    auth.searchParams.set("redirect_uri", $("YOCO_REDIRECT_URI").value.trim() || callbackUrl);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", scp);
    auth.searchParams.set("state", st);
    location.href = auth.toString();
  };
}

async function saveSettings(obj){
  const r = await fetch(API.settings_set, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ updates: obj })
  });
  if (!r.ok){ alert("Save failed"); return; }
  alert("Saved");
}

// default tab:
switchTab("events");
// deep-link support for settings subtab (e.g. #site-settings-yoco)
if (location.hash === "#site-settings-yoco"){
  switchTab("settings");
  setTimeout(()=>{
    const tabs = document.querySelectorAll(".tabs .tab");
    tabs.forEach(t => { if (t.textContent.trim()==="Yoco") t.click(); });
  }, 0);
}
</script>
</body></html>`;
