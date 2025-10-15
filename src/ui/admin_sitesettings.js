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

  // One-shot settings cache so the panels switch fast.
  let SETTINGS_CACHE = null;
  async function loadSettings(force=false){
    if (!SETTINGS_CACHE || force){
      const j = await api('/api/admin/settings');
      SETTINGS_CACHE = j.settings || {};
    }
    return SETTINGS_CACHE;
  }
  async function saveSettings(updates){
    await api('/api/admin/settings/update', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ updates })
    });
    // merge into cache so UI updates immediately
    SETTINGS_CACHE = Object.assign({}, SETTINGS_CACHE || {}, updates);
  }

  // Allow other tabs to deep-link to a specific template mapping ("name:lang")
  window.WA_switchToMappings = function(key){
    window.__WA_focusTemplateKey = key;
    const t = document.querySelector('#panel-settings .tab[data-wa="whatsapp"]');
    if (t) t.click();
    setTimeout(()=>{
      const m = document.querySelector('#wa-in-tabs .wa-subtab[data-wasub="wa_tpl_mappings"]');
      if (m) m.click();
    }, 0);
  };

  // ------------------------------------------------------------
  // Renderers for each outer subtab
  // ------------------------------------------------------------
  function renderGeneral(wrap, settings){
    const s = settings || {};
    wrap.innerHTML = [
      '<div class="card" style="padding:14px">',
      '  <h2 style="margin:0 0 12px">General Settings</h2>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">',
      `    <label>Public Base URL<br><input id="gen_base" style="width:100%" placeholder="https://events.example.com" value="${esc(s.PUBLIC_BASE_URL||'')}"></label>`,
      `    <label>Site name<br><input id="gen_name" style="width:100%" placeholder="Villiersdorp Skou" value="${esc(s.SITE_NAME||'')}"></label>`,
      `    <label style="grid-column:1/-1">Logo URL<br><input id="gen_logo" style="width:100%" placeholder="https://…" value="${esc(s.SITE_LOGO_URL||'')}"></label>`,
      `    <label style="grid-column:1/-1">VERIFY_TOKEN (Webhook verify)<br><input id="gen_verify" style="width:100%" placeholder="vs-verify-2025" value="${esc(s.VERIFY_TOKEN||'')}"></label>`,
      '    <div style="grid-column:1/-1;display:flex;gap:8px">',
      '      <button id="gen_save" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save</button>',
      '      <button id="gen_reload" class="tab" style="font-weight:800">Reload</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    document.getElementById('gen_save').onclick = async ()=>{
      const updates = {
        PUBLIC_BASE_URL: document.getElementById('gen_base').value.trim(),
        SITE_NAME:       document.getElementById('gen_name').value.trim(),
        SITE_LOGO_URL:   document.getElementById('gen_logo').value.trim(),
        VERIFY_TOKEN:    document.getElementById('gen_verify').value.trim(),
      };
      await saveSettings(updates);
      alert('Saved.');
    };
    document.getElementById('gen_reload').onclick = async ()=>{
      const s2 = await loadSettings(true);
      renderGeneral(wrap, s2);
    };
  }

  function renderYoco(wrap, settings){
    const s = settings || {};
    wrap.innerHTML = [
      '<div class="card" style="padding:14px">',
      '  <h2 style="margin:0 0 12px">Yoco</h2>',
      '  <div class="muted" style="margin:0 0 8px">Configure your Yoco keys and OAuth client (if used).</div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">',
      `    <label>Mode<br><select id="yoco_mode" style="width:100%"><option value="test"${(s.YOCO_MODE||'test')==='test'?' selected':''}>test</option><option value="live"${(s.YOCO_MODE||'')==='live'?' selected':''}>live</option></select></label>`,
      `    <label>Public key (TEST)<br><input id="yoco_test_pk" style="width:100%" value="${esc(s.YOCO_TEST_PUBLIC_KEY||'')}"></label>`,
      `    <label>Secret key (TEST)<br><input id="yoco_test_sk" style="width:100%" value="${esc(s.YOCO_TEST_SECRET_KEY||'')}"></label>`,
      `    <label>Public key (LIVE)<br><input id="yoco_live_pk" style="width:100%" value="${esc(s.YOCO_LIVE_PUBLIC_KEY||'')}"></label>`,
      `    <label>Secret key (LIVE)<br><input id="yoco_live_sk" style="width:100%" value="${esc(s.YOCO_LIVE_SECRET_KEY||'')}"></label>`,
      '    <div style="grid-column:1/-1;border-top:1px dashed #e5e7eb;margin-top:6px;padding-top:6px"></div>',
      `    <label>OAuth Client ID<br><input id="yoco_client_id" style="width:100%" value="${esc(s.YOCO_CLIENT_ID||'')}"></label>`,
      `    <label>Redirect URI<br><input id="yoco_redirect" style="width:100%" value="${esc(s.YOCO_REDIRECT_URI||'')}"></label>`,
      `    <label>Required scopes (comma)<br><input id="yoco_scopes" style="width:100%" value="${esc(s.YOCO_REQUIRED_SCOPES||'')}"></label>`,
      `    <label>State (anti-CSRF)<br><input id="yoco_state" style="width:100%" value="${esc(s.YOCO_STATE||'')}"></label>`,
      '    <div style="grid-column:1/-1;display:flex;gap:8px">',
      '      <button id="yoco_save" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save</button>',
      '      <button id="yoco_reload" class="tab" style="font-weight:800">Reload</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    document.getElementById('yoco_save').onclick = async ()=>{
      const updates = {
        YOCO_MODE:              document.getElementById('yoco_mode').value,
        YOCO_TEST_PUBLIC_KEY:   document.getElementById('yoco_test_pk').value.trim(),
        YOCO_TEST_SECRET_KEY:   document.getElementById('yoco_test_sk').value.trim(),
        YOCO_LIVE_PUBLIC_KEY:   document.getElementById('yoco_live_pk').value.trim(),
        YOCO_LIVE_SECRET_KEY:   document.getElementById('yoco_live_sk').value.trim(),
        YOCO_CLIENT_ID:         document.getElementById('yoco_client_id').value.trim(),
        YOCO_REDIRECT_URI:      document.getElementById('yoco_redirect').value.trim(),
        YOCO_REQUIRED_SCOPES:   document.getElementById('yoco_scopes').value.trim(),
        YOCO_STATE:             document.getElementById('yoco_state').value.trim(),
      };
      await saveSettings(updates);
      alert('Saved.');
    };
    document.getElementById('yoco_reload').onclick = async ()=>{
      const s2 = await loadSettings(true);
      renderYoco(wrap, s2);
    };
  }

  function renderVisitors(wrap){
    // Lightweight “recent visitors” scaffold – uses wa_inbox as a proxy so it works out-of-the-box.
    wrap.innerHTML = [
      '<div class="card" style="padding:14px">',
      '  <h2 style="margin:0 0 12px">Past Visitors</h2>',
      '  <div class="muted" style="margin:0 0 10px">Showing the latest WhatsApp inbound contacts (for a quick audit list).</div>',
      '  <table style="width:100%;border-collapse:collapse">',
      '    <thead><tr>',
      '      <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">From</th>',
      '      <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Last message</th>',
      '      <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">When</th>',
      '    </tr></thead>',
      '    <tbody id="pv_tbody"><tr><td style="padding:8px" colspan="3" class="muted">Loading…</td></tr></tbody>',
      '  </table>',
      '</div>'
    ].join('');

    (async ()=>{
      let rows = [];
      try {
        const j = await fetch('/api/admin/whatsapp/inbox?limit=200').then(r=>r.json());
        rows = (j.items||[]).sort((a,b)=>b.received_at - a.received_at);
      } catch(e){}
      const seen = new Set();
      const tb = document.getElementById('pv_tbody');
      tb.innerHTML = '';
      for (const r of rows){
        if (seen.has(r.from_msisdn)) continue;
        seen.add(r.from_msisdn);
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td style="padding:8px;border-bottom:1px solid #f0f2f5">'+esc(r.from_msisdn||'')+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f0f2f5">'+esc(r.body||'')+'</td>'+
          '<td style="padding:8px;border-bottom:1px solid #f0f2f5">'+(r.received_at? new Date(r.received_at*1000).toLocaleString() : '')+'</td>';
        tb.appendChild(tr);
        if (seen.size >= 50) break; // cap
      }
      if (!seen.size){
        tb.innerHTML = '<tr><td style="padding:8px" colspan="3" class="muted">No recent visitors found.</td></tr>';
      }
    })();
  }

  // WhatsApp panel (kept from your version, but uses the cache for faster first paint)
  function renderWhatsApp(wrap){
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

    async function paintSettings(){
      const s = await loadSettings(); // cached — quick
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
            + '<div style="grid-column:1/-1;display:flex;gap:8px">'
              + '<button id="wa_save" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Save</button>'
              + '<button id="wa_reload" class="tab" style="font-weight:800">Reload</button>'
            + '</div>'
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
        await saveSettings(updates);
        alert('Saved.');
      };
      document.getElementById('wa_reload').onclick = async ()=>{
        await loadSettings(true);
        paintSettings();
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
      const [tplRes, mapRes, schemaRes] = await Promise.all([
        fetch("/api/admin/whatsapp/templates").then(r=>r.json()).catch(()=>({})),
        fetch("/api/admin/whatsapp/mappings").then(r=>r.json()).catch(()=>({})),
        fetch("/api/admin/db/schema").then(r=>r.json()).catch(()=>({}))
      ]);
      if (!tplRes.ok){ listEl.innerHTML = '<p class="error">Failed to load templates</p>'; return; }

      const templates = tplRes.templates || [];
      const mappings  = mapRes.ok ? (mapRes.mappings || []) : [];
      const dbSchema  = schemaRes.ok ? (schemaRes.schema || {}) : {};

      const mapByKeyCtx = {};
      for (const m of mappings) mapByKeyCtx[m.template_key + ":" + m.context] = m;

      const idFromKey = k => 'tpl-' + String(k).replace(/[^a-z0-9]+/ig, '-');

      const frag = document.createElement('div');
      const hdr  = document.createElement('div');
      hdr.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">'
        + '<div class="muted">Map templates to DB fields, constants, or computed values.</div>'
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
            + '<tbody></tbody>'
          + '</table>'
          + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
            + '<button class="tab saveBtn" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">💾 Save Mapping</button>'
            + '<button class="tab jumpBack" style="font-weight:800">Back to Templates</button>'
          + '</div>';

        frag.appendChild(card);

        const tb = card.querySelector('tbody');

        function buildFieldSelect(initial){
          const sel = document.createElement('select');
          sel.className = 'valueField';
          for (const [table, cols] of Object.entries(dbSchema)){
            const og = document.createElement('optgroup');
            og.label = table;
            (cols||[]).forEach(c=>{
              const o = document.createElement('option');
              o.value = table + '.' + c;
              o.text  = table + '.' + c;
              og.appendChild(o);
            });
            sel.appendChild(og);
          }
          if (initial) sel.value = initial;
          return sel;
        }

        for (const v of vars){
          const ev = (mapObj.vars||[]).find(x=>String(x.variable)===String(v)) || {};
          const tr = document.createElement('tr');

          const srcSel = el(
            '<select class="source">'
            + '<option value="field"  '+(ev.source==='field'?'selected':'')+'>field</option>'
            + '<option value="static" '+(ev.source==='static'?'selected':'')+'>static</option>'
            + '<option value="compute" '+(ev.source==='compute'?'selected':'')+'>compute</option>'
            + '</select>'
          );

          const valueTd = document.createElement('td');
          const fieldSel = buildFieldSelect(ev.source==='field' ? ev.value : '');
          const textInp  = el('<input class="valueText" placeholder="Value (literal) or expression">');
          if (ev.source!=='field') textInp.value = ev.value || '';

          const fallbackInp = el('<input class="fallback" placeholder="Fallback (optional)" value="'+esc(ev.fallback||'')+'">');

          const srcTd = document.createElement('td'); srcTd.appendChild(srcSel);
          const varTd = document.createElement('td'); varTd.textContent = '{{'+v+'}}';

          function sync(){
            if (srcSel.value === 'field'){
              fieldSel.style.display = '';
              textInp.style.display  = 'none';
              if (!fieldSel.value) {
                const firstOpt = fieldSel.querySelector('option');
                if (firstOpt) fieldSel.value = firstOpt.value;
              }
            } else {
              fieldSel.style.display = 'none';
              textInp.style.display  = '';
            }
          }
          sync();
          srcSel.onchange = sync;

          valueTd.appendChild(fieldSel);
          valueTd.appendChild(textInp);

          tr.appendChild(varTd);
          tr.appendChild(srcTd);
          tr.appendChild(valueTd);
          tr.appendChild(fallbackInp);

          tb.appendChild(tr);
        }

        card.querySelector('.saveBtn').onclick = async ()=>{
          const context = card.querySelector('.ctx').value.trim();
          if (!context) return alert('Please select context first');
          const rows = [...card.querySelectorAll('tbody tr')];
          const mapping = {
            vars: rows.map(r => {
              const variable = r.children[0].innerText.replace(/[{}]/g,'');
              const src = r.querySelector('.source').value;
              const val = src === 'field'
                ? r.querySelector('.valueField').value
                : r.querySelector('.valueText').value.trim();
              const fb  = r.querySelector('.fallback').value.trim();
              return { variable, source: src, value: val, fallback: fb };
            })
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
        await api('/api/admin/whatsapp/inbox/0/reply', {
          method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text, to })
        }).catch(async ()=>{
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

    function switchInner(name){
      document.querySelectorAll('#wa-in-tabs .wa-subtab').forEach(x=>x.classList.toggle('active', x.dataset.wasub===name));
      if (name==='wa_settings')       paintSettings();
      else if (name==='wa_templates') paintTemplates();
      else if (name==='wa_inbox')     paintInbox();
      else if (name==='wa_tpl_mappings') paintMappings();
      else if (name==='wa_send')      paintSend();
    }

    document.querySelectorAll('#wa-in-tabs .wa-subtab').forEach(t=>{
      t.onclick = ()=> switchInner(t.dataset.wasub);
    });

    switchInner('wa_settings');
  }

  // ------------------------------------------------------------
  // Settings panel (outer) + tabs wiring
  // ------------------------------------------------------------
  window.AdminPanels.settings = async function(){
    const host = document.getElementById("panel-settings");
    host.innerHTML = "";

    const subtabs = el(
      '<div class="tabs" id="wa-subtabs" style="margin-bottom:10px">'
      + '<div class="tab active" data-wa="general">General</div>'
      + '<div class="tab" data-wa="whatsapp">WhatsApp</div>'
      + '<div class="tab" data-wa="yoco">Yoco</div>'
      + '<div class="tab" data-wa="visitors">Past Visitors</div>'
      + '</div>'
    );

    const wrap = el('<div id="wa-wrap"></div>');
    host.appendChild(subtabs);
    host.appendChild(wrap);

    async function switchOuter(sec){
      host.querySelectorAll('#wa-subtabs .tab').forEach(x=>x.classList.toggle('active', x.dataset.wa===sec));
      if (sec === 'general')  { const s = await loadSettings(); renderGeneral(wrap, s); }
      if (sec === 'whatsapp') { renderWhatsApp(wrap); }
      if (sec === 'yoco')     { const s = await loadSettings(); renderYoco(wrap, s); }
      if (sec === 'visitors') { renderVisitors(wrap); }
    }

    // Wire outer tabs
    host.querySelectorAll('#wa-subtabs .tab').forEach(t=>{
      t.onclick = ()=> switchOuter(t.dataset.wa);
    });

    // Open correct tab (support #settings:whatsapp deep-link)
    const hash = (location.hash||'');
    if (hash.startsWith('#settings:whatsapp')) switchOuter('whatsapp');
    else switchOuter('general');
  };
})();
`;
