// /src/ui/vendors_map_polygons.js
// Public vendor map that renders site polygons and overlays vendor info.
// Route: /vendors/map (current) or /event/:eventId/vendors/map

export function vendorsPolygonMapHTML(eventId = null){
  const safeEvent = eventId ? String(eventId).replace(/[^0-9]/g, "") : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Vendor Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
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
    @media (max-width:520px){ .toolbar{grid-template-columns:1fr } }
    input,select{border:1px solid var(--border);border-radius:10px;padding:10px;font-size:14px;width:100%}
    .btn{background:#111;color:#fff;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}

    #map{height:72vh;border:1px solid var(--border);border-radius:16px;overflow:hidden}
    .label{
      position:absolute; transform:translate(-50%,-50%);
      background:#fff; border:1px solid var(--border); border-radius:8px; padding:2px 6px;
      font-size:12px; font-weight:700; pointer-events:none; white-space:nowrap;
      box-shadow:0 1px 3px rgba(0,0,0,.15);
    }
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

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
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
      try{ const r = await fetch('/api/public/setting/'+encodeURIComponent(key)); const j = await r.json(); return j?.value ?? null; }
      catch(e){ return null; }
    }
    async function fetchEventHeader(){
      const url = eventId ? '/api/public/event/header/'+eventId : '/api/public/event/current';
      try{ const r = await fetch(url); if (!r.ok) return null; return await r.json(); }catch(e){ return null; }
    }
    async function loadTypes(){
      const r = await fetch('/api/public/vendors/types'+qs({event_id:eventId}));
      const j = await r.json().catch(()=>({}));
      const sel = $('#type');
      const types = (j.ok && j.types) ? j.types : [];
      sel.innerHTML = '<option value="">All categories</option>' + types.map(t=>'<option>'+esc(t)+'</option>').join('');
    }

    // centroid of Polygon/MultiPolygon (very light)
    function centroidOfGeom(geom){
      try{
        if (!geom) return null;
        if (geom.type === 'Polygon'){
          return centroidOfRing(geom.coordinates[0]);
        }else if (geom.type === 'MultiPolygon'){
          // pick largest area polygon
          let best=null, areaMax=-Infinity;
          for (const poly of geom.coordinates){
            const c = poly[0];
            const a = Math.abs(ringArea(c));
            if (a>areaMax){ areaMax=a; best=c; }
          }
          return centroidOfRing(best);
        }
      }catch(e){}
      return null;
    }
    function ringArea(coords){
      let sum=0;
      for (let i=0, n=coords.length; i<n-1; i++){
        const [x1,y1] = coords[i], [x2,y2] = coords[i+1];
        sum += (x1*y2 - x2*y1);
      }
      return sum/2;
    }
    function centroidOfRing(coords){
      let x=0, y=0, a=0;
      for (let i=0, n=coords.length-1; i<n; i++){
        const [x1,y1] = coords[i], [x2,y2] = coords[i+1];
        const f = (x1*y2 - x2*y1);
        x += (x1 + x2) * f;
        y += (y1 + y2) * f;
        a += f;
      }
      a *= 0.5;
      if (!a) return [coords[0][0], coords[0][1]];
      return [x/(6*a), y/(6*a)];
    }

    let map, polyLayer, labelsLayer;
    function clearLayers(){
      if (polyLayer) polyLayer.remove();
      if (labelsLayer){ labelsLayer.forEach(el => el.remove()); labelsLayer = []; }
    }
    function popupHTML(p){
      const v = p.vendor;
      if (!v){
        return '<div><div class="muted">Site '+esc(p.site_no)+'</div><div>No vendor assigned</div></div>';
      }
      const links = [
        v.website ? '<a href="'+esc(v.website)+'" target="_blank" rel="noopener">Website</a>' : '',
        v.facebook? '<a href="'+esc(v.facebook)+'" target="_blank" rel="noopener">Facebook</a>' : ''
      ].filter(Boolean).join(' · ');
      return \`
        <div style="min-width:220px">
          <div style="display:flex;gap:8px;align-items:center">
            \${v.logo_url ? '<img src="\'+esc(v.logo_url)+\'" width="40" height="40" style="object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;background:#fff">' : ''}
            <div>
              <div style="font-weight:700">\${esc(v.name)}</div>
              \${v.stall_type ? '<div style="display:inline-block;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px;font-size:12px;color:#E10600">'+esc(v.stall_type)+'</div>' : ''}
            </div>
          </div>
          \${v.description ? '<div style="margin:6px 0">'+esc(v.description)+'</div>' : ''}
          <div style="margin-top:6px">\${links}</div>
          <div style="margin-top:6px;font-family:ui-monospace">\${esc(v.tel||'')}\${v.email ? ' • '+esc(v.email):''}</div>
          <div style="margin-top:6px;opacity:.7">Site \${esc(p.site_no)}</div>
        </div>\`;
    }

    async function loadPolygons(){
      const q = $('#q').value.trim();
      const type = $('#type').value;
      const url = '/api/public/vendors/map-geo' + qs({ event_id:eventId, q, type });
      const r = await fetch(url);
      const j = await r.json().catch(()=>({}));
      if (!j.ok) return;

      clearLayers();
      labelsLayer = [];

      polyLayer = L.geoJSON(j, {
        style: f => ({
          color: f.properties.assigned ? '#E10600' : '#666',
          weight: 1.5,
          fillColor: f.properties.assigned ? '#E10600' : '#999',
          fillOpacity: f.properties.assigned ? 0.25 : 0.12
        }),
        onEachFeature: (f, layer) => {
          layer.bindPopup(popupHTML(f.properties));
        }
      }).addTo(map);

      // Site number labels at polygon centroids
      polyLayer.eachLayer(layer => {
        const f = layer.feature;
        const p = f.properties;
        let ll = null;
        if (p.anchor && p.anchor.lat && p.anchor.lng){
          ll = [p.anchor.lat, p.anchor.lng];
        }else{
          const c = centroidOfGeom(f.geometry);
          if (c) ll = [c[1], c[0]]; // GeoJSON lon,lat -> Leaflet lat,lng
        }
        if (!ll) return;
        const div = document.createElement('div');
        div.className = 'label';
        div.textContent = p.site_no;
        const label = L.marker(ll, {
          icon: L.divIcon({ className:'', html: div, iconSize:[0,0] }),
          interactive: false,
          zIndexOffset: 1000
        }).addTo(map);
        labelsLayer.push(label);
      });

      // Fit bounds
      try{
        const b = polyLayer.getBounds();
        if (b.isValid()) map.fitBounds(b, { padding:[30,30] });
      }catch(_e){
        // fallback: viewport from API
        if (j.viewport?.center) map.setView([j.viewport.center.lat, j.viewport.center.lng], j.viewport.zoom || 17);
      }
    }

    async function boot(){
      const header = await fetchEventHeader();
      const defLogo = await getSetting('DEFAULT_EVENT_LOGO_URL');
      const evLogo = header?.event?.logo_url || defLogo || '';
      const evName = header?.event?.name || 'Vendor Map';
      const evDates = header?.event?.dates || '';
      const evVenue = header?.event?.venue || '';
      if (evLogo) $('#evlogo').innerHTML = '<img src="'+esc(evLogo)+'" alt="Event logo">';
      $('#evname').textContent = evName;
      $('#evmeta').textContent = [evDates, evVenue].filter(Boolean).join(' • ');

      await loadTypes();

      map = L.map('map', { zoomControl:true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      if (header?.event?.map_center){
        map.setView([header.event.map_center.lat, header.event.map_center.lng], header.event.map_center.zoom || 17);
      }else{
        map.setView([-34.017, 19.294], 16);
      }

      await loadPolygons();

      $('#go').onclick = ()=> loadPolygons();
      $('#q').addEventListener('keydown', e=>{ if(e.key==='Enter') loadPolygons(); });
      $('#type').addEventListener('change', ()=> loadPolygons());
    }

    boot();
  </script>
</body>
</html>`;
}
