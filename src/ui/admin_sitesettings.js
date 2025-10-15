// /src/ui/admin_sitesettings.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminSiteSettingsJS = `
(function (){
  if (!window.AdminPanels) window.AdminPanels = {};

  const esc = (s)=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const el  = (html)=>{ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; };

  async function api(url, opts){
    const r = await fetch(url, opts);
    const j = await r.json().catch(()=>({ ok:false, error:"bad json"}));
    if (!r.ok || j.ok===false) throw new Error(j.error || ("HTTP "+r.status));
    return j;
  }

  // Allow other tabs to deep-link to a specific template mapping ("name:lang")
  window.WA_switchToMappings = function(key){
    window.__WA_focusTemplateKey = key;
    // Open settings tab and inner WhatsApp -> Template Mappings subtab
    const t = document.querySelector('#panel-settings .tab[data-wa="whatsapp"]');
    if (t) t.click();
    setTimeout(()=>{
      const m = document.querySelector('#wa-subtabs .wa-subtab[data-wasub="wa_tpl_mappings"]');
      if (m) m.click();
    }, 0);
  };

  // ------------------------------------------------------------
  // Settings panel (outer) + WhatsApp sub-tabs
  // ------------------------------------------------------------
  window.AdminPanels.settings = async function(){
    const host = document.getElementById("panel-settings");
    host.innerHTML = "";

    // Outer Settings subtabs
    const subtabs = el(
      '<div class="tabs" id="wa-subtabs" style="margin-bottom:10px">'
      + '<div class="tab" data-wa="general">General</div>'
      + '<div class="tab active" data-wa="whatsapp">WhatsApp</div>'
      + '<div class="tab" data-wa="yoco">Yoco</div>'
      + '<div class="tab" data-wa="visitors">Past Visitors</div>'
      + '</div>'
    );

    const wrap = el('<div id="wa-wrap"></div>');
    host.appendChild(subtabs);
    host.appendChild(wrap);

    // WhatsApp inner subtabs (Settings / Templates / Inbox / Mappings / Send)
    function renderWhatsApp(){
      wrap.innerHTML =
        '<div class="tabs" id="wa-in-tabs" style="margin:6px 0 10px">'
          + '<div class="tab wa-subtab active" data-wasub="wa_settings">Settings</div>'
          + '<div class="tab wa-subtab" data-wasub="wa_templates">Templates</div>'
          + '<div class="tab wa-subtab" data-wasub="wa_inbox">Inbox</div>'
          + '<div class="tab wa-subtab" data-wasub="wa_tpl_mappings">Template Mappings</div>'
          + '<div class="tab wa-subtab" data-wasub="wa_send">Send</div>'
        + '</div>'
        + '<div id="wa-inner"></div>';

      const inner = document.getElementById('wa-inner');

      // ----- inner renderers -----
      async function paintSettings(){
        const j = await api('/api/admin/settings'); const s = j.settings || {};
        inner.innerHTML =
          '<div class="card">'
            + '<h2 style="margin:0 0 10px">WhatsApp · Settings</h2>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end">'
              + '<label>Access Token<br><input id="wa_token" style="width:100%" value="'+esc(s.WHATSAPP_TOKEN||s.WA_TOKEN||'')+'"></label>'
              + '<label>VERIFY_TOKEN (Webhook verify)<br><input id="verify_token" style="width:100%" value="'+esc(s.VERIFY_TOKEN||"")+'"></label>'
              + '<label>Phone Number ID<br><input id="wa_pnid" style="width:100%" value="'+esc(s.PHONE_NUMBER_ID||s.WA_PHONE_NUMBER_ID||"")+'"></label>'
              + '<label>Business (WABA) ID<br><input id="wa_waba" style="width:100%" value="'+esc(s.BUSINESS_ID||s.WA_BUSINESS_ID||"")+'"></label>'
              + '<label style="grid-column:1/-1"><input type="checkbox" id="wa_auto" '
                  + ((String(s.WA_AUTOREPLY_ENABLED||"0")==="1")?'checked':'') + '> Enable auto-reply</label>'
              + '<label style="grid-column:1/-1">Auto-reply text<br>'
                  + '<textarea id="wa_auto_text" rows="3" style="width:100%">'+esc(s.WA_AUTOREPLY_TEXT||"")+'</textarea></label>'
              + '<div style="grid-column:1/-1"><button id="wa_save" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save</button></div>'
            + '</div>'
          + '</div>';

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

      async function paintTemplates(){
        inner.innerHTML =
          '<div class="card">'
            + '<h2 style="margin:0 0 10px">Templates</h2>'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
              + '<div class="muted">Synced from Meta into <code>wa_templates</code>.</div>'
              + '<button id="wa_sync_all" class="tab" style="font-weight:800">Sync Templates</button>'
            + '</div>'
            + '<div id="waTemplatesBox"></div>'
          + '</div>';

        document.getElementById('wa_sync_all').onclick = async ()=>{
          await api('/api/admin/whatsapp/sync', { method:'POST' });
          await fillTemplates();
        };

        async function fillTemplates(){
          const res = await api('/api/admin/whatsapp/templates');
          const arr = res.templates || [];
          const box = document.getElementById('waTemplatesBox');
          if (!arr.length){ box.innerHTML = '<p>No templates yet. Click “Sync Templates”.</p>'; return; }

          const frag = document.createElement('div');

          arr.forEach(t=>{
            let vars = 0, bodyText = "";
            try{
              const comps = JSON.parse(t.components_json||"[]");
              const body = (comps||[]).find(c=>c.type==="BODY");
              bodyText = body?.text||"";
              const m = bodyText.match(/\\{\\{\\d+\\}\\}/g);
              vars = m ? m.length : 0;
            }catch{}
            const key = t.name + ':' + t.language;

            const card = document.createElement('div');
            card.style = 'border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:10px 0;background:#fff';
            card.innerHTML =
              '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">'
                + '<div><div style="font-weight:700">'+esc(t.name)+' <span style="opacity:.6">('+esc(t.language)+')</span></div>'
                + '<div style="font-size:12px;opacity:.75">Status: '+esc(t.status||"—")+' · Category: '+esc(t.category||"—")+' · Vars: '+vars+'</div></div>'
                + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
                  + '<button class="tab js-edit-map" style="font-weight:800">View / Edit Mapping</button>'
                  + '<button class="tab js-resync" style="font-weight:800">Re-sync from Meta</button>'
                + '</div>'
              + '</div>'
              + (bodyText ? '<pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #eef2f7;padding:8px;border-radius:8px;margin:10px 0 0">'+esc(bodyText)+'</pre>' : '');

            frag.appendChild(card);

            card.querySelector('.js-edit-map').onclick = ()=> window.WA_switchToMappings(key);
            card.querySelector('.js-resync').onclick = async ()=>{
              card.querySelector('.js-resync').disabled = true;
              try {
                await api('/api/admin/whatsapp/sync', { method:'POST' });
                await fillTemplates();
              } catch(e){ alert('Re-sync failed'); }
              finally { card.querySelector('.js-resync').disabled = false; }
            };
          });

          box.innerHTML = '';
          box.appendChild(frag);
        }

        await fillTemplates();
      }

      async function paintInbox(){
        inner.innerHTML =
          '<div class="card">'
            + '<h2 style="margin:0 0 10px">Inbox</h2>'
            + '<div id="wa-inbox"></div>'
          + '</div>';

        const box = document.getElementById('wa-inbox');
        box.innerHTML =
          '<div class="muted" style="margin-bottom:10px">Latest inbound messages.</div>'
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
          const res = await fetch('/api/admin/whatsapp/inbox').then(r=>r.json()).catch(()=>({}));
          const rows = res.items||res.messages||[];
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
                + '<button class="tab" data-reply="'+esc(m.id)+'" data-msisdn="'+esc(m.from_msisdn||'')+'" style="font-weight:800">Reply</button> '
                + '<button class="tab" style="background:#b42318;color:#fff;border-color:#b42318;font-weight:800" data-del="'+esc(m.id)+'">Delete</button>'
              + '</td>';
            tb.appendChild(tr);
          }

          tb.querySelectorAll('[data-reply]').forEach(b=>{
            b.onclick = async ()=>{
              const id = b.getAttribute('data-reply');
              const msisdn = b.getAttribute('data-msisdn');
              const txt = prompt('Reply to '+msisdn, '');
              if (txt==null || !txt.trim()) return;
              await api('/api/admin/whatsapp/inbox/'+encodeURIComponent(id)+'/reply', {
                method:'POST', headers:{'content-type':'application/json'},
                body: JSON.stringify({ text: txt })
              });
              alert('Sent.');
              fill();
            };
          });
          tb.querySelectorAll('[data-del]').forEach(b=>{
            b.onclick = async ()=>{
              if(!confirm('Delete message?')) return;
              const id = b.getAttribute('data-del');
              await api('/api/admin/whatsapp/inbox/'+encodeURIComponent(id)+'/delete', { method:'POST' });
              fill();
            };
          });
        }
        fill();
      }

      async function paintMappings(){
        inner.innerHTML =
          '<div class="card">'
            + '<h2 style="margin:0 0 10px">Template Mappings</h2>'
            + '<div id="waTplMapList"><p>Loading…</p></div>'
          + '</div>';

        const listEl = document.getElementById("waTplMapList");
        const [tplRes, mapRes] = await Promise.all([
          fetch("/api/admin/whatsapp/templates").then(r=>r.json()).catch(()=>({})),
          fetch("/api/admin/whatsapp/mappings").then(r=>r.json()).catch(()=>({}))
        ]);
        if (!tplRes.ok){ listEl.innerHTML = '<p class="error">Failed to load templates</p>'; return; }

        const templates = tplRes.templates || [];
        const mappings  = mapRes.ok ? (mapRes.mappings || []) : [];
        const mapByKeyCtx = {};
        for (const m of mappings) mapByKeyCtx[m.template_key + ":" + m.context] = m;

        const idFromKey = k => 'tpl-' + String(k).replace(/[^a-z0-9]+/ig, '-');

        const frag = document.createElement('div');
        const hdr  = document.createElement('div');
        hdr.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">'
          + '<div class="muted"></div>'
          + '<a href="#settings:whatsapp" class="tab" id="waBackToTemplates" style="font-weight:800">← Back to Templates</a>'
          + '</div>';
        frag.appendChild(hdr);
        hdr.querySelector('#waBackToTemplates').onclick = (e)=>{ e.preventDefault(); switchInner('wa_templates'); };

        for (const tpl of templates){
          const key = tpl.name + ':' + tpl.language;
          let text = "", vars = [];
          try {
            const comps = JSON.parse(tpl.components_json||"[]");
            const body  = (comps||[]).find(c=>c.type==="BODY");
            text = body?.text||"";
            vars = [...text.matchAll(/\\{\\{(\\d+)\\}\\}/g)].map(m=>m[1]);
          } catch {}

          const existed = ["order","ticket","visitor"].map(ctx => mapByKeyCtx[key+":"+ctx]).find(Boolean);
          const currentCtx = existed ? existed.context : "";
          const mapObj = existed ? JSON.parse(existed.mapping_json) : { vars: [] };

          const card = document.createElement('div');
          card.id = idFromKey(key);
          card.style = 'border:1px solid #e5e7eb;padding:12px;border-radius:12px;margin:12px 0;background:#fff';
          card.innerHTML =
            '<h4 style="margin:0 0 8px">'+esc(tpl.name)+' <span style="opacity:.6">('+esc(tpl.language)+')</span></h4>'
            + '<label>Context: '
              + '<select class="ctx">'
                + '<option value="">Select context</option>'
                + '<option value="order" '+(currentCtx==="order"?'selected':'')+'>Order</option>'
                + '<option value="ticket" '+(currentCtx==="ticket"?'selected':'')+'>Ticket</option>'
                + '<option value="visitor" '+(currentCtx==="visitor"?'selected':'')+'>Visitor</option>'
              + '</select>'
            + '</label>'
            + (text ? '<pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #eef2f7;padding:8px;border-radius:8px;margin:10px 0 8px">'+esc(text)+'</pre>' : '')
            + '<table class="var-table" style="margin-top:4px;width:100%;border-collapse:collapse;">'
              + '<thead><tr><th style="text-align:left;">Variable</th><th>Source</th><th>Value</th><th>Fallback</th></tr></thead>'
              + '<tbody>'
                + vars.map(v=>{
                    const ev = (mapObj.vars||[]).find(x=>String(x.variable)===String(v)) || {};
                    return '<tr>'
                      + '<td>{{'+v+'}}</td>'
                      + '<td><select class="source">'
                          + '<option value="field"  '+(ev.source==='field'?'selected':'')+'>field</option>'
                          + '<option value="static" '+(ev.source==='static'?'selected':'')+'>static</option>'
                          + '<option value="compute" '+(ev.source==='compute'?'selected':'')+'>compute</option>'
                        + '</select></td>'
                      + '<td><input class="value" value="'+esc(ev.value||'')+'" placeholder="Value or field name"></td>'
                      + '<td><input class="fallback" value="'+esc(ev.fallback||'')+'" placeholder="Fallback (optional)"></td>'
                    + '</tr>';
                }).join('')
              + '</tbody>'
            + '</table>'
            + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
              + '<button class="tab saveBtn" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">💾 Save Mapping</button>'
              + '<button class="tab jumpBack" style="font-weight:800">Back to Templates</button>'
            + '</div>';

          frag.appendChild(card);

          card.querySelector('.saveBtn').onclick = async ()=>{
            const context = card.querySelector('.ctx').value.trim();
            if (!context) return alert('Please select context first');
            const rows = [...card.querySelectorAll('tbody tr')];
            const mapping = {
              vars: rows.map(r => ({
                variable: r.children[0].innerText.replace(/[{}]/g,''),
                source:   r.querySelector('.source').value,
                value:    r.querySelector('.value').value.trim(),
                fallback: r.querySelector('.fallback').value.trim()
              }))
            };
            await api('/api/admin/whatsapp/mappings/save', {
              method:'POST', headers:{'content-type':'application/json'},
              body: JSON.stringify({ template_key: key, context, mapping })
            });
            alert('Mapping saved.');
          };
          card.querySelector('.jumpBack').onclick = (e)=>{ e.preventDefault(); switchInner('wa_templates'); };
        }

        listEl.innerHTML = '';
        listEl.appendChild(frag);

        // Focus if deep-linked
        const focusKey = window.__WA_focusTemplateKey;
        if (focusKey){
          delete window.__WA_focusTemplateKey;
          const target = document.getElementById(idFromKey(focusKey));
          if (target){ target.scrollIntoView({ behavior:'smooth', block:'start' }); target.style.outline='2px solid #0a7d2b'; setTimeout(()=>{ target.style.outline='none'; }, 1500); }
        }
      }

      function paintSend(){
        inner.innerHTML =
          '<div class="card">'
            + '<h2 style="margin:0 0 10px">Send</h2>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
              + '<div class="card" style="padding:12px">'
                + '<h3 style="margin:0 0 8px">Send text</h3>'
                + '<label>Phone (MSISDN)<br><input id="wa_txt_to" style="width:100%" placeholder="277xxxxxxxx"></label>'
                + '<label>Message<br><textarea id="wa_txt_body" rows="3" style="width:100%"></textarea></label>'
                + '<button id="wa_txt_send" class="tab" style="font-weight:800">Send text</button>'
              + '</div>'
              + '<div class="card" style="padding:12px">'
                + '<h3 style="margin:0 0 8px">Send template (quick test)</h3>'
                + '<label>Phone (MSISDN)<br><input id="wa_tmpl_to" style="width:100%" placeholder="277xxxxxxxx"></label>'
                + '<label>Template key (e.g. WA_TMP_ORDER_CONFIRM)<br><input id="wa_tmpl_key" style="width:100%" value="WA_TMP_ORDER_CONFIRM"></label>'
                + '<label>Variables (comma separated)<br><input id="wa_tmpl_vars" style="width:100%" placeholder="Piet, CXAHFG"></label>'
                + '<button id="wa_tmpl_send" class="tab" style="font-weight:800">Send template</button>'
              + '</div>'
            + '</div>'
          + '</div>';

        document.getElementById('wa_txt_send').onclick = async ()=>{
          const to = document.getElementById('wa_txt_to').value.trim();
          const text = document.getElementById('wa_txt_body').value;
          if (!to || !text.trim()) return alert('Enter phone and message.');
          await api('/api/admin/whatsapp/inbox/0/reply', { // reuse reply sender, id ignored server-side if you prefer
            method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text, to })
          }).catch(async ()=>{
            // fallback to dedicated endpoint if you have one:
            await api('/api/admin/whatsapp/send-text', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ to, text }) });
          });
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

      // Inner tab switcher
      function switchInner(name){
        document.querySelectorAll('#wa-in-tabs .wa-subtab').forEach(x=>x.classList.toggle('active', x.dataset.wasub===name));
        if (name==='wa_settings')       paintSettings();
        else if (name==='wa_templates') paintTemplates();
        else if (name==='wa_inbox')     paintInbox();
        else if (name==='wa_tpl_mappings') paintMappings();
        else if (name==='wa_send')      paintSend();
      }

      // Wire inner tabs
      document.querySelectorAll('#wa-in-tabs .wa-subtab').forEach(t=>{
        t.onclick = ()=> switchInner(t.dataset.wasub);
      });

      // Default inner tab
      switchInner('wa_settings');
    }

    // Outer tabs switch
    host.querySelectorAll('#wa-subtabs .tab').forEach(t=>{
      t.onclick = ()=>{
        host.querySelectorAll('#wa-subtabs .tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        const sec = t.dataset.wa;
        if (sec === 'whatsapp') renderWhatsApp();
        else {
          // Placeholder for other sections
          wrap.innerHTML = '<div class="card">Open the WhatsApp tab to configure WhatsApp.</div>';
        }
      };
    });

    // Open WhatsApp by default (and support #settings:whatsapp deep-link)
    const hash = (location.hash||'');
    if (hash.startsWith('#settings:whatsapp')) {
      host.querySelector('[data-wa="whatsapp"]').click();
    } else {
      host.querySelector('[data-wa="whatsapp"]').click();
    }
  };
})();
`;
