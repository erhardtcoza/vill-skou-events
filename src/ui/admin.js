// /src/ui/admin.js
import { LOGO_URL } from "../constants.js";
import { adminEventsJS } from "./admin_events.js";
import { adminTicketsJS } from "./admin_tickets.js";
import { adminPOSJS } from "./admin_pos.js";
import { adminVendorsJS } from "./admin_vendors.js";
import { adminUsersJS } from "./admin_users.js";
import { adminSiteSettingsJS } from "./admin_sitesettings.js";

// NEW: Bar admin modules (inline JS strings, like the others)
import { adminBarMenuJS } from "./admin_bar_menu.js";
import { adminBarWalletJS } from "./admin_bar_wallet.js";
import { adminBarCashupJS } from "./admin_bar_cashup.js";

export const adminHTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; --border:#e5e7eb }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
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

  /* Subtabs for the Bar tab */
  .subtabs{ display:flex; flex-wrap:wrap; gap:6px; margin:0 0 12px }
  .subtab{ padding:6px 10px; border:1px solid var(--border); border-radius:999px; cursor:pointer; background:#fff; font-weight:600; }
  .subtab.active{ background:#0a7d2b; color:#fff; border-color:transparent }
  .subnote{ color:var(--muted); margin-bottom:8px }
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
    <!-- NEW: Bar tab inserted BEFORE Site Settings -->
    <div class="tab" data-tab="bar">Bar</div>
    <div class="tab" data-tab="settings">Site Settings</div>
  </div>

  <!-- Panels -->
  <div id="panel-events" class="card"></div>
  <div id="panel-tickets" class="card hide"></div>
  <div id="panel-pos" class="card hide"></div>
  <div id="panel-vendors" class="card hide"></div>
  <div id="panel-users" class="card hide"></div>

  <!-- NEW: Bar panel -->
  <div id="panel-bar" class="card hide">
    <div class="subtabs" id="bar-subtabs">
      <div class="subtab active" data-bar="menu">Bar Menu</div>
      <div class="subtab" data-bar="wallets">Wallets</div>
      <div class="subtab" data-bar="cashup">Cashup</div>
    </div>
    <div class="subnote">Manage the bar catalogue, customer wallets, and daily cashups.</div>
    <div id="bar-content"></div>
  </div>

  <div id="panel-settings" class="card hide"></div>
</div>

<script>
// helpers
window.$ = (id)=>document.getElementById(id);
window.esc = (s)=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
window.rands = (c)=>"R"+((c||0)/100).toFixed(2);

// module registry
window.AdminPanels = {};
// NEW: namespace where bar submodules can attach their renderers
window.AdminBar = window.AdminBar || {}; // expects .menu(el), .wallets(el), .cashup(el)

// modules
${adminEventsJS}
${adminTicketsJS}
${adminPOSJS}
${adminVendorsJS}
${adminUsersJS}
${adminSiteSettingsJS}

/* ---------- NEW: Inline the Bar submodules ---------- */
${adminBarMenuJS}
${adminBarWalletJS}
${adminBarCashupJS}

/* ---------- Bar subtabs plumbing ---------- */
function renderBarSection(section){
  const content = $('bar-content');
  if (!content) return;

  // Visual active state
  document.querySelectorAll('#bar-subtabs .subtab').forEach(st => {
    st.classList.toggle('active', st.dataset.bar === section);
  });

  // Clear and render
  content.innerHTML = '';
  const fn =
    (section === 'menu' && window.AdminBar.menu) ||
    (section === 'wallets' && window.AdminBar.wallets) ||
    (section === 'cashup' && window.AdminBar.cashup) ||
    null;

  if (typeof fn === 'function') {
    // Pass the container element to the renderer
    fn(content);
  } else {
    content.innerHTML = '<div class="muted">Module not loaded yet.</div>';
  }

  // Keep hash in sync for deeplinks (e.g. /admin#bar:wallets)
  try { history.replaceState(null, '', '#bar:'+section); } catch {}
}

// Wire subtab clicks
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.subtab');
  if (btn && btn.dataset.bar) {
    renderBarSection(btn.dataset.bar);
  }
});

/* ---------- Tabs switching ---------- */
function switchTab(name){
  document.querySelectorAll(".tab").forEach(t=>{
    t.classList.toggle("active", t.dataset.tab===name);
  });
  document.querySelectorAll("[id^=panel-]").forEach(p=>p.classList.add("hide"));
  const panel = document.getElementById("panel-"+name);
  if (panel){ panel.classList.remove("hide"); }

  const fn = window.AdminPanels[name];
  if (typeof fn === "function") fn();

  // Auto-load default Bar subtab when opening Bar
  if (name === 'bar') {
    // Read desired sub from hash if present
    const hash = (location.hash || '').slice(1); // e.g. "bar:wallets"
    const wanted = hash.startsWith('bar:') ? hash.split(':')[1] : 'menu';
    renderBarSection(wanted || 'menu');
  }
}

document.querySelectorAll(".tab").forEach(t=>{
  t.onclick = ()=> switchTab(t.dataset.tab);
});

// Default
switchTab("events");

// Deep-links
// e.g. /admin#settings:whatsapp, or /admin#bar:wallets
if (location.hash) {
  const hash = location.hash.slice(1);
  if (hash.startsWith('settings:')) {
    switchTab("settings");
    const sub = hash.split(":")[1] || "general";
    setTimeout(()=>window.AdminPanels.settingsSwitch && window.AdminPanels.settingsSwitch(sub), 0);
  } else if (hash.startsWith('bar:')) {
    switchTab("bar");
    const sub = hash.split(":")[1] || "menu";
    // renderBarSection already called by switchTab('bar'), but ensure correct sub:
    setTimeout(()=>renderBarSection(sub), 0);
  }
}
</script>
</body></html>`;
