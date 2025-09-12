// /src/ui/admin_sitesettings.js
export const adminSiteSettingsJS = `
(()=>{
  const $ = (sel,root=document)=>root.querySelector(sel);
  const esc = (s='')=>String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const msisdn = (raw)=>{ const s=String(raw||'').replace(/\\D+/g,''); return (s.length===10&&s.startsWith('0'))?('27'+s.slice(1)):s; };

  const root = document.getElementById('panel-settings');
  root.innerHTML = \`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="tab-btn active" data-tab="gen">General</button>
      <button class="tab-btn" data-tab="wa">WhatsApp</button>
      <button class="tab-btn" data-tab="yoco">Yoco</button>
      <button class="tab-btn" data-tab="past">Past Visitors</button>
    </div>

    <style>
      #panel-settings .tab-btn{padding:8px 12px;border:1px solid var(--border,#e5e7eb);background:#fff;border-radius:999px;cursor:pointer}
      #panel-settings .tab-btn.active{background:var(--green,#0a7d2b);color:#fff;border-color:transparent}
      #panel-settings label{display:block;font-size:13px;color:#374151;margin:10px 0 6px}
      #panel-settings input, #panel-settings select, #panel-settings textarea{
        width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;min-height:40px
      }
      #panel-settings .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media (max-width:820px){ #panel-settings .grid{grid-template-columns:1fr} }
      #panel-settings .row-actions{display:flex;gap:8px;align-items:center;margin-top:10px}
      #panel-settings .pill{display:inline-block;font-size:12px;padding:2px 8px;border:1px solid #e5e7eb;border-radius:999px}
      #panel-settings .hr{height:1px;background:#eef1f3;margin:16px 0}
      #panel-settings .btn{padding:10px 14px;border-radius:10px;border:0;background:var(--green,#0a7d2b);color:#fff;font-weight:700;cursor:pointer}
      #panel-settings .btn.outline{background:#fff;color:#111;border:1px solid #e5e7eb}
      #panel-settings .muted{color:#667085}
      #wa-templates table{width:100%;border-collapse:collapse}
      #wa-templates th,#wa-templates td{padding:8px;border-bottom:1px solid #eef1f3;text-align:left}
      #pv-list table{width:100%;border-collapse:collapse}
      #pv-list th,#pv-list td{padding:8px;border-bottom:1px solid #eef1f3;text-align:left}
      #pv-list tbody tr:hover{background:#fafafa}
    </style>

    <!-- GENERAL -->
    <section id="tab-gen">
      <h2 style="margin:0 0 8px">General</h2>
      <div class="grid">
        <div><label>Site Name</label><input id="SITE_NAME"/></div>
        <div><label>Logo URL</label><input id="SITE_LOGO_URL"/></div>
        <div><label>Public Base URL (https)</label><input id="PUBLIC_BASE_URL" placeholder="https://tickets.example.com"/></div>
        <div><label>VERIFY_TOKEN (Webhook verify)</label><input id="VERIFY_TOKEN" placeholder="vs-verify-2025"/></div>
      </div>
      <div class="row-actions">
        <button id="saveGen" class="btn">Save General</button>
        <span id="msgGen" class="muted"></span>
      </div>
    </section>

    <!-- WHATSAPP -->
    <section id="tab-wa" style="display:none">
      <h2 style="margin:0 0 8px">WhatsApp</h2>
      <div class="grid">
        <div><label>Access Token</label><input id="WHATSAPP_TOKEN"/></div>
        <div><label>Phone Number ID</label><input id="PHONE_NUMBER_ID"/></div>
        <div><label>Business (WABA) ID</label><input id="BUSINESS_ID"/></div>
        <div><label>Auto-reply enabled (1/0)</label><input id="WA_AUTOREPLY_ENABLED" placeholder="0 or 1"/></div>
        <div style="grid-column:1/-1"><label>Auto-reply text</label><input id="WA_AUTOREPLY_TEXT" placeholder="Thank you, we will get back to you soon."/></div>
      </div>

      <h3 style="margin-top:14px">Template selectors</h3>
      <p class="muted">Select the approved template to use for each flow (stored as <code>name:language</code>).</p>
      <div class="grid">
        <div><label>Order confirmation</label><select id="WA_TMP_ORDER_CONFIRM"></select></div>
        <div><label>Payment confirmation</label><select id="WA_TMP_PAYMENT_CONFIRM"></select></div>
        <div><label>Ticket delivery</label><select id="WA_TMP_TICKET_DELIVERY"></select></div>
        <div><label>Skou reminders</label><select id="WA_TMP_SKOU_SALES"></select></div>
      </div>

      <div class="row-actions">
        <button id="saveWA" class="btn">Save WhatsApp</button>
        <button id="syncWA" class="btn outline">Sync templates</button>
        <span id="msgWA" class="muted"></span>
      </div>

      <div class="hr"></div>

      <h3>Send test</h3>
      <div class="grid">
        <div><label>Phone (MSISDN, e.g. 27XXXXXXXXX)</label><input id="TEST_PHONE" placeholder="27…"/></div>
        <div>
          <label>Which template</label>
          <select id="TEST_TEMPLATE_KEY">
            <option value="WA_TMP_ORDER_CONFIRM">Order confirmation</option>
            <option value="WA_TMP_PAYMENT_CONFIRM">Payment confirmation</option>
            <option value="WA_TMP_TICKET_DELIVERY">Ticket delivery</option>
            <option value="WA_TMP_SKOU_SALES">Skou reminders</option>
          </select>
        </div>
        <div style="grid-column:1/-1"><label>Variables (comma separated, optional)</label><input id="TEST_VARS" placeholder="e.g. Piet, CAXHIEG"/></div>
      </div>
      <div class="row-actions">
        <button id="sendWATest" class="btn">Send test</button>
        <span id="msgWATest" class="muted"></span>
      </div>

      <h3 style="margin-top:18px">Templates</h3>
      <div id="wa-templates" class="muted">Loading templates…</div>
    </section>

    <!-- YOCO -->
    <section id="tab-yoco" style="display:none">
      <h2 style="margin:0 0 8px">Yoco</h2>
      <div class="grid">
        <div>
          <label>Mode</label>
          <select id="YOCO_MODE">
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div></div>
        <div><label>Sandbox Public Key</label><input id="YOCO_TEST_PUBLIC_KEY"/></div>
        <div><label>Sandbox Secret Key</label><input id="YOCO_TEST_SECRET_KEY"/></div>
        <div><label>Live Public Key</label><input id="YOCO_LIVE_PUBLIC_KEY"/></div>
        <div><label>Live Secret Key</label><input id="YOCO_LIVE_SECRET_KEY"/></div>
      </div>
      <div class="row-actions">
        <button id="saveYoco" class="btn">Save Yoco</button>
        <span id="msgYoco" class="muted"></span>
      </div>
    </section>

    <!-- PAST VISITORS -->
    <section id="tab-past" style="display:none">
      <h2 style="margin:0 0 8px">Past Visitors</h2>

      <div class="cardish" style="border:1px solid #eef1f3; border-radius:12px; padding:12px; margin-bottom:12px">
        <h3 style="margin:0 0 8px">CSV Import</h3>
        <p class="muted">Paste CSV (name, phone) — one row per line. Example:<br/>Piet Botha, 0821234567</p>
        <textarea id="pv-csv" rows="6" placeholder="Name, Phone"></textarea>
        <div class="grid">
          <div><label>Filename (for reference)</label><input id="pv-filename" placeholder="past_2025.csv"/></div>
          <div><label>Overwrite names if already present?</label>
            <select id="pv-overwrite"><option value="0">No</option><option value="1">Yes</option></select>
          </div>
        </div>
        <div class="row-actions">
          <button id="pv-import" class="btn">Import</button>
          <span id="pv-import-msg" class="muted"></span>
        </div>
      </div>

      <div class="cardish" style="border:1px solid #eef1f3; border-radius:12px; padding:12px; margin-bottom:12px">
        <h3 style="margin:0 0 8px">Sync from Existing</h3>
        <div class="grid">
          <div>
            <label>Source</label>
            <select id="pv-sync-from">
              <option value="orders">Orders (online)</option>
              <option value="pos">POS sales</option>
              <option value="attendees">Ticket attendees</option>
            </select>
          </div>
          <div><label>Event ID (optional)</label><input id="pv-sync-event" placeholder="e.g. 3"/></div>
          <div><label>Tag (e.g. year)</label><input id="pv-sync-tag" value="2025"/></div>
        </div>
        <div class="row-actions">
          <button id="pv-sync" class="btn">Run Sync</button>
          <span id="pv-sync-msg" class="muted"></span>
        </div>
      </div>

      <div class="cardish" style="border:1px solid #eef1f3; border-radius:12px; padding:12px; margin-bottom:12px">
        <h3 style="margin:0 0 8px">List / Send</h3>
        <div class="grid">
          <div><label>Search</label><input id="pv-q" placeholder="name or phone"/></div>
          <div><label>Tag contains</label><input id="pv-tag" placeholder="2025"/></div>
          <div>
            <label>Opt-out</label>
            <select id="pv-optout">
              <option value="">All</option>
              <option value="0">Only opted-in</option>
              <option value="1">Only opted-out</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end"><button id="pv-refresh" class="btn">Refresh</button></div>
        </div>

        <div id="pv-list" style="margin-top:10px" class="muted">No results yet.</div>

        <div class="grid" style="margin-top:10px">
          <div>
            <label>Template</label>
            <select id="pv-tpl-key">
              <option value="WA_TMP_SKOU_SALES">Skou reminders (recommended)</option>
              <option value="WA_TMP_ORDER_CONFIRM">Order confirmation</option>
              <option value="WA_TMP_PAYMENT_CONFIRM">Payment confirmation</option>
              <option value="WA_TMP_TICKET_DELIVERY">Ticket delivery</option>
            </select>
          </div>
          <div style="grid-column:1/-1">
            <label>Body variables (comma separated, optional)</label>
            <input id="pv-vars" placeholder="e.g. Villiersdorp Skou, 5–7 Sept"/>
          </div>
        </div>
        <div class="row-actions">
          <button id="pv-send" class="btn">Send to selected (max 50)</button>
          <span id="pv-send-msg" class="muted"></span>
        </div>
      </div>
    </section>
  \`;

  function showTab(name){
    root.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    ['gen','wa','yoco','past'].forEach(x => {
      const sec = document.getElementById('tab-'+x);
      if (sec) sec.style.display = (x===name ? 'block' : 'none');
    });
  }
  root.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  window.AdminPanels.settingsSwitch = (sub)=>{
    const map = { general:'gen', whatsapp:'wa', yoco:'yoco', past:'past' };
    showTab(map[sub] || 'gen');
  };

  async function save(updates, msgEl){
    msgEl.textContent = 'Saving…';
    const r = await fetch('/api/admin/settings/update', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ updates })
    }).then(x=>x.json()).catch(()=>({ok:false}));
    msgEl.textContent = r.ok ? 'Saved.' : ('Failed. ' + (r.error||''));
  }

  // ---------- Settings load (adds extra WA auto-reply fields) ----------
  async function loadSettings(){
    const j = await fetch('/api/admin/settings', { credentials:'include' }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok) return;
    const s = j.settings||{};

    ['SITE_NAME','SITE_LOGO_URL','PUBLIC_BASE_URL','VERIFY_TOKEN'].forEach(k=>{
      const el = document.getElementById(k); if (el && s[k]!=null) el.value = s[k];
    });

    $('#WHATSAPP_TOKEN').value = s.WHATSAPP_TOKEN || '';
    $('#PHONE_NUMBER_ID').value = s.PHONE_NUMBER_ID || '';
    $('#BUSINESS_ID').value = s.BUSINESS_ID || '';
    $('#WA_AUTOREPLY_ENABLED').value = s.WA_AUTOREPLY_ENABLED || '0';
    $('#WA_AUTOREPLY_TEXT').value = s.WA_AUTOREPLY_TEXT || '';

    // stash template selector values
    $('#WA_TMP_ORDER_CONFIRM').dataset.value   = s.WA_TMP_ORDER_CONFIRM || '';
    $('#WA_TMP_PAYMENT_CONFIRM').dataset.value = s.WA_TMP_PAYMENT_CONFIRM || '';
    $('#WA_TMP_TICKET_DELIVERY').dataset.value = s.WA_TMP_TICKET_DELIVERY || '';
    $('#WA_TMP_SKOU_SALES').dataset.value      = s.WA_TMP_SKOU_SALES || '';

    // yoco
    $('#YOCO_MODE').value = (s.YOCO_MODE||'sandbox').toLowerCase();
    $('#YOCO_TEST_PUBLIC_KEY').value = s.YOCO_TEST_PUBLIC_KEY || '';
    $('#YOCO_TEST_SECRET_KEY').value = s.YOCO_TEST_SECRET_KEY || '';
    $('#YOCO_LIVE_PUBLIC_KEY').value = s.YOCO_LIVE_PUBLIC_KEY || '';
    $('#YOCO_LIVE_SECRET_KEY').value = s.YOCO_LIVE_SECRET_KEY || '';
  }

  // ---------- WA templates list + selectors ----------
  function optionLabel(t){ return \`\${t.name} (\${(t.language||'').replace('_','-')})\`; }
  function fillSelectors(rows){
    const opts = ['<option value="">—</option>'].concat(
      rows.map(t=>\`<option value="\${t.name}:\${t.language}">\${optionLabel(t)}</option>\`)
    ).join('');
    ['WA_TMP_ORDER_CONFIRM','WA_TMP_PAYMENT_CONFIRM','WA_TMP_TICKET_DELIVERY','WA_TMP_SKOU_SALES'].forEach(id=>{
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.dataset.value || '';
      sel.innerHTML = opts;
      if (prev) sel.value = prev;
    });
  }
  async function loadTemplates(){
    const box = document.getElementById('wa-templates');
    box.textContent = 'Loading templates…';
    const j = await fetch('/api/admin/whatsapp/templates', { credentials:'include' }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.textContent='Failed to load.'; fillSelectors([]); return; }
    const rows = j.templates || [];
    fillSelectors(rows);
    if (!rows.length){ box.textContent='No templates in database.'; return; }
    box.innerHTML = \`
      <table>
        <thead><tr><th>Name</th><th>Language</th><th>Status</th><th>Category</th></tr></thead>
        <tbody>\${rows.map(t=>\`
          <tr>
            <td>\${esc(t.name)}</td>
            <td><span class="pill">\${esc(t.language)}</span></td>
            <td>\${esc(t.status||'')}</td>
            <td>\${esc(t.category||'')}</td>
          </tr>\`).join('')}</tbody>
      </table>\`;
  }

  // ---------- Actions: save sections ----------
  $('#saveGen').onclick = ()=>save({
    SITE_NAME: $('#SITE_NAME').value,
    SITE_LOGO_URL: $('#SITE_LOGO_URL').value,
    PUBLIC_BASE_URL: $('#PUBLIC_BASE_URL').value,
    VERIFY_TOKEN: $('#VERIFY_TOKEN').value,
  }, $('#msgGen'));

  $('#saveYoco').onclick = ()=>save({
    YOCO_MODE: $('#YOCO_MODE').value,
    YOCO_TEST_PUBLIC_KEY: $('#YOCO_TEST_PUBLIC_KEY').value,
    YOCO_TEST_SECRET_KEY: $('#YOCO_TEST_SECRET_KEY').value,
    YOCO_LIVE_PUBLIC_KEY: $('#YOCO_LIVE_PUBLIC_KEY').value,
    YOCO_LIVE_SECRET_KEY: $('#YOCO_LIVE_SECRET_KEY').value,
  }, $('#msgYoco'));

  $('#saveWA').onclick = ()=>save({
    WHATSAPP_TOKEN: $('#WHATSAPP_TOKEN').value,
    PHONE_NUMBER_ID: $('#PHONE_NUMBER_ID').value,
    BUSINESS_ID: $('#BUSINESS_ID').value,
    WA_AUTOREPLY_ENABLED: $('#WA_AUTOREPLY_ENABLED').value,
    WA_AUTOREPLY_TEXT: $('#WA_AUTOREPLY_TEXT').value,
    WA_TMP_ORDER_CONFIRM: $('#WA_TMP_ORDER_CONFIRM').value,
    WA_TMP_PAYMENT_CONFIRM: $('#WA_TMP_PAYMENT_CONFIRM').value,
    WA_TMP_TICKET_DELIVERY: $('#WA_TMP_TICKET_DELIVERY').value,
    WA_TMP_SKOU_SALES: $('#WA_TMP_SKOU_SALES').value,
  }, $('#msgWA'));

  $('#syncWA').onclick = async ()=>{
    $('#msgWA').textContent = 'Syncing…';
    const j = await fetch('/api/admin/whatsapp/sync', { method:'POST', credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){
      const d = await fetch('/api/admin/whatsapp/diag', { credentials:'include' }).then(r=>r.json()).catch(()=>({}));
      alert('Sync failed: ' + (j.error||'unknown') + (d?.metaError?.message ? ('\\n'+d.metaError.message) : ''));
    } else {
      alert('Templates synced. Added/updated: ' + (j.fetched||0) + '. In DB: ' + (j.total||0));
    }
    $('#msgWA').textContent = '';
    loadTemplates();
  };

  // ---------- Past visitors: helpers ----------
  function parseCSV(text) {
    const lines = String(text || "").split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const parts = line.split(","); // simple CSV: name, phone
      if (!parts.length) continue;
      const name = (parts[0] || "").trim();
      const phone = msisdn(parts.slice(1).join(",").trim());
      rows.push({ name, phone });
    }
    return rows;
  }

  async function refreshList() {
    const q = $('#pv-q').value.trim();
    const tag = $('#pv-tag').value.trim();
    const opt = $('#pv-optout').value;
    const url = new URL('/api/admin/past/list', location.origin);
    if (q) url.searchParams.set('query', q);
    if (tag) url.searchParams.set('tag', tag);
    if (opt) url.searchParams.set('optout', opt);
    url.searchParams.set('limit', '50');
    const j = await fetch(url, { credentials:'include' }).then(r=>r.json()).catch(()=>({ok:false}));
    const box = $('#pv-list');
    if (!j.ok){ box.textContent='Failed to load.'; return; }
    const rows = j.visitors || [];
    if (!rows.length){ box.textContent='No results.'; return; }

    box.innerHTML = \`
      <table>
        <thead><tr>
          <th><input type="checkbox" id="pv-all"/></th>
          <th>Name</th><th>Phone</th><th>Tags</th><th>Opt-out</th><th>Last send</th><th>Status</th>
        </tr></thead>
        <tbody>\${rows.map(r=>\`
          <tr>
            <td><input type="checkbox" class="pv-chk" data-id="\${r.id}"/></td>
            <td>\${esc(r.name||'')}</td>
            <td>\${esc(r.phone||'')}</td>
            <td>\${esc(r.tags||'')}</td>
            <td>\${r.opt_out? 'Yes':'No'}</td>
            <td>\${r.last_contacted_at? new Date(r.last_contacted_at*1000).toLocaleString() : ''}</td>
            <td>\${esc(r.last_send_status||'')}</td>
          </tr>\`).join('')}</tbody>
      </table>\`;

    $('#pv-all').onclick = (e)=>{
      const on = e.target.checked;
      box.querySelectorAll('.pv-chk').forEach(c=>c.checked = on);
    };
  }

  // ---------- Past visitors: wire buttons ----------
  $('#pv-import').onclick = async ()=>{
    const rows = parseCSV($('#pv-csv').value);
    const overwrite = $('#pv-overwrite').value === '1';
    const filename = $('#pv-filename').value.trim() || null;
    $('#pv-import-msg').textContent = 'Importing…';
    const j = await fetch('/api/admin/past/import', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ rows, filename, overwrite_names: overwrite })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    $('#pv-import-msg').textContent = j.ok
      ? \`Inserted \${j.inserted}, updated \${j.updated}, invalid \${j.skipped_invalid}\`
      : ('Failed: '+(j.error||''));
    refreshList();
  };

  $('#pv-sync').onclick = async ()=>{
    const from = $('#pv-sync-from').value;
    const event_id = Number($('#pv-sync-event').value || 0) || null;
    const tag = $('#pv-sync-tag').value || '2025';
    $('#pv-sync-msg').textContent = 'Syncing…';
    const j = await fetch('/api/admin/past/sync', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ from, event_id, tag })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    $('#pv-sync-msg').textContent = j.ok
      ? \`Inserted \${j.inserted}, updated \${j.updated}, invalid \${j.skipped_invalid}\`
      : ('Failed: '+(j.error||''));
    refreshList();
  };

  $('#pv-refresh').onclick = refreshList;

  $('#pv-send').onclick = async ()=>{
    const ids = Array.from(document.querySelectorAll('.pv-chk'))
      .filter(c=>c.checked).map(c=>Number(c.dataset.id)).slice(0,50);
    if (!ids.length){ $('#pv-send-msg').textContent='Select up to 50.'; return; }
    const template_key = $('#pv-tpl-key').value;
    const vars = ($('#pv-vars').value||'').split(',').map(s=>s.trim()).filter(Boolean);
    $('#pv-send-msg').textContent = 'Sending…';
    const j = await fetch('/api/admin/past/send', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ visitor_ids: ids, template_key, vars })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    $('#pv-send-msg').textContent = j.ok ? 'Done.' : ('Failed: '+(j.error||'')); 
    refreshList();
  };

  // ---------- WA test send ----------
  function parseVars(raw){ const s=String(raw||'').trim(); return s? s.split(',').map(x=>x.trim()).filter(Boolean) : []; }
  $('#sendWATest').onclick = async ()=>{
    const to = msisdn($('#TEST_PHONE').value);
    const template_key = $('#TEST_TEMPLATE_KEY').value;
    const vars = parseVars($('#TEST_VARS').value);
    const msg = $('#msgWATest');
    if (!to){ msg.textContent='Enter phone like 27XXXXXXXXX'; return; }
    msg.textContent='Sending…';
    const res = await fetch('/api/admin/whatsapp/test', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ to, template_key, vars })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    msg.textContent = res.ok ? ('Sent ✔ ' + (res.message_id?('id: '+res.message_id):'')) : ('Failed: ' + (res.error||'unknown'));
  };

  // init
  loadSettings().then(loadTemplates);
  // auto-open tab from deep link if present
  const hash = (location.hash||"").replace(/^#settings:/,"");
  if (hash === "past") showTab("past");
  // expose launcher
  window.AdminPanels.settings = ()=>showTab('gen');
})();
`;
export default adminSiteSettingsJS;