// /src/ui/admin.js
export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:26px auto; padding:0 16px }
  h1{ margin:0 0 18px }
  .tabs{ display:flex; gap:14px; margin:0 0 16px }
  .tab{ padding:8px 14px; border-radius:999px; background:#e6f1ea; color:#0a7d2b; cursor:pointer; font-weight:600; user-select:none }
  .tab.active{ background:#0a7d2b; color:#fff }
  .card{ background:#fff; border-radius:14px; box-shadow:0 10px 24px rgba(0,0,0,.08); padding:16px; margin-bottom:16px }
  .row{ display:flex; flex-wrap:wrap; gap:12px; align-items:center }
  input, select, button{ font:inherit }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; min-width:160px }
  button{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  table{ width:100%; border-collapse:collapse; font-size:14px }
  th, td{ text-align:left; padding:10px; border-bottom:1px solid #eee; vertical-align:top }
  th{ color:#4b5563; font-weight:700; }
  .muted{ color:var(--muted) }
  .err{ color:#b42318; font-weight:600; margin-top:8px }
  .ok{ color:#05603a; font-weight:600; margin-top:8px }
  code.small{ font-size:12px; background:#f1f5f9; padding:2px 6px; border-radius:6px }
  .right{ text-align:right }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <div class="tab" data-tab="events">Events</div>
    <div class="tab" data-tab="tickets">Tickets</div>
    <div class="tab" data-tab="pos">POS Admin</div>
    <div class="tab" data-tab="vendors">Vendors</div>
    <div class="tab" data-tab="users">Users</div>
    <div class="tab" data-tab="site">Site settings</div>
  </div>

  <div id="pane"></div>
</div>

<script>
const $ = sel => document.querySelector(sel);
const pane = $('#pane');

function fmtMoney(cents){ const n = Number(cents||0)/100; return 'R' + n.toFixed(2); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
async function getJSON(url){
  try{
    const r = await fetch(url, { headers:{ 'accept':'application/json' }});
    const t = await r.text();
    try { return { ok:true, json: JSON.parse(t) }; }
    catch { return { ok:false, error: 'JSON.parse failed', raw:t, status:r.status }; }
  }catch(e){
    return { ok:false, error: e.message||'network' };
  }
}
function setTabsActive(name){
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab===name));
}

/* -------------------- Events -------------------- */
async function renderEvents(){
  setTabsActive('events');
  pane.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 10px">Events</h2>
      <div id="evErr" class="err" style="display:none"></div>
      <div id="evWrap" class="muted">Loading…</div>
    </div>`;
  const res = await getJSON('/api/admin/events');
  const wrap = $('#evWrap'), err = $('#evErr');
  if (!res.ok) { err.style.display='block'; err.textContent = 'Error: ' + (res.error || res.status || 'unknown'); wrap.textContent=''; return; }
  const j = res.json;
  if (!j || j.ok===false) { err.style.display='block'; err.textContent = 'Error loading events'; wrap.textContent=''; return; }
  const rows = (j.events||[]).map(ev => `
    <tr>
      <td>${esc(ev.id)}</td>
      <td>${esc(ev.slug)}</td>
      <td>${esc(ev.name)}<div class="muted">${esc(ev.venue||'')}</div></td>
      <td>${ev.starts_at ? new Date(ev.starts_at*1000).toISOString().slice(0,10) : ''}</td>
      <td>${ev.ends_at ? new Date(ev.ends_at*1000).toISOString().slice(0,10) : ''}</td>
      <td>${esc(ev.status||'')}</td>
      <td><button data-tt="${esc(ev.id)}">Ticket types</button></td>
    </tr>
  `).join('');
  wrap.innerHTML = rows ? `
    <table>
      <thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div id="ttArea" class="card" style="margin-top:14px; display:none"></div>
  ` : '<div class="muted">No events.</div>';

  wrap.querySelectorAll('button[data-tt]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute('data-tt');
      const box = $('#ttArea'); box.style.display='block'; box.textContent='Loading types…';
      const r = await getJSON('/api/admin/events/'+id+'/ticket_types');
      if (!r.ok || !r.json || r.json.ok===false) { box.innerHTML = '<div class="err">Could not load ticket types.</div>'; return; }
      const tts = r.json.ticket_types||[];
      box.innerHTML = tts.length ? (`
        <h3 style="margin:0 0 8px">Ticket types for event #${esc(id)}</h3>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Price (R)</th><th>Capacity</th><th>Per-order</th><th>Gender req</th></tr></thead>
          <tbody>${tts.map(tt=>`
            <tr>
              <td>${esc(tt.id)}</td>
              <td>${esc(tt.name)}</td>
              <td>${(Number(tt.price_cents||0)/100).toFixed(2)}</td>
              <td>${esc(tt.capacity)}</td>
              <td>${esc(tt.per_order_limit)}</td>
              <td>${tt.requires_gender? 'Yes':'No'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      `) : '<div class="muted">No ticket types.</div>';
    };
  });
}

/* -------------------- Tickets -------------------- */
async function renderTickets(){
  setTabsActive('tickets');
  pane.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 10px">Tickets</h2>
      <div class="row" style="margin-bottom:8px">
        <select id="tEv"></select>
        <button id="tLoad">Load</button>
        <div id="tMsg" class="err" style="display:none"></div>
      </div>
      <div id="tWrap" class="muted">Select event and click Load.</div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 10px">Order lookup</h3>
      <div class="row">
        <input id="olCode" placeholder="e.g. C056B6" style="min-width:160px"/>
        <button id="olFind">Find</button>
        <div id="olOut" class="muted"></div>
      </div>
    </div>`;
  // fill events
  const evs = await getJSON('/api/admin/events');
  const sel = $('#tEv');
  if (evs.ok && evs.json && evs.json.events) {
    sel.innerHTML = evs.json.events.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  } else {
    sel.innerHTML = '<option value="">No events</option>';
  }
  $('#tLoad').onclick = async ()=>{
    $('#tMsg').style.display='none';
    const id = sel.value;
    if (!id) { $('#tWrap').textContent='Pick an event first.'; return; }
    $('#tWrap').textContent = 'Loading…';
    const r = await getJSON('/api/admin/tickets/summary?event_id='+encodeURIComponent(id));
    if (!r.ok || !r.json || r.json.ok===false) { $('#tMsg').style.display='block'; $('#tMsg').textContent='Error loading summary.'; $('#tWrap').textContent=''; return; }
    const s = r.json.summary||{};
    const lines = (s.by_type||[]).map(row=>`
      <tr>
        <td>${esc(row.name)}</td>
        <td class="right">${(Number(row.price_cents||0)/100).toFixed(2)}</td>
        <td class="right">${esc(row.total||0)}</td>
        <td class="right">${esc(row.unused||0)}</td>
        <td class="right">${esc(row.in||0)}</td>
        <td class="right">${esc(row.out||0)}</td>
        <td class="right">${esc(row.void||0)}</td>
      </tr>`).join('');
    $('#tWrap').innerHTML = `
      <div class="muted" style="margin-bottom:8px">
        Total: ${esc(s.total||0)} · In: ${esc(s.in||0)} · Out: ${esc(s.out||0)} · Unused: ${esc(s.unused||0)} · Void: ${esc(s.void||0)}
      </div>
      <table>
        <thead><tr><th>Type</th><th class="right">Price (R)</th><th class="right">Total</th><th class="right">Unused</th><th class="right">In</th><th class="right">Out</th><th class="right">Void</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>`;
  };
  $('#olFind').onclick = async ()=>{
    const code = ($('#olCode').value||'').trim();
    const out = $('#olOut');
    out.textContent = '…';
    if (!code) { out.textContent = 'Enter a code.'; return; }
    const r = await getJSON('/api/admin/orders/lookup?code='+encodeURIComponent(code));
    if (!r.ok || !r.json || r.json.ok===false || !r.json.order) { out.innerHTML = '<span class="err">Not Found</span>'; return; }
    const c = r.json.order.short_code || code;
    out.innerHTML = \`Found &nbsp; <a href="/t/\${encodeURIComponent(c)}" target="_blank">Ticket link</a>\`;
  };
}

/* -------------------- POS Admin -------------------- */
async function renderPOS(){
  setTabsActive('pos');
  pane.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 10px">POS Sessions</h2>
      <div class="row" style="margin-bottom:8px">
        <button id="posReload">Reload</button>
        <div id="posMsg" class="err" style="display:none"></div>
      </div>
      <div id="posWrap" class="muted">Loading…</div>
    </div>`;
  async function load(){
    $('#posMsg').style.display='none';
    $('#posWrap').textContent='Loading…';
    const r = await getJSON('/api/admin/pos/sessions');
    if (!r.ok || !r.json || r.json.ok===false) { $('#posMsg').style.display='block'; $('#posMsg').textContent='Error loading sessions.'; $('#posWrap').textContent=''; return; }
    const rows = (r.json.sessions||[]).map(s=>{
      const opened = s.opened_at? new Date(s.opened_at*1000).toISOString().replace('T',' ').slice(0,19):'';
      const closed = s.closed_at? new Date(s.closed_at*1000).toISOString().replace('T',' ').slice(0,19):'-';
      const cash = 'cash_cents' in s ? fmtMoney(s.cash_cents) : 'R0.00';
      const card = 'card_cents' in s ? fmtMoney(s.card_cents) : 'R0.00';
      return \`
        <tr>
          <td>\${esc(s.id)}</td>
          <td>\${esc(s.cashier_name||'')}</td>
          <td>\${esc(s.gate_name||s.gate||'')}</td>
          <td>\${opened}</td>
          <td>\${closed}</td>
          <td>\${esc(s.closing_manager||s.closed_by||'')}</td>
          <td class="right">\${cash}</td>
          <td class="right">\${card}</td>
        </tr>\`;
    }).join('');
    $('#posWrap').innerHTML = rows ? (`
      <table>
        <thead><tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Closed by</th><th class="right">Cash (R)</th><th class="right">Card (R)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`) : '<div class="muted">No sessions.</div>';
  }
  $('#posReload').onclick = load;
  load();
}

/* -------------------- Vendors -------------------- */
async function renderVendors(){
  setTabsActive('vendors');
  pane.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 10px">Vendors</h2>
      <div class="row" style="margin-bottom:8px">
        <select id="vEv"></select>
        <button id="vLoad">Load</button>
        <div id="vMsg" class="err" style="display:none"></div>
      </div>
      <div id="vWrap" class="muted">Select event and click Load.</div>
    </div>`;
  // events list
  const evs = await getJSON('/api/admin/events');
  const sel = $('#vEv');
  if (evs.ok && evs.json && evs.json.events) {
    sel.innerHTML = evs.json.events.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.slug)})</option>`).join('');
  } else {
    sel.innerHTML = '<option value="">No events</option>';
  }
  $('#vLoad').onclick = async ()=>{
    $('#vMsg').style.display='none';
    const id = sel.value;
    if (!id) { $('#vWrap').textContent='Pick an event first.'; return; }
    $('#vWrap').textContent='Loading…';
    const r = await getJSON('/api/admin/vendors?event_id='+encodeURIComponent(id));
    if (!r.ok || !r.json || r.json.ok===false) { $('#vMsg').style.display='block'; $('#vMsg').textContent='Error loading vendors.'; $('#vWrap').textContent=''; return; }
    const rows = (r.json.vendors||[]).map(v=>`
      <tr>
        <td>${esc(v.id)}</td>
        <td>${esc(v.name)}</td>
        <td>${esc(v.contact_name||'')}<div class="muted">${esc(v.phone||'')} ${esc(v.email||'')}</div></td>
        <td>${esc(v.stand_number||'')}</td>
        <td class="right">${esc(v.staff_quota||0)}</td>
        <td class="right">${esc(v.vehicle_quota||0)}</td>
      </tr>`).join('');
    $('#vWrap').innerHTML = rows ? `
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Stand #</th><th class="right">Staff quota</th><th class="right">Vehicle quota</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<div class="muted">No vendors.</div>';
  };
}

/* -------------------- Users -------------------- */
async function renderUsers(){
  setTabsActive('users');
  pane.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 10px">Users</h2>
      <div id="uMsg" class="err" style="display:none"></div>
      <div id="uWrap" class="muted">Loading…</div>
    </div>`;
  const r = await getJSON('/api/admin/users');
  if (!r.ok || !r.json || r.json.ok===false) { $('#uMsg').style.display='block'; $('#uMsg').textContent='Error loading users.'; $('#uWrap').textContent=''; return; }
  const rows = (r.json.users||[]).map(u=>`
    <tr><td>${esc(u.id)}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td></tr>
  `).join('');
  $('#uWrap').innerHTML = rows ? `
    <table><thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table>
  ` : '<div class="muted">No users.</div>';
}

/* -------------------- Site settings (placeholder) -------------------- */
function renderSite(){
  setTabsActive('site');
  pane.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 10px">Site settings</h2>
      <div class="muted">Coming soon.</div>
    </div>`;
}

/* -------------------- Router -------------------- */
function route(){
  const h = (location.hash||'').replace('#','');
  if (h==='tickets') return renderTickets();
  if (h==='pos') return renderPOS();
  if (h==='vendors') return renderVendors();
  if (h==='users') return renderUsers();
  if (h==='site') return renderSite();
  // default
  return renderEvents();
}
window.addEventListener('hashchange', route);
document.querySelectorAll('.tab').forEach(t=>{
  t.onclick = ()=>{ location.hash = t.dataset.tab; };
});
route();
</script>
</body></html>`;
}
