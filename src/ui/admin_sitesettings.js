// /src/ui/admin_sitesettings.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminSiteSettingsJS = `
(function(){
  if (!window.AdminPanels) window.AdminPanels = {};
  const esc = (s)=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const rands=(c)=>"R"+((Number(c)||0)/100).toFixed(2);

  async function api(url, opts){
    const r = await fetch(url, opts);
    const j = await r.json().catch(()=>({ ok:false, error:"bad json" }));
    if (!r.ok || j.ok===false) throw new Error(j.error || ("HTTP "+r.status));
    return j;
  }
  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }

  // ----------------------------------------------------------
  // WhatsApp settings / templates / mappings UI
  // ----------------------------------------------------------
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
    const waWrap = el('<div id="wa-wrap"></div>');
    host.appendChild(subtabs);
    host.appendChild(waWrap);

    function waSection(){
      waWrap.innerHTML =
        '<div class="card">'
        + '<h2>WhatsApp · Template Mappings</h2>'
        + '<div id="wa-tplmap"></div>'
        + '</div>';
      renderTemplateMappings();
    }

    // --------- Dynamic DB Schema fetcher (for mapping dropdowns) ----------
    async function getDbSchema(){
      try{
        const res = await fetch('/api/admin/db/schema').then(r=>r.json());
        return res.ok ? res.schema : {};
      }catch{ return {}; }
    }

    // --------- Template Mappings UI ----------
    async function renderTemplateMappings(){
      const box = document.getElementById('wa-tplmap');
      box.innerHTML = '<div class="muted">Loading template mappings...</div>';

      const schema = await getDbSchema();
      const mappings = (await api('/api/admin/whatsapp/mappings')).mappings || [];
      const templates = (await api('/api/admin/whatsapp/templates')).templates || [];

      const presetContexts = ["Order","Ticket","Visitor","Wallet","Bar","Reminder","Generic"];

      // helper to build DB dropdown
      function buildFieldSelect(id, selected){
        let html = '<select id="'+id+'" style="width:160px">';
        html += '<option value="">Select field...</option>';
        for (const [table, fields] of Object.entries(schema)){
          html += '<optgroup label="'+table+'">';
          for (const f of fields) html += '<option value="'+table+'.'+f+'" '+(selected===table+'.'+f?'selected':'')+'>'+f+'</option>';
          html += '</optgroup>';
        }
        html += '</select>';
        return html;
      }

      let out = "";
      for (const t of templates){
        const key = t.name+':'+t.language;
        const map = mappings.find(m=>m.template_key===key);
        const mapping = map ? JSON.parse(map.mapping_json||'{}') : {};
        const vars = (JSON.parse(t.components_json||'[]').find(c=>c.type==='BODY')?.text.match(/\\{\\{\\d+\\}\\}/g)||[])
                      .map(v=>v.replace(/[{}]/g,'')); // ['1','2','3']

        const ctxVal = map ? map.context : "";
        const fieldMap = mapping.vars || [];

        out += '<div class="card" style="margin-bottom:20px;padding:12px">'
          + '<h3>'+esc(t.name)+' ('+esc(t.language)+')</h3>'
          + '<label>Context:<br>'
          + '<input id="ctx_'+esc(key)+'" list="ctxlist_'+esc(key)+'" placeholder="e.g. Order / Visitor" '
          + 'value="'+esc(ctxVal||'')+'" style="width:200px">'
          + '<datalist id="ctxlist_'+esc(key)+'">'
          + presetContexts.map(c=>'<option value="'+c+'">').join('')
          + '</datalist></label>'
          + '<pre style="white-space:pre-wrap;background:#f8f9fa;padding:8px;border-radius:4px">'+esc(
              JSON.parse(t.components_json||'[]').find(c=>c.type==='BODY')?.text||''
            )+'</pre>'
          + '<table style="width:100%;border-collapse:collapse;margin-top:6px">'
          + '<thead><tr><th style="text-align:left;padding:4px">Variable</th>'
          + '<th>Source</th><th>Value / Field</th><th>Fallback</th></tr></thead>'
          + '<tbody>';

        for (const v of vars){
          const row = fieldMap.find(x=>x.var===v) || {};
          out += '<tr>'
            + '<td style="padding:4px">{{'+v+'}}</td>'
            + '<td><select id="src_'+key+'_'+v+'" style="width:100px">'
                + '<option value="field" '+(row.source==='field'?'selected':'')+'>field</option>'
                + '<option value="static" '+(row.source==='static'?'selected':'')+'>static</option>'
                + '<option value="compute" '+(row.source==='compute'?'selected':'')+'>compute</option>'
              + '</select></td>'
            + '<td id="val_'+key+'_'+v+'">';
              if (row.source==='field') out += buildFieldSelect('fld_'+key+'_'+v, row.value||"");
              else out += '<input id="fld_'+key+'_'+v+'" value="'+esc(row.value||'')+'" style="width:160px">';
          out += '</td>'
            + '<td><input id="fb_'+key+'_'+v+'" value="'+esc(row.fallback||'')+'" style="width:120px"></td>'
            + '</tr>';
        }
        out += '</tbody></table>'
          + '<button class="tab" id="save_'+esc(key)+'" style="margin-top:8px;background:#0a7d2b;color:#fff;font-weight:600">💾 Save Mapping</button>'
          + '</div>';
      }
      box.innerHTML = out;

      // attach event handlers
      templates.forEach(t=>{
        const key = t.name+':'+t.language;
        const vars = (JSON.parse(t.components_json||'[]').find(c=>c.type==='BODY')?.text.match(/\\{\\{\\d+\\}\\}/g)||[])
                      .map(v=>v.replace(/[{}]/g,''));
        const btn = document.getElementById('save_'+key);
        if (!btn) return;
        btn.onclick = async ()=>{
          const context = document.getElementById('ctx_'+key).value.trim() || '';
          const arr = [];
          for (const v of vars){
            const src = document.getElementById('src_'+key+'_'+v).value;
            const val = document.getElementById('fld_'+key+'_'+v).value;
            const fb  = document.getElementById('fb_'+key+'_'+v).value;
            arr.push({ var:v, source:src, value:val, fallback:fb });
          }
          await api('/api/admin/whatsapp/mappings/save', {
            method:'POST',
            headers:{'content-type':'application/json'},
            body: JSON.stringify({ template_key:key, context, mapping:{ vars:arr } })
          });
          alert('Mapping saved for '+key);
        };
      });
    }

    // Tab switching logic
    host.querySelectorAll('#wa-subtabs .tab').forEach(t=>{
      t.onclick = ()=>{
        host.querySelectorAll('#wa-subtabs .tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        const sec = t.dataset.wa;
        if (sec === 'whatsapp') waSection();
        else {
          document.getElementById('panel-settings').innerHTML = '<div class="card">Open the WhatsApp tab to configure WhatsApp.</div>';
          document.getElementById('panel-settings').prepend(subtabs);
          document.getElementById('panel-settings').appendChild(waWrap);
        }
      };
    });

    host.querySelector('[data-wa="whatsapp"]').click();
  };
})();
`;
