// /src/ui/vendor_pack.js
export const vendorPackJS = `
export function renderVendorPack(el, token){
  el.innerHTML = '<h2 style="margin:0 0 10px">Vendor Pack</h2><div id="vp"></div>';
  const wrap = el.querySelector('#vp');

  fetch('/api/vendor/'+encodeURIComponent(token)).then(r=>r.json()).then(j=>{
    if(!j.ok){ wrap.innerHTML = '<div class="muted">Not found.</div>'; return; }
    const a = j.assigned || {};
    const p = j.profile || {};
    wrap.innerHTML =
      '<div style="margin:8px 0"><strong>Stand:</strong> '+(a.stand_number||'TBA')+'</div>'
      + '<div style="margin:8px 0"><strong>Staff quota:</strong> '+(a.staff_quota||0)+'</div>'
      + '<div style="margin:8px 0"><strong>Vehicle quota:</strong> '+(a.vehicle_quota||0)+'</div>'
      + (p.employees && p.employees.length
          ? '<h3>Employees</h3><ul>'+p.employees.map(e=>'<li>'+ (e.name||'') + (e.mobile?(' — '+e.mobile):'') +'</li>').join('') +'</ul>'
          : '')
      + '<div class="muted" style="margin-top:12px">Bring asseblief hierdie bladsy saam (of wys dit op jou foon) wanneer jy arriveer.</div>';
  }).catch(()=>{ wrap.innerHTML = '<div class="muted">Error.</div>'; });
}
`;
