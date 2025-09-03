// /src/ui/admin.js (append/replace with the version below if easier)
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --bg:#f7f7f8; --muted:#6b7280 }
  body{font-family:system-ui;margin:0;background:var(--bg);color:#111}
  header{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 16px}
  .wrap{max-width:1200px;margin:0 auto;padding:16px}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px}
  .tab{padding:10px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;cursor:pointer}
  .tab.active{background:var(--green);color:#fff;border-color:var(--green)}
  .panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #f1f5f9;text-align:left}
  .muted{color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
  .tile{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}
  .tile b{display:block;font-size:22px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .btn{padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer}
  .btn.primary{background:var(--green);color:#fff;border-color:var(--green)}
</style>
</head><body>
<header><div class="wrap"><strong>Admin</strong></div></header>
<div class="wrap">

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab" data-tab="site">Site Settings</button>
    <button class="tab" data-tab="events">Events</button>
    <button class="tab" data-tab="posadmin">POS Admin</button>
    <button class="tab" data-tab="visitors">Visitors (live)</button>
  </div>

  <!-- Site settings (your existing content can live here) -->
  <section class="panel" data-sec="site">
    <h2>Site Settings</h2>
    <p class="muted">Your existing settings UI stays here.</p>
  </section>

  <!-- Events (your existing content can live here) -->
  <section class="panel" data-sec="events">
    <h2>Events</h2>
    <p class="muted">Event management UI here (create/edit, ticket types, gates, images).</p>
  </section>

  <!-- POS Admin Dashboard -->
  <section class="panel" data-sec="posadmin" style="display:none">
    <div class="row" style="justify-content:space-between">
      <h2>POS Admin Dashboard</h2>
      <a class="btn" href="/api/admin/pos/export.csv" target="_blank">Export CSV</a>
    </div>

    <div class="grid">
      <div class="tile"><small>Total Cash</small><b id="paCash">R 0.00</b></div>
      <div class="tile"><small>Total Card</small><b id="paCard">R 0.00</b></div>
      <div class="tile"><small>All Payments</small><b id="paAll">R 0.00</b></div>
      <div class="tile"><small>Last Update</small><b id="paWhen" class="muted">—</b></div>
    </div>

    <h3 style="margin-top:16px">Cashups</h3>
    <div class="panel" style="padding:0">
      <table id="paCashups"><thead>
        <tr><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Cash</th><th>Card</th><th>Total</th><th>Manager</th></tr>
      </thead><tbody></tbody></table>
    </div>

    <h3>Ticket Types (Issued)</h3>
    <div class="panel" style="padding:0">
      <table id="paTT"><thead>
        <tr><th>Event</th><th>Ticket Type</th><th>Sold</th><th>Revenue</th></tr>
      </thead><tbody></tbody></table>
    </div>

    <h3>Scans (Live)</h3>
    <div class="panel" style="padding:0">
      <table id="paScans"><thead>
        <tr><th>Event</th><th>IN</th><th>OUT</th><th>Inside</th></tr>
      </thead><tbody></tbody></table>
    </div>
  </section>

  <!-- Visitors placeholder -->
  <section class="panel" data-sec="visitors" style="display:none">
    <h2>Visitors (live)</h2>
    <p class="muted">Coming soon — live gate view, IN/OUT flow, dwell times.</p>
  </section>

</div>

<script>
const Z = (id)=>document.getElementById(id);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));
function moneyR(c){ return "R "+(Number(c||0)/100).toFixed(2); }
function ts2(dt){ if(!dt) return '—'; const d=new Date(dt*1000); return d.toLocaleString(); }

function switchTab(name){
  $$(".tab").forEach(t=>t.classList.toggle("active", t.dataset.tab===name));
  $$("section[data-sec]").forEach(s=>s.style.display = (s.dataset.sec===name ? "" : "none"));
  localStorage.setItem("admin_tab", name);
  if (name==="posadmin") loadPOSSummary();
}
$$(".tab").forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
switchTab(localStorage.getItem("admin_tab") || "site");

/* -------- POS Admin Summary -------- */
let _timer = null;
async function loadPOSSummary(){
  clearInterval(_timer);
  await refreshPOS();
  _timer = setInterval(refreshPOS, 30000);
}
async function refreshPOS(){
  const res = await fetch('/api/admin/pos/summary').then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok) return;
  // tiles
  Z('paCash').textContent = moneyR(res.payments.cash_cents);
  Z('paCard').textContent = moneyR(res.payments.card_cents);
  Z('paAll').textContent  = moneyR(res.payments.total_cents);
  Z('paWhen').textContent = new Date(res.updated_at*1000).toLocaleTimeString();

  // cashups
  const ctb = Z('paCashups').querySelector('tbody');
  ctb.innerHTML = (res.cashups||[]).map(c=>`
    <tr>
      <td>${c.cashier_name||''}</td>
      <td>${c.gate_name||''}</td>
      <td>${ts2(c.opened_at)}</td>
      <td>${c.closed_at?ts2(c.closed_at):'<span class="muted">open</span>'}</td>
      <td>${moneyR(c.total_cash_cents)}</td>
      <td>${moneyR(c.total_card_cents)}</td>
      <td>${moneyR(c.total_cents)}</td>
      <td>${c.manager_name||''}</td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="muted">No cashups yet</td></tr>';

  // ticket types
  const ttb = Z('paTT').querySelector('tbody');
  ttb.innerHTML = (res.by_ticket_type||[]).map(t=>`
    <tr>
      <td>${t.event_name||('Event #'+t.event_id)}</td>
      <td>${t.name||('Type #'+t.ticket_type_id)}</td>
      <td>${t.sold_qty||0}</td>
      <td>${moneyR(t.revenue_cents||0)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">No tickets issued</td></tr>';

  // scans
  const stb = Z('paScans').querySelector('tbody');
  stb.innerHTML = (res.scans||[]).map(s=>`
    <tr>
      <td>${s.name||('Event #'+s.event_id)}</td>
      <td>${s.in||0}</td>
      <td>${s.out||0}</td>
      <td>${s.inside||0}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">No scans yet</td></tr>';
}
</script>
</body></html>`;
