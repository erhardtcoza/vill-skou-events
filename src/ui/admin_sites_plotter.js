// /src/ui/admin_sites_plotter.js
// Draw/edit polygons for sites of a given event, save to DB.

export function adminSitesPlotterHTML(eventId){
  const id = String(eventId||'').replace(/[^0-9]/g,'');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Site Plotter – Event #${id}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css">
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
    .wrap{max-width:1100px;margin:0 auto;padding:16px}
    .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .btn{background:#111;color:#fff;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
    #map{height:78vh;border:1px solid #e5e7eb;border-radius:16px}
    #panel{margin:10px 0}
    input{border:1px solid #e5e7eb;border-radius:10px;padding:8px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #e5e7eb;padding:6px;text-align:left}
  </style>
</head>
<body>
<div class="wrap">
  <h1>Site Plotter – Event #${id}</h1>
  <div class="row" id="panel">
    <input id="site_no" placeholder="Site no (e.g. A12)">
    <input id="name" placeholder="Optional name">
    <button class="btn" id="save">Save geometry</button>
    <span id="msg"></span>
  </div>
  <div id="map"></div>
  <table id="list"><thead><tr><th>Site</th><th>Name</th><th>Actions</th></tr></thead><tbody></tbody></table>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
<script type="module">
  const eventId = ${JSON.stringify(id)};
  const $ = (s, r=document)=>r.querySelector(s);
  let map, drawn, drawCtl, currentLayer=null, allSites=[];

  function toGeoJSON(layer){
    const gj = layer.toGeoJSON();
    if (gj.geometry.type === 'Polygon' || gj.geometry.type === 'MultiPolygon') return gj.geometry;
    return null;
  }

  async function loadSites(){
    const r = await fetch('/api/admin/sites/'+eventId);
    const j = await r.json().catch(()=>({}));
    allSites = j.items || [];
    const tb = $('#list tbody'); tb.innerHTML = '';
    allSites.forEach(s=>{
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td>\${s.site_no}</td><td>\${s.name||''}</td>
        <td><button data-load="\${s.site_no}">Load</button> <button data-del="\${s.site_no}">Delete</button></td>\`;
      tb.appendChild(tr);
    });
  }

  async function boot(){
    // Init map
    map = L.map('map').setView([-34.017,19.294], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    drawn = new L.FeatureGroup().addTo(map);
    drawCtl = new L.Control.Draw({
      edit: { featureGroup: drawn },
      draw: { polygon:true, polyline:false, rectangle:false, circle:false, marker:false, circlemarker:false }
    });
    map.addControl(drawCtl);

    map.on(L.Draw.Event.CREATED, e=>{
      if (currentLayer) drawn.removeLayer(currentLayer);
      currentLayer = e.layer; drawn.addLayer(currentLayer);
    });
    map.on(L.Draw.Event.EDITED, e=>{
      // keep currentLayer reference if edited
    });

    await loadSites();

    // Load geometry to edit
    document.body.addEventListener('click', async (e)=>{
      const loadBtn = e.target.closest('button[data-load]');
      const delBtn  = e.target.closest('button[data-del]');
      if (loadBtn){
        const site_no = loadBtn.getAttribute('data-load');
        const s = allSites.find(x => x.site_no === site_no);
        if (!s || !s.geom_geojson) return;
        if (currentLayer) drawn.removeLayer(currentLayer);
        const g = JSON.parse(s.geom_geojson);
        currentLayer = L.geoJSON({ type:"Feature", geometry:g }).getLayers()[0];
        drawn.addLayer(currentLayer);
        $('#site_no').value = s.site_no;
        $('#name').value = s.name || '';
        try{ map.fitBounds(currentLayer.getBounds(), { padding:[20,20] }); }catch(_e){}
      }
      if (delBtn){
        const site_no = delBtn.getAttribute('data-del');
        if (!confirm('Delete site '+site_no+'?')) return;
        const r = await fetch('/api/admin/sites/'+eventId+'/'+encodeURIComponent(site_no), { method:'DELETE' });
        const j = await r.json().catch(()=>({}));
        $('#msg').textContent = j.ok ? 'Deleted.' : 'Delete failed.';
        await loadSites();
      }
    });

    $('#save').onclick = async ()=>{
      const site_no = $('#site_no').value.trim();
      if (!site_no){ $('#msg').textContent='Enter a site number'; return; }
      if (!currentLayer){ $('#msg').textContent='Draw a polygon first'; return; }
      const geom = toGeoJSON(currentLayer);
      if (!geom){ $('#msg').textContent='Invalid geometry'; return; }
      const body = { site_no, name: $('#name').value.trim(), geom_geojson: geom };
      $('#msg').textContent = 'Saving…';
      const r = await fetch('/api/admin/sites/'+eventId, {
        method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)
      });
      const j = await r.json().catch(()=>({}));
      $('#msg').textContent = j.ok ? 'Saved.' : 'Save failed.';
      await loadSites();
    };
  }

  boot();
</script>
</body>
</html>`;
}
