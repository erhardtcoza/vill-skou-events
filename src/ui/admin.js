// /src/ui/admin.js
export function adminHTML(){
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 14px }
  h1{ margin:0 0 14px } .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .tabs{ display:flex; gap:8px; margin:10px 0 14px }
  .tab{ padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .tab.active{ background:var(--green); color:#fff; border-color:transparent }
  table{ width:100%; border-collapse:collapse } th,td{ padding:10px 8px; border-bottom:1px solid #f0f2f4; text-align:left; font-size:14px }
  .muted{ color:var(--muted) } .btn{ padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer }
  .btn.primary{ background:var(--green); color:#fff; border-color:transparent }
  .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  .stat{ background:#f8fafc; border:1px solid #eef2f7; border-radius:10px; padding:10px 12px; min-width:150px }
  .k{ font-weight:700; font-size:18px }
  .charts{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:10px }
  @media (max-width:900px){ .charts{ grid-template-columns:1fr; } }
  canvas{ width:100%; height:320px; max-height:45vh }
</style>
</head><body>
<div class="wrap">
  <h1>Admin</h1>

  <div class="tabs">
    <button class="tab active" data-tab="events">Events</button>
    <button class="tab" data-tab="pos">POS Admin</button>
    <button class="tab" data-tab="tickets">Tickets</button>
    <button class="tab" data-tab="users">Users</button>
  </div>

  <div id="panel-events" class="card"></div>
  <div id="panel-pos" class="card" style="display:none"></div>
  <div id="panel-tickets" class="card" style="display:none"></div>
  <div id="panel-users" class="card" style="display:none"></div>
</div>

<script>
const $ = (id)=>document.getElementById(id);

/* ---------------- Tabs ---------------- */
document.querySelectorAll('.tab').forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t = b.dataset.tab;
    ['events','pos','tickets','users'].forEach(name=>{
      $('panel-'+name).style.display = (name===t)?'block':'none';
    });
    if (t==='events') renderEvents();
    if (t==='pos') renderPOS();
    if (t==='tickets') renderTickets();
    if (t==='users') renderUsers();
  };
});

/* ---------------- Helpers ---------------- */
function fmtDate(ts){
  if (!ts) return '-';
  const d = new Date(ts*1000);
  return d.toLocaleString('af-ZA',{hour12:false});
}
function rands(c){ return 'R' + ( (c||0)/100 ).toFixed(2); }

/* ---------------- Events panel ---------------- */
async function renderEvents(){
  const box = $('panel-events');
  box.innerHTML = 'Loading…';
  const j = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if(!j.ok) { box.textContent='Failed to load events'; return; }

  const rows = (j.events||[]).map(e=>`
    <tr>
      <td>${e.id}</td>
      <td>${esc(e.slug)}</td>
      <td>${esc(e.name)}</td>
      <td>${fmtDate(e.starts_at)} → ${fmtDate(e.ends_at)}</td>
      <td>${esc(e.status||'')}</td>
    </tr>`).join('');

  box.innerHTML = `
    <h2 style="margin:0 0 12px">Events</h2>
    <div class="row" style="margin-bottom:8px"><button class="btn" id="reloadEvents">Reload</button></div>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>ID</th><th>Slug</th><th>Name</th><th>Dates</th><th>Status</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="5" class="muted">None</td></tr>'}</tbody>
      </table>
    </div>`;
  $('reloadEvents').onclick=renderEvents;
}

/* ---------------- POS Admin (sessions) ---------------- */
async function renderPOS(){
  const box = $('panel-pos');
  box.innerHTML = 'Loading…';
  const j = await fetch('/api/admin/pos/sessions?limit=100').then(r=>r.json()).catch(()=>({ok:false}));
  if(!j.ok){ box.textContent='Failed to load sessions'; return; }

  const rows = (j.sessions||[]).map(s=>`
    <tr>
      <td>${s.id}</td>
      <td>${esc(s.cashier_name||'')}</td>
      <td>${esc(s.gate_name||('Gate #'+(s.gate_id||'')))}</td>
      <td>${fmtDate(s.opened_at)}</td>
      <td>${s.closed_at?fmtDate(s.closed_at):'<span class="muted">open</span>'}</td>
      <td>${rands(s.cash_cents)}</td>
      <td>${rands(s.card_cents)}</td>
    </tr>`).join('');

  box.innerHTML = `
    <h2 style="margin:0 0 12px">POS Sessions</h2>
    <div class="row" style="margin-bottom:8px">
      <button class="btn" id="reloadPOS">Reload</button>
    </div>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>ID</th><th>Cashier</th><th>Gate</th><th>Opened</th><th>Closed</th><th>Cash</th><th>Card</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="7" class="muted">None</td></tr>'}</tbody>
      </table>
    </div>`;
  $('reloadPOS').onclick=renderPOS;
}

/* ---------------- Tickets (with charts) ---------------- */
async function renderTickets(){
  const box = $('panel-tickets');
  box.innerHTML = 'Loading…';

  // 1) Load events for dropdown
  const ev = await fetch('/api/admin/events').then(r=>r.json()).catch(()=>({ok:false}));
  if(!ev.ok){ box.textContent='Failed to load events'; return; }
  const events = ev.events||[];
  if(!events.length){ box.textContent='No events'; return; }

  const first = events[0];

  box.innerHTML = `
    <h2 style="margin:0 0 12px">Tickets</h2>
    <div class="row" style="margin-bottom:10px">
      <label class="muted" for="ticketEvent">Event</label>
      <select id="ticketEvent">${events.map(e=>`<option value="${e.id}" ${e.id===first.id?'selected':''}>${esc(e.name)} (${esc(e.slug)})</option>`).join('')}</select>
      <button class="btn" id="reloadTickets">Reload</button>
    </div>

    <div id="ticketStats" class="row" style="margin-bottom:10px">
      <div class="stat"><div class="muted">Sold</div><div class="k" id="tSold">-</div></div>
      <div class="stat"><div class="muted">Checked-in</div><div class="k" id="tIn">-</div></div>
      <div class="stat"><div class="muted">Not in</div><div class="k" id="tOut">-</div></div>
    </div>

    <div class="charts">
      <div><canvas id="pieTotals"></canvas></div>
      <div><canvas id="barTypes"></canvas></div>
    </div>

    <div style="margin-top:14px;overflow:auto">
      <table>
        <thead><tr><th>Type</th><th>Sold</th><th>Checked-in</th><th>Not in</th></tr></thead>
        <tbody id="ticketBody"></tbody>
      </table>
    </div>
  `;

  $('ticketEvent').onchange = () => loadTickets(Number($('ticketEvent').value||0));
  $('reloadTickets').onclick = () => loadTickets(Number($('ticketEvent').value||0));
  loadTickets(first.id);
}

async function loadTickets(event_id){
  const body = $('ticketBody');
  body.innerHTML = '<tr><td class="muted" colspan="4">Loading…</td></tr>';

  // API should return: { ok:true, types:[{name, sold, in, out}], totals:{sold,in,out} }
  const j = await fetch('/api/admin/tickets/summary?event_id='+encodeURIComponent(event_id))
    .then(r=>r.json()).catch(()=>({ok:false}));

  if(!j.ok){ body.innerHTML = '<tr><td class="muted" colspan="4">Failed to load</td></tr>'; return; }

  const types = j.types||[];
  const totals = j.totals||{sold:0,in:0,out:0};

  // Stats tiles
  $('tSold').textContent = String(totals.sold||0);
  $('tIn').textContent = String(totals.in||0);
  $('tOut').textContent = String(totals.out||0);

  // Table
  body.innerHTML = (types.length? types.map(t=>`
    <tr>
      <td>${esc(t.name||'')}</td>
      <td>${t.sold||0}</td>
      <td>${t.in||0}</td>
      <td>${t.out||0}</td>
    </tr>`).join('') : '<tr><td class="muted" colspan="4">No tickets</td></tr>');

  // Charts
  drawPie('pieTotals', [
    { label:'Sold', v: totals.sold||0, color:'#0a7d2b' },
    { label:'In',   v: totals.in||0,   color:'#15803d' },
    { label:'Not in', v: totals.out||0, color:'#e11d48' },
  ]);

  drawBars('barTypes',
    types.map(t=>t.name||''),
    [
      { label:'Sold', color:'#0a7d2b', data: types.map(t=>t.sold||0) },
      { label:'In',   color:'#15803d', data: types.map(t=>t.in||0) },
      { label:'Out',  color:'#e11d48', data: types.map(t=>t.out||0) },
    ]
  );
}

/* ---------------- Users (lightweight) ---------------- */
async function renderUsers(){
  const box = $('panel-users');
  box.innerHTML = 'Loading…';
  const j = await fetch('/api/admin/users').then(r=>r.json()).catch(()=>({ok:false}));
  if(!j.ok){ box.textContent='Failed to load users'; return; }

  const rows = (j.users||[]).map(u=>`
    <tr><td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td></tr>
  `).join('');

  box.innerHTML = `
    <h2 style="margin:0 0 12px">Users</h2>
    <div class="row" style="margin-bottom:8px"><button class="btn" id="reloadUsers">Reload</button></div>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="3" class="muted">None</td></tr>'}</tbody>
      </table>
    </div>`;
  $('reloadUsers').onclick=renderUsers;
}

/* ---------------- Tiny chart helpers (no libs) ---------------- */
function drawPie(id, parts){
  const cv = $(id); if(!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.clientWidth * devicePixelRatio;
  const h = cv.height = cv.clientHeight * devicePixelRatio;
  ctx.clearRect(0,0,w,h);
  const R = Math.min(w,h)*0.38, cx=w/2, cy=h/2;
  const sum = parts.reduce((a,b)=>a+(b.v||0),0) || 1;
  let ang = -Math.PI/2;
  parts.forEach(p=>{
    const frac = (p.v||0)/sum;
    const a2 = ang + frac*2*Math.PI;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,R,ang,a2); ctx.closePath();
    ctx.fillStyle = p.color; ctx.fill();
    ang = a2;
  });
  // Legend
  const lh = 18*devicePixelRatio, x0 = Math.round(w*0.05), y0 = Math.round(h*0.1);
  ctx.font = `${12*devicePixelRatio}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  parts.forEach((p,i)=>{
    const y = y0 + i*lh;
    ctx.fillStyle = p.color; ctx.fillRect(x0, y-10*devicePixelRatio, 14*devicePixelRatio, 14*devicePixelRatio);
    ctx.fillStyle = '#111';
    ctx.fillText(`${p.label} (${p.v||0})`, x0 + 20*devicePixelRatio, y);
  });
}

function drawBars(id, labels, datasets){
  const cv = $(id); if(!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.clientWidth * devicePixelRatio;
  const h = cv.height = cv.clientHeight * devicePixelRatio;
  ctx.clearRect(0,0,w,h);

  const padL = 48*devicePixelRatio, padB = 28*devicePixelRatio, padR=12*devicePixelRatio, padT=12*devicePixelRatio;
  const gw = w - padL - padR, gh = h - padT - padB;

  const max = Math.max(1, ...datasets.flatMap(d=>d.data||[]));
  const stepX = gw / Math.max(1, labels.length);
  const barW = stepX * 0.7 / datasets.length;

  // axes
  ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT+gh); ctx.lineTo(padL+gw, padT+gh); ctx.stroke();

  // labels (x)
  ctx.font = `${10*devicePixelRatio}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillStyle='#111';
  labels.forEach((lb,i)=>{
    const x = padL + i*stepX + stepX/2;
    ctx.save(); ctx.translate(x, padT+gh + 14*devicePixelRatio);
    ctx.rotate(-0.6); // slanted
    ctx.textAlign='right';
    ctx.fillText(lb, 0, 0);
    ctx.restore();
  });

  // bars
  datasets.forEach((ds,di)=>{
    ctx.fillStyle = ds.color;
    (ds.data||[]).forEach((v,i)=>{
      const x = padL + i*stepX + (stepX*0.15) + di*barW;
      const hpx = (v/max)*gh;
      ctx.fillRect(x, padT+gh-hpx, barW, hpx);
    });
  });

  // legend
  const lgX = w - padR - 120*devicePixelRatio, lgY = padT + 10*devicePixelRatio;
  datasets.forEach((ds,i)=>{
    const y = lgY + i*18*devicePixelRatio;
    ctx.fillStyle = ds.color; ctx.fillRect(lgX, y-10*devicePixelRatio, 14*devicePixelRatio, 14*devicePixelRatio);
    ctx.fillStyle = '#111'; ctx.fillText(ds.label, lgX + 20*devicePixelRatio, y);
  });
}

/* ---------------- Utils ---------------- */
function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/* boot */
renderEvents();
</script>
</body></html>`;
}
