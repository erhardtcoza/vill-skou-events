// /src/ui/admin_sitesettings.js
export const adminSiteSettingsJS = `
(()=>{

  // --- tiny helpers --------------------------------------------------------
  const $ = (sel,root=document)=>root.querySelector(sel);
  const esc = (s='')=>String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));

  // --- render --------------------------------------------------------------
  const root = document.getElementById('panel-settings');
  root.innerHTML = \`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="tab-btn active" data-tab="gen">General</button>
      <button class="tab-btn" data-tab="wa">WhatsApp</button>
      <button class="tab-btn" data-tab="yoco">Yoco</button>
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
      #wa-templates table, #wa-inbox table{width:100%;border-collapse:collapse}
      #wa-templates th,#wa-templates td, #wa-inbox th, #wa-inbox td{padding:8px;border-bottom:1px solid #eef1f3;text-align:left}
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

      <!-- Auto-reply controls -->
      <h3>Auto-reply</h3>
      <div class="grid">
        <div>
          <label><input type="checkbox" id="WA_AUTO_REPLY_ENABLED" style="width:auto;vertical-align:middle;margin-right:6px"/> Enable auto-reply</label>
        </div>
        <div></div>
        <div style="grid-column:1/-1">
          <label>Auto-reply message</label>
          <textarea id="WA_AUTO_REPLY_TEXT" rows="3" placeholder="Dankie! Ons sal gou weer terugkom na jou met meer inligting."></textarea>
        </div>
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

      <div class="hr"></div>

      <h3>Inbox</h3>
      <div id="wa-inbox" class="muted">Loading…</div>
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
  \`;

  // tab switch
  function showTab(name){
    root.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    ['gen','wa','yoco'].forEach(x => {
      const sec = document.getElementById('tab-'+x);
      if (sec) sec.style.display = (x===name ? 'block' : 'none');
    });
  }
  root.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

  // expose deep-link switcher for #settings:wa etc.
  window.AdminPanels.settingsSwitch = (sub)=>{
    const map = { general:'gen', whatsapp:'wa', yoco:'yoco' };
    showTab(map[sub] || 'gen');
  };

  // --- IO helpers ----------------------------------------------------------
  async function save(updates, msgEl){
    msgEl.textContent = 'Saving…';
    const r = await fetch('/api/admin/settings/update', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ updates })
    }).then(x=>x.json()).catch(()=>({ok:false}));
    msgEl.textContent = r.ok ? 'Saved.' : ('Failed. ' + (r.error||''));
  }

  // --- populate settings ---------------------------------------------------
  async function loadSettings(){
    const j = await fetch('/api/admin/settings', { credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok) return;

    const s = j.settings||{};
    // General
    ['SITE_NAME','SITE_LOGO_URL','PUBLIC_BASE_URL','VERIFY_TOKEN']
      .forEach(k=>{ const el=document.getElementById(k); if (el && s[k]!=null) el.value = s[k]; });

    // WA creds
    $('#WHATSAPP_TOKEN').value = s.WHATSAPP_TOKEN || '';
    $('#PHONE_NUMBER_ID').value = s.PHONE_NUMBER_ID || '';
    $('#BUSINESS_ID').value = s.BUSINESS_ID || '';

    // Auto-reply
    $('#WA_AUTO_REPLY_ENABLED').checked = /^(1|true|yes|on)$/i.test(s.WA_AUTO_REPLY_ENABLED || '');
    $('#WA_AUTO_REPLY_TEXT').value = s.WA_AUTO_REPLY_TEXT || '';

    // Stash current selector values so we can re-apply after loading options
    $('#WA_TMP_ORDER_CONFIRM').dataset.value   = s.WA_TMP_ORDER_CONFIRM || '';
    $('#WA_TMP_PAYMENT_CONFIRM').dataset.value = s.WA_TMP_PAYMENT_CONFIRM || '';
    $('#WA_TMP_TICKET_DELIVERY').dataset.value = s.WA_TMP_TICKET_DELIVERY || '';
    $('#WA_TMP_SKOU_SALES').dataset.value      = s.WA_TMP_SKOU_SALES || '';

    // Yoco
    $('#YOCO_MODE').value = (s.YOCO_MODE||'sandbox').toLowerCase();
    $('#YOCO_TEST_PUBLIC_KEY').value = s.YOCO_TEST_PUBLIC_KEY || '';
    $('#YOCO_TEST_SECRET_KEY').value = s.YOCO_TEST_SECRET_KEY || '';
    $('#YOCO_LIVE_PUBLIC_KEY').value = s.YOCO_LIVE_PUBLIC_KEY || '';
    $('#YOCO_LIVE_SECRET_KEY').value = s.YOCO_LIVE_SECRET_KEY || '';
  }

  // --- WA templates list + selectors --------------------------------------
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
    const j = await fetch('/api/admin/whatsapp/templates', { credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
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

  // --- Inbox ---------------------------------------------------------------
  async function loadInbox(){
    const box = document.getElementById('wa-inbox');
    box.textContent = 'Loading…';
    const j = await fetch('/api/admin/whatsapp/inbox', { credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.textContent='Failed to load.'; return; }

    const rows = j.inbox || [];
    if (!rows.length){ box.textContent='No messages yet.'; return; }

    function ts(s){ try{ return new Date((s||0)*1000).toLocaleString(); }catch{ return s; } }

    box.innerHTML = \`
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>From</th>
            <th>Text</th>
            <th>Status</th>
            <th>Quick reply</th>
          </tr>
        </thead>
        <tbody>\${rows.map(r=>\`
          <tr>
            <td>\${esc(ts(r.timestamp))}</td>
            <td>\${esc(r.wa_from||'')}</td>
            <td>\${esc(r.text||'')}</td>
            <td>\${r.auto_replied ? '✓ auto' : ''} \${r.manual_replied ? '✓ manual' : ''}</td>
            <td>
              <div style="display:flex;gap:6px">
                <input data-reply="\${r.id}" placeholder="Type reply…" style="flex:1;padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px"/>
                <button data-send="\${r.id}" class="btn">Send</button>
              </div>
            </td>
          </tr>\`).join('')}</tbody>
      </table>
    \`;

    box.querySelectorAll('[data-send]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = Number(btn.dataset.send||0);
        const input = box.querySelector(\`[data-reply="\${id}"]\`);
        const text = String(input?.value||'').trim();
        if (!text) return;
        btn.disabled = true; btn.textContent = 'Sending…';
        const res = await fetch('/api/admin/whatsapp/reply', {
          method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
          body: JSON.stringify({ inbox_id: id, text })
        }).then(r=>r.json()).catch(()=>({ok:false}));
        btn.disabled = false; btn.textContent = 'Send';
        if (res.ok){ input.value=''; loadInbox(); } else { alert('Reply failed: ' + (res.error||'unknown')); }
      };
    });
  }

  // --- actions -------------------------------------------------------------
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
    // auto-reply settings
    WA_AUTO_REPLY_ENABLED: $('#WA_AUTO_REPLY_ENABLED').checked ? '1' : '0',
    WA_AUTO_REPLY_TEXT: $('#WA_AUTO_REPLY_TEXT').value,
    // template selectors
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

  function parseVars(raw){
    const s = String(raw||'').trim();
    return s ? s.split(',').map(x=>x.trim()).filter(Boolean) : [];
  }
  function msisdn(raw){ return String(raw||'').replace(/\\D+/g,''); }

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

  // initial load
  loadSettings().then(loadTemplates).then(loadInbox);

  // register panel activator
  window.AdminPanels.settings = ()=>showTab('gen');

})();
`;

export default adminSiteSettingsJS;