// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{
    --bg:#f6f7f8; --card:#fff; --line:#e5e7eb; --muted:#6b7280; --text:#111827;
    --brand:#0a7d2b; --brand-ghost:#e7f3ea;
  }
  html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1000px;margin:24px auto;padding:0 16px}
  h1{margin:0 0 16px}
  .tabs{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
  .tab{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 14px;cursor:pointer}
  .tab.active{background:var(--brand);border-color:var(--brand);color:#fff}
  .panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  input,button,select{padding:10px;border:1px solid #d1d5db;border-radius:10px}
  button.primary{background:var(--brand);border-color:var(--brand);color:#fff;cursor:pointer}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid var(--line);padding:10px;vertical-align:top}
  .muted{color:var(--muted)}
  .err{color:#b00020;margin-top:6px}
  .right{display:flex;justify-content:flex-end}
</style>
</head><body><div class="wrap">
  <h1>Admin</h1>

  <div class="tabs" id="tabs">
    <button class="tab active" data-tab="events">Events</button>
    <button class="tab" data-tab="pos">POS Admin</button>
    <button class="tab" data-tab="site">Site settings</button>
    <button class="tab" data-tab="users">Users</button>
    <button class="tab" data-tab="vendors">Vendors</button>
    <button class="tab" data-tab="tickets">Tickets</button>
    <button class="tab" data-tab="visitors">Visitors</button>
    <button class="tab" data-tab="yoco">Yoco</button>
  </div>

  <!-- EVENTS -->
  <section id="panel-events" class="panel">
    <h2 style="margin:0 0 12px">Events</h2>
    <div class="row" style="margin-bottom:8px">
      <input id="slug" placeholder="slug (e.g. skou-2025)"/>
      <input id="name" placeholder="Event name"/>
      <input id="venue" placeholder="Venue"/>
      <label>Start <input id="startDate" type="date"/></label>
      <label>End <input id="endDate" type="date"/></label>
      <button class="primary" id="createBtn">Create</button>
    </div>
    <div id="evErr" class="err"></div>
    <table id="eventsTbl">
      <thead><tr>
        <th style="width:56px">ID</th><th>Slug</th><th>Name</th><th>Start</th><th>End</th><th style="width:120px"></th>
      </tr></thead>
      <tbody id="eventsBody"><tr><td colspan="6" class="muted">Loading…</td></tr></tbody>
    </table>
  </section>

  <!-- POS ADMIN -->
  <section id="panel-pos" class="panel" style="display:none">
    <h2 style="margin:0 0 12px">POS Admin</h2>
    <div class="row" style="margin-bottom:8px">
      <select id="posEventSel"></select>
      <input id="posFrom" type="date"/> <input id="posTo" type="date"/>
      <button class="primary" id="loadCashups">Load</button>
    </div>
    <div id="posErr" class="err"></div>
    <div id="posSummary" class="muted">No data yet.</div>
    <table id="cashupsTbl" style="margin-top:10px;display:none">
      <thead><tr>
        <th>ID</th><th>Event</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th>
        <th class="right">Opening</th><th class="right">Cash</th><th class="right">Card</th><th class="right">Total</th>
      </tr></thead>
      <tbody id="cashupsBody"></tbody>
    </table>
  </section>

  <!-- SITE SETTINGS -->
  <section id="panel-site" class="panel" style="display:none">
    <h2 style="margin:0 0 12px">Site settings</h2>
    <div class="row">
      <input id="siteName" placeholder="Site name"/>
      <input id="siteLogo" placeholder="Logo URL"/>
      <input id="siteBanner" placeholder="Banner URL"/>
      <button class="primary" id="saveSite">Save</button>
    </div>
    <div id="siteMsg" class="muted" style="margin-top:6px"></div>
  </section>

  <!-- PLACEHOLDERS -->
  <section id="panel-users" class="panel" style="display:none"><h2>Users</h2><p class="muted">Coming soon.</p></section>
  <section id="panel-vendors" class="panel" style="display:none"><h2>Vendors</h2><p class="muted">Coming soon.</p></section>
  <section id="panel-tickets" class="panel" style="display:none"><h2>Tickets</h2><p class="muted">Coming soon.</p></section>
  <section id="panel-visitors" class="panel" style="display:none"><h2>Visitors</h2><p class="muted">Coming soon.</p></section>
  <section id="panel-yoco" class="panel" style="display:none"><h2>Yoco</h2><p class="muted">Coming soon.</p></section>

</div>

<script>
  // ---- tabs
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('section[id^="panel-"]').forEach(p => p.style.display='none');
    document.getElementById('panel-'+b.dataset.tab).style.display='block';
  }));

  // ---- utils
  const $ = (id)=>document.getElementById(id);
  const fmtDate = (s)=> new Date((s||0)*1000).toLocaleDateString();
  const toUnix = (yyyy_mm_dd, endOfDay=false) => {
    if(!yyyy_mm_dd) return 0;
    const [y,m,d] = yyyy_mm_dd.split('-').map(n=>+n);
    const dt = endOfDay ? new Date(y,m-1,d,23,59,0) : new Date(y,m-1,d,0,0,0);
    return Math.floor(dt.getTime()/1000);
  };

  // ---- EVENTS
  async function loadEvents(){
    try{
      const r = await fetch('/api/admin/events');
      if (r.status===401) throw new Error('Unauthorized');
      const j = await r.json();
      const rows = (j.events||[]).map(e => `
        <tr>
          <td>${e.id}</td>
          <td>${e.slug}</td>
          <td>${e.name}<div class="muted">${e.venue||''}</div></td>
          <td>${fmtDate(e.starts_at)}</td>
          <td>${fmtDate(e.ends_at)}</td>
          <td class="right"><button data-id="${e.id}" class="editBtn">Edit</button></td>
        </tr>`).join('');
      $('eventsBody').innerHTML = rows || '<tr><td colspan="6" class="muted">No events yet.</td></tr>';
      // also fill POS dropdown
      $('posEventSel').innerHTML = (j.events||[]).map(e=>`<option value="${e.id}">${e.name} (${e.slug})</option>`).join('') || '<option value="">No events</option>';
    }catch(err){
      $('eventsBody').innerHTML = '<tr><td colspan="6" class="err">Error: '+(err.message||err)+'</td></tr>';
    }
  }
  $('createBtn').onclick = async ()=>{
    $('evErr').textContent='';
    const b = {
      slug: $('slug').value.trim(),
      name: $('name').value.trim(),
      venue: $('venue').value.trim(),
      starts_at: toUnix($('startDate').value,false),
      ends_at: toUnix($('endDate').value,true),
      status: 'active'
    };
    if(!b.slug || !b.name || !b.starts_at || !b.ends_at){
      $('evErr').textContent='Fill slug, name, dates';
      return;
    }
    const res = await fetch('/api/admin/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({ok:false,error:'network'}));
    if(!res.ok){ $('evErr').textContent = res.error || 'Failed'; return; }
    ['slug','name','venue','startDate','endDate'].forEach(id=>$(id).value='');
    loadEvents();
  };

  // ---- POS ADMIN
  $('loadCashups').onclick = async ()=>{
    $('posErr').textContent=''; $('posSummary').textContent='Loading…'; $('cashupsTbl').style.display='none';
    const evId = $('posEventSel').value||'';
    const from = $('posFrom').value||''; const to = $('posTo').value||'';
    try{
      const j = await fetch('/api/admin/pos/cashups?event_id='+encodeURIComponent(evId)+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)).then(r=>r.json());
      if(!j.ok) throw new Error(j.error||'Failed');
      const rows = (j.cashups||[]).map(c=>`
        <tr>
          <td>${c.id}</td>
          <td>${c.event_id}</td>
          <td>${c.cashier_name||''}</td>
          <td>${c.gate_name||''}</td>
          <td>${c.opened_at ? new Date(c.opened_at*1000).toLocaleString() : ''}</td>
          <td>${c.closed_at ? new Date(c.closed_at*1000).toLocaleString() : ''}</td>
          <td class="right">R${(c.opening_float_cents||0/100).toFixed ? (c.opening_float_cents/100).toFixed(2) : '0.00'}</td>
          <td class="right">R${((c.cash_total_cents||0)/100).toFixed(2)}</td>
          <td class="right">R${((c.card_total_cents||0)/100).toFixed(2)}</td>
          <td class="right">R${((c.total_cents||0)/100).toFixed(2)}</td>
        </tr>`).join('');
      $('cashupsBody').innerHTML = rows || '<tr><td colspan="10" class="muted">No cashups yet.</td></tr>';
      $('cashupsTbl').style.display='table';

      const s = j.summary || {transactions:0,total_cents:0,cash_cents:0,card_cents:0};
      $('posSummary').innerHTML =
        \`Transactions: <b>\${s.transactions||0}</b> · Cash: <b>R\${((s.cash_cents||0)/100).toFixed(2)}</b> · Card: <b>R\${((s.card_cents||0)/100).toFixed(2)}</b> · Total: <b>R\${((s.total_cents||0)/100).toFixed(2)}</b>\`;
    }catch(err){
      $('posErr').textContent = err.message||err;
      $('posSummary').textContent = 'No data.';
    }
  };

  // ---- SITE SETTINGS
  async function loadSite(){
    try{
      const j = await fetch('/api/admin/site').then(r=>r.json());
      if(j?.ok){
        $('siteName').value = j.site?.name || '';
        $('siteLogo').value = j.site?.logo_url || '';
        $('siteBanner').value = j.site?.banner_url || '';
      }
    }catch{}
  }
  $('saveSite').onclick = async ()=>{
    const body = { name:$('siteName').value.trim(), logo_url:$('siteLogo').value.trim(), banner_url:$('siteBanner').value.trim() };
    const j = await fetch('/api/admin/site',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({ok:false}));
    $('siteMsg').textContent = j.ok ? 'Saved.' : (j.error || 'Failed.');
  };

  // init
  loadEvents();
  loadSite();
</script>
</body></html>`;
