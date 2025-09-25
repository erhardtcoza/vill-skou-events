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

    <!-- WHATSApp -->
    <section id="tab-wa" style="display:none">
      <h2 style="margin:0 0 8px">WhatsApp</h2>
      <div class="grid">
        <div><label>Access Token</label><input id="WHATSAPP_TOKEN"/></div>
        <div><label>Phone Number ID</label><input id="PHONE_NUMBER_ID"/></div>
        <div><label>Business (WABA) ID</label><input id="BUSINESS_ID"/></div>

        <div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:30px">
            <input type="checkbox" id="WA_AUTOREPLY_ENABLED" style="width:auto;min-height:initial" />
            Enable auto-reply
          </label>
        </div>
        <div style="grid-column:1/-1">
          <label>Auto-reply text</label>
          <textarea id="WA_AUTOREPLY_TEXT" rows="3" placeholder="Thank you, we will get back to you soon."></textarea>
        </div>
      </div>

      <h3 style="margin-top:14px">Template selectors</h3>
      <p class="muted">Select the approved template to use for each flow (stored as <code>name:language</code>).</p>
      <div class="grid">
        <div><label>Order confirmation</label><select id="WA_TMP_ORDER_CONFIRM"></select></div>
        <div><label>Payment confirmation</label><select id="WA_TMP_PAYMENT_CONFIRM"></select></div>
        <div><label>Ticket delivery</label><select id="WA_TMP_TICKET_DELIVERY"></select></div>
        <div><label>Skou reminders</label><select id="WA_TMP_SKOU_SALES"></select></div>
      </div>

      <div class="hr"></div>

      <h3>Template variable mapping (for {{1}}, {{2}}, {{3}})</h3>
      <p class="muted">Choose what each numbered variable should contain when sending messages.</p>
      <div class="grid">
        <div>
          <label>{{1}} maps to</label>
          <select id="WA_MAP_VAR1">
            <option value="name">Name</option>
            <option value="order_no">Order no</option>
            <option value="ticket_url">Ticket url</option>
            <option value="buyer_phone">Buyer phone</option>
          </select>
        </div>
        <div>
          <label>{{2}} maps to</label>
          <select id="WA_MAP_VAR2">
            <option value="name">Name</option>
            <option value="order_no">Order no</option>
            <option value="ticket_url">Ticket url</option>
            <option value="buyer_phone">Buyer phone</option>
          </select>
        </div>
        <div>
          <label>{{3}} maps to</label>
          <select id="WA_MAP_VAR3">
            <option value="name">Name</option>
            <option value="order_no">Order no</option>
            <option value="ticket_url">Ticket url</option>
            <option value="buyer_phone">Buyer phone</option>
          </select>
        </div>
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

      <div class="hr"></div>

      <h3>Inbox (last 100)</h3>
      <div id="wa-inbox" class="muted">Loading…</div>
      <div class="grid" style="margin-top:10px">
        <div><input id="wa_reply_to" placeholder="27XXXXXXXXX"/></div>
        <div><input id="wa_reply_text" placeholder="Type a quick reply…"/></div>
      </div>
      <div class="row-actions">
        <button id="wa_reply_btn" class="btn">Send reply</button>
        <span id="wa_reply_msg" class="muted"></span>
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
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div></div>
        <div><label>Test Public Key</label><input id="YOCO_TEST_PUBLIC_KEY"/></div>
        <div><label>Test Secret Key</label><input id="YOCO_TEST_SECRET_KEY"/></div>
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

      <!-- Numbers -->
      <div class="cardish" style="border:1px solid #eef1f3; border-radius:12px; padding:12px; margin-bottom:12px">
        <h3 style="margin:0 0 8px">Numbers</h3>
        <p class="muted">Normalize all stored numbers to <b>27XXXXXXXXX</b> (11 digits) for WhatsApp.</p>
        <div class="row-actions">
          <button id="pv-normalize" class="btn">Normalize all numbers</button>
          <span id="pv-normalize-msg" class="muted"></span>
        </div>
      </div>

      <!-- Campaigns -->
      <div class="cardish" style="border:1px solid #eef1f3; border-radius:12px; padding:12px;">
        <h3 style="margin:0 0 8px">Campaigns</h3>
        <p class="muted" style="margin-top:0">Create a campaign from <b>all eligible past visitors</b> (opted-in & valid numbers), then run/continue it in batches.</p>

        <div class="grid">
          <div style="grid-column:1/-1">
            <label>Campaign name</label>
            <input id="pv-camp-name" placeholder="Villiersdorp Skou push — Oct 2025"/>
          </div>
          <div>
            <label>Template</label>
            <select id="pv-camp-tpl">
              <option value="WA_TMP_SKOU_SALES">Skou reminders (recommended)</option>
              <option value="WA_TMP_ORDER_CONFIRM">Order confirmation</option>
              <option value="WA_TMP_PAYMENT_CONFIRM">Payment confirmation</option>
              <option value="WA_TMP_TICKET_DELIVERY">Ticket delivery</option>
            </select>
          </div>
          <div>
            <label>Body variables (comma separated, optional)</label>
            <input id="pv-camp-vars" placeholder="e.g. Villiersdorp Skou, 24–25 Okt"/>
          </div>
        </div>

        <div class="row-actions">
          <button id="pv-camp-create" class="btn">Create campaign from ALL</button>
          <span id="pv-camp-create-msg" class="muted"></span>
        </div>

        <div class="hr"></div>

        <div class="grid">
          <div><label>Campaign ID</label><input id="pv-camp-id" placeholder="e.g. 12"/></div>
          <div><label>Batch size</label><input id="pv-camp-batch" value="1000"/></div>
          <div><label>Delay (ms) between messages</label><input id="pv-camp-delay" value="200"/></div>
        </div>

        <div class="row-actions">
          <button id="pv-camp-run" class="btn">Run/continue batch</button>
          <button id="pv-camp-status" class="btn outline">Refresh status</button>
          <span id="pv-camp-run-msg" class="muted"></span>
        </div>

        <div id="pv-camp-status-box" class="muted"></div>
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

  // ---------- Settings load ----------
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

    // ✅ checkbox + textarea
    $('#WA_AUTOREPLY_ENABLED').checked = String(s.WA_AUTOREPLY_ENABLED||'0') === '1';
    $('#WA_AUTOREPLY_TEXT').value = s.WA_AUTOREPLY_TEXT || '';

    // Template variable mappings
    $('#WA_MAP_VAR1').value = s.WA_MAP_VAR1 || 'name';
    $('#WA_MAP_VAR2').value = s.WA_MAP_VAR2 || 'order_no';
    $('#WA_MAP_VAR3').value = s.WA_MAP_VAR3 || 'ticket_url';

    // Template picks
    $('#WA_TMP_ORDER_CONFIRM').dataset.value   = s.WA_TMP_ORDER_CONFIRM || '';
    $('#WA_TMP_PAYMENT_CONFIRM').dataset.value = s.WA_TMP_PAYMENT_CONFIRM || '';
    $('#WA_TMP_TICKET_DELIVERY').dataset.value = s.WA_TMP_TICKET_DELIVERY || '';
    $('#WA_TMP_SKOU_SALES').dataset.value      = s.WA_TMP_SKOU_SALES || '';
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

  // ---------- WhatsApp Inbox + quick reply ----------
  async function loadInbox(){
    const box = $('#wa-inbox');
    box.textContent = 'Loading…';
    const r = await fetch('/api/whatsapp/inbox', { credentials:'include' })
      .then(x=>x.json()).catch(()=>({ok:false}));
    if (!r.ok){ box.textContent = 'Unable to load inbox.'; return; }
    const rows = r.messages || [];
    if (!rows.length){ box.textContent = 'No messages yet.'; return; }
    box.innerHTML = rows.map(m=>{
      const dir = m.direction === 'in' ? '⬅︎ in' : 'out ➡︎';
      const who = m.direction === 'in' ? (m.wa_from||'') : (m.wa_to||'');
      const ts  = m.ts ? new Date(m.ts*1000).toLocaleString() : '';
      const body = esc(m.text||'');
      const cls = m.direction === 'in' ? 'in' : 'out';
      return \`<div class="msg \${cls}">
        <div class="muted" style="font-size:12px">\${dir} · \${who} · \${ts}</div>
        <div>\${body}</div>
      </div>\`;
    }).join('');
  }

  $('#wa_reply_btn').onclick = async ()=>{
    const to = msisdn($('#wa_reply_to').value);
    const text = $('#wa_reply_text').value.trim();
    const m = $('#wa_reply_msg');
    if (!to || !text){ m.textContent='Enter phone + text.'; return; }
    m.textContent='Sending…';
    const r = await fetch('/api/whatsapp/reply', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ to, text })
    }).then(x=>x.json()).catch(()=>({ok:false}));
    m.textContent = r.ok ? 'Sent.' : 'Failed (no recent session?)';
    if (r.ok){ $('#wa_reply_text').value=''; loadInbox(); }
  };

  // ---------- Past visitors: small helpers ----------
  function parseCSV(text) {
    const lines = String(text || "").split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const parts = line.split(",");
      if (!parts.length) continue;
      const name = (parts[0] || "").trim();
      const phone = msisdn(parts.slice(1).join(",").trim());
      rows.push({ name, phone });
    }
    return rows;
  }
  const parseVars = (raw)=>{ const s=String(raw||'').trim(); return s? s.split(',').map(x=>x.trim()).filter(Boolean) : []; };

  // ---------- Past visitors: actions ----------
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
  };

  // Normalize all numbers
  $('#pv-normalize').onclick = async ()=>{
    const m = $('#pv-normalize-msg');
    m.textContent = 'Normalizing…';
    const j = await fetch('/api/admin/past/normalize', {
      method:'POST', credentials:'include'
    }).then(r=>r.json()).catch(()=>({ok:false}));
    m.textContent = j.ok
      ? \`Done. fixed \${j.fixed}, unchanged \${j.unchanged}, invalid \${j.invalid} (total \${j.total})\`
      : ('Failed: '+(j.error||''));
  };

  // Campaign actions
  async function campaignStatus(cid){
    const box = $('#pv-camp-status-box');
    box.textContent = 'Loading status…';
    const j = await fetch('/api/admin/past/campaigns/'+encodeURIComponent(cid)+'/status', { credentials:'include' })
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.textContent = 'Status not available.'; return; }
    const c = j.campaign || {};
    const st = j.stats || {};
    box.innerHTML = \`
      <div><b>\${esc(c.name||('Campaign '+cid))}</b></div>
      <div class="muted">Status: \${esc(c.status||'')}</div>
      <div style="margin-top:6px">
        <span class="pill">queued: \${st.queued||0}</span>
        <span class="pill">sent: \${st.sent||0}</span>
        <span class="pill">failed: \${st.failed||0}</span>
      </div>\`;
  }

  $('#pv-camp-create').onclick = async ()=>{
    const msg = $('#pv-camp-create-msg');
    const template_key = $('#pv-camp-tpl').value;
    const name = $('#pv-camp-name').value.trim() || ('Ad-hoc '+new Date().toLocaleString());
    const vars = parseVars($('#pv-camp-vars').value);

    msg.textContent = 'Creating…';
    const j = await fetch('/api/admin/past/campaigns/create', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ name, template_key, vars })
    }).then(r=>r.json()).catch(()=>({ok:false}));

    if (j.ok){
      $('#pv-camp-id').value = j.campaign_id;
      msg.textContent = 'Created ✓ (ID '+j.campaign_id+').';
      campaignStatus(j.campaign_id);
    } else {
      msg.textContent = 'Failed: ' + (j.error||'');
    }
  };

  $('#pv-camp-run').onclick = async ()=>{
    const cid = Number($('#pv-camp-id').value || 0);
    const msg = $('#pv-camp-run-msg');
    if (!cid){ msg.textContent='Enter campaign ID.'; return; }
    const batch = Number($('#pv-camp-batch').value || 1000);
    const delay = Number($('#pv-camp-delay').value || 200);

    msg.textContent = 'Processing…';
    const j = await fetch('/api/admin/past/campaigns/run', {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ campaign_id: cid, batch_size: batch, delay_ms: delay })
    }).then(r=>r.json()).catch(()=>({ok:false}));

    msg.textContent = j.ok ? ('Processed '+(j.processed||0)+(j.done?' (done)':'') ) : ('Failed: '+(j.error||''));
    campaignStatus(cid);
  };

  $('#pv-camp-status').onclick = ()=>{
    const cid = Number($('#pv-camp-id').value || 0);
    if (!cid){ $('#pv-camp-run-msg').textContent='Enter campaign ID.'; return; }
    campaignStatus(cid);
  };

  // WA test send
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
  loadSettings().then(()=>{ loadTemplates(); loadInbox(); });
  const hash = (location.hash||"").replace(/^#settings:/,"");
  if (hash === "past") showTab("past");
  window.AdminPanels.settings = ()=>showTab('gen');
})();
`;
export default adminSiteSettingsJS;
