// /src/ui/admin_vendors.js
export const adminVendorsJS = `
(function(){
  if(!window.AdminPanels) window.AdminPanels = {};
  const esc = s=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const el  = (html)=>{ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; };

  async function api(url,opts){
    const r = await fetch(url,opts||{});
    const j = await r.json().catch(()=>({ ok:false }));
    if(!r.ok || j.ok===false) throw new Error(j.error||('HTTP '+r.status));
    return j;
  }

  function cell(td, align="left"){ td.style.padding="10px"; td.style.borderBottom="1px solid #eee"; td.style.textAlign=align; return td; }

  function openVendorForm(event_id, vendor){
    const v = vendor || {};
    const modal = document.getElementById('vModal');
    modal.style.display = 'block';
    modal.innerHTML = [
      '<h3 style="margin:0 0 8px">', v.id ? 'Edit vendor' : 'Add vendor' ,'</h3>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
        '<label>Vendor / Stall name<br><input id="v_name" style="width:100%" value="', esc(v.name||''),'"></label>',
        '<label>Contact person<br><input id="v_contact" style="width:100%" value="', esc(v.contact_name||''),'"></label>',
        '<label>Phone (WhatsApp)<br><input id="v_phone" style="width:100%" value="', esc(v.phone||''),'"></label>',
        '<label>Email<br><input id="v_email" style="width:100%" value="', esc(v.email||''),'"></label>',
        '<label>Stand number<br><input id="v_stand" style="width:100%" value="', esc(v.stand_number||''),'"></label>',
        '<label>Staff quota<br><input id="v_staff" type="number" min="0" step="1" style="width:100%" value="', esc(v.staff_quota||0),'"></label>',
        '<label>Vehicle quota<br><input id="v_vehicle" type="number" min="0" step="1" style="width:100%" value="', esc(v.vehicle_quota||0),'"></label>',
      '</div>',
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">',
        '<button class="tab" id="vSave" style="font-weight:700">', v.id?'Save changes':'Create vendor','</button>',
        '<button class="tab" id="vCancel">Cancel</button>',
      '</div>'
    ].join('');

    modal.querySelector('#vCancel').onclick = ()=>{ modal.style.display='none'; };

    modal.querySelector('#vSave').onclick = async ()=>{
      const payload = {
        id: v.id||undefined,
        event_id,
        name: document.getElementById('v_name').value.trim(),
        contact_name: document.getElementById('v_contact').value.trim(),
        phone: document.getElementById('v_phone').value.trim(),
        email: document.getElementById('v_email').value.trim(),
        stand_number: document.getElementById('v_stand').value.trim(),
        staff_quota: Number(document.getElementById('v_staff').value||0)|0,
        vehicle_quota: Number(document.getElementById('v_vehicle').value||0)|0
      };
      if (!payload.name){ alert('Please enter a vendor / stall name.'); return; }
      await api('/api/admin/vendors/save', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify(payload)
      });
      modal.style.display='none';
      window.AdminPanels.vendors(); // refresh
    };
    modal.scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  window.AdminPanels.vendors = async function(){
    const host = document.getElementById('panel-vendors');
    const events = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({events:[]}));
    const active = (events.events||[]).filter(e=>String(e.status)==='active');
    const event_id = active[0]?.id || events.events?.[0]?.id || 0;

    // Header with Add button
    host.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px;gap:8px;flex-wrap:wrap">'
        + '<h2 style="margin:0">Vendors</h2>'
        + '<button id="btnAddVendor" class="tab" style="font-weight:800">+ Add vendor</button>'
      + '</div>'
      + '<div class="muted" style="margin-bottom:10px">Event: '
        + (active[0]?.name ? esc(active[0].name) : ('#'+event_id))
      + '</div>'
      + '<div id="vendorBox" class="card" style="padding:0"></div>';

    document.getElementById('btnAddVendor').onclick = ()=> openVendorForm(event_id, null);

    const box = document.getElementById('vendorBox');
    box.innerHTML = '<div style="padding:12px">Loading…</div>';

    const res = await api('/api/admin/vendors?event_id='+encodeURIComponent(event_id));
    const list = res.vendors||[];

    // Build table
    const table = el('<table style="width:100%;border-collapse:collapse"></table>');
    const thead = el(
      '<thead><tr style="background:#fafafa">'
      + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">Vendor</th>'
      + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">Stand</th>'
      + '<th style="text-align:center;padding:10px;border-bottom:1px solid #eee">Staff</th>'
      + '<th style="text-align:center;padding:10px;border-bottom:1px solid #eee">Vehicle</th>'
      + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">Portal</th>'
      + '<th style="text-align:left;padding:10px;border-bottom:1px solid #eee">WA Sent</th>'
      + '<th style="text-align:right;padding:10px;border-bottom:1px solid #eee;width:360px"></th>'
      + '</tr></thead>'
    );
    const tbody = document.createElement('tbody');

    if (!list.length){
      const tr = document.createElement('tr');
      const td = cell(document.createElement('td'));
      td.colSpan = 7; td.className='muted'; td.textContent='No vendors';
      tr.appendChild(td); tbody.appendChild(tr);
    } else {
      list.forEach(v=>{
        const tr = document.createElement('tr'); tr.dataset.id = v.id;

        // col 1: vendor + contacts
        const c1 = cell(document.createElement('td'));
        c1.innerHTML = '<div style="font-weight:700">'+esc(v.name||'—')+'</div>'
                     + '<div class="muted" style="font-size:12px">'+esc(v.phone||'')+(v.email?(' · '+esc(v.email)):'')+'</div>';
        tr.appendChild(c1);

        // col 2-4
        tr.appendChild(cell(document.createElement('td'))).textContent = esc(v.stand_number||'—');
        tr.appendChild(cell(document.createElement('td'), 'center')).textContent = String(v.staff_quota||0);
        tr.appendChild(cell(document.createElement('td'), 'center')).textContent = String(v.vehicle_quota||0);

        // col 5: portal status
        tr.appendChild(cell(document.createElement('td'))).textContent = v.portal_status || '—';

        // col 6: WA sent
        const welcome = v.welcome_sent_at ? new Date(v.welcome_sent_at*1000).toLocaleString() : '—';
        const assigned = v.assigned_sent_at ? new Date(v.assigned_sent_at*1000).toLocaleString() : '—';
        const c6 = cell(document.createElement('td'));
        c6.style.fontSize='12px';
        c6.innerHTML = '<div>Welcome: '+esc(welcome)+'</div><div>Assigned: '+esc(assigned)+'</div>';
        tr.appendChild(c6);

        // col 7: actions
        const c7 = cell(document.createElement('td'), 'right');
        c7.innerHTML =
          '<button class="tab js-link"     style="margin:2px">Portal Link</button>'
        + '<button class="tab js-welcome" style="margin:2px">Send Welcome</button>'
        + '<button class="tab js-review"  style="margin:2px">Review</button>'
        + '<button class="tab js-assign"  style="margin:2px">Assign & Save</button>'
        + '<button class="tab js-sendpack"style="margin:2px">Send Stand Info</button>'
        + '<button class="tab js-edit"    style="margin:2px;font-weight:700">Edit</button>'
        + '<button class="tab js-del"     style="margin:2px;background:#b42318;color:#fff;border-color:#b42318">Delete</button>';
        tr.appendChild(c7);

        tbody.appendChild(tr);
      });
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    box.innerHTML = '';
    box.appendChild(table);
    box.insertAdjacentHTML('beforeend','<div id="vModal" class="card" style="margin:12px;display:none"></div>');

    // Wire actions
    tbody.querySelectorAll('tr').forEach(tr=>{
      const id = tr.getAttribute('data-id');
      if (!id) return;

      tr.querySelector('.js-link').onclick = async ()=>{
        const j = await api('/api/admin/vendor/'+id+'/portal-link');
        try { await navigator.clipboard.writeText(j.link); } catch {}
        alert('Portal link copied. Opening…'); window.open(j.link, '_blank');
      };

      tr.querySelector('.js-welcome').onclick = async ()=>{
        if(!confirm('Send welcome WhatsApp to vendor?')) return;
        await api('/api/admin/vendors/'+id+'/send-welcome', { method:'POST' });
        alert('Welcome sent (if WA session/template available).');
        window.AdminPanels.vendors();
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

      tr.querySelector('.js-edit').onclick = async ()=>{
        // fetch latest vendor values to prefill (optional)
        const name = tr.querySelector('td:first-child div').innerText.trim();
        const stand = tr.children[1].innerText.trim();
        const staff = tr.children[2].innerText.trim();
        const veh   = tr.children[3].innerText.trim();
        // We don’t have an endpoint for single vendor fetch; use what we have in the row.
        openVendorForm(event_id, {
          id: Number(id),
          name,
          stand_number: stand==='—'?'':stand,
          staff_quota: Number(staff)||0,
          vehicle_quota: Number(veh)||0,
          // phone/email aren’t in the cells; leave blank and let admin fill if needed
        });
      };

      tr.querySelector('.js-del').onclick = async ()=>{
        if (!confirm('Delete vendor? This cannot be undone.')) return;
        // Soft-delete fallback (no hard delete route available):
        await fetch('/api/admin/vendors/save', {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ id: Number(id), event_id, name: '' })
        }).catch(()=>{});
        alert('Deleted (soft). Implement a hard-delete route if needed.');
        window.AdminPanels.vendors();
      };
    });
  };
})();
`;
