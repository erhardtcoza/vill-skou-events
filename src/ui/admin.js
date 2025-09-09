// src/ui/admin.js
import { LOGO_URL } from "../constants.js";

export function adminHTML() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Admin dashboard</title>
<style>
:root{--pad:14px;--gap:10px;--mut:#6b7280;--fg:#0f172a;--bg:#f8fafc;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial}
.wrap{max-width:1060px;margin:0 auto;padding:var(--pad)}
.nav{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
.nav a{padding:.6rem .9rem;border-radius:.6rem;background:#fff;border:1px solid #e5e7eb;text-decoration:none;color:var(--fg)}
.nav a.active{background:#111827;color:#fff;border-color:#111827}
.h1{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.6rem}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:12px 0}
.table{display:grid;gap:8px}
.th,.tr{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:8px;align-items:center}
.th{font-weight:600}
.badge{display:inline-block;padding:.2rem .5rem;border-radius:.5rem;background:#eef2ff;font-size:.78rem}
input,select,button{padding:.72rem .95rem;border-radius:.6rem;border:1px solid #e5e7eb}
button.primary{background:#111827;color:#fff;border-color:#111827}
button.ghost{background:#fff}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width: 760px){ .th,.tr{grid-template-columns:1fr 1fr} .row{grid-template-columns:1fr} button,input,select{width:100%}}
.small{color:var(--mut);font-size:.86rem}
.right{justify-self:end}
.hidden{display:none}
</style>
</head><body><div class="wrap">

<div class="h1"><img src="${LOGO_URL}" alt="logo" height="60"/> Admin dashboard</div>

<nav class="nav">
  <a href="#tickets" class="active">Tickets</a>
  <a href="#pos">POS Admin</a>
  <a href="#vendors">Vendors</a>
  <a href="#users">Users</a>
  <a href="#events">Events</a>
  <a href="#settings">Site settings</a>
</nav>

<div id="view"></div>

</div>
<script>
const $ = (s, el=document) => el.querySelector(s);
const API = (p, opt) => fetch(p, opt);
function toast(msg, ok=true){ const t=document.createElement('div'); t.textContent=msg; t.style.cssText="position:fixed;left:12px;right:12px;bottom:16px;padding:12px;border-radius:10px;background:"+(ok?"#111827":"#991b1b")+";color:#fff;text-align:center;z-index:50"; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }

async function loadEvents(){ const r=await API('/api/events'); return r.ok? r.json():[]; }
async function loadEventStats(id){ const r=await API('/api/events/'+id+'/stats'); return r.ok? r.json():[]; }
async function loadEventDetail(id){ const r=await API('/api/events/'+id+'/detail'); return r.ok? r.json():{event:null,ticket_types:[]}; }
async function loadTemplates(){ const r=await API('/api/templates'); return r.ok? r.json():[]; }
async function loadVendors(eventId){ const r=await API('/api/vendors?event_id='+eventId); return r.ok? r.json():[]; }
async function loadUsers(){ const r=await API('/api/users'); return r.ok? r.json():[]; }
async function loadOrder(code){ const r=await API('/api/admin/orders/'+encodeURIComponent(code)); return r.ok? r.json():null; }

/* ------------ Tickets ------------ */
function viewTickets(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = \`
    <div class="row">
      <label>Pick event<select id="evSel"></select></label>
      <div></div>
    </div>
    <div id="stats" class="table" style="margin-top:8px">
      <div class="th"><div>Type</div><div>Sold</div><div>Checked in</div><div>Void</div><div>Total</div><div>Capacity</div></div>
      <div id="rows"></div>
    </div>
    <div class="card">
      <div class="row">
        <input id="ordercode" placeholder="Order code (e.g. 3VLNT5)"/>
        <button id="lookup" class="ghost">Lookup</button>
      </div>
      <div id="orderBox" class="small" style="margin-top:8px"></div>
      <div id="waBox" class="row hidden" style="margin-top:10px">
        <input id="waphone" placeholder="27XXXXXXXXX"/>
        <button id="sendwa" class="primary">Send ticket via WhatsApp</button>
        <div class="small" style="grid-column:1/-1">Uses default template (e.g. ticket_delivery / af)</div>
      </div>
    </div>\`;
  el.appendChild(card);

  const evSel = $('#evSel', card), rows=$('#rows', card);
  loadEvents().then(list=>{
    list.forEach(e=>{ const o=document.createElement('option'); o.value=e.id; o.textContent=e.name; evSel.appendChild(o); });
    if (list[0]) refreshStats(list[0].id);
  });
  evSel.onchange = ()=> refreshStats(evSel.value);

  async function refreshStats(id){
    rows.innerHTML=''; const stats=await loadEventStats(id);
    stats.forEach(s=>{ const tr=document.createElement('div'); tr.className='tr';
      tr.innerHTML=\`<div>\${s.name}</div><div>\${s.sold||0}</div><div>\${s.checked_in||0}</div><div>\${s.void||0}</div><div>\${s.total||0}</div><div>\${s.capacity||0}</div>\`;
      rows.appendChild(tr);
    });
  }

  $('#lookup', card).onclick = async ()=>{
    const code = ($('#ordercode', card).value||'').trim();
    if (!code) return toast('Enter order code', false);
    const data = await loadOrder(code);
    const box = $('#orderBox', card);
    if (!data || data.error){ box.textContent = (data && data.error) || 'Order not found'; $('#waBox', card).classList.add('hidden'); return; }
    const o=data.order, items=data.items||[], tickets=data.tickets||[];
    box.innerHTML = '<b>Order:</b> '+o.code+' — '+(o.buyer_name||'')+' '+(o.buyer_phone||'')+'<br/>'+
      '<b>Items:</b> '+ (items.map(i=>\`\${i.ticket_type} x\${i.qty}\`).join(', ')||'—') + '<br/>'+
      '<b>Tickets:</b> '+ (tickets.length||0);
    $('#waBox', card).classList.remove('hidden');
  };

  $('#sendwa', card).onclick = async ()=>{
    const code = ($('#ordercode', card).value||'').trim();
    const to = ($('#waphone', card).value||'').trim();
    if (!code) return toast('Enter order code', false);
    if (!to) return toast('Enter phone (E.164 without +)', false);
    const r = await API('/api/admin/orders/'+encodeURIComponent(code)+'/whatsapp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to }) });
    const J = await r.json(); (r.ok && J.ok) ? toast('Sent ✓') : toast((J.error||'Failed'), false);
  };
}

/* ------------ POS Admin (restore) ------------ */
function viewPOS(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  // Link back to original POS summary page
  card.innerHTML = '<a class="primary" style="display:inline-block;text-decoration:none;padding:.72rem .95rem;border-radius:.6rem;background:#111827;color:#fff" href="/pos" target="_blank">Open POS Sessions & Cash-up Summary</a>';
  el.appendChild(card);
}

/* ------------ Vendors (event -> vendors -> generate) ------------ */
function viewVendors(){
  const el = document.getElementById('view'); el.innerHTML='';
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = \`
    <div class="row">
      <label>Event<select id="evSel"></select></label>
      <label>Vendor<select id="vendorSel"></select></label>
    </div>
    <div class="row">
      <input id="qty" type="number" min="1" value="10"/>
      <button id="gen" class="primary">Generate tickets & badges</button>
    </div>\`;
  el.appendChild(card);

  const evSel=$('#evSel',card), vendorSel=$('#vendorSel',card);
  loadEvents().then(async list=>{
    list.forEach(e=>{ const o=document.createElement('option'); o.value=e.id; o.textContent=e.name; evSel.appendChild(o); });
    if (list[0]) await fillVendors(list[0].id);
  });
  evSel.onchange = ()=> fillVendors(evSel.value);

  async function fillVendors(eventId){
    vendorSel.innerHTML=''; const vs=await loadVendors(eventId);
    vs.forEach(v=>{ const o=document.createElement('option'); o.value=v.id; o.textContent=v.name; vendorSel.appendChild(o); });
  }

  $('#gen', card).onclick = async ()=>{
    const vid=vendorSel.value, eid=evSel.value, qty=+($('#qty',card).value||0);
    if(!vid||!eid||qty<1) return toast('Select event, vendor and qty', false);
    const r=await API('/api/vendors/'+vid+'/passes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:+eid,count:qty})});
    const J=await r.json(); r.ok? toast('Generated '+(J.generated||0)) : toast('Failed',false);
  };
}

/* ------------ Users (list + CRUD) ------------ */
function viewUsers(){
  const el=document.getElementById('view'); el.innerHTML='';
  const card=document.createElement('div'); card.className='card';
  card.innerHTML=\`
    <div class="row">
      <input id="email" placeholder="Email"/>
      <input id="name" placeholder="Name"/>
    </div>
    <div class="row">
      <select id="role"><option value="admin">admin</option><option value="pos">pos</option><option value="scan">scan</option></select>
      <button id="add" class="primary">Create user</button>
    </div>
    <div id="list" class="table" style="margin-top:10px"></div>\`;
  el.appendChild(card);

  async function render(){
    const list=await loadUsers(); const L=$('#list',card);
    L.innerHTML='<div class="th"><div>ID</div><div>Email</div><div>Name</div><div>Role</div><div>Active</div><div class="right">Actions</div></div>';
    list.forEach(u=>{ const tr=document.createElement('div'); tr.className='tr';
      tr.innerHTML=\`<div>\${u.id}</div><div>\${u.email}</div><div>\${u.name||''}</div><div>\${u.role}</div><div>\${u.is_active? 'Yes':'No'}</div><div class="right"><button data-id="\${u.id}" class="ghost e">Edit</button><button data-id="\${u.id}" class="ghost d">Delete</button></div>\`;
      L.appendChild(tr);
    });
    L.querySelectorAll('.d').forEach(b=> b.onclick=async()=>{ const id=b.getAttribute('data-id'); if(!confirm('Delete user '+id+'?')) return; const r=await API('/api/users/'+id,{method:'DELETE'}); r.ok? toast('Deleted'): toast('Delete failed',false); render(); });
    L.querySelectorAll('.e').forEach(b=> b.onclick=async()=>{ const id=b.getAttribute('data-id'); const role=prompt('Role (admin/pos/scan)?'); if(!role) return; const r=await API('/api/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})}); r.ok? toast('Saved'): toast('Save failed',false); render(); });
  }
  render();

  $('#add',card).onclick=async()=>{ const email=$('#email',card).value.trim(); const name=$('#name',card).value.trim(); const role=$('#role',card).value; if(!email) return toast('Email required',false);
    const r=await API('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,name,role})}); r.ok? toast('Created'): toast('Create failed',false); render();
  };
}

/* ------------ Events (details + ticket types editor) ------------ */
function viewEvents(){
  const el=document.getElementById('view'); el.innerHTML='';
  const card=document.createElement('div'); card.className='card';
  card.innerHTML=\`
    <div class="row">
      <input id="slug" placeholder="slug (e.g. skou-2025)"/>
      <input id="name" placeholder="Event name"/>
    </div>
    <div class="row">
      <input id="venue" placeholder="Venue"/>
      <button id="add" class="primary">Add event</button>
    </div>
    <div id="elist" class="table" style="margin-top:10px"></div>
    <div id="edetail"></div>\`;
  el.appendChild(card);

  async function render(){
    const list=await loadEvents(); const L=$('#elist',card);
    L.innerHTML='<div class="th"><div>ID</div><div>Slug</div><div>Name</div><div>Venue</div><div class="right">Actions</div><div></div></div>';
    list.forEach(e=>{ const tr=document.createElement('div'); tr.className='tr';
      tr.innerHTML=\`<div>\${e.id}</div><div>\${e.slug}</div><div>\${e.name}</div><div>\${e.venue||''}</div><div class="right"><button data-id="\${e.id}" class="ghost v">View / Edit</button><button data-id="\${e.id}" class="ghost d">Delete</button></div><div></div>\`;
      L.appendChild(tr);
    });
    L.querySelectorAll('.d').forEach(b=> b.onclick=async()=>{ const id=b.getAttribute('data-id'); if(!confirm('Delete event '+id+'?')) return; const r=await API('/api/events/'+id,{method:'DELETE'}); r.ok? toast('Deleted'): toast('Delete failed',false); render(); });
    L.querySelectorAll('.v').forEach(b=> b.onclick=()=> showDetail(b.getAttribute('data-id')));
  }
  render();

  $('#add',card).onclick=async()=>{ const slug=$('#slug',card).value.trim(); const name=$('#name',card).value.trim(); const venue=$('#venue',card).value.trim(); if(!slug||!name) return toast('Slug and name required',false);
    const r=await API('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,name,venue})}); r.ok? toast('Added'): toast('Add failed',false); render(); };

  async function showDetail(id){
    const box=$('#edetail',card); const d=await loadEventDetail(id); if(!d.event){ box.textContent='Not found'; return; }
    box.innerHTML = \`
      <div class="card">
        <div class="row">
          <input id="e_name" value="\${d.event.name||''}"/>
          <input id="e_venue" value="\${d.event.venue||''}"/>
        </div>
        <div class="row"><button id="saveEv" class="primary">Save event</button></div>
        <div class="table" style="margin-top:8px">
          <div class="th"><div>Ticket type</div><div>Price (c)</div><div>Capacity</div><div>Per order</div><div>Gender req</div><div class="right">Actions</div></div>
          <div id="ttRows"></div>
        </div>
        <div class="row" style="margin-top:10px">
          <input id="tt_name" placeholder="Type name"/>
          <input id="tt_price" placeholder="Price cents"/>
          <input id="tt_cap" placeholder="Capacity"/>
          <input id="tt_limit" placeholder="Per-order"/>
          <select id="tt_gender"><option>No</option><option>Yes</option></select>
          <button id="tt_add" class="primary">Add ticket type</button>
        </div>
      </div>\`;

    $('#saveEv',box).onclick=async()=>{ const r=await API('/api/events/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#e_name',box).value,venue:$('#e_venue',box).value})}); r.ok? toast('Saved'): toast('Failed',false); };

    function renderTT(){
      const R=$('#ttRows',box); R.innerHTML=''; (d.ticket_types||[]).forEach(t=>{ const tr=document.createElement('div'); tr.className='tr';
        tr.innerHTML=\`<div>\${t.name}</div><div>\${t.price_cents}</div><div>\${t.capacity}</div><div>\${t.per_order_limit}</div><div>\${t.gender_required}</div><div class="right"><button data-id="\${t.id}" class="ghost e">Edit</button><button data-id="\${t.id}" class="ghost d">Delete</button></div>\`; R.appendChild(tr); });
      R.querySelectorAll('.d').forEach(b=> b.onclick=async()=>{ const idd=b.getAttribute('data-id'); const r=await API('/api/ticket-types/'+idd,{method:'DELETE'}); r.ok? toast('Deleted'): toast('Failed',false); showDetail(id); });
      R.querySelectorAll('.e').forEach(b=> b.onclick=async()=>{ const idd=b.getAttribute('data-id'); const price=prompt('New price (cents)?'); if(!price) return; const r=await API('/api/ticket-types/'+idd,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({price_cents:+price})}); r.ok? toast('Saved'): toast('Failed',false); showDetail(id); });
    }
    renderTT();

    $('#tt_add',box).onclick=async()=>{ const b={ name:$('#tt_name',box).value, price_r:(+($('#tt_price',box).value||0))/100, capacity:+($('#tt_cap',box).value||0), per_order_limit:+($('#tt_limit',box).value||0), gender_required:$('#tt_gender',box).value };
      if(!b.name) return toast('Name required',false);
      const r=await API('/api/events/'+id+'/ticket-types',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); r.ok? toast('Added'): toast('Failed',false); showDetail(id);
    };
  }
}

/* ------------ Site settings + WhatsApp Templates nested ------------ */
function viewSettings(){
  const el=document.getElementById('view'); el.innerHTML='';
  const card=document.createElement('div'); card.className='card';
  card.innerHTML='<div class="small" style="margin-bottom:10px">Site settings (as before).</div><div id="tpl"></div>';
  el.appendChild(card);

  // WhatsApp Templates subsection
  const tBox = $('#tpl',card);
  tBox.innerHTML = \`
    <h3>WhatsApp templates</h3>
    <div class="row"><button id="sync" class="primary">Sync from Meta</button></div>
    <div id="list" class="table" style="margin-top:10px"></div>\`;

  async function renderT(){
    const list=await loadTemplates(); const listEl=$('#list',tBox);
    listEl.innerHTML='<div class="th"><div>Name</div><div>Lang</div><div>Status</div><div>Category</div><div>Default</div><div class="right">Actions</div></div>';
    list.forEach(t=>{ const tr=document.createElement('div'); tr.className='tr';
      tr.innerHTML=\`<div>\${t.name}</div><div>\${t.lang}</div><div><span class="badge">\${t.status}</span></div><div>\${t.category||''}</div><div>\${t.is_default?'✓':''}</div><div class="right"><button class="ghost def" data-name="\${t.name}">Set default</button><button class="ghost edit" data-name="\${t.name}">Edit</button></div>\`; listEl.appendChild(tr); });
    listEl.querySelectorAll('.def').forEach(b=> b.onclick=()=> updateT(b.getAttribute('data-name'),{is_default:1}));
    listEl.querySelectorAll('.edit').forEach(b=> b.onclick=async()=>{ const name=b.getAttribute('data-name'); const lang=prompt('Language code?'); if(!lang) return; updateT(name,{lang}); });
  }
  async function updateT(name,data){ const r=await API('/api/templates/'+encodeURIComponent(name),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); r.ok? toast('Saved'): toast('Save failed',false); renderT(); }
  $('#sync',tBox).onclick=async()=>{ const r=await API('/api/templates/sync',{method:'POST'}); const J=await r.json(); r.ok? toast('Synced '+(J.count||0)): toast('Sync failed',false); renderT(); };
  renderT();
}

/* ------------ Router ------------ */
function route(){
  const hash=(location.hash||'#tickets').replace('#','');
  document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+hash));
  if(hash==='tickets') return viewTickets();
  if(hash==='pos') return viewPOS();
  if(hash==='vendors') return viewVendors();
  if(hash==='users') return viewUsers();
  if(hash==='events') return viewEvents();
  if(hash==='settings') return viewSettings();
  viewTickets();
}
addEventListener('hashchange', route); route();
</script>
</body></html>`;
}
