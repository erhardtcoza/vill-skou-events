// /src/ui/admin.js
export const adminHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --bg:#f7f7f8; --muted:#667085; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:#fff; color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  h1{ margin:0 0 14px }
  h2{ margin:18px 0 10px }
  h3{ margin:14px 0 8px }
  h4{ margin:12px 0 6px }
  .tabs{ display:flex; gap:10px; flex-wrap:wrap; margin:8px 0 18px }
  .pill{ padding:10px 14px; border:1px solid #e5e7eb; border-radius:999px; background:#fff; cursor:pointer; font-weight:600; white-space:nowrap }
  .pill.active{ background:var(--green); color:#fff; border-color:transparent }
  .card{ background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:14px; box-shadow:0 10px 24px rgba(0,0,0,.06); margin-bottom:16px }
  .muted{ color:var(--muted) } .tiny{ font-size:12px }
  input,button,select,textarea{ padding:10px; border:1px solid #e5e7eb; border-radius:10px; margin:4px; font-size:14px; max-width:100% }
  button.primary{ background:var(--green); color:#fff; border-color:transparent }
  table{ width:100%; border-collapse:collapse } td,th{ padding:10px; border-bottom:1px solid #f0f0f0; vertical-align:top }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  .row-nowrap{ display:flex; gap:10px; align-items:center; flex-wrap:nowrap }
  .right{ margin-left:auto }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:8px }
  @media (max-width:800px){ .grid2{ grid-template-columns:1fr } }
  .tag{ background:#f1f5f9; padding:3px 8px; border-radius:999px; font-size:12px; margin-left:6px; display:inline-block }
  /* Modal */
  .modal{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; align-items:center; justify-content:center; padding:16px; z-index:50 }
  .sheet{ max-width:720px; width:100%; background:#fff; border-radius:16px; box-shadow:0 30px 70px rgba(0,0,0,.25); padding:16px }
  .actions button{ padding:8px 12px }
  /* Numeric right cells */
  td.right, th.right{ text-align:right }
</style>
</head><body><div class="wrap">
  <h1>Admin</h1>

  <!-- Top nav pills -->
  <div class="tabs">
    <button class="pill active" data-tab="site">Site settings</button>
    <button class="pill" data-tab="events">Events</button>
    <button class="pill" data-tab="pos">POS admin</button>
    <button class="pill" data-tab="visitors">Visitors (live)</button>
    <button class="pill" data-tab="yoco">Yoco gateway</button>
    <button class="pill" data-tab="tickets">Tickets tools</button>
    <span class="right"></span>
    <button class="pill" id="btnOpenCreate">+ Create event</button>
  </div>

  <!-- TAB: Site settings -->
  <section id="tab-site" class="card">
    <h2>Site Settings</h2>
    <div class="grid2">
      <label>Site title
        <input id="site_title" placeholder="Villiersdorp Skou Events"/>
      </label>
      <label>Brand banner / hero (URL)
        <input id="site_banner_url" placeholder="https://…/banner.png"/>
      </label>
      <label>Logo (URL)
        <input id="site_logo_url" placeholder="https://…/logo.png"/>
      </label>
      <label>Favicon (URL)
        <input id="site_favicon_url" placeholder="https://…/favicon.png"/>
      </label>
    </div>
    <div class="row">
      <button class="primary" id="btnSaveSite">Save</button>
      <span id="siteMsg" class="muted tiny"></span>
    </div>
  </section>

  <!-- TAB: Events -->
  <section id="tab-events" class="card" style="display:none">
    <h2>Events</h2>
    <table id="events">
      <tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th><th>Status</th><th></th></tr>
    </table>
    <p class="tiny muted">Tip: Click “Edit” to manage images, ticket types, and gates for that event.</p>
  </section>

  <!-- TAB: POS admin -->
  <section id="tab-pos" class="card" style="display:none">
    <div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">POS admin</h2>
      <div class="row-nowrap">
        <label class="tiny muted">From <input id="pos_from" type="date"/></label>
        <label class="tiny muted">To <input id="pos_to" type="date"/></label>
        <button class="pill" id="pos_refresh">Refresh</button>
      </div>
    </div>

    <div class="row" style="gap:12px;margin-top:12px;flex-wrap:wrap">
      <div class="card" style="flex:1;min-width:220px">
        <div class="tiny muted">Cash</div>
        <div id="pos_cash" style="font-size:22px;font-weight:800">R0.00</div>
      </div>
      <div class="card" style="flex:1;min-width:220px">
        <div class="tiny muted">Card</div>
        <div id="pos_card" style="font-size:22px;font-weight:800">R0.00</div>
      </div>
      <div class="card" style="flex:1;min-width:220px">
        <div class="tiny muted">Payments</div>
        <div id="pos_count" style="font-size:22px;font-weight:800">0</div>
      </div>
      <div class="card" style="flex:1;min-width:220px">
        <div class="tiny muted">Total</div>
        <div id="pos_total" style="font-size:22px;font-weight:800">R0.00</div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Ticket breakdown</h3>
      <table id="pos_types">
        <tr><th>Ticket type</th><th class="right">Qty</th><th class="right">Revenue</th></tr>
      </table>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Sessions</h3>
      <table id="pos_sessions">
        <tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th class="right">Cash</th><th class="right">Card</th><th></th></tr>
      </table>
    </div>

    <!-- Session drawer -->
    <div id="pos_drawer" class="card" style="display:none;margin-top:12px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 id="sd_title" style="margin:0">Session</h3>
        <button class="pill" id="sd_close">Close</button>
      </div>
      <div class="row" style="gap:12px;margin-top:8px;flex-wrap:wrap">
        <div class="card" style="flex:1;min-width:180px">
          <div class="tiny muted">Cash</div><div id="sd_cash" style="font-weight:700">R0.00</div>
        </div>
        <div class="card" style="flex:1;min-width:180px">
          <div class="tiny muted">Card</div><div id="sd_card" style="font-weight:700">R0.00</div>
        </div>
        <div class="card" style="flex:1;min-width:180px">
          <div class="tiny muted">Payments</div><div id="sd_payments" style="font-weight:700">0</div>
        </div>
      </div>
      <h4>Ticket breakdown</h4>
      <table id="sd_types">
        <tr><th>Ticket type</th><th class="right">Qty</th><th class="right">Revenue</th></tr>
      </table>
      <h4>Payments</h4>
      <table id="sd_list">
        <tr><th>Time</th><th>Order</th><th>Method</th><th class="right">Amount</th></tr>
      </table>
    </div>
  </section>

  <!-- TAB: Visitors -->
  <section id="tab-visitors" class="card" style="display:none">
    <h2>Visitors (live)</h2>
    <p class="muted">Live gate in/out dashboard (placeholder).</p>
  </section>

  <!-- TAB: Yoco -->
  <section id="tab-yoco" class="card" style="display:none">
    <h2>Yoco gateway</h2>
    <p class="muted">Configure Yoco keys & behaviour (placeholder).</p>
  </section>

  <!-- TAB: Tickets tools -->
  <section id="tab-tickets" class="card" style="display:none">
    <h2>Tickets tools</h2>
    <p class="muted">Search tickets, see holder status (in/out), resend WhatsApp/email (placeholder).</p>
  </section>

  <!-- Modal: Create Event -->
  <div id="modal" class="modal">
    <div class="sheet">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Create event</h2>
        <button id="mClose">✕</button>
      </div>
      <div class="grid2" style="margin-top:8px">
        <input id="m_slug" placeholder="slug (e.g. skou-2025)"/>
        <input id="m_name" placeholder="Event name"/>
        <input id="m_venue" placeholder="Venue"/>
        <label>Start date <input id="m_start" type="date"/></label>
        <label>End date <input id="m_end" type="date"/></label>
      </div>
      <div class="grid2" style="margin-top:6px">
        <input id="m_hero" placeholder="Hero image URL (wide banner)"/>
        <input id="m_poster" placeholder="Poster image URL (card/cover)"/>
      </div>
      <label>Gallery URLs (one per line, max 8)
        <textarea id="m_gallery" rows="4" placeholder="https://…/1.jpg\nhttps://…/2.jpg"></textarea>
      </label>
      <div class="row actions">
        <button class="primary" id="mCreate">Create</button>
        <button id="mCancel">Cancel</button>
        <span id="mMsg" class="muted tiny"></span>
      </div>
    </div>
  </div>

</div>

<script>
/* ========== Tabs ========== */
const tabs = {
  site: document.getElementById('tab-site'),
  events: document.getElementById('tab-events'),
  pos: document.getElementById('tab-pos'),
  visitors: document.getElementById('tab-visitors'),
  yoco: document.getElementById('tab-yoco'),
  tickets: document.getElementById('tab-tickets'),
};
document.querySelectorAll('.pill[data-tab]').forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll('.pill[data-tab]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const k = btn.getAttribute('data-tab');
    Object.entries(tabs).forEach(([name,el])=> el.style.display = (name===k?'block':'none'));
    if (k==='pos'){ loadPosOverview(); loadPosSessions(); }
    if (k==='events'){ loadEvents(); }
    if (k==='site'){ loadSite(); }
  };
});

/* ========== Helpers ========== */
function parseLocalDateToMs(dateStr, endOfDay=false){
  if (!dateStr) return NaN;
  const [y,m,d] = dateStr.split('-').map(n=>parseInt(n,10));
  if (!y||!m||!d) return NaN;
  const dt = endOfDay ? new Date(y,m-1,d,23,59,0,0) : new Date(y,m-1,d,0,0,0,0);
  return dt.getTime();
}
function msToDateInput(ms){
  const d = new Date(ms); const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const da=String(d.getDate()).padStart(2,'0');
  return \`\${y}-\${m}-\${da}\`;
}
function tryJ(s){ try{return JSON.parse(s)}catch{return null} }
async function GET(url){ return fetch(url).then(r=>r.json()).catch(()=>({ok:false})) }
async function POST(url,body){ return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({ok:false})) }
async function PUT(url,body){ return fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({ok:false})) }
async function DEL(url){ return fetch(url,{method:'DELETE'}).then(r=>r.json()).catch(()=>({ok:false})) }
const R = (c)=>'R'+((Number(c)||0)/100).toFixed(2);
function ymd(d){ const x = new Date(d); const y=x.getFullYear(), m=String(x.getMonth()+1).padStart(2,'0'), da=String(x.getDate()).padStart(2,'0'); return \`\${y}-${m}-${da}\`; }

/* ========== Site settings ========== */
async function loadSite(){
  const r = await GET('/api/admin/site-settings');
  const s = r.ok ? (r.settings||{}) : {};
  document.getElementById('site_title').value = s.site_title||'';
  document.getElementById('site_banner_url').value = s.site_banner_url||'';
  document.getElementById('site_logo_url').value = s.site_logo_url||'';
  document.getElementById('site_favicon_url').value = s.site_favicon_url||'';
  if (!r.ok) document.getElementById('siteMsg').textContent = 'Could not load settings.';
}
document.getElementById('btnSaveSite').onclick = async ()=>{
  const body = {
    site_title: document.getElementById('site_title').value.trim(),
    site_banner_url: document.getElementById('site_banner_url').value.trim(),
    site_logo_url: document.getElementById('site_logo_url').value.trim(),
    site_favicon_url: document.getElementById('site_favicon_url').value.trim(),
  };
  const r = await POST('/api/admin/site-settings', body);
  document.getElementById('siteMsg').textContent = r.ok ? 'Saved' : (r.error||'Failed to save');
};

/* ========== Events list & edit ========== */
let _events = [];
async function loadEvents(){
  const r = await GET('/api/admin/events');
  _events = r.ok ? (r.events||[]) : [];
  const tbody = document.getElementById('events');
  tbody.innerHTML = '<tr><th>ID</th><th>Slug</th><th>Name</th><th>Starts</th><th>Ends</th><th>Status</th><th></th></tr>' +
    _events.map(e=>{
      const whenS = new Date(e.starts_at*1000).toLocaleDateString();
      const whenE = new Date(e.ends_at*1000).toLocaleDateString();
      return \`
      <tr id="row-\${e.id}">
        <td>\${e.id}</td>
        <td>\${e.slug}</td>
        <td>\${e.name}<div class="tiny muted">\${e.venue||''}</div></td>
        <td>\${whenS}</td>
        <td>\${whenE}</td>
        <td>\${e.status}<span class="tag">\${e.hero_url?'hero':''}</span><span class="tag">\${e.poster_url?'poster':''}</span></td>
        <td>
          <button class="pill" onclick="editEvent(\${e.id})">Edit</button>
          <button class="pill" onclick="deleteEvent(\${e.id})">Delete</button>
        </td>
      </tr>
      <tr id="edit-\${e.id}" style="display:none"><td colspan="7">
        <div class="card" style="margin:8px 0">
          <h3>Edit: \${e.name}</h3>
          <div class="grid2">
            <input id="ed_slug_\${e.id}" placeholder="slug" value="\${e.slug||''}"/>
            <input id="ed_name_\${e.id}" placeholder="name" value="\${e.name||''}"/>
            <input id="ed_venue_\${e.id}" placeholder="venue" value="\${e.venue||''}"/>
            <label>Start <input id="ed_start_\${e.id}" type="date" value="\${msToDateInput(e.starts_at*1000)}"/></label>
            <label>End <input id="ed_end_\${e.id}" type="date" value="\${msToDateInput(e.ends_at*1000)}"/></label>
          </div>
          <div class="grid2">
            <input id="ed_hero_\${e.id}" placeholder="Hero URL" value="\${e.hero_url||''}"/>
            <input id="ed_poster_\${e.id}" placeholder="Poster URL" value="\${e.poster_url||''}"/>
          </div>
          <label>Gallery URLs (one per line, max 8)
            <textarea id="ed_gallery_\${e.id}" rows="3">\${(tryJ(e.gallery_urls)||[]).slice(0,8).join('\\n')}</textarea>
          </label>
          <div class="row actions">
            <button class="primary" onclick="saveEdit(\${e.id})">Save</button>
            <button onclick="toggleEdit(\${e.id}, false)">Close</button>
            <span id="edmsg_\${e.id}" class="muted tiny"></span>
          </div>

          <hr style="border:none;border-top:1px solid #f0f0f0;margin:12px 0"/>

          <h3>Ticket types</h3>
          <div id="ttlist_\${e.id}" class="tiny muted">Loading…</div>
          <div class="row">
            <input id="tt_name_\${e.id}" placeholder="name (e.g. Vrydag · Volwassene)"/>
            <input id="tt_price_\${e.id}" type="number" step="0.01" placeholder="price (R) — blank = FREE"/>
            <label>Gender? <input id="tt_gen_\${e.id}" type="checkbox"/></label>
            <button onclick="addTT(\${e.id})">Add</button>
          </div>

          <h3>Gates</h3>
          <div id="gates_\${e.id}" class="tiny muted">Loading…</div>
          <div class="row">
            <input id="gate_name_\${e.id}" placeholder="New gate name"/>
            <button onclick="addGate(\${e.id})">Add gate</button>
          </div>
        </div>
      </td></tr>\`;
    }).join('');
}

window.editEvent = async function(id){
  const open = document.getElementById('edit-'+id).style.display !== 'table-row';
  toggleEdit(id, open);
  if (open){
    const t = await GET('/api/admin/events/'+id+'/ticket-types');
    renderTTList(id, t.ok?(t.ticket_types||[]):[]);
    const g = await GET('/api/admin/gates'); // global gates for now
    document.getElementById('gates_'+id).innerHTML =
      (g.gates||[]).map((ga,i)=>\`\${i+1}. \${ga.name}\`).join('<br>') || 'No gates';
  }
};
window.toggleEdit = function(id, open){
  document.getElementById('edit-'+id).style.display = open ? 'table-row' : 'none';
};
window.saveEdit = async function(id){
  const body = {
    slug: document.getElementById('ed_slug_'+id).value.trim(),
    name: document.getElementById('ed_name_'+id).value.trim(),
    venue: document.getElementById('ed_venue_'+id).value.trim(),
    starts_at: Math.floor(parseLocalDateToMs(document.getElementById('ed_start_'+id).value)/1000),
    ends_at: Math.floor(parseLocalDateToMs(document.getElementById('ed_end_'+id).value,true)/1000),
    hero_url: document.getElementById('ed_hero_'+id).value.trim(),
    poster_url: document.getElementById('ed_poster_'+id).value.trim(),
    gallery_urls: (document.getElementById('ed_gallery_'+id).value||'').split('\\n').map(s=>s.trim()).filter(Boolean).slice(0,8),
  };
  const r = await PUT('/api/admin/events/'+id, body);
  document.getElementById('edmsg_'+id).textContent = r.ok ? 'Saved' : (r.error||'Failed');
  if (r.ok) loadEvents();
};
window.deleteEvent = async function(id){
  if (!confirm('Delete this event?')) return;
  const r = await DEL('/api/admin/events/'+id);
  if (!r.ok){ alert(r.error||'Failed'); return; }
  loadEvents();
};
function renderTTList(evId, list){
  if (!list.length){ document.getElementById('ttlist_'+evId).textContent = 'No ticket types yet.'; return; }
  document.getElementById('ttlist_'+evId).innerHTML = list.map(t=>
    '<div class="row" style="justify-content:space-between"><div>'+t.name+' <span class="tiny muted">'+(t.price_cents?('R'+(t.price_cents/100).toFixed(2)):'FREE')+(t.requires_gender?' · gender':'')+'</span></div></div>'
  ).join('');
}
window.addTT = async function(evId){
  const name = document.getElementById('tt_name_'+evId).value.trim();
  const rand = document.getElementById('tt_price_'+evId).value.trim();
  const gen = document.getElementById('tt_gen_'+evId).checked;
  if (!name){ alert('Name required'); return; }
  const body = { name, price_rands: rand===''?null:Number(rand), requires_gender: !!gen };
  const r = await POST('/api/admin/events/'+evId+'/ticket-types', body);
  if (!r.ok){ alert(r.error||'Failed'); return; }
  const t = await GET('/api/admin/events/'+evId+'/ticket-types');
  renderTTList(evId, t.ok?(t.ticket_types||[]):[]);
  document.getElementById('tt_name_'+evId).value='';
  document.getElementById('tt_price_'+evId).value='';
  document.getElementById('tt_gen_'+evId).checked=false;
};
window.addGate = async function(evId){
  const name = document.getElementById('gate_name_'+evId).value.trim();
  if (!name){ alert('Gate name required'); return; }
  const r = await POST('/api/admin/gates', { name });
  if (!r.ok){ alert(r.error||'Failed'); return; }
  const g = await GET('/api/admin/gates');
  document.getElementById('gates_'+evId).innerHTML =
    (g.gates||[]).map((ga,i)=>\`\${i+1}. \${ga.name}\`).join('<br>');
  document.getElementById('gate_name_'+evId).value='';
};

/* ========== Create event (modal) ========== */
const modal = document.getElementById('modal');
document.getElementById('btnOpenCreate').onclick = ()=>{ modal.style.display='flex'; };
document.getElementById('mClose').onclick = closeModal;
document.getElementById('mCancel').onclick = closeModal;
function closeModal(){ modal.style.display='none'; document.getElementById('mMsg').textContent=''; }

document.getElementById('mCreate').onclick = async ()=>{
  const start = parseLocalDateToMs(document.getElementById('m_start').value);
  const end = parseLocalDateToMs(document.getElementById('m_end').value,true);
  const msg = document.getElementById('mMsg');
  if (!isFinite(start)||!isFinite(end)){ msg.textContent='Please pick valid dates'; return; }
  const body = {
    slug: document.getElementById('m_slug').value.trim(),
    name: document.getElementById('m_name').value.trim(),
    venue: document.getElementById('m_venue').value.trim(),
    starts_at: Math.floor(start/1000),
    ends_at: Math.floor(end/1000),
    status: 'active',
    hero_url: document.getElementById('m_hero').value.trim(),
    poster_url: document.getElementById('m_poster').value.trim(),
    gallery_urls: (document.getElementById('m_gallery').value||'').split('\\n').map(s=>s.trim()).filter(Boolean).slice(0,8),
  };
  const r = await POST('/api/admin/events', body);
  msg.textContent = r.ok ? 'Created' : (r.error||'Failed');
  if (r.ok){ closeModal(); loadEvents(); document.querySelector('[data-tab="events"]').click(); }
};

/* ========== POS admin logic ========== */
async function loadPosOverview(){
  const from = document.getElementById('pos_from').value;
  const to   = document.getElementById('pos_to').value;
  const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to);
  const o = await GET('/api/admin/pos/overview?'+q.toString());
  if (!o.ok){ console.warn(o.error); return; }
  const cash = o.totals.pos_cash||0, card = o.totals.pos_card||0, count = o.totals.payments||0;
  document.getElementById('pos_cash').textContent = R(cash);
  document.getElementById('pos_card').textContent = R(card);
  document.getElementById('pos_count').textContent = String(count);
  document.getElementById('pos_total').textContent = R(cash+card);
  const tb = document.getElementById('pos_types');
  tb.innerHTML = '<tr><th>Ticket type</th><th class="right">Qty</th><th class="right">Revenue</th></tr>' +
    (o.by_type||[]).map(t=>\`<tr><td>\${t.name}</td><td class="right">\${t.qty||0}</td><td class="right">\${R(t.rev_cents||0)}</td></tr>\`).join('');
}

async function loadPosSessions(){
  const s = await GET('/api/admin/pos/sessions');
  if (!s.ok){ return; }
  const tb = document.getElementById('pos_sessions');
  tb.innerHTML = '<tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th class="right">Cash</th><th class="right">Card</th><th></th></tr>' +
    (s.sessions||[]).map(x=>{
      const opened = new Date((x.opened_at||0)*1000).toLocaleString();
      const closed = x.closed_at ? new Date(x.closed_at*1000).toLocaleString() : '<span class="tiny muted">open</span>';
      return \`<tr>
        <td>\${x.id}</td>
        <td>\${x.cashier_name}</td>
        <td>\${x.gate_name||('Gate '+x.gate_id)}</td>
        <td>\${opened}</td>
        <td>\${closed}</td>
        <td class="right">\${R(x.cash_cents||0)}</td>
        <td class="right">\${R(x.card_cents||0)}</td>
        <td><button class="pill" onclick="viewSession(\${x.id})">View</button></td>
      </tr>\`;
    }).join('');
}

window.viewSession = async function(id){
  const r = await GET('/api/admin/pos/sessions/'+id);
  if (!r.ok){ alert(r.error||'Failed to load'); return; }
  document.getElementById('pos_drawer').style.display='block';
  document.getElementById('sd_title').textContent = \`Session #\${r.session.id} · \${r.session.cashier_name} · \${r.session.gate_name||('Gate '+r.session.gate_id)}\`;
  let cash=0, card=0, cnt=0;
  for (const t of (r.totals||[])){
    if (t.method==='pos_cash') cash = Number(t.total_cents)||0;
    if (t.method==='pos_card') card = Number(t.total_cents)||0;
    cnt += Number(t.payments)||0;
  }
  document.getElementById('sd_cash').textContent = R(cash);
  document.getElementById('sd_card').textContent = R(card);
  document.getElementById('sd_payments').textContent = String(cnt);
  document.getElementById('sd_types').innerHTML =
    '<tr><th>Ticket type</th><th class="right">Qty</th><th class="right">Revenue</th></tr>' +
    (r.by_type||[]).map(t=>\`<tr><td>\${t.name}</td><td class="right">\${t.qty||0}</td><td class="right">\${R(t.rev_cents||0)}</td></tr>\`).join('');
  document.getElementById('sd_list').innerHTML =
    '<tr><th>Time</th><th>Order</th><th>Method</th><th class="right">Amount</th></tr>' +
    (r.payments||[]).map(p=>{
      const ts = new Date((p.created_at||0)*1000).toLocaleString();
      const m  = p.method==='pos_cash'?'Cash':'Card';
      return \`<tr><td>\${ts}</td><td>\${p.order_id}</td><td>\${m}</td><td class="right">\${R(p.amount_cents||0)}</td></tr>\`;
    }).join('');
};
document.getElementById('sd_close').onclick = ()=>{ document.getElementById('pos_drawer').style.display='none'; };
document.getElementById('pos_refresh').onclick = ()=>{ loadPosOverview(); };

/* ========== Init ========== */
async function init(){
  // Default POS date window: last 7 days
  const today = new Date(), start = new Date(Date.now()-6*86400000);
  document.getElementById('pos_from').value = ymd(start);
  document.getElementById('pos_to').value   = ymd(today);

  await loadSite();
  await loadEvents();
}
init();
</script>
</body></html>`;
