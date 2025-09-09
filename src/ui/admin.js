// /src/ui/admin.js

// Tiny local helpers (kept here so we don't import a non-existent utils/html.js)
const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const centsToRand = (c) => `R${(Number(c || 0) / 100).toFixed(2)}`;

export function adminHTML() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Admin · Villiersdorp Skou</title>
  <style>
    :root{--green:#1b7f2a;--green-600:#0a7d2b;--bg:#f7f7f7;--panel:#fff;--muted:#64748b}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,'Apple Color Emoji','Segoe UI Emoji';background:#fafafa;color:#0f172a}
    header{padding:22px 18px}
    h1{margin:0 0 8px;font-size:28px}
    nav{display:flex;gap:10px;flex-wrap:wrap}
    .pill{padding:6px 12px;border-radius:999px;background:#eef2ff;color:#111;cursor:pointer;border:1px solid #e5e7eb}
    .pill.active{background:#d1fae5;border-color:#86efac}
    .wrap{max-width:980px;margin:0 auto}
    .card{background:var(--panel);border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:14px 0}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .row > *{flex:0 0 auto}
    select,input[type="text"],input[type="number"],input[type="tel"],input[type="email"]{
      height:36px;border:1px solid #d1d5db;border-radius:8px;padding:6px 10px;background:#fff;min-width:160px
    }
    button{height:36px;border:none;border-radius:8px;background:var(--green);color:#fff;padding:0 12px;cursor:pointer}
    button.secondary{background:#111;color:#fff}
    button.ghost{background:#eef2ff;color:#111}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
    th,td{padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
    th{color:#334155;text-align:left}
    .muted{color:var(--muted)}
    .right{text-align:right}
    .ok{color:#166534}
    .warn{color:#b45309}
    .err{color:#b91c1c}
    .spacer{flex:1}
    .small{font-size:12px}
    .hidden{display:none}
    a{color:#0a7d2b;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Admin dashboard</h1>
      <nav>
        <span class="pill active" data-tab="tickets">Tickets</span>
        <span class="pill" data-tab="vendors">Vendors</span>
        <span class="pill" data-tab="users">Users</span>
      </nav>
    </header>

    <!-- Tickets TAB -->
    <section id="tab-tickets" class="card">
      <div class="row">
        <select id="t-ev"></select>
        <button id="t-load">Load</button>
        <span id="t-msg" class="muted small"></span>
      </div>

      <div id="t-stats" class="hidden">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th class="right">Price (R)</th>
              <th class="right">Total</th>
              <th class="right">Unused</th>
              <th class="right">In</th>
              <th class="right">Out</th>
              <th class="right">Void</th>
            </tr>
          </thead>
          <tbody id="t-stats-rows"></tbody>
        </table>
        <div class="small muted" id="t-stats-summary" style="margin-top:8px;"></div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 style="margin:0 0 8px;">Order lookup</h3>
        <div class="row">
          <input id="ol-code" type="text" placeholder="Order code (e.g. 3VLNT5)" />
          <button id="ol-do">Lookup</button>
          <span id="ol-msg" class="muted small"></span>
        </div>
        <div id="ol-result" class="hidden" style="margin-top:10px;"></div>
      </div>
    </section>

    <!-- Vendors TAB -->
    <section id="tab-vendors" class="card hidden">
      <div class="row">
        <select id="v-ev"></select>
        <button id="v-load">Load</button>
        <span id="v-msg" class="muted small"></span>
        <span class="spacer"></span>
      </div>

      <div id="v-list" class="hidden">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Stand</th>
              <th class="right">Staff quota</th><th class="right">Vehicle quota</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody id="v-rows"></tbody>
        </table>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 style="margin:0 0 10px;">New vendor</h3>
        <div class="row">
          <input id="nv-name" placeholder="Vendor name"/>
          <input id="nv-contact" placeholder="Contact name"/>
          <input id="nv-phone" placeholder="Phone"/>
          <input id="nv-email" placeholder="Email"/>
          <input id="nv-stand" placeholder="Stand #"/>
          <input id="nv-staff" type="number" placeholder="Staff quota" style="width:120px"/>
          <input id="nv-veh" type="number" placeholder="Vehicle quota" style="width:120px"/>
          <button id="nv-add">Add</button>
        </div>
      </div>
    </section>

    <!-- Users TAB -->
    <section id="tab-users" class="card hidden">
      <div class="row">
        <input id="u-username" placeholder="username"/>
        <select id="u-role">
          <option value="admin">admin</option>
          <option value="pos">pos</option>
          <option value="scan">scan</option>
        </select>
        <button id="u-add">Add</button>
        <span id="u-msg" class="muted small"></span>
      </div>
      <table style="margin-top:10px">
        <thead><tr><th>ID</th><th>Username</th><th>Role</th><th class="right">Actions</th></tr></thead>
        <tbody id="u-rows"></tbody>
      </table>
    </section>
  </div>

<script>
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const show = (el, on=true) => el.classList.toggle('hidden', !on);

  // Tab switching
  $$('.pill').forEach(p => {
    p.addEventListener('click', () => {
      $$('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      const tab = p.dataset.tab;
      show($('#tab-tickets'), tab==='tickets');
      show($('#tab-vendors'), tab==='vendors');
      show($('#tab-users'), tab==='users');
    });
  });

  // ------- Common: load events into <select> -------
  async function fetchEvents() {
    const rs = await fetch('/api/public/events');
    const js = await rs.json().catch(()=>({}));
    return (js.events||[]);
  }
  function fillEventSelect(sel, events) {
    sel.innerHTML = events.map(e => 
      \`<option value="\${e.id}">\${esc(e.name)} (\${esc(e.slug)})</option>\`
    ).join('');
  }

  // ======== TICKETS TAB ========
  const tEvSel = $('#t-ev');
  const tLoadBtn = $('#t-load');
  const tMsg = $('#t-msg');
  const tStatsWrap = $('#t-stats');
  const tRows = $('#t-stats-rows');
  const tSum = $('#t-stats-summary');

  async function loadTicketStats() {
    tMsg.textContent = 'Loading…';
    tRows.innerHTML = '';
    show(tStatsWrap,false);
    const evId = Number(tEvSel.value||0);
    if (!evId) { tMsg.textContent='Pick an event'; return; }

    const r = await fetch(\`/api/admin/tickets/stats?event_id=\${evId}\`);
    if (!r.ok) { tMsg.textContent = 'Not found'; return; }
    const js = await r.json().catch(()=>({}));

    const rows = js.rows || [];
    let tot=0, u=0, inn=0, out=0, v=0;
    tRows.innerHTML = rows.map(r => {
      tot += r.total||0; u+=r.unused||0; inn+=r.in||0; out+=r.out||0; v+=r.void||0;
      return \`
        <tr>
          <td>\${esc(r.name)}</td>
          <td class="right">\${centsToRand(r.price_cents)}</td>
          <td class="right">\${r.total||0}</td>
          <td class="right">\${r.unused||0}</td>
          <td class="right">\${r.in||0}</td>
          <td class="right">\${r.out||0}</td>
          <td class="right">\${r.void||0}</td>
        </tr>\`;
    }).join('');

    tSum.textContent = \`Total: \${tot} · In: \${inn} · Out: \${out} · Unused: \${u} · Void: \${v}\`;
    show(tStatsWrap,true);
    tMsg.textContent='';
  }

  // Order lookup + WhatsApp send
  const olCode = $('#ol-code');
  const olBtn = $('#ol-do');
  const olMsg = $('#ol-msg');
  const olBox = $('#ol-result');

  async function lookupOrder() {
    const code = (olCode.value||'').trim();
    if (!code) { olMsg.textContent = 'Enter order code'; return; }
    olMsg.textContent = 'Looking up…';
    const r = await fetch(\`/api/admin/orders/lookup?code=\${encodeURIComponent(code)}\`);
    if (!r.ok) { olMsg.textContent='Not found'; show(olBox,false); return; }
    const js = await r.json().catch(()=>({}));
    olMsg.textContent = '';
    renderOrder(js);
  }

  function renderOrder(data) {
    const ord = data.order||{};
    const tix = data.tickets||[];
    const link = data.ticket_link || '#';
    const phone = (ord.contact?.phone || '').replace(/\\D+/g,'');
    const code = ord.short_code || '';

    olBox.innerHTML = \`
      <div class="row small">
        <div><b>Ticket link:</b> <a href="\${link}" target="_blank">\${link.replace(location.origin,'')}</a></div>
        <div class="spacer"></div>
      </div>
      <table style="margin-top:8px">
        <thead><tr><th>ID</th><th>Type</th><th class="right">QR</th><th class="right">State</th></tr></thead>
        <tbody>
          \${tix.map(t => \`
            <tr>
              <td>\${t.id}</td>
              <td>\${esc(t.type_name)}</td>
              <td class="right"><code class="small">\${esc(t.qr)}</code></td>
              <td class="right \${t.state==='in'?'ok':(t.state==='out'?'warn':(t.state==='void'?'err':''))}">\${t.state}</td>
            </tr>\`).join('')}
        </tbody>
      </table>

      <div class="row" style="margin-top:10px">
        <input id="wa-to" type="tel" placeholder="WhatsApp number (e.g. 2771…)" value="\${esc(phone)}"/>
        <button id="wa-send">Send via WhatsApp</button>
        <span id="wa-msg" class="muted small"></span>
        <span class="spacer"></span>
        <span class="small muted">Order code: <b>\${esc(code)}</b></span>
      </div>
    \`;
    show(olBox,true);

    $('#wa-send').onclick = async () => {
      const to = ($('#wa-to').value||'').replace(/\\D+/g,'');
      if (!to) { $('#wa-msg').textContent = 'Enter a number'; return; }
      $('#wa-msg').textContent = 'Sending…';
      const pr = await fetch('/api/admin/orders/send-whatsapp', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ code: ord.short_code, to })
      });
      const js = await pr.json().catch(()=>({ ok:false, error:'Bad response'}));
      if (js.ok) $('#wa-msg').textContent = 'Sent ✅';
      else $('#wa-msg').textContent = 'Failed: ' + (js.error||'unknown');
    };
  }

  // ======== VENDORS TAB ========
  const vEvSel = $('#v-ev');
  const vLoad = $('#v-load');
  const vMsg = $('#v-msg');
  const vWrap = $('#v-list');
  const vRows = $('#v-rows');

  async function loadVendors() {
    vMsg.textContent = 'Loading…';
    show(vWrap,false);
    vRows.innerHTML = '';
    const evId = Number(vEvSel.value||0);
    const r = await fetch(\`/api/admin/vendors/list?event_id=\${evId}\`);
    if (!r.ok) { vMsg.textContent='Not found'; return; }
    const js = await r.json().catch(()=>({}));
    const rows = js.vendors||[];
    vRows.innerHTML = rows.map(v => vendorRowHTML(v)).join('');
    bindVendorRowHandlers();
    show(vWrap,true);
    vMsg.textContent='';
  }

  function vendorRowHTML(v) {
    return \`
      <tr data-id="\${v.id}">
        <td><input class="v-name" value="\${esc(v.name)}"/></td>
        <td><input class="v-contact" value="\${esc(v.contact_name||'')}"/></td>
        <td><input class="v-phone" value="\${esc(v.phone||'')}"/></td>
        <td><input class="v-email" value="\${esc(v.email||'')}"/></td>
        <td><input class="v-stand" value="\${esc(v.stand_number||'')}" style="width:100px"/></td>
        <td class="right"><input class="v-staff" type="number" value="\${Number(v.staff_quota||0)}" style="width:90px"/></td>
        <td class="right"><input class="v-veh" type="number" value="\${Number(v.vehicle_quota||0)}" style="width:90px"/></td>
        <td class="right">
          <button class="v-save">Save</button>
          <button class="v-del" style="background:#991b1b">Delete</button>
        </td>
      </tr>\`;
  }

  function bindVendorRowHandlers() {
    $$('#v-rows tr').forEach(tr => {
      const id = Number(tr.dataset.id);
      tr.querySelector('.v-save').onclick = async () => {
        const body = {
          id,
          event_id: Number(vEvSel.value||0),
          name: tr.querySelector('.v-name').value,
          contact_name: tr.querySelector('.v-contact').value,
          phone: tr.querySelector('.v-phone').value,
          email: tr.querySelector('.v-email').value,
          stand_number: tr.querySelector('.v-stand').value,
          staff_quota: Number(tr.querySelector('.v-staff').value||0),
          vehicle_quota: Number(tr.querySelector('.v-veh').value||0),
        };
        const r = await fetch('/api/admin/vendors/upsert', {
          method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
        });
        const js = await r.json().catch(()=>({}));
        vMsg.textContent = js.ok ? 'Saved' : ('Failed: ' + (js.error||'unknown'));
        if (js.ok) loadVendors();
      };
      tr.querySelector('.v-del').onclick = async () => {
        if (!confirm('Delete vendor?')) return;
        const r = await fetch('/api/admin/vendors/delete', {
          method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id })
        });
        const js = await r.json().catch(()=>({}));
        vMsg.textContent = js.ok ? 'Deleted' : ('Failed: ' + (js.error||'unknown'));
        if (js.ok) loadVendors();
      };
    });
  }

  // New vendor
  $('#nv-add').onclick = async () => {
    const body = {
      id: 0,
      event_id: Number(vEvSel.value||0),
      name: $('#nv-name').value,
      contact_name: $('#nv-contact').value,
      phone: $('#nv-phone').value,
      email: $('#nv-email').value,
      stand_number: $('#nv-stand').value,
      staff_quota: Number($('#nv-staff').value||0),
      vehicle_quota: Number($('#nv-veh').value||0),
    };
    const r = await fetch('/api/admin/vendors/upsert', {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
    });
    const js = await r.json().catch(()=>({}));
    vMsg.textContent = js.ok ? 'Added' : ('Failed: ' + (js.error||'unknown'));
    if (js.ok) {
      // reset form
      ['nv-name','nv-contact','nv-phone','nv-email','nv-stand','nv-staff','nv-veh'].forEach(id => { const el = $('#'+id); if (el) el.value=''; });
      loadVendors();
    }
  };

  // ======== USERS TAB ========
  async function loadUsers() {
    const r = await fetch('/api/admin/users/list');
    if (!r.ok) return;
    const js = await r.json().catch(()=>({}));
    $('#u-rows').innerHTML = (js.users||[]).map(u => \`
      <tr data-id="\${u.id}">
        <td>\${u.id}</td>
        <td>\${esc(u.username)}</td>
        <td>\${esc(u.role)}</td>
        <td class="right"><button class="u-del" style="background:#991b1b">Delete</button></td>
      </tr>\`).join('');
    $$('#u-rows .u-del').forEach(btn => {
      btn.onclick = async (e) => {
        const id = Number(e.target.closest('tr').dataset.id);
        if (!confirm('Delete user?')) return;
        const r = await fetch('/api/admin/users/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id }) });
        const js = await r.json().catch(()=>({}));
        $('#u-msg').textContent = js.ok ? 'Deleted' : ('Failed: ' + (js.error||'unknown'));
        if (js.ok) loadUsers();
      };
    });
  }
  $('#u-add').onclick = async () => {
    const body = { username: $('#u-username').value, role: $('#u-role').value };
    const r = await fetch('/api/admin/users/add', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    const js = await r.json().catch(()=>({}));
    $('#u-msg').textContent = js.ok ? 'Added' : ('Failed: ' + (js.error||'unknown'));
    if (js.ok) { $('#u-username').value=''; loadUsers(); }
  };

  // ======== INIT ========
  (async function init() {
    const events = await fetchEvents();
    fillEventSelect(tEvSel, events);
    fillEventSelect(vEvSel, events);

    tLoadBtn.onclick = loadTicketStats;
    olBtn.onclick = lookupOrder;

    vLoad.onclick = loadVendors;

    loadUsers();
  })();
})();
</script>
</body>
</html>`;
}