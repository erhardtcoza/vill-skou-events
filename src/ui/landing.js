// /src/ui/landing.js
export const landingHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Villiersdorp Skou — Tickets</title>
<style>
  body{margin:0;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f7f7f8;color:#111}
  header{background:linear-gradient(90deg,#0a7d2b,#e5c100);padding:28px 14px;display:flex;align-items:center;justify-content:center}
  .hero{max-width:1100px;width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px}
  .hero h1{color:#fff;font-size:32px;margin:0}
  .hero-sub{color:#fff;font-size:16px;margin-top:6px}
  .hero img{border-radius:12px;box-shadow:0 8px 18px rgba(0,0,0,.25);width:100%;height:auto;object-fit:cover}
  .hero-box{flex:1;display:flex;flex-direction:column}
  .hero-img{flex:1;max-width:600px}
  .wrap{max-width:1100px;margin:20px auto;padding:0 14px}
  h2{margin:20px 0 10px}
  .cards{display:grid;gap:16px}
  .card{background:#fff;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,.08);padding:14px;display:flex;flex-direction:column}
  .card img{width:100%;border-radius:8px;object-fit:cover}
  .card h3{margin:8px 0 4px;font-size:18px}
  .card .muted{color:#667085;font-size:14px}
  .btns{display:flex;gap:8px;margin-top:10px}
  .btn{flex:1;padding:10px;border-radius:8px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
  .btn.info{background:#e5e7eb;color:#111}
  .btn.buy{background:#0a7d2b;color:#fff}
</style>
</head><body>
  <header>
    <div class="hero">
      <div class="hero-box">
        <h1>Villiersdorp Skou — Tickets</h1>
        <div class="hero-sub">Opkomende vertonings · Koop aanlyn · POS · Toegangsbeheer</div>
      </div>
      <div class="hero-img">
        <img src="https://static.villiersdorpskou.co.za/posters/villiersdorp_skou_2025.jpg" alt="Skou 2025 poster"/>
      </div>
    </div>
  </header>
  <div class="wrap">
    <h2>Opkomende Vertonings</h2>
    <div id="events" class="cards">Loading…</div>
  </div>
<script>
async function load(){
  const res = await fetch('/api/public/events').then(r=>r.json()).catch(()=>({ok:false}));
  const box=document.getElementById('events');
  if(!res.ok){box.textContent='Kon nie laai nie';return;}
  box.innerHTML='';
  res.events.forEach(ev=>{
    const el=document.createElement('div');
    el.className='card';
    el.innerHTML=`
      <img src="${ev.poster_url||''}" alt="">
      <h3>${ev.name}</h3>
      <div class="muted">${ev.starts_at} – ${ev.ends_at} · ${ev.venue||''}</div>
      <div class="btns">
        <a class="btn info" href="/shop/${ev.slug}">Info</a>
        <a class="btn buy" href="/shop/${ev.slug}/checkout">Kaartjies</a>
      </div>
    `;
    box.appendChild(el);
  });
}
load();
</script>
</body></html>`;
