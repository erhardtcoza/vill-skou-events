// /src/ui/admin.js
// Pure DOM + fetch; mobile-friendly tabs. No external utils.

const esc = (s) => String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

const R = (cents) => "R" + (Number(cents||0)/100).toFixed(2);

function card(inner) {
  return `<div class="card">${inner}</div>`;
}

function tabsHTML(active="tickets") {
  const btn = (id,label) =>
    `<button class="tab ${active===id?"on":""}" data-tab="${id}">${label}</button>`;
  return `
    <div class="tabs">
      ${btn("tickets","Tickets")}
      ${btn("vendors","Vendors")}
      ${btn("users","Users")}
      ${btn("settings","Site settings")}
    </div>
    <div id="tab-body"></div>
  `;
}

async function fetchJSON(url, opt) {
  const res = await fetch(url, opt);
  const t = await res.text();
  try { return JSON.parse(t); } catch { throw new Error(t || res.statusText); }
}

async function loadEvents() {
  const r = await fetchJSON("/api/admin/events");
  return r.events || [];
}

/* ---------------- Tickets tab ---------------- */
function ticketsPanelHTML(state) {
  const evOpts = state.events.map(e =>
    `<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join("");
  const summary = state.summary ? ticketsSummaryTable(state.summary) : `<div class="muted">Pick an event and Load.</div>`;
  const lookup = `
    <div class="row">
      <input id="order-code" placeholder="Order code (e.g. 3VLNT5)" />
      <button id="btn-lookup" class="btn">Lookup</button>
    </div>
    <div id="order-result"></div>
  `;
  return card(`
    <div class="row">
      <select id="tickets-event">${evOpts}</select>
      <button id="btn-load-summary" class="btn">Load</button>
    </div>
    <div id="tickets-summary">${summary}</div>
    ${lookup}
  `);
}

function ticketsSummaryTable(summary) {
  const head = `
    <div class="totals">
      Total: ${summary.totals.total ?? 0} ·
      In: ${summary.totals.in_count ?? 0} ·
      Out: ${summary.totals.out_count ?? 0} ·
      Unused: ${summary.totals.unused ?? 0} ·
      Void: ${summary.totals.void_count ?? 0}
    </div>`;
  const rows = (summary.per_type || []).map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td>${R(r.price_cents)}</td>
      <td>${r.total||0}</td>
      <td>${r.unused||0}</td>
      <td>${r.in_count||0}</td>
      <td>${r.out_count||0}</td>
      <td>${r.void_count||0}</td>
    </tr>`).join("");
  return `
    ${head}
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr>
          <th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function orderResultHTML(data) {
  if (!data?.ok) return `<div class="error">Not found</div>`;
  const link = `/t/${esc(data.order.short_code)}`;
  const tickets = (data.tickets||[]).map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${esc(t.type_name)}</td>
      <td class="mono">${esc(t.qr)}</td>
      <td>${esc(t.state)}</td>
    </tr>`).join("");
  return `
    <div class="row smallgap">
      <div class="muted">Ticket link: <a href="${link}" target="_blank">${link}</a></div>
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>ID</th><th>Type</th><th>QR</th><th>State</th></tr></thead>
        <tbody>${tickets}</tbody>
      </table>
    </div>
    <div class="row">
      <input id="wa-to" placeholder="WhatsApp MSISDN (e.g. 27718878933)" value="${esc(data.order.buyer_phone||"")}" />
      <button id="btn-wa" class="btn">Send via WhatsApp</button>
    </div>
  `;
}

