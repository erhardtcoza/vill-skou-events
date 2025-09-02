// /src/ui/landing.js
export const landingHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Villiersdorp Skou — Tickets</title>
<style>
  :root{ --green:#0a7d2b; --yellow:#ffd900; --bg:#f7f7f8; --muted:#667085; --red:#b91c1c; }
  *{ box-sizing:border-box }
  body{ font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin:0; background:var(--bg); color:#1a1a1a }
  header{ background:linear-gradient(90deg,var(--green),var(--yellow)); color:#fff; padding:28px 16px }
  .hero{ max-width:1200px; margin:0 auto; display:flex; justify-content:space-between; gap:16px; align-items:center }
  .hero h1{ margin:0 0 6px; font-size:28px }
  .hero small{ opacity:.95 }
  nav a{ color:#0b2; background:#ffffff10; padding:10px 14px; border:1px solid #ffffff33; border-radius:10px; text-decoration:none; margin-left:8px }
  .wrap{ max-width:1200px; margin:20px auto; padding:0 16px }
  h2{ margin:8px 0 12px }
  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:18px }
  .card{ position:relative; background:#fff; border-radius:14px; box-shadow:0 10px 24px rgba(0,0,0,.08); overflow:hidden; display:flex; flex-direction:column }
  .badge{ position:absolute; top:10px; left:10px; background:#fff; color:#fff; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; box-shadow:0 4px 10px rgba(0,0,0,.15) }
  .badge.closed{ background:var(--red) }
  .poster{ height:180px; width:100%; object-fit:cover; display:block; background:linear-gradient(135deg,#e6ffe6,#fffad1) }
  .poster.fallback{ display:flex; align-items:center; justify-content:center; color:#123; font-weight:700; letter-spacing:.4px; font-size:40px }
  .body{ padding:14px; flex:1; display:flex; flex-direction:column; gap:6px }
  .title{ font-weight:700; font-size:18px; margin:0 0 2px }
  .meta{ color:var(--muted); font-size:14px }
  .actions{ padding:14px; display:flex; gap:10px }
  .btn{ flex:1; display:inline-block; text-align:center; padding:12px 14px; border-radius:10px; text-decoration:none; font-weight:600; }
  .primary{ background:var(--green); color:#fff }
  .ghost{ border:1px solid #e5e7eb; color:#111; background:#fff }
  .btn[aria-disabled="true"]{ background:#e5e7eb; color:#888; pointer-events:none }
  /* whole-card link + focus */
  .card a.card-link{ position:absolute; inset:0; outline:0; }
  .card:focus-within{ box-shadow:0 0 0 3px #0a7d2b55; }
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
  const time = { hour:'2-digit', minute:'2-digit' };
  const sameDay = sdt.toDateString() === edt.toDateString();
  return sameDay
    ? sdt.toLocaleDateString('af-ZA', opts) + " " + sdt.toLocaleTimeString('af-ZA', time)
    : sdt.toLocaleDateString('af-ZA', opts) + " – " + edt.toLocaleDateString('af-ZA', opts);
}
function isClosed(ev){ return (ev.ends_at||0) < Math.floor(Date.now()/1000); }

function posterHTML(ev){
  const url = ev.poster_url && String(ev.poster_url).trim();
  if (url) {
    const esc = url.replace(/"/g,'&quot;');
    return '<img class="poster" src="'+esc+'" alt="'+(ev.name||"Event")+' poster" loading="lazy" onerror="this.replaceWith(fallbackPoster(\''+escapeJS(ev.name||"")+ '\'))">';
  }
  return '<div class="poster fallback">'+(ev.name?.charAt(0)?.toUpperCase() || 'E')+'</div>';
}
function fallbackPoster(title){
  const div = document.createElement('div');
  div.className = 'poster fallback';
  div.textContent = (title||'E').charAt(0).toUpperCase();
  return div;
}
function escapeJS(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\\"'); }

function cardHTML(ev){
  const when = fmtDateRange(ev.starts_at, ev.ends_at);
  const v = ev.venue ? ' · ' + ev.venue : '';
  const closed = isClosed(ev);
  const buyLabel = closed ? 'Event Closed' : 'Kaartjies';
  const buyAttrs = closed ? 'class="btn primary" aria-disabled="true"' : 'class="btn primary" href="/shop/'+ev.slug+'"';
  return \`
    <div class="card">
      <a class="card-link" href="/shop/\${ev.slug}" aria-label="\${ev.name}"></a>
      \${closed ? '<span class="badge closed">Event Closed</span>' : ''}
      \${posterHTML(ev)}
      <div class="body">
        <div class="title">\${ev.name}</div>
        <div class="meta">\${when}\${v}</div>
      </div>
      <div class="actions">
        <a class="btn ghost" href="/shop/\${ev.slug}">Info</a>
        <a \${buyAttrs}>\${buyLabel}</a>
      </div>
    </div>\`;
}

async function load(){
  const res = await fetch('/api/public/events').then(r=>r.json()).catch(()=>({ok:false}));
  const grid = document.getElementById('grid');
  if (!res.ok){ grid.textContent = 'Kon nie laai nie'; return; }
  if (!res.events.length){ grid.textContent = 'Geen vertonings tans'; return; }

  // sort: upcoming first, then closed
  const now = Math.floor(Date.now()/1000);
  const events = res.events.slice().sort((a,b)=>{
    const ac = (a.ends_at||0) < now, bc = (b.ends_at||0) < now;
    if (ac !== bc) return ac ? 1 : -1; // open before closed
    return (a.starts_at||0) - (b.starts_at||0);
  });

  grid.innerHTML = events.map(cardHTML).join('');
}
load();
</script>
</body></html>`;
