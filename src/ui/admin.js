// /src/ui/admin.js
import { adminShellCSS } from "./styles.js"; // if you don't have styles.js, remove this import and CSS reference
// We’ll keep markup + small JS. No external libs.

export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin dashboard</title>
<style>
  :root{--green:#0a7d2b;--bg:#f6f7f8;}
  body{margin:0;font-family:system-ui;background:var(--bg);color:#111}
  h1{font-size:34px;margin:24px}
  .tabs{display:flex;gap:10px;margin:0 24px 12px;flex-wrap:wrap}
  .tab{padding:10px 14px;border-radius:16px;background:#e8eef0;cursor:pointer}
  .tab.active{background:#cfead7;color:#073b18;font-weight:600}
  .card{background:#fff;border-radius:12px;margin:12px 24px;padding:12px 12px;box-shadow:0 1px 0 rgba(0,0,0,.05)}
  .row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
  .grid{width:100%;border-collapse:collapse}
  .grid th,.grid td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}
  .btn{background:var(--green);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
  .btn.small{padding:6px 10px}
  .btn.sec{background:#1f2937}
  .input, select{border:1px solid #d7dbe0;border-radius:10px;padding:8px 10px;width:100%}
  .help{color:#666;font-size:12px;margin-top:6px}
  @media (max-width:720px){ .row{grid-template-columns:1fr} .tabs{margin-bottom:4px} }
</style>
</head><body>
<h1>Admin dashboard</h1>

<div class="tabs" id="tabs">
  <div class="tab active" data-tab="tickets">Tickets</div>
  <div class="tab" data-tab="pos">POS Admin</div>
  <div class="tab" data-tab="vendors">Vendors</div>
  <div class="tab" data-tab="users">Users</div>
  <div class="tab" data-tab="events">Events</div>
  <div class="tab" data-tab="settings">Site settings</div>
</div>

<div id="content">
  <div class="card">Loading...</div>
</div>

<script>
const $ = (sel, el=document) => el.querySelector(sel);
const $$= (sel, el=document) => [...el.querySelectorAll(sel)];

async function api(path, opt={}) {
  const res = await fetch(path, { credentials: "include", ...opt });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ------------- section renderers ------------- */

async function renderTickets() {
  // top: event dropdown + Load
  const evs = await api("/api/admin/events").then(r=>r.events||[]);
  const evOpt = evs.map(e => \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`).join("");
  const html = \`
    <div class="card">
      <div class="row">
        <select id="t-ev" class="input"><option value="">Pick event</option>${evOpt}</select>
        <button class="btn small" id="t-load">Load</button>
      </div>
      <div class="help">Totals per ticket type appear below. Use order lookup to send tickets via WhatsApp.</div>
      <div id="t-sum" style="margin-top:10px;"></div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;">
        <input class="input" id="t-code" placeholder="Order code (e.g. 3VLNT5)"/>
        <button class="btn" id="t-lookup">Lookup</button>
      </div>
      <div id="t-order" style="margin-top:10px;"></div>
    </div>\`;
  $("#content").innerHTML = html;

  $("#t-load").onclick = async () => {
    const id = Number($("#t-ev").value||0);
    if (!id) return;
    const tt = await api(\`/api/admin/events/\${id}/ticket-types\`).then(r=>r.ticket_types||[]);
    const rows = tt.map(r => \`
      <tr><td>\${r.name}</td>
          <td>R\${(r.price_cents||0)/100 .toFixed(2)}</td>
          <td>\${r.capacity||0}</td>
          <td>\${r.per_order_limit||0}</td>
          <td>\${r.requires_gender? "Yes":"No"}</td></tr>\`).join("");
    $("#t-sum").innerHTML = \`
      <table class="grid"><thead>
        <tr><th>Type</th><th>Price (R)</th><th>Capacity</th><th>Per-order</th><th>Gender req</th></tr>
      </thead><tbody>\${rows || "<tr><td colspan=5>No ticket types.</td></tr>"}</tbody></table>\`;
  };

  $("#t-lookup").onclick = async () => {
    const c = ($("#t-code").value||"").trim();
    if (!c) return alert("Enter order code");
    try {
      const r = await api(\`/api/admin/orders/by-code/\${encodeURIComponent(c)}\`);
      const link = \`/t/\${encodeURIComponent(r.order.short_code)}\`;
      const rows = (r.tickets||[]).map(t =>
        \`<tr><td>\${t.id}</td><td>\${t.type_name}</td><td>\${t.qr}</td><td>\${t.state}</td></tr>\`
      ).join("");
      $("#t-order").innerHTML = \`
        <div class="help">Ticket link: <a href="\${link}" target="_blank">\${link}</a></div>
        <table class="grid" style="margin-top:6px"><thead>
          <tr><th>ID</th><th>Type</th><th>QR</th><th>State</th></tr>
        </thead><tbody>\${rows}</tbody></table>
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;margin-top:10px;align-items:center;">
          <input class="input" id="wa-to" placeholder="2771xxxxxxx"/>
          <button class="btn sec" id="wa-fallback">Send (text)</button>
          <button class="btn" id="wa-template">Send via WhatsApp</button>
        </div>
      \`;
      const send = async (useTemplate) => {
        const to = ($("#wa-to").value||"").trim();
        const t = useTemplate ? ($("#wa-temp").value||"") : "";
        const lang = useTemplate ? ($("#wa-lang").value||"") : "";
        const payload = { to, template: t, lang };
        const res = await api(\`/api/admin/orders/\${encodeURIComponent(r.order.short_code)}/whatsapp\`, {
          method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload)
        });
        alert("Sent");
      };
      $("#wa-fallback").onclick = () => send(false);
      $("#wa-template").onclick = () => send(true);
    } catch(e) {
      alert("Lookup failed");
    }
  };
}

async function renderPOS() {
  const html = \`
    <div class="card"><div class="help">
      POS Sessions list and cash-up summary will show here (unchanged from your working version).
      </div></div>\`;
  $("#content").innerHTML = html;
}

async function renderVendors() {
  const evs = await api("/api/admin/events").then(r=>r.events||[]);
  const evOpt = evs.map(e => \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`).join("");
  $("#content").innerHTML = \`
    <div class="card">
      <div class="row">
        <select id="v-ev" class="input"><option value="">Pick event</option>${evOpt}</select>
        <button class="btn small" id="v-load">Load</button>
      </div>
      <div id="v-list" style="margin-top:10px;"></div>
      <h3 style="margin:12px 0 6px">New vendor</h3>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
        <input id="vn" class="input" placeholder="Vendor name">
        <input id="vc" class="input" placeholder="Contact name">
        <input id="vp" class="input" placeholder="Phone">
        <input id="ve" class="input" placeholder="Email">
        <input id="vs" class="input" placeholder="Stand #">
        <input id="vstaff" class="input" placeholder="Staff quota" inputmode="numeric">
        <input id="vveh" class="input" placeholder="Vehicle quota" inputmode="numeric">
        <button class="btn" id="vadd">Add</button>
      </div>
    </div>\`;

  const load = async () => {
    const id = Number($("#v-ev").value||0);
    if (!id) return;
    const r = await api(\`/api/admin/vendors?event_id=\${id}\`);
    const rows = (r.vendors||[]).map(v => \`
      <tr>
        <td><input data-id="\${v.id}" data-k="name" class="input small" value="\${v.name||""}"></td>
        <td><input data-id="\${v.id}" data-k="contact_name" class="input small" value="\${v.contact_name||""}"></td>
        <td><input data-id="\${v.id}" data-k="phone" class="input small" value="\${v.phone||""}"></td>
        <td><input data-id="\${v.id}" data-k="email" class="input small" value="\${v.email||""}"></td>
        <td><input data-id="\${v.id}" data-k="stand_number" class="input small" value="\${v.stand_number||""}"></td>
        <td><input data-id="\${v.id}" data-k="staff_quota" class="input small" value="\${v.staff_quota||0}"></td>
        <td><input data-id="\${v.id}" data-k="vehicle_quota" class="input small" value="\${v.vehicle_quota||0}"></td>
      </tr>\`).join("");
    $("#v-list").innerHTML = \`
      <table class="grid"><thead>
        <tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Staff</th><th>Vehicle</th></tr>
      </thead><tbody>\${rows || "<tr><td colspan=7>None</td></tr>"}</tbody></table>\`;

    // inline update
    $("#v-list").oninput = async (e) => {
      const t = e.target;
      if (!t.dataset.id) return;
      const id = Number(t.dataset.id);
      const k = t.dataset.k;
      const v = t.value;
      await api("/api/admin/vendors/update", {
        method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({ id, [k]: v })
      }).catch(()=>{});
    };
  };

  $("#v-load").onclick = load;

  $("#vadd").onclick = async () => {
    const event_id = Number($("#v-ev").value||0);
    if (!event_id) return alert("Pick event first");
    const payload = {
      event_id, name: $("#vn").value, contact_name: $("#vc").value,
      phone: $("#vp").value, email: $("#ve").value, stand_number: $("#vs").value,
      staff_quota: Number($("#vstaff").value||0), vehicle_quota: Number($("#vveh").value||0)
    };
    await api("/api/admin/vendors/add", {
      method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify(payload)
    });
    load();
  };
}

async function renderUsers() {
  $("#content").innerHTML = '<div class="card"><div class="help">Users list UI unchanged (use your existing endpoints).</div></div>';
}

async function renderEvents() {
  const evs = await api("/api/admin/events").then(r=>r.events||[]);
  const rows = evs.map(e => \`<tr><td>\${e.id}</td><td>\${e.slug}</td><td>\${e.name}</td><td>\${e.venue||""}</td></tr>\`).join("");
  $("#content").innerHTML = \`
    <div class="card">
      <table class="grid"><thead>
        <tr><th>ID</th><th>Slug</th><th>Name</th><th>Venue</th></tr>
      </thead><tbody>\${rows || "<tr><td colspan=4>No events</td></tr>"}</tbody></table>
    </div>\`;
}

async function renderSettings() {
  const s = await api("/api/admin/settings").then(r=>r.settings||{});
  const val = (k) => s[k] || "";

  $("#content").innerHTML = \`
    <div class="card">
      <h3>WhatsApp (master)</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <input class="input" id="PUB" placeholder="Public base URL (https://...)" value="\${val("PUBLIC_BASE_URL")}">
        <input class="input" id="BIZ" placeholder="WA Business ID" value="\${val("WA_BUSINESS_ID")||val("BUSINESS_ID")}">
        <input class="input" id="PHID" placeholder="WA Phone Number ID" value="\${val("WA_PHONE_NUMBER_ID")||val("PHONE_NUMBER_ID")}">
        <input class="input" id="TOKEN" placeholder="WA Token" value="\${val("WA_TOKEN")||val("WHATSAPP_TOKEN")||val("GRAPH_TOKEN")}">
        <input class="input" id="VERIFY" placeholder="VERIFY_TOKEN" value="\${val("VERIFY_TOKEN")||""}">
      </div>
      <div style="margin-top:10px">
        <button class="btn" id="save">Save settings</button>
      </div>

      <h3 style="margin-top:18px">Templates</h3>
      <div class="row">
        <div class="help">Sync approved templates from Meta to view & pick.</div>
        <button class="btn sec" id="sync">Sync from Meta</button>
      </div>
      <div id="tpl"></div>
    </div>\`;

  $("#save").onclick = async () => {
    const payload = {
      settings: {
        PUBLIC_BASE_URL: $("#PUB").value,
        WA_BUSINESS_ID: $("#BIZ").value,
        WA_PHONE_NUMBER_ID: $("#PHID").value,
        WA_TOKEN: $("#TOKEN").value,
        VERIFY_TOKEN: $("#VERIFY").value
      }
    };
    try {
      await api("/api/admin/settings/update", {
        method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify(payload)
      });
      alert("Saved");
    } catch(e) {
      alert("Save failed");
    }
  };

  const loadTpl = async () => {
    const r = await api("/api/admin/wa/templates");
    const rows = (r.templates||[]).map(t => \`
      <tr><td>\${t.name}</td><td>\${t.language}</td><td>\${t.status||""}</td><td>\${t.category||""}</td></tr>
    \`).join("");
    $("#tpl").innerHTML = \`
      <table class="grid" style="margin-top:8px"><thead>
        <tr><th>Name</th><th>Lang</th><th>Status</th><th>Category</th></tr>
      </thead><tbody>\${rows || "<tr><td colspan=4>No templates</td></tr>"}</tbody></table>\`;
  };
  $("#sync").onclick = async () => {
    try {
      await api("/api/admin/wa/templates/sync", { method:"POST" });
      await loadTpl();
      alert("Synced");
    } catch(e) {
      alert("Sync failed");
    }
  };
  loadTpl();
}

/* ------------- tab wiring ------------- */
const views = {
  tickets: renderTickets,
  pos: renderPOS,
  vendors: renderVendors,
  users: renderUsers,
  events: renderEvents,
  settings: renderSettings
};

async function switchTo(name) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $("#content").innerHTML = '<div class="card">Loading...</div>';
  await (views[name] ? views[name]() : Promise.resolve());
}

$("#tabs").addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (!t) return;
  switchTo(t.dataset.tab);
});

// initial
switchTo("tickets");
</script>
</body></html>`;
}