/* ---------------- Vendors tab ---------------- */
function vendorsPanelHTML(state) {
  const evOpts = state.events.map(e =>
    `<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join("");
  const list = vendorsListHTML(state.vendors || []);
  return card(`
    <div class="row">
      <select id="vendors-event">${evOpts}</select>
      <button id="btn-load-vendors" class="btn">Load</button>
    </div>
    ${list}
    <h3>New vendor</h3>
    <div class="grid2">
      <input id="v-name" placeholder="Vendor name" />
      <input id="v-contact" placeholder="Contact name" />
      <input id="v-phone" placeholder="Phone" />
      <input id="v-email" placeholder="Email" />
      <input id="v-stand" placeholder="Stand #" />
      <input id="v-staff" placeholder="Staff quota" inputmode="numeric" />
      <input id="v-veh" placeholder="Vehicle quota" inputmode="numeric" />
      <button id="btn-add-vendor" class="btn">Add</button>
    </div>
  `);
}

function vendorsListHTML(items) {
  if (!items.length) return `<div class="muted">No vendors loaded.</div>`;
  const rows = items.map(v => `
    <tr data-id="${v.id}">
      <td><input class="e-name" value="${esc(v.name||"")}" /></td>
      <td><input class="e-contact" value="${esc(v.contact_name||"")}" /></td>
      <td><input class="e-phone" value="${esc(v.phone||"")}" /></td>
      <td><input class="e-email" value="${esc(v.email||"")}" /></td>
      <td><input class="e-stand" value="${esc(v.stand_number||"")}" /></td>
      <td><input class="e-staff" value="${esc(v.staff_quota||0)}" inputmode="numeric"/></td>
      <td><input class="e-veh" value="${esc(v.vehicle_quota||0)}" inputmode="numeric"/></td>
      <td><button class="btn btn-dark btn-save">Save</button></td>
    </tr>
  `).join("");
  return `
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr>
          <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>
          <th>Stand</th><th>Staff</th><th>Vehicle</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ---------------- Users tab ---------------- */
function usersPanelHTML(state) {
  const rows = (state.users||[]).map(u => `
    <tr>
      <td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td>
      <td><button data-id="${u.id}" class="btn btn-dark btn-del">Delete</button></td>
    </tr>`).join("");
  return card(`
    <div class="grid3">
      <input id="u-name" placeholder="username" />
      <select id="u-role">
        <option value="admin">admin</option>
        <option value="pos">pos</option>
        <option value="scan">scan</option>
      </select>
      <button id="btn-add-user" class="btn">Add</button>
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

/* ---------------- Site settings (WhatsApp) ---------------- */
function settingsPanelHTML(s) {
  const cfg = s.settings || {};
  return card(`
    <h3>WhatsApp (Meta)</h3>
    <div class="grid2">
      <input id="set-public" placeholder="Public base URL" value="${esc(cfg.public_base_url||"")}" />
      <input id="set-pnid" placeholder="Phone Number ID" value="${esc(cfg.whatsapp_phone_number_id||"")}" />
      <input id="set-bid" placeholder="Business ID" value="${esc(cfg.whatsapp_business_id||"")}" />
      <input id="set-token" placeholder="Access token" value="${esc(cfg.whatsapp_access_token||"")}" />
      <input id="set-tpl" placeholder="Template name" value="${esc(cfg.whatsapp_template_name||"ticket_delivery")}" />
      <input id="set-lang" placeholder="Template lang (e.g. en_US)" value="${esc(cfg.whatsapp_template_lang||"en_US")}" />
      <button id="btn-save-settings" class="btn">Save</button>
    </div>
    <div class="muted small">Values in environment override DB (Phone Number ID, token, etc.).</div>
  `);
}

/* ---------------- Mount ---------------- */
export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{--green:#0a7d2b;--bg:#f6faf7}
  body{font-family:system-ui;margin:0;background:var(--bg);color:#111}
  .wrap{max-width:1000px;margin:20px auto;padding:0 12px}
  h1{font-size:28px;margin:10px 0 16px}
  .tabs{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
  .tab{border-radius:20px;padding:8px 14px;border:1px solid #cfe6d6;background:#eef8f0}
  .tab.on{background:#cfeedd;border-color:#a6d7b5}
  .card{background:#fff;border:1px solid #e2e8e4;border-radius:14px;padding:12px;margin-bottom:14px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .grid3{display:grid;grid-template-columns:2fr 1fr auto;gap:8px}
  input,select{border:1px solid #d4ddd8;border-radius:10px;padding:10px 12px;background:#fff;min-width:0}
  input::placeholder{color:#9aa5a0}
  .btn{background:var(--green);color:#fff;border:none;border-radius:10px;padding:10px 14px;cursor:pointer}
  .btn-dark{background:#111;color:#fff}
  .muted{color:#566}
  .small{font-size:12px}
  .table-wrap{overflow:auto;border:1px solid #e7eee9;border-radius:10px}
  table.tbl{width:100%;border-collapse:collapse}
  .tbl th,.tbl td{padding:8px 10px;border-bottom:1px solid #eef3ef;white-space:nowrap}
  .tbl thead th{position:sticky;top:0;background:#f8fbf9}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, monospace}
  @media (max-width:700px){
    .grid2{grid-template-columns:1fr}
    .grid3{grid-template-columns:1fr}
  }
</style>
</head><body><div class="wrap">
  <h1>Admin dashboard</h1>
  ${tabsHTML("tickets")}
</div>
<script type="module">
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => [...p.querySelectorAll(s)];
  const state = { tab: "tickets", events: [], summary: null, vendors: [], users: [], settings: null, currentEventId: null, lastOrderCode: null };

  function render() {
    $("#tab-body").innerHTML =
      state.tab==="tickets" ? \`${ticketsPanelHTML(state)}\` :
      state.tab==="vendors" ? \`${vendorsPanelHTML(state)}\` :
      state.tab==="users"   ? \`${usersPanelHTML(state)}\` :
                              \`${settingsPanelHTML(state)}\`;

    // wire tab-specific actions
    if (state.tab === "tickets") {
      $("#tickets-event").value = state.currentEventId ?? (state.events[0]?.id || "");
      $("#btn-load-summary").onclick = async () => {
        state.currentEventId = Number($("#tickets-event").value||0);
        if (!state.currentEventId) return;
        const r = await (await fetch(\`/api/admin/tickets/summary?event_id=\${state.currentEventId}\`)).json();
        state.summary = r;
        $("#tickets-summary").innerHTML = \`${ticketsSummaryTable(r)}\`;
      };
      $("#btn-lookup").onclick = async () => {
        const code = ($("#order-code").value||"").trim();
        if (!code) return;
        state.lastOrderCode = code;
        const r = await (await fetch(\`/api/admin/order/by-code/\${encodeURIComponent(code)}\`)).json();
        $("#order-result").innerHTML = \`${orderResultHTML(r)}\`;
        const btn = $("#btn-wa"); if (btn) btn.onclick = sendWA;
      };
    } else if (state.tab === "vendors") {
      $("#vendors-event").value = state.currentEventId ?? (state.events[0]?.id || "");
      $("#btn-load-vendors").onclick = async () => {
        state.currentEventId = Number($("#vendors-event").value||0);
        if (!state.currentEventId) return;
        const r = await (await fetch(\`/api/admin/vendors?event_id=\${state.currentEventId}\`)).json();
        state.vendors = r.vendors || [];
        // re-render panel to refresh list
        render();
      };
      $("#btn-add-vendor").onclick = async () => {
        const body = {
          event_id: Number($("#vendors-event").value||0),
          name: $("#v-name").value, contact_name: $("#v-contact").value,
          phone: $("#v-phone").value, email: $("#v-email").value,
          stand_number: $("#v-stand").value,
          staff_quota: Number($("#v-staff").value||0),
          vehicle_quota: Number($("#v-veh").value||0)
        };
        const r = await fetch("/api/admin/vendors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if (!r.ok) return alert("Failed to add");
        $("#btn-load-vendors").click();
      };
      $$(".btn-save").forEach(btn => btn.onclick = async (ev) => {
        const tr = ev.target.closest("tr");
        const id = Number(tr.dataset.id);
        const body = {
          id,
          name: tr.querySelector(".e-name").value,
          contact_name: tr.querySelector(".e-contact").value,
          phone: tr.querySelector(".e-phone").value,
          email: tr.querySelector(".e-email").value,
          stand_number: tr.querySelector(".e-stand").value,
          staff_quota: Number(tr.querySelector(".e-staff").value||0),
          vehicle_quota: Number(tr.querySelector(".e-veh").value||0),
        };
        const r = await fetch("/api/admin/vendor/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if (!r.ok) return alert("Save failed");
        alert("Saved");
      });
    } else if (state.tab === "users") {
      $("#btn-add-user").onclick = async () => {
        const body = { username: $("#u-name").value, role: $("#u-role").value };
        const r = await fetch("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if (!r.ok) return alert("Failed");
        await loadUsers();
        render();
      };
      $$(".btn-del").forEach(b => b.onclick = async () => {
        const id = b.getAttribute("data-id");
        const r = await fetch(\`/api/admin/users/\${id}\`,{method:"DELETE"});
        if (!r.ok) return alert("Delete failed");
        await loadUsers(); render();
      });
    } else if (state.tab === "settings") {
      $("#btn-save-settings").onclick = async () => {
        const body = {
          public_base_url: $("#set-public").value,
          whatsapp_phone_number_id: $("#set-pnid").value,
          whatsapp_business_id: $("#set-bid").value,
          whatsapp_access_token: $("#set-token").value,
          whatsapp_template_name: $("#set-tpl").value,
          whatsapp_template_lang: $("#set-lang").value
        };
        const r = await fetch("/api/admin/site-settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if (!r.ok) return alert("Save failed");
        alert("Saved");
      };
    }
  }

  async function sendWA() {
    const to = ($("#wa-to").value||"").trim();
    const code = state.lastOrderCode;
    if (!to || !code) return alert("Missing number or code");
    const r = await fetch("/api/admin/whatsapp/send-order", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ to, code })
    });
    if (!r.ok) {
      const t = await r.text();
      return alert("Failed: " + t);
    }
    alert("Sent");
  }

  async function loadUsers(){ const r = await (await fetch("/api/admin/users")).json(); state.users = r.users||[]; }
  async function loadSettings(){ const r = await (await fetch("/api/admin/site-settings")).json(); state.settings = r; }
  async function init() {
    const evs = await (await fetch("/api/admin/events")).json();
    state.events = evs.events || [];
    await loadUsers();
    await loadSettings();
    render();
  }

  // Tab switching
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) {
      state.tab = t.getAttribute("data-tab");
      $$(".tab").forEach(b => b.classList.remove("on"));
      t.classList.add("on");
      render();
    }
  });

  init();
</script>
</body></html>`;
}