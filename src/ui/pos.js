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
  .btn[disabled]{ opacity:.6; cursor:not-allowed }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600 }
  .ok{ color:#0a7d2b; font-weight:700 }
  .warn{ color:#8a5a00; font-weight:600 }
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
    <div class="row">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:120px"/>
      </div>
      <button id="startBtn" class="btn">Start</button>
      <div id="msg" class="muted"></div>
    </div>
    <div id="hint" class="warn" style="margin-top:8px; display:none"></div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (rands)=> Math.max(0, Math.round(Number(rands||0) * 100));

function setMsg(text, kind='') {
  const el = $('msg');
  el.className = kind || 'muted';
  el.textContent = text || '';
}

async function load() {
  setMsg('');
  $('event').innerHTML = '<option>Loading…</option>';
  $('gate').innerHTML = '<option>Loading…</option>';
  try {
    const r = await fetch('/api/pos/bootstrap');
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'bootstrap failed');

    // Events
    const ev = $('event');
    ev.innerHTML = (j.events||[]).map(e =>
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="0">No events</option>';

    // Gates
    const gt = $('gate');
    if ((j.gates||[]).length) {
      gt.innerHTML = j.gates.map(g => \`<option value="\${g.id}">\${g.name}</option>\`).join('');
    } else {
      gt.innerHTML = '<option value="0">No gates</option>';
      if (j.gates_error) {
        const h = $('hint');
        h.style.display = 'block';
        h.textContent = 'Note: no gates returned (' + j.gates_error + ').';
      }
    }
  } catch (e) {
    setMsg('Error: ' + (e.message || 'network'), 'error');
  }
}

$('startBtn').onclick = async () => {
  setMsg('');
  const cashier_name = ($('cashier').value || '').trim();
  const event_id = Number(($('event').value || '0'));
  const gate_id = Number(($('gate').value || '0'));
  const opening_float_cents = cents($('float').value);

  if (!cashier_name) return setMsg('cashier name required','error');
  if (!event_id) return setMsg('event required','error');
  if (!gate_id) return setMsg('gate required','error');

  $('startBtn').disabled = true;
  try {
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents })
    });
    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch { /* leave j as {} */ }

    if (!r.ok || !j.ok) {
      const msg = (j && j.error) ? j.error : (text || 'unknown');
      throw new Error(msg);
    }

    // Success: keep user here (no reload), show success + store session id for next screen.
    sessionStorage.setItem('pos_session_id', String(j.session_id));
    sessionStorage.setItem('pos_event_id', String(event_id));
    sessionStorage.setItem('pos_gate_id', String(gate_id));
    setMsg('Shift started (session #' + j.session_id + ').', 'ok');

    // If you later add a sales screen, just redirect here:
    // location.href = '/pos/sell';
  } catch (e) {
    $('startBtn').disabled = false;
    setMsg('Error: ' + (e.message || 'unknown'), 'error');
  }
};

load();
</script>
</body></html>`;
}
