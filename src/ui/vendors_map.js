// /src/ui/vendors_map.js
// Public vendor map with search/filter. Route: /vendors/map or /event/:eventId/vendors/map
// Uses Leaflet from CDN (OpenStreetMap tiles).

export function vendorsMapHTML(eventId = null){
  const safeEvent = eventId ? String(eventId).replace(/[^0-9]/g, "") : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Vendor Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <style>
    :root{ --border:#e5e7eb; --text:#111827; --muted:#6b7280; --bg:#f8fafc; --card:#fff; --accent:#E10600; }
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
    #map{height:72vh;border:1px solid var(--border);border-radius:16px;overflow:hidden}
    .site-badge{display:inline-block;border:1px solid var(--border);border-radius:7px;padding:2px 6px;font-size:12px;background:#fff}
    .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:3px 9px;font-size:12px}
    .pill.accent{border-color:var(--accent);color:var(--accent)}
    .mono{font-family:ui-monospace}
    .links a{color:#111;text-decoration:underline;font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head" id="head">
      <div class="logo" id="evlogo"></div>
      <div>
        <div class="muted" style="font-size:12px">Villiersdorp Landbou Skou</div>
        <h1 id="evname">Vendor Map</h1>
        <div class="muted" id="evmeta"></div>
      </div>
    </div>

    <div class="toolbar">
      <input id="q" placeholder="Search vendors (name, description, site, tel)…"/>
      <select id="type"></select>
      <button class="btn" id="go">Search</button>
    </div>

    <div id="map"></div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script type="module">
    const eventId = ${JSON.stringify(safeEvent)};
    const $ = (s, r=document)=>r.querySelector(s);
    const esc = (s='')=>String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

    function qs(obj){
      const p = Object.entries(obj).filter(([,v])=>v!==undefined && v!==null && v!=='')
        .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
      return p ? ('?'+p) : '';
    }

    async function getSetting(key){
      try{
        const r = await fetch('/api/public/setting/'+encodeURIComponent(key));
        const j = await r.json();
        return j?.value ?? null;
      }catch(e){ return null; }
    }
    async function fetchEventHeader(){
      const url = eventId ? '/api/public/event/header/'+eventId : '/api/public/event/current';
      try{
        const r = await fetch(url);
        if (!r.ok) return null;
        return await r.json();
      }catch(e){ return null; }
    }
    async function loadTypes(){
      const r = await fetch('/api/public/vendors/types'+qs({event_id:eventId}));
      const j = await r.json().catch(()=>({}));
      const sel = $('#type');
      const types = (j.ok && j.types) ? j.types : [];
      sel.innerHTML = '<option value="">All categories</option>' + types.map(t=>'<option>'+esc(t)+'</option>').join('');
    }

    let map, markers = [];
    function clearMarkers(){
      markers.forEach(m => m.remove());
      markers = [];
    }

    function markerHtml(siteNo, vendorPresent){
      const color = vendorPresent ? '#E10600' : '#666';
      const html = '<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:14px;background:'+color+';color:#fff;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);">'+esc(String(siteNo||''))+'</div>';
      return L.divIcon({ html, className:'site-marker', iconSize:[28,28], iconAnchor:[14,14] });
    }

    function createPopup(v){
      const links = [
        v.website ? '<a href="'+esc(v.website)+'" target="_blank" rel="noopener">Website</a>' : '',
        v.facebook? '<a href="'+esc(v.facebook)+'" target="_blank" rel="noopener">Facebook</a>' : ''
      ].filter(Boolean).join(' · ');

      return `
        <div style="min-width:220px">
          <div style="display:flex;gap:8px;align-items:center">
            ${v.logo_url ? '<img src="'+esc(v.logo_url)+'" width="40" height="40" style="object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;background:#fff">' : ''}
            <div>
              <div style="font-weight:700">${esc(v.name || (v.site_no ? 'Site '+v.site_no : 'Vendor'))}</div>
              ${v.stall_type ? '<div class="pill accent">'+esc(v.stall_type)+'</div>' : ''}
            </div>
          </div>
          ${v.description ? '<div style="margin:6px 0">'+esc(v.description)+'</div>' : ''}
          <div class="site-badge">Site ${esc(v.site_no || '—')}</div>
          <div style="margin-top:6px" class="links">${links}</div>
          <div style="margin-top:6px" class="mono">${esc(v.tel || '')} ${v.email ? '• '+esc(v.email) : ''}</div>
        </div>`;
    }

    async function loadMarkers(){
      const q = $('#q').value.trim();
      const type = $('#type').value;
      const r = await fetch('/api/public/vendors/map'+qs({ event_id:eventId, q, type }));
      const j = await r.json().catch(()=>({}));
      if (!j.ok) return;

      clearMarkers();

      (j.sites||[]).forEach(s=>{
        const m = L.marker([s.lat, s.lng], { icon: markerHtml(s.site_no, false), zIndexOffset: 200 });
        m.addTo(map).bindPopup('<div class="site-badge">Site '+esc(s.site_no)+'</div><div class="muted">No vendor assigned</div>');
        markers.push(m);
      });

      (j.vendors||[]).forEach(v=>{
        const m = L.marker([v.lat, v.lng], { icon: markerHtml(v.site_no, true), zIndexOffset: 500 });
        m.addTo(map).bindPopup(createPopup(v));
        markers.push(m);
      });

      if (j.viewport && j.viewport.bounds){
        const b = j.viewport.bounds;
        const sw = L.latLng(b.south, b.west);
        const ne = L.latLng(b.north, b.east);
        map.fitBounds(L.latLngBounds(sw, ne), { padding:[40,40] });
      }
    }

    async function boot(){
      const header = await fetchEventHeader();
      const defaultLogo = await getSetting('DEFAULT_EVENT_LOGO_URL');
      const evLogo = header?.event?.logo_url || defaultLogo || '';
      const evName = header?.event?.name || 'Vendor Map';
      const evDates = header?.event?.dates || '';
      const evVenue = header?.event?.venue || '';
      if (evLogo) $('#evlogo').innerHTML = '<img src="'+esc(evLogo)+'" alt="Event logo">';
      $('#evname').textContent = evName;
      $('#evmeta').textContent = [evDates, evVenue].filter(Boolean).join(' • ');

      await loadTypes();

      // Init Leaflet
      map = L.map('map', { zoomControl: true });
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // default center
      const center = header?.event?.map_center ? header.event.map_center : null;
      if (center){
        map.setView([center.lat, center.lng], center.zoom || 17);
      }else{
        map.setView([-34.017, 19.294], 16); // <- fallback (Villiersdorp area, adjust)
      }

      await loadMarkers();

      $('#go').onclick = ()=> loadMarkers();
      $('#q').addEventListener('keydown', e=>{ if(e.key==='Enter') loadMarkers(); });
      $('#type').addEventListener('change', ()=> loadMarkers());
    }

    boot();
  </script>
</body>
</html>`;
}
