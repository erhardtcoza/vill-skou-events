// src/ui/admin.js
import { LOGO_URL } from "../constants.js";

export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:18px auto; padding:0 14px }
  h1{ margin:0 0 10px } .muted{ color:var(--muted) }
  .tabs{ display:flex; gap:8px; flex-wrap:wrap; margin:10px 0 14px }
  .tab{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600 }
  .tab.active{ background:var(--green); border-color:transparent; color:#fff }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; margin-bottom:12px }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
  @media (max-width:860px){ .row{ grid-template-columns:1fr; } }
  label{ display:block; font-size:13px; color:#444; margin:10px 0 6px }
  input, select, textarea{ width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:700 }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .btn.danger{ background:#b42318; color:#fff; border-color:transparent }
  .btn.small{ font-weight:600; padding:8px 10px }
  .pill{ display:inline-block; font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#444 }
  table{ width:100%; border-collapse:collapse; }
  th, td{ text-align:left; padding:8px 6px; border-bottom:1px solid #f1f3f5; vertical-align:top }
  .right{ text-align:right }
  .mt6{ margin-top:6px } .mt10{ margin-top:10px } .mt14{ margin-top:14px } .mt18{ margin-top:18px }
  .ok{ color:#0a7d2b; font-weight:700 }
  .err{ color:#b42318; font-weight:700 }
  .panel{ display:none } .panel.active{ display:block }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>
  <div class="tabs">
    <button class="tab" data-panel="events">Events</button>
    <button class="tab" data-panel="tickets">Tickets</button>
    <button class="tab" data-panel="pos">POS Admin</button>
    <button class="tab" data-panel="vendors">Vendors</button>
    <button class="tab" data-panel="users">Users</button>
    <button class="tab" data-panel="settings">Site Settings</button>
  </div>

  <!-- Events -->
  <section id="panel-events" class="panel card">
    <div class="muted mt6">Quick list of events. (Add/Edit preserved elsewhere; this keeps the UI light.)</div>
    <div id="evList" class="mt10">Loading…</div>
  </section>

  <!-- Tickets -->
  <section id="panel-tickets" class="panel card">
    <div class="row">
      <div>
        <label>Kies event</label>
        <select id="tEvent"></select>
      </div>
      <div>
        <label>Orderkode (bv. C0AB12)</label>
        <div style="display:flex; gap:8px">
          <input id="orderCode" placeholder="Order Short Code"/>
          <button id="btnLookupOrder" class="btn">Soek</button>
        </div>
      </div>
    </div>
    <div id="tixSummary" class="mt14 muted">Laai…</div>
    <div id="orderResult" class="mt10"></div>
  </section>

  <!-- POS -->
  <section id="panel-pos" class="panel card">
    <div class="muted">POS shifts en totals.</div>
    <div id="posStats" class="mt10">Laai…</div>
  </section>

  <!-- Vendors -->
  <section id="panel-vendors" class="panel card">
    <div class="row">
      <div>
        <label>Kies event</label>
        <select id="vEvent"></select>
      </div>
      <div style="display:flex; align-items:flex-end; gap:8px">
        <button id="btnLoadVendors" class="btn">Laai Vendors</button>
        <button id="btnAddVendor" class="btn primary">Voeg Vendor by</button>
      </div>
    </div>
    <div id="vendorsList" class="mt14">—</div>
  </section>

  <!-- Users -->
  <section id="panel-users" class="panel card">
    <div class="muted">Sisteem gebruikers.</div>
    <div id="userList" class="mt10">Laai…</div>
  </section>

  <!-- Settings -->
  <section id="panel-settings" class="panel">
    <div class="card">
      <h2 style="margin:0 0 8px">WhatsApp</h2>
      <div class="row">
        <div>
          <label>Public Base URL</label>
          <input id="s_public_base_url" placeholder="https://tickets.villiersdorpskou.co.za"/>
        </div>
        <div>
          <label>VERIFY_TOKEN</label>
          <input id="s_verify_token" placeholder="vs-verify-2025"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>PHONE_NUMBER_ID</label>
          <input id="s_phone_id" placeholder="7802…"/>
        </div>
        <div>
          <label>Access Token</label>
          <input id="s_wa_token" placeholder="EAAG…"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Default Template Name</label>
          <input id="s_wa_tmpl" placeholder="ticket_delivery"/>
        </div>
        <div>
          <label>Template Language</label>
          <input id="s_wa_lang" placeholder="af"/>
        </div>
      </div>
      <div class="mt10">
        <button id="btnSaveWA" class="btn primary">Save WhatsApp</button>
        <span id="msgWA" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <h2 style="margin:0 0 8px">Yoco</h2>
      <div class="row">
        <div>
          <label>Mode</label>
          <select id="y_mode">
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div>
          <label>Client ID</label>
          <input id="y_client_id" placeholder="your_client_id"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Redirect URI</label>
          <input id="y_redirect_uri" placeholder="https://tickets.villiersdorpskou.co.za/api/admin/yoco/oauth/callback"/>
        </div>
        <div>
          <label>Scopes (comma-separated)</label>
          <input id="y_scopes" placeholder="payments:write,profile:read"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>State (anti-CSRF)</label>
          <input id="y_state" placeholder="random_state_123"/>
        </div>
        <div>
          <label>Access Token (stored post-OAuth)</label>
          <input id="y_access_token" placeholder="(read-only after connect)" disabled/>
        </div>
      </div>
      <div class="mt10" style="display:flex; gap:8px; flex-wrap:wrap">
        <button id="btnSaveYoco" class="btn primary">Save Yoco</button>
        <button id="btnConnectYoco" class="btn">Connect Yoco (OAuth)</button>
        <button id="btnTestIntent" class="btn">Create Test Payment Intent</button>
        <span id="msgY" class="muted"></span>
      </div>
    </div>
  </section>
</div>

<script>
const $ = (id)=>document.getElementById(id);

// -------- Tabs
const tabs = document.querySelectorAll('.tab');
const panels = {
  events:   document.getElementById('panel-events'),
  tickets:  document.getElementById('panel-tickets'),
  pos:      document.getElementById('panel-pos'),
  vendors:  document.getElementById('panel-vendors'),
  users:    document.getElementById('panel-users'),
  settings: document.getElementById('panel-settings'),
};
function showPanel(name){
  tabs.forEach(t=>t.classList.toggle('active', t.dataset.panel===name));
  Object.entries(panels).forEach(([k,el])=>el.classList.toggle('active', k===name));
  if (name==='events')   loadEvents();
  if (name==='tickets')  initTickets();
  if (name==='pos')      loadPOS();
  if (name==='vendors')  initVendors();
  if (name==='users')    loadUsers();
  if (name==='settings') loadSettings();
}
tabs.forEach(t=>t.addEventListener('click', ()=>showPanel(t.dataset.panel)));
showPanel('events');

// -------- Events (read-only list)
async function loadEvents(){
  const el = document.getElementById('evList');
  el.textContent = 'Laai…';
  try{
    const r = await fetch('/api/admin/events'); // your existing list route
    const j = await r.json();
    if (!j.ok) throw new Error(j.error||'failed');
    if (!Array.isArray(j.events) || !j.events.length){ el.textContent='Geen events'; return; }
    el.innerHTML = '<table><thead><tr><th>Naam</th><th>Slug</th><th>Wanneer</th><th>Venue</th></tr></thead><tbody>' +
      j.events.map(ev=>{
        const when = fmt(ev.starts_at)+' – '+fmt(ev.ends_at);
        return '<tr>'+
          '<td>'+esc(ev.name)+'</td>'+
          '<td>'+esc(ev.slug)+'</td>'+
          '<td>'+esc(when)+'</td>'+
          '<td>'+esc(ev.venue||'')+'</td>'+
        '</tr>';
      }).join('') + '</tbody></table>';
  }catch(e){
    el.innerHTML = '<span class="err">Kon nie laai nie</span>';
  }
}

// -------- Tickets
async function initTickets(){
  const sel = document.getElementById('tEvent');
  const sum = document.getElementById('tixSummary');
  const btn = document.getElementById('btnLookupOrder');
  const code = document.getElementById('orderCode');
  sel.innerHTML = '<option>Laai…</option>';
  sum.textContent = '—';

  // events for dropdown
  try{
    const r = await fetch('/api/admin/events');
    const j = await r.json();
    if (!j.ok) throw new Error();
    sel.innerHTML = j.events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.slug)+')</option>').join('');
  }catch{ sel.innerHTML='<option value="">Geen events</option>'; }

  sel.onchange = async ()=>{
    const id = Number(sel.value||0);
    if (!id){ sum.textContent='—'; return; }
    sum.textContent = 'Laai…';
    try{
      const r = await fetch('/api/admin/tickets/summary?event_id='+id);
      const j = await r.json();
      if (!j.ok) throw new Error();
      sum.innerHTML =
        '<div class="pill">Verkoop: '+(j.sold||0)+'</div> '+
        '<div class="pill">In: '+(j.checked_in||0)+'</div> '+
        '<div class="pill">Uit: '+(j.checked_out||0)+'</div> '+
        '<div class="pill">Nog nie in: '+(j.not_in||0)+'</div>';
    }catch{ sum.innerHTML='<span class="err">Kon nie laai nie</span>'; }
  };

  btn.onclick = async ()=>{
    const c = (code.value||'').trim().toUpperCase();
    if (!c) return;
    const box = document.getElementById('orderResult');
    box.textContent = 'Laai…';
    try{
      const r = await fetch('/api/public/tickets/by-code/'+encodeURIComponent(c));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'not ok');
      if (!Array.isArray(j.tickets)||!j.tickets.length){
        box.innerHTML = '<div class="err">Kon nie kaartjies vind met kode '+esc(c)+' nie.</div>';
        return;
      }
      box.innerHTML = j.tickets.map(t =>
        '<div class="card" style="margin:8px 0">'+
          '<div><b>'+esc(t.type_name||'Ticket')+'</b> · '+esc(t.qr)+'</div>'+
          '<div class="muted">Status: '+esc(t.state||'unused')+'</div>'+
          '<div class="mt6" style="display:flex; gap:8px; flex-wrap:wrap">'+
            '<a class="btn small" href="/t/'+encodeURIComponent(c)+'" target="_blank">Open tickets</a>'+
            '<button class="btn small" data-wa="'+escAttr(c)+'">Stuur via WhatsApp</button>'+
          '</div>'+
        '</div>'
      ).join('');

      // wire WA buttons
      box.querySelectorAll('[data-wa]').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const msisdn = prompt('WhatsApp nommer (bv. 2771…)?')||'';
          if (!msisdn) return;
          b.disabled = true;
          try{
            const r = await fetch('/api/admin/send-tickets/whatsapp', {
              method:'POST', headers:{'content-type':'application/json'},
              body: JSON.stringify({ code: c, to: msisdn })
            });
            const jj = await r.json().catch(()=>({ok:false}));
            if (!jj.ok) throw new Error(jj.error||'send failed');
            alert('Gestuur 👍');
          }catch(e){ alert('Kon nie stuur nie: '+(e.message||'fout')); }
          b.disabled = false;
        });
      });

    }catch(e){
      box.innerHTML = '<div class="err">Fout: '+esc(e.message||'')+'</div>';
    }
  };
}

