// /src/ui/admin_vendor_whatsapp.js
// Admin page: Preview & send WhatsApp vendor passes for a single vendor.
// Route expectation: /admin/vendor/:id/wa -> adminVendorWAHTML(vendorId)

export function adminVendorWAHTML(vendorId) {
  const id = String(vendorId || "").replace(/[^0-9]/g, "");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Vendor WhatsApp – #${id}</title>
  <style>
    :root{ --border:#e5e7eb; --muted:#6b7280; --text:#111827; --ok:#065f46; --warn:#92400e; --bad:#991b1b; --chip:#111; }
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#f8fafc;color:var(--text)}
    .wrap{max-width:980px;margin:0 auto;padding:16px}
    .card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px}
    h1{margin:0 0 6px}
    .muted{color:var(--muted)}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .btn{background:#111;color:#fff;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn.warn{background:#b45309}
    .btn.ok{background:#065f46}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid var(--border);padding:8px;text-align:left;font-size:14px}
    th{background:#f3f4f6}
    .section h3{margin:10px 0 6px}
    .chip{display:inline-block;border-radius:999px;padding:4px 10px;font-size:12px;color:#fff;background:#374151}
    .chip.ok{background:#065f46}
    .chip.fail{background:#991b1b}
    .chip.warn{background:#92400e}
    .stamp{font-family:ui-monospace; font-size:12px; color:var(--muted)}
    .counts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .counts .chip{background:#111}
    .mono{font-family:ui-monospace}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>Vendor WhatsApp – <span id="vname">#${id}</span></h1>
    <div class="muted" id="vmeta">Loading…</div>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="btn-refresh">Preview</button>
      <button class="btn ok" id="btn-send">Issue & WhatsApp all passes</button>
      <span id="msg" class="muted"></span>
    </div>
  </div>

  <div class="card">
    <div class="counts" id="counts"></div>
  </div>

  <div class="card section" id="sec-to-send" style="display:none">
    <h3>Ready to send</h3>
    <table>
      <thead><tr><th>Employee</th><th>Day</th><th>Phone</th><th>Link</th><th>QR</th><th>Status</th><th>Action</th></tr></thead>
      <tbody id="tb-send"></tbody>
    </table>
  </div>

  <div class="card section" id="sec-already" style="display:none">
    <h3>Already sent (OK)</h3>
    <table>
      <thead><tr><th>Employee</th><th>Day</th><th>Phone</th><th>Sent at</th><th>Action</th></tr></thead>
      <tbody id="tb-already"></tbody>
    </table>
  </div>

  <div class="card section" id="sec-create" style="display:none">
    <h3>Will be created (no pass yet)</h3>
    <table><thead><tr><th>Employee</th><th>Day</th></tr></thead><tbody id="tb-create"></tbody></table>
  </div>

  <div class="card section" id="sec-missing" style="display:none">
    <h3>Missing phone</h3>
    <table><thead><tr><th>Employee</th><th>Day</th></tr></thead><tbody id="tb-missing"></tbody></table>
  </div>

  <div class="card section" id="sec-invalid" style="display:none">
    <h3>Invalid phone format</h3>
    <table><thead><tr><th>Employee</th><th>Day</th><th>Phone</th></tr></thead><tbody id="tb-invalid"></tbody></table>
  </div>

  <div class="card section" id="sec-dupes" style="display:none">
    <h3>Duplicate numbers</h3>
    <table><thead><tr><th>Phone</th><th>Count</th><th>Entries</th></tr></thead><tbody id="tb-dupes"></tbody></table>
  </div>
</div>

<script type="module">
  const vendorId = ${JSON.stringify(id)};
  const $ = (s, r=document)=>r.querySelector(s);
  const fmtTime = (s)=> s ? new Date((Number(s)||0)*1000).toLocaleString() : '';

  async function preview(){
    $('#msg').textContent = 'Loading preview…';
    const r = await fetch('/api/vendor/passes/preview/'+vendorId);
    const j = await r.json().catch(()=>({}));
    if (!j.ok){ $('#msg').textContent='Failed to load preview.'; return; }

    $('#vname').textContent = j.vendor?.name || ('Vendor #'+vendorId);
    $('#vmeta').textContent = j.vendor?.event ? 'Event: ' + j.vendor.event : '';

    const c = j.counts || {};
    const countsBox = $('#counts');
    countsBox.innerHTML = '';
    const addChip = (label,val)=>{ const span=document.createElement('span'); span.className='chip'; span.textContent=label+': '+(val||0); countsBox.appendChild(span); };
    addChip('Employees', c.employees);
    addChip('Existing passes', c.existing_passes);
    addChip('To create', c.to_create);
    addChip('To send', c.to_send);
    addChip('Already OK', c.already_ok);
    addChip('Missing phone', c.missing_phone);
    addChip('Invalid phone', c.invalid_phone);
    addChip('Duplicates', c.duplicates);

    const fillRows = (tbodySel, rows, mapper)=>{
      const tb = $(tbodySel); tb.innerHTML='';
      (rows||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML = mapper(r); tb.appendChild(tr); });
    };

    // Sections visibility + tables
    const show = (id, cond)=>{ $(id).style.display = cond ? '' : 'none'; };

    show('#sec-to-send', (j.to_send||[]).length);
    fillRows('#tb-send', j.to_send, (r)=>`
      <td>${r.employee_name||''}</td>
      <td>${r.day_label||''}</td>
      <td class="mono">${r.phone||''}</td>
      <td><a href="${r.linkUrl}" target="_blank">Open</a></td>
      <td><a href="${r.qrImgUrl}" target="_blank">QR</a></td>
      <td>${r.wa_status?('<span class="chip '+(r.wa_status==='ok'?'ok':'fail')+'">'+r.wa_status+'</span>'):''}</td>
      <td><button class="btn" data-pass="resend" data-id="${r.pass_id}">Resend</button></td>
    `);

    show('#sec-already', (j.already_ok||[]).length);
    fillRows('#tb-already', j.already_ok, (r)=>`
      <td>${r.employee_name||''}</td>
      <td>${r.day_label||''}</td>
      <td class="mono">${r.phone||''}</td>
      <td class="stamp">${fmtTime(r.sent_at)}</td>
      <td><button class="btn" data-pass="resend" data-id="${r.pass_id}">Resend</button></td>
    `);

    show('#sec-create', (j.to_create||[]).length);
    fillRows('#tb-create', j.to_create, (r)=>`<td>${r.employee_name||''}</td><td>${r.day_label||''}</td>`);

    show('#sec-missing', (j.missing_phone||[]).length);
    fillRows('#tb-missing', j.missing_phone, (r)=>`<td>${r.employee_name||''}</td><td>${r.day_label||''}</td>`);

    show('#sec-invalid', (j.invalid_phone||[]).length);
    fillRows('#tb-invalid', j.invalid_phone, (r)=>`<td>${r.employee_name||''}</td><td>${r.day_label||''}</td><td class="mono">${r.phone||''}</td>`);

    show('#sec-dupes', (j.duplicates||[]).length);
    fillRows('#tb-dupes', j.duplicates, (d)=>`
      <td class="mono">${d.phone}</td>
      <td>${d.count}</td>
      <td>${(d.entries||[]).map(e=>e.employee_name+' ('+e.day_label+')').join(', ')}</td>
    `);

    $('#msg').textContent='';
  }

  async function issueAndSend(){
    $('#msg').textContent = 'Issuing passes and sending WhatsApps…';
    $('#btn-send').disabled = true;
    const r = await fetch('/api/vendor/passes/issue-send/'+vendorId, { method:'POST' });
    const j = await r.json().catch(()=>({}));
    if (!j.ok){ $('#msg').textContent = 'Send failed.'; $('#btn-send').disabled=false; return; }
    $('#msg').textContent = 'Done: '+(j.sent||0)+' processed.';
    await preview();
    $('#btn-send').disabled = false;
  }

  async function resend(passId){
    const btn = document.querySelector('button[data-id="'+passId+'"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const r = await fetch('/api/vendor/passes/resend/'+passId, { method:'POST' });
    const j = await r.json().catch(()=>({}));
    if (btn) btn.disabled = false, btn.textContent = 'Resend';
    if (!j.ok){ alert('Resend failed'); return; }
    await preview();
  }

  // Events
  $('#btn-refresh').onclick = preview;
  $('#btn-send').onclick = issueAndSend;
  document.body.addEventListener('click', (e)=>{
    const t = e.target.closest('button[data-pass="resend"]');
    if (t) resend(t.getAttribute('data-id'));
  });

  // Boot
  preview();
</script>
</body>
</html>`;
}
