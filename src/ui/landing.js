// /src/ui/landing.js
export function landingHTML() {
  const POSTER =
    "https://static.villiersdorpskou.co.za/posters/villiersdorp_skou_2025.jpg";

  return /*html*/ `<!doctype html>
<html lang="af">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Villiersdorp Skou — Tickets</title>
<style>
  :root{
    --brand:#0a7d2b;
    --brand-2:#e7f3ea;
    --ink:#111;
    --muted:#6b7280;
    --card:#ffffff;
    --bg:#f6f7f8;
    --shadow:0 6px 22px rgba(0,0,0,.07);
    --radius:16px;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Apple Color Emoji","Segoe UI Emoji";background:var(--bg);color:var(--ink)}
  .wrap{max-width:1040px;margin:0 auto;padding:18px}
  h1{font-size:clamp(28px,5vw,44px);margin:0 0 8px}
  .sub{color:var(--muted);font-size:14px}

  /* HERO */
  .hero{
    position:relative;
    background:linear-gradient(90deg,#e9f7ec 0%, #fff 100%);
    border-radius:var(--radius);
    padding:18px;
    display:grid;
    gap:18px;
    grid-template-columns: 1fr;
    align-items:center;
    box-shadow:var(--shadow);
    overflow:hidden;
  }
  .hero .poster{
    width:100%;
    border-radius:12px;
    box-shadow:0 12px 28px rgba(0,0,0,.18);
    aspect-ratio:3/4;
    object-fit:cover;
  }
  .hero .copy{padding:4px 2px}
  .hero h1{line-height:1.05; letter-spacing:.2px}
  .hero .kicker{display:inline-block;background:#eaf7ef;color:#0a7d2b;font-weight:700;padding:6px 10px;border-radius:999px;margin-bottom:10px}

  /* At >= 760px go side-by-side, make poster visually dominant */
  @media (min-width:760px){
    .hero{
      grid-template-columns: minmax(300px, 420px) 1fr; /* poster | text */
      padding:22px;
    }
    .hero .poster{
      width:100%;
      aspect-ratio:3/4;
    }
  }

  /* EVENTS */
  .section{margin-top:22px}
  .cards{display:grid;gap:14px}
  @media (min-width:680px){ .cards{grid-template-columns:1fr 1fr} }
  @media (min-width:980px){ .cards{grid-template-columns:1fr 1fr 1fr} }

  .card{
    background:var(--card);
    border-radius:14px;
    box-shadow:var(--shadow);
    overflow:hidden;
    display:flex;
    flex-direction:column;
  }
  .thumb{width:100%; aspect-ratio:16/11; object-fit:cover; background:#ddd}
  .pad{padding:14px}
  .title{font-weight:800;margin:0 0 6px}
  .meta{color:var(--muted);font-size:14px;margin-bottom:12px}
  .row{display:flex;gap:10px}
  .btn{
    appearance:none;border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;
    background:#eef2f4;color:#111
  }
  .btn.primary{background:var(--brand);color:#fff}
  .btn:active{transform:translateY(1px)}
  a.btn{display:inline-block;text-decoration:none;text-align:center}
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <img class="poster" src="${POSTER}" alt="Skou 2025 plakkaat"/>
      <div class="copy">
        <span class="kicker">Villiersdorp Skou</span>
        <h1>Tickets &amp; Inligting</h1>
        <div class="sub">Koop aanlyn · POS · Toegangsbeheer</div>
      </div>
    </div>

    <div class="section">
      <h2 style="margin:14px 0 10px;">Opkomende Vertonings</h2>
      <div id="events" class="cards">
        <div class="card"><div class="pad">Laai…</div></div>
      </div>
    </div>
  </div>

<script type="module">
async function fmtDateRange(s,e){
  const d1=new Date((s||0)*1000), d2=new Date((e||0)*1000);
  const f=(d)=>d.toLocaleDateString(undefined,{weekday:'short', day:'2-digit', month:'short'});
  return \`\${f(d1)} – \${f(d2)}\`;
}

function moneyZAR(cents){ return new Intl.NumberFormat('af-ZA',{style:'currency',currency:'ZAR'}).format((cents||0)/100); }

function card(ev){
  const img = ev.poster_url || ev.hero_url || "${POSTER}";
  return \`
    <div class="card">
      <img class="thumb" src="\${img}" alt="\${ev.name}"/>
      <div class="pad">
        <div class="title">\${ev.name}</div>
        <div class="meta">\${await fmtDateRange(ev.starts_at, ev.ends_at)} · \${ev.venue || ''}</div>
        <div class="row">
          <a class="btn" href="/shop/\${encodeURIComponent(ev.slug)}">Info</a>
          <a class="btn primary" href="/shop/\${encodeURIComponent(ev.slug)}#buy">Kaartjies</a>
        </div>
      </div>
    </div>\`;
}

(async function load(){
  const root = document.getElementById('events');
  try{
    const r = await fetch('/api/public/events');
    const j = await r.json();
    const list = (j.events||[]);
    if(!list.length){ root.innerHTML = '<div class="card"><div class="pad">Geen vertonings beskikbaar nie.</div></div>'; return; }
    // Build each card (await because card() uses fmtDateRange async)
    const parts = [];
    for(const ev of list){ parts.push(await card(ev)); }
    root.innerHTML = parts.join('');
  }catch(e){
    root.innerHTML = '<div class="card"><div class="pad">Kon nie laai nie.</div></div>';
  }
})();
</script>
</body>
</html>`;
}