// -------- POS Admin
async function loadPOS(){
  const el = document.getElementById('posStats');
  el.textContent = 'Laai…';
  try{
    const r = await fetch('/api/admin/pos/summary');
    const j = await r.json();
    if (!j.ok) throw new Error();
    const rows = (j.sessions||[]).map(s =>
      '<tr>'+
        '<td>#'+s.id+'</td>'+
        '<td>'+esc(s.cashier_name||'')+'</td>'+
        '<td>'+esc(s.gate_name||s.gate||'')+'</td>'+
        '<td>'+fmtDT(s.opened_at)+'</td>'+
        '<td>'+(s.closed_at?fmtDT(s.closed_at):'—')+'</td>'+
        '<td class="right">R'+toRand(s.cash_taken_cents)+'</td>'+
        '<td class="right">R'+toRand(s.card_taken_cents)+'</td>'+
        '<td>'+esc(s.manager_name||s.closing_manager||'')+'</td>'+
      '</tr>'
    ).join('');
    el.innerHTML =
      '<table><thead><tr>'+
      '<th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th>'+
      '<th class="right">Cash</th><th class="right">Card</th><th>Closed by</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>';
  }catch{ el.innerHTML='<span class="err">Kon nie laai nie</span>'; }
}

// -------- Vendors
async function initVendors(){
  const sel = document.getElementById('vEvent');
  const list = document.getElementById('vendorsList');
  sel.innerHTML = '<option>Laai…</option>';
  list.textContent = '—';

  try{
    const r = await fetch('/api/admin/events');
    const j = await r.json();
    if (!j.ok) throw new Error();
    sel.innerHTML = j.events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.slug)+')</option>').join('');
  }catch{ sel.innerHTML='<option value="">Geen events</option>'; }

  document.getElementById('btnLoadVendors').onclick = async ()=>{
    const id = Number(sel.value||0);
    if (!id){ list.textContent='—'; return; }
    list.textContent = 'Laai…';
    try{
      const r = await fetch('/api/admin/vendors?event_id='+id);
      const j = await r.json();
      if (!j.ok) throw new Error();
      if (!j.vendors?.length){ list.textContent='Geen vendors'; return; }
      list.innerHTML = '<table><thead><tr><th>Naam</th><th>Stand</th><th>Kontak</th><th></th></tr></thead><tbody>' +
        j.vendors.map(v =>
          '<tr>'+
            '<td>'+esc(v.name)+'</td>'+
            '<td>'+esc(v.stand_number||'')+'</td>'+
            '<td>'+esc(v.contact_name||"")+' · '+esc(v.phone||"")+'</td>'+
            '<td><button class="btn small" data-edit="'+v.id+'">Wysig</button></td>'+
          '</tr>'
        ).join('') + '</tbody></table>';

      list.querySelectorAll('[data-edit]').forEach(b=>{
        b.addEventListener('click', ()=> editVendor(Number(b.dataset.edit||0)));
      });
    }catch{ list.innerHTML = '<span class="err">Kon nie laai nie</span>'; }
  };

  document.getElementById('btnAddVendor').onclick = ()=> editVendor(0);
}

