// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  h1{ margin:0 0 14px }
  .tabs{ display:flex; gap:8px; margin:6px 0 16px }
  .tab{ padding:8px 12px; border-radius:999px; background:#e9f5ee; color:#0a7d2b; cursor:pointer; border:1px solid #cfe7da; font-weight:600 }
  .tab.active{ background:#0a7d2b; color:#fff; border-color:transparent }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:14px }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select, button{ font:inherit }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.ghost{ background:#eef2f6; color:#111; border:1px solid #e5e7eb }
  .muted{ color:var(--muted) }
  .error{ color:#b42318; font-weight:600; margin-top:6px }
  table{ width:100%; border-collapse:collapse; }
  th,td{ padding:10px 8px; border-bottom:1px solid #f0f2f4; text-align:left; vertical-align:top }
  th{ font-weight:700; color:#334155; background:#fafbfc }
  .right{ text-align:right }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
  .copy{ cursor:pointer; font-size:12px; padding:2px 6px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; }
  .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:14px }
  @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>

  <div class="tabs">
    <div class="tab active" data-tab="events">Events</div>
    <div class="tab" data-tab="tickets">Tickets</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="site">Site settings</div>
  </div>

  <!-- EVENTS -->
  <section id="tab-events">
    <div class="card">
      <h2 style="margin:0 0 10px">Events</h2>
      <div class="muted" id="evErr" style="margin-bottom:8px"></div>
      <div class="table-wrap">
        <table id="eventsTbl"><thead>
          <tr><th style="width:60px">ID</th><th>Slug</th><th>Name<br><span class="muted">Venue</span></th><th>Start</th><th>End</th><th>Status</th><th style="width:120px"></th></tr>
        </thead><tbody></tbody></table>
      </div>
    </div>

    <div class="card" id="ttCard" style="display:none">
      <h3 style="margin:0 0 8px">Ticket types for <span id="ttEventName"></span> (<span id="ttEventSlug" class="muted"></span>)</h3>
      <div class="row" style="margin:6px 0 12px">
        <input id="ttName" placeholder="Name" style="min-width:220px"/>
        <input id="ttPrice" type="number" min="0" step="1" placeholder="Price (R)" style="width:120px"/>
        <select id="ttGender" style="width:130px">
          <option value="0">Gender req: No</option>
          <option value="1">Gender req: Yes</option>
        </select>
        <input id="ttCap" type="number" min="0" step="1" placeholder="Capacity" style="width:120px"/>
        <input id="ttCode" placeholder="Code (optional)" style="width:160px"/>
        <button id="ttAdd" class="btn">Add ticket type</button>
        <span id="ttMsg" class="muted"></span>
      </div>
      <table id="ttTbl"><thead>
        <tr><th style="width:60px">ID</th><th>Name</th><th class="right">Price (R)</th><th class="right">Capacity</th><th class="right">Per-order</th><th>Code</th><th>Gender req</th></tr>
      </thead><tbody></tbody></table>
    </div>
  </section>

  <!-- TICKETS -->
  <section id="tab-tickets" style="display:none">
    <div class="card">
      <h2 style="margin:0 0 10px">Tickets</h2>
      <div class="row" style="margin-bottom:10px">
        <select id="tEvSelect" style="min-width:280px"></select>
        <button id="tLoad" class="btn">Load</button>
        <span id="tErr" class="error"></span>
      </div>

      <div id="tSummary" class="muted" style="margin:0 0 8px; display:none"></div>
      <div class="table-wrap">
        <table id="tTbl"><thead>
          <tr><th>Type</th><th class="right">Price (R)</th><th class="right">Total</th><th class="right">Unused</th><th class="right">In</th><th class="right">Out</th><th class="right">Void</th></tr>
        </thead><tbody></tbody></table>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">Order lookup</h3>
      <div class="row">
        <input id="olCode" placeholder="Short code e.g. 3VLNT5" style="width:180px"/>
        <button id="olBtn" class="btn">Find</button>
        <span id="olMsg" class="muted"></span>
      </div>
      <div id="olResult" style="margin-top:10px"></div>
    </div>
  </section>

  <!-- POS ADMIN -->
  <section id="tab-pos" style="display:none">
    <div class="card">
      <h2 style="margin:0 0 10px">POS Sessions</h2>
      <div class="row" style="margin-bottom:10px">
        <button id="posReload" class="btn">Reload</button>
        <span id="posErr" class="error"></span>
      </div>
      <table id="posTbl"><thead>
        <tr><th style="width:60px">ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th class="right">Cash (R)</th><th class="right">Card (R)</th></tr>
      </thead><tbody></tbody></table>
    </div>
  </section>

  <!-- STUBS -->
  <section id="tab-vendors" style="display:none">
    <div class="card"><h2 style="margin:0 0 8px">Vendors</h2>
      <div class="muted">UI coming next. DB tables (vendors, vendor_passes, passes) are already present.</div>
    </div>
  </section>

  <section id="tab-users" style="display:none">
    <div class="card"><h2 style="margin:0 0 8px">Users</h2>
      <div class="muted">Basic user management UI to be added.</div>
    </div>
  </section>

  <section id="tab-site" style="display:none">
    <div class="card"><h2 style="margin:0 0 8px">Site settings</h2>
      <div class="muted">Settings UI is a placeholder for now.</div>
    </div>
  </section>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s??'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const rands = (c)=>'R'+((c||0)/100).toFixed(2);
async function jget(url){
  const r = await fetch(url);
  const ct = r.headers.get('content-type')||'';
  if (!ct.includes('application/json')) {
    const t = await r.text().catch(()=> '');
    throw new Error('Non-JSON response: '+String(t).slice(0,200));
  }
  const j = await r.json();
  if (!r.ok || j.ok===false) throw new Error(j.error || ('HTTP '+r.status));
  return j;
}
async function jpost(url, body){
  const r = await fetch(url,{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body||{})});
  const ct = r.headers.get('content-type')||'';
  if (!ct.includes('application/json')) {
    const t = await r.text().catch(()=> '');
    throw new Error('Non-JSON response: '+String(t).slice(0,200));
  }
  const j = await r.json();
  if (!r.ok || j.ok===false) throw new Error(j.error || ('HTTP '+r.status));
  return j;
}

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach(t=>{
  t.onclick = ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const name = t.dataset.tab;
    document.querySelectorAll('section[id^="tab-"]').forEach(s=>s.style.display = (s.id === 'tab-'+name) ? 'block' : 'none');
  };
});

/* ---------- Events + Ticket types ---------- */
let EVENTS = [];
let TT_EVENT = null;

async function loadEvents(){
  $('evErr').textContent='';
  try{
    const j = await jget('/api/admin/events');
    EVENTS = j.events||[];
    const tb = $('eventsTbl').querySelector('tbody');
    tb.innerHTML = (EVENTS.map(ev => `
      <tr>
        <td>${ev.id}</td>
        <td>${esc(ev.slug)}</td>
        <td><div style="font-weight:600">${esc(ev.name)}</div><div class="muted">${esc(ev.venue||'')}</div></td>
        <td>${fmtDate(ev.starts_at)}</td>
        <td>${fmtDate(ev.ends_at)}</td>
        <td>${esc(ev.status)}</td>
        <td><button class="btn ghost" data-tt="${ev.id}">Ticket Types</button></td>
      </tr>
    `).join('')) || '<tr><td colspan="7" class="muted">No events</td></tr>';

    tb.querySelectorAll('[data-tt]').forEach(b=>{
      b.onclick = ()=> openTicketTypes(Number(b.dataset.tt));
    });

    // Fill Tickets tab event selector too
    const sel = $('tEvSelect');
    sel.innerHTML = EVENTS.map(e=>`<option value="${e.id}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  }catch(e){
    $('evErr').textContent = 'Error: '+(e.message||'load failed');
  }
}

async function openTicketTypes(event_id){
  const ev = EVENTS.find(x=>x.id===event_id);
  if (!ev) return;
  TT_EVENT = ev;
  $('ttEventName').textContent = ev.name;
  $('ttEventSlug').textContent = ev.slug;
  $('ttCard').style.display = 'block';
  $('ttMsg').textContent = '';
  await loadTicketTypes(event_id);
}

async function loadTicketTypes(event_id){
  const j = await jget('/api/admin/events/'+event_id+'/ticket-types');
  const rows = j.ticket_types || [];
  $('ttTbl').querySelector('tbody').innerHTML = rows.map(r=>`
    <tr>
      <td>${r.id}</td>
      <td>${esc(r.name)}</td>
      <td class="right">${rands(r.price_cents||0)}</td>
      <td class="right">${r.capacity||0}</td>
      <td class="right">${r.per_order_limit||0}</td>
      <td>${esc(r.code||'')}</td>
      <td>${(r.requires_gender? 'Yes':'No')}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="muted">No ticket types yet</td></tr>';
}

$('ttAdd').onclick = async ()=>{
  if (!TT_EVENT) return;
  const name = $('ttName').value.trim();
  const priceR = Number($('ttPrice').value||0);
  const capacity = Number($('ttCap').value||0);
  const requires_gender = Number($('ttGender').value||0);
  const code = $('ttCode').value.trim() || null;
  if (!name) return $('ttMsg').textContent='Name required';
  $('ttMsg').textContent = 'Saving…';
  try{
    await jpost('/api/admin/events/'+TT_EVENT.id+'/ticket-types', {
      name, price_cents: Math.round(priceR*100), capacity, per_order_limit:10, requires_gender, code
    });
    $('ttName').value=''; $('ttPrice').value=''; $('ttCap').value=''; $('ttCode').value='';
    $('ttGender').value='0';
    await loadTicketTypes(TT_EVENT.id);
    $('ttMsg').textContent = 'Added ✔︎';
    setTimeout(()=>$('ttMsg').textContent='',1200);
  }catch(e){
    $('ttMsg').textContent = 'Error: '+(e.message||'save failed');
  }
};

/* ---------- Tickets summary + order lookup ---------- */
$('tLoad').onclick = loadTicketsSummary;
async function loadTicketsSummary(){
  $('tErr').textContent='';
  $('tSummary').style.display='none';
  const event_id = Number(($('tEvSelect').value||0));
  if (!event_id) return;
  try{
    const j = await jget('/api/admin/tickets?event_id='+event_id);
    const tb = $('tTbl').querySelector('tbody');
    tb.innerHTML = (j.types||[]).map(r=>`
      <tr>
        <td>${esc(r.name)}</td>
        <td class="right">${rands(r.price_cents||0)}</td>
        <td class="right">${r.total||0}</td>
        <td class="right">${r.unused||0}</td>
        <td class="right">${r.in||0}</td>
        <td class="right">${r.out||0}</td>
        <td class="right">${r.void||0}</td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="muted">No tickets yet</td></tr>';

    $('tSummary').textContent =
      \`Total: \${(j.summary?.total||0)} • In: \${(j.summary?.in||0)} • Out: \${(j.summary?.out||0)} • Unused: \${(j.summary?.unused||0)} • Void: \${(j.summary?.void||0)}\`;
    $('tSummary').style.display='block';
  }catch(e){
    $('tErr').textContent = 'Error: '+(e.message||'load failed');
  }
}

// order lookup
$('olBtn').onclick = doOrderLookup;
async function doOrderLookup(){
  const code = ($('olCode').value||'').trim();
  $('olMsg').textContent=''; $('olResult').innerHTML='';
  if (!code) return;
  $('olMsg').textContent = 'Searching…';
  try{
    const j = await jget('/api/admin/orders/lookup?code='+encodeURIComponent(code));
    if (!j.ok) throw new Error(j.error || 'not found');
    $('olMsg').textContent = 'Found';
    const link = j.event_slug ? ('/t/'+encodeURIComponent(code)) : null;
    $('olResult').innerHTML = link
      ? \`<div>Ticket link: <a href="\${link}" target="_blank">\${location.origin}\${link}</a>
           <button class="copy" id="copyL">Copy</button></div>\`
      : '<div class="muted">Order found but no event slug.</div>';
    const cp = $('copyL'); if (cp) cp.onclick = ()=> navigator.clipboard.writeText(location.origin+link);
  }catch(e){
    $('olMsg').textContent = 'Error: '+(e.message||'not found');
  }
}

/* ---------- POS sessions ---------- */
$('posReload').onclick = loadPOS;
async function loadPOS(){
  $('posErr').textContent='';
  try{
    const j = await jget('/api/admin/pos/sessions');
    const tb = $('posTbl').querySelector('tbody');
    tb.innerHTML = (j.sessions||[]).map(s=>`
      <tr>
        <td>${s.id}</td>
        <td>${esc(s.cashier_name||'')}</td>
        <td>${esc(s.gate_name||'')}</td>
        <td>${fmtDT(s.opened_at)}</td>
        <td>${s.closed_at ? fmtDT(s.closed_at) : '-'}</td>
        <td class="right">${rands(s.cash_cents||0)}</td>
        <td class="right">${rands(s.card_cents||0)}</td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="muted">No sessions</td></tr>';
  }catch(e){
    $('posErr').textContent = 'Error: '+(e.message||'load failed');
  }
}

/* ---------- Helpers ---------- */
function fmtDate(secs){
  if (!secs) return '-';
  const d = new Date(secs*1000);
  return d.toLocaleDateString('af-ZA',{year:'numeric',month:'2-digit',day:'2-digit'});
}
function fmtDT(secs){
  if (!secs) return '-';
  const d = new Date(secs*1000);
  return d.toLocaleString('af-ZA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}

/* init */
loadEvents();
loadPOS();
</script>
</body></html>`;
