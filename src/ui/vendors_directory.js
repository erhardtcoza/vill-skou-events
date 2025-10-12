// /src/ui/vendors_directory.js
// Public Vendor Directory with search, category filter, and pagination.
// Route: /vendors or /event/:eventId/vendors -> vendorsDirectoryHTML(eventId?)

export function vendorsDirectoryHTML(eventId = null) {
  const safeEvent = eventId ? String(eventId).replace(/[^0-9]/g, "") : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Vendors</title>
  <style>
    :root{
      --border:#e5e7eb; --text:#111827; --muted:#6b7280; --card:#ffffff; --bg:#f8fafc; --pill:#111;
      --accent:#E10600;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:var(--bg);color:var(--text)}
    .wrap{max-width:1100px;margin:0 auto;padding:16px}
    .head{display:flex;gap:12px;align-items:center;margin-bottom:12px}
    .logo{width:56px;height:56px;border:1px solid var(--border);border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .logo img{max-width:100%;max-height:100%}
    h1{margin:0}
    .muted{color:var(--muted)}

    .toolbar{display:grid;grid-template-columns:1fr 220px 120px;gap:10px;margin:14px 0}
    @media (max-width:800px){ .toolbar{grid-template-columns:1fr 1fr} }
    @media (max-width:520px){ .toolbar{grid-template-columns:1fr} }

    input,select{border:1px solid var(--border);border-radius:10px;padding:10px;font-size:14px;width:100%}
    .btn{background:#111;color:#fff;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
    .btn:disabled{opacity:.5;cursor:not-allowed}

    .grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:12px}
    @media (max-width:980px){ .grid{grid-template-columns:repeat(2, 1fr)} }
    @media (max-width:620px){ .grid{grid-template-columns:1fr} }

    .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px;display:flex;gap:12px}
    .vlogo{width:72px;height:72px;border:1px solid var(--border);border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 72px}
    .vlogo img{max-width:100%;max-height:100%}
    .title{font-weight:700}
    .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:3px 9px;font-size:12px;background:#fff}
    .pill.accent{border-color:var(--accent); color:var(--accent);}
    .desc{font-size:14px;color:var(--text);margin:4px 0}
    .links a{color:#111;text-decoration:underline; font-size:13px}
    .site{font-size:12px;color:#333;background:#fff;border:1px solid var(--border);border-radius:7px;padding:2px 6px}

    .pager{display:flex;gap:8px;align-items:center;justify-content:center;margin:16px 0}
    .pager .btn{padding:8px 12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head" id="head">
      <div class="logo" id="evlogo"></div>
      <div>
        <div class="muted" style="font-size:12px">Villiersdorp Landbou Skou</div>
        <h1 id="evname">Vendors</h1>
        <div class="muted" id="evmeta"></div>
      </div>
    </div>

    <div class="toolbar">
      <input id="q" placeholder="Search vendors (name, description, site, tel)…"/>
      <select id="type"></select>
      <button class="btn" id="go">Search</button>
    </div>

    <div class="grid" id="list"></div>

    <div class="pager" id="pager" style="display:none">
      <button class="btn" id="prev">Prev</button>
      <span class="muted" id="pinfo"></span>
      <button class="btn" id="next">Next</button>
    </div>
  </div>

<script type="module">
  const eventId = ${JSON.stringify(safeEvent)};
  const $ = (s, r=document)=>r.querySelector(s);
  const esc = (s='')=>String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function qs(obj){
    const p = Object.entries(obj).filter(([,v])=>v!==undefined && v!==null && v!=='')
      .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    return p ? ('?'+p) : '';
  }

  async function fetchEventHeader(){
    // Optional public event header; if not present we just use settings logo
    const url = eventId ? '/api/public/event/header/'+eventId : '/api/public/event/current';
    try{
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    }catch(e){ return null; }
  }

  async function getSetting(key){
    try{
      const r = await fetch('/api/public/setting/'+encodeURIComponent(key));
      const j = await r.json();
      return j?.value ?? null;
    }catch(e){ return null; }
  }

  async function loadTypes(){
    const r = await fetch('/api/public/vendors/types'+qs({event_id:eventId}));
    const j = await r.json().catch(()=>({}));
    const sel = $('#type');
    const types = (j.ok && j.types) ? j.types : [];
    sel.innerHTML = '<option value="">All categories</option>' + types.map(t=>'<option>'+esc(t)+'</option>').join('');
  }

  async function loadPage(page=1){
    const q = $('#q').value.trim();
    const type = $('#type').value;
    const r = await fetch('/api/public/vendors'+qs({ event_id:eventId, q, type, page }));
    const j = await r.json().catch(()=>({}));
    const list = $('#list'); list.innerHTML='';

    if (!j.ok){ list.innerHTML = '<div class="muted">Kon nie lys laai nie.</div>'; $('#pager').style.display='none'; return; }

    (j.items||[]).forEach(v=>{
      const logo = v.logo_url || j.defaults?.vendor_logo || j.defaults?.event_logo || '';
      const site = v.site_no ? ('<span class="site">Site '+esc(v.site_no)+'</span>') : '';
      const tel  = v.tel ? ('<span class="pill">Tel: '+esc(v.tel)+'</span>') : '';
      const email= v.email ? ('<span class="pill">'+esc(v.email)+'</span>') : '';
      const links = [
        v.website ? '<a href="'+esc(v.website)+'" target="_blank" rel="noopener">Website</a>' : '',
        v.facebook? '<a href="'+esc(v.facebook)+'" target="_blank" rel="noopener">Facebook</a>' : ''
      ].filter(Boolean).join(' · ');

      list.insertAdjacentHTML('beforeend', \`
        <div class="card">
          <div class="vlogo">\${logo?'<img src="'+esc(logo)+'" alt="logo">':''}</div>
          <div style="min-width:0">
            <div class="row">
              <div class="title">\${esc(v.name || '—')}</div>
              \${v.stall_type ? '<span class="pill accent">'+esc(v.stall_type)+'</span>' : ''}
              \${site}
            </div>
            \${v.description ? '<div class="desc">'+esc(v.description)+'</div>' : ''}
            <div class="row links">\${links}</div>
            <div class="row" style="margin-top:6px">\${tel} \${email}</div>
          </div>
        </div>\`);
    });

    // Pager
    const pager = $('#pager');
    if ((j.total_pages||1) > 1){
      pager.style.display='';
      $('#pinfo').textContent = 'Page '+j.page+' of '+j.total_pages;
      $('#prev').disabled = j.page<=1;
      $('#next').disabled = j.page>=j.total_pages;
      $('#prev').onclick = ()=> loadPage(j.page-1);
      $('#next').onclick = ()=> loadPage(j.page+1);
      window.scrollTo({ top:0, behavior:'smooth' });
    }else{
      pager.style.display='none';
    }
  }

  async function boot(){
    // Header
    const header = await fetchEventHeader();
    const defaultLogo = await getSetting('DEFAULT_EVENT_LOGO_URL');
    const evLogo = header?.event?.logo_url || defaultLogo || '';
    const evName = header?.event?.name || 'Vendors';
    const evDates = header?.event?.dates || '';
    const evVenue = header?.event?.venue || '';

    if (evLogo) $('#evlogo').innerHTML = '<img src="'+esc(evLogo)+'" alt="Event logo">';
    $('#evname').textContent = evName;
    $('#evmeta').textContent = [evDates, evVenue].filter(Boolean).join(' • ');

    await loadTypes();
    await loadPage(1);

    $('#go').onclick = ()=> loadPage(1);
    $('#q').addEventListener('keydown', e=>{ if(e.key==='Enter') loadPage(1); });
    $('#type').addEventListener('change', ()=> loadPage(1));
  }

  boot();
</script>
</body>
</html>`;
}
