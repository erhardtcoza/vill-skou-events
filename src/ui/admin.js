// /src/ui/admin.js

export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  h1{ margin:0 0 12px }
  .tabs{ display:flex; gap:8px; margin:6px 0 16px }
  .tab{ padding:8px 12px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .tab.active{ background:var(--green); color:#fff; border-color:transparent }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:16px }
  .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center }
  input,select,button{ font:inherit }
  input,select{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff }
  table{ width:100%; border-collapse:collapse; margin-top:8px }
  th,td{ text-align:left; padding:10px 8px; border-bottom:1px solid #f1f3f5; vertical-align:top }
  .btn{ padding:10px 12px; border-radius:10px; border:0; background:var(--green); color:#fff; cursor:pointer; font-weight:600 }
  .btn.sec{ background:#e5e7eb; color:#111 }
  .muted{ color:var(--muted) }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <button class="tab active" data-tab="events">Events</button>
    <button class="tab" data-tab="pos">POS Admin</button>
    <button class="tab" data-tab="site">Site settings</button>
    <button class="tab" data-tab="users">Users</button>
  </div>

  <!-- EVENTS -->
  <section id="tab-events">
    <div class="card">
      <h2 style="margin-top:0">Events</h2>
      <div class="row">
        <input id="eSlug" placeholder="slug (e.g. skou-2025)"/>
        <input id="eName" placeholder="name"/>
        <input id="eVenue" placeholder="venue"/>
        <input id="eStart" type="date"/>
        <input id="eEnd" type="date"/>
        <select id="eStatus">
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="closed">closed</option>
        </select>
        <button id="eCreate" class="btn">Create</button>
        <span id="eErr" class="muted"></span>
      </div>

      <table id="eventsTbl">
        <thead><tr>
          <th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="eventsBody"><tr><td colspan="7" class="muted">Loading…</td></tr></tbody>
      </table>
    </div>

    <div class="card" id="ttPanel" style="display:none">
      <h3 id="ttTitle" style="margin-top:0">Ticket types</h3>
      <div class="row">
        <input id="ttName" placeholder="Name"/>
        <input id="ttPrice" type="number" min="0" step="1" placeholder="Price (R)"/>
        <select id="ttGender">
          <option value="0">Gender req: No</option>
          <option value="1">Gender req: Yes</option>
        </select>
        <button id="ttAdd" class="btn">Add ticket type</button>
        <span id="ttErr" class="muted"></span>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Gender req</th></tr></thead>
        <tbody id="ticketTypesBody"><tr><td colspan="4" class="muted">No event selected</td></tr></tbody>
      </table>
    </div>
  </section>

  <!-- POS ADMIN -->
  <section id="tab-pos" style="display:none">
    <div class="card">
      <h2 style="margin-top:0">POS Sessions</h2>
      <div class="row">
        <input id="posFrom" type="date"/>
        <input id="posTo" type="date"/>
        <button id="posReload" class="btn">Reload</button>
        <span id="posErr" class="muted"></span>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Cash (R)</th><th>Card (R)</th>
        </tr></thead>
        <tbody id="posBody"><tr><td colspan="7" class="muted">Loading…</td></tr></tbody>
      </table>
    </div>
  </section>

  <!-- PLACEHOLDERS -->
  <section id="tab-site" style="display:none">
    <div class="card"><h2>Site settings</h2><p class="muted">Coming soon.</p></div>
  </section>
  <section id="tab-users" style="display:none">
    <div class="card"><h2>Users</h2><p class="muted">Manage users in D1 (role column). UI coming later.</p></div>
  </section>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
const cents = (r)=>Math.max(0, Math.round(Number(r||0)*100));
const rands = (c)=>'R'+((c||0)/100).toFixed(2);

let CURRENT_EVENT = null;

/* -------- Tabs -------- */
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('section[id^="tab-"]').forEach(s=>s.style.display='none');
    $('tab-'+tab).style.display='block';
    if (tab==='pos') loadPOS();
    if (tab==='events') loadEvents();
  });
});

/* -------- Events -------- */
async function loadEvents(){
  $('eventsBody').innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
  try{
    const r = await fetch('/api/admin/events');
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'failed');

    const rows = (j.events||[]).map(ev=>`
      <tr>
        <td>${ev.id}</td>
        <td>${esc(ev.slug)}</td>
        <td>${esc(ev.name)}<div class="muted">${esc(ev.venue||'')}</div></td>
        <td>${fmtDate(ev.starts_at)}</td>
        <td>${fmtDate(ev.ends_at)}</td>
        <td>${esc(ev.status||'')}</td>
        <td><button class="btn sec" data-tt="${ev.id}" data-name="${esc(ev.name)}" data-slug="${esc(ev.slug)}">Ticket Types</button></td>
      </tr>
    `).join('');
    $('eventsBody').innerHTML = rows || '<tr><td colspan="7" class="muted">No events.</td></tr>';

    document.querySelectorAll('[data-tt]').forEach(b=>{
      b.onclick = ()=>{
        CURRENT_EVENT = { id:Number(b.dataset.tt), name:b.dataset.name, slug:b.dataset.slug };
        $('ttTitle').textContent = `Ticket types for ${CURRENT_EVENT.name} (${CURRENT_EVENT.slug})`;
        $('ttPanel').style.display = 'block';
        loadTicketTypesFor(CURRENT_EVENT.id);
      };
    });
  }catch(e){
    $('eventsBody').innerHTML = `<tr><td colspan="7" class="muted">Error: ${esc(e.message||'failed')}</td></tr>`;
  }
}

