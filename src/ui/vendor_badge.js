// /src/ui/vendor_badge.js
// Printable Vendor Badge (A6-ish) with Skou logo, event name+dates, stall info, employee name, BIG QR.
// Route expectation: /vb/:token -> vendorBadgeHTML(token)

export function vendorBadgeHTML(token) {
  const safeToken = String(token || "").replace(/[^a-zA-Z0-9._-]/g, "");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Vendor Badge</title>
  <style>
    :root{
      --border:#e5e7eb;
      --text:#111827;
      --muted:#6b7280;
      --card:#ffffff;
      --accent:#E10600;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#f8fafc;color:var(--text)}
    .wrap{max-width:720px;margin:0 auto;padding:16px}
    .badge{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
    @media print{
      body{background:#fff}
      .wrap{max-width:none;padding:0}
      .badge{border:0;border-radius:0;width:105mm;height:148mm; /* A6 portrait */ margin:0; page-break-after:always}
      .noprint{display:none}
    }

    .header{display:flex;gap:12px;align-items:center;margin-bottom:8px}
    .logo{width:64px;height:64px;border-radius:12px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}
    .logo img{max-width:100%;max-height:100%;display:block}
    h1{margin:0;font-size:22px}
    .muted{color:var(--muted)}
    .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:12px}
    .pill.accent{border-color:var(--accent); color:var(--accent);}

    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}
    @media (max-width:720px){ .grid{grid-template-columns:1fr} }

    .qrbox{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center}
    .qr{width:300px;height:300px}
    @media (max-width:720px){ .qr{width:260px;height:260px} }

    .big{font-size:18px;font-weight:700}
    .label{font-size:12px;color:var(--muted);margin-top:10px}
    .printbar{margin:12px 0}
    .printbtn{background:#111;color:#fff;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
    .printbtn:focus-visible{outline:3px solid rgba(17,17,17,.3)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge" id="badge">
      <div class="muted">Loading…</div>
    </div>

    <div class="printbar noprint">
      <button class="printbtn" onclick="window.print()">Print</button>
    </div>
  </div>

<script type="module">
  const token = ${JSON.stringify(safeToken)};
  const $ = (s, r=document)=>r.querySelector(s);
  const esc = (s='')=>String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  async function getPublicSettings(keys){
    try{
      const r = await fetch('/api/public/settings?keys=' + encodeURIComponent(keys.join(',')));
      if (r.ok){ const j = await r.json(); return j.settings || {}; }
    }catch(e){}
    const out={}; for (const k of keys){
      try{ const r=await fetch('/api/public/setting/'+encodeURIComponent(k)); if(r.ok){const j=await r.json(); if(j.ok) out[k]=j.value;} }catch(e){}
    }
    return out;
  }

  async function loadBadge(){
    // You should serve this JSON:
    // GET /api/public/vendors/pass/:token -> { ok, event:{name,dates,venue,logo_url}, vendor:{name,site_no,tel,stall_type}, pass:{qr,employee_name,day_label}, order? }
    let data=null;
    try{
      const r = await fetch('/api/public/vendors/pass/'+encodeURIComponent(token));
      if (r.ok) data = await r.json();
    }catch(e){}

    const box = $('#badge');
    if (!data || !data.ok){ box.innerHTML = '<div class="muted">Kon nie badge laai nie.</div>'; return; }

    const ev = data.event || {};
    const vd = data.vendor || {};
    const pass = data.pass || {};

    // Resolve logo (event.logo_url or DEFAULT_EVENT_LOGO_URL)
    let logoUrl = ev.logo_url || null;
    if (!logoUrl){
      const s = await getPublicSettings(['DEFAULT_EVENT_LOGO_URL']);
      logoUrl = s.DEFAULT_EVENT_LOGO_URL || null;
    }
    const logoHTML = logoUrl ? \`<div class="logo"><img src="\${esc(logoUrl)}" alt="Event logo"></div>\` : \`<div class="logo" aria-hidden="true"></div>\`;

    const dateLine = ev.starts_at && ev.ends_at
      ? new Date(ev.starts_at*1000).toLocaleDateString() + ' – ' + new Date(ev.ends_at*1000).toLocaleDateString()
      : (ev.dates || '');

    const qrHTML = pass.qr
      ? \`<img class="qr" src="/api/public/qr/\${encodeURIComponent(pass.qr)}?s=600" alt="QR" width="300" height="300" loading="eager"/>\`
      : '';

    box.innerHTML = \`
      <div class="header">
        \${logoHTML}
        <div>
          <div class="muted" style="font-size:12px">Villiersdorp Landbou Skou</div>
          <h1 style="margin:2px 0 4px">\${esc(ev.name||'')}</h1>
          <div class="muted">\${esc(dateLine)} \${ev.venue ? ' • '+esc(ev.venue) : ''}</div>
        </div>
      </div>

      <div class="grid">
        <div>
          <div class="label">Badge Type</div>
          <div class="big">VENDOR</div>

          <div class="label">Vendor</div>
          <div class="big">\${esc(vd.name || '—')}</div>

          <div class="label">Stall Type</div>
          <div>\${esc(vd.stall_type || '—')}</div>

          <div class="row" style="margin-top:8px">
            <span class="pill accent">Site: \${esc(vd.site_no || 'TBC')}</span>
            <span class="pill">Tel: \${esc(vd.tel || '—')}</span>
            \${pass.day_label ? '<span class="pill">Day: '+esc(pass.day_label)+'</span>' : ''}
          </div>

          <div class="label">Employee</div>
          <div class="big">\${esc(pass.employee_name || '—')}</div>
        </div>

        <div class="qrbox">
          \${qrHTML}
          <div style="font-family:ui-monospace;word-break:break-all">\${esc(pass.qr || '')}</div>
        </div>
      </div>\`;
  }

  loadBadge();
</script>
</body>
</html>`;
}
