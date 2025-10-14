// /src/ui/pos_gate.js

/* POS landing (Gate) */
export function posHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --accent-ink:#fff; --border:#e5e7eb }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:820px; margin:18px auto; padding:0 14px }
  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  @media (max-width:720px){ .row{ grid-template-columns:1fr } }
  label{ font-weight:700; font-size:14px; margin-top:8px; display:block }
  input,select{ width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .btn{ display:inline-block; background:var(--accent); color:var(--accent-ink); padding:12px 16px; border-radius:10px; text-decoration:none; font-weight:800; border:0; cursor:pointer; margin-top:14px }
  .muted{ color:var(--muted) }
  .error{ color:#b42318; font-weight:700; margin-top:8px }
</style>
</head><body>
<div class="wrap">
  <h1 style="margin:0 0 8px">Gate POS</h1>
  <p class="muted" style="margin:0 0 14px">Open a session to sell tickets at the gate.</p>

  <div class="card">
    <div class="row">
      <div>
        <label for="cashier">Cashier name</label>
        <input id="cashier" placeholder="e.g. Anna S." autocomplete="name"/>
      </div>
      <div>
        <label for="gate">Gate</label>
        <select id="gate"><option>Loading…</option></select>
      </div>
      <div>
        <label for="float">Opening float (R)</label>
        <input id="float" type="number" min="0" step="0.01" placeholder="e.g. 500.00"/>
      </div>
      <div>
        <label for="event">Event</label>
        <select id="event"></select>
      </div>
    </div>

    <button id="start" class="btn">Start session</button>
    <div id="msg" class="error"></div>
    <p class="muted" id="note" style="margin-top:10px"></p>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);

function centsFromRand(v){
  const n = Number(String(v||'').replace(/,/,'.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n*100);
}

async function loadEvents(){
  const sel = $('event');
  sel.innerHTML = '<option value="">Loading…</option>';
  try{
    const j = await fetch('/api/public/events').then(r=>r.json());
    if (!j.ok){ sel.innerHTML = '<option value="">No events</option>'; return; }
    const list = j.events||[];
    if (!list.length){ sel.innerHTML = '<option value="">No events</option>'; return; }
    sel.innerHTML = list.map(ev => '<option value="'+ev.slug+'" data-id="'+ev.id+'">'+ev.name+'</option>').join('');
    $('note').textContent = 'Selected event: ' + (list[0].name||'');
  }catch(_e){ sel.innerHTML = '<option value="">Error loading events</option>'; }
}

async function loadGates(){
  const gsel = $('gate');
  gsel.innerHTML = '<option>Loading…</option>';
  try{
    const j = await fetch('/api/pos/gates').then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ gsel.innerHTML = '<option>Error loading gates</option>'; return; }
    const gates = j.gates || [];
    if (!gates.length){ gsel.innerHTML = '<option>No gates configured</option>'; return; }
    gsel.innerHTML = gates.map(g => '<option value="'+g.id+'">'+g.name+'</option>').join('');
  }catch(_e){
    gsel.innerHTML = '<option>Error loading gates</option>';
  }
}

$('event').addEventListener('change', ()=>{
  const opt = $('event').selectedOptions[0];
  $('note').textContent = opt ? ('Selected event: ' + opt.textContent) : '';
});

$('start').onclick = async ()=>{
  $('msg').textContent = '';
  const cashier = ($('cashier').value||'').trim();
  const gateOpt  = $('gate').selectedOptions[0];
  const gate_id  = gateOpt ? Number(gateOpt.value) : 0;
  const floatR  = $('float').value;
  const eopt     = $('event').selectedOptions[0];
  const eventSlug = eopt ? eopt.value : '';
  const eventId   = eopt ? Number(eopt.dataset.id||0) : 0;

  if (!cashier || !gate_id || !eventSlug){
    $('msg').textContent = 'Please fill cashier, gate and event.';
    return;
  }

  try{
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        cashier_name: cashier,
        gate_id,
        opening_float_cents: centsFromRand(floatR) || 0,
        event_id: eventId || null
      })
    });
    const j = await r.json().catch(()=>({ok:false}));
    if (!j.ok) throw new Error(j.error || 'open failed');
    const sid = j.session?.id || j.session_id || j.id;
    if (!sid) throw new Error('no session id');
    location.href = '/gate/sell?session_id=' + encodeURIComponent(sid) + '&event_slug=' + encodeURIComponent(eventSlug);
  }catch(e){
    $('msg').textContent = 'Could not start session: ' + (e.message||'');
  }
};

loadEvents();
loadGates();
</script>
</body></html>`;
}