async function editVendor(id){
  const payload = id ? await fetch('/api/admin/vendor/get?id='+id).then(r=>r.json()).catch(()=>({ok:false}))
                     : { ok:true, vendor: { id:0, name:'', contact_name:'', phone:'', email:'', stand_number:'', staff_quota:0, vehicle_quota:0 } };
  if (!payload.ok){ alert('Kon nie vendor laai nie'); return; }
  const v = payload.vendor;

  const form = document.createElement('div');
  form.className = 'card';
  form.style = 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:10';
  form.innerHTML =
    '<div class="card" style="max-width:640px;width:96%;max-height:90vh;overflow:auto">'+
      '<h2 style="margin:0 0 8px">'+(v.id?'Wysig Vendor':'Nuwe Vendor')+'</h2>'+
      '<div class="row">'+
        '<div><label>Naam</label><input id="v_name" value="'+escAttr(v.name||'')+'"/></div>'+
        '<div><label>Stand #</label><input id="v_stand" value="'+escAttr(v.stand_number||'')+'"/></div>'+
      '</div>'+
      '<div class="row">'+
        '<div><label>Kontak Naam</label><input id="v_cname" value="'+escAttr(v.contact_name||'')+'"/></div>'+
        '<div><label>Selfoon</label><input id="v_phone" value="'+escAttr(v.phone||'')+'"/></div>'+
      '</div>'+
      '<div class="row">'+
        '<div><label>E-pos</label><input id="v_email" value="'+escAttr(v.email||'')+'"/></div>'+
        '<div><label>Staff Quota</label><input id="v_squota" type="number" min="0" value="'+Number(v.staff_quota||0)+'"/></div>'+
      '</div>'+
      '<div class="row">'+
        '<div><label>Vehicle Quota</label><input id="v_vquota" type="number" min="0" value="'+Number(v.vehicle_quota||0)+'"/></div>'+
        '<div></div>'+
      '</div>'+
      '<div class="mt10" style="display:flex; gap:8px; flex-wrap:wrap">'+
        '<button id="v_save" class="btn primary">Save</button>'+
        '<button id="v_close" class="btn">Close</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(form);
  form.querySelector('#v_close').onclick = ()=> form.remove();
  form.querySelector('#v_save').onclick = async ()=>{
    const body = {
      id: v.id||0,
      name: form.querySelector('#v_name').value||'',
      stand_number: form.querySelector('#v_stand').value||'',
      contact_name: form.querySelector('#v_cname').value||'',
      phone: form.querySelector('#v_phone').value||'',
      email: form.querySelector('#v_email').value||'',
      staff_quota: Number(form.querySelector('#v_squota').value||0),
      vehicle_quota: Number(form.querySelector('#v_vquota').value||0),
    };
    try{
      const r = await fetch('/api/admin/vendor/upsert', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok) throw new Error(j.error||'save failed');
      alert('Gestoor');
      form.remove();
    }catch(e){ alert('Fout: '+(e.message||'save')); }
  };
}

