// /src/ui/admin.js
import { LOGO_URL } from "../constants.js";
import { adminEventsJS } from "./admin_events.js";
import { adminTicketsJS } from "./admin_tickets.js";
import { adminPOSJS } from "./admin_pos.js";
import { adminVendorsJS } from "./admin_vendors.js";
import { adminUsersJS } from "./admin_users.js";
import { adminSiteSettingsJS } from "./admin_sitesettings.js";

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
  .hide{ display:none }
  .muted{ color:var(--muted) }
</style>
</head><body>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <img src="${encodeURI(LOGO_URL || "https://placehold.co/160x36?text=Skou")}" alt="logo"/>
      <h1 style="margin:0">Admin</h1>
    </div>
    <a class="btn" href="/admin/login" style="text-decoration:none;border:1px solid #e5e7eb;padding:8px 10px;border-radius:10px;color:#111;background:#fff">Sign out</a>
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
// helpers
window.$ = (id)=>document.getElementById(id);
window.esc = (s)=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
window.rands = (c)=>"R"+((c||0)/100).toFixed(2);

// module registry
window.AdminPanels = {};

// modules
${adminEventsJS}
${adminTicketsJS}
${adminPOSJS}
${adminVendorsJS}
${adminUsersJS}
${adminSiteSettingsJS}

// Tab switching
function switchTab(name){
  document.querySelectorAll(".tab").forEach(t=>{
    t.classList.toggle("active", t.dataset.tab===name);
  });
  document.querySelectorAll("[id^=panel-]").forEach(p=>p.classList.add("hide"));
  const panel = document.getElementById("panel-"+name);
  if (panel){ panel.classList.remove("hide"); }
  const fn = window.AdminPanels[name];
  if (typeof fn === "function") fn();
}

document.querySelectorAll(".tab").forEach(t=>{
  t.onclick = ()=> switchTab(t.dataset.tab);
});

// Default
switchTab("events");

// Optional deep-link e.g. /admin#settings:whatsapp
if (location.hash.startsWith("#settings:")){
  switchTab("settings");
  const sub = location.hash.split(":")[1] || "general";
  setTimeout(()=>window.AdminPanels.settingsSwitch && window.AdminPanels.settingsSwitch(sub), 0);
}
</script>
</body></html>`;
