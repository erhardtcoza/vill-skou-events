// /src/ui/pos.js
export const posHTML = `<!doctype html><html><head>
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
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 } .ok{ color:#0a7d2b; font-weight:700 }
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
    <div class="row" style="margin-bottom:10px">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:120px"/>
      </div>
      <div>
        <div class="muted" style="margin-bottom:4px">Cashier phone (optional)</div>
        <input id="cashierPhone" placeholder="+27…" style="width:180px"/>
      </div>
      <button id="startBtn" class="btn">Start</button>
      <div id="msg" class="ok" style="margin-left:8px"></div>
      <div id="err" class="error" style="margin-left:8px"></div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (rands)=> Math.max(0, Math.round(Number(rands||0) * 100));

async function asJson(r){
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  const t = await r.text();
  throw new Error(t.slice(0, 240));
}

async function load() {
  $('err').textContent = '';
  $('msg').textContent = '';
  $('event').innerHTML = '<option>Loading…</option>';
  $('gate').innerHTML = '<option>Loading…</option>';
  try {
    const r = await fetch('/api/pos/bootstrap');          // no credentials
    const j = await asJson(r);
    if (!j.ok) throw new Error(j.error || 'bootstrap failed');

    // Events
    $('event').innerHTML = (j.events||[]).map(e =>
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="0">No events</option>';

    // Gates
    $('gate').innerHTML = (j.gates||[]).map(g =>
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
  const cashier_phone = ($('cashierPhone').value || '').trim();

  if (!cashier_name) return $('err').textContent = 'cashier name required';
  if (!event_id)     return $('err').textContent = 'event required';
  if (!gate_id)      return $('err').textContent = 'gate required';

  // Keep phone locally (not written to DB)
  if (cashier_phone) sessionStorage.setItem('pos_cashier_phone', cashier_phone);

  try {
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents })
    });
    const j = await asJson(r);
    if (!j.ok) throw new Error(j.error || 'unknown');
    $('msg').textContent = 'Shift started (session #' + j.session_id + ').';
    // You can redirect to a sales page when ready:
    // location.href = '/pos/sell?sid=' + j.session_id;
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'unknown');
  }
};

load();
</script>
</body></html>`;
