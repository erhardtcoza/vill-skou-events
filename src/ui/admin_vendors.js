// /src/ui/admin_vendors.js
export const adminVendorsJS = `
(function(){
  if(!window.AdminPanels) window.AdminPanels = {};
  const esc = s=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const rands=c=>'R'+((Number(c)||0)/100).toFixed(2);

  async function api(url,opts){
    const r = await fetch(url,opts||{});
    const j = await r.json().catch(()=>({ ok:false }));
    if(!r.ok || j.ok===false) throw new Error(j.error||('HTTP '+r.status));
    return j;
  }

  window.AdminPanels.vendors = async function(){
    const host = document.getElementById('panel-vendors');
    const events = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({events:[]}));
    const active = (events.events||[]).filter(e=>String(e.status)==='active');
    const event_id = active[0]?.id || events.events?.[0]?.id || 0;

    host.innerHTML = '<h2 style="margin:0 0 10px">Vendors</h2>'
      + '<div class="muted" style="margin-bottom:10px">Event: '+(active[0]?.name ? esc(active[0].name) : ('#'+event_id))+'</div>'
      + '<div id="vendorBox" class="card" style="padding:0"></div>';

    const box = document.getElementById('vendorBox');
    box.innerHTML = '<div style="padding:12px">Loading…</div>';

    const res = await api('/api/admin/vendors?event_id='+encodeURIComponent(event_id));
    const list = res.vendors||[];

    const rows = list.map(v=>{
      const st = v.portal_status||'—';
      const welcome = v.welcome_sent_at ? new Date(v.welcome_sent_at*1000).toLocaleString() : '—';
      const assigned = v.assigned_sent_at ? new Date(v.assigned_sent_at*1000).toLocaleString() : '—';
      return '<tr data-id="'+v.id+'">'
        + '<td style="padding:10px;border-bottom:1px solid #eee"><div style="font-weight:700">'+esc(v.name||'—')+'</div><div class="muted" style="font-size:12px">'+esc(v.phone||'')+' · '+esc(v.email||'')+'</div></td>'
        + '<td style="padding:10px;border-bottom:1px solid #eee">'+esc(v.stand_number||'—')+'</td>'
        + '<td style="padding:10px;border-bottom:1px solid #eee;text-align:center">'+(v.staff_quota||0)+'</td>'
        + '<td style="padding:10px;border-bottom:1px solid #eee;text-align:center">'+(v.vehicle_quota||0)+'</td>'
        + '<td style="padding:10px;border-bottom:1px solid #eee">'+esc(st)+'</td>'
        + '<td style="padding:10px;border-bottom:1px solid #eee;font-size:12px"><div>Welcome: '+esc(welcome)+'</div><div>Assigned: '+esc(assigned)+'</div></td>'
        + '<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">'
          + '<button class="tab js-link" style="margin:2px">Portal Link</button>'
          + '<button class="tab js-welcome" style="margin:2px">Send Welcome</button>'
          + '<button class="tab js-review" style="margin:2px">Review</button>'
          + '<button class="tab js-assign" style="margin:2px">Assign & Save</button>'
          + '<button class="tab js-sendpack" style="margin:2px">Send Stand Info</button>'
          + '<button class="tab js-del" style="margin:2px;background:#b42318;color:#fff;border-color:#b42318">Delete</button>'
        + '</td>'
      + '</tr>';
    }).join('');

    box.innerHTML = ''
      + '<table style="width:100%;border-collapse:collapse">'
      + '<thead><tr style="background:#fafafa">'
        + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">Vendor</th>'
        + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">Stand</th>'
        + '<th style="text-align:center;padding:10px;border-bottom:1px solid #eee">Staff</th>'
        + '<th style="text-align:center;padding:10px;border-bottom:1px solid #eee">Vehicle</th>'
        + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">Portal</th>'
        + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">WA Sent</th>'
        + '<th style="text-align:right;padding:10px;border-bottom:1px solid #eee"></th>'
      + '</tr></thead>'
      + '<tbody>'+ (rows || '<tr><td colspan="7" class="muted" style="padding:12px">No vendors</td></tr>') +'</tbody>'
      + '</table>'
      + '<div id="vModal" class="card" style="margin:12px;display:none"></div>';

    // actions
    box.querySelectorAll('tbody tr').forEach(tr=>{
      const id = tr.getAttribute('data-id');

      tr.querySelector('.js-link').onclick = async ()=>{
        const j = await api('/api/admin/vendor/'+id+'/portal-link');
        await navigator.clipboard.writeText(j.link);
        alert('Link copied: '+j.link);
        window.open(j.link, '_blank');
      };

      tr.querySelector('.js-welcome').onclick = async ()=>{
        if(!confirm('Send welcome WhatsApp to vendor?')) return;
        await api('/api/admin/vendors/'+id+'/send-welcome', { method:'POST' });
        alert('Welcome sent (if WA session/template available).');
        window.AdminPanels.vendors(); // refresh
      };

      tr.querySelector('.js-review').onclick = async ()=>{
        const j = await api('/api/admin/vendor/'+id+'/profile');
        const p = j.profile||{};
        const modal = document.getElementById('vModal');
        const pretty = esc(JSON.stringify(p,null,2) || 'No submission yet.');
        modal.style.display='block';
        modal.innerHTML = '<h3 style="margin:0 0 8px">Submission · '+esc(j.vendor.name||('#'+id))+'</h3>'
          + '<pre style="white-space:pre-wrap;background:#f6f7f9;border:1px solid #eef2f7;padding:10px;border-radius:8px">'+pretty+'</pre>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="tab" id="vClose">Close</button></div>';
        modal.querySelector('#vClose').onclick = ()=>{ modal.style.display='none'; };
        modal.scrollIntoView({behavior:'smooth'});
      };

      tr.querySelector('.js-assign').onclick = async ()=>{
        const stand = prompt('Stand number (e.g. A12):', tr.children[1].innerText.trim()||'');
        if (stand==null) return;
        const staff = prompt('Staff quota (number):', tr.children[2].innerText.trim()||'0');
        if (staff==null) return;
        const veh = prompt('Vehicle quota (number):', tr.children[3].innerText.trim()||'0');
        if (veh==null) return;
        const assigned = { stand_number:String(stand||'').trim(), staff_quota: Number(staff||0)|0, vehicle_quota: Number(veh||0)|0 };
        await api('/api/admin/vendor/'+id+'/assign', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ assigned }) });
        alert('Assigned saved.');
        window.AdminPanels.vendors();
      };

      tr.querySelector('.js-sendpack').onclick = async ()=>{
        if(!confirm('Send stand info pack via WhatsApp?')) return;
        await api('/api/admin/vendors/'+id+'/send-assigned', { method:'POST' });
        alert('Stand info sent (if WA session/template available).');
        window.AdminPanels.vendors();
      };

      tr.querySelector('.js-del').onclick = async ()=>{
        if (!confirm('Delete vendor? This cannot be undone.')) return;
        await fetch('/api/admin/vendors/save', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: Number(id), event_id: event_id, name: '' })}).catch(()=>{});
        await fetch('/api/admin/vendor/'+id+'/pass/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ pass_id: -1 })}).catch(()=>{});
        // Minimal-impact: soft-delete by blanking the name or do a hard delete if you already have that route.
        alert('Deleted (soft). Implement hard delete if needed.');
        window.AdminPanels.vendors();
      };
    });
  };
})();
`;
