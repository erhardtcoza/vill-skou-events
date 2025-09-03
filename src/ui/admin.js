// /src/ui/admin.js
// Admin UI with tabs: Events, POS Admin, Tickets, Site settings, Users

export function adminHTML() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Admin · Villiersdorp Skou</title>
  <style>
    :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8 }
    *{ box-sizing:border-box }
    body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
    .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
    h1{ margin:0 0 10px }
    .tabs{ display:flex; gap:8px; margin-bottom:14px }
    .tab{ padding:8px 10px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
    .tab.active{ background:var(--green); color:#fff; border-color:transparent }

    .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px }
    .muted{ color:var(--muted) }
    .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center }
    input, select, button{ font:inherit }
    input, select{ padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; background:#fff }
    button{ padding:9px 12px; border:0; border-radius:8px; cursor:pointer; background:var(--green); color:#fff; font-weight:600 }
    table{ width:100%; border-collapse:collapse; }
    th, td{ text-align:left; padding:8px 10px; border-bottom:1px solid #f1f3f5 }
    th{ font-weight:700; color:#444; background:#fafafa }
    .right{ text-align:right }
    .chips{ display:flex; gap:8px; flex-wrap:wrap }
    .chip{ display:inline-block; padding:6px 10px; border:1px solid #e5e7eb; border-radius:999px; background:#fff; font-weight:600 }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Admin</h1>
    <div class="tabs">
      <button class="tab active" id="tab-events">Events</button>
      <button class="tab" id="tab-pos">POS Admin</button>
      <button class="tab" id="tab-tickets">Tickets</button>
      <button class="tab" id="tab-settings">Site settings</button>
      <button class="tab" id="tab-users">Users</button>
    </div>

    <div id="view-events"    class="card"></div>
    <div id="view-pos"       class="card" style="display:none"></div>
    <div id="view-tickets"   class="card" style="display:none"></div>
    <div id="view-settings"  class="card" style="display:none">Site settings …</div>
    <div id="view-users"     class="card" style="display:none">Users …</div>
  </div>

<script>
const $ = (id)=>document.getElementById(id);
const fmtR = c => 'R' + ( (c||0)/100 ).toFixed(2 );
const fmtTs = s => s ? new Date(s*1000).toLocaleString('af-ZA') : '';

/* ---------------- Tabs ---------------- */
function activate(tab){
  for(const id of ['events','pos','tickets','settings','users']){
    $('tab-'+id).classList.toggle('active', id===tab);
    $('view-'+id).style.display = id===tab ? 'block' : 'none';
  }
  if (tab==='events')  renderEvents();
  if (tab==='pos')     renderPOS();
  if (tab==='tickets') renderTickets();
}
$('tab-events').onclick   = ()=>activate('events');
$('tab-pos').onclick      = ()=>activate('pos');
$('tab-tickets').onclick  = ()=>activate('tickets');
$('tab-settings').onclick = ()=>activate('settings');
$('tab-users').onclick    = ()=>activate('users');

/* --------------- Events (simple list) ---------------- */
async function renderEvents(){
  const el = $('view-events');
  el.innerHTML = '<div class="muted">Loading events…</div>';
  try{
    const j = await fetch('/api/admin/events').then(r=>r.json());
    if (!j.ok) throw new Error(j.error||'failed');
    const rows = (j.events||[]).map(e=>`
      <tr>
        <td>${e.id}</td>
        <td>${esc(e.name)}</td>
        <td>${esc(e.slug)}</td>
        <td>${fmtTs(e.starts_at)}</td>
        <td>${fmtTs(e.ends_at)}</td>
        <td>${esc(e.status||'')}</td>
      </tr>
    }).join('') || '<tr><td colspan="6" class="muted">No events</td></tr>';
    el.innerHTML = `
      <h2 style="margin:0 0 10px">Events</h2>
      <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Name</th><th>Slug</th><th>Start</th><th>End</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    `;
  }catch(e){
    el.innerHTML = '<div class="muted">Error loading events: '+esc(e.message||'')+'</div>';
  }
}

/* ----------------------- POS Admin ----------------------- */
async function renderPOS(){
  const el = $('view-pos');
  el.innerHTML = `
    <h2 style="margin:0 0 10px">POS Sessions</h2>
    <div class="row" style="margin-bottom:10px">
      <div>
        <div class="muted" style="font-size:12px">From</div>
        <input id="posFrom" type="date"/>
      </div>
      <div>
        <div class="muted" style="font-size:12px">To</div>
        <input id="posTo" type="date"/>
      </div>
      <button id="posReload">Reload</button>
      <span id="posErr" class="muted"></span>
    </div>
    <div id="posTable"><div class="muted">Loading…</div></div>
  `;
  $('posReload').onclick = () => loadPOS();
  await loadPOS();
}

async function loadPOS(){
  const err = $('posErr'); err.textContent = '';
  const table = $('posTable'); table.innerHTML = '<div class="muted">Loading…</div>';

  const qs = new URLSearchParams();
  const f = $('posFrom').value, t = $('posTo').value;
  if (f) qs.set('from', f);
  if (t) qs.set('to', t);

  try{
    const j = await fetch('/api/admin/pos/sessions?'+qs.toString()).then(r=>r.json());
    if (!j.ok) throw new Error(j.error||'failed');

    let cash=0, card=0;
    const rows = (j.sessions||[]).map(s=>{
      cash += s.cash_total_cents||0;
      card += s.card_total_cents||0;
      return `
        <tr>
          <td>${s.session_id}</td>
          <td>${esc(s.cashier_name)}<div class="muted" style="font-size:12px">${esc(s.cashier_msisdn||'')}</div></td>
          <td>${esc(s.gate_name)}</td>
          <td>${esc(s.event_name)}</td>
          <td>${fmtTs(s.opened_at)}</td>
          <td>${s.closed_at ? fmtTs(s.closed_at) : '<span class="chip">open</span>'}</td>
          <td class="right">${fmtR(s.cash_total_cents)}</td>
          <td class="right">${fmtR(s.card_total_cents)}</td>
          <td class="right">${fmtR((s.takings_cents||0))}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="9" class="muted">No sessions in range</td></tr>';

    table.innerHTML = `
      <div style="overflow:auto">
      <table>
        <thead><tr>
          <th>ID</th><th>Cashier</th><th>Gate</th><th>Event</th>
          <th>Opened</th><th>Closed</th>
          <th class="right">Cash</th><th class="right">Card</th><th class="right">Takings</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <th colspan="6" class="right">Totals</th>
            <th class="right">${fmtR(cash)}</th>
            <th class="right">${fmtR(card)}</th>
            <th class="right">${fmtR(cash+card)}</th>
          </tr>
        </tfoot>
      </table>
      </div>
    `;
  }catch(e){
    table.innerHTML = '';
    err.textContent = 'Error: ' + (e.message||'unknown');
  }
}

/* ----------------------- Tickets tab ----------------------- */
async function renderTickets(){
  const el = $('view-tickets');
  el.innerHTML = `
    <h2 style="margin:0 0 10px">Tickets</h2>
    <div class="row" style="margin-bottom:10px">
      <select id="tkEvent" style="min-width:280px"><option>Loading events…</option></select>
      <button id="tkReload">Reload</button>
      <span id="tkErr" class="muted"></span>
    </div>
    <div id="tkSummary" class="chips" style="margin-bottom:10px"></div>
    <div id="tkTable"><div class="muted">Pick an event to view ticket stats.</div></div>
  `;

  // Load event list
  try{
    const evs = await fetch('/api/admin/events').then(r=>r.json());
    if (!evs.ok) throw new Error(evs.error||'events failed');
    const sel = $('tkEvent');
    sel.innerHTML = (evs.events||[]).map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('')
                  || '<option value="0">No events</option>';
  }catch(e){
    $('tkErr').textContent = 'Error loading events: '+(e.message||'');
  }

  $('tkReload').onclick = () => loadTicketSummary();
  $('tkEvent').onchange  = () => loadTicketSummary();
  await loadTicketSummary();
}

async function loadTicketSummary(){
  const err = $('tkErr'); err.textContent = '';
  const table = $('tkTable'); const chips = $('tkSummary');
  const eventId = Number(($('tkEvent').value||'0'));
  if (!eventId){ table.innerHTML = '<div class="muted">No event selected.</div>'; chips.innerHTML=''; return; }

  table.innerHTML = '<div class="muted">Loading…</div>'; chips.innerHTML='';

  try{
    const j = await fetch('/api/admin/tickets/summary?event_id='+eventId).then(r=>r.json());
    if (!j.ok) throw new Error(j.error||'failed');

    // Summary chips
    chips.innerHTML = `
      <span class="chip">Total sold: <b>${(j.totals?.sold||0)}</b></span>
      <span class="chip">In: <b>${(j.totals?.in||0)}</b></span>
      <span class="chip">Not yet in: <b>${(j.totals?.not_in||0)}</b></span>
    `;

    const rows = (j.types||[]).map(t=>`
      <tr>
        <td>${t.id}</td>
        <td>${esc(t.name)}</td>
        <td class="right">${t.sold}</td>
        <td class="right">${t.in}</td>
        <td class="right">${t.not_in}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="muted">No tickets</td></tr>';

    table.innerHTML = `
      <div class="muted" style="margin-bottom:8px">Event: ${esc(j.event?.name||'ID '+eventId)}</div>
      <div style="overflow:auto">
      <table>
        <thead>
          <tr><th>Type ID</th><th>Type</th><th class="right">Sold</th><th class="right">In</th><th class="right">Not yet in</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    `;
  }catch(e){
    table.innerHTML = '';
    err.textContent = 'Error: ' + (e.message||'unknown');
  }
}

/* -------------------- helpers -------------------- */
function esc(s){ return String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* default tab */
activate('events');
</script>
</body>
</html>`;
}