$('eCreate').onclick = async ()=>{
  $('eErr').textContent = '';
  const slug = $('eSlug').value.trim();
  const name = $('eName').value.trim();
  const venue = $('eVenue').value.trim();
  const starts_at = toEpoch($('eStart').value);
  const ends_at = toEpoch($('eEnd').value);
  const status = $('eStatus').value;
  if(!slug || !name || !starts_at || !ends_at){ $('eErr').textContent='missing fields'; return; }

  const r = await fetch('/api/admin/events', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ slug, name, venue, starts_at, ends_at, status })
  });
  const j = await r.json().catch(()=>({ok:false}));
  if(!j.ok){ $('eErr').textContent = 'Error: '+(j.error||'failed'); return; }
  $('eSlug').value=''; $('eName').value=''; $('eVenue').value='';
  $('eStart').value=''; $('eEnd').value='';
  loadEvents();
};

/* -------- Ticket types -------- */
async function loadTicketTypesFor(eventId){
  const tbody = $('ticketTypesBody');
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Loading…</td></tr>`;
  let jt;
  try{
    const r = await fetch(`/api/admin/events/${eventId}/ticket-types`);
    jt = await r.json();
  }catch{ jt = { ok:false, error:'Network error' }; }

  if(!jt.ok){
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Error: ${esc(jt.error||'failed')}</td></tr>`;
    return;
  }
  const rows = (jt.types||[]).map(t=>`
    <tr>
      <td>${t.id}</td>
      <td>${esc(t.name||'')}</td>
      <td>${typeof t.price_cents==='number'? (t.price_cents/100).toFixed(2) : '-'}</td>
      <td>${t.gender_required ? 'Yes' : 'No'}</td>
    </tr>
  `).join('');
  tbody.innerHTML = rows || `<tr><td colspan="4" class="muted">No ticket types</td></tr>`;
}

$('ttAdd').onclick = async ()=>{
  if(!CURRENT_EVENT) return;
  $('ttErr').textContent='';
  const name = $('ttName').value.trim();
  const price_cents = cents($('ttPrice').value);
  const gender_required = $('ttGender').value === '1';
  if(!name){ $('ttErr').textContent='name required'; return; }

  const r = await fetch(`/api/admin/events/${CURRENT_EVENT.id}/ticket-types`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name, price_cents, gender_required })
  });
  const j = await r.json().catch(()=>({ok:false}));
  if(!j.ok){ $('ttErr').textContent='Error: '+(j.error||'failed'); return; }
  $('ttName').value=''; $('ttPrice').value='';
  loadTicketTypesFor(CURRENT_EVENT.id);
};

/* -------- POS Admin -------- */
async function loadPOS(){
  $('posBody').innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
  $('posErr').textContent='';
  const from = toEpoch($('posFrom').value) || '';
  const to = toEpoch($('posTo').value) || '';
  const q = new URLSearchParams();
  if(from) q.set('from', from);
  if(to) q.set('to', to);

  try{
    const r = await fetch('/api/admin/pos/sessions' + (q.toString()?`?${q}`:''));
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'failed');

    const rows = (j.sessions||[]).map(s=>`
      <tr>
        <td>${s.id}</td>
        <td>${esc(s.cashier_name||'')}</td>
        <td>${esc(s.gate_name||'')}</td>
        <td>${fmtDateTime(s.opened_at)}</td>
        <td>${s.closed_at? fmtDateTime(s.closed_at) : '-'}</td>
        <td>${rands(s.cash_cents||0)}</td>
        <td>${rands(s.card_cents||0)}</td>
      </tr>
    `).join('');
    $('posBody').innerHTML = rows || '<tr><td colspan="7" class="muted">No sessions</td></tr>';
  }catch(e){
    $('posBody').innerHTML = `<tr><td colspan="7" class="muted">Error: ${esc(e.message||'failed')}</td></tr>`;
  }
}
$('posReload').onclick = loadPOS;

/* -------- Utils -------- */
function toEpoch(yyyy_mm_dd){
  if(!yyyy_mm_dd) return 0;
  try{ return Math.floor(new Date(yyyy_mm_dd+'T00:00:00Z').getTime()/1000); }catch{ return 0; }
}
function fmtDate(ts){ if(!ts) return '-'; const d=new Date(ts*1000); return d.toLocaleDateString('af-ZA',{year:'numeric',month:'2-digit',day:'2-digit'}); }
function fmtDateTime(ts){ if(!ts) return '-'; const d=new Date(ts*1000); return d.toLocaleString('af-ZA'); }

/* Init */
loadEvents();
</script>
</body></html>`;
}
