// /src/ui/landing.js
export const landingHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Villiersdorp Skou — Tickets</title>
<style>
  :root{ --green:#0a7d2b; --yellow:#ffd900; --bg:#f7f7f8; --muted:#667085; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#1a1a1a }
  header{ background:linear-gradient(90deg,var(--green),var(--yellow)); color:#fff; padding:28px 16px }
  .hero{ max-width:1200px; margin:0 auto; display:flex; justify-content:space-between; gap:16px; align-items:center }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .hero small{ opacity:.95; display:block }
  nav a{ color:#0b2; background:#ffffff10; padding:10px 14px; border:1px solid #ffffff33; border-radius:10px; text-decoration:none; margin-left:8px; display:inline-block }
  .wrap{ max-width:1200px; margin:20px auto; padding:0 16px }
  h2{ margin:8px 0 12px }
  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:18px }

  .card{ background:#fff; border-radius:14px; box-shadow:0 10px 24px rgba(0,0,0,.08); overflow:hidden; display:flex; flex-direction:column }
  /* Poster area: letterboxed, no cropping */
  .posterBox{ position:relative; background:#111; }
  .posterBox img{
    width:100%; height:auto; display:block;
    object-fit:contain; object-position:center; /* no cropping */
    max-height:220px;                           /* nice on mobile too */
    background:#111;
  }

  .body{ padding:14px; flex:1; display:flex; flex-direction:column; gap:6px }
  .title{ font-weight:700; font-size:18px; margin:0 0 2px }
  .meta{ color:var(--muted); font-size:14px }
  .actions{ padding:14px; display:flex; gap:10px }
  .btn{ flex:1; display:inline-block; text-align:center; padding:12px 14px; border-radius:10px; text-decoration:none; font-weight:600; }
  .primary{ background:var(--green); color:#fff }
  .ghost{ border:1px solid #e5e7eb; color:#111; background:#fff }
</style>
</head><body>
<header>
  <div class="hero">
    <div>
      <h1>Villiersdorp Skou — Tickets</h1>
      <small>Opkomende vertonings · Koop aanlyn · POS · Toegangsbeheer</small>
    </div>
    <nav>
      <a href="/admin">Admin</a>
      <a href="/pos">POS</a>
      <a href="/scan">Scanner</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h2>Opkomende Vertonings</h2>
  <div id="grid" class="grid">Loading…</div>
</div>

<script>
function fmtDateRange(s,e){
  const sdt = new Date(s*1000), edt=new Date(e*1000);
  const opts = { weekday:'short', day:'2-digit', month:'short' };
  return sdt.toLocaleDateString('af-ZA', opts) + " – " + edt.toLocaleDateString('af-ZA', opts);
}
function firstImage(ev){
  // prefer poster, then hero, then first of gallery
  if (ev.poster_url) return ev.poster_url;
  if (ev.hero_url) return ev.hero_url;
  try {
    const g = ev.gallery_urls ? JSON.parse(ev.gallery_urls) : null;
    if (Array.isArray(g) && g.length) return g[0];
  } catch {}
  return null;
}
function cardHTML(ev){
  const when = fmtDateRange(ev.starts_at, ev.ends_at);
  const v = ev.venue ? ' · ' + ev.venue : '';
  const img = firstImage(ev);
  return \`
    <div class="card">
      <div class="posterBox">\${img ? '<img alt="" src="'+escapeHtml(img)+'"/>' : ''}</div>
      <div class="body">
        <div class="title">\${escapeHtml(ev.name)}</div>
        <div class="meta">\${when}\${v}</div>
      </div>
      <div class="actions">
        <a class="btn ghost" href="/shop/\${encodeURIComponent(ev.slug)}">Info</a>
        <a class="btn primary" href="/shop/\${encodeURIComponent(ev.slug)}">Kaartjies</a>
      </div>
    </div>\`;
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
async function load(){
  const res = await fetch('/api/public/events').then(r=>r.json()).catch(()=>({ok:false}));
  const grid = document.getElementById('grid');
  if (!res.ok){ grid.textContent = 'Kon nie laai nie'; return; }
  if (!res.events.length){ grid.textContent = 'Geen vertonings tans'; return; }
  grid.innerHTML = res.events.map(cardHTML).join('');
}
load();
</script>
</body></html>`;
