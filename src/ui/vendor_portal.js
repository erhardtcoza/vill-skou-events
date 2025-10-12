// /src/ui/vendor_portal.js
// Simple vendor portal (self-service) where a vendor completes details and requests employee passes.
// Route expectation: /vendor-portal/:token -> vendorPortalHTML(token)

export function vendorPortalHTML(token){
  const safeToken = String(token || "").replace(/[^a-zA-Z0-9._-]/g, "");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Vendor Portal</title>
  <style>
    :root{ --border:#e5e7eb; --muted:#6b7280; --text:#111827; --bg:#fff; --accent:#E10600; }
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#f8fafc;color:var(--text)}
    .wrap{max-width:840px;margin:0 auto;padding:16px}
    .card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px}
    h1{margin:0 0 8px}
    label{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}
    input,select,textarea{width:100%;border:1px solid var(--border);border-radius:10px;padding:10px;font-size:14px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media (max-width:720px){ .row{grid-template-columns:1fr} }
    .btn{background:#111;color:#fff;border:0;border-radius:10px;padding:12px 16px;cursor:pointer}
    .btn.accent{background:var(--accent)}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid var(--border);padding:8px;text-align:left}
    .muted{color:var(--muted)}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card" id="hdr">Loading…</div>

  <div class="card">
    <h2>Vendor Details</h2>
    <div class="row">
      <div><label>Vendor name</label><input id="vendor_name"></div>
      <div>
        <label>Stall type</label>
        <select id="stall_type">
          <option value="">— Select —</option>
          <option>Food</option><option>Clothing</option><option>Toys</option>
          <option>Jewellery</option><option>Machinery</option><option>Cars</option>
          <option>Other</option>
        </select>
      </div>
      <div><label>Electricity requirements</label><input id="electricity_req" placeholder="e.g. 1 x 16A, 220V"></div>
      <div><label>Website</label><input id="website" placeholder="https://…"></div>
      <div><label>Facebook page</label><input id="facebook" placeholder="https://facebook.com/…"></div>
      <div><label>Email</label><input id="email" type="email"></div>
      <div><label>Tel no</label><input id="tel" type="tel"></div>
    </div>
    <label>Vendor description</label>
    <textarea id="vendor_desc" rows="4" placeholder="Short description for programme / website"></textarea>
  </div>

  <div class="card">
    <h2>Staff Passes</h2>
    <div class="muted">Add a row per employee and select the day(s). You can add more later.</div>
    <table id="pass_tbl">
      <thead><tr><th>Employee name</th><th>Phone (optional)</th><th>Day</th><th>Remove</th></tr></thead>
      <tbody></tbody>
    </table>
    <button class="btn" id="add_row">Add employee</button>
  </div>

  <div class="card">
    <button class="btn accent" id="submit_btn">Submit / Update</button>
    <span id="msg" class="muted" style="margin-left:10px"></span>
  </div>
</div>

<script type="module">
  const token = ${JSON.stringify(safeToken)};
  const $ = (s, r=document)=>r.querySelector(s);

  function daySelectHTML(days){
    const opts = (days||[]).map(d=>\`<option>\${d}</option>\`).join('');
    return \`<select class="day"><option value="">— Select —</option>\${opts}</select>\`;
  }

  async function fetchPortal(){
    // GET /api/vendor/portal/:token -> { ok, event:{name,dates,logo_url,day_labels[]}, vendor:{...existing...}, employees:[{name,phone,day_label}] }
    const r = await fetch('/api/vendor/portal/'+encodeURIComponent(token));
    if (!r.ok) throw new Error('load fail');
    return r.json();
  }

  function fillForm(vendor, employees, days, ev){
    $('#hdr').innerHTML = \`
      <div style="display:flex;gap:12px;align-items:center">
        \${(ev.logo_url?'<img src="'+ev.logo_url+'" width="56" height="56" style="border-radius:10px;border:1px solid #e5e7eb;object-fit:contain">':'')}
        <div>
          <div class="muted" style="font-size:12px">Villiersdorp Landbou Skou</div>
          <h1 style="margin:2px 0 4px">\${ev.name||''}</h1>
          <div class="muted">\${ev.dates||''} \${ev.venue?('• '+ev.venue):''}</div>
          <div class="muted">Vendor Portal</div>
        </div>
      </div>\`;

    $('#vendor_name').value = vendor.name || '';
    $('#stall_type').value = vendor.stall_type || '';
    $('#electricity_req').value = vendor.electricity_req || '';
    $('#vendor_desc').value = vendor.description || '';
    $('#facebook').value = vendor.facebook || '';
    $('#website').value = vendor.website || '';
    $('#email').value = vendor.email || '';
    $('#tel').value = vendor.tel || '';

    const tbody = $('#pass_tbl tbody');
    tbody.innerHTML = '';
    const addRow = (emp={})=>{
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><input class="empname" value="\${emp.name||''}" placeholder="Employee full name"></td>
        <td><input class="empphone" value="\${emp.phone||''}" placeholder="Optional"></td>
        <td>${daySelectHTML(days)}</td>
        <td><button class="btn" type="button">X</button></td>\`;
      if (emp.day_label) tr.querySelector('.day').value = emp.day_label;
      tr.querySelector('button').onclick = ()=> tr.remove();
      tbody.appendChild(tr);
    };

    (employees || []).forEach(addRow);
    $('#add_row').onclick = ()=> addRow();
  }

  function collectPayload(){
    const vendor = {
      name: $('#vendor_name').value.trim(),
      stall_type: $('#stall_type').value,
      electricity_req: $('#electricity_req').value.trim(),
      description: $('#vendor_desc').value.trim(),
      facebook: $('#facebook').value.trim(),
      website: $('#website').value.trim(),
      email: $('#email').value.trim(),
      tel: $('#tel').value.trim(),
    };
    const employees = Array.from(document.querySelectorAll('#pass_tbl tbody tr')).map(tr=>({
      name: tr.querySelector('.empname').value.trim(),
      phone: tr.querySelector('.empphone').value.trim(),
      day_label: tr.querySelector('.day').value
    })).filter(e=>e.name && e.day_label);
    return { vendor, employees };
  }

  async function boot(){
    try{
      const j = await fetchPortal();
      if (!j.ok) throw 0;
      fillForm(j.vendor||{}, j.employees||[], j.event?.day_labels||[], j.event||{});
    }catch(e){
      $('#hdr').textContent = 'Kon nie vendor data laai nie.';
    }

    $('#submit_btn').onclick = async ()=>{
      const payload = collectPayload();
      $('#msg').textContent = 'Saving…';
      const r = await fetch('/api/vendor/portal/'+encodeURIComponent(token), {
        method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=>({}));
      $('#msg').textContent = j.ok ? 'Saved.' : 'Could not save.';
    };
  }

  boot();
</script>
</body>
</html>`;
}
