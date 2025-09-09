// src/ui/admin.js
function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function adminHTML() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{--green:#0a7d2b;--bg:#f6f7f7;--muted:#667085}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101113}
  .wrap{max-width:1100px;margin:18px auto;padding:0 14px}
  h1{margin:0 0 10px}
  nav.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
  .tab{padding:8px 12px;border-radius:999px;background:#e9f2ea;color:#0c3f1a;text-decoration:none;font-weight:600}
  .tab.active{background:#cfe9d7}
  .card{background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06);padding:14px;margin:10px 0}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #eef1f3;text-align:left}
  .muted{color:var(--muted)}
  input,select,button,textarea{font:inherit}
  input,select,textarea{padding:8px 10px;border:1px solid #e5e7eb;border-radius:10px}
  button{padding:8px 12px;border-radius:10px;border:0;background:var(--green);color:#fff;cursor:pointer}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
</style>
</head>
<body>
<div class="wrap">
  <h1>Admin dashboard</h1>
  <nav class="tabs" id="tabs"></nav>
  <div id="view" class="card">Loading…</div>
</div>

<script>
const $, $$ = (sel,root=document)=>root.querySelector(sel), (sel,root=document)=>Array.from(root.querySelectorAll(sel));

const TABS = [
  { id:"events",  label:"Events" },
  { id:"tickets", label:"Tickets" },
  { id:"pos",     label:"POS Admin" },
  { id:"vendors", label:"Vendors" },
  { id:"users",   label:"Users" },
  { id:"site",    label:"Site settings" }
];

function nav() {
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = TABS.map(t => '<a class="tab" data-id="'+t.id+'" href="#'+t.id+'">'+t.label+'</a>').join('');
  tabs.addEventListener('click', (e)=>{
    const a = e.target.closest('a.tab'); if(!a) return;
    e.preventDefault();
    location.hash = a.dataset.id;
    render();
  });
  render();
}

async function api(url, opt){ const r = await fetch(url, opt||{}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }

async function render() {
  const id = (location.hash||"#events").slice(1);
  $$('.tab', document.getElementById('tabs')).forEach(x=>x.classList.toggle('active', x.dataset.id===id));
  const v = document.getElementById('view');
  if (id==="events") return renderEvents(v);
  if (id==="tickets") return renderTickets(v);
  if (id==="pos") return renderPOS(v);
  if (id==="vendors") return renderVendors(v);
  if (id==="users") return renderUsers(v);
  if (id==="site") return renderSite(v);
  v.textContent = "Unknown section.";
}

/* ---------------- Events ---------------- */
async function renderEvents(v){
  v.innerHTML = '<div class="muted">Loading events…</div>';
  const data = await api('/api/admin/events').catch(()=>({ok:false,events:[]}));
  const rows = (data.events||[]).map(ev =>
    '<tr>'+
      '<td>'+esc(ev.id)+'</td>'+
      '<td>'+esc(ev.slug)+'</td>'+
      '<td>'+esc(ev.name)+'</td>'+
      '<td>'+esc(ev.venue||"")+'</td>'+
      '<td>'+fmtDate(ev.starts_at)+' – '+fmtDate(ev.ends_at)+'</td>'+
      '<td>'+esc(ev.status)+'</td>'+
    '</tr>'
  ).join('');
  v.innerHTML =
    '<div class="row"><button id="newEv">New event</button></div>'+
    '<div class="card" style="margin:10px 0 0">'+
      '<table><thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Venue</th><th>When</th><th>Status</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>'+
    '</div>';
  document.getElementById('newEv').onclick = ()=> promptCreateEvent();
}

function promptCreateEvent(){
  const slug = prompt('Slug (e.g. skou-2025)');
  if(!slug) return;
  const name = prompt('Name'); if(!name) return;
  const venue = prompt('Venue')||'';
  const starts = Number(prompt('Starts (unix seconds)')||0);
  const ends   = Number(prompt('Ends (unix seconds)')||0);
  fetch('/api/admin/events',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({slug,name,venue,starts_at:starts,ends_at:ends})}).then(()=>location.reload());
}

/* ---------------- Tickets ---------------- */
async function renderTickets(v){
  // Choose event → show totals & by type
  const evs = await api('/api/admin/events').catch(()=>({events:[]}));
  const opts = (evs.events||[]).map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.slug)+')</option>').join('');
  v.innerHTML =
    '<div class="row"><select id="evSel"><option value="">Select event…</option>'+opts+'</select>'+
    '<button id="loadTk">Load</button></div>'+
    '<div id="tkOut" class="card" style="margin-top:8px"></div>'+
    '<div class="card" style="margin-top:8px">'+
      '<div class="row"><input id="ordCode" placeholder="Order code (e.g. ABC123)" />'+
      '<input id="waTo" placeholder="WhatsApp MSISDN (e.g. 27718878933)"/>'+
      '<button id="sendWA">Send via WhatsApp</button></div>'+
      '<div id="waMsg" class="muted" style="margin-top:6px"></div>'+
    '</div>';
  document.getElementById('loadTk').onclick = async ()=>{
    const id = Number(document.getElementById('evSel').value||0);
    if (!id) return;
    const d = await api('/api/admin/tickets/summary/'+id).catch(()=>({ok:false}));
    const out = document.getElementById('tkOut');
    if (!d.ok){ out.textContent = 'Failed to load.'; return; }
    const totals = (d.totals||[]).map(t=>'<div>'+esc(t.state)+': <b>'+Number(t.n||0)+'</b></div>').join('');
    const by = (d.by_type||[]).map(r=>'<tr><td>'+esc(r.ticket_type_id)+'</td><td>'+esc(r.name)+'</td><td>'+Number(r.sold||0)+'</td></tr>').join('');
    out.innerHTML =
      '<div class="row">'+totals+'</div>'+
      '<table style="margin-top:8px"><thead><tr><th>Type ID</th><th>Name</th><th>Sold</th></tr></thead><tbody>'+by+'</tbody></table>';
  };
  document.getElementById('sendWA').onclick = async ()=>{
    const code = (document.getElementById('ordCode').value||'').trim();
    const to   = (document.getElementById('waTo').value||'').trim();
    if (!code || !to){ return document.getElementById('waMsg').textContent = 'Enter code and MSISDN.'; }
    document.getElementById('waMsg').textContent = 'Sending…';
    const r = await fetch('/api/admin/whatsapp/send',{method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({ code, to })});
    const j = await r.json().catch(()=>({ok:false}));
    document.getElementById('waMsg').textContent = j.ok ? 'Sent.' : ('Failed: '+(j.error||''));
  };
}

/* ---------------- POS Admin ---------------- */
async function renderPOS(v){
  v.innerHTML = '<div class="muted">Loading sessions…</div>';
  const d = await api('/api/admin/pos/sessions').catch(()=>({ok:false,sessions:[]}));
  if (!d.ok){ v.textContent='Failed to load.'; return; }
  const rows = (d.sessions||[]).map(s=>
    '<tr>'+
      '<td>'+esc(s.id)+'</td>'+
      '<td>'+esc(s.cashier_name)+'</td>'+
      '<td>'+(s.cashier_msisdn?esc(s.cashier_msisdn):'')+'</td>'+
      '<td>'+esc(s.gate_id)+'</td>'+
      '<td>'+fmtDT(s.opened_at)+'</td>'+
      '<td>'+(s.closed_at?fmtDT(s.closed_at):'-')+'</td>'+
      '<td>'+rands(s.opening_float_cents||0)+'</td>'+
      '<td>'+rands(s.cash_cents||0)+'</td>'+
      '<td>'+rands(s.card_cents||0)+'</td>'+
      '<td>'+(s.closing_manager?esc(s.closing_manager):'-')+'</td>'+
    '</tr>'
  ).join('');
  v.innerHTML =
    '<div class="card">'+
      '<table><thead><tr>'+
      '<th>ID</th><th>Cashier</th><th>MSISDN</th><th>Gate</th><th>Opened</th><th>Closed</th>'+
      '<th>Float</th><th>Cash</th><th>Card</th><th>Closed by</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>'+
    '</div>';
}

/* ---------------- Vendors ---------------- */
async function renderVendors(v){
  const evs = await api('/api/admin/events').catch(()=>({events:[]}));
  const opts = (evs.events||[]).map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.slug)+')</option>').join('');
  v.innerHTML =
    '<div class="row"><select id="vEv"><option value="">Select event…</option>'+opts+'</select>'+
    '<button id="vLoad">Load</button><button id="vNew">New vendor</button></div>'+
    '<div id="vOut" class="card" style="margin-top:8px"></div>';
  document.getElementById('vLoad').onclick = async ()=>{
    const id = Number(document.getElementById('vEv').value||0);
    if (!id) return;
    const d = await api('/api/admin/vendors/'+id).catch(()=>({ok:false}));
    const out = document.getElementById('vOut');
    if (!d.ok){ out.textContent='Failed to load.'; return; }
    const rows = (d.vendors||[]).map(vd =>
      '<tr>'+
        '<td>'+esc(vd.id)+'</td>'+
        '<td>'+esc(vd.name)+'</td>'+
        '<td>'+esc(vd.contact_name||"")+'</td>'+
        '<td>'+esc(vd.phone||"")+'</td>'+
        '<td>'+esc(vd.email||"")+'</td>'+
        '<td>'+esc(vd.stand_number||"")+'</td>'+
        '<td>'+Number(vd.staff_quota||0)+'</td>'+
        '<td>'+Number(vd.vehicle_quota||0)+'</td>'+
        '<td><button data-ed="'+vd.id+'">Edit</button></td>'+
      '</tr>'
    ).join('');
    out.innerHTML =
      '<table><thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th><th>Staff</th><th>Vehicle</th><th></th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>';
    out.querySelectorAll('button[data-ed]').forEach(b=>{
      b.onclick = ()=> editVendor(Number(b.dataset.ed), id);
    });
  };
  document.getElementById('vNew').onclick = async ()=>{
    const ev = Number(document.getElementById('vEv').value||0);
    if (!ev) return alert('Select event first.');
    const name = prompt('Vendor name'); if(!name) return;
    await fetch('/api/admin/vendors/'+ev,{method:'POST',headers:{'content-type':'application/json'},body: JSON.stringify({name})});
    document.getElementById('vLoad').click();
  };
}

