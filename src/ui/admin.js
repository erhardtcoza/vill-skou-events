// /src/ui/admin.js
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
  th,td{padding:8px;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:top}
  .muted{color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
  .tile{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}
  .tile b{display:block;font-size:22px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .btn{padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer}
  .btn.primary{background:var(--green);color:#fff;border-color:var(--green)}
  input,select{padding:10px;border:1px solid #d1d5db;border-radius:10px}
  .right{display:flex;gap:8px;align-items:center;margin-left:auto}
  dialog{border:none;border-radius:14px;max-width:800px;width:92vw;padding:0;box-shadow:0 20px 40px rgba(0,0,0,.2)}
  dialog .hd{padding:14px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
  dialog .bd{padding:14px 16px;max-height:70vh;overflow:auto}
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

  <!-- Site settings placeholder -->
  <section class="panel" data-sec="site">
    <h2>Site Settings</h2>
    <p class="muted">Your existing settings UI stays here.</p>
  </section>

  <!-- Events placeholder -->
  <section class="panel" data-sec="events" style="display:none">
    <h2>Events</h2>
    <p class="muted">Event management UI here (create/edit, ticket types, gates, images).</p>
  </section>

  <!-- POS Admin Dashboard -->
  <section class="panel" data-sec="posadmin" style="display:none">
    <div class="row" style="justify-content:space-between">
      <h2>POS Admin Dashboard</h2>
      <div class="right">
        <select id="paEvent"><option value="0">All events</option></select>
        <input type="datetime-local" id="paFrom">
        <input type="datetime-local" id="paTo">
        <label class="row"><input type="checkbox" id="paOnline"> Include online</label>
        <button class="btn" id="paApply">Apply</button>
        <a class="btn" id="paCSV" target="_blank">Export CSV</a>
      </div>
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

    <h3>Orders</h3>
    <div class="panel" style="padding:0">
      <div class="row" style="padding:10px">
        <label>Source
          <select id="paSrc">
            <option value="pos">POS only</option>
            <option value="online">Online only</option>
            <option value="all">POS + Online</option>
          </select>
        </label>
        <button class="btn" id="paLoadOrders">Load Orders</button>
        <a class="btn" id="paOrdersCSV" target="_blank">Orders CSV</a>
      </div>
      <table id="paOrders"><thead>
        <tr><th>#</th><th>Event</th><th>Source</th><th>Method</th><th>Total</th><th>Buyer</th><th>Phone</th><th>Paid At</th></tr>
      </thead><tbody></tbody></table>
    </div>
  </section>

  <!-- Visitors placeholder -->
  <section class="panel" data-sec="visitors" style="display:none">
    <h2>Visitors (live)</h2>
    <p class="muted">Coming soon — live gate view, IN/OUT flow, dwell times.</p>
  </section>
</div>

<!-- Drilldown modal -->
<dialog id="dlg">
  <div class="hd">
    <div id="dlgTitle"><strong>Details</strong></div>
    <button class="btn" onclick="document.getElementById('dlg').close()">Close</button>
  </div>
  <div class="bd" id="dlgBody">Loading…</div>
</dialog>

<script>
const Z = (id)=>document.getElementById(id);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));
function moneyR(c){ return "R "+(Number(c||0)/100).toFixed(2); }
function ts2(dt){ if(!dt) return '—'; const d=new Date(dt*1000); return d.toLocaleString(); }
function toUnix(s){ if(!s) return 0; const d=new Date(s); return Math.floor(d.getTime()/1000); }

function switchTab(name){
  $$(".tab").forEach(t=>t.classList.toggle("active", t.dataset.tab===name));
  $$("section[data-sec]").forEach(s=>s.style.display = (s.dataset.sec===name ? "" : "none"));
  localStorage.setItem("admin_tab", name);
  if (name==="posadmin") loadPOSSummary(true);
}
$$(".tab").forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
switchTab(localStorage.getItem("admin_tab") || "site");

/* -------- Filters wiring -------- */
async function loadEventsForFilter(){
  const res = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if (res.ok){
    Z('paEvent').innerHTML = '<option value="0">All events</option>' + (res.events||[]).map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  }
}
loadEventsForFilter();

function currentFilter(){
  const event_id = Number(Z('paEvent').value||0);
  const from = toUnix(Z('paFrom').value);
  const to = toUnix(Z('paTo').value);
  const include_online = Z('paOnline').checked;
  return { event_id, from, to, include_online };
}
Z('paApply').onclick = ()=>loadPOSSummary(true);

/* -------- POS Admin Summary (auto-refresh) -------- */
let _timer = null;
async function loadPOSSummary(resetTimer){
  if (resetTimer){ clearInterval(_timer); }
  await refreshPOS();
  if (resetTimer){ _timer = setInterval(refreshPOS, 30000); }
}
async function refreshPOS(){
  const f = currentFilter();
  const qs = new URLSearchParams({
    event_id: String(f.event_id||0),
    from: String(f.from||0),
    to: String(f.to||0),
    include_online: f.include_online ? "1":"0"
  });
  const res = await fetch('/api/admin/pos/summary?'+qs.toString()).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok) return;

  Z('paCash').textContent = moneyR(res.payments.cash_cents);
  Z('paCard').textContent = moneyR(res.payments.card_cents);
  Z('paAll').textContent  = moneyR(res.payments.total_cents);
  Z('paWhen').textContent = new Date(res.updated_at*1000).toLocaleTimeString();

  // Cashups table (clickable)
  const ctb = Z('paCashups').querySelector('tbody');
  ctb.innerHTML = (res.cashups||[]).map(c=>`
    <tr data-cashup="${c.id}" class="click">
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
  // wire clicks
  Array.from(ctb.querySelectorAll('tr[data-cashup]')).forEach(tr=>{
    tr.style.cursor='pointer';
    tr.onclick = ()=> openCashup(tr.dataset.cashup);
  });

  // Ticket types table
  const ttb = Z('paTT').querySelector('tbody');
  ttb.innerHTML = (res.by_ticket_type||[]).map(t=>`
    <tr>
      <td>${t.event_name||('Event #'+t.event_id)}</td>
      <td>${t.name||('Type #'+t.ticket_type_id)}</td>
      <td>${t.sold_qty||0}</td>
      <td>${moneyR(t.revenue_cents||0)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">No tickets issued</td></tr>';

  // Scans
  const stb = Z('paScans').querySelector('tbody');
  stb.innerHTML = (res.scans||[]).map(s=>`
    <tr>
      <td>${s.name||('Event #'+s.event_id)}</td>
      <td>${s.in||0}</td>
      <td>${s.out||0}</td>
      <td>${s.inside||0}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">No scans yet</td></tr>';

  // CSV links (summary orders)
  Z('paCSV').href = '/api/admin/pos/export.csv';
  updateOrdersLinks(); // refresh orders CSV link also
}

/* -------- Orders table (filtered) -------- */
Z('paLoadOrders').onclick = loadOrders;
function updateOrdersLinks(){
  const f = currentFilter();
  const source = Z('paSrc').value;
  const qs = new URLSearchParams({
    event_id: String(f.event_id||0),
    from: String(f.from||0),
    to: String(f.to||0),
    source
  });
  Z('paOrdersCSV').href = '/api/admin/pos/orders.csv?'+qs.toString();
}
Z('paSrc').onchange = updateOrdersLinks;

async function loadOrders(){
  const f = currentFilter();
  const source = Z('paSrc').value;
  const qs = new URLSearchParams({
    event_id: String(f.event_id||0),
    from: String(f.from||0),
    to: String(f.to||0),
    source
  });
  const res = await fetch('/api/admin/pos/orders?'+qs.toString()).then(r=>r.json()).catch(()=>({ok:false}));
  const tb = Z('paOrders').querySelector('tbody');
  if (!res.ok){ tb.innerHTML = '<tr><td colspan="8" class="muted">Could not load</td></tr>'; return; }
  tb.innerHTML = (res.orders||[]).map(o=>`
    <tr>
      <td>${o.id}</td>
      <td>${o.event_name||('Event #'+o.event_id)}</td>
      <td>${o.source}</td>
      <td>${o.payment_method||''}</td>
      <td>${moneyR(o.total_cents||0)}</td>
      <td>${o.buyer_name||''}</td>
      <td>${o.buyer_phone||''}</td>
      <td>${o.paid_at? new Date(o.paid_at*1000).toLocaleString():'—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="muted">No orders</td></tr>';
  updateOrdersLinks();
}

/* -------- Cashup drill-down modal -------- */
async function openCashup(id){
  Z('dlgTitle').innerHTML = '<strong>Cashup #'+id+'</strong>';
  Z('dlgBody').textContent = 'Loading…';
  Z('dlg').showModal();
  const res = await fetch('/api/admin/pos/cashups/'+id).then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){ Z('dlgBody').textContent='Could not load'; return; }

  const c = res.cashup;
  const orders = res.orders||[];
  const br = res.breakdown||[];

  const body = `
    <div class="grid" style="margin-bottom:12px">
      <div class="tile"><small>Cashier</small><b>${c.cashier_name||''}</b></div>
      <div class="tile"><small>Gate</small><b>${c.gate_name||''}</b></div>
      <div class="tile"><small>Opened</small><b>${c.opened_at? new Date(c.opened_at*1000).toLocaleString() : '—'}</b></div>
      <div class="tile"><small>Closed</small><b>${c.closed_at? new Date(c.closed_at*1000).toLocaleString() : 'Open'}</b></div>
      <div class="tile"><small>Cash</small><b>${moneyR(c.total_cash_cents)}</b></div>
      <div class="tile"><small>Card</small><b>${moneyR(c.total_card_cents)}</b></div>
      <div class="tile"><small>Opening Float</small><b>${moneyR(c.opening_float_cents)}</b></div>
    </div>

    <h4>Ticket Breakdown</h4>
    <table><thead><tr><th>Event</th><th>Type</th><th>Qty</th><th>Revenue</th></tr></thead>
      <tbody>
        ${br.map(x=>`<tr><td>${x.event_name||''}</td><td>${x.ticket_type||''}</td><td>${x.qty||0}</td><td>${moneyR(x.revenue_cents||0)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No tickets in this window</td></tr>'}
      </tbody>
    </table>

    <h4 style="margin-top:12px">Orders (${orders.length})</h4>
    <table><thead><tr><th>#</th><th>Event</th><th>Buyer</th><th>Phone</th><th>Method</th><th>Total</th><th>Paid</th></tr></thead>
      <tbody>
        ${orders.map(o=>`<tr>
            <td>${o.id}</td><td>${o.event_id}</td><td>${o.buyer_name||''}</td>
            <td>${o.buyer_phone||''}</td><td>${o.payment_method||''}</td>
            <td>${moneyR(o.total_cents||0)}</td><td>${o.paid_at? new Date(o.paid_at*1000).toLocaleString():'—'}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">No orders in this window</td></tr>'}
      </tbody>
    </table>
  `;
  Z('dlgBody').innerHTML = body;
}
</script>
</body></html>`;