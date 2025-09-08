// /src/ui/admin.js
export function adminHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  body{font-family:system-ui;margin:0;background:#f6f7f8;color:#111}
  .wrap{max-width:1100px;margin:28px auto;padding:0 16px}
  h1{font-size:28px;margin:0 0 18px}
  .tabs a{display:inline-block;margin-right:8px;padding:6px 10px;border-radius:8px;background:#eaf6ee;color:#0a7d2b;text-decoration:none}
  .card{background:#fff;border-radius:12px;padding:14px 16px;margin:14px 0;border:1px solid #e6e6e6}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
  .btn{background:#0a7d2b;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer}
  .btn.gray{background:#333}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  input,select{padding:8px;border:1px solid #ccc;border-radius:8px;font:inherit}
  .muted{color:#666}
  .right{float:right}
</style>
</head><body><div class="wrap">
  <h1>Admin dashboard</h1>
  <div class="tabs">
    <a href="#tickets">Tickets</a>
    <a href="#vendors">Vendors</a>
    <a href="#users" class="muted">Users</a>
  </div>

  <div id="view"></div>
</div>
<script>
// tiny helpers in-page (no external imports)
const esc = (s)=>String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m]));
const money = (c)=>'R'+((Number(c||0)/100).toFixed(2));
const api = (p, init)=>fetch(p, init).then(r=>r.json());

/* ------------------------------ TICKETS VIEW ------------------------------ */
async function viewTickets(){
  document.getElementById('view').innerHTML = \`
    <div class="card">
      <div class="row">
        <select id="evsel"></select>
        <button class="btn" id="load">Load</button>
      </div>
      <div id="sum" class="muted" style="margin-top:10px;">Pick an event and Load.</div>
    </div>

    <div class="card">
      <h3>Order lookup</h3>
      <div class="row">
        <input id="ocode" placeholder="Order code (e.g. 3VLNT5)" />
        <button class="btn" id="lookup">Lookup</button>
      </div>
      <div id="olines" style="margin-top:10px;"></div>
    </div>\`;

  // fill events
  const evs = await api('/api/admin/events');
  const sel = document.getElementById('evsel');
  (evs.events||[]).forEach(ev=>{
    const o = document.createElement('option');
    o.value = ev.id; o.textContent = ev.name + ' ('+ev.slug+')';
    sel.appendChild(o);
  });

  document.getElementById('load').onclick = async ()=>{
    const id = Number(sel.value||0);
    if(!id) return;
    const r = await api('/api/admin/tickets/summary?event_id='+id);
    if(!r.ok){ document.getElementById('sum').textContent = 'Not Found'; return; }
    const rows = (r.list||[]).map(x=>\`
      <tr>
        <td>\${esc(x.type_name)}</td>
        <td>\${money(x.price_cents)}</td>
        <td>\${x.total}</td>
        <td>\${x.unused}</td>
        <td>\${x.in}</td>
        <td>\${x.out}</td>
        <td>\${x.void}</td>
      </tr>\`).join('');
    const t = \`
      <div class="muted">Total: \${r.totals.total} · Unused: \${r.totals.unused} · In: \${r.totals.in} · Out: \${r.totals.out} · Void: \${r.totals.void} · Value: \${money(r.totals.value_cents)}</div>
      <table style="margin-top:8px">
        <thead><tr><th>Type</th><th>Price (R)</th><th>Total</th><th>Unused</th><th>In</th><th>Out</th><th>Void</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table>\`;
    document.getElementById('sum').innerHTML = t;
  };

  document.getElementById('lookup').onclick = async ()=>{
    const c = (document.getElementById('ocode').value||'').trim();
    if(!c) return;
    const r = await api('/api/admin/orders/by-code/'+encodeURIComponent(c));
    if(!r.ok){ document.getElementById('olines').textContent = r.error||'Not found'; return; }
    const lines = (r.tickets||[]).map(t=>\`
      <tr>
        <td>\${t.id}</td><td>\${esc(t.type_name)}</td><td>\${esc((t.attendee_first||'')+' '+(t.attendee_last||''))}</td>
        <td>\${t.state}</td><td>\${t.qr}</td>
      </tr>\`).join('');
    const phone = r.order.buyer_phone||'';
    document.getElementById('olines').innerHTML = \`
      <div class="row">
        <div class="muted">Ticket link:</div>
        <a href="\${r.ticket_link}" target="_blank">\${r.ticket_link}</a>
      </div>
      <table style="margin-top:8px">
        <thead><tr><th>ID</th><th>Type</th><th>Attendee</th><th>State</th><th>QR</th></tr></thead>
        <tbody>\${lines||'<tr><td colspan=5 class="muted">No tickets found</td></tr>'}</tbody>
      </table>
      <div class="row" style="margin-top:10px">
        <input id="waphone" placeholder="WhatsApp MSISDN (e.g. 2771...)" value="\${esc(phone)}"/>
        <button class="btn" id="sendwa">Send via WhatsApp</button>
      </div>\`;
    document.getElementById('sendwa').onclick = async ()=>{
      const to = (document.getElementById('waphone').value||'').trim();
      const res = await api('/api/admin/orders/'+encodeURIComponent(r.order.short_code)+'/send-wa', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ to })
      });
      alert(res.ok ? 'Sent' : ('Failed: '+(res.error||'')));
    };
  };
}

/* ------------------------------- VENDORS VIEW ------------------------------ */
async function viewVendors(){
  document.getElementById('view').innerHTML = \`
    <div class="card">
      <div class="row">
        <select id="evsel"></select>
        <button class="btn" id="load">Load</button>
      </div>
      <div id="vlist" style="margin-top:10px;"></div>
      <div class="card" style="margin-top:12px">
        <h3>New vendor</h3>
        <div class="row">
          <input id="v_name" placeholder="Vendor name"/>
          <input id="v_contact" placeholder="Contact name"/>
          <input id="v_phone" placeholder="Phone"/>
          <input id="v_email" placeholder="Email"/>
          <input id="v_stand" placeholder="Stand #"/>
          <input id="v_staff" type="number" min="0" style="width:90px" placeholder="Staff quota"/>
          <input id="v_vehicle" type="number" min="0" style="width:110px" placeholder="Vehicle quota"/>
          <button class="btn" id="v_add">Add</button>
        </div>
      </div>
    </div>\`;

  const evs = await api('/api/admin/events');
  const sel = document.getElementById('evsel');
  (evs.events||[]).forEach(ev=>{
    const o=document.createElement('option');
    o.value=ev.id; o.textContent=ev.name+' ('+ev.slug+')';
    sel.appendChild(o);
  });

  async function load(){
    const id = Number(sel.value||0);
    if(!id) return;
    const r = await api('/api/admin/vendors?event_id='+id);
    const rows = (r.vendors||[]).map(v=>\`
      <tr data-id="\${v.id}">
        <td><input value="\${esc(v.name||'')}" class="i_name"/></td>
        <td><input value="\${esc(v.contact_name||'')}" class="i_contact"/></td>
        <td><input value="\${esc(v.phone||'')}" class="i_phone"/></td>
        <td><input value="\${esc(v.email||'')}" class="i_email"/></td>
        <td><input value="\${esc(v.stand_number||'')}" class="i_stand" style="width:100px"/></td>
        <td><input type="number" min="0" value="\${v.staff_quota||0}" class="i_staff" style="width:80px"/></td>
        <td><input type="number" min="0" value="\${v.vehicle_quota||0}" class="i_vehicle" style="width:100px"/></td>
        <td>
          <button class="btn" data-act="save">Save</button>
          <button class="btn gray" data-act="del">Delete</button>
        </td>
      </tr>\`).join('');
    document.getElementById('vlist').innerHTML = \`
      <table>
        <thead><tr>
          <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>
          <th>Stand</th><th>Staff</th><th>Vehicle</th><th></th>
        </tr></thead>
        <tbody>\${rows||'<tr><td colspan=8 class="muted">No vendors yet</td></tr>'}</tbody>
      </table>\`;

    // actions
    document.querySelectorAll('#vlist [data-act="save"]').forEach(btn=>{
      btn.onclick = async ()=>{
        const tr = btn.closest('tr'); const id = tr.getAttribute('data-id');
        const body = {
          name: tr.querySelector('.i_name').value,
          contact_name: tr.querySelector('.i_contact').value,
          phone: tr.querySelector('.i_phone').value,
          email: tr.querySelector('.i_email').value,
          stand_number: tr.querySelector('.i_stand').value,
          staff_quota: Number(tr.querySelector('.i_staff').value||0),
          vehicle_quota: Number(tr.querySelector('.i_vehicle').value||0)
        };
        const res = await api('/api/admin/vendors/'+id+'/update', {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify(body)
        });
        alert(res.ok ? 'Saved' : ('Failed: '+(res.error||'')));
      };
    });
    document.querySelectorAll('#vlist [data-act="del"]').forEach(btn=>{
      btn.onclick = async ()=>{
        const tr = btn.closest('tr'); const id = tr.getAttribute('data-id');
        if(!confirm('Delete vendor '+id+'?')) return;
        const res = await api('/api/admin/vendors/'+id+'/delete', { method:'POST' });
        if(res.ok) load(); else alert('Failed');
      };
    });
  }

  document.getElementById('load').onclick = load;

  document.getElementById('v_add').onclick = async ()=>{
    const b = {
      event_id: Number(sel.value||0),
      name: document.getElementById('v_name').value,
      contact_name: document.getElementById('v_contact').value,
      phone: document.getElementById('v_phone').value,
      email: document.getElementById('v_email').value,
      stand_number: document.getElementById('v_stand').value,
      staff_quota: Number(document.getElementById('v_staff').value||0),
      vehicle_quota: Number(document.getElementById('v_vehicle').value||0),
    };
    if(!b.event_id || !b.name) return alert('Choose event & name');
    const res = await api('/api/admin/vendors/create', {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)
    });
    if(res.ok){ load(); document.getElementById('v_name').value=''; } else alert('Failed');
  };
}

/* ------------------------------- USERS (stub) ------------------------------ */
function viewUsers(){
  document.getElementById('view').innerHTML =
    '<div class="card muted">Users view unchanged. (Read-only for now)</div>';
}

/* --------------------------- Simple tab router ----------------------------- */
function nav(){
  const h = location.hash || '#tickets';
  if(h==='#vendors') return viewVendors();
  if(h==='#users')   return viewUsers();
  return viewTickets();
}
window.addEventListener('hashchange', nav);
nav();
</script>
</body></html>`;
}
