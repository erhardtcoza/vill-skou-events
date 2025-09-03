// /src/ui/pos.js
export function posHTML() {
  return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1000px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 12px } .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 }
  .ok{ color:#0a7d2b; font-weight:600 }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div class="card">
    <h2 style="margin:0 0 10px">Start shift</h2>
    <div class="row" style="margin-bottom:10px">
      <input id="cashier" placeholder="Cashier name" style="min-width:220px"/>
      <select id="event" style="min-width:280px"></select>
      <select id="gate" style="min-width:180px"></select>
    </div>
    <div class="row" style="gap:14px">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:120px"/>
      </div>
      <div>
        <div class="muted" style="margin-bottom:4px">Cashier phone (optional)</div>
        <input id="msisdn" inputmode="tel" placeholder="+27..." style="width:200px"/>
      </div>
      <button id="startBtn" class="btn">Start</button>
      <div id="msg" class="muted"></div>
      <div id="err" class="error" style="margin-left:auto"></div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (rands)=> Math.max(0, Math.round(Number(rands||0) * 100));

// Parse JSON only when the response is JSON; otherwise return raw text
async function parseSmart(r){
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    return await r.json();
  }
  // fall back to text to surface errors like "Unauthorized"
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok:false, error:text || r.statusText, status:r.status }; }
}

async function load() {
  $('err').textContent = '';
  $('msg').textContent = '';
  $('event').innerHTML = '<option>Loading…</option>';
  $('gate').innerHTML = '<option>Loading…</option>';
  try {
    const r = await fetch('/api/pos/bootstrap', { credentials:'include' });
    const j = await parseSmart(r);
    if (!j.ok) throw new Error(j.error || ('Bootstrap failed (' + (j.status||r.status) + ')'));

    // Events
    const ev = $('event');
    ev.innerHTML = (j.events||[]).map(e =>
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="0">No events</option>';

    // Gates
    const gt = $('gate');
    gt.innerHTML = (j.gates||[]).map(g =>
      \`<option value="\${g.id}">\${g.name}</option>\`
    ).join('') || '<option value="0">No gates</option>';
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'network');
  }
}

$('startBtn').onclick = async () => {
  $('err').textContent = '';
  $('msg').textContent = '';
  const cashier_name = ($('cashier').value || '').trim();
  const event_id = Number(($('event').value || '0'));
  const gate_id = Number(($('gate').value || '0'));
  const opening_float_cents = cents($('float').value);
  const cashier_phone = ($('msisdn').value || '').trim();

  if (!cashier_name) return $('err').textContent = 'cashier name required';
  if (!event_id) return $('err').textContent = 'event required';
  if (!gate_id) return $('err').textContent = 'gate required';

  try {
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      credentials:'include',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents, cashier_phone })
    });

    const j = await parseSmart(r);

    if (!j.ok) {
      throw new Error(j.error || ('HTTP ' + (j.status||r.status)));
    }

    $('msg').className = 'ok';
    $('msg').textContent = 'Shift started (session #' + j.session_id + ').';
    // TODO: navigate to selling UI when ready (e.g. location.href = '/pos/sell')
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'unknown');
  }
};

load();
</script>
</body></html>`;
}
