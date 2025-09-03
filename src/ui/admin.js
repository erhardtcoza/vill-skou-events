// /src/ui/admin.js
import { htmlPage } from "./_shared.js"; // if you don't have this, replace with a tiny wrapper below
// Fallback (remove this block if you already have htmlPage helper elsewhere)
function _wrap(title, body) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<style>
  :root { --vs-green:#1b7a2a; }
  header h1 { margin: 0 0 .5rem 0; }
  .tabs { display:flex; gap:.5rem; margin:.75rem 0 1rem; flex-wrap: wrap; }
  .tab { padding:.4rem .7rem; border-radius:999px; background:#eef2ee; cursor:pointer; border:1px solid #dfe7e0; }
  .tab.active { background:var(--vs-green); color:#fff; border-color:var(--vs-green); }
  .section { display:none; }
  .section.active { display:block; }
  .muted { color:#777; }
  .row { display:flex; gap:.75rem; align-items:center; }
  .row > * { flex:1; }
  table thead th { white-space: nowrap; }
  .chip { display:inline-block; padding:.15rem .5rem; border-radius:999px; background:#eef2ee; border:1px solid #dfe7e0; font-size:.85rem;}
  dialog { width:min(900px, 96vw); }
  .right { text-align:right; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  .danger { color:#b00020 }
  .ok { color:#1b7a2a }
  .card { border:1px solid #e6e6e6; border-radius:8px; padding:12px; }
  .grid { display:grid; gap:12px; grid-template-columns: repeat(12, 1fr); }
  .col-6 { grid-column: span 6; }
  .col-12 { grid-column: span 12; }
  @media (max-width: 900px){ .col-6 { grid-column: span 12; } }
</style>
</head>
<body>
<main class="container">
<header class="row" style="align-items:baseline; gap:1rem;">
  <h1>Admin</h1>
  <small id="adminUser" class="muted"></small>
  <span style="flex:1"></span>
  <a href="/api/auth/logout" role="button" class="secondary">Sign out</a>
</header>
<nav class="tabs">
  <button data-tab="events" class="tab active">Events</button>
  <button data-tab="pos" class="tab">POS Admin</button>
  <button data-tab="settings" class="tab">Site settings</button>
  <button data-tab="vendors" class="tab">Vendors</button>
  <button data-tab="whatsapp" class="tab">WhatsApp</button>
</nav>

<section id="sec-events" class="section active">
  <article class="card">
    <header class="row">
      <h3 style="margin:0;">Events</h3>
      <span style="flex:1"></span>
      <button id="btnNewEvent" class="secondary">Create event</button>
    </header>
    <div style="overflow:auto;">
      <table id="tblEvents">
        <thead><tr>
          <th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </article>

  <!-- Edit Event dialog -->
  <dialog id="dlgEvent">
    <article>
      <header class="row">
        <h3 id="evTitle" style="margin:0;">Edit event</h3>
        <span style="flex:1"></span>
        <button class="secondary" onclick="document.getElementById('dlgEvent').close()">Close</button>
      </header>

      <div id="evMeta" class="grid">
        <div class="col-6">
          <label>Slug <input id="evSlug" type="text" disabled></label>
        </div>
        <div class="col-6">
          <label>Name <input id="evName" type="text"></label>
        </div>
        <div class="col-6">
          <label>Venue <input id="evVenue" type="text"></label>
        </div>
        <div class="col-3">
          <label>Starts <input id="evStart" type="date"></label>
        </div>
        <div class="col-3">
          <label>Ends <input id="evEnd" type="date"></label>
        </div>
      </div>

      <details style="margin-top:12px;">
        <summary><strong>Tickets</strong></summary>
        <div id="ticketsBox" class="grid" style="margin-top:8px;">
          <div class="col-12" id="ticketsTableWrap"></div>
          <div class="col-12 card">
            <form id="frmAddTicket" class="row">
              <input type="text" id="tName" placeholder="Ticket name">
              <input type="number" id="tPrice" placeholder="Price (R)" min="0" step="1">
              <label class="row" style="flex:0 0 auto;gap:.35rem;">
                <input type="checkbox" id="tGender"> <span style="white-space:nowrap;">Requires gender</span>
              </label>
              <button type="submit">Add</button>
            </form>
          </div>
        </div>
      </details>

      <details style="margin-top:12px;">
        <summary><strong>Gates</strong></summary>
        <div class="grid" style="margin-top:8px;">
          <div class="col-12" id="gatesList"></div>
          <form id="frmAddGate" class="row">
            <input id="gateName" type="text" placeholder="New gate name">
            <button type="submit" class="secondary">Add gate</button>
          </form>
        </div>
      </details>

      <footer class="row" style="margin-top:12px;">
        <button id="btnSaveEvent">Save</button>
        <button id="btnDeleteEvent" class="secondary">Delete</button>
        <span style="flex:1"></span>
        <small id="evMsg" class="muted"></small>
      </footer>
    </article>
  </dialog>

  <!-- Create Event dialog -->
  <dialog id="dlgCreate">
    <article>
      <header class="row">
        <h3 style="margin:0;">Create event</h3>
        <span style="flex:1"></span>
        <button class="secondary" onclick="document.getElementById('dlgCreate').close()">Close</button>
      </header>
      <form id="frmCreate" class="grid">
        <div class="col-6"><label>Slug <input required name="slug" placeholder="skou-2025"></label></div>
        <div class="col-6"><label>Name <input required name="name" placeholder="Villiersdorp Skou 2025"></label></div>
        <div class="col-6"><label>Venue <input required name="venue" placeholder="Villiersdorp Skougronde"></label></div>
        <div class="col-3"><label>Starts <input required type="date" name="starts"></label></div>
        <div class="col-3"><label>Ends <input required type="date" name="ends"></label></div>
        <div class="col-12 right">
          <button type="submit">Create</button>
        </div>
      </form>
      <small id="createMsg" class="muted"></small>
    </article>
  </dialog>
</section>

<section id="sec-pos" class="section">
  <article class="card">
    <header class="row"><h3 style="margin:0;">POS Admin</h3></header>
    <div class="row">
      <select id="posEvent"></select>
      <input id="posFrom" type="date">
      <input id="posTo" type="date">
      <button id="btnLoadCashups" class="secondary">Reload</button>
    </div>
    <div id="posSummary" class="grid" style="margin-top:10px;">
      <div class="col-6 card"><strong>Totals</strong>
        <div id="posTotals" class="mono"></div>
      </div>
      <div class="col-6 card"><strong>By Cashier</strong>
        <div id="posByCashier"></div>
      </div>
      <div class="col-12" style="overflow:auto; margin-top:8px;">
        <table id="tblSessions">
          <thead><tr>
            <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th>
            <th class="right">Float</th><th class="right">Cash</th><th class="right">Card</th><th class="right">Total</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </article>
</section>

<section id="sec-settings" class="section">
  <article class="card">
    <header class="row"><h3 style="margin:0;">Site settings</h3></header>
    <form id="frmSettings" class="grid">
      <div class="col-6"><label>Site name <input id="setName" placeholder="Villiersdorp Skou Tickets"></label></div>
      <div class="col-6"><label>Logo URL <input id="setLogo" placeholder="https://..."></label></div>
      <div class="col-12"><label>Banner URL <input id="setBanner" placeholder="https://..."></label></div>
      <div class="col-12 right"><button id="btnSaveSettings">Save</button></div>
    </form>
    <small class="muted">Settings are stored in KV.</small>
  </article>
</section>

<section id="sec-vendors" class="section">
  <article class="card">
    <header class="row"><h3 style="margin:0;">Vendors</h3></header>
    <p class="muted">Phase 1 placeholder. We’ll list vendors here and print badges/QRs.</p>
  </article>
</section>

<section id="sec-whatsapp" class="section">
  <article class="card">
    <header class="row"><h3 style="margin:0;">WhatsApp</h3></header>
    <div id="waDebug" class="mono muted">Loading…</div>
    <form id="waSend" class="row" style="margin-top:8px;">
      <input id="waTo" type="tel" placeholder="27…">
      <button type="submit">Send hello_world</button>
    </form>
    <small id="waMsg" class="muted"></small>
  </article>
</section>

<footer style="margin:2rem 0;"></footer>
</main>

<script>
(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const fmtR = cents => "R" + (Number(cents||0)/100).toFixed(2);

  // Tabs
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.tab;
      $$(".section").forEach(s => s.classList.remove("active"));
      $("#sec-"+key).classList.add("active");
      if (key === "pos") loadPosBootstrap();
      if (key === "events") loadEvents();
      if (key === "whatsapp") loadWADebug();
    });
  });

  // ---------- Events ----------
  async function loadEvents() {
    try {
      const r = await fetch("/api/admin/events");
      if (!r.ok) throw new Error(await r.text());
      const { events=[] } = await r.json();
      const tb = $("#tblEvents tbody");
      tb.innerHTML = "";
      for (const e of events) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>"+e.id+"</td>",
          "<td class='mono'>"+e.slug+"</td>",
          "<td>"+(e.name||"")+"</td>",
          "<td>"+(e.starts_at || "").slice(0,10)+"</td>",
          "<td>"+(e.ends_at || "").slice(0,10)+"</td>",
          "<td>"+(e.status||"")+"</td>",
          "<td class='right'><button class='secondary' data-id='"+e.id+"'>Edit</button></td>"
        ].join("");
        tb.appendChild(tr);
      }
      tb.querySelectorAll("button[data-id]").forEach(b=>{
        b.addEventListener("click", () => openEvent(Number(b.dataset.id)));
      });
    } catch (e) {
      $("#tblEvents tbody").innerHTML =
        "<tr><td colspan='7' class='danger'>Error: "+String(e)+"</td></tr>";
    }
  }

  $("#btnNewEvent").addEventListener("click", ()=> $("#dlgCreate").showModal());

  $("#frmCreate").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = {
      slug: fd.get("slug"),
      name: fd.get("name"),
      venue: fd.get("venue"),
      starts_at: fd.get("starts"),
      ends_at: fd.get("ends")
    };
    const r = await fetch("/api/admin/events", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
    if (r.ok) {
      $("#createMsg").textContent = "Created.";
      await loadEvents();
      $("#dlgCreate").close();
      ev.target.reset();
    } else {
      $("#createMsg").textContent = "Error: " + await r.text();
    }
  });

  let CURR = { id:0, details:null, tickets:[], gates:[] };

  async function openEvent(id) {
    CURR = { id, details:null, tickets:[], gates:[] };
    $("#evMsg").textContent = "";
    $("#ticketsTableWrap").innerHTML = "Loading tickets…";
    $("#gatesList").innerHTML = "Loading gates…";
    $("#dlgEvent").showModal();
    // details
    const d = await (await fetch("/api/admin/events/"+id)).json();
    CURR.details = d.event;
    $("#evTitle").textContent = d.event?.name || "Edit event";
    $("#evSlug").value = d.event?.slug || "";
    $("#evName").value = d.event?.name || "";
    $("#evVenue").value = d.event?.venue || "";
    $("#evStart").value = (d.event?.starts_at||"").slice(0,10);
    $("#evEnd").value = (d.event?.ends_at||"").slice(0,10);

    // tickets
    const tt = await (await fetch("/api/admin/events/"+id+"/ticket-types")).json();
    CURR.tickets = tt.ticket_types || [];
    renderTickets();

    // gates
    const gs = await (await fetch("/api/admin/events/"+id+"/gates")).json().catch(()=>({gates:[]}));
    CURR.gates = gs.gates || [];
    renderGates();
  }

  function renderTickets() {
    const list = CURR.tickets;
    let html = "<table><thead><tr><th>ID</th><th>Name</th><th class='right'>Price</th><th>Req. gender</th><th></th></tr></thead><tbody>";
    if (!list.length) html += "<tr><td colspan='5' class='muted'>No tickets yet.</td></tr>";
    for (const t of list) {
      html += "<tr>"
           + "<td>"+t.id+"</td>"
           + "<td>"+t.name+"</td>"
           + "<td class='right'>"+fmtR(t.price_cents||0)+"</td>"
           + "<td>"+(t.requires_gender ? "Yes":"No")+"</td>"
           + "<td class='right'><button class='secondary' data-del='"+t.id+"'>Delete</button></td>"
           + "</tr>";
    }
    html += "</tbody></table>";
    $("#ticketsTableWrap").innerHTML = html;
    // delete handlers
    $("#ticketsTableWrap").querySelectorAll("button[data-del]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        const id = Number(b.dataset.del);
        if (!confirm("Delete ticket type "+id+"?")) return;
        const r = await fetch("/api/admin/ticket-types/"+id, { method:"DELETE" });
        if (r.ok) {
          CURR.tickets = CURR.tickets.filter(x=>x.id!==id);
          renderTickets();
        } else {
          alert("Error: "+await r.text());
        }
      });
    });
  }

  $("#frmAddTicket").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const name = $("#tName").value.trim();
    const price = Math.round(Number($("#tPrice").value || 0) * 100);
    const reqG = $("#tGender").checked ? 1 : 0;
    if (!name) { alert("Ticket name required"); return; }
    const r = await fetch(`/api/admin/events/${CURR.id}/ticket-types`, {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ name, price_cents: price, requires_gender: reqG })
    });
    if (r.ok) {
      const t = await r.json();
      CURR.tickets.push(t.ticket_type);
      $("#tName").value = ""; $("#tPrice").value = ""; $("#tGender").checked = false;
      renderTickets();
    } else {
      alert("Error: "+await r.text());
    }
  });

  function renderGates() {
    const wrap = $("#gatesList");
    if (!CURR.gates.length) {
      wrap.innerHTML = "<p class='muted'>No gates yet.</p>";
      return;
    }
    const ul = document.createElement("ul");
    CURR.gates.forEach(g=>{
      const li = document.createElement("li");
      li.innerHTML = "<span class='chip'>"+g.name+"</span> ";
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "secondary";
      del.addEventListener("click", async ()=>{
        if (!confirm("Delete gate '"+g.name+"'?")) return;
        const r = await fetch("/api/admin/gates/"+g.id, { method:"DELETE" });
        if (r.ok) {
          CURR.gates = CURR.gates.filter(x=>x.id!==g.id);
          renderGates();
        } else alert("Error: "+await r.text());
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    wrap.innerHTML = "";
    wrap.appendChild(ul);
  }

  $("#frmAddGate").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const name = $("#gateName").value.trim();
    if (!name) return;
    const r = await fetch(`/api/admin/events/${CURR.id}/gates`, {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ name })
    });
    if (r.ok) {
      const g = await r.json();
      CURR.gates.push(g.gate);
      $("#gateName").value = "";
      renderGates();
    } else alert("Error: "+await r.text());
  });

  $("#btnSaveEvent").addEventListener("click", async ()=>{
    const body = {
      name: $("#evName").value.trim(),
      venue: $("#evVenue").value.trim(),
      starts_at: $("#evStart").value,
      ends_at: $("#evEnd").value
    };
    const r = await fetch("/api/admin/events/"+CURR.id, {
      method:"PUT", headers:{ "content-type":"application/json" }, body: JSON.stringify(body)
    });
    $("#evMsg").textContent = r.ok ? "Saved." : ("Error: " + await r.text());
    if (r.ok) loadEvents();
  });

  $("#btnDeleteEvent").addEventListener("click", async ()=>{
    if (!confirm("Delete this event?")) return;
    const r = await fetch("/api/admin/events/"+CURR.id, { method:"DELETE" });
    if (r.ok) { $("#dlgEvent").close(); loadEvents(); }
    else alert("Error: "+await r.text());
  });

  // ---------- POS Admin ----------
  async function loadPosBootstrap() {
    // events for filter select
    const r = await fetch("/api/admin/events");
    const { events=[] } = await r.json();
    const sel = $("#posEvent");
    sel.innerHTML = events.map(e => `<option value="${e.id}">${e.name} (${e.slug})</option>`).join("");
    // default date range: event dates (or today)
    if (events.length) {
      $("#posFrom").value = (events[0].starts_at||"").slice(0,10);
      $("#posTo").value = (events[0].ends_at||"").slice(0,10);
    } else {
      const today = new Date().toISOString().slice(0,10);
      $("#posFrom").value = today; $("#posTo").value = today;
    }
    await reloadCashups();
  }

  $("#btnLoadCashups").addEventListener("click", reloadCashups);

  async function reloadCashups() {
    const evId = Number($("#posEvent").value || 0);
    const qs = new URLSearchParams({
      event_id: String(evId),
      from: $("#posFrom").value,
      to: $("#posTo").value
    });
    const r = await fetch("/api/admin/pos/cashups?"+qs);
    if (!r.ok) { $("#posTotals").textContent = "Error"; return; }
    const d = await r.json();
    $("#posTotals").textContent =
      "Cash " + fmtR(d.total_cash_cents||0) + "  ·  Card " + fmtR(d.total_card_cents||0) +
      "  ·  Orders " + (d.order_count || 0);
    // by cashier
    const bc = d.by_cashier || [];
    $("#posByCashier").innerHTML = bc.length
      ? ("<ul>"+ bc.map(x => `<li>${x.cashier_name} — <span class="mono">${fmtR(x.total_cents)}</span></li>`).join("") +"</ul>")
      : "<p class='muted'>No sessions</p>";
    // list sessions
    const tb = $("#tblSessions tbody"); tb.innerHTML = "";
    (d.sessions || []).forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>"+s.id+"</td>",
        "<td>"+s.cashier_name+"</td>",
        "<td>"+(s.gate_name||"")+"</td>",
        "<td>"+new Date((s.opened_at||0)*1000).toLocaleString()+"</td>",
        "<td>"+(s.closed_at? new Date(s.closed_at*1000).toLocaleString():"")+"</td>",
        "<td class='right'>"+fmtR(s.opening_float_cents||0)+"</td>",
        "<td class='right'>"+fmtR(s.cash_total_cents||0)+"</td>",
        "<td class='right'>"+fmtR(s.card_total_cents||0)+"</td>",
        "<td class='right'>"+fmtR((s.cash_total_cents||0)+(s.card_total_cents||0))+"</td>"
      ].join("");
      tb.appendChild(tr);
    });
  }

  // ---------- Settings ----------
  async function loadSettings() {
    try {
      const r = await fetch("/api/admin/settings");
      if (!r.ok) return;
      const s = await r.json();
      $("#setName").value = s.site_name || "";
      $("#setLogo").value = s.logo_url || "";
      $("#setBanner").value = s.banner_url || "";
    } catch {}
  }
  $("#btnSaveSettings").addEventListener("click", async (ev)=>{
    ev.preventDefault();
    const body = { site_name: $("#setName").value, logo_url: $("#setLogo").value, banner_url: $("#setBanner").value };
    const r = await fetch("/api/admin/settings", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
    alert(r.ok ? "Saved" : ("Error: "+await r.text()));
  });

  // ---------- WhatsApp ----------
  async function loadWADebug() {
    try {
      const r = await fetch("/api/whatsapp/debug");
      const d = await r.json();
      $("#waDebug").textContent = JSON.stringify(d, null, 2);
    } catch (e) {
      $("#waDebug").textContent = "Error: " + String(e);
    }
  }
  $("#waSend").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const to = $("#waTo").value.trim();
    if (!to) return;
    $("#waMsg").textContent = "Sending…";
    const r = await fetch("/api/whatsapp/send-test", {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ to, kind:"template", template:"hello_world", lang:"en_US" })
    });
    const d = await r.json();
    $("#waMsg").textContent = d.ok ? "Sent." : ("Error: " + (d.error || JSON.stringify(d)));
  });

  // boot
  loadEvents();
  loadSettings();
})();
</script>
</body></html>`;
}

export function adminHTML() {
  // use your existing htmlPage wrapper if present; otherwise _wrap
  return (typeof htmlPage === "function" ? htmlPage : _wrap)("Admin · Villiersdorp Skou", "");
}