// -------- Users
async function loadUsers(){
  const el = document.getElementById('userList');
  el.textContent = 'Laai…';
  try{
    const r = await fetch('/api/admin/users');
    const j = await r.json();
    if (!j.ok) throw new Error();
    if (!j.users?.length){ el.textContent='Geen gebruikers'; return; }
    el.innerHTML = '<table><thead><tr><th>Username</th><th>Role</th></tr></thead><tbody>'+
      j.users.map(u=>'<tr><td>'+esc(u.username)+'</td><td>'+esc(u.role)+'</td></tr>').join('')+
      '</tbody></table>';
  }catch{ el.innerHTML = '<span class="err">Kon nie laai nie</span>'; }
}

// -------- Settings (WA + Yoco)
async function loadSettings(){
  const set = await fetch('/api/admin/settings').then(r=>r.json()).catch(()=>({ok:false, settings:{}}));
  const S = (set.ok && set.settings) ? set.settings : {};

  // WA
  $('#s_public_base_url').value = S.PUBLIC_BASE_URL||'';
  $('#s_verify_token').value    = S.VERIFY_TOKEN||'';
  $('#s_phone_id').value        = S.PHONE_NUMBER_ID||'';
  $('#s_wa_token').value        = S.WHATSAPP_TOKEN||'';
  $('#s_wa_tmpl').value         = S.WHATSAPP_TEMPLATE_NAME||'';
  $('#s_wa_lang').value         = S.WHATSAPP_TEMPLATE_LANG||'';

  // Yoco
  $('#y_mode').value            = S.YOCO_MODE||'sandbox';
  $('#y_client_id').value       = S.YOCO_CLIENT_ID||'';
  $('#y_redirect_uri').value    = S.YOCO_REDIRECT_URI||location.origin+'/api/admin/yoco/oauth/callback';
  $('#y_scopes').value          = S.YOCO_SCOPES||'payments:write';
  $('#y_state').value           = S.YOCO_STATE||'state_'+Math.random().toString(36).slice(2,10);
  $('#y_access_token').value    = S.YOCO_ACCESS_TOKEN||'';

  // Wire save buttons
  $('#btnSaveWA').onclick = async ()=>{
    const body = {
      PUBLIC_BASE_URL: $('#s_public_base_url').value,
      VERIFY_TOKEN:    $('#s_verify_token').value,
      PHONE_NUMBER_ID: $('#s_phone_id').value,
      WHATSAPP_TOKEN:  $('#s_wa_token').value,
      WHATSAPP_TEMPLATE_NAME: $('#s_wa_tmpl').value,
      WHATSAPP_TEMPLATE_LANG: $('#s_wa_lang').value
    };
    await saveSettings(body, '#msgWA');
  };

  $('#btnSaveYoco').onclick = async ()=>{
    const body = {
      YOCO_MODE: $('#y_mode').value,
      YOCO_CLIENT_ID: $('#y_client_id').value,
      YOCO_REDIRECT_URI: $('#y_redirect_uri').value,
      YOCO_SCOPES: $('#y_scopes').value,
      YOCO_STATE: $('#y_state').value
    };
    await saveSettings(body, '#msgY');
  };

  $('#btnConnectYoco').onclick = ()=>{
    const baseAuth = 'https://secure.yoco.com/oauth/authorize';
    const client_id = encodeURIComponent($('#y_client_id').value||'');
    const redirect  = encodeURIComponent($('#y_redirect_uri').value||location.origin+'/api/admin/yoco/oauth/callback');
    const scopes    = encodeURIComponent(($('#y_scopes').value||'').split(',').map(s=>s.trim()).filter(Boolean).join(' '));
    const state     = encodeURIComponent($('#y_state').value||'state');
    const url = baseAuth + '?response_type=code&client_id='+client_id+'&redirect_uri='+redirect+'&scope='+scopes+'&state='+state;
    location.href = url;
  };

  $('#btnTestIntent').onclick = async ()=>{
    const res = await fetch('/api/admin/yoco/payment-intents/create', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ amount_cents: 12345, currency: 'ZAR', reference: 'test-'+Date.now() })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    if (res.ok) alert('Intent ID: '+(res.intent?.id||'(none)'));
    else alert('Intent failed: '+(res.error||'unknown'));
  };
}

async function saveSettings(body, msgSel){
  const msg = document.querySelector(msgSel);
  msg.textContent = 'Stoor…';
  try{
    const r = await fetch('/api/admin/settings/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    const j = await r.json().catch(()=>({ok:false}));
    if (!j.ok) throw new Error(j.error||'failed');
    msg.textContent = 'Gestoor ✅';
    msg.className = 'ok';
  }catch(e){
    msg.textContent = 'Fout: '+(e.message||'');
    msg.className = 'err';
  }
}

// -------- helpers
function toRand(c){ return ((c||0)/100).toFixed(2); }
function fmt(ts){ if (!ts) return ''; const d=new Date(ts*1000); return d.toLocaleDateString('af-ZA',{day:'2-digit',month:'short'}); }
function fmtDT(ts){ if (!ts) return '—'; const d=new Date(ts*1000); return d.toLocaleString(); }
function esc(s){ return String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }
</script>
</body></html>`;
}
