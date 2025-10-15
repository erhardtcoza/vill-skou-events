// /src/ui/admin_sitesettings.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminSiteSettingsJS = `
(function(){
  if (!window.AdminPanels) window.AdminPanels = {};
  const esc = s => String(s??'').replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const $ = (s,root=document) => root.querySelector(s);

  // Small helpers
  async function getSettings(){
    const r = await fetch('/api/admin/settings'); const j = await r.json();
    return j.settings || {};
  }
  async function saveSettings(updates){
    await fetch('/api/admin/settings/update',{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ updates })
    });
  }
  async function listTemplates(){
    const r = await fetch('/api/admin/whatsapp/templates'); const j = await r.json();
    return j.templates || [];
  }
  function bodyVarCount(tpl){
    try{
      const comps = JSON.parse(tpl.components_json||'[]');
      const body = (comps||[]).find(c=>c.type==='BODY' || c.type==='body');
      if (!body || !Array.isArray(body.example?.body_text)) return 0;
      // Meta’s component examples include “{{1}} …”, count max index we see
      const str = (body.example.body_text[0]||'');
      const m = str.match(/{{(\d+)}}/g) || [];
      return m.reduce((mx,seg)=>Math.max(mx, Number(seg.replace(/[{}]/g,''))||0), 0);
    }catch{ return 0; }
  }

  // Renders a section header & shell
  function section(title, note=''){
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.marginTop = '12px';
    wrap.innerHTML = \`
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 8px">
        <h3 style="margin:0">\${esc(title)}</h3>
        \${note ? '<div class="muted" style="font-weight:600">'+esc(note)+'</div>' : ''}
      </div>
      <div class="content"></div>
    \`;
    return wrap;
  }

  // The main panel entry (called by /src/ui/admin.js)
  window.AdminPanels.settings = async function(){
    const host = document.getElementById('panel-settings');
    host.innerHTML = '';

    // Subtabs (General | WhatsApp | Yoco | Wallet | Past Visitors)
    // We keep your existing structure but overhaul the WhatsApp tab content.
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    tabs.innerHTML = \`
      <div class="tab active" data-sub="general">General</div>
      <div class="tab" data-sub="whatsapp">WhatsApp</div>
      <div class="tab" data-sub="yoco">Yoco</div>
      <div class="tab" data-sub="wallet">Wallet</div>
      <div class="tab" data-sub="past">Past Visitors</div>
    \`;
    host.appendChild(tabs);

    const pane = document.createElement('div');
    pane.id = 'settings-subpane';
    host.appendChild(pane);

    // Wire generic subtab switcher
    tabs.addEventListener('click', (e)=>{
      const t = e.target.closest('.tab'); if(!t) return;
      tabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const name = t.dataset.sub;
      if (name==='whatsapp') renderWhatsApp(pane);
      else renderGeneral(pane, name);
      history.replaceState(null,'','#settings:'+name);
    });

    // Default: honor deep-link, else show general
    const hash = (location.hash||'').split(':')[1]||'general';
    tabs.querySelector(\`.tab[data-sub="\${hash}"]\`)?.click() || tabs.querySelector('.tab[data-sub="general"]').click();
  };

  // Deep-link switch helper (called by admin.js)
  window.AdminPanels.settingsSwitch = function(sub){
    const tab = document.querySelector('#panel-settings .tabs .tab[data-sub="'+sub+'"]');
    tab?.click();
  };

  /* ---------------- General / other existing settings ---------------- */
  async function renderGeneral(pane, which){
    // You can keep your existing renderer (not shown here).
    pane.innerHTML = '<div class="muted">Use your existing General/Yoco/Wallet/Past Visitors UI here.</div>';
  }

  /* ----------------------- WHATSAPP PANEL ---------------------------- */
  async function renderWhatsApp(pane){
    pane.innerHTML = '';
    const settings = await getSettings();
    const templates = await listTemplates();

    /* 1) Settings */
    const secSettings = section('Settings');
    $('.content', secSettings).innerHTML = \`
      <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr">
        <label>Access Token<br><input id="wa_token" value="\${esc(settings.WHATSAPP_TOKEN||settings.WA_TOKEN||'')}" style="width:100%"></label>
        <label>VERIFY_TOKEN (Webhook verify)<br><input id="wa_verify" value="\${esc(settings.VERIFY_TOKEN||'')}" style="width:100%"></label>
        <label>Phone Number ID<br><input id="wa_pnid" value="\${esc(settings.PHONE_NUMBER_ID||settings.WA_PHONE_NUMBER_ID||'')}" style="width:100%"></label>
        <label>Business (WABA) ID<br><input id="wa_waba" value="\${esc(settings.BUSINESS_ID||settings.WA_BUSINESS_ID||'')}" style="width:100%"></label>
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
        <label class="pill"><input id="wa_autoreply" type="checkbox" \${(settings.WA_AUTOREPLY_ENABLED=='1' || settings.WA_AUTOREPLY_ENABLED==='true')?'checked':''}> Enable auto-reply</label>
        <input id="wa_autotext" placeholder="Auto-reply text" value="\${esc(settings.WA_AUTOREPLY_TEXT||'')}" style="flex:1">
        <button id="wa_save_settings" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save</button>
      </div>
    `;
    pane.appendChild(secSettings);

    $('#wa_save_settings', secSettings).onclick = async ()=>{
      await saveSettings({
        WA_TOKEN: $('#wa_token').value.trim(),
        VERIFY_TOKEN: $('#wa_verify').value.trim(),
        WA_PHONE_NUMBER_ID: $('#wa_pnid').value.trim(),
        WA_BUSINESS_ID: $('#wa_waba').value.trim(),
        WA_AUTOREPLY_ENABLED: $('#wa_autoreply').checked ? '1' : '0',
        WA_AUTOREPLY_TEXT: $('#wa_autotext').value
      });
      alert('Saved.');
    };

    /* 2) Templates */
    const secTemplates = section('Templates', 'Approved templates available to send');
    const tBody = document.createElement('div');
    tBody.innerHTML = \`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="muted">Total: \${templates.length}</div>
        <button id="wa_sync" class="tab" style="font-weight:800">Sync templates</button>
      </div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th>Name</th><th>Lang</th><th>Status</th><th>Category</th><th>Body vars</th></tr></thead>
          <tbody id="wa_tpl_tbl"></tbody>
        </table>
      </div>
    \`;
    $('.content', secTemplates).appendChild(tBody);
    pane.appendChild(secTemplates);

    const tb = $('#wa_tpl_tbl', tBody);
    for(const t of templates){
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>\${esc(t.name)}</td>
        <td>\${esc(t.language)}</td>
        <td>\${esc(t.status||'')}</td>
        <td>\${esc(t.category||'')}</td>
        <td>\${bodyVarCount(t)}</td>\`;
      tb.appendChild(tr);
    }
    $('#wa_sync', tBody).onclick = async ()=>{
      await fetch('/api/admin/whatsapp/sync',{method:'POST'});
      alert('Synced. Refresh to see updates.');
    };

    /* 3) Inbox */
    const secInbox = section('Inbox', 'Latest inbound WhatsApp messages');
    $('.content', secInbox).innerHTML = \`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <button id="wa_inbox_refresh" class="tab" style="font-weight:800">Refresh</button>
      </div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th>When</th><th>From</th><th>To</th><th>Body</th><th></th></tr></thead>
          <tbody id="wa_inbox_tb"></tbody>
        </table>
      </div>
    \`;
    pane.appendChild(secInbox);

    async function loadInbox(){
      const r = await fetch('/api/admin/whatsapp/inbox?limit=100'); const j = await r.json();
      const rows = j.inbox||[];
      const tb = $('#wa_inbox_tb', secInbox); tb.innerHTML='';
      for(const m of rows){
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>\${new Date((m.received_at||0)*1000).toLocaleString()}</td>
          <td>\${esc(m.from_msisdn||'')}</td>
          <td>\${esc(m.to_msisdn||'')}</td>
          <td>\${esc(m.body||'')}</td>
          <td style="white-space:nowrap">
            <input type="text" placeholder="Reply…" data-r="\${m.id}" style="width:220px">
            <button data-reply="\${m.id}" class="tab" style="font-weight:800">Send</button>
            <button data-del="\${m.id}" class="tab" style="font-weight:800;background:#b42318;color:#fff;border-color:#b42318">Delete</button>
          </td>\`;
        tb.appendChild(tr);
      }
      tb.querySelectorAll('[data-reply]').forEach(b=>{
        b.onclick = async ()=>{
          const id = Number(b.getAttribute('data-reply'));
          const txt = tb.querySelector('input[data-r="'+id+'"]').value.trim();
          if(!txt) return;
          await fetch('/api/admin/whatsapp/reply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ id, text: txt })});
          await loadInbox();
        };
      });
      tb.querySelectorAll('[data-del]').forEach(b=>{
        b.onclick = async ()=>{
          const id = Number(b.getAttribute('data-del'));
          if(!confirm('Delete this message?')) return;
          await fetch('/api/admin/whatsapp/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ id })});
          await loadInbox();
        };
      });
    }
    $('#wa_inbox_refresh', secInbox).onclick = loadInbox; loadInbox();

    /* 4) Template selectors + variable mapping */
    const secSelect = section('Template selectors');
    const flows = [
      ['WA_TMP_ORDER_CONFIRM','Order confirmation'],
      ['WA_TMP_PAYMENT_CONFIRM','Payment confirmation'],
      ['WA_TMP_TICKET_DELIVERY','Ticket delivery'],
      ['WA_TMP_SKOU_SALES','Skou reminders'],
      ['WA_TMP_BAR_WELCOME','Bar: wallet created'],
      ['WA_TMP_BAR_TOPUP','Bar: top-up'],
      ['WA_TMP_BAR_PURCHASE','Bar: purchase'],
      ['WA_TMP_BAR_LOW','Bar: low balance']
    ];
    const tplOpts = (sel) => ['',''].concat(templates.map(t=>`${t.name}:${t.language}`)).map(v=>{
      const selAttr = v===sel?' selected':'';
      return \`<option\${selAttr}>\${esc(v)}</option>\`;
    }).join('');
    $('.content', secSelect).innerHTML = \`
      <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr">
        \${flows.map(([key,label])=>{
          const cur = settings[key] || '';
          return \`<label>\${esc(label)}<br>
            <select data-tkey="\${key}" style="width:100%">\${tplOpts(cur)}</select>
          </label>\`;
        }).join('')}
      </div>
      <div style="margin-top:12px">
        <h4 style="margin:0 0 6px">Template variable mapping (for {{1}}, {{2}}, {{3}})</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label class="pill">({{1}}) maps to&nbsp;
            <select id="wa_map1">
              <option value="">—</option>
              <option value="buyer_name">Buyer name</option>
              <option value="order_no">Order no</option>
              <option value="tickets_url">Tickets URL</option>
              <option value="wallet_link">Wallet link</option>
              <option value="amount">Amount</option>
              <option value="balance">Balance</option>
            </select>
          </label>
          <label class="pill">({{2}}) maps to&nbsp;
            <select id="wa_map2">
              <option value="">—</option>
              <option value="buyer_name">Buyer name</option>
              <option value="order_no">Order no</option>
              <option value="tickets_url">Tickets URL</option>
              <option value="wallet_link">Wallet link</option>
              <option value="amount">Amount</option>
              <option value="balance">Balance</option>
            </select>
          </label>
          <label class="pill">({{3}}) maps to&nbsp;
            <select id="wa_map3">
              <option value="">—</option>
              <option value="buyer_name">Buyer name</option>
              <option value="order_no">Order no</option>
              <option value="tickets_url">Tickets URL</option>
              <option value="wallet_link">Wallet link</option>
              <option value="amount">Amount</option>
              <option value="balance">Balance</option>
            </select>
          </label>
          <button id="wa_save_selectors" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save selectors</button>
        </div>
      </div>
    `;
    pane.appendChild(secSelect);

    // Prime mapping selects with saved values
    $('#wa_map1').value = settings.WA_MAP_VAR1 || '';
    $('#wa_map2').value = settings.WA_MAP_VAR2 || '';
    $('#wa_map3').value = settings.WA_MAP_VAR3 || '';

    $('#wa_save_selectors').onclick = async ()=>{
      const updates = {
        WA_MAP_VAR1: $('#wa_map1').value,
        WA_MAP_VAR2: $('#wa_map2').value,
        WA_MAP_VAR3: $('#wa_map3').value,
      };
      document.querySelectorAll('[data-tkey]').forEach(sel=>{
        updates[sel.getAttribute('data-tkey')] = sel.value;
      });
      await saveSettings(updates);
      alert('Saved.');
    };

    /* 5) Send (text or template) */
    const secSend = section('Send');
    $('.content', secSend).innerHTML = \`
      <div class="card" style="padding:12px;margin:0 0 10px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="send_to" placeholder="Phone (msisdn e.g. 2771…)" style="min-width:240px">
          <input id="send_text" placeholder="Text message…" style="flex:1;min-width:260px">
          <button id="send_text_btn" class="tab" style="font-weight:800">Send text</button>
        </div>
      </div>
      <div class="card" style="padding:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <input id="send_to_tpl" placeholder="Phone (msisdn)" style="min-width:240px">
          <select id="send_tpl" style="min-width:260px">
            \${[''].concat(templates.map(t=>\`\${t.name}:\${t.language}\`)).map(v=>\`<option>\${esc(v)}</option>\`).join('')}
          </select>
          <input id="send_vars" placeholder="Variables comma separated (optional)" style="flex:1;min-width:260px">
          <button id="send_tpl_btn" class="tab" style="font-weight:800">Send template</button>
        </div>
      </div>
    `;
    pane.appendChild(secSend);

    $('#send_text_btn', secSend).onclick = async ()=>{
      const to = $('#send_to').value.trim(); const text = $('#send_text').value.trim();
      if(!to || !text) return;
      await fetch('/api/admin/whatsapp/send-text',{
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ to, text })
      });
      alert('Sent (text).');
    };
    $('#send_tpl_btn', secSend).onclick = async ()=>{
      const to = $('#send_to_tpl').value.trim();
      const key = $('#send_tpl').value.trim();
      if(!to || !key) return;
      const vars = $('#send_vars').value.split(',').map(s=>s.trim()).filter(Boolean);
      await fetch('/api/admin/whatsapp/test',{
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ to, template_key: key.split(':')[0]? key.split(':')[0] : key, vars })
      });
      alert('Sent (template).');
    };
  }
})();
`;
