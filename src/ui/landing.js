// /src/ui/landing.js
export function landingHTML() {
  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Villiersdorp Landbou Skou — Tickets</title>
  <style>
    :root { --bg:#f6f8f7; --card:#ffffff; --ink:#0b1320; --muted:#6c7a7a; --accent:#0a7d2b; }
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink)}
    .wrap{max-width:1100px;margin:auto;padding:22px 16px}

    /* page title */
    .page-title{ text-align:center; margin:0 0 10px }
    .page-title h1{ font-size:clamp(24px,4.4vw,36px); line-height:1.1; margin:0; font-weight:800 }

    /* HERO CARD */
    .hero{
      background:#fff; border-radius:16px; padding:12px;
      box-shadow:0 10px 26px rgba(0,0,0,.06);
    }
    .hero-grid{
      display:grid; grid-template-columns:minmax(280px,520px) 1fr;
      gap:16px; align-items:center;
    }
    /* smaller hero image on mobile */
    .poster{ border-radius:14px; overflow:hidden; background:#000; max-height:220px }
    .poster img{ display:block; width:100%; height:100%; object-fit:cover; object-position:center }

    /* center the “Villiersdorp Skou 2025 / Tickets & Inligting / Koop kaartjies” section */
    .hero-text{ padding:6px; text-align:center }
    .brand{ color:var(--accent); font-weight:800; margin-bottom:6px }
    .hero-title{ font-size:clamp(20px,4vw,30px); font-weight:900; letter-spacing:.2px; margin:0 }
    .hero-link{ color:inherit; text-decoration:none }
    .hero-link:hover{ text-decoration:underline }
    .cta-row{ margin-top:12px }
    .cta{
      display:inline-block; padding:12px 18px; border:0; border-radius:999px;
      background:var(--accent); color:#fff; font-weight:700; text-decoration:none;
      box-shadow:0 6px 14px rgba(10,125,43,.25);
    }

    /* event list */
    h2{font-size:clamp(18px,3.2vw,24px);margin:18px 0 10px;font-weight:800}
    .card{background:var(--card);border-radius:14px;padding:16px;box-shadow:0 6px 18px rgba(0,0,0,.06);margin-bottom:14px}
    .ev{display:grid;grid-template-columns:120px 1fr auto;gap:14px;align-items:center}
    .ev .thumb{border-radius:10px;overflow:hidden;background:#000}
    .ev .thumb img{display:block;width:100%;height:auto}
    .ev h3{margin:0 0 6px}
    .muted{color:var(--muted)}
    .btn{background:var(--accent);color:#fff;border:none;border-radius:999px;padding:10px 16px;text-decoration:none;font-weight:700}

    /* responsive tweaks */
    @media (max-width:820px){
      .hero-grid{ grid-template-columns:1fr }
      .hero-text{ padding-top:4px }
    }
    @media (min-width:821px){
      .poster{ max-height:360px } /* a bit taller on desktop */
    }
    @media (max-width:640px){
      .ev{grid-template-columns:90px 1fr}
      .ev .go{grid-column:1/-1}
    }
  </style>
</head>
<body>
<div class="wrap">
  <!-- centered page title; removed the word “Events” -->
  <div class="page-title"><h1>Villiersdorp Landbou Skou</h1></div>

  <!-- HERO -->
  <section id="hero" class="hero" aria-live="polite">
    <div class="hero-grid">
      <div class="poster">
        <a id="heroPosterLink" class="hero-link" href="#">
          <img id="heroPoster" src="" alt="Event poster"/>
        </a>
      </div>
      <div class="hero-text">
        <div class="brand" id="heroBrand">Villiersdorp Landbou Skou</div>
        <h2 class="hero-title">
          <a id="heroTitleLink" class="hero-link" href="#">Tickets &amp; Inligting</a>
        </h2>
        <div class="cta-row">
          <a id="heroCta" class="cta" href="#">Koop kaartjies</a>
        </div>
      </div>
    </div>
  </section>

  <h2 style="text-align:left">Opkomende Vertonings</h2>
  <div id="events"></div>
</div>

<script>
  const esc = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  async function load() {
    const box = document.getElementById('events');
    box.innerHTML = '<div class="card">Laai...</div>';

    let res;
    try {
      res = await fetch('/api/public/events', { credentials: 'include' });
    } catch (e) {
      box.innerHTML = '<div class="card">Kon nie laai nie</div>';
      return;
    }
    const data = await res.json().catch(()=>({ok:false}));
    if (!data.ok) {
      box.innerHTML = '<div class="card">Kon nie laai nie</div>';
      return;
    }

    const evs = data.events || [];
    if (!evs.length) {
      box.innerHTML = '<div class="card">Geen vertonings beskikbaar nie.</div>';
      return;
    }

    // HERO uses first event
    const ev0 = evs[0];
    const slug = ev0.slug;
    const poster = ev0.poster_url || ev0.hero_url || '';
    const shopUrl = '/shop/' + encodeURIComponent(slug);

    document.getElementById('heroPoster').src = poster;
    document.getElementById('heroPoster').alt = esc(ev0.name) + ' poster';
    document.getElementById('heroPosterLink').href = shopUrl;
    document.getElementById('heroTitleLink').href = shopUrl;
    document.getElementById('heroTitleLink').textContent = 'Tickets & Inligting';
    document.getElementById('heroBrand').textContent = ev0.name || 'Villiersdorp Landbou Skou';
    document.getElementById('heroCta').href = shopUrl;

    // List all events
    box.innerHTML = '';
    for (const ev of evs) {
      const s = new Date((ev.starts_at||0)*1000);
      const e = new Date((ev.ends_at||0)*1000);
      const when = s.toLocaleDateString('af-ZA',{weekday:'short', day:'2-digit', month:'short'})
                 + ' – '
                 + e.toLocaleDateString('af-ZA',{weekday:'short', day:'2-digit', month:'short'});
      const url = '/shop/' + encodeURIComponent(ev.slug);
      const img = ev.poster_url || ev.hero_url || '';

      const card = document.createElement('div');
      card.className = 'card ev';
      card.innerHTML = \`
        <div class="thumb"><img src="\${esc(img)}" alt="\${esc(ev.name)}"/></div>
        <div>
          <h3>\${esc(ev.name)}</h3>
          <div class="muted">\${when} · \${esc(ev.venue||'')}</div>
        </div>
        <div class="go"><a class="btn" href="\${url}">Kaartjies</a></div>
      \`;
      box.appendChild(card);
    }
  }

  load();
</script>
</body>
</html>`;
}