async function editVendor(id, event_id){
  const name = prompt('Vendor name (leave blank to keep)');
  const body = {};
  if (name) body.name = name;
  await fetch('/api/admin/vendors/'+id,{method:'PUT',headers:{'content-type':'application/json'},body: JSON.stringify(body)});
  document.getElementById('vLoad').click();
}

/* ---------------- Users ---------------- */
async function renderUsers(v){
  const d = await api('/api/admin/users').catch(()=>({ok:false,users:[]}));
  if (!d.ok){ v.textContent='Failed to load.'; return; }
  const rows = (d.users||[]).map(u =>
    '<tr><td>'+esc(u.id)+'</td><td>'+esc(u.username)+'</td><td>'+esc(u.role)+'</td></tr>'
  ).join('');
  v.innerHTML = '<table><thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

/* ---------------- Site settings (placeholder) ---------------- */
async function renderSite(v){
  const d = await api('/api/admin/site-settings').catch(()=>({ok:false}));
  v.innerHTML = d.ok
    ? '<div class="muted">Settings loaded. (WhatsApp managed via Worker env for now.)</div>'
    : '<div class="muted">Settings not available.</div>';
}

/* ---------------- helpers ---------------- */
function fmtDate(s){ if(!s) return '-'; const d=new Date(Number(s)*1000); return d.toLocaleDateString(); }
function fmtDT(s){ if(!s) return '-'; const d=new Date(Number(s)*1000); return d.toLocaleString(); }
function rands(c){ return 'R'+((Number(c)||0)/100).toFixed(2); }

nav();
</script>
</body>
</html>`;
}