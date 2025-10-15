// /src/ui/admin_sitesettings.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminSiteSettingsJS = `
(function(){
  if (!window.AdminPanels) window.AdminPanels = {};
  const esc = (s)=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const rands=(c)=>"R"+((Number(c)||0)/100).toFixed(2);

  // Small helpers
  async function api(url, opts){
    const r = await fetch(url, opts);
    const j = await r.json().catch(()=>({ ok:false, error:"bad json" }));
    if (!r.ok || j.ok===false) throw new Error(j.error || ("HTTP "+r.status));
    return j;
  }
  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }

  // ---------- WhatsApp panel ----------
  window.AdminPanels.settings = async function(){
    const host = document.getElementById("panel-settings");
    host.innerHTML = "";

    // Subtabs
    const subtabs = el(
      '<div class="tabs" id="wa-subtabs" style="margin-bottom:10px">'
      + '<div class="tab active" data-wa="general">General</div>'
      + '<div class="tab" data-wa="whatsapp">WhatsApp</div>'
      + '<div class="tab" data-wa="yoco">Yoco</div>'
      + '<div class="tab" data-wa="visitors">Past Visitors</div>'
      + '</div>'
    );

    // Container
    const waWrap = el('<div id="wa-wrap"></div>');
    host.appendChild(subtabs);
    host.appendChild(waWrap);

    // Render WhatsApp composite UI
    function waSection(){
      waWrap.innerHTML =
        '<div class="card" style="margin-bottom:14px">'
          + '<h2 style="margin:0 0 10px">WhatsApp · Settings</h2>'
          + '<div id="wa-settings"></div>'
        + '</div>'
        + '<div class="card" style="margin-bottom:14px">'
          + '<h2 style="margin:0 0 10px">Templates</h2>'
          + '<div id="wa-templates"></div>'
        + '</div>'
        + '<div class="card" style="margin-bottom:14px">'
          + '<h2 style="margin:0 0 10px">Inbox</h2>'
          + '<div id="wa-inbox"></div>'
        + '</div>'
        + '<div class="card" style="margin-bottom:14px">'
          + '<h2 style="margin:0 0 10px">Template selectors & variable mapping</h2>'
          + '<div id="wa-selectors"></div>'
        + '</div>'
        + '<div class="card">'
          + '<h2 style="margin:0 0 10px">Send</h2>'
          + '<div id="wa-send"></div>'
        + '</div>';

      renderSettings();
      renderTemplates();
      renderInbox();
      renderSelectors();
      renderSend();
    }

    // ---- Settings ----
    async function renderSettings(){
      // Load current settings
      const j = await api('/api/admin/settings');
      const s = j.settings || {};

      const html =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end">'
        + '<label>Access Token<br><input id="wa_token" style="width:100%" value="'+esc(s.WHATSAPP_TOKEN||s.WA_TOKEN||'')+'"></label>'
        + '<label>VERIFY_TOKEN (Webhook verify)<br><input id="verify_token" style="width:100%" value="'+esc(s.VERIFY_TOKEN||'')+'"></label>'
        + '<label>Phone Number ID<br><input id="wa_pnid" style="width:100%" value="'+esc(s.PHONE_NUMBER_ID||s.WA_PHONE_NUMBER_ID||'')+'"></label>'
        + '<label>Business (WABA) ID<br><input id="wa_waba" style="width:100%" value="'+esc(s.BUSINESS_ID||s.WA_BUSINESS_ID||'')+'"></label>'
        + '<label><input type="checkbox" id="wa_auto" '
            + ((String(s.WA_AUTOREPLY_ENABLED||'0')==='1')?'checked':'') + '> Enable auto-reply</label>'
        + '<label style="grid-column:1/-1">Auto-reply text<br>'
            + '<textarea id="wa_auto_text" rows="3" style="width:100%">'+esc(s.WA_AUTOREPLY_TEXT||'')+'</textarea></label>'
        + '<div style="grid-column:1/-1"><button id="wa_save" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save</button></div>'
        + '</div>';

      const box = document.getElementById('wa-settings');
      box.innerHTML = html;

      document.getElementById('wa_save').onclick = async ()=>{
        const updates = {
          WA_TOKEN: document.getElementById('wa_token').value.trim(),
          VERIFY_TOKEN: document.getElementById('verify_token').value.trim(),
          WA_PHONE_NUMBER_ID: document.getElementById('wa_pnid').value.trim(),
          WA_BUSINESS_ID: document.getElementById('wa_waba').value.trim(),
          WA_AUTOREPLY_ENABLED: document.getElementById('wa_auto').checked ? '1':'0',
          WA_AUTOREPLY_TEXT: document.getElementById('wa_auto_text').value
        };
        await api('/api/admin/settings/update', {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ updates })
        });
        alert('Saved.');
      };
    }

    // ---- Templates ----
    async function renderTemplates(){
      const box = document.getElementById('wa-templates');
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<div class="muted">Meta templates synchronised into <code>wa_templates</code>.</div>'
        + '<button id="wa_sync" class="tab" style="font-weight:800">Sync templates</button>'
        + '</div>'
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Name</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Language</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Status</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Category</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Body vars</th></tr></thead>'
        + '<tbody id="wa_tpl_body"></tbody></table>';

      document.getElementById('wa_sync').onclick = async ()=>{
        await api('/api/admin/whatsapp/sync', { method:'POST' });
        await fill();
      };

      async function fill(){
        const rows = (await api('/api/admin/whatsapp/templates')).templates || [];
        const tBody = document.getElementById('wa_tpl_body');
        tBody.innerHTML = '';
        for (const t of rows){
          // count body placeholders if components_json present
          let vars = '-';
          try{
            const comp = t.components_json ? JSON.parse(t.components_json) : [];
            const body = (comp || []).find(c => c.type === 'BODY');
            const txt  = body?.text || '';
            const m = txt.match(/\\{\\{\\d+\\}\\}/g);
            vars = m ? String(m.length) : '0';
          }catch{}
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(t.name)+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(t.language)+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(t.status||'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(t.category||'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+vars+'</td>';
          tBody.appendChild(tr);
        }
      }
      fill();
    }

    // ---- Inbox ----
    async function renderInbox(){
      const box = document.getElementById('wa-inbox');
      box.innerHTML =
        '<div class="muted" style="margin-bottom:10px">Latest inbound messages from WhatsApp.</div>'
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">From</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">To</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Type</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Text</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">When</th>'
        + '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb"></th>'
        + '</tr></thead><tbody id="wa_inbox_body"></tbody></table>';

      async function fill(){
        // reuse existing admin endpoint if you have one; otherwise read directly (simple version)
        const rows = (await fetch('/api/whatsapp/inbox').then(r=>r.json()).catch(()=>({rows:[]}))).rows || [];
        const tb = document.getElementById('wa_inbox_body'); tb.innerHTML='';
        for (const m of rows){
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(m.from_msisdn||'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(m.to_msisdn||'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(m.type||'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+esc(m.body||'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+(m.received_at? new Date(m.received_at*1000).toLocaleString():'')+'</td>'
            + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'
              + '<button class="tab" data-reply="'+esc(m.from_msisdn||'')+'">Send</button> '
              + '<button class="tab" style="background:#b42318;color:#fff;border-color:#b42318" data-del="'+esc(m.id)+'">Delete</button>'
            + '</td>';
          tb.appendChild(tr);
        }

        tb.querySelectorAll('[data-reply]').forEach(b=>{
          b.onclick = async ()=>{
            const msisdn = b.getAttribute('data-reply');
            const txt = prompt('Reply to '+msisdn, '');
            if (txt==null || !txt.trim()) return;
            await api('/api/admin/whatsapp/send-text', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ to: msisdn, text: txt }) });
            alert('Sent.');
          };
        });
        tb.querySelectorAll('[data-del]').forEach(b=>{
          b.onclick = async ()=>{
            if(!confirm('Delete message?')) return;
            await api('/api/admin/whatsapp/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: Number(b.getAttribute('data-del')) }) });
            fill();
          };
        });
      }
      fill();
    }

    // ---- Template selectors + mapping (simple version kept as before) ----
    async function renderSelectors(){
      // This reuses your existing keys WA_TMP_* and WA_MAP_VAR*
      const box = document.getElementById('wa-selectors');
      const s = (await api('/api/admin/settings')).settings || {};
      const sel = function(label, id, value){
        return '<label style="display:block;margin:6px 0">'
              + esc(label) + '<br><input id="'+id+'" style="width:100%" value="'+esc(value||'')+'"></label>';
      };
      box.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
          + sel('Order confirmation (name:lang)', 'wa_sel_ord', s.WA_TMP_ORDER_CONFIRM||'')
          + sel('Payment confirmation (name:lang)', 'wa_sel_pay', s.WA_TMP_PAYMENT_CONFIRM||'')
          + sel('Ticket delivery (name:lang)', 'wa_sel_tix', s.WA_TMP_TICKET_DELIVERY||'')
          + sel('Skou reminders (name:lang)', 'wa_sel_skou', s.WA_TMP_SKOU_SALES||'')
          + sel('Map {{1}}', 'wa_map1', s.WA_MAP_VAR1||'')
          + sel('Map {{2}}', 'wa_map2', s.WA_MAP_VAR2||'')
          + sel('Map {{3}}', 'wa_map3', s.WA_MAP_VAR3||'')
          + '<div style="grid-column:1/-1"><button id="wa_sel_save" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save selectors & mapping</button></div>'
        + '</div>';

      document.getElementById('wa_sel_save').onclick = async ()=>{
        const updates = {
          WA_TMP_ORDER_CONFIRM: document.getElementById('wa_sel_ord').value.trim(),
          WA_TMP_PAYMENT_CONFIRM: document.getElementById('wa_sel_pay').value.trim(),
          WA_TMP_TICKET_DELIVERY: document.getElementById('wa_sel_tix').value.trim(),
          WA_TMP_SKOU_SALES: document.getElementById('wa_sel_skou').value.trim(),
          WA_MAP_VAR1: document.getElementById('wa_map1').value.trim(),
          WA_MAP_VAR2: document.getElementById('wa_map2').value.trim(),
          WA_MAP_VAR3: document.getElementById('wa_map3').value.trim(),
        };
        await api('/api/admin/settings/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ updates }) });
        alert('Saved.');
      };
    }

    // ---- Send ----
    function renderSend(){
      const box = document.getElementById('wa-send');
      box.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="card" style="padding:12px">'
          + '<h3 style="margin:0 0 8px">Send text</h3>'
          + '<label>Phone (MSISDN)<br><input id="wa_txt_to" style="width:100%" placeholder="277xxxxxxxx"></label>'
          + '<label>Message<br><textarea id="wa_txt_body" rows="3" style="width:100%"></textarea></label>'
          + '<button id="wa_txt_send" class="tab" style="font-weight:800">Send text</button>'
        + '</div>'
        + '<div class="card" style="padding:12px">'
          + '<h3 style="margin:0 0 8px">Send template</h3>'
          + '<label>Phone (MSISDN)<br><input id="wa_tmpl_to" style="width:100%" placeholder="277xxxxxxxx"></label>'
          + '<label>Template key (e.g. WA_TMP_ORDER_CONFIRM)<br><input id="wa_tmpl_key" style="width:100%" value="WA_TMP_ORDER_CONFIRM"></label>'
          + '<label>Variables (comma separated)<br><input id="wa_tmpl_vars" style="width:100%" placeholder="Piet, CXAHFG"></label>'
          + '<button id="wa_tmpl_send" class="tab" style="font-weight:800">Send template</button>'
        + '</div>'
        + '</div>';

      document.getElementById('wa_txt_send').onclick = async ()=>{
        const to = document.getElementById('wa_txt_to').value.trim();
        const text = document.getElementById('wa_txt_body').value;
        if (!to || !text.trim()) return alert('Enter phone and message.');
        await api('/api/admin/whatsapp/send-text', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ to, text }) });
        alert('Sent.');
      };
      document.getElementById('wa_tmpl_send').onclick = async ()=>{
        const to = document.getElementById('wa_tmpl_to').value.trim();
        const template_key = document.getElementById('wa_tmpl_key').value.trim();
        const vars = (document.getElementById('wa_tmpl_vars').value||'').split(',').map(s=>s.trim()).filter(Boolean);
        if (!to || !template_key) return alert('Enter phone and template key.');
        await api('/api/admin/whatsapp/test', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ to, template_key, vars }) });
        alert('Sent.');
      };
    }

    // wire subtabs (keep existing others functional)
    host.querySelectorAll('#wa-subtabs .tab').forEach(t=>{
      t.onclick = ()=>{
        host.querySelectorAll('#wa-subtabs .tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        const sec = t.dataset.wa;
        if (sec === 'whatsapp') waSection();
        else {
          // fall back to existing inner routers if any
          document.getElementById('panel-settings').innerHTML = '<div class="card">Open the WhatsApp tab to configure WhatsApp.</div>';
          // Then re-append tabs + content again:
          document.getElementById('panel-settings').prepend(subtabs);
          document.getElementById('panel-settings').appendChild(waWrap);
        }
      };
    });

    // Default to WhatsApp subtab if hash says so
    const hash = (location.hash||'');
    if (hash.startsWith('#settings:whatsapp')) {
      host.querySelector('[data-wa="whatsapp"]').click();
    } else {
      // stay in default "General" (existing content rendered by older code)
      // but if you want, auto-open WhatsApp:
      host.querySelector('[data-wa="whatsapp"]').click();
    }
  };
})();
`;
