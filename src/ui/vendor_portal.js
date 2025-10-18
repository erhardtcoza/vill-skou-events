// /src/ui/vendor_portal.js
export const vendorPortalJS = `
export function renderVendorPortal(el, token){
  const esc = s=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  el.innerHTML = '<h2 style="margin:0 0 10px">Vendor Profile</h2>'
  + '<div class="muted" style="margin-bottom:10px">Vul asseblief jou besonderhede in en druk Submit.</div>'
  + '<form id="vForm" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<label>Stall name<br><input name="stall_name" required></label>'
    + '<label>Contact person<br><input name="contact_person" required></label>'
    + '<label>Telephone<br><input name="telephone"></label>'
    + '<label>Category (bv. kos, speelgoed, ens.)<br><input name="category"></label>'
    + '<label style="grid-column:1/-1">Stall description<br><textarea name="desc" rows="3"></textarea></label>'
    + '<label>Facebook page<br><input name="facebook"></label>'
    + '<label>Website<br><input name="website"></label>'
    + '<label>Electronic site required?<br><select name="elec"><option value="no">No</option><option value="yes">Yes</option></select></label>'
    + '<label>Stand size<br><select name="stand_size"><option>Small</option><option>Medium</option><option>Large</option><option>Extra Large</option><option>Other</option></select></label>'
    + '<label style="grid-column:1/-1">If "Other", describe<br><input name="stand_other"></label>'
    + '<label>Vehicle needed?<br><select name="veh"><option value="no">No</option><option value="yes">Yes</option></select></label>'
    + '<label>Vehicle registration<br><input name="veh_reg" placeholder="if applicable"></label>'
    + '<label>Number of employees<br><input name="emp_count" type="number" min="0" value="0"></label>'
    + '<div style="grid-column:1/-1" id="empBox"></div>'
    + '<div style="grid-column:1/-1;display:flex;gap:8px"><button class="tab" type="submit" style="background:#0a7d2b;color:#fff;border-color:#0a7d2b;font-weight:800">Submit</button></div>'
  + '</form>'
  + '<div id="vMsg" class="muted" style="margin-top:8px"></div>';

  const f = el.querySelector('#vForm');
  const empBox = el.querySelector('#empBox');
  function renderEmp(n){
    const cnt = Math.max(0, Number(n)||0);
    empBox.innerHTML = '<h3 style="margin:6px 0">Employees</h3>' + Array.from({length:cnt}).map((_,i)=>
      '<div class="card" style="padding:12px;margin:6px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '<label>Name<br><input name="emp_name_'+i+'" required></label>'
      + '<label>Mobile<br><input name="emp_mobile_'+i+'"></label>'
      + '</div>'
    ).join('');
  }
  f.emp_count.oninput = (e)=>renderEmp(e.target.value);
  renderEmp(f.emp_count.value);

  f.onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(f);
    const n = Number(fd.get('emp_count')||0);
    const employees = [];
    for (let i=0;i<n;i++){
      employees.push({ name: fd.get('emp_name_'+i)||'', mobile: fd.get('emp_mobile_'+i)||'' });
    }
    const payload = {
      stall_name: fd.get('stall_name')||'',
      contact_person: fd.get('contact_person')||'',
      telephone: fd.get('telephone')||'',
      category: fd.get('category')||'',
      description: fd.get('desc')||'',
      facebook: fd.get('facebook')||'',
      website: fd.get('website')||'',
      electronic_site: fd.get('elec')==='yes',
      stand_size: fd.get('stand_size')||'',
      stand_other: fd.get('stand_other')||'',
      vehicle: fd.get('veh')==='yes',
      vehicle_reg: fd.get('veh_reg')||'',
      employees
    };
    const r = await fetch('/api/vendor/'+encodeURIComponent(token)+'/submit', {
      method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
    }).then(r=>r.json()).catch(()=>({ok:false}));
    document.getElementById('vMsg').textContent = r.ok ? 'Dankie! Ons sal gou terugkom met jou stalletjie-inligting.' : 'Kon nie stoor nie.';
    if (r.ok) { f.reset(); renderEmp(0); }
  };
}
`;
